/**
 * Biomechanical Hand Posture Classifier (Strict Whitelist Architecture & Palm Orientation)
 * Only 4 gestures are permitted to interact with the system, AND the PALM MUST BE FACING THE CAMERA:
 * 1. OPEN PALM (All 4 fingers extended) -> Pointer
 * 2. PISTOL / L-AIM (Index + Thumb only, Middle+Ring+Pinky curled tight) -> Precision Laser Pointer
 * 3. PINCH (Index + Thumb in contact) -> Pick & Drag
 * 4. MIDDLE PINCH (Middle + Thumb in contact) -> Launch File
 *
 * If the hand is turned around (back of hand facing the camera / dorsum view), it is STRICTLY REJECTED.
 * Any other non-selected posture (V-Sign, 3 Fingers, Horns, Pinky only, Fist, Claw) is also rejected.
 *
 * MediaPipe Landmarks:
 * - 0: Wrist
 * - 4: Thumb Tip
 * - 5, 6, 7, 8: Index (MCP, PIP, DIP, TIP)
 * - 9, 10, 11, 12: Middle (MCP, PIP, DIP, TIP)
 * - 13, 14, 15, 16: Ring (MCP, PIP, DIP, TIP)
 * - 17, 18, 19, 20: Pinky (MCP, PIP, DIP, TIP)
 */

export function checkPalmOrientation(landmarks, activeHand = 'DX') {
  const w = landmarks[0];   // Wrist
  const m = landmarks[9];   // Middle MCP (center axis)
  const i = landmarks[5];   // Index MCP
  const p = landmarks[17];  // Pinky MCP

  // Vector along hand axis: Wrist -> Middle Knuckle
  const vMidX = m.x - w.x;
  const vMidY = m.y - w.y;
  const vMidZ = (m.z || 0) - (w.z || 0);

  // Vector across palm: Pinky Knuckle -> Index Knuckle (towards thumb)
  const vKnuckX = i.x - p.x;
  const vKnuckY = i.y - p.y;
  const vKnuckZ = (i.z || 0) - (p.z || 0);

  // 3D Palm Normal = vMid x vKnuck
  const nx = (vMidY * vKnuckZ) - (vMidZ * vKnuckY);
  const ny = (vMidZ * vKnuckX) - (vMidX * vKnuckZ);
  const nz = (vMidX * vKnuckY) - (vMidY * vKnuckX);

  const len = Math.hypot(nx, ny, nz) || 1;
  const normNz = nz / len;

  const isRightHand = (activeHand === 'DX');

  // In mirrored camera feed with Y pointing down:
  // For physical RIGHT hand (DX): Palm facing camera yields normNz > 0.08
  // For physical LEFT hand (SX): Palm facing camera yields normNz < -0.08
  const isPalmFacing = isRightHand ? (normNz > 0.08) : (normNz < -0.08);
  const isBackOfHand = isRightHand ? (normNz <= 0.08) : (normNz >= -0.08);

  return {
    isPalmFacing,
    isBackOfHand,
    normNz,
    cross2D: nz
  };
}

export function detectHandPosture(landmarks, activeHand = 'DX', isGrabbing = false) {
  if (!landmarks || landmarks.length < 21) {
    return {
      isAuthorized: false,
      unauthReason: 'NO_HAND',
      isBackOfHand: false,
      isFist: false,
      isIndexPoint: false,
      isPistol: false,
      isOpenPalm: false,
      isBunchedClaw: false,
      handScale: 0.1
    };
  }

  // 1. PALM ORIENTATION CHECK (Mano Girata / Dorsum View)
  // If the hand is turned around (showing the back of the hand), strictly reject and disengage!
  const orientation = checkPalmOrientation(landmarks, activeHand);
  if (orientation.isBackOfHand) {
    return {
      isAuthorized: false,
      unauthReason: 'BACK OF HAND',
      isBackOfHand: true,
      isFist: false,
      isIndexPoint: false,
      isPistol: false,
      isOpenPalm: false,
      isBunchedClaw: false,
      handScale: 0.1
    };
  }

  const wrist = landmarks[0];
  const dist = (i, j) => Math.hypot(landmarks[i].x - landmarks[j].x, landmarks[i].y - landmarks[j].y);

  // 2. ANATOMICAL HAND SCALE NORMALIZATION (Palm dimensions are invariant to distance)
  const dPalmLength = dist(9, 0); // Wrist to Middle Knuckle MCP
  const dPalmWidth = dist(17, 5); // Index Knuckle MCP to Pinky Knuckle MCP
  const handScale = Math.max(0.015, (dPalmLength + dPalmWidth) / 2);

  const normDist = (i, j) => dist(i, j) / handScale;

  // Tip to Wrist distances
  const dIndexWrist = dist(8, 0);
  const dMiddleWrist = dist(12, 0);
  const dRingWrist = dist(16, 0);
  const dPinkyWrist = dist(20, 0);

  // PIP (middle joint) to Wrist distances
  const dIndexPip = dist(6, 0);
  const dMiddlePip = dist(10, 0);
  const dRingPip = dist(14, 0);
  const dPinkyPip = dist(18, 0);

  // Normalized Tip to MCP (knuckle base) distances
  const normIndexMcp = normDist(8, 5);
  const normMiddleMcp = normDist(12, 9);
  const normRingMcp = normDist(16, 13);
  const normPinkyMcp = normDist(20, 17);

  // Individual finger curl evaluations
  const isIndexCurled = (dIndexWrist < dIndexPip * 1.05) || (normIndexMcp < 0.68);
  const isMiddleCurled = (dMiddleWrist < dMiddlePip * 1.05) || (normMiddleMcp < 0.68);
  const isRingCurled = (dRingWrist < dRingPip * 1.05) || (normRingMcp < 0.68);
  const isPinkyCurled = (dPinkyWrist < dPinkyPip * 1.05) || (normPinkyMcp < 0.68);

  const curledCount = (isIndexCurled ? 1 : 0) + (isMiddleCurled ? 1 : 0) + (isRingCurled ? 1 : 0) + (isPinkyCurled ? 1 : 0);

  // Individual finger extension evaluations
  const isIndexExtended = !isIndexCurled && (dIndexWrist > dIndexPip * 1.15) && (normIndexMcp > 0.80);
  const isMiddleExtended = !isMiddleCurled && (dMiddleWrist > dMiddlePip * 1.15) && (normMiddleMcp > 0.80);
  const isRingExtended = !isRingCurled && (dRingWrist > dRingPip * 1.15) && (normRingMcp > 0.80);
  const isPinkyExtended = !isPinkyCurled && (dPinkyWrist > dPinkyPip * 1.15) && (normPinkyMcp > 0.80);

  // Normalized thumb distances
  const normThumbIndex = normDist(4, 8);
  const normThumbMiddle = normDist(4, 12);
  const normThumbRing = normDist(4, 16);
  const normThumbWrist = normDist(4, 0);
  const isThumbExtended = (normThumbWrist > 0.85);

  // --------------------------------------------------------------------------
  // STRICT WHITELIST AUTHORIZATION
  // 1. PINCH (Index + Thumb Pick & Drag)
  // 2. POINT (Classic Index Pointing - Index only, other 3 curled)
  // 3. MIDDLE PINCH (Middle + Thumb Open File - Middle must NOT be curled in palm)
  // 4. PISTOL / L-AIM (Index + Thumb extended, other 3 curled)
  // 5. OPEN PALM (All 4 fingers extended)
  // --------------------------------------------------------------------------

  // 1. PINCH (Index + Thumb Pick & Drag) - High Sensitivity with grab hysteresis
  const pinchThreshold = isGrabbing ? 0.72 : 0.55;
  const isPinchPosture = (normThumbIndex < pinchThreshold) && (normThumbMiddle > 0.30);

  // 2. POINT / SOLO INDICE ALZATO (Classic Index Finger Pointer)
  // Index extended straight up, Middle + Ring + Pinky curled tight into fist, Index far from thumb
  const isIndexPoint = isIndexExtended && isMiddleCurled && isRingCurled && isPinkyCurled && (normThumbIndex > 0.55);

  // 3. MIDDLE PINCH (Middle + Thumb Open/Launch File) - High Sensitivity
  // Requires: Thumb and Middle fingertips in close contact, Index not pinching, and not an index point gesture
  const isMiddlePinchPosture = (normThumbMiddle < 0.52) &&
                               (normThumbIndex > 0.35) &&
                               !isIndexPoint;

  // 4. PISTOL / L-AIM (Laser Pointer)
  // Requires: Index extended, Thumb extended, and ALL THREE other fingers (Middle, Ring, Pinky) CURLED!
  const isPistol = isIndexExtended && isThumbExtended && (normThumbIndex > 0.70) &&
                   isMiddleCurled && isRingCurled && isPinkyCurled;

  // 5. OPEN PALM (Natural Broad Pointer)
  // Requires: ALL 4 main fingers (Index, Middle, Ring, Pinky) extended!
  const isOpenPalm = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;

  // Whitelist evaluation
  const isAuthorized = isPinchPosture || isMiddlePinchPosture || isIndexPoint || isPistol || isOpenPalm;

  // Descriptive Telemetry for Non-Authorized Postures
  const isFist = (curledCount === 4) || (isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled);
  const isBunchedClaw = (normThumbIndex < 0.45 && normThumbMiddle < 0.45 && normThumbRing < 0.60);

  let unauthReason = 'UNRECOGNIZED';
  if (isFist) {
    unauthReason = 'FIST';
  } else if (isBunchedClaw) {
    unauthReason = 'CLAW / BUNCHED';
  } else if (isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled) {
    unauthReason = 'PEACE / V-SIGN';
  } else if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyCurled) {
    unauthReason = '3-FINGERS';
  } else if (isIndexExtended && isPinkyExtended && isMiddleCurled && isRingCurled) {
    unauthReason = 'HORNS / ROCK';
  } else if (!isIndexExtended && isPinkyExtended && isMiddleCurled && isRingCurled) {
    unauthReason = 'PINKY ONLY';
  } else if (!isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled) {
    unauthReason = 'MIDDLE ONLY';
  } else if (!isIndexExtended && isThumbExtended && isPinkyExtended && isMiddleCurled && isRingCurled) {
    unauthReason = 'HANG LOOSE';
  }

  return {
    isAuthorized,
    unauthReason,
    isBackOfHand: false,
    isFist,
    isIndexPoint,
    isPistol,
    isOpenPalm,
    isPinchPosture,
    isMiddlePinchPosture,
    isBunchedClaw,
    curledCount,
    isIndexCurled,
    isMiddleCurled,
    isRingCurled,
    isPinkyCurled,
    normMiddleMcp,
    normThumbWrist,
    handScale,
    normThumbIndex,
    normThumbMiddle,
    normThumbRing
  };
}
