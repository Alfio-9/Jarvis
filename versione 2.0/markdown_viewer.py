"""
JARVIS 2.0 - Holographic Sci-Fi Markdown & Document Reader
In-app futuristic document reader with gesture-based scrolling (pointing up/down)
and Christian Prayer gesture closure.
"""

import os
import pygame

# Holographic Document Theme
MD_THEME = {
    'bg_overlay': (3, 7, 18, 230),
    'border': (0, 243, 255),
    'header_bg': (10, 25, 45),
    'title': (0, 243, 255),
    'h1': (0, 255, 204),
    'h2': (100, 220, 255),
    'h3': (180, 235, 255),
    'text': (210, 230, 245),
    'code_bg': (15, 23, 42),
    'code_text': (0, 255, 128),
    'quote_bar': (0, 170, 255),
    'btn_close': (255, 0, 119)
}


class MarkdownViewer:
    def __init__(self):
        self.is_open = False
        self.file_path = ""
        self.file_name = ""
        self.raw_lines = []
        self.rendered_items = [] # Pre-rendered surfaces and types
        self.scroll_y = 0.0
        self.target_scroll_y = 0.0
        self.max_scroll = 0.0
        self.fonts = {}
        self._init_fonts()

    def _init_fonts(self):
        if not pygame.font.get_init():
            pygame.font.init()
        try:
            self.fonts['title'] = pygame.font.SysFont('Segoe UI', 20, bold=True)
            self.fonts['h1'] = pygame.font.SysFont('Segoe UI', 24, bold=True)
            self.fonts['h2'] = pygame.font.SysFont('Segoe UI', 20, bold=True)
            self.fonts['h3'] = pygame.font.SysFont('Segoe UI', 17, bold=True)
            self.fonts['body'] = pygame.font.SysFont('Segoe UI', 15)
            self.fonts['code'] = pygame.font.SysFont('Consolas', 14)
            self.fonts['meta'] = pygame.font.SysFont('Consolas', 12)
        except Exception:
            self.fonts['title'] = pygame.font.Font(None, 24)
            self.fonts['h1'] = pygame.font.Font(None, 28)
            self.fonts['h2'] = pygame.font.Font(None, 24)
            self.fonts['h3'] = pygame.font.Font(None, 20)
            self.fonts['body'] = pygame.font.Font(None, 18)
            self.fonts['code'] = pygame.font.Font(None, 16)
            self.fonts['meta'] = pygame.font.Font(None, 14)

    def open(self, file_path: str):
        if not os.path.exists(file_path):
            return False

        self.file_path = file_path
        self.file_name = os.path.basename(file_path)
        self.is_open = True
        self.scroll_y = 0.0
        self.target_scroll_y = 0.0

        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                self.raw_lines = f.readlines()
        except Exception as e:
            self.raw_lines = [f"# Error Reading File\n", f"{e}"]

        self._parse_content()
        return True

    def close(self):
        self.is_open = False
        self.file_path = ""
        self.file_name = ""
        self.raw_lines = []
        self.rendered_items = []

    def scroll_by(self, delta: float):
        self.target_scroll_y = max(0.0, min(self.max_scroll, self.target_scroll_y + delta))

    def _parse_content(self):
        """Prepares rendered text surfaces with wrapped lines."""
        self.rendered_items = []
        in_code_block = False
        content_width = 860

        total_height = 20

        for line in self.raw_lines:
            stripped = line.rstrip('\r\n')

            # Code fence toggle
            if stripped.startswith('```'):
                in_code_block = not in_code_block
                continue

            if in_code_block:
                surf = self.fonts['code'].render(stripped if stripped else ' ', True, MD_THEME['code_text'])
                self.rendered_items.append(('code', surf, 22))
                total_height += 22
                continue

            if stripped.startswith('# '):
                text = stripped[2:].strip()
                surf = self.fonts['h1'].render(text, True, MD_THEME['h1'])
                self.rendered_items.append(('h1', surf, 36))
                total_height += 36
            elif stripped.startswith('## '):
                text = stripped[3:].strip()
                surf = self.fonts['h2'].render(text, True, MD_THEME['h2'])
                self.rendered_items.append(('h2', surf, 32))
                total_height += 32
            elif stripped.startswith('### '):
                text = stripped[4:].strip()
                surf = self.fonts['h3'].render(text, True, MD_THEME['h3'])
                self.rendered_items.append(('h3', surf, 28))
                total_height += 28
            elif stripped.startswith('- ') or stripped.startswith('* '):
                text = '  • ' + stripped[2:].strip()
                surf = self.fonts['body'].render(text, True, MD_THEME['text'])
                self.rendered_items.append(('bullet', surf, 24))
                total_height += 24
            elif stripped.startswith('> '):
                text = '│ ' + stripped[2:].strip()
                surf = self.fonts['body'].render(text, True, MD_THEME['quote_bar'])
                self.rendered_items.append(('quote', surf, 24))
                total_height += 24
            elif stripped == '':
                self.rendered_items.append(('spacer', None, 14))
                total_height += 14
            else:
                surf = self.fonts['body'].render(stripped, True, MD_THEME['text'])
                self.rendered_items.append(('body', surf, 22))
                total_height += 22

        self.max_scroll = max(0.0, total_height - 500)

    def render(self, screen: pygame.Surface, width: int, height: int):
        if not self.is_open:
            return

        # Smooth scroll lerp
        self.scroll_y += (self.target_scroll_y - self.scroll_y) * 0.25

        # Dimmed backdrop
        modal_w = min(1000, width - 120)
        modal_h = min(720, height - 100)
        modal_x = (width - modal_w) // 2
        modal_y = (height - modal_h) // 2

        # Draw semi-transparent modal box
        overlay = pygame.Surface((modal_w, modal_h), pygame.SRCALPHA)
        overlay.fill(MD_THEME['bg_overlay'])
        screen.blit(overlay, (modal_x, modal_y))

        # Neon borders
        pygame.draw.rect(screen, MD_THEME['border'], (modal_x, modal_y, modal_w, modal_h), 2)
        # Corner sci-fi accents
        accent_len = 16
        pygame.draw.line(screen, (255, 255, 255), (modal_x, modal_y), (modal_x + accent_len, modal_y), 3)
        pygame.draw.line(screen, (255, 255, 255), (modal_x, modal_y), (modal_x, modal_y + accent_len), 3)
        pygame.draw.line(screen, (255, 255, 255), (modal_x + modal_w, modal_y + modal_h), (modal_x + modal_w - accent_len, modal_y + modal_h), 3)
        pygame.draw.line(screen, (255, 255, 255), (modal_x + modal_w, modal_y + modal_h), (modal_x + modal_w, modal_y + modal_h - accent_len), 3)

        # Header bar
        header_h = 44
        pygame.draw.rect(screen, MD_THEME['header_bg'], (modal_x, modal_y, modal_w, header_h))
        pygame.draw.line(screen, MD_THEME['border'], (modal_x, modal_y + header_h), (modal_x + modal_w, modal_y + header_h), 1)

        title_surf = self.fonts['title'].render(f"HOLOGRAPHIC VIEWER // {self.file_name.upper()}", True, MD_THEME['title'])
        screen.blit(title_surf, (modal_x + 18, modal_y + 10))

        hint_surf = self.fonts['meta'].render("INDICA SU ▲ / GIÙ ▼ PER SCROLL • MANI A PREGHIERA 🙏 O [ESC] PER CHIUDERE", True, (130, 170, 200))
        screen.blit(hint_surf, (modal_x + modal_w - hint_surf.get_width() - 40, modal_y + 15))

        # Close button [X]
        close_x = modal_x + modal_w - 30
        close_y = modal_y + 10
        pygame.draw.rect(screen, MD_THEME['btn_close'], (close_x, close_y, 22, 22), 1)
        x_surf = self.fonts['code'].render("X", True, MD_THEME['btn_close'])
        screen.blit(x_surf, (close_x + 6, close_y + 2))

        # Content clipping area
        content_rect = pygame.Rect(modal_x + 20, modal_y + header_h + 10, modal_w - 40, modal_h - header_h - 20)
        clip_surf = pygame.Surface((content_rect.width, content_rect.height), pygame.SRCALPHA)

        curr_y = 10 - int(self.scroll_y)
        for item_type, surf, item_h in self.rendered_items:
            if surf is not None and curr_y + item_h > 0 and curr_y < content_rect.height:
                if item_type == 'code':
                    # Code background bar
                    pygame.draw.rect(clip_surf, MD_THEME['code_bg'], (0, curr_y - 2, content_rect.width, item_h + 2))
                clip_surf.blit(surf, (10, curr_y))
            curr_y += item_h

        screen.blit(clip_surf, (content_rect.x, content_rect.y))

        # Scrollbar track
        if self.max_scroll > 0:
            track_h = modal_h - header_h - 30
            bar_h = max(30, int(track_h * (track_h / (track_h + self.max_scroll))))
            bar_y = modal_y + header_h + 15 + int((self.scroll_y / self.max_scroll) * (track_h - bar_h))
            pygame.draw.rect(screen, (20, 50, 80), (modal_x + modal_w - 12, modal_y + header_h + 15, 6, track_h))
            pygame.draw.rect(screen, MD_THEME['border'], (modal_x + modal_w - 12, bar_y, 6, bar_h))
