/**
 * JARVIS 3D SPATIAL DESKTOP 2.0
 * Modular Application Orchestrator
 */

import { SceneManager } from './src/scene-manager.js';
import { DesktopNodesManager, COLOR_SCHEME } from './src/desktop-nodes.js';
import { GestureEngine } from './src/gesture-engine.js';
import { HandTracker } from './src/hand-tracker.js';
import { playSciFiChirp } from './src/audio-synth.js';
import { markdownViewer } from './src/markdown-viewer.js';

// --------------------------------------------------------------------------
// 1. APPLICATION ORCHESTRATION & STATE
// --------------------------------------------------------------------------
const state = {
  activeHand: localStorage.getItem('jarvis_active_hand') || 'DX',
  fps: 0
};

// Instantiate Subsystem Managers
const canvasContainer = document.getElementById('canvas-container');
const sceneManager = new SceneManager(canvasContainer);
const nodesManager = new DesktopNodesManager(sceneManager.scene, sceneManager.camera);
const gestureEngine = new GestureEngine({ activeHand: state.activeHand });
const handTracker = new HandTracker(
  document.getElementById('webcam'),
  document.getElementById('webcam-skeleton-canvas')
);

// --------------------------------------------------------------------------
// 2. GESTURAL INTERACTION CONTROLLER
// --------------------------------------------------------------------------
let prayerFrameCount = 0;

function handleGestureInteractions(packet) {
  const gestureStatusElem = document.getElementById('gesture-status');
  const cursor = sceneManager.cursorMesh;
  const cursor2 = sceneManager.cursorMesh2;

  // =========================================================================
  // EXCLUSIVE DOCUMENT READER MODE:
  // When markdownViewer is open, ALL other 3D commands (interaction, hover,
  // grab, pinch, middle pinch, 2-hand zoom) are 100% BLOCKED.
  // ONLY TWO COMMANDS EXIST:
  // 1. Pointing UP / Pointing DOWN -> Smooth document scrolling
  // 2. Christian Prayer Gesture (Mani giunte a preghiera) -> Closes document
  // =========================================================================
  if (markdownViewer.isOpen) {
    if (nodesManager.isGrabbing && nodesManager.selectedNode) {
      nodesManager.isGrabbing = false;
      nodesManager.persistLayout();
      nodesManager.selectedNode = null;
    }
    nodesManager.clearHover();

    // Hide 3D spatial cursors so user focuses purely on document
    cursor.visible = false;
    cursor2.visible = false;

    // 1. Check for Christian Prayer Gesture (Mani Giunte a Preghiera)
    if (packet.isPrayer) {
      prayerFrameCount++;
      if (prayerFrameCount >= 2) {
        if (gestureStatusElem) {
          gestureStatusElem.textContent = 'GESTURE: PREGHIERA // CHIUSURA DOCUMENTO 🙏';
          gestureStatusElem.style.color = '#00ffcc';
          gestureStatusElem.style.textShadow = '0 0 10px #00ffcc';
        }
        playSciFiChirp(1300, 400, 0.28);
        markdownViewer.close();
        prayerFrameCount = 0;
      }
      return;
    } else {
      prayerFrameCount = 0;
    }

    // 2. Check for Pointing UP (Indicando in Su)
    if (packet.isPointUp) {
      const scrollSpeed = Math.round(15 * (packet.pointPitch || 1.0));
      markdownViewer.scrollBy(-scrollSpeed);
      if (gestureStatusElem) {
        gestureStatusElem.textContent = 'DOCUMENTO // INDICANDO SU [SCROLL ▲]';
        gestureStatusElem.style.color = 'var(--cyan-primary)';
        gestureStatusElem.style.textShadow = '0 0 8px var(--cyan-primary)';
      }
      return;
    }

    // 3. Check for Pointing DOWN (Indicando in Giù)
    if (packet.isPointDown) {
      const scrollSpeed = Math.round(15 * (packet.pointPitch || 1.0));
      markdownViewer.scrollBy(scrollSpeed);
      if (gestureStatusElem) {
        gestureStatusElem.textContent = 'DOCUMENTO // INDICANDO GIÙ [SCROLL ▼]';
        gestureStatusElem.style.color = 'var(--cyan-primary)';
        gestureStatusElem.style.textShadow = '0 0 8px var(--cyan-primary)';
      }
      return;
    }

    // 4. In-document idle state (NO other command permitted)
    if (gestureStatusElem) {
      gestureStatusElem.textContent = 'DOCUMENTO ATTIVO // INDICA SU ⬆ O GIÙ ⬇ • PREGHIERA 🙏 PER CHIUDERE';
      gestureStatusElem.style.color = '#88a0b8';
      gestureStatusElem.style.textShadow = 'none';
    }
    return;
  }

  if (!packet.hasHands || packet.isBackOfHand) {
    cursor.visible = false;
    cursor2.visible = false;

    if (nodesManager.isGrabbing && nodesManager.selectedNode) {
      nodesManager.isGrabbing = false;
      nodesManager.persistLayout();
      nodesManager.selectedNode = null;
    }

    if (gestureStatusElem) {
      gestureStatusElem.textContent = `GESTURE: SEARCHING [${state.activeHand}]`;
      gestureStatusElem.style.color = 'var(--cyan-primary)';
      gestureStatusElem.style.textShadow = '0 0 8px var(--cyan-primary)';
    }
    return;
  }

  // 1. SUPPRESSION OF NON-SELECTED GESTURES (Pinky only, Fist, Claw, Horns, etc.)
  if (packet.isAuthorized === false || packet.isFist || packet.isBunched) {
    if (nodesManager.isGrabbing && nodesManager.selectedNode) {
      nodesManager.isGrabbing = false;
      nodesManager.persistLayout();
      nodesManager.selectedNode = null;
    }

    nodesManager.clearHover();

    // Dim cursor indicating disengaged state
    cursor.visible = true;
    cursor.scale.setScalar(0.7);
    cursor.material.color.setHex(0x556677);
    cursor2.visible = false;

    if (gestureStatusElem) {
      gestureStatusElem.textContent = packet.statusText;
      gestureStatusElem.style.color = '#ffaa00';
      gestureStatusElem.style.textShadow = '0 0 8px #ffaa00';
    }
    return;
  }

  // 2. Restore active cursor styling
  const normalColor = state.activeHand === 'SX' ? COLOR_SCHEME.cursorSecondary : COLOR_SCHEME.cursorPrimary;
  cursor.material.color.setHex(normalColor);
  if (gestureStatusElem) {
    gestureStatusElem.style.color = 'var(--cyan-primary)';
    gestureStatusElem.style.textShadow = '0 0 8px var(--cyan-primary)';
  }

  // 3. Update 3D Cursor Position (High-Sensitivity LERP 0.72)
  const targetCursor3D = sceneManager.unprojectNDCTo3D(packet.primaryNDC);
  cursor.position.lerp(targetCursor3D, 0.72);
  cursor.visible = true;
  cursor.scale.setScalar(packet.isMiddlePinch ? 1.6 : (packet.isPinch ? 1.4 : 1.0));

  if (packet.secondaryNDC) {
    const targetCursor3D_2 = sceneManager.unprojectNDCTo3D(packet.secondaryNDC);
    cursor2.position.lerp(targetCursor3D_2, 0.72);
    cursor2.visible = true;
  } else {
    cursor2.visible = false;
  }

  // 4. Two-Hand Zoom
  if (packet.isZooming) {
    if (nodesManager.isGrabbing && nodesManager.selectedNode) {
      nodesManager.isGrabbing = false;
      nodesManager.persistLayout();
      nodesManager.selectedNode = null;
    }
    sceneManager.camera.position.z = Math.max(4, Math.min(30, sceneManager.camera.position.z - packet.zoomDelta * 18));
    if (gestureStatusElem) {
      gestureStatusElem.textContent = 'GESTURE: 2-HAND ZOOM';
    }
    return;
  }

  // 5. Target Node Detection & Hover
  const targetMesh = nodesManager.findTargetNode(packet.primaryNDC, cursor.position);
  nodesManager.setHoveredNode(targetMesh);

  // 6. Action: Open File (Middle Pinch)
  if (packet.isMiddlePinch) {
    const nodeToOpen = nodesManager.selectedNode || targetMesh;
    if (nodeToOpen && !nodesManager.openCooldown) {
      if (gestureStatusElem) {
        gestureStatusElem.textContent = `GESTURE: OPEN // ${nodeToOpen.userData.name.toUpperCase()} [${state.activeHand}]`;
      }
      nodesManager.launchFile(nodeToOpen, () => playSciFiChirp(900, 1800, 0.22));

      if (nodesManager.isGrabbing) {
        nodesManager.isGrabbing = false;
        nodesManager.selectedNode = null;
      }
      return;
    }
  }

  // 7. Action: Pick / Drag (Index Pinch)
  if (packet.isPinch) {
    if (!nodesManager.isGrabbing) {
      if (targetMesh) {
        nodesManager.selectedNode = targetMesh;
        nodesManager.isGrabbing = true;
        playSciFiChirp(600, 950, 0.08);
        if (gestureStatusElem) {
          gestureStatusElem.textContent = `GESTURE: PICK / GRABBED [${state.activeHand}]`;
        }
      }
    } else if (nodesManager.selectedNode) {
      nodesManager.selectedNode.position.lerp(cursor.position, 0.78);
      if (gestureStatusElem) {
        gestureStatusElem.textContent = `GESTURE: DRAGGING // ${nodesManager.selectedNode.userData.name} [${state.activeHand}]`;
      }
    }
  } else {
    // Release Pick
    if (nodesManager.isGrabbing && nodesManager.selectedNode) {
      nodesManager.isGrabbing = false;
      nodesManager.persistLayout();
      nodesManager.selectedNode = null;
      playSciFiChirp(800, 450, 0.08);
    }

    if (gestureStatusElem) {
      if (packet.isPistol) {
        cursor.scale.setScalar(1.25);
        if (targetMesh) {
          gestureStatusElem.textContent = `GESTURE: L-AIM // ${targetMesh.userData.name} [${state.activeHand}]`;
        } else {
          gestureStatusElem.textContent = `GESTURE: PISTOL / L-AIM [${state.activeHand}]`;
        }
      } else if (packet.isIndexPoint) {
        cursor.scale.setScalar(1.25);
        if (targetMesh) {
          gestureStatusElem.textContent = `GESTURE: POINT // ${targetMesh.userData.name} [${state.activeHand}]`;
        } else {
          gestureStatusElem.textContent = `GESTURE: POINT [${state.activeHand}]`;
        }
      } else {
        if (targetMesh) {
          gestureStatusElem.textContent = `GESTURE: HOVER // ${targetMesh.userData.name} [${state.activeHand}]`;
        } else {
          gestureStatusElem.textContent = `GESTURE: IDLE [${state.activeHand}]`;
        }
      }
    }
  }
}

// --------------------------------------------------------------------------
// 3. HAND SWITCHER (DX / SX)
// --------------------------------------------------------------------------
export function setActiveHand(hand, playSound = true) {
  state.activeHand = hand === 'SX' ? 'SX' : 'DX';
  localStorage.setItem('jarvis_active_hand', state.activeHand);
  gestureEngine.setActiveHand(state.activeHand);

  const btn = document.getElementById('hand-toggle-btn');
  const pillDx = document.getElementById('hand-pill-dx');
  const pillSx = document.getElementById('hand-pill-sx');
  const camTag = document.getElementById('webcam-hand-tag');

  if (btn && pillDx && pillSx) {
    if (state.activeHand === 'SX') {
      btn.classList.add('is-sx');
      pillDx.classList.remove('active');
      pillSx.classList.add('active');
      if (camTag) camTag.textContent = 'LEFT (SX)';
    } else {
      btn.classList.remove('is-sx');
      pillDx.classList.add('active');
      pillSx.classList.remove('active');
      if (camTag) camTag.textContent = 'RIGHT (DX)';
    }
  }

  if (playSound) {
    playSciFiChirp(state.activeHand === 'SX' ? 550 : 750, state.activeHand === 'SX' ? 950 : 1250, 0.12);
  }
}

export function toggleActiveHand() {
  const next = state.activeHand === 'DX' ? 'SX' : 'DX';
  setActiveHand(next, true);
}

const handBtn = document.getElementById('hand-toggle-btn');
if (handBtn) {
  handBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleActiveHand();
  });
}

const navBackBtn = document.getElementById('nav-back-btn');
if (navBackBtn) {
  navBackBtn.addEventListener('click', (e) => {
    e.preventDefault();
    nodesManager.navigateBack(() => playSciFiChirp(1200, 600, 0.18));
  });
}

export async function handleReset() {
  sceneManager.resetCamera();
  await nodesManager.resetAll(() => playSciFiChirp(400, 1400, 0.22));
}

const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleReset();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    toggleActiveHand();
  } else if (e.key === 'r' || e.key === 'R') {
    handleReset();
  } else if (e.key === 'Backspace' || e.key === 'Escape') {
    if (markdownViewer.isOpen) {
      markdownViewer.close();
    } else if (!nodesManager.isRootDesktop) {
      nodesManager.navigateBack(() => playSciFiChirp(1200, 600, 0.18));
    }
  }
});

// --------------------------------------------------------------------------
// 4. ANIMATION LOOP & TELEMETRY
// --------------------------------------------------------------------------
let frameCounter = 0;
let lastFpsUpdate = performance.now();

function animate() {
  requestAnimationFrame(animate);

  sceneManager.updateControls();
  nodesManager.updateLabels();

  frameCounter++;
  const now = performance.now();
  if (now - lastFpsUpdate >= 1000) {
    const fpsElem = document.getElementById('fps-counter');
    if (fpsElem) fpsElem.textContent = `FPS: ${frameCounter}`;
    frameCounter = 0;
    lastFpsUpdate = now;
  }

  sceneManager.render();
}

// --------------------------------------------------------------------------
// 5. BOOTSTRAP PIPELINE
// --------------------------------------------------------------------------
animate();
setActiveHand(state.activeHand, false);
markdownViewer.init();
nodesManager.init();

handTracker.init()
  .then(() => {
    handTracker.start((landmarksList) => {
      const packet = gestureEngine.process(landmarksList, nodesManager.isGrabbing);
      handleGestureInteractions(packet);
    });
  })
  .catch((err) => {
    console.error('[Jarvis] Hand tracker failed to initialize:', err);
  });
