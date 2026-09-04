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
    pinchThreshold: 0.05,
    tapCooldown: false
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
        
        // Use MediaPipe runtime with local WASM assets
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

// Hand Tracking Frame Loop
async function trackHands() {
    const video = document.getElementById('webcam');

    if (state.detector && video.readyState >= 2) {
        const hands = await state.detector.estimateHands(video);

        if (hands.length === 2) {
            // Multi-Hand Gestures: Zoom & Spatial Orbit Rotation
            const hand1Index = hands[0].keypoints.find((k) => k.name === 'index_finger_tip');
            const hand2Index = hands[1].keypoints.find((k) => k.name === 'index_finger_tip');

            if (hand1Index && hand2Index) {
                const dx = (hand1Index.x - hand2Index.x) / video.videoWidth;
                const dy = (hand1Index.y - hand2Index.y) / video.videoHeight;
                const currentDist = Math.sqrt(dx * dx + dy * dy);

                if (state.lastHandDist !== null) {
                    const distDelta = currentDist - state.lastHandDist;
                    // Zoom camera: Move hands apart to zoom in, close together to zoom out
                    camera.position.z = Math.max(3, Math.min(25, camera.position.z - distDelta * 18));
                }

                state.lastHandDist = currentDist;
                document.getElementById('gesture-status').textContent = 'GESTURE: 2-HAND ZOOM';
            }
        } else if (hands.length === 1) {
            state.lastHandDist = null;
            const keypoints = hands[0].keypoints;
            const indexTip = keypoints.find((k) => k.name === 'index_finger_tip');
            const thumbTip = keypoints.find((k) => k.name === 'thumb_tip');

            if (indexTip && thumbTip) {
                // Normalize screen coordinates from video dimension to NDC space (-1 to +1)
                const ndcX = -((indexTip.x / video.videoWidth) * 2 - 1); // Mirrored X mapping
                const ndcY = -((indexTip.y / video.videoHeight) * 2 - 1);

                // Map NDC space directly to 3D World space coordinates near camera target
                const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
                vector.unproject(camera);
                const dir = vector.sub(camera.position).normalize();
                const distance = -camera.position.z / dir.z;
                const targetPos = camera.position.clone().add(dir.multiplyScalar(distance));

                cursorMesh.position.copy(targetPos);

                // Pinch Detection: Euclidean distance in normalized coordinate space
                const dx = (indexTip.x - thumbTip.x) / video.videoWidth;
                const dy = (indexTip.y - thumbTip.y) / video.videoHeight;
                const pinchDist = Math.sqrt(dx * dx + dy * dy);

                processGestures(targetPos, pinchDist);
            }
        } else {
            state.lastHandDist = null;
            document.getElementById('gesture-status').textContent = 'GESTURE: SEARCHING';
        }
    }

    requestAnimationFrame(trackHands);
}

// Spatial Gesture Processing Logic
function processGestures(cursorPos, pinchDist) {
    const statusElem = document.getElementById('gesture-status');

    // Check ray intersection against active desktop nodes
    raycaster.setFromCamera(
        new THREE.Vector2(
            (cursorPos.x / window.innerWidth) * 2 - 1,
            -(cursorPos.y / window.innerHeight) * 2 + 1
        ),
        camera
    );

    const meshes = Array.from(state.nodes.values()).map((n) => n.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (pinchDist < state.pinchThreshold) {
        statusElem.textContent = 'GESTURE: PINCH/PICK';

        if (!state.isGrabbing) {
            if (intersects.length > 0) {
                state.selectedNode = intersects[0].object;
                state.isGrabbing = true;

                // Double Pinch / Air Tap Detection
                const now = Date.now();
                if (now - state.lastTapTime < 400 && !state.tapCooldown) {
                    triggerFileOpen(state.selectedNode.userData.path);
                    state.tapCooldown = true;
                    setTimeout(() => (state.tapCooldown = false), 1000);
                }
                state.lastTapTime = now;
            }
        } else if (state.selectedNode) {
            // Drag node along with active spatial hand cursor
            state.selectedNode.position.copy(cursorPos);
        }
    } else {
        statusElem.textContent = intersects.length > 0 ? 'GESTURE: HOVER' : 'GESTURE: IDLE';

        if (state.isGrabbing && state.selectedNode) {
            // Release Grab Action & Save Node Layout Position
            state.isGrabbing = false;
            saveCurrentLayout();
            state.selectedNode = null;
        }
    }
}

async function triggerFileOpen(path) {
    document.getElementById('status-indicator').textContent = 'LAUNCHING APPLICATION...';
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
