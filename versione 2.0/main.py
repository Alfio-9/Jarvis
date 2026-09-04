"""
JARVIS 2.0 - 3D Spatial Holographic Desktop Interface
Main Application Orchestrator
Powered by Python, Pygame, OpenCV, and MediaPipe Tasks Vision.
"""

import os
import sys
import time
import math
import pygame
import numpy as np

# Ensure local imports work reliably
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from spatial_scene import SpatialScene, COLOR_PALETTE
from hand_tracker import HandTracker
from desktop_manager import DesktopNodesManager
from hud_overlay import HUDOverlay
from markdown_viewer import MarkdownViewer
import audio_synth


class JarvisApp:
    def __init__(self, width: int = 1440, height: int = 900):
        pygame.init()
        pygame.font.init()
        audio_synth.init_audio()

        self.width = width
        self.height = height
        self.is_fullscreen = False

        # Create window
        self.screen = pygame.display.set_mode((self.width, self.height), pygame.RESIZABLE)
        pygame.display.set_caption("JARVIS 3D Spatial Desktop 2.0 // Python Edition")

        # Set app icon if available
        self.clock = pygame.time.Clock()
        self.is_running = True

        # Initialize Subsystems
        print("[Jarvis 2.0] Initializing Subsystems...")
        self.scene = SpatialScene(self.width, self.height)
        self.desktop_manager = DesktopNodesManager()
        self.hud = HUDOverlay()
        self.markdown_viewer = MarkdownViewer()
        self.tracker = HandTracker()

        # Start vision tracker and scan files
        self.tracker.init()
        self.tracker.start()
        self.desktop_manager.scan_directory()

        # Interaction State
        self.hovered_node = None
        self.grabbed_node = None
        self.mouse_orbiting = False
        self.last_mouse_pos = (0, 0)
        self.launch_cooldown = 0.0

        # Announce startup
        audio_synth.sfx_launch()
        audio_synth.speak("Jarvis online")

    def run(self):
        """Main 60 FPS Application Loop."""
        while self.is_running:
            dt = self.clock.tick(60) / 1000.0
            fps = self.clock.get_fps()

            tracker_state = self.tracker.get_state()
            self._handle_events(tracker_state)
            self._update(tracker_state, dt)
            self._render(tracker_state, fps)

        # Clean shutdown
        self.tracker.stop()
        pygame.quit()
        sys.exit(0)

    # =========================================================================
    # Event Handling
    # =========================================================================
    def _handle_events(self, tracker_state: dict):
        mouse_pos = pygame.mouse.get_pos()
        self.hud.handle_mouse_move(mouse_pos)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.is_running = False
                return

            elif event.type == pygame.VIDEORESIZE:
                self.width, self.height = event.w, event.h
                self.screen = pygame.display.set_mode((self.width, self.height), pygame.RESIZABLE)
                self.scene.resize(self.width, self.height)

            elif event.type == pygame.KEYDOWN:
                self._handle_keydown(event.key)

            elif event.type == pygame.MOUSEWHEEL:
                if self.markdown_viewer.is_open:
                    self.markdown_viewer.scroll_by(-event.y * 35)
                else:
                    self.scene.camera.target_distance = max(5.0, min(32.0, self.scene.camera.target_distance - event.y * 1.5))

            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1: # Left Click
                    # Check HUD button click
                    btn_name = self.hud.handle_mouse_click(mouse_pos)
                    if btn_name:
                        self._trigger_hud_action(btn_name)
                    elif self.markdown_viewer.is_open:
                        # Check close button area [X]
                        modal_w = min(1000, self.width - 120)
                        modal_x = (self.width - modal_w) // 2
                        modal_y = (self.height - min(720, self.height - 100)) // 2
                        close_rect = pygame.Rect(modal_x + modal_w - 30, modal_y + 10, 22, 22)
                        if close_rect.collidepoint(mouse_pos):
                            audio_synth.sfx_prayer_close()
                            self.markdown_viewer.close()
                    else:
                        # Grab hovered node
                        if self.hovered_node and not self.grabbed_node:
                            self.grabbed_node = self.hovered_node
                            self.grabbed_node.is_grabbed = True
                            self.desktop_manager.is_grabbing = True
                            audio_synth.sfx_grab()

                elif event.button == 3: # Right Click: Orbit Camera
                    self.mouse_orbiting = True
                    self.last_mouse_pos = mouse_pos

            elif event.type == pygame.MOUSEBUTTONUP:
                if event.button == 1:
                    if self.grabbed_node:
                        self.grabbed_node.is_grabbed = False
                        self.desktop_manager.is_grabbing = False
                        self.desktop_manager.save_layout()
                        audio_synth.sfx_release()
                        self.grabbed_node = None
                elif event.button == 3:
                    self.mouse_orbiting = False

            elif event.type == pygame.MOUSEMOTION:
                if self.mouse_orbiting:
                    dx = event.pos[0] - self.last_mouse_pos[0]
                    dy = event.pos[1] - self.last_mouse_pos[1]
                    self.scene.camera.target_yaw += dx * 0.005
                    self.scene.camera.target_pitch = max(-1.1, min(1.1, self.scene.camera.target_pitch + dy * 0.005))
                    self.last_mouse_pos = event.pos

    def _handle_keydown(self, key):
        if key == pygame.K_F11:
            self.is_fullscreen = not self.is_fullscreen
            flags = pygame.FULLSCREEN if self.is_fullscreen else pygame.RESIZABLE
            self.screen = pygame.display.set_mode((0, 0) if self.is_fullscreen else (self.width, self.height), flags)
            self.width, self.height = self.screen.get_size()
            self.scene.resize(self.width, self.height)

        elif key == pygame.K_h:
            new_hand = self.tracker.toggle_active_hand()
            audio_synth.sfx_switch()

        elif key == pygame.K_r:
            self.desktop_manager.reset_grid()
            audio_synth.sfx_switch()

        elif key == pygame.K_F5:
            self.desktop_manager.scan_directory()
            audio_synth.sfx_launch()

        elif key in (pygame.K_ESCAPE, pygame.K_BACKSPACE):
            if self.markdown_viewer.is_open:
                audio_synth.sfx_prayer_close()
                self.markdown_viewer.close()
            elif not self.desktop_manager.is_root_desktop():
                audio_synth.sfx_back()
                self.desktop_manager.navigate_back()

        elif key in (pygame.K_RETURN, pygame.K_SPACE):
            if self.hovered_node and not self.markdown_viewer.is_open:
                self._launch_item(self.hovered_node)

    def _trigger_hud_action(self, action_name: str):
        if action_name == 'toggle_hand':
            self.tracker.toggle_active_hand()
            audio_synth.sfx_switch()
        elif action_name == 'reset_grid':
            self.desktop_manager.reset_grid()
            audio_synth.sfx_switch()
        elif action_name == 'navigate_back':
            audio_synth.sfx_back()
            self.desktop_manager.navigate_back()

    # =========================================================================
    # Update Loop & Spatial Gestures
    # =========================================================================
    def _update(self, tracker_state: dict, dt: float):
        self.scene.update()
        now = time.time()

        # Update all 3D items
        for item in self.desktop_manager.items:
            item.update()

        # Check in-document gestures
        if self.markdown_viewer.is_open:
            if tracker_state.get('is_prayer'):
                audio_synth.sfx_prayer_close()
                self.markdown_viewer.close()
                return

            if tracker_state.get('is_point_up'):
                self.markdown_viewer.scroll_by(-18)
            elif tracker_state.get('is_point_down'):
                self.markdown_viewer.scroll_by(18)
            return

        # Hand Tracking & Spatial Cursor
        has_hands = tracker_state.get('has_hands', False)
        is_pinch = tracker_state.get('is_pinch', False)
        is_middle_pinch = tracker_state.get('is_middle_pinch', False)
        is_double_pinch = tracker_state.get('is_double_pinch', False)

        if has_hands:
            ndc = tracker_state['cursor_ndc']
            world_cursor = self.scene.camera.unproject_ndc(ndc[0], ndc[1], target_z=0.0,
                                                           width=self.width, height=self.height)
            self.scene.cursor_pos = world_cursor
            self.scene.cursor_visible = True
            self.scene.cursor_grab = is_pinch

            # Two-hand zoom gesture
            if tracker_state.get('is_zooming'):
                delta = tracker_state.get('zoom_delta', 0.0)
                self.scene.camera.target_distance = max(5.0, min(32.0, self.scene.camera.target_distance - delta * 25.0))

        else:
            # Fallback: mouse cursor unprojection when no hand detected
            mouse_x, mouse_y = pygame.mouse.get_pos()
            ndc_x = (mouse_x / self.width) * 2.0 - 1.0
            ndc_y = 1.0 - (mouse_y / self.height) * 2.0
            world_cursor = self.scene.camera.unproject_ndc(ndc_x, ndc_y, target_z=0.0,
                                                           width=self.width, height=self.height)
            self.scene.cursor_pos = world_cursor
            self.scene.cursor_visible = not self.markdown_viewer.is_open
            self.scene.cursor_grab = self.grabbed_node is not None

        # Nearest node magnetic snap
        target_candidate = self.desktop_manager.find_nearest_node(self.scene.cursor_pos, max_dist=1.95)

        # Hover state transitions
        if target_candidate != self.hovered_node:
            if self.hovered_node:
                self.hovered_node.is_hovered = False
            self.hovered_node = target_candidate
            if self.hovered_node:
                self.hovered_node.is_hovered = True
                audio_synth.sfx_hover()

        # Handle Pinch / Drag
        if is_pinch and has_hands:
            if not self.grabbed_node and self.hovered_node:
                self.grabbed_node = self.hovered_node
                self.grabbed_node.is_grabbed = True
                self.desktop_manager.is_grabbing = True
                audio_synth.sfx_grab()

            if self.grabbed_node:
                self.grabbed_node.target_position = self.scene.cursor_pos.copy()

        else:
            # Release Grab
            if self.grabbed_node and has_hands:
                self.grabbed_node.is_grabbed = False
                self.desktop_manager.is_grabbing = False
                self.desktop_manager.save_layout()
                audio_synth.sfx_release()
                self.grabbed_node = None

        # Handle File / Folder Launch (Middle Pinch or Double Pinch)
        if (is_middle_pinch or is_double_pinch) and (now - self.launch_cooldown > 0.9):
            node_to_launch = self.grabbed_node or self.hovered_node
            if node_to_launch:
                self.launch_cooldown = now
                self._launch_item(node_to_launch)

    def _launch_item(self, item):
        if not item:
            return

        audio_synth.sfx_launch()
        result = self.desktop_manager.execute_node(item)
        action = result.get('action')

        if action == 'folder':
            audio_synth.speak(f"Cartella {item.name}")
        elif action == 'markdown':
            self.markdown_viewer.open(item.path)
            audio_synth.speak(f"Lettura {item.name}")
        elif action == 'back':
            audio_synth.sfx_back()

        # Release any grab
        if self.grabbed_node:
            self.grabbed_node.is_grabbed = False
            self.grabbed_node = None
            self.desktop_manager.is_grabbing = False

    # =========================================================================
    # Rendering Pipeline
    # =========================================================================
    def _render(self, tracker_state: dict, fps: float):
        # 1. Background Grid & Cosmic Dust Particles
        self.scene.render_background(self.screen)

        # 2. Render 3D Wireframe Desktop Nodes
        for item in self.desktop_manager.items:
            mesh_type = 'cube'
            col = COLOR_PALETTE['folder']

            if item.item_type == 'folder':
                mesh_type = 'cube'
                col = COLOR_PALETTE['folder']
            elif item.item_type == 'executable':
                mesh_type = 'octahedron'
                col = COLOR_PALETTE['executable']
            elif item.item_type == 'markdown':
                mesh_type = 'dodecahedron'
                col = COLOR_PALETTE['markdown']
            elif item.item_type == 'back':
                mesh_type = 'torus'
                col = COLOR_PALETTE['back']
            else:
                mesh_type = 'tetrahedron'
                col = COLOR_PALETTE['document']

            self.scene.draw_wireframe_mesh(
                self.screen,
                mesh_type=mesh_type,
                position=item.position,
                rotations=(item.rotation[0], item.rotation[1], item.rotation[2]),
                color=col,
                is_hovered=(item.is_hovered or item.is_grabbed),
                scale=1.15 if (item.is_hovered or item.is_grabbed) else 1.0
            )

        # 3. Render 3D Spatial Cursor
        self.scene.draw_cursor(self.screen)

        # 4. Render Cyberpunk Iron-Man HUD Overlay
        self.hud.render(
            self.screen,
            self.width,
            self.height,
            current_folder_name=self.desktop_manager.get_current_folder_name(),
            is_root_desktop=self.desktop_manager.is_root_desktop(),
            node_count=len(self.desktop_manager.items),
            fps=fps,
            tracker_state=tracker_state,
            desktop_manager=self.desktop_manager,
            spatial_scene=self.scene
        )

        # 5. Render Holographic Markdown Modal if Open
        if self.markdown_viewer.is_open:
            self.markdown_viewer.render(self.screen, self.width, self.height)

        pygame.display.flip()


def main():
    app = JarvisApp()
    app.run()


if __name__ == '__main__':
    main()
