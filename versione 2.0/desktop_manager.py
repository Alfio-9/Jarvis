"""
JARVIS 2.0 - Windows Desktop & Subfolder Spatial File Manager
Scans desktop files, maintains hierarchical navigation, coordinates 3D layout,
and provides native OS shell execution and persistent layout storage.
"""

import os
import sys
import json
import math
import numpy as np

SYSTEM_IGNORES = {
    'desktop.ini', 'thumbs.db', '.ds_store', 'ntuser.dat', 'ntuser.ini',
    '.git', '.gitignore', 'node_modules', 'dist'
}

EXECUTABLE_EXTS = {'.exe', '.lnk', '.bat', '.cmd', '.app', '.sh', '.ps1', '.msi'}
MARKDOWN_EXTS = {'.md', '.markdown'}


def get_windows_desktop_path() -> str:
    """Returns the user's authentic Windows Desktop path."""
    user_profile = os.environ.get('USERPROFILE')
    if user_profile:
        desk = os.path.join(user_profile, 'Desktop')
        if os.path.isdir(desk):
            return os.path.abspath(desk)

    fallback = os.path.expanduser('~/Desktop')
    return os.path.abspath(fallback)


class DesktopItem:
    def __init__(self, name: str, path: str, item_type: str, extension: str = ''):
        self.name = name
        self.path = path
        self.item_type = item_type # 'folder', 'executable', 'markdown', 'document', 'back'
        self.extension = extension.lower()
        self.position = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        self.target_position = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        self.rotation = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        self.rot_speed = np.array([0.008, 0.012, 0.005], dtype=np.float32)
        self.is_grabbed = False
        self.is_hovered = False

    def update(self):
        if not self.is_grabbed:
            self.rotation += self.rot_speed
            # Smoothly glide to target position
            self.position += (self.target_position - self.position) * 0.18
        else:
            # While grabbed, fast immediate follow
            self.position += (self.target_position - self.position) * 0.75


class DesktopNodesManager:
    def __init__(self, layout_file_path: str = None):
        self.desktop_root = get_windows_desktop_path()
        self.current_folder = self.desktop_root
        self.history = []
        self.items = []
        self.layout_file = layout_file_path or os.path.join(os.path.dirname(__file__), 'desktop_layout.json')
        self.saved_layout = self.load_layout()
        self.selected_node = None
        self.hovered_node = None
        self.is_grabbing = False

    def is_root_desktop(self) -> bool:
        return os.path.abspath(self.current_folder).lower() == os.path.abspath(self.desktop_root).lower()

    def get_current_folder_name(self) -> str:
        if self.is_root_desktop():
            return 'DESKTOP'
        return os.path.basename(self.current_folder).upper()

    def load_layout(self) -> dict:
        if os.path.exists(self.layout_file):
            try:
                with open(self.layout_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[DesktopManager] Warning: Failed to load layout: {e}")
        return {}

    def save_layout(self):
        if not self.is_root_desktop():
            return # Only persist positions for root Desktop

        data = {}
        for item in self.items:
            if item.item_type != 'back' and item.path:
                data[item.path] = [
                    round(float(item.position[0]), 3),
                    round(float(item.position[1]), 3),
                    round(float(item.position[2]), 3)
                ]

        try:
            with open(self.layout_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[DesktopManager] Warning: Failed to save layout: {e}")

    def scan_directory(self, target_folder: str = None):
        """Scans the specified folder or current directory, creating 3D DesktopItems."""
        folder = target_folder or self.current_folder
        if not os.path.isdir(folder):
            folder = self.desktop_root
        self.current_folder = os.path.abspath(folder)

        raw_items = []
        try:
            entries = os.scandir(self.current_folder)
            for entry in entries:
                name = entry.name
                lower_name = name.lower()
                if lower_name in SYSTEM_IGNORES or name.startswith('.'):
                    continue

                full_path = entry.path
                _, ext = os.path.splitext(lower_name)

                if entry.is_dir():
                    raw_items.append(DesktopItem(name, full_path, 'folder', ext))
                elif ext in EXECUTABLE_EXTS:
                    raw_items.append(DesktopItem(name, full_path, 'executable', ext))
                elif ext in MARKDOWN_EXTS:
                    raw_items.append(DesktopItem(name, full_path, 'markdown', ext))
                else:
                    raw_items.append(DesktopItem(name, full_path, 'document', ext))
        except Exception as e:
            print(f"[DesktopManager] Error reading folder '{self.current_folder}': {e}")

        # Add Back navigation portal if in subfolder
        new_items = []
        if not self.is_root_desktop():
            parent_dir = os.path.dirname(self.current_folder)
            back_item = DesktopItem('⮌ .. [TORNA INDIETRO]', parent_dir, 'back')
            back_item.rot_speed = np.array([0.02, 0.01, 0.03], dtype=np.float32)
            new_items.append(back_item)

        new_items.extend(raw_items)
        self.items = new_items
        self._arrange_grid_layout()

    def _arrange_grid_layout(self):
        """Arranges nodes in a symmetric 3D plane, honoring saved coordinates when at desktop root."""
        total = len(self.items)
        if total == 0:
            return

        cols = max(3, math.ceil(math.sqrt(total * 1.4)))
        spacing_x = 2.4
        spacing_y = 2.2

        for idx, item in enumerate(self.items):
            if item.item_type == 'back':
                # Place back portal top-left
                start_x = -((cols - 1) * spacing_x) / 2.0
                start_y = (math.ceil(total / cols) * spacing_y) / 2.0
                pos = np.array([start_x, start_y, 0.0], dtype=np.float32)
            elif self.is_root_desktop() and item.path in self.saved_layout:
                saved = self.saved_layout[item.path]
                pos = np.array([saved[0], saved[1], saved[2]], dtype=np.float32)
            else:
                col = idx % cols
                row = idx // cols
                start_x = -((cols - 1) * spacing_x) / 2.0
                start_y = (math.ceil(total / cols) * spacing_y) / 2.0
                pos = np.array([start_x + col * spacing_x, start_y - row * spacing_y, 0.0], dtype=np.float32)

            item.position = pos.copy()
            item.target_position = pos.copy()

    def navigate_to_folder(self, folder_path: str):
        if os.path.isdir(folder_path):
            if self.current_folder != folder_path:
                self.history.append(self.current_folder)
            self.scan_directory(folder_path)

    def navigate_back(self):
        if self.history:
            prev = self.history.pop()
            self.scan_directory(prev)
        elif not self.is_root_desktop():
            self.scan_directory(self.desktop_root)

    def reset_grid(self):
        """Clears saved layout coordinates and realigns all items into a fresh grid."""
        self.saved_layout = {}
        try:
            if os.path.exists(self.layout_file):
                os.remove(self.layout_file)
        except Exception:
            pass
        self._arrange_grid_layout()

    def find_nearest_node(self, world_cursor_pos: np.ndarray, max_dist: float = 1.85):
        """Magnetic snapping: finds the nearest node to the 3D cursor within proximity."""
        best_node = None
        min_d = max_dist
        for item in self.items:
            d = np.linalg.norm(item.position - world_cursor_pos)
            if d < min_d:
                min_d = d
                best_node = item
        return best_node

    def execute_node(self, item: DesktopItem) -> dict:
        """
        Executes the item based on its type:
        - folder: navigates in 3D
        - back: returns to parent folder
        - markdown: signals holographic reader
        - document/executable: native OS launch via os.startfile
        """
        if not item:
            return {'action': 'none'}

        if item.item_type == 'back':
            self.navigate_back()
            return {'action': 'back', 'name': 'Parent Folder'}

        if item.item_type == 'folder':
            self.navigate_to_folder(item.path)
            return {'action': 'folder', 'name': item.name, 'path': item.path}

        if item.item_type == 'markdown':
            return {'action': 'markdown', 'name': item.name, 'path': item.path}

        # Native OS launch
        try:
            os.startfile(item.path)
            return {'action': 'launched', 'name': item.name, 'path': item.path}
        except Exception as e:
            print(f"[DesktopManager] Error opening '{item.path}': {e}")
            return {'action': 'error', 'error': str(e)}
