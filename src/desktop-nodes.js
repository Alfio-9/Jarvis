/**
 * DesktopNodesManager - 3D Holographic Spatial Desktop & Folder Explorer
 * Supports hierarchical subfolder navigation, scene clearing, and back navigation.
 */

import * as THREE from 'three';
import { markdownViewer } from './markdown-viewer.js';

export const COLOR_SCHEME = {
  folder: 0x00aaff,
  executable: 0x00ff66,
  document: 0xffaa00,
  markdown: 0x00f3ff,
  back: 0xff0077,
  cursorPrimary: 0x00f3ff,
  cursorSecondary: 0xff0077
};

export function createNodeMesh(type, extension = '') {
  let geometry;
  const ext = (extension || '').toLowerCase();
  const isMd = ext === '.md' || ext === '.markdown';

  if (type === 'folder') {
    geometry = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  } else if (type === 'executable') {
    geometry = new THREE.OctahedronGeometry(0.65);
  } else if (type === 'back') {
    // Holographic Torus Portal for Back Navigation
    geometry = new THREE.TorusGeometry(0.55, 0.16, 12, 28);
  } else if (isMd) {
    // Holographic Dodecahedron for Markdown Document Capsule
    geometry = new THREE.DodecahedronGeometry(0.65);
  } else {
    geometry = new THREE.TetrahedronGeometry(0.65);
  }

  const color = isMd ? COLOR_SCHEME.markdown : (COLOR_SCHEME[type] || COLOR_SCHEME.document);

  const material = new THREE.MeshPhongMaterial({
    color: color,
    wireframe: true,
    transparent: true,
    opacity: 0.88,
    shininess: 120
  });

  return new THREE.Mesh(geometry, material);
}

export function createFloatingLabel(name, type = 'document', extension = '') {
  const container = document.getElementById('labels-container') || document.body;
  const elem = document.createElement('div');
  const ext = (extension || '').toLowerCase();
  const isMd = ext === '.md' || ext === '.markdown';

  elem.className = `node-label type-${type}${isMd ? ' type-markdown' : ''}`;

  let icon = type === 'folder' ? '📁' : (type === 'executable' ? '⚡' : (type === 'back' ? '⮌' : '📄'));
  if (isMd) icon = '📝';
  elem.innerHTML = `<span class="label-icon">${icon}</span><span class="label-text">${name}</span>`;

  container.appendChild(elem);
  return elem;
}

export function project3DTo2D(position3D, camera) {
  const vector = position3D.clone().project(camera);
  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
  return { x, y, visible: vector.z < 1 };
}

export class DesktopNodesManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.nodes = new Map(); // uuid -> { mesh, labelElem, item }
    this.layout = {};
    this.items = [];
    this.history = []; // Navigation path stack for "Torna Indietro"
    this.currentFolder = null;
    this.currentFolderName = 'DESKTOP';
    this.isRootDesktop = true;
    this.hoveredNode = null;
    this.selectedNode = null;
    this.isGrabbing = false;
    this.openCooldown = false;
    this.raycaster = new THREE.Raycaster();
  }

  async init() {
    try {
      if (!window.jarvisAPI) return;
      this.layout = (await window.jarvisAPI.loadLayout()) || {};
      await this.loadFolder(null, false);
    } catch (err) {
      console.error('[Jarvis] Failed to initialize desktop nodes:', err);
    }
  }

  clearNodes() {
    this.nodes.forEach(({ mesh, labelElem }) => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      if (labelElem && labelElem.parentNode) {
        labelElem.remove();
      }
    });
    this.nodes.clear();
    const container = document.getElementById('labels-container');
    if (container) {
      container.innerHTML = '';
    }
    this.hoveredNode = null;
    this.selectedNode = null;
    this.isGrabbing = false;
  }

  async loadFolder(targetFolderPath, isBackNav = false) {
    const statusElem = document.getElementById('status-indicator');
    const navElem = document.getElementById('hud-nav');
    const breadcrumbElem = document.getElementById('hud-breadcrumb-path');

    try {
      if (!window.jarvisAPI || !window.jarvisAPI.getFolderItems) return;

      const folderData = await window.jarvisAPI.getFolderItems(targetFolderPath);
      if (!folderData || !folderData.success) {
        if (statusElem) statusElem.textContent = 'ERROR ACCESSING DIRECTORY';
        return;
      }

      // Track navigation history
      if (!isBackNav && this.currentFolder && this.currentFolder !== folderData.currentPath) {
        this.history.push(this.currentFolder);
      }

      this.currentFolder = folderData.currentPath;
      this.currentFolderName = folderData.folderName;
      this.isRootDesktop = folderData.isRootDesktop;

      // Update HUD Breadcrumb & Back button visibility
      if (navElem) {
        navElem.style.display = this.isRootDesktop ? 'none' : 'flex';
      }
      if (breadcrumbElem) {
        breadcrumbElem.textContent = this.isRootDesktop ? 'DESKTOP' : folderData.currentPath;
      }

      // Clear all current 3D nodes and floating labels
      this.clearNodes();

      const items = folderData.items || [];
      const allItems = [];

      // If inside a subfolder, add the special 3D Back Node as first item
      if (!this.isRootDesktop) {
        allItems.push({
          name: '⮌ .. [TORNA INDIETRO]',
          path: folderData.parentPath,
          type: 'back',
          extension: ''
        });
      }
      allItems.push(...items);

      const total = allItems.length;
      const cols = Math.max(3, Math.ceil(Math.sqrt(total * 1.5)));
      const spacingX = 2.4;
      const spacingY = 2.2;

      allItems.forEach((item, index) => {
        const mesh = createNodeMesh(item.type, item.extension);

        if (item.type === 'back') {
          // Prominent top-left placement for the back portal
          const startX = -((cols - 1) * spacingX) / 2;
          const startY = (Math.ceil(total / cols) * spacingY) / 2;
          mesh.position.set(startX, startY, 0);
        } else if (this.isRootDesktop && this.layout[item.path]) {
          const savedPos = this.layout[item.path];
          mesh.position.set(savedPos.x, savedPos.y, savedPos.z);
        } else {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const startX = -((cols - 1) * spacingX) / 2;
          const startY = (Math.ceil(total / cols) * spacingY) / 2;
          mesh.position.set(startX + col * spacingX, startY - row * spacingY, 0);
        }

        mesh.userData = { ...item };
        this.scene.add(mesh);

        const labelElem = createFloatingLabel(item.name, item.type, item.extension);
        this.nodes.set(mesh.uuid, { mesh, labelElem, item });
      });

      if (statusElem) {
        statusElem.textContent = this.isRootDesktop
          ? `DESKTOP ONLINE // ${items.length} NODES`
          : `FOLDER // ${this.currentFolderName.toUpperCase()} (${items.length} ITEMS)`;
      }
    } catch (err) {
      console.error('[Jarvis] Failed to load folder:', err);
      if (statusElem) statusElem.textContent = 'ERROR LOADING FOLDER';
    }
  }

  async navigateBack(onChirp) {
    if (this.isRootDesktop && this.history.length === 0) return;

    if (onChirp) onChirp();
    const previousFolder = this.history.pop() || null;
    await this.loadFolder(previousFolder, true);
  }

  async resetAll(onChirp) {
    if (onChirp) onChirp();
    const statusElem = document.getElementById('status-indicator');
    if (statusElem) statusElem.textContent = 'SYSTEM RESET // REALIGNING GRID';

    // 1. Reset saved layout coordinates
    this.layout = {};
    if (window.jarvisAPI && window.jarvisAPI.saveLayout) {
      await window.jarvisAPI.saveLayout({});
    }

    // 2. Clear history stack and return to root Desktop
    this.history = [];
    await this.loadFolder(null, false);
  }

  persistLayout() {
    if (!this.isRootDesktop || !window.jarvisAPI || !window.jarvisAPI.saveLayout) return;

    const layoutData = {};
    this.nodes.forEach(({ mesh, item }) => {
      if (item && item.path && item.type !== 'back') {
        layoutData[item.path] = {
          x: Number(mesh.position.x.toFixed(3)),
          y: Number(mesh.position.y.toFixed(3)),
          z: Number(mesh.position.z.toFixed(3))
        };
      }
    });

    window.jarvisAPI.saveLayout(layoutData).catch((err) => {
      console.error('[Jarvis] Failed to persist layout:', err);
    });
  }

  findTargetNode(ndc, cursorPosition) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshList = Array.from(this.nodes.values()).map((n) => n.mesh);
    const intersects = this.raycaster.intersectObjects(meshList);

    if (intersects.length > 0) {
      return intersects[0].object;
    }

    // Magnetic proximity fallback: snap to nearest node within 1.85 units of hand cursor
    for (const mesh of meshList) {
      if (mesh.position.distanceTo(cursorPosition) < 1.85) {
        return mesh;
      }
    }
    return null;
  }

  setHoveredNode(targetMesh) {
    if (this.hoveredNode && this.hoveredNode !== targetMesh) {
      const oldEntry = this.nodes.get(this.hoveredNode.uuid);
      if (oldEntry && oldEntry.labelElem) {
        oldEntry.labelElem.classList.remove('active-hover');
      }
    }
    this.hoveredNode = targetMesh;
    if (targetMesh) {
      const entry = this.nodes.get(targetMesh.uuid);
      if (entry && entry.labelElem) {
        entry.labelElem.classList.add('active-hover');
      }
    }
  }

  clearHover() {
    if (this.hoveredNode) {
      const oldEntry = this.nodes.get(this.hoveredNode.uuid);
      if (oldEntry && oldEntry.labelElem) {
        oldEntry.labelElem.classList.remove('active-hover');
      }
      this.hoveredNode = null;
    }
  }

  async launchFile(node, onChirp) {
    if (!node || this.openCooldown) return;
    this.openCooldown = true;

    const statusInd = document.getElementById('status-indicator');
    const itemName = node.userData.name || 'ITEM';
    const itemType = node.userData.type;

    // 1. Back Navigation Node
    if (itemType === 'back') {
      if (statusInd) statusInd.textContent = 'NAVIGATING // TORNA INDIETRO';
      if (onChirp) onChirp();
      await this.navigateBack();
      setTimeout(() => { this.openCooldown = false; }, 800);
      return;
    }

    // 2. Folder Navigation Node (explore inside Jarvis 3D)
    if (itemType === 'folder') {
      if (statusInd) statusInd.textContent = `EXPLORING FOLDER // ${itemName}`;
      if (onChirp) onChirp();
      await this.loadFolder(node.userData.path);
      setTimeout(() => { this.openCooldown = false; }, 800);
      return;
    }

    // 2.5 Markdown File (In-app Holographic Reader Interface)
    const ext = (node.userData.extension || '').toLowerCase();
    if (ext === '.md' || ext === '.markdown') {
      if (statusInd) statusInd.textContent = `HOLOGRAPHIC VIEWER // ${itemName}`;
      if (onChirp) onChirp();
      await markdownViewer.open(node.userData.path);
      setTimeout(() => {
        this.openCooldown = false;
        if (statusInd) {
          statusInd.textContent = this.isRootDesktop
            ? 'SYSTEM ONLINE // TRACKING ACTIVE'
            : `FOLDER // ${this.currentFolderName.toUpperCase()}`;
        }
      }, 800);
      return;
    }

    // 3. Regular Executable or Document File (launch via OS default handler)
    if (statusInd) {
      statusInd.textContent = itemType === 'executable' ? `LAUNCHING APP // ${itemName}` : `OPENING // ${itemName}`;
    }
    if (onChirp) onChirp();

    try {
      if (window.jarvisAPI && window.jarvisAPI.openFile) {
        await window.jarvisAPI.openFile(node.userData.path);
      }
    } catch (err) {
      console.error('[Jarvis] Failed to launch file:', err);
    }

    setTimeout(() => {
      this.openCooldown = false;
      if (statusInd) {
        statusInd.textContent = this.isRootDesktop
          ? 'SYSTEM ONLINE // TRACKING ACTIVE'
          : `FOLDER // ${this.currentFolderName.toUpperCase()}`;
      }
    }, 1200);
  }

  updateLabels() {
    this.nodes.forEach(({ mesh, labelElem, item }) => {
      if (!this.isGrabbing || this.selectedNode !== mesh) {
        if (item.type === 'back') {
          // Animate back portal with distinct pulsation & rotation
          mesh.rotation.z += 0.02;
          mesh.rotation.x += 0.01;
        } else {
          mesh.rotation.y += 0.01;
          mesh.rotation.x += 0.006;
        }
      }

      const screenPos = project3DTo2D(mesh.position, this.camera);
      if (labelElem) {
        if (screenPos.visible) {
          labelElem.style.display = 'block';
          labelElem.style.left = `${screenPos.x}px`;
          labelElem.style.top = `${screenPos.y - 18}px`;
        } else {
          labelElem.style.display = 'none';
        }
      }
    });
  }
}
