/**
 * SceneManager - Three.js WebGL & Holographic Post-Processing Layer
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class SceneManager {
  constructor(containerElement) {
    this.container = containerElement;

    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030712, 0.025);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 12);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls for mouse/keyboard navigation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 35;
    this.controls.minDistance = 3;

    // Holographic Post-Processing (UnrealBloomPass)
    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.15, // Intensity
      0.45, // Radius
      0.80  // Luminance threshold
    );

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(bloomPass);

    // 3D Spatial Interaction Plane & Raycasting math
    this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.tempRay = new THREE.Ray();
    this.tempTarget = new THREE.Vector3();

    // 3D Cursors
    this.cursorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true })
    );
    this.cursorMesh.visible = false;
    this.scene.add(this.cursorMesh);

    this.cursorMesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0077, wireframe: true })
    );
    this.cursorMesh2.visible = false;
    this.scene.add(this.cursorMesh2);

    // Build environment and setup events
    this.setupEnvironment();
    this.setupResizeListener();
  }

  setupEnvironment() {
    // Cyber-Grid
    const gridHelper = new THREE.GridHelper(40, 40, 0x00f3ff, 0x051923);
    gridHelper.position.y = -6;
    this.scene.add(gridHelper);

    // Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00f3ff, 2.5, 60);
    pointLight.position.set(0, 10, 12);
    this.scene.add(pointLight);

    // Floating particles
    const particleCount = 600;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 50;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.035,
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.35
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);
  }

  unprojectNDCTo3D(ndc) {
    this.tempRay.origin.copy(this.camera.position);
    this.tempTarget.set(ndc.x, ndc.y, 0.5).unproject(this.camera);
    this.tempRay.direction.copy(this.tempTarget).sub(this.camera.position).normalize();

    const hit = this.tempRay.intersectPlane(this.interactionPlane, this.tempTarget);
    if (hit) {
      return this.tempTarget.clone();
    }
    return this.camera.position.clone().add(this.tempRay.direction.multiplyScalar(12));
  }

  setupResizeListener() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);
    });
  }

  resetCamera() {
    this.camera.position.set(0, 0, 12);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  updateControls() {
    this.controls.update();
  }

  render() {
    this.composer.render();
  }
}
