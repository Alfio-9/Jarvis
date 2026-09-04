/**
 * HandTracker - MediaPipe Tasks Vision WebAssembly & Webcam Pipeline
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { detectHandPosture } from './posture-detector.js';
import { detectPrayerGesture } from './gesture-engine.js';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                               // Palm base
];

export class HandTracker {
  constructor(videoElement, skeletonCanvas) {
    this.video = videoElement;
    this.canvas = skeletonCanvas;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.handLandmarker = null;
    this.lastVideoTime = -1;
    this.onResultsCallback = null;
  }

  async init() {
    const statusElem = document.getElementById('status-indicator');
    if (statusElem) statusElem.textContent = 'LOADING MEDIAPIPE TASKS VISION...';

    // 1. Load WebAssembly runtime from Google CDN
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );

    // 2. Instantiate HandLandmarker with GPU delegate in VIDEO mode
    // Lowered confidence thresholds (0.3) enable reliable detection when hands are smaller/further away
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3
    });

    if (statusElem) statusElem.textContent = 'CONNECTING SENSOR (WEBCAM)...';

    // 3. Request webcam stream with HD 720p preference for enhanced distant detail
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 60 }
      },
      audio: false
    });

    this.video.srcObject = stream;
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });

    if (statusElem) statusElem.textContent = 'SYSTEM ONLINE // TRACKING ACTIVE';
  }

  drawSkeleton(landmarksList) {
    if (!this.ctx || !this.canvas) return;

    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    this.ctx.clearRect(0, 0, w, h);
    if (!landmarksList || landmarksList.length === 0) return;

    const activeHand = localStorage.getItem('jarvis_active_hand') || 'DX';
    const isPrayer = detectPrayerGesture(landmarksList);

    landmarksList.forEach((landmarks, idx) => {
      const isPrimary = idx === 0;
      const handType = isPrimary ? activeHand : (activeHand === 'DX' ? 'SX' : 'DX');
      const posture = detectHandPosture(landmarks, handType);

      // STRICT REQUIREMENT: La mano posteriore (retro/dorso) NON deve essere mai rilevata (eccetto quando giunte a preghiera)
      if (!isPrayer && posture.isBackOfHand) {
        return;
      }

      const isIgnored = !isPrayer && !posture.isAuthorized;

      const strokeColor = isPrayer ? '#00ffcc' : (isIgnored ? '#ffaa00' : (isPrimary ? '#00f3ff' : '#ff0077'));
      const pointColor = isPrayer ? '#ffffff' : (isIgnored ? '#ffd700' : (isPrimary ? '#ffffff' : '#ff99cc'));

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isPrayer ? 3.0 : 2.5;
      this.ctx.shadowColor = strokeColor;
      this.ctx.shadowBlur = isPrayer ? 16 : (isIgnored ? 12 : 8);

      HAND_CONNECTIONS.forEach(([start, end]) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        if (p1 && p2) {
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x * w, p1.y * h);
          this.ctx.lineTo(p2.x * w, p2.y * h);
          this.ctx.stroke();
        }
      });

      this.ctx.fillStyle = pointColor;
      landmarks.forEach((p, pIdx) => {
        this.ctx.beginPath();
        const radius = [4, 8, 12, 16, 20].includes(pIdx) ? 4.5 : 2.5;
        this.ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
        this.ctx.fill();
      });
    });
  }

  start(onResults) {
    this.onResultsCallback = onResults;

    const processFrame = () => {
      if (this.handLandmarker && this.video && this.video.readyState >= 2) {
        const nowInMs = performance.now();
        if (this.video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.video.currentTime;
          const results = this.handLandmarker.detectForVideo(this.video, nowInMs);

          if (results && results.landmarks) {
            this.drawSkeleton(results.landmarks);
            if (this.onResultsCallback) {
              this.onResultsCallback(results.landmarks);
            }
          }
        }
      }
      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }
}
