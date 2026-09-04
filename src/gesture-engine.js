/**
 * GestureEngine - Spatial Mathematics & Gesture Analysis Layer
 * Decouples raw computer vision landmarks from scene rendering.
 */

import { detectHandPosture } from './posture-detector.js';

export function normalizeToNDC(normX, normY, sensitivity = 1.35) {
  // Center is at (0.5, 0.5)
  // Mirror horizontal movement for natural selfie reflection
  // Invert Y to match Three.js NDC (-1 bottom, +1 top)
  const rawX = 1 - 2 * normX;
  const rawY = 1 - 2 * normY;

  // Sensitivity multiplier: allows full 3D desktop reach with comfortable, smaller hand movements
  const scaledX = Math.max(-1.15, Math.min(1.15, rawX * sensitivity));
  const scaledY = Math.max(-1.15, Math.min(1.15, rawY * sensitivity));

  return { x: scaledX, y: scaledY };
}

/**
 * Detects the Christian Prayer Gesture (Mani giunte a preghiera cristiana).
 * Requires:
 * 1. Two hands detected in the camera frame.
 * 2. Palms (Middle Knuckle MCP) touching or in close proximity.
 * 3. Fingertips (Middle & Index tips) touching or in close proximity.
 * 4. Wrists close together.
 * 5. Both hands oriented vertically with fingertips pointing upwards.
 */
export function detectPrayerGesture(landmarkList) {
  if (!landmarkList || landmarkList.length < 2) return false;

  const handA = landmarkList[0];
  const handB = landmarkList[1];
  if (!handA || !handB || handA.length < 21 || handB.length < 21) return false;

  const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Hand scales (Wrist 0 to Middle MCP 9 + Pinky MCP 17 to Index MCP 5)
  const scaleA = dist(handA[9], handA[0]) + dist(handA[17], handA[5]);
  const scaleB = dist(handB[9], handB[0]) + dist(handB[17], handB[5]);
  const avgScale = Math.max(0.04, (scaleA + scaleB) / 2);

  // Normalized distances between key landmarks of both hands
  const dWrists = dist(handA[0], handB[0]) / avgScale;
  const dMiddleMCP = dist(handA[9], handB[9]) / avgScale;
  const dMiddleTips = dist(handA[12], handB[12]) / avgScale;
  const dIndexTips = dist(handA[8], handB[8]) / avgScale;

  // Contact criteria: palms together, fingertips together, wrists near
  const areHandsJoined = (dMiddleMCP < 1.45) && (dMiddleTips < 1.45) && (dWrists < 1.95);
  if (!areHandsJoined) return false;

  // Upward orientation: in screen coordinates Y=0 is top, Y=1 is bottom
  // Fingertips must be significantly above wrists
  const isHandA_Up = handA[12].y < handA[0].y - 0.04;
  const isHandB_Up = handB[12].y < handB[0].y - 0.04;

  // Fingers extended upwards relative to knuckles
  const isHandA_Extended = (handA[12].y < handA[9].y) && (handA[8].y < handA[5].y);
  const isHandB_Extended = (handB[12].y < handB[9].y) && (handB[8].y < handB[5].y);

  return isHandA_Up && isHandB_Up && isHandA_Extended && isHandB_Extended;
}

/**
 * Detects vertical pointing direction (Indicando in Su o in Giù).
 * Analyzes the index finger extension and vertical orientation relative to other fingers.
 */
export function detectPointingDirection(hand) {
  if (!hand || hand.length < 21) return { isPointUp: false, isPointDown: false, pitch: 1.0 };

  const wrist = hand[0];
  const mcpIndex = hand[5];
  const pipIndex = hand[6];
  const tipIndex = hand[8];

  const mcpMiddle = hand[9];
  const tipMiddle = hand[12];
  const tipRing = hand[16];
  const tipPinky = hand[20];

  const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const handScale = Math.max(0.02, dist(mcpMiddle, wrist) + dist(hand[17], mcpIndex));

  // Index finger must be extended from wrist
  const isIndexExtended = dist(tipIndex, wrist) > dist(pipIndex, wrist) * 1.08;
  if (!isIndexExtended) {
    return { isPointUp: false, isPointDown: false, pitch: 1.0 };
  }

  // Vector from index MCP to index TIP
  const dx = tipIndex.x - mcpIndex.x;
  const dy = tipIndex.y - mcpIndex.y; // < 0 is UP, > 0 is DOWN

  // Must be predominantly vertical
  const isVertical = Math.abs(dy) > Math.abs(dx) * 0.8;
  if (!isVertical) {
    return { isPointUp: false, isPointDown: false, pitch: 1.0 };
  }

  // 1. POINTING UP (Indicando in Su):
  // Tip is above PIP, PIP is above MCP, and index tip is above middle, ring, pinky tips
  const isUpHierarchy = (tipIndex.y < pipIndex.y) && (pipIndex.y < mcpIndex.y);
  const isHighestFinger = (tipIndex.y < tipMiddle.y - 0.015) &&
                          (tipIndex.y < tipRing.y - 0.015) &&
                          (tipIndex.y < tipPinky.y - 0.015);

  if (dy < -0.04 && isUpHierarchy && isHighestFinger) {
    const pitch = Math.max(0.8, Math.min(2.5, Math.abs(dy) / (handScale * 0.45)));
    return { isPointUp: true, isPointDown: false, pitch };
  }

  // 2. POINTING DOWN (Indicando in Giù):
  // Tip is below PIP, PIP is below MCP, and index tip is below middle, ring, pinky tips
  const isDownHierarchy = (tipIndex.y > pipIndex.y) && (pipIndex.y > mcpIndex.y);
  const isLowestFinger = (tipIndex.y > tipMiddle.y + 0.015) &&
                         (tipIndex.y > tipRing.y + 0.015) &&
                         (tipIndex.y > tipPinky.y + 0.015);

  if (dy > 0.04 && isDownHierarchy && isLowestFinger) {
    const pitch = Math.max(0.8, Math.min(2.5, Math.abs(dy) / (handScale * 0.45)));
    return { isPointUp: false, isPointDown: true, pitch };
  }

  return { isPointUp: false, isPointDown: false, pitch: 1.0 };
}

export class GestureEngine {
  constructor(config = {}) {
    this.activeHand = config.activeHand || 'DX';
    this.lerpFactor = config.lerpFactor || 0.65; // Higher value (0.65) gives immediate, snappy tracking

    // Smoothed NDC state
    this.smoothedPrimaryNDC = { x: 0, y: 0 };
    this.smoothedSecondaryNDC = { x: 0, y: 0 };
    this.isHandVisible = false;

    // Two-hand zoom tracking state
    this.lastTwoHandDist = null;
  }

  setActiveHand(hand) {
    this.activeHand = hand === 'SX' ? 'SX' : 'DX';
  }

  process(landmarkList, isGrabbing = false) {
    if (!landmarkList || landmarkList.length === 0) {
      this.isHandVisible = false;
      this.lastTwoHandDist = null;
      return {
        hasHands: false,
        isPrayer: false,
        isPointUp: false,
        isPointDown: false,
        pointPitch: 1.0,
        statusText: `GESTURE: SEARCHING [${this.activeHand}]`
      };
    }

    // 0. CHRISTIAN PRAYER GESTURE DETECTION (Mani giunte a preghiera cristiana)
    const isPrayer = detectPrayerGesture(landmarkList);
    if (isPrayer) {
      this.lastTwoHandDist = null;
      return {
        hasHands: true,
        isPrayer: true,
        isPointUp: false,
        isPointDown: false,
        pointPitch: 1.0,
        isAuthorized: true,
        isBackOfHand: false,
        statusText: 'GESTURE: PREGHIERA [CHIUDI] 🙏',
        primaryNDC: { ...this.smoothedPrimaryNDC },
        secondaryNDC: null,
        isFist: false,
        isIndexPoint: false,
        isPistol: false,
        isOpenPalm: false,
        isBunched: false,
        isPinch: false,
        isMiddlePinch: false,
        isZooming: false,
        zoomDelta: 0
      };
    }

    // 1. Deterministic Hand Sorting (Foreground Priority & Left vs Right)
    let primaryHand = landmarkList[0];
    let secondaryHand = null;

    if (landmarkList.length >= 2) {
      const scaleA = Math.hypot(landmarkList[0][9].x - landmarkList[0][0].x, landmarkList[0][9].y - landmarkList[0][0].y);
      const scaleB = Math.hypot(landmarkList[1][9].x - landmarkList[1][0].x, landmarkList[1][9].y - landmarkList[1][0].y);
      const maxScale = Math.max(scaleA, scaleB);

      // If one hand is substantially behind in the background (scale < 0.60 * maxScale), reject the background hand
      const isA_Foreground = scaleA >= maxScale * 0.60;
      const isB_Foreground = scaleB >= maxScale * 0.60;

      if (isA_Foreground && !isB_Foreground) {
        primaryHand = landmarkList[0];
        secondaryHand = null;
      } else if (!isA_Foreground && isB_Foreground) {
        primaryHand = landmarkList[1];
        secondaryHand = null;
      } else {
        const wristA_X = landmarkList[0][0].x;
        const wristB_X = landmarkList[1][0].x;

        // In mirrored feed, smaller sensor X is physical RIGHT hand (DX)
        const rightHand = wristA_X < wristB_X ? landmarkList[0] : landmarkList[1];
        const leftHand = wristA_X < wristB_X ? landmarkList[1] : landmarkList[0];

        primaryHand = this.activeHand === 'DX' ? rightHand : leftHand;
        secondaryHand = this.activeHand === 'DX' ? leftHand : rightHand;
      }
    }

    const pIndex = primaryHand[8];
    const pThumb = primaryHand[4];

    if (!pIndex || !pThumb) {
      return { hasHands: false };
    }

    // 2. Primary Hand NDC Calculation with LERP Smoothing
    const rawNDC = normalizeToNDC(pIndex.x, pIndex.y);
    if (!this.isHandVisible) {
      this.smoothedPrimaryNDC.x = rawNDC.x;
      this.smoothedPrimaryNDC.y = rawNDC.y;
      this.isHandVisible = true;
    } else {
      this.smoothedPrimaryNDC.x += (rawNDC.x - this.smoothedPrimaryNDC.x) * this.lerpFactor;
      this.smoothedPrimaryNDC.y += (rawNDC.y - this.smoothedPrimaryNDC.y) * this.lerpFactor;
    }

    // Directional Pointing Detection (for document scrolling)
    const pointDir = detectPointingDirection(primaryHand);

    // 3. Posture Evaluation & Strict Whitelist Enforcement (checks orientation and authorized gestures)
    const posture = detectHandPosture(primaryHand, this.activeHand, isGrabbing);

    // STRICT RULE: Se la mano è posteriore (dorso/retro), NON deve essere mai rilevata!
    // Disattivazione istantanea totale (nessun cursore, nessun tracciamento)
    if (posture.isBackOfHand) {
      this.isHandVisible = false;
      this.lastTwoHandDist = null;
      return {
        hasHands: false,
        isBackOfHand: true,
        isAuthorized: false,
        isPrayer: false,
        isPointUp: false,
        isPointDown: false,
        pointPitch: 1.0,
        statusText: `GESTURE: SEARCHING [${this.activeHand}]`
      };
    }

    // If hand posture is NOT in the authorized whitelist (e.g. Pinky only, Fist, Claw, etc.)
    if (!posture.isAuthorized) {
      this.lastTwoHandDist = null;
      return {
        hasHands: true,
        primaryNDC: { ...this.smoothedPrimaryNDC },
        secondaryNDC: null,
        isAuthorized: false,
        isPrayer: false,
        isPointUp: pointDir.isPointUp,
        isPointDown: pointDir.isPointDown,
        pointPitch: pointDir.pitch || 1.0,
        unauthReason: posture.unauthReason,
        isFist: posture.isFist,
        isIndexPoint: posture.isIndexPoint,
        isPistol: false,
        isOpenPalm: false,
        isBunched: posture.isBunchedClaw,
        isPinch: false,
        isMiddlePinch: false,
        isZooming: false,
        zoomDelta: 0,
        statusText: `GESTURE: ${posture.unauthReason} (IGNORED) [${this.activeHand}]`
      };
    }

    // 4. Intentional Selected Gestures Evaluation (Scale-Invariant & High Sensitivity)
    // High-sensitivity hysteresis thresholds:
    // Triggers grab effortlessly at 0.50 * handScale; keeps holding securely up to 0.72 * handScale
    const grabThreshold = isGrabbing ? 0.72 : 0.50;

    // Middle Pinch (Launch/Open File): high-sensitivity trigger
    const isMiddlePinch = (posture.normThumbMiddle < 0.52) &&
                          (posture.normThumbIndex > 0.35) &&
                          !posture.isIndexPoint;

    // Pick / Drag: Index + Thumb pinch only, middle separated, not index-pointing
    const isPinch = !isMiddlePinch &&
                    (posture.normThumbIndex < grabThreshold) &&
                    (posture.normThumbMiddle > 0.30) &&
                    !posture.isIndexPoint;

    // 5. Secondary Hand Tracking (for 2-Hand Zoom)
    let isZooming = false;
    let zoomDelta = 0;
    let secondaryNDC = null;

    if (secondaryHand) {
      const secHandType = this.activeHand === 'DX' ? 'SX' : 'DX';
      const sPosture = detectHandPosture(secondaryHand, secHandType, false);
      const sIndex = secondaryHand[8];
      const sThumb = secondaryHand[4];

      // Secondary hand must be authorized AND not turned backwards
      if (sPosture.isAuthorized && !sPosture.isBackOfHand && sIndex && sThumb) {
        const rawS_NDC = normalizeToNDC(sIndex.x, sIndex.y);
        this.smoothedSecondaryNDC.x += (rawS_NDC.x - this.smoothedSecondaryNDC.x) * this.lerpFactor;
        this.smoothedSecondaryNDC.y += (rawS_NDC.y - this.smoothedSecondaryNDC.y) * this.lerpFactor;
        secondaryNDC = { ...this.smoothedSecondaryNDC };

        const sNormPinchDist = Math.hypot(sIndex.x - sThumb.x, sIndex.y - sThumb.y) / (sPosture.handScale || 0.1);
        const isSecPinch = sNormPinchDist < 0.55;

        if (isPinch && isSecPinch) {
          isZooming = true;
          const currentDist = Math.hypot(pIndex.x - sIndex.x, pIndex.y - sIndex.y);
          if (this.lastTwoHandDist !== null) {
            zoomDelta = currentDist - this.lastTwoHandDist;
          }
          this.lastTwoHandDist = currentDist;
        } else {
          this.lastTwoHandDist = null;
        }
      }
    } else {
      this.lastTwoHandDist = null;
    }

    let statusText = `GESTURE: IDLE [${this.activeHand}]`;
    if (isMiddlePinch) {
      statusText = `GESTURE: MIDDLE PINCH [${this.activeHand}]`;
    } else if (isPinch) {
      statusText = `GESTURE: PINCH / DRAG [${this.activeHand}]`;
    } else if (posture.isIndexPoint) {
      statusText = `GESTURE: POINT [${this.activeHand}]`;
    } else if (posture.isPistol) {
      statusText = `GESTURE: PISTOL / L-AIM [${this.activeHand}]`;
    } else if (posture.isOpenPalm) {
      statusText = `GESTURE: OPEN PALM [${this.activeHand}]`;
    }

    return {
      hasHands: true,
      primaryNDC: { ...this.smoothedPrimaryNDC },
      secondaryNDC: secondaryNDC,
      isAuthorized: true,
      isPrayer: false,
      isPointUp: pointDir.isPointUp,
      isPointDown: pointDir.isPointDown,
      pointPitch: pointDir.pitch || 1.0,
      isFist: false,
      isIndexPoint: posture.isIndexPoint,
      isPistol: posture.isPistol,
      isOpenPalm: posture.isOpenPalm,
      isBunched: false,
      isPinch: isPinch,
      isMiddlePinch: isMiddlePinch,
      isZooming: isZooming,
      zoomDelta: zoomDelta,
      statusText: statusText
    };
  }
}
