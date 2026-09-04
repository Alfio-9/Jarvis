import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const handPoseDetection = window.handPoseDetection;

// State Management
const state = {
    items: [],
    layout: {},
    nodes: new Map(),
    selectedNode: null,
    isGrabbing: false,
    detector: null,
    lastTapTime: 0,
    pinchThreshold: 0.08,
    tapCooldown: false,
    activeHand: localStorage.getItem('jarvis_active_hand') || 'DX',
    lastHandDist: null
};

// Color Schematics
const COLOR_SCHEME = {
    folder: 0x00aaff,
    executable: 0x00ff66,
    document: 0xffaa00,
    cursor: 0xff0055
};

// Scene Initialization
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030712, 0.03);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Raycasting & Hand Cursor Setup
const raycaster = new THREE.Raycaster();
const cursorMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: COLOR_SCHEME.cursor, wireframe: true })
);
scene.add(cursorMesh);

const cursorMesh2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true })
);
cursorMesh2.visible = false;
scene.add(cursorMesh2);

// Environment Setup
function setupEnvironment() {
    const gridHelper = new THREE.GridHelper(30, 30, 0x00f3ff, 0x051923);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00f3ff, 2, 50);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    // Background Particles
    const particleGeo = new THREE.BufferGeometry();
    const count = 500;
    const posArray = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 40;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({ size: 0.03, color: 0x00f3ff, transparent: true, opacity: 0.3 });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
}

// Node Creation Logic
function createNodeMesh(type) {
    let geometry;
    if (type === 'folder') {
        geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    } else if (type === 'executable') {
        geometry = new THREE.OctahedronGeometry(0.6);
    } else {
        geometry = new THREE.TetrahedronGeometry(0.6);
    }

    const material = new THREE.MeshPhongMaterial({
        color: COLOR_SCHEME[type] || COLOR_SCHEME.document,
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });

    return new THREE.Mesh(geometry, material);
}

function createDOMLabel(name) {
    const elem = document.createElement('div');
    elem.className = 'node-label';
    elem.textContent = name;
    document.body.appendChild(elem);
    return elem;
}

function projectTo2D(position, camera) {
    const vector = position.clone().project(camera);
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
    return { x, y };
}

// Populate Desktop Scene
async function initDesktop() {
    state.layout = await window.jarvisAPI.loadLayout();
    state.items = await window.jarvisAPI.getDesktopItems();

    const cols = Math.ceil(Math.sqrt(state.items.length));
    const spacing = 2.0;

    state.items.forEach((item, index) => {
        const mesh = createNodeMesh(item.type);

        // Check for existing layout position
        if (state.layout[item.path]) {
            const pos = state.layout[item.path];
            mesh.position.set(pos.x, pos.y, pos.z);
        } else {
            const row = Math.floor(index / cols);
            const col = index % cols;
            mesh.position.set((col - cols / 2) * spacing, (row - cols / 2) * -spacing, 0);
        }

        mesh.userData = { ...item };
        scene.add(mesh);

        const labelElem = createDOMLabel(item.name);
        state.nodes.set(mesh.uuid, { mesh, labelElem, item });
    });
}

// TensorFlow.js Computer Vision Setup
async function initHandTracking() {
    const video = document.getElementById('webcam');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        video.srcObject = stream;
        await new Promise((resolve) => (video.onloadedmetadata = resolve));

        const model = handPoseDetection.SupportedModels.MediaPipeHands;

        // Use MediaPipe runtime with local WASM assets (maxHands: 2 to support hand switching)
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: './node_modules/@mediapipe/hands',
            modelType: 'full',
            maxHands: 2
        };

        state.detector = await handPoseDetection.createDetector(model, detectorConfig);
        document.getElementById('status-indicator').textContent = 'SYSTEM ONLINE // TRACKING ACTIVE';
        trackHands();
    } catch (err) {
        console.error('Webcam / Handtracking initialization failed:', err);
        document.getElementById('status-indicator').textContent = 'ERROR: ' + (err.message || 'FALLBACK TO MOUSE');
    }
}

// Sci-Fi Audio Feedback Synthesizer (Web Audio API)
function playSciFiFeedback(freqStart = 700, freqEnd = 1200, duration = 0.12) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    } catch (e) {
        // Safe fallback
    }
}

// Hand Switcher Controller
export function setActiveHand(hand, playSound = true) {
    state.activeHand = hand;
    try {
        localStorage.setItem('jarvis_active_hand', hand);
    } catch (e) { }

    const btn = document.getElementById('hand-toggle-btn');
    const pillDx = document.getElementById('hand-pill-dx');
    const pillSx = document.getElementById('hand-pill-sx');
    const camTag = document.getElementById('webcam-hand-tag');

    if (btn && pillDx && pillSx) {
        if (hand === 'SX') {
            btn.classList.add('is-sx');
            pillDx.classList.remove('active');
            pillSx.classList.add('active');
            if (camTag) camTag.textContent = 'MANO SX';
        } else {
            btn.classList.remove('is-sx');
            pillDx.classList.add('active');
            pillSx.classList.remove('active');
            if (camTag) camTag.textContent = 'MANO DX';
        }
    }

    if (cursorMesh && cursorMesh.material) {
        cursorMesh.material.color.setHex(hand === 'SX' ? 0xff0077 : 0x00f3ff);
    }
    if (cursorMesh2 && cursorMesh2.material) {
        cursorMesh2.material.color.setHex(hand === 'SX' ? 0x00f3ff : 0xff0077);
    }

    if (playSound) {
        if (hand === 'SX') {
            playSciFiFeedback(500, 950, 0.12);
        } else {
            playSciFiFeedback(700, 1200, 0.12);
        }
    }

    // Floating HUD status pulse
    const statusElem = document.getElementById('status-indicator');
    if (statusElem) {
        const prevText = statusElem.textContent;
        statusElem.textContent = `MANO ATTIVA: ${hand === 'DX' ? 'DESTRA (DX)' : 'SINISTRA (SX)'}`;
        statusElem.style.borderColor = hand === 'SX' ? '#ff0077' : '#00f3ff';
        statusElem.style.color = hand === 'SX' ? '#ff0077' : '#00f3ff';

        setTimeout(() => {
            if (statusElem.textContent.startsWith('MANO ATTIVA:')) {
                statusElem.textContent = prevText.startsWith('MANO ATTIVA:') ? 'SYSTEM ONLINE // TRACKING ACTIVE' : prevText;
                statusElem.style.borderColor = '#00f3ff';
                statusElem.style.color = '#00f3ff';
            }
        }, 1500);
    }
}

export function toggleActiveHand() {
    const nextHand = state.activeHand === 'DX' ? 'SX' : 'DX';
    setActiveHand(nextHand, true);
}

// Hand Tracking Frame Loop
async function trackHands() {
    const video = document.getElementById('webcam');

    if (state.detector && video.readyState >= 2) {
        const hands = await state.detector.estimateHands(video);

        if (hands && hands.length >= 2) {
            // Render 2 Hand Cursors
            cursorMesh.visible = true;
            cursorMesh2.visible = true;

            // In mirrored selfie camera coordinate space:
            // MediaPipe labels physical Right hand as 'Left', physical Left hand as 'Right'.
            const targetModelHandedness = state.activeHand === 'DX' ? 'left' : 'right';
            const primaryHand = hands.find((h) => h.handedness && h.handedness.toLowerCase() === targetModelHandedness) || hands[0];
            const secondaryHand = hands.find((h) => h !== primaryHand) || hands[1];

            const hand1Index = primaryHand.keypoints.find((k) => k.name === 'index_finger_tip');
            const hand2Index = secondaryHand.keypoints.find((k) => k.name === 'index_finger_tip');
            const hand1Thumb = primaryHand.keypoints.find((k) => k.name === 'thumb_tip');
            const hand2Thumb = secondaryHand.keypoints.find((k) => k.name === 'thumb_tip');
            const hand1Middle = primaryHand.keypoints.find((k) => k.name === 'middle_finger_tip');
            const hand2Middle = secondaryHand.keypoints.find((k) => k.name === 'middle_finger_tip');

            if (hand1Index && hand2Index) {
                // Hand 1 Cursor (Primary / Active Hand)
                const ndcX1 = -((hand1Index.x / video.videoWidth) * 2 - 1);
                const ndcY1 = -((hand1Index.y / video.videoHeight) * 2 - 1);
                const vec1 = new THREE.Vector3(ndcX1, ndcY1, 0.5).unproject(camera);
                const dir1 = vec1.sub(camera.position).normalize();
                const dist1 = -camera.position.z / dir1.z;
                const targetPos1 = camera.position.clone().add(dir1.multiplyScalar(dist1));
                cursorMesh.position.copy(targetPos1);

                // Hand 2 Cursor (Secondary Hand)
                const ndcX2 = -((hand2Index.x / video.videoWidth) * 2 - 1);
                const ndcY2 = -((hand2Index.y / video.videoHeight) * 2 - 1);
                const vec2 = new THREE.Vector3(ndcX2, ndcY2, 0.5).unproject(camera);
                const dir2 = vec2.sub(camera.position).normalize();
                const dist2 = -camera.position.z / dir2.z;
                const targetPos2 = camera.position.clone().add(dir2.multiplyScalar(dist2));
                cursorMesh2.position.copy(targetPos2);

                // Compute pinch / pick distance (index + thumb) for both hands
                let isHand1Pinching = false;
                let pinchDist1 = 1.0;
                if (hand1Thumb) {
                    const dx1 = (hand1Index.x - hand1Thumb.x) / video.videoWidth;
                    const dy1 = (hand1Index.y - hand1Thumb.y) / video.videoHeight;
                    pinchDist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                    isHand1Pinching = pinchDist1 < state.pinchThreshold;
                }

                let isHand2Pinching = false;
                let pinchDist2 = 1.0;
                if (hand2Thumb) {
                    const dx2 = (hand2Index.x - hand2Thumb.x) / video.videoWidth;
                    const dy2 = (hand2Index.y - hand2Thumb.y) / video.videoHeight;
                    pinchDist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    isHand2Pinching = pinchDist2 < state.pinchThreshold;
                }

                // Compute middle pinch (middle + thumb) for primary active hand
                let isHand1MiddlePinch = false;
                let middlePinchDist1 = 1.0;
                if (hand1Thumb && hand1Middle) {
                    const dxM1 = (hand1Middle.x - hand1Thumb.x) / video.videoWidth;
                    const dyM1 = (hand1Middle.y - hand1Thumb.y) / video.videoHeight;
                    middlePinchDist1 = Math.sqrt(dxM1 * dxM1 + dyM1 * dyM1);
                    isHand1MiddlePinch = middlePinchDist1 < state.pinchThreshold;
                }

                cursorMesh.scale.setScalar(isHand1MiddlePinch ? 1.6 : (isHand1Pinching ? 1.4 : 1.0));
                cursorMesh2.scale.setScalar(isHand2Pinching ? 1.4 : 1.0);

                // Lo zoom e de-zoom viene effettuato SOLO se entrambe le mani sono visibili E in pick (pinch)
                if (isHand1Pinching && isHand2Pinching) {
                    if (state.isGrabbing && state.selectedNode) {
                        state.isGrabbing = false;
                        saveCurrentLayout();
                        state.selectedNode = null;
                    }

                    const dx = (hand1Index.x - hand2Index.x) / video.videoWidth;
                    const dy = (hand1Index.y - hand2Index.y) / video.videoHeight;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);

                    if (state.lastHandDist !== null) {
                        const distDelta = currentDist - state.lastHandDist;
                        camera.position.z = Math.max(3, Math.min(25, camera.position.z - distDelta * 18));
                    }

                    state.lastHandDist = currentDist;
                    document.getElementById('gesture-status').textContent = 'GESTURE: 2-HAND ZOOM (PICK)';
                } else {
                    // Reset distanza se una o entrambe le mani rilasciano il pick
                    state.lastHandDist = null;

                    // Interazione con la mano attiva primaria (include middle pinch per apertura)
                    const ndcVec1 = new THREE.Vector2(ndcX1, ndcY1);
                    processGestures(targetPos1, pinchDist1, ndcVec1, middlePinchDist1);
                }
            }
        } else if (hands && hands.length === 1) {
            cursorMesh.visible = true;
            cursorMesh2.visible = false;
            cursorMesh2.scale.setScalar(1.0);
            state.lastHandDist = null;

            const keypoints = hands[0].keypoints;
            const indexTip = keypoints.find((k) => k.name === 'index_finger_tip');
            const thumbTip = keypoints.find((k) => k.name === 'thumb_tip');
            const middleTip = keypoints.find((k) => k.name === 'middle_finger_tip');

            if (indexTip && thumbTip) {
                const ndcX = -((indexTip.x / video.videoWidth) * 2 - 1);
                const ndcY = -((indexTip.y / video.videoHeight) * 2 - 1);

                const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
                vector.unproject(camera);
                const dir = vector.sub(camera.position).normalize();
                const distance = -camera.position.z / dir.z;
                const targetPos = camera.position.clone().add(dir.multiplyScalar(distance));

                cursorMesh.position.copy(targetPos);

                // Index + Thumb pinch (Pick / Drag)
                const dx = (indexTip.x - thumbTip.x) / video.videoWidth;
                const dy = (indexTip.y - thumbTip.y) / video.videoHeight;
                const pinchDist = Math.sqrt(dx * dx + dy * dy);

                // Middle + Thumb pinch (Open Folder / File)
                let middlePinchDist = 1.0;
                if (middleTip) {
                    const dxM = (middleTip.x - thumbTip.x) / video.videoWidth;
                    const dyM = (middleTip.y - thumbTip.y) / video.videoHeight;
                    middlePinchDist = Math.sqrt(dxM * dxM + dyM * dyM);
                }

                const isMiddlePinch = middlePinchDist < state.pinchThreshold;
                cursorMesh.scale.setScalar(isMiddlePinch ? 1.6 : (pinchDist < state.pinchThreshold ? 1.4 : 1.0));

                const ndcVec = new THREE.Vector2(ndcX, ndcY);
                processGestures(targetPos, pinchDist, ndcVec, middlePinchDist);
            }
        } else {
            cursorMesh.visible = false;
            cursorMesh2.visible = false;
            cursorMesh.scale.setScalar(1.0);
            cursorMesh2.scale.setScalar(1.0);
            state.lastHandDist = null;
            document.getElementById('gesture-status').textContent = `GESTURE: SEARCHING [${state.activeHand}]`;

            // Safety: release grab if hand is lost mid-drag
            if (state.isGrabbing && state.selectedNode) {
                state.isGrabbing = false;
                saveCurrentLayout();
                state.selectedNode = null;
            }
        }
    }

    requestAnimationFrame(trackHands);
}

// Spatial Gesture Processing Logic
function processGestures(cursorPos, pinchDist, ndcVec, middlePinchDist = 1.0) {
    const statusElem = document.getElementById('gesture-status');

    // Check ray intersection against active desktop nodes using true NDC coordinates
    raycaster.setFromCamera(ndcVec, camera);

    const meshes = Array.from(state.nodes.values()).map((n) => n.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    // Find intersected node or nearest node to hand cursor
    let targetMesh = null;
    if (intersects.length > 0) {
        targetMesh = intersects[0].object;
    } else {
        // Proximity check fallback: pick node within 1.5 units of cursor
        for (const mesh of meshes) {
            if (mesh.position.distanceTo(cursorPos) < 1.5) {
                targetMesh = mesh;
                break;
            }
        }
    }

    // Apertura Cartella / File: Gesture POLLICE + MEDIO (Middle Finger Pinch)
    const isMiddlePinch = middlePinchDist < state.pinchThreshold;
    if (isMiddlePinch) {
        const nodeToOpen = state.selectedNode || targetMesh;
        if (nodeToOpen && !state.tapCooldown) {
            state.tapCooldown = true;
            statusElem.textContent = `GESTURE: OPEN // ${nodeToOpen.userData.name.toUpperCase()} [${state.activeHand}]`;
            playSciFiFeedback(900, 1800, 0.25);
            triggerFileOpen(nodeToOpen.userData.path, nodeToOpen.userData.type);

            if (state.isGrabbing) {
                state.isGrabbing = false;
                state.selectedNode = null;
            }

            setTimeout(() => (state.tapCooldown = false), 1200);
            return;
        } else if (!nodeToOpen) {
            statusElem.textContent = `GESTURE: MIDDLE PINCH (NO TARGET) [${state.activeHand}]`;
            return;
        }
    }

    // Pick / Drag: Gesture POLLICE + INDICE (Index Finger Pinch)
    if (pinchDist < state.pinchThreshold) {
        if (!state.isGrabbing) {
            if (targetMesh) {
                state.selectedNode = targetMesh;
                state.isGrabbing = true;
                statusElem.textContent = `GESTURE: PICK / GRABBED [${state.activeHand}]`;
            }
        } else if (state.selectedNode) {
            statusElem.textContent = `GESTURE: DRAGGING NODE [${state.activeHand}]`;
            // Drag node along with active spatial hand cursor
            state.selectedNode.position.copy(cursorPos);
        }
    } else {
        if (intersects.length > 0) {
            statusElem.textContent = `GESTURE: HOVER (${intersects[0].object.userData.name}) [${state.activeHand}]`;
        } else {
            statusElem.textContent = `GESTURE: IDLE [${state.activeHand}]`;
        }

        if (state.isGrabbing && state.selectedNode) {
            // Release Grab Action & Save Node Layout Position
            state.isGrabbing = false;
            saveCurrentLayout();
            state.selectedNode = null;
        }
    }
}

async function triggerFileOpen(path, type = 'folder') {
    const label = type === 'folder' ? 'OPENING FOLDER...' : 'LAUNCHING APPLICATION...';
    document.getElementById('status-indicator').textContent = label;
    await window.jarvisAPI.openFile(path);
    setTimeout(() => {
        document.getElementById('status-indicator').textContent = 'SYSTEM ONLINE // TRACKING ACTIVE';
    }, 2000);
}

function saveCurrentLayout() {
    const layoutData = {};
    state.nodes.forEach(({ mesh, item }) => {
        layoutData[item.path] = {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z
        };
    });
    window.jarvisAPI.saveLayout(layoutData);
}

// Window Resize Adjustments
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop
let frameCount = 0;
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    // Pulse glowing nodes
    const time = Date.now() * 0.002;
    state.nodes.forEach(({ mesh, labelElem }) => {
        mesh.rotation.y += 0.01;
        mesh.rotation.x += 0.005;

        // Update floating HTML labels
        const pos2D = projectTo2D(mesh.position, camera);
        labelElem.style.left = `${pos2D.x}px`;
        labelElem.style.top = `${pos2D.y - 20}px`;
    });

    // FPS calculation
    frameCount++;
    const currentTime = performance.now();
    if (currentTime - lastTime >= 1000) {
        document.getElementById('fps-counter').textContent = `FPS: ${frameCount}`;
        frameCount = 0;
        lastTime = currentTime;
    }

    renderer.render(scene, camera);
}

// App Initialization Sequence
setupEnvironment();
initDesktop()
    .catch((err) => console.error("Desktop items load failed:", err))
    .finally(() => {
        initHandTracking();
        animate();
    });

// Event Listeners for Hand Switcher
const handToggleBtn = document.getElementById('hand-toggle-btn');
if (handToggleBtn) {
    handToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleActiveHand();
    });
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        toggleActiveHand();
    }
});

// Initialize UI with persistent active hand
setActiveHand(state.activeHand, false);

window.setActiveHand = setActiveHand;
window.toggleActiveHand = toggleActiveHand;
