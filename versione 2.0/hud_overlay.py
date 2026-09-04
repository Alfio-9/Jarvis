"""
JARVIS 2.0 - Futuristic Cyberpunk Iron-Man HUD & Telemetry Overlay
Renders top cybernetic header, bottom telemetry bar, floating 3D node labels,
webcam PIP video feed with neon skeleton, and interactive UI action buttons.
"""

import time
import math
import pygame

HUD_THEME = {
    'cyan': (0, 243, 255),
    'cyan_dim': (0, 130, 160),
    'green': (0, 255, 102),
    'magenta': (255, 0, 119),
    'gold': (255, 215, 0),
    'amber': (255, 170, 0),
    'panel_bg': (6, 12, 28, 210),
    'label_bg': (10, 18, 38, 220),
    'label_hover_bg': (0, 45, 75, 240),
    'border_dim': (0, 85, 120),
    'text_bright': (235, 250, 255),
    'text_dim': (140, 175, 200)
}


class HUDOverlay:
    def __init__(self):
        if not pygame.font.get_init():
            pygame.font.init()

        self._init_fonts()
        self.buttons = {}
        self.hovered_button = None

    def _init_fonts(self):
        try:
            self.font_header = pygame.font.SysFont('Segoe UI', 15, bold=True)
            self.font_sub = pygame.font.SysFont('Segoe UI', 12)
            self.font_node = pygame.font.SysFont('Segoe UI', 12, bold=True)
            self.font_node_hover = pygame.font.SysFont('Segoe UI', 13, bold=True)
            self.font_btn = pygame.font.SysFont('Segoe UI', 12, bold=True)
            self.font_telemetry = pygame.font.SysFont('Consolas', 13, bold=True)
        except Exception:
            self.font_header = pygame.font.Font(None, 22)
            self.font_sub = pygame.font.Font(None, 18)
            self.font_node = pygame.font.Font(None, 18)
            self.font_node_hover = pygame.font.Font(None, 20)
            self.font_btn = pygame.font.Font(None, 18)
            self.font_telemetry = pygame.font.Font(None, 18)

    def render(self, screen: pygame.Surface, width: int, height: int,
               current_folder_name: str, is_root_desktop: bool, node_count: int,
               fps: float, tracker_state: dict, desktop_manager, spatial_scene):
        """Renders the entire cyberpunk HUD layer on top of the 3D scene."""
        self.buttons.clear()

        # 1. Top Cybernetic Header
        self._render_top_header(screen, width, current_folder_name, node_count, fps)

        # 2. 3D Floating Node Labels
        self._render_floating_labels(screen, desktop_manager, spatial_scene)

        # 3. Bottom Telemetry & Control Bar
        self._render_bottom_telemetry(screen, width, height, tracker_state, is_root_desktop)

        # 4. Webcam PIP Feed with Neon Skeleton (Bottom-Right)
        self._render_webcam_pip(screen, width, height, tracker_state)

    def _render_top_header(self, screen: pygame.Surface, width: int,
                           folder_name: str, node_count: int, fps: float):
        header_h = 42
        # Header backdrop panel
        hdr_surf = pygame.Surface((width, header_h), pygame.SRCALPHA)
        hdr_surf.fill(HUD_THEME['panel_bg'])
        screen.blit(hdr_surf, (0, 0))

        # Bottom neon border with glowing gradient
        pygame.draw.line(screen, HUD_THEME['border_dim'], (0, header_h), (width, header_h), 1)
        pygame.draw.line(screen, HUD_THEME['cyan'], (20, header_h), (340, header_h), 2)

        # Pulsing status dot
        pulse = (math.sin(time.time() * 5.0) + 1.0) / 2.0
        dot_alpha = int(140 + pulse * 115)
        dot_col = (0, 243, 255)
        pygame.draw.circle(screen, dot_col, (26, 21), 5)
        pygame.draw.circle(screen, (0, 243, 255), (26, 21), int(7 + pulse * 3), 1)

        # Title
        title_surf = self.font_header.render("JARVIS 3D SPATIAL DESKTOP // PYTHON 2.0", True, HUD_THEME['cyan'])
        screen.blit(title_surf, (42, 11))

        # Breadcrumb / Current Folder
        folder_text = f"DIR: {folder_name.upper()}"
        folder_surf = self.font_header.render(folder_text, True, HUD_THEME['green'] if folder_name == 'DESKTOP' else HUD_THEME['amber'])
        center_x = (width - folder_surf.get_width()) // 2
        screen.blit(folder_surf, (center_x, 11))

        # Right Telemetry (FPS, Nodes)
        tele_str = f"NODI: {node_count:02d}  │  FPS: {int(fps):02d}  │  STABILIZZAZIONE: ON"
        tele_surf = self.font_telemetry.render(tele_str, True, HUD_THEME['text_dim'])
        screen.blit(tele_surf, (width - tele_surf.get_width() - 25, 12))

    def _render_floating_labels(self, screen: pygame.Surface, desktop_manager, spatial_scene):
        """Projects and renders high-tech sci-fi tags anchored to each 3D item."""
        camera = spatial_scene.camera
        width, height = spatial_scene.width, spatial_scene.height

        for item in desktop_manager.items:
            sx, sy, zc, vis = camera.project_point(item.position, width, height)
            if not vis or sx is None or sy is None:
                continue

            # Don't draw if far off-screen
            if sx < -100 or sx > width + 100 or sy < -50 or sy > height + 50:
                continue

            # Choose icon
            if item.item_type == 'folder':
                icon = "📁 "
                type_col = HUD_THEME['cyan']
            elif item.item_type == 'executable':
                icon = "⚡ "
                type_col = HUD_THEME['green']
            elif item.item_type == 'markdown':
                icon = "📝 "
                type_col = HUD_THEME['cyan']
            elif item.item_type == 'back':
                icon = "⮌ "
                type_col = HUD_THEME['magenta']
            else:
                icon = "📄 "
                type_col = HUD_THEME['amber']

            label_text = f"{icon}{item.name}"
            font = self.font_node_hover if (item.is_hovered or item.is_grabbed) else self.font_node
            txt_surf = font.render(label_text, True, HUD_THEME['gold'] if item.is_grabbed else (HUD_THEME['text_bright'] if item.is_hovered else HUD_THEME['text_dim']))

            label_w = txt_surf.get_width() + 16
            label_h = txt_surf.get_height() + 8
            label_x = sx - label_w // 2
            label_y = sy + 22 # Slightly below the 3D node

            # Draw tag box
            tag_surf = pygame.Surface((label_w, label_h), pygame.SRCALPHA)
            bg_col = HUD_THEME['label_hover_bg'] if item.is_hovered else HUD_THEME['label_bg']
            tag_surf.fill(bg_col)
            screen.blit(tag_surf, (label_x, label_y))

            # Border
            border_col = HUD_THEME['gold'] if item.is_grabbed else (type_col if item.is_hovered else (20, 60, 95))
            border_w = 2 if (item.is_hovered or item.is_grabbed) else 1
            pygame.draw.rect(screen, border_col, (label_x, label_y, label_w, label_h), border_w)

            # Draw text
            screen.blit(txt_surf, (label_x + 8, label_y + 4))

            # If hovered or grabbed, draw indicator line connecting node to label
            if item.is_hovered or item.is_grabbed:
                pygame.draw.line(screen, border_col, (sx, sy), (sx, label_y), 1)

    def _render_bottom_telemetry(self, screen: pygame.Surface, width: int, height: int,
                                 tracker_state: dict, is_root_desktop: bool):
        bar_h = 52
        bar_y = height - bar_h

        # Telemetry panel background
        bot_surf = pygame.Surface((width, bar_h), pygame.SRCALPHA)
        bot_surf.fill(HUD_THEME['panel_bg'])
        screen.blit(bot_surf, (0, bar_y))
        pygame.draw.line(screen, HUD_THEME['border_dim'], (0, bar_y), (width, bar_y), 1)

        # 1. Active Hand Toggle Button
        active_hand = tracker_state.get('active_hand', 'DX')
        btn_hand_w = 175
        btn_hand_rect = pygame.Rect(20, bar_y + 10, btn_hand_w, 32)
        self.buttons['toggle_hand'] = btn_hand_rect

        is_hover = (self.hovered_button == 'toggle_hand')
        hand_border = HUD_THEME['cyan'] if active_hand == 'DX' else HUD_THEME['magenta']
        if is_hover:
            hand_border = (255, 255, 255)

        pygame.draw.rect(screen, (12, 25, 50), btn_hand_rect)
        pygame.draw.rect(screen, hand_border, btn_hand_rect, 2)
        hand_txt = f"MANO: {active_hand} [Tasto H]"
        txt_surf = self.font_btn.render(hand_txt, True, hand_border)
        screen.blit(txt_surf, (btn_hand_rect.x + (btn_hand_w - txt_surf.get_width()) // 2, btn_hand_rect.y + 7))

        # 2. Reset Grid Button
        btn_reset_w = 165
        btn_reset_rect = pygame.Rect(210, bar_y + 10, btn_reset_w, 32)
        self.buttons['reset_grid'] = btn_reset_rect
        is_reset_hover = (self.hovered_button == 'reset_grid')
        pygame.draw.rect(screen, (12, 25, 50), btn_reset_rect)
        pygame.draw.rect(screen, (255, 255, 255) if is_reset_hover else HUD_THEME['cyan_dim'], btn_reset_rect, 1)
        rst_surf = self.font_btn.render("RESET GRIGLIA [R]", True, (255, 255, 255) if is_reset_hover else HUD_THEME['cyan_dim'])
        screen.blit(rst_surf, (btn_reset_rect.x + (btn_reset_w - rst_surf.get_width()) // 2, btn_reset_rect.y + 7))

        # 3. Back Button (if inside subfolder)
        if not is_root_desktop:
            btn_back_w = 150
            btn_back_rect = pygame.Rect(390, bar_y + 10, btn_back_w, 32)
            self.buttons['navigate_back'] = btn_back_rect
            is_back_hover = (self.hovered_button == 'navigate_back')
            pygame.draw.rect(screen, (12, 25, 50), btn_back_rect)
            pygame.draw.rect(screen, (255, 255, 255) if is_back_hover else HUD_THEME['magenta'], btn_back_rect, 1)
            bck_surf = self.font_btn.render("⮌ INDIETRO [ESC]", True, HUD_THEME['magenta'])
            screen.blit(bck_surf, (btn_back_rect.x + (btn_back_w - bck_surf.get_width()) // 2, btn_back_rect.y + 7))

        # 4. Gesture Telemetry Center Banner
        status_text = tracker_state.get('status_text', 'RICERCA MANI...')
        is_pinch = tracker_state.get('is_pinch', False)
        is_middle = tracker_state.get('is_middle_pinch', False)
        is_prayer = tracker_state.get('is_prayer', False)

        if is_prayer:
            banner_col = (0, 255, 204)
        elif is_middle:
            banner_col = HUD_THEME['green']
        elif is_pinch:
            banner_col = HUD_THEME['gold']
        else:
            banner_col = HUD_THEME['cyan']

        banner_surf = self.font_telemetry.render(f"▶ {status_text}", True, banner_col)
        # Center between left buttons and right PIP
        center_x = (width - 270 + 400) // 2 - banner_surf.get_width() // 2
        screen.blit(banner_surf, (max(560, center_x), bar_y + 16))

    def _render_webcam_pip(self, screen: pygame.Surface, width: int, height: int, tracker_state: dict):
        pip_w, pip_h = 240, 150
        pip_x = width - pip_w - 20
        pip_y = height - pip_h - 60 # Above bottom bar

        pip_surf = tracker_state.get('pip_surface')
        if pip_surf:
            screen.blit(pip_surf, (pip_x, pip_y))
        else:
            # Placeholder sensor box if camera not ready
            box = pygame.Surface((pip_w, pip_h))
            box.fill((5, 12, 24))
            screen.blit(box, (pip_x, pip_y))
            msg = self.font_sub.render("CONNECTING WEBCAM SENSOR...", True, HUD_THEME['cyan_dim'])
            screen.blit(msg, (pip_x + 20, pip_y + 65))

        # High-tech Sci-Fi PIP Border Frame
        pygame.draw.rect(screen, HUD_THEME['cyan'], (pip_x, pip_y, pip_w, pip_h), 1)

        # Corner Accent L-Brackets
        c_len = 12
        pygame.draw.lines(screen, (255, 255, 255), False, [(pip_x, pip_y + c_len), (pip_x, pip_y), (pip_x + c_len, pip_y)], 2)
        pygame.draw.lines(screen, (255, 255, 255), False, [(pip_x + pip_w - c_len, pip_y), (pip_x + pip_w, pip_y), (pip_x + pip_w, pip_y + c_len)], 2)
        pygame.draw.lines(screen, (255, 255, 255), False, [(pip_x, pip_y + pip_h - c_len), (pip_x, pip_y + pip_h), (pip_x + c_len, pip_y + pip_h)], 2)
        pygame.draw.lines(screen, (255, 255, 255), False, [(pip_x + pip_w - c_len, pip_y + pip_h), (pip_x + pip_w, pip_y + pip_h), (pip_x + pip_w, pip_y + pip_h - c_len)], 2)

        # Sensor Tag
        tag_bg = pygame.Surface((135, 18), pygame.SRCALPHA)
        tag_bg.fill((6, 15, 30, 230))
        screen.blit(tag_bg, (pip_x + 5, pip_y + 5))
        tag_surf = self.font_sub.render("SENSOR // HAND PIP", True, HUD_THEME['cyan'])
        screen.blit(tag_surf, (pip_x + 10, pip_y + 6))

        # Hand preference badge
        active_hand = tracker_state.get('active_hand', 'DX')
        badge_surf = self.font_sub.render(f"[{active_hand}]", True, HUD_THEME['cyan'] if active_hand == 'DX' else HUD_THEME['magenta'])
        screen.blit(badge_surf, (pip_x + pip_w - 36, pip_y + 6))

    def handle_mouse_move(self, mouse_pos):
        for name, rect in self.buttons.items():
            if rect.collidepoint(mouse_pos):
                self.hovered_button = name
                return
        self.hovered_button = None

    def handle_mouse_click(self, mouse_pos):
        for name, rect in self.buttons.items():
            if rect.collidepoint(mouse_pos):
                return name
        return None
