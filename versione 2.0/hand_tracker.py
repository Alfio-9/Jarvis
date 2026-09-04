"""
JARVIS 2.0 - Ultra-Fluid Native MediaPipe Hand Tracker & Gesture Classifier
Multithreaded webcam capture, real-time 21-joint 3D hand tracking, anti-jitter EMA,
holographic skeleton overlay, and calibrated gesture recognition.
"""

import os
import time
import math
import threading
import numpy as np
import cv2
import pygame
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Hand skeletal bones connections
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),       # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),       # Index
    (5, 9), (9, 10), (10, 11), (11, 12),  # Middle
    (9, 13), (13, 14), (14, 15), (15, 16),# Ring
    (13, 17), (17, 18), (18, 19), (19, 20),# Pinky
    (0, 17)                               # Palm base
]


class HandData:
    """Holds smoothed landmarks and state for a single detected hand."""
    def __init__(self, handedness: str = 'Right'):
        self.handedness = handedness # 'Right' or 'Left'
        self.raw_landmarks = None    # 21 points (x, y, z)
        self.smoothed_landmarks = None
        self.hand_scale = 0.1
        self.is_pinching = False
        self.is_middle_pinching = False
        self.is_index_pointing = False
        self.is_pointing_up = False
        self.is_pointing_down = False
        self.norm_thumb_index = 1.0
        self.norm_thumb_middle = 1.0


class HandTracker:
    def __init__(self, model_path: str = None, cam_index: int = 0):
        self.model_path = model_path or os.path.join(os.path.dirname(__file__), 'models', 'hand_landmarker.task')
        self.cam_index = cam_index
        self.active_hand_pref = 'DX' # 'DX' (Right) or 'SX' (Left)
        self.is_running = False
        self.thread = None
        self.lock = threading.Lock()

        # Detector and Camera
        self.detector = None
        self.cap = None

        # State outputs
        self.has_hands = False
        self.primary_hand = None
        self.secondary_hand = None
        self.smoothed_cursor_ndc = [0.0, 0.0]
        self.is_grabbing = False
        self.is_prayer = False
        self.is_zooming = False
        self.zoom_delta = 0.0
        self.last_two_hand_dist = None
        self.gesture_status_text = "INITIALIZING TRACKER..."

        # PIP Camera Surface for HUD
        self.pip_surface = None
        self.pip_width = 240
        self.pip_height = 150

        # Double pinch detection state
        self.last_pinch_time = 0.0
        self.double_pinch_triggered = False

    def init(self) -> bool:
        """Initializes the MediaPipe detector and webcam."""
        if not os.path.exists(self.model_path):
            print(f"[HandTracker] Error: Model not found at '{self.model_path}'")
            return False

        try:
            base_options = python.BaseOptions(model_asset_path=self.model_path)
            options = vision.HandLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                num_hands=2,
                min_hand_detection_confidence=0.4,
                min_hand_presence_confidence=0.4,
                min_tracking_confidence=0.4
            )
            self.detector = vision.HandLandmarker.create_from_options(options)
            print("[HandTracker] MediaPipe HandLandmarker initialized successfully.")
        except Exception as e:
            print(f"[HandTracker] Error creating MediaPipe detector: {e}")
            return False

        # Open webcam
        try:
            self.cap = cv2.VideoCapture(self.cam_index, cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY)
            if not self.cap.isOpened():
                # Fallback to standard backend
                self.cap = cv2.VideoCapture(self.cam_index)

            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)

            if not self.cap.isOpened():
                print("[HandTracker] Warning: Cannot open webcam. Running in simulation mode.")
                return False
        except Exception as e:
            print(f"[HandTracker] Webcam initialization error: {e}")
            return False

        return True

    def start(self):
        """Spawns the background tracking worker thread."""
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()

    def toggle_active_hand(self):
        with self.lock:
            self.active_hand_pref = 'SX' if self.active_hand_pref == 'DX' else 'DX'
            return self.active_hand_pref

    # =========================================================================
    # Gesture Evaluation & Worker Thread
    # =========================================================================
    def _worker_loop(self):
        ema_hands = {} # Hand tracking memory for smoothing

        while self.is_running:
            if not self.cap or not self.cap.isOpened():
                time.sleep(0.03)
                continue

            ret, raw_frame = self.cap.read()
            if not ret or raw_frame is None:
                time.sleep(0.01)
                continue

            # Mirror horizontally for natural selfie reflection
            frame = cv2.flip(raw_frame, 1)
            h, w, _ = frame.shape

            # Convert BGR to RGB for MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            try:
                result = self.detector.detect(mp_image)
            except Exception as e:
                time.sleep(0.01)
                continue

            landmarks_list = result.hand_landmarks or []
            handedness_list = result.handedness or []

            current_hands = []

            for idx, lms in enumerate(landmarks_list):
                label = 'Right'
                if idx < len(handedness_list) and handedness_list[idx]:
                    label = handedness_list[idx][0].category_name

                # Extract 21 points as numpy array
                pts = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32)

                # EMA Smoothing
                hand_key = label
                if hand_key not in ema_hands:
                    ema_hands[hand_key] = pts.copy()
                else:
                    ema_hands[hand_key] = ema_hands[hand_key] * 0.40 + pts * 0.60

                smoothed = ema_hands[hand_key]

                # Compute scale
                d_palm = np.linalg.norm(smoothed[9, :2] - smoothed[0, :2])
                d_width = np.linalg.norm(smoothed[17, :2] - smoothed[5, :2])
                scale = max(0.02, (d_palm + d_width) / 2.0)

                h_data = HandData(handedness=label)
                h_data.raw_landmarks = pts
                h_data.smoothed_landmarks = smoothed
                h_data.hand_scale = scale

                # Analyze finger distances
                d_thumb_index = np.linalg.norm(smoothed[4, :2] - smoothed[8, :2]) / scale
                d_thumb_middle = np.linalg.norm(smoothed[4, :2] - smoothed[12, :2]) / scale
                h_data.norm_thumb_index = d_thumb_index
                h_data.norm_thumb_middle = d_thumb_middle

                # Strict Mutually Exclusive Pinch states with hysteresis
                # Index Pinch: Thumb (4) + Index (8)
                # Middle Pinch: Thumb (4) + Middle (12)
                index_thresh = 0.65 if getattr(self, 'was_index_pinching', False) else 0.45
                is_index_pinch = (d_thumb_index < index_thresh) and (d_thumb_index < d_thumb_middle * 0.85)

                middle_thresh = 0.48
                is_middle_pinch = (d_thumb_middle < middle_thresh) and (d_thumb_middle < d_thumb_index * 0.85)

                if is_index_pinch:
                    h_data.is_pinching = True
                    h_data.is_middle_pinching = False
                    self.was_index_pinching = True
                elif is_middle_pinch:
                    h_data.is_pinching = False
                    h_data.is_middle_pinching = True
                    self.was_index_pinching = False
                else:
                    h_data.is_pinching = False
                    h_data.is_middle_pinching = False
                    self.was_index_pinching = False

                # Directional pointing (Index pointing up / down)
                d_index_wrist = np.linalg.norm(smoothed[8, :2] - smoothed[0, :2])
                d_pip_wrist = np.linalg.norm(smoothed[6, :2] - smoothed[0, :2])
                is_index_ext = d_index_wrist > d_pip_wrist * 1.12

                d_middle_wrist = np.linalg.norm(smoothed[12, :2] - smoothed[0, :2])
                d_ring_wrist = np.linalg.norm(smoothed[16, :2] - smoothed[0, :2])
                d_pinky_wrist = np.linalg.norm(smoothed[20, :2] - smoothed[0, :2])

                # Other 3 fingers curled
                other_curled = (d_middle_wrist < d_index_wrist * 0.82) and (d_ring_wrist < d_index_wrist * 0.80) and (d_pinky_wrist < d_index_wrist * 0.78)

                if is_index_ext and other_curled:
                    h_data.is_index_pointing = True
                    # In screen coordinates y=0 is top
                    dy = smoothed[8, 1] - smoothed[5, 1] # Index tip - MCP
                    if dy < -0.04:
                        h_data.is_pointing_up = True
                    elif dy > 0.04:
                        h_data.is_pointing_down = True

                current_hands.append(h_data)

            # Check Christian Prayer Gesture (Mani Giunte)
            is_prayer = False
            if len(current_hands) >= 2:
                h1 = current_hands[0].smoothed_landmarks
                h2 = current_hands[1].smoothed_landmarks
                avg_scale = (current_hands[0].hand_scale + current_hands[1].hand_scale) / 2.0
                d_wrists = np.linalg.norm(h1[0, :2] - h2[0, :2]) / avg_scale
                d_palms = np.linalg.norm(h1[9, :2] - h2[9, :2]) / avg_scale
                d_tips = np.linalg.norm(h1[12, :2] - h2[12, :2]) / avg_scale

                # Joined hands vertically oriented
                if d_palms < 1.40 and d_tips < 1.40 and d_wrists < 1.85:
                    if h1[12, 1] < h1[0, 1] and h2[12, 1] < h2[0, 1]:
                        is_prayer = True

            # Two-hand zoom
            is_zooming = False
            zoom_delta = 0.0
            if len(current_hands) >= 2 and not is_prayer:
                p1 = current_hands[0].smoothed_landmarks[8, :2]
                p2 = current_hands[1].smoothed_landmarks[8, :2]
                dist_2h = np.linalg.norm(p1 - p2)
                if self.last_two_hand_dist is not None:
                    zoom_delta = float(dist_2h - self.last_two_hand_dist)
                    if abs(zoom_delta) > 0.005:
                        is_zooming = True
                self.last_two_hand_dist = dist_2h
            else:
                self.last_two_hand_dist = None

            # Sort Primary and Secondary hand based on user preference
            primary = None
            secondary = None

            target_label = 'Right' if self.active_hand_pref == 'DX' else 'Left'
            for h_item in current_hands:
                if h_item.handedness == target_label:
                    primary = h_item
                else:
                    secondary = h_item

            if primary is None and len(current_hands) > 0:
                # If preferred hand not found, use whatever hand is visible
                primary = current_hands[0]
                if len(current_hands) > 1:
                    secondary = current_hands[1]

            # Render Sci-Fi Neon Skeleton on PIP frame
            pip_img = self._draw_pip_skeleton(frame, current_hands, is_prayer)
            pip_surf = self._cv2_to_pygame(pip_img)

            # Update shared state under lock
            with self.lock:
                self.has_hands = len(current_hands) > 0
                self.primary_hand = primary
                self.secondary_hand = secondary
                self.is_prayer = is_prayer
                self.is_zooming = is_zooming
                self.zoom_delta = zoom_delta
                self.pip_surface = pip_surf

                if primary:
                    # Index tip normalized [-1, 1] with sensitivity multiplier
                    idx_pt = primary.smoothed_landmarks[8]
                    ndc_x = (idx_pt[0] - 0.5) * 2.5
                    ndc_y = (0.5 - idx_pt[1]) * 2.5 # Invert Y for NDC
                    # Clamp
                    ndc_x = max(-1.2, min(1.2, ndc_x))
                    ndc_y = max(-1.2, min(1.2, ndc_y))

                    # LERP cursor
                    self.smoothed_cursor_ndc[0] += (ndc_x - self.smoothed_cursor_ndc[0]) * 0.70
                    self.smoothed_cursor_ndc[1] += (ndc_y - self.smoothed_cursor_ndc[1]) * 0.70

                    # Status telemetry text
                    if is_prayer:
                        self.gesture_status_text = "PREGHIERA 🙏 // CHIUDI DOCUMENTO"
                    elif primary.is_middle_pinching:
                        self.gesture_status_text = f"MIDDLE PINCH [APRI] // {self.active_hand_pref}"
                    elif primary.is_pinching:
                        self.gesture_status_text = f"PINCH & DRAG // {self.active_hand_pref}"
                    elif primary.is_pointing_up:
                        self.gesture_status_text = f"INDICA SU ▲ // SCROLL SU"
                    elif primary.is_pointing_down:
                        self.gesture_status_text = f"INDICA GIÙ ▼ // SCROLL GIÙ"
                    elif primary.is_index_pointing:
                        self.gesture_status_text = f"PUNTATORE PRECISO // {self.active_hand_pref}"
                    else:
                        self.gesture_status_text = f"PUNTAMENTO LIBERO // {self.active_hand_pref}"
                else:
                    self.gesture_status_text = f"RICERCA MANI [{self.active_hand_pref}]..."

            time.sleep(0.01)

    def _draw_pip_skeleton(self, frame, hands: list, is_prayer: bool):
        h, w, _ = frame.shape
        # Dim background for sci-fi contrast
        overlay = (frame.astype(np.float32) * 0.45).astype(np.uint8)

        for h_data in hands:
            pts = h_data.smoothed_landmarks
            is_primary = (h_data.handedness == ('Right' if self.active_hand_pref == 'DX' else 'Left'))

            if is_prayer:
                bone_col = (204, 255, 0) # BGR Neon mint
            elif is_primary:
                bone_col = (255, 243, 0) # BGR Electric Cyan
            else:
                bone_col = (119, 0, 255) # BGR Neon Magenta

            # Draw bones
            for s_idx, e_idx in HAND_CONNECTIONS:
                p1 = (int(pts[s_idx, 0] * w), int(pts[s_idx, 1] * h))
                p2 = (int(pts[e_idx, 0] * w), int(pts[e_idx, 1] * h))
                cv2.line(overlay, p1, p2, bone_col, 2, cv2.LINE_AA)

            # Draw joints
            for j_idx in range(21):
                pt = (int(pts[j_idx, 0] * w), int(pts[j_idx, 1] * h))
                radius = 4 if j_idx in [4, 8, 12, 16, 20] else 2
                cv2.circle(overlay, pt, radius, (255, 255, 255), -1, cv2.LINE_AA)

            # If pinching with index: draw cyan/gold connection between thumb and index
            if h_data.is_pinching:
                t_pt = (int(pts[4, 0] * w), int(pts[4, 1] * h))
                i_pt = (int(pts[8, 0] * w), int(pts[8, 1] * h))
                cv2.line(overlay, t_pt, i_pt, (50, 220, 255), 4, cv2.LINE_AA)
                cv2.circle(overlay, t_pt, 6, (0, 255, 255), -1, cv2.LINE_AA)
                cv2.circle(overlay, i_pt, 6, (0, 255, 255), -1, cv2.LINE_AA)
            # If pinching with middle: draw neon green connection between thumb and middle
            elif h_data.is_middle_pinching:
                t_pt = (int(pts[4, 0] * w), int(pts[4, 1] * h))
                m_pt = (int(pts[12, 0] * w), int(pts[12, 1] * h))
                cv2.line(overlay, t_pt, m_pt, (0, 255, 102), 4, cv2.LINE_AA)
                cv2.circle(overlay, t_pt, 6, (0, 255, 102), -1, cv2.LINE_AA)
                cv2.circle(overlay, m_pt, 6, (0, 255, 102), -1, cv2.LINE_AA)

        # Resize to PIP size
        resized = cv2.resize(overlay, (self.pip_width, self.pip_height))
        # Draw high-tech HUD border
        cv2.rectangle(resized, (0, 0), (self.pip_width - 1, self.pip_height - 1), (0, 243, 255), 1)
        return resized

    def _cv2_to_pygame(self, cv2_img) -> pygame.Surface:
        rgb_img = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
        return pygame.image.frombuffer(rgb_img.tobytes(), (self.pip_width, self.pip_height), 'RGB')

    def get_state(self) -> dict:
        """Thread-safe snapshot of tracker data for main rendering loop."""
        with self.lock:
            double_pinch = self.double_pinch_triggered
            self.double_pinch_triggered = False # Consume one-shot trigger

            is_pinch = self.primary_hand.is_pinching if self.primary_hand else False
            is_middle_pinch = self.primary_hand.is_middle_pinching if self.primary_hand else False
            is_pt_up = self.primary_hand.is_pointing_up if self.primary_hand else False
            is_pt_down = self.primary_hand.is_pointing_down if self.primary_hand else False

            return {
                'has_hands': self.has_hands,
                'cursor_ndc': list(self.smoothed_cursor_ndc),
                'is_pinch': is_pinch,
                'is_middle_pinch': is_middle_pinch,
                'is_double_pinch': double_pinch,
                'is_point_up': is_pt_up,
                'is_point_down': is_pt_down,
                'is_prayer': self.is_prayer,
                'is_zooming': self.is_zooming,
                'zoom_delta': self.zoom_delta,
                'status_text': self.gesture_status_text,
                'pip_surface': self.pip_surface,
                'active_hand': self.active_hand_pref
            }
