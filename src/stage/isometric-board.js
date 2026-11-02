import * as THREE from 'three';

export const BOARD_SIZE = 10;
export const TILE_SIZE = 24;
export const ELEVATION_STEP = 7;

// Seeded PRNG (Mulberry32) for deterministic terrain generation
function createMulberry32(seed) {
  let a = (typeof seed === 'number' ? seed : 42) >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class IsometricBoard {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [seed=42]
   */
  constructor(scene, seed = 42) {
    this.scene = scene;
    this.seed = seed;
    this.boardGroup = new THREE.Group();
    this.boardGroup.name = 'IsometricBoard';
    this.scene.add(this.boardGroup);

    this.tiles = []; // 2D array [z][x]
    this.interactiveMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.unitActorManager = null;

    // Material definitions
    this.materials = this._createMaterials();

    // Generate terrain grid data
    this._generateTerrain(seed);

    // Build 3D diorama blocks
    this._buildDioramaMeshes();

    // Setup highlight overlay pools
    this._initHighlightOverlays();
  }

  _createMaterials() {
    // Earth / stone side material for diorama column bases
    const columnSide = new THREE.MeshStandardMaterial({
      color: 0x3d352e,
      roughness: 0.85,
      metalness: 0.1
    });

    // Top cap materials for distinct tactical terrain types
    const grass = new THREE.MeshStandardMaterial({
      color: 0x4d7c0f,
      roughness: 0.75,
      metalness: 0.05
    });

    const stone = new THREE.MeshStandardMaterial({
      color: 0x85929e,
      roughness: 0.55,
      metalness: 0.2
    });

    const bridge = new THREE.MeshStandardMaterial({
      color: 0xb48a5c,
      roughness: 0.65,
      metalness: 0.15
    });

    const water = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.12,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82
    });

    const ruin = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.78,
      metalness: 0.22
    });

    return { columnSide, grass, stone, bridge, water, ruin };
  }

  _generateTerrain(seed) {
    const rng = createMulberry32(seed);

    // Initialize 10x10 grid
    this.tiles = [];
    for (let z = 0; z < BOARD_SIZE; z++) {
      const row = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        let elevation = 1;
        let terrain = 'grass';
        let passable = true;

        // 1. Shallow Crystal Stream (z = 4 and z = 5)
        if (z === 4 || z === 5) {
          elevation = 0;
          terrain = 'water';
          passable = false; // impassable water except at bridge
        }

        // 2. Cobblestone Bridge spanning crystal stream (x = 4, 5 at z = 4, 5)
        if ((x === 4 || x === 5) && (z === 4 || z === 5)) {
          elevation = 1;
          terrain = 'bridge';
          passable = true;
        }

        // 3. Stone Citadel Ruins on high northern ledges (x <= 3, z <= 2)
        if (x <= 3 && z <= 2) {
          if (x <= 2 && z <= 1) {
            elevation = 3;
            terrain = 'stone';
            passable = true;
          } else {
            elevation = 2;
            terrain = 'stone';
            passable = true;
          }

          // Tactical citadel pillars / ruin blocks at corners
          if ((x === 0 && z === 0) || (x === 2 && z === 0)) {
            elevation = 4;
            terrain = 'ruin';
            passable = false; // High obstacle pillar
          }
        }

        // 4. Southern plateau & ruined watchtower (x >= 6, z >= 7)
        if (x >= 6 && z >= 7) {
          elevation = 2;
          terrain = 'stone';
          passable = true;

          if (x >= 7 && z >= 8) {
            elevation = 3;
            terrain = 'stone';
          }

          // Watchtower ruin pillar
          if (x === 8 && z === 8) {
            elevation = 4;
            terrain = 'ruin';
            passable = false;
          }
        }

        // 5. Terraces and natural stepped slopes (grass elevation 1..2)
        if (terrain === 'grass') {
          if ((z <= 2 && x > 3) || (z >= 7 && x < 6)) {
            elevation = 2;
          } else {
            elevation = 1;
          }
          // Seeded micro-variations
          if (rng() > 0.85 && elevation === 1 && z !== 3 && z !== 6) {
            elevation = 2;
          }
        }

        const worldX = (x - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
        const worldZ = (z - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
        const worldY = elevation * ELEVATION_STEP;

        row.push({
          x,
          z,
          elevation,
          terrain,
          type: terrain,
          isWater: terrain === 'water',
          passable,
          worldX,
          worldY,
          worldZ
        });
      }
      this.tiles.push(row);
    }
  }

  _buildDioramaMeshes() {
    const bottomY = -ELEVATION_STEP * 2; // -14 base
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x181512,
      transparent: true,
      opacity: 0.65
    });

    const gridLineMaterial = new THREE.LineBasicMaterial({
      color: 0x221f1b,
      transparent: true,
      opacity: 0.4
    });

    const topGridGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE));

    for (let z = 0; z < BOARD_SIZE; z++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const tile = this.tiles[z][x];
        const topY = tile.worldY;
        const height = topY - bottomY;
        const centerY = (topY + bottomY) / 2;

        const boxGeo = new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE);
        const topMat = this.materials[tile.terrain] || this.materials.grass;

        // Three.js BoxGeometry multi-material: [+X, -X, +Y(top), -Y, +Z, -Z]
        const tileMaterials = [
          this.materials.columnSide,
          this.materials.columnSide,
          topMat,
          this.materials.columnSide,
          this.materials.columnSide,
          this.materials.columnSide
        ];

        const tileMesh = new THREE.Mesh(boxGeo, tileMaterials);
        tileMesh.position.set(tile.worldX, centerY, tile.worldZ);
        tileMesh.userData.tile = tile;

        // Crisp dark wireframe / edge lines for unmistakable tactical grid diorama readability
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), edgeMaterial);
        tileMesh.add(edges);

        // Top face border line
        const topBorder = new THREE.LineSegments(topGridGeo, gridLineMaterial);
        topBorder.rotation.x = -Math.PI / 2;
        topBorder.position.y = height / 2 + 0.02;
        tileMesh.add(topBorder);

        this.boardGroup.add(tileMesh);
        this.interactiveMeshes.push(tileMesh);
        tile.mesh = tileMesh;
      }
    }
  }

  _initHighlightOverlays() {
    // 1. Move Highlights Group (Azure blue glowing tiles: 0x38bdf8, opacity 0.45)
    this.moveHighlightGroup = new THREE.Group();
    this.moveHighlightGroup.name = 'MoveHighlights';
    this.boardGroup.add(this.moveHighlightGroup);

    this.moveMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.moveBorderMaterial = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.85
    });

    // 2. Attack Highlights Group (Crimson red: 0xf43f5e, opacity 0.50, or Emerald: 0x10b981)
    this.attackHighlightGroup = new THREE.Group();
    this.attackHighlightGroup.name = 'AttackHighlights';
    this.boardGroup.add(this.attackHighlightGroup);

    this.attackMaterial = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.supportMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Reusable plane geometry for highlights
    this.highlightPlaneGeo = new THREE.PlaneGeometry(TILE_SIZE - 0.6, TILE_SIZE - 0.6);
    this.highlightBorderGeo = new THREE.EdgesGeometry(this.highlightPlaneGeo);

    // 3. Active Unit Tile (Gold pulsing border/quad: 0xfbbf24)
    this.activeUnitGroup = new THREE.Group();
    this.activeUnitGroup.visible = false;
    this.boardGroup.add(this.activeUnitGroup);

    this.activeUnitMaterial = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.activeUnitBorderMaterial = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95
    });

    const activeQuad = new THREE.Mesh(this.highlightPlaneGeo, this.activeUnitMaterial);
    activeQuad.rotation.x = -Math.PI / 2;
    const activeBorder = new THREE.LineSegments(this.highlightBorderGeo, this.activeUnitBorderMaterial);
    activeBorder.rotation.x = -Math.PI / 2;
    this.activeUnitGroup.add(activeQuad, activeBorder);

    // 4. Hover Tile Selector Box (Crisp white/cyan cursor selector)
    this.hoverCursorGroup = new THREE.Group();
    this.hoverCursorGroup.visible = false;
    this.boardGroup.add(this.hoverCursorGroup);

    const hoverPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const hoverBorderMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });

    const hoverQuad = new THREE.Mesh(this.highlightPlaneGeo, hoverPlaneMat);
    hoverQuad.rotation.x = -Math.PI / 2;
    const hoverBorder = new THREE.LineSegments(this.highlightBorderGeo, hoverBorderMat);
    hoverBorder.rotation.x = -Math.PI / 2;

    // Corner brackets for cursor styling
    const bracketGeo = new THREE.BufferGeometry();
    const bSize = 4;
    const hHalf = (TILE_SIZE - 0.6) / 2;
    const bracketPoints = [
      // Top-left
      -hHalf, 0, -hHalf + bSize,  -hHalf, 0, -hHalf,
      -hHalf, 0, -hHalf,          -hHalf + bSize, 0, -hHalf,
      // Top-right
      hHalf - bSize, 0, -hHalf,   hHalf, 0, -hHalf,
      hHalf, 0, -hHalf,           hHalf, 0, -hHalf + bSize,
      // Bottom-right
      hHalf, 0, hHalf - bSize,    hHalf, 0, hHalf,
      hHalf, 0, hHalf,            hHalf - bSize, 0, hHalf,
      // Bottom-left
      -hHalf + bSize, 0, hHalf,   -hHalf, 0, hHalf,
      -hHalf, 0, hHalf,           -hHalf, 0, hHalf - bSize
    ];
    bracketGeo.setAttribute('position', new THREE.Float32BufferAttribute(bracketPoints, 3));
    const bracketLines = new THREE.LineSegments(bracketGeo, new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 }));

    this.hoverCursorGroup.add(hoverQuad, hoverBorder, bracketLines);
  }

  /**
   * Get tile data at (x, z).
   * @param {number} x
   * @param {number} z
   * @returns {{ x: number, z: number, elevation: number, terrain: string, passable: boolean, worldX: number, worldY: number, worldZ: number }|null}
   */
  getTile(x, z) {
    if (x < 0 || x >= BOARD_SIZE || z < 0 || z >= BOARD_SIZE) return null;
    return this.tiles[z]?.[x] || null;
  }

  /**
   * Check if tile at (x, z) is passable and not water.
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isWalkable(x, z) {
    const tile = this.getTile(x, z);
    if (!tile) return false;
    return tile.passable !== false && !tile.isWater && tile.terrain !== 'water';
  }

  /**
   * Convert tile coords (x, z) to world space THREE.Vector3.
   * @param {number} x
   * @param {number} z
   * @param {number} [elevationOverride]
   * @returns {THREE.Vector3}
   */
  tileToWorld(x, z, elevationOverride) {
    const worldX = (x - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
    const worldZ = (z - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
    const tile = this.getTile(x, z);
    const elev = elevationOverride !== undefined ? elevationOverride : (tile?.elevation ?? 0);
    const worldY = elev * ELEVATION_STEP;
    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  /**
   * Register unit actor manager for precise unit body click & raycasting.
   * @param {Object} unitActorManager
   */
  setUnitActorManager(unitActorManager) {
    this.unitActorManager = unitActorManager;
  }

  /**
   * Raycast from mouse cursor or NDC coordinates to pick hovered tile.
   * Prioritizes unit bodies/hitboxes and tile top surfaces over vertical column side walls.
   * Supports both (clientX, clientY, camera, canvas) and (ndcX, ndcY, camera, unitActorManager).
   * @param {number} clientXOrNdcX
   * @param {number} clientYOrNdcY
   * @param {THREE.Camera|TacticalCamera} camera
   * @param {HTMLCanvasElement|Object} [canvasOrManager]
   * @param {Object} [optManager]
   * @returns {{ x: number, z: number, elevation: number, terrain: string, unit?: Object }|null}
   */
  pickTile(clientXOrNdcX, clientYOrNdcY, camera, canvasOrManager, optManager) {
    if (!camera) return null;
    const cam = camera.camera || camera;

    let ndcX = 0;
    let ndcY = 0;
    let manager = optManager || this.unitActorManager || null;

    if (canvasOrManager && typeof canvasOrManager.getBoundingClientRect === 'function') {
      const rect = canvasOrManager.getBoundingClientRect();
      ndcX = ((clientXOrNdcX - rect.left) / rect.width) * 2 - 1;
      ndcY = -((clientYOrNdcY - rect.top) / rect.height) * 2 + 1;
    } else {
      ndcX = Number(clientXOrNdcX) || 0;
      ndcY = Number(clientYOrNdcY) || 0;
      if (canvasOrManager && (canvasOrManager.units || canvasOrManager._getActor)) {
        manager = canvasOrManager;
      }
    }

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, cam);

    // 1. Raycast against living unit hitboxes / body meshes first so clicking a unit's chest selects their tile
    if (manager && manager.units) {
      const unitTargets = [];
      for (const actor of manager.units.values()) {
        if (!actor || actor.unit?.isDead || actor.unit?.alive === false) continue;
        if (actor.hitboxMesh) {
          unitTargets.push(actor.hitboxMesh);
        } else if (actor.sprite?.group) {
          actor.sprite.group.traverse((obj) => {
            if (obj.isMesh && obj.visible) {
              obj.userData.unitActor = actor;
              unitTargets.push(obj);
            }
          });
        }
      }

      if (unitTargets.length > 0) {
        const unitHits = this.raycaster.intersectObjects(unitTargets, true);
        if (unitHits.length > 0) {
          const firstHit = unitHits[0];
          const actor = firstHit.object.userData?.unitActor || firstHit.object.parent?.userData?.unitActor;
          if (actor && actor.unit) {
            const tx = actor.unit.gridX !== undefined ? actor.unit.gridX : actor.unit.x;
            const tz = actor.unit.gridZ !== undefined ? actor.unit.gridZ : actor.unit.z;
            const tile = this.getTile(tx, tz);
            if (tile) {
              return {
                x: tile.x,
                z: tile.z,
                elevation: tile.elevation,
                terrain: tile.terrain,
                unit: actor.unit
              };
            }
          }
        }
      }
    }

    // 2. Raycast against diorama tile meshes, prioritizing top faces (normal.y > 0.5) over column side walls
    const tileHits = this.raycaster.intersectObjects(this.interactiveMeshes, false);
    if (tileHits.length > 0) {
      const topHit = tileHits.find((h) => h.face && h.face.normal && h.face.normal.y > 0.5);
      const chosenHit = topHit || tileHits[0];
      const tile = chosenHit.object.userData?.tile;
      if (tile) {
        return {
          x: tile.x,
          z: tile.z,
          elevation: tile.elevation,
          terrain: tile.terrain
        };
      }
    }

    return null;
  }

  /**
   * Direction between two tiles matching Jimmy Lee's coordinate system:
   * +X (dx > 0, dz === 0) -> 'SE'
   * +Z (dx === 0, dz > 0) -> 'SW'
   * -X (dx < 0, dz === 0) -> 'NW'
   * -Z (dx === 0, dz < 0) -> 'NE'
   * Diagonals:
   * dx > 0, dz > 0 -> 'S'
   * dx < 0, dz > 0 -> 'W'
   * dx < 0, dz < 0 -> 'N'
   * dx > 0, dz < 0 -> 'E'
   * @param {number} fromX
   * @param {number} fromZ
   * @param {number} toX
   * @param {number} toZ
   * @returns {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'}
   */
  getFacingBetween(fromX, fromZ, toX, toZ) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    if (dx === 0 && dz === 0) return 'SE';

    // Exact Jimmy Lee cardinal directions
    if (dx > 0 && dz === 0) return 'SE';
    if (dx === 0 && dz > 0) return 'SW';
    if (dx < 0 && dz === 0) return 'NW';
    if (dx === 0 && dz < 0) return 'NE';

    // Diagonals
    if (dx > 0 && dz > 0) return 'S';
    if (dx < 0 && dz > 0) return 'W';
    if (dx < 0 && dz < 0) return 'N';
    if (dx > 0 && dz < 0) return 'E';

    // General angle fallback
    const deg = (Math.atan2(dz, dx) * 180) / Math.PI; // -180 to 180
    if (deg >= -22.5 && deg < 22.5) return 'SE';
    if (deg >= 22.5 && deg < 67.5) return 'S';
    if (deg >= 67.5 && deg < 112.5) return 'SW';
    if (deg >= 112.5 && deg < 157.5) return 'W';
    if (deg >= 157.5 || deg < -157.5) return 'NW';
    if (deg >= -157.5 && deg < -112.5) return 'N';
    if (deg >= -112.5 && deg < -67.5) return 'NE';
    return 'E';
  }

  /**
   * Display azure blue glowing reachable move tiles (worldY + 0.18).
   * @param {Array<{ x: number, z: number }>} tiles
   */
  showMoveHighlights(tiles) {
    this._clearGroup(this.moveHighlightGroup);
    if (!tiles || !tiles.length) return;

    for (const { x, z } of tiles) {
      const tile = this.getTile(x, z);
      if (!tile) continue;

      const quad = new THREE.Mesh(this.highlightPlaneGeo, this.moveMaterial);
      quad.rotation.x = -Math.PI / 2;
      quad.position.set(tile.worldX, tile.worldY + 0.18, tile.worldZ);

      const border = new THREE.LineSegments(this.highlightBorderGeo, this.moveBorderMaterial);
      border.rotation.x = -Math.PI / 2;
      border.position.set(tile.worldX, tile.worldY + 0.182, tile.worldZ);

      this.moveHighlightGroup.add(quad, border);
    }
  }

  /**
   * Display attack or support range highlights (worldY + 0.18).
   * @param {Array<{ x: number, z: number }>} tiles
   * @param {boolean} [isSupport=false]
   */
  showAttackHighlights(tiles, isSupport = false) {
    this._clearGroup(this.attackHighlightGroup);
    if (!tiles || !tiles.length) return;

    const mat = isSupport ? this.supportMaterial : this.attackMaterial;
    const borderMat = new THREE.LineBasicMaterial({
      color: isSupport ? 0x6ee7b7 : 0xfca5a5,
      transparent: true,
      opacity: 0.85
    });

    for (const { x, z } of tiles) {
      const tile = this.getTile(x, z);
      if (!tile) continue;

      const quad = new THREE.Mesh(this.highlightPlaneGeo, mat);
      quad.rotation.x = -Math.PI / 2;
      quad.position.set(tile.worldX, tile.worldY + 0.18, tile.worldZ);

      const border = new THREE.LineSegments(this.highlightBorderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(tile.worldX, tile.worldY + 0.182, tile.worldZ);

      this.attackHighlightGroup.add(quad, border);
    }
  }

  /**
   * Gold pulsing border/quad under the active turn unit.
   * @param {number|null} x
   * @param {number|null} z
   */
  setActiveUnitTile(x, z) {
    if (x === null || z === null || x === undefined || z === undefined) {
      this.activeUnitGroup.visible = false;
      return;
    }

    const tile = this.getTile(x, z);
    if (!tile) {
      this.activeUnitGroup.visible = false;
      return;
    }

    this.activeUnitGroup.position.set(tile.worldX, tile.worldY + 0.19, tile.worldZ);
    this.activeUnitGroup.visible = true;
  }

  /**
   * Crisp white/cyan cursor selector box at (x, z).
   * @param {number|null} x
   * @param {number|null} z
   * @returns {{ x: number, z: number, elevation: number, terrain: string }|null}
   */
  setHoverTile(x, z) {
    if (x === null || z === null || x === undefined || z === undefined) {
      this.hoverCursorGroup.visible = false;
      return null;
    }

    const tile = this.getTile(x, z);
    if (!tile) {
      this.hoverCursorGroup.visible = false;
      return null;
    }

    this.hoverCursorGroup.position.set(tile.worldX, tile.worldY + 0.2, tile.worldZ);
    this.hoverCursorGroup.visible = true;

    return {
      x: tile.x,
      z: tile.z,
      elevation: tile.elevation,
      terrain: tile.terrain
    };
  }

  /**
   * Clear all active move and attack highlight meshes.
   */
  clearHighlights() {
    this._clearGroup(this.moveHighlightGroup);
    this._clearGroup(this.attackHighlightGroup);
  }

  /**
   * Update highlight animations (e.g. pulsing active unit gold tile).
   * @param {number} now
   */
  update(now) {
    if (this.activeUnitGroup.visible) {
      const pulse = 0.45 + 0.35 * (Math.sin(now * 5.0) * 0.5 + 0.5);
      this.activeUnitMaterial.opacity = pulse;
    }
  }

  _clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children.pop();
      if (child.isMesh || child.isLineSegments) {
        // Child geometries and materials are shared from pools
      }
    }
  }

  dispose() {
    this.clearHighlights();

    if (this.boardGroup) {
      this.boardGroup.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m?.dispose?.());
          } else {
            obj.material?.dispose?.();
          }
        }
      });
      this.boardGroup.clear();
      if (this.scene) {
        this.scene.remove(this.boardGroup);
      }
    }

    if (this.materials) {
      Object.values(this.materials).forEach((m) => m?.dispose?.());
    }

    if (this.highlightPlaneGeo) {
      this.highlightPlaneGeo.dispose();
    }
    if (this.highlightBorderGeo) {
      this.highlightBorderGeo.dispose();
    }
    if (this.moveMaterial) this.moveMaterial.dispose();
    if (this.moveBorderMaterial) this.moveBorderMaterial.dispose();
    if (this.attackMaterial) this.attackMaterial.dispose();
    if (this.supportMaterial) this.supportMaterial.dispose();
    if (this.activeUnitMaterial) this.activeUnitMaterial.dispose();
    if (this.activeUnitBorderMaterial) this.activeUnitBorderMaterial.dispose();

    this.interactiveMeshes = [];
    this.tiles = [];
    this.unitActorManager = null;
  }
}
