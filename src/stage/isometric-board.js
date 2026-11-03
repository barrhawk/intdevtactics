import * as THREE from 'three';
import { createWaterSwell, createWaterRipples, sampleWaterField } from '@engine/debug/water-simulation';
import { createMarbleBake, createMarbleMaterial } from '@engine/debug/marble-material';
import { WaterSurface, MAX_WATER_POSTS } from './water-surface.js';
import { UnitActor } from './unit-actor.js';

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

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uSwellTex;
  uniform sampler2D uRippleTex;

  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // River domain X: [-120, 120] (domain 240), Z: [-24, 24] (domain 48)
    vSwellUv = (world.xz + 120.0) / 240.0;
    vRippleUv = (world.xz + 120.0) / 240.0;

    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uSwellTex;
  uniform sampler2D uRippleTex;
  uniform float uTime;
  uniform float uOpacity;

  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 seabedColor;
  uniform vec3 skyHorizonColor;
  uniform vec3 skyZenithColor;
  uniform vec3 foamColor;
  uniform vec3 foamShadeColor;

  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  const vec2 WIND = normalize(vec2(1.0, 0.55));
  const float CAUSTIC_SPREAD = 0.0011;
  const vec3 ABSORPTION = vec3(0.058, 0.0115, 0.0072);
  const float REFRACTION = 0.75;
  const float FOAM_LACE_SCALE = 0.62;
  const float FOAM_DRIFT = 0.55;

  float hash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  float softNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 f = point - cell;
    vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), s.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), s.x), s.y);
  }

  // Procedure drifting lace foam: creases of smooth noise warped by more noise
  float lace(vec2 point) {
    vec2 drift = WIND * uTime * FOAM_DRIFT;
    vec2 warp = vec2(softNoise(point * 0.5 + drift * 0.3), softNoise(point * 0.5 - drift * 0.3 + 19.0)) * 2.6;
    float broad = 1.0 - abs(2.0 * softNoise(point + warp + drift) - 1.0);
    float fine = 1.0 - abs(2.0 * softNoise(point * 2.3 - warp - drift * 1.4 + 7.0) - 1.0);
    return broad * broad * (0.62 + 0.38 * fine);
  }

  // Smooth sinusoidal shimmer ripples
  vec2 shimmer(vec2 point) {
    vec2 a = point * 0.5 + WIND * uTime * 1.1;
    vec2 b = vec2(-point.y, point.x) * 0.85 - WIND.yx * uTime * 1.5;
    return vec2(cos(a.x + 0.6 * a.y) + 0.6 * cos(b.x - 0.4 * b.y), cos(a.y - 0.6 * a.x) + 0.6 * cos(b.y + 0.4 * b.x)) * 0.025;
  }

  // Procedural caustic light intensity at a seabed coordinate
  float sampleCaustic(vec2 p) {
    vec2 p1 = p * 0.35 + vec2(uTime * 0.35, uTime * 0.22);
    vec2 p2 = p * 0.48 - vec2(uTime * 0.28, uTime * 0.32);
    float c1 = sin(p1.x + sin(p1.y * 1.5)) * cos(p1.y + cos(p1.x * 1.5));
    float c2 = sin(p2.x * 1.35 - sin(p2.y * 1.25)) * cos(p2.y * 1.35 - cos(p2.x * 1.25));
    return pow(0.5 + 0.5 * (c1 + c2) * 0.5, 3.2) * 3.5;
  }

  void main() {
    vec4 swellData = texture2D(uSwellTex, vSwellUv);
    vec4 rippleData = texture2D(uRippleTex, vRippleUv);

    // Surface slope and normal
    vec2 slope = swellData.gb * 0.55 + rippleData.gb * 1.4 + shimmer(vWorld.xz);
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 view = normalize(cameraPosition - vWorld);
    float viewDotNormal = max(dot(normal, view), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - viewDotNormal, 5.0);

    // Refracted ray onto sandy riverbed
    vec3 ray = refract(-view, normal, REFRACTION);
    float depth = 12.0 + 3.0 * (sin(vWorld.x * 0.025 + 1.1) * sin(vWorld.z * 0.035 - 0.4));
    float path = (depth + swellData.r + rippleData.r) / max(-ray.y, 0.2);
    vec2 bed = vWorld.xz + ray.xz * path;

    // Sunlight refraction caustics with CAUSTIC_SPREAD RGB chromatic fringe
    vec2 fringe = vec2(CAUSTIC_SPREAD, -CAUSTIC_SPREAD * 0.6) * 150.0;
    vec3 caustics = vec3(
      sampleCaustic(bed - fringe),
      sampleCaustic(bed),
      sampleCaustic(bed + fringe)
    );
    vec3 seabed = seabedColor * (0.82 + 0.22 * caustics * sqrt(max(caustics, vec3(0.0))));

    // Beer-Lambert depth absorption
    vec3 waterColor = seabed * exp(-ABSORPTION * path);

    // Fresnel sky reflection
    vec3 reflected = reflect(-view, normal);
    vec3 sky = mix(skyHorizonColor, skyZenithColor, clamp(reflected.y, 0.0, 1.0));
    vec3 color = mix(waterColor, sky, fresnel);

    // Specular sun glint
    vec3 halfway = normalize(sunDirection + view);
    float toSun = max(dot(normal, halfway), 0.0);
    color += sunColor * (pow(toSun, 1400.0) * 0.85 + pow(toSun, 90.0) * 0.06);

    // Procedural drifting lace() foam:
    // Brightens along:
    // 1. Riverbanks (stream boundary near abs(z) ~ 24)
    float bankCoverage = smoothstep(14.0, 23.5, abs(vWorld.z));
    // 2. Bridge posts (columns around x ~ -12 and +12)
    float bridgeDist = min(abs(vWorld.x - 12.0), abs(vWorld.x + 12.0));
    float bridgeCoverage = (1.0 - smoothstep(0.0, 5.5, bridgeDist)) * (1.0 - smoothstep(18.0, 24.0, abs(vWorld.z)));
    // 3. Active water ripples
    float rippleCoverage = smoothstep(0.02, 0.5, rippleData.a) * 1.2 + abs(rippleData.r) * 0.8;

    float coverage = max(max(bankCoverage, bridgeCoverage), max(rippleCoverage, smoothstep(0.7, 1.0, swellData.a) * 0.4));

    if (coverage > 0.004) {
      float strands = lace(vWorld.xz * FOAM_LACE_SCALE);
      float edge = max(fwidth(strands), 0.05);
      float threshold = 1.0 - 0.86 * coverage;
      float foam = smoothstep(threshold - edge, threshold + edge, strands) * smoothstep(0.12, 0.35, coverage);
      float thick = smoothstep(0.45, 1.0, coverage);
      color *= 1.0 - 0.1 * coverage;
      color = mix(color, mix(foamShadeColor, foamColor, 0.45 + 0.55 * max(thick, strands)), foam * (0.75 + 0.25 * thick));
    }

    gl_FragColor = vec4(color, uOpacity);
  }
`;

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

    // Veined marble bake & material
    this.marbleBake = null;
    this.veinedMarbleMaterial = null;

    // Submerged / emergent veined marble river posts along the waterway
    this.riverPosts = [];
    this.riverPostMeshes = [];

    // Battlefield Rune Switches
    this.runeSwitches = new Map();
    this.floodgateRaised = false;

    // Material definitions
    this.materials = this._createMaterials();

    // Generate terrain grid data
    this._generateTerrain(seed);

    // Build 3D diorama blocks
    this._buildDioramaMeshes();

    // Setup highlight overlay pools
    this._initHighlightOverlays();

    // Setup FFT water swell, ripples, and surface mesh
    this._initWaterSimulation(seed);

    // Setup 4 submerged/emergent veined marble river posts
    this._initRiverPosts();

    // Setup 3D battlefield rune switches
    this._initRuneSwitches();
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

  /**
   * Initializes GPU-baked 3D world-space veined white marble texture and applies to bridge/ruin/stone.
   * @param {THREE.WebGLRenderer} renderer
   */
  initMarbleBake(renderer) {
    if (!renderer) return;

    // Automatically trigger GPU PLATE / BACK / PAGES finish & RoomEnvironment bake on startup
    try {
      if (typeof UnitActor?.initItemFinishBake === 'function') {
        UnitActor.initItemFinishBake(renderer);
      }
    } catch (err) {
      console.warn('[IsometricBoard] UnitActor.initItemFinishBake warning:', err);
    }

    if (this.marbleBake) {
      this.marbleBake.dispose();
    }
    this.marbleBake = createMarbleBake(renderer);
    this.marbleBake.bake();

    this.veinedMarbleMaterial = createMarbleMaterial();
    this.veinedMarbleMaterial.uniforms.stone.value = this.marbleBake.texture;

    this.materials.bridge = this.veinedMarbleMaterial;
    this.materials.ruin = this.veinedMarbleMaterial;

    for (const mesh of this.interactiveMeshes) {
      const tile = mesh.userData?.tile;
      if (tile && (tile.terrain === 'bridge' || tile.terrain === 'ruin')) {
        if (Array.isArray(mesh.material)) {
          mesh.material[2] = this.veinedMarbleMaterial;
        }
      }
    }

    // Apply veined marble material to 3D river posts
    if (this.riverPostMeshes) {
      for (const pMesh of this.riverPostMeshes) {
        pMesh.material = this.veinedMarbleMaterial;
        pMesh.traverse((child) => {
          if (child.isMesh) child.material = this.veinedMarbleMaterial;
        });
      }
    }
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

        // 1. Shallow Crystal Stream (z = 4 and z = 5) - wadeable shallow water
        if (z === 4 || z === 5) {
          elevation = 0;
          terrain = 'water';
          passable = true; // wadeable shallow water
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

        const isWater = terrain === 'water';
        const moveCost = isWater ? 2 : 1;

        row.push({
          x,
          z,
          elevation,
          terrain,
          type: terrain,
          isWater,
          moveCost,
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

  _initRuneSwitches() {
    this.runeSwitches = new Map();
    const switchDefs = [
      { x: 4, z: 3 },
      { x: 5, z: 6 }
    ];

    for (const def of switchDefs) {
      const worldPos = this.tileToWorld(def.x, def.z);
      const group = new THREE.Group();
      group.name = `RuneSwitch_${def.x}_${def.z}`;

      // 1. Base pedestal
      const baseGeo = new THREE.CylinderGeometry(2.4, 3.2, 1.2, 8);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.5,
        metalness: 0.6
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.6;
      group.add(base);

      // 2. Glowing rune ring on plinth
      const runeRingGeo = new THREE.RingGeometry(1.6, 2.6, 8);
      runeRingGeo.rotateX(-Math.PI / 2);
      const runeRingMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        side: THREE.DoubleSide
      });
      const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
      runeRing.position.y = 1.22;
      group.add(runeRing);

      // 3. Tilting obelisk lever shaft
      const leverShaft = new THREE.Group();
      leverShaft.position.set(0, 1.2, 0);

      const shaftGeo = new THREE.ConeGeometry(1.2, 6.5, 6);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.85
      });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.position.y = 3.25;
      leverShaft.add(shaftMesh);

      // 4. Floating glowing crystal diamond on lever apex
      const crystalGeo = new THREE.OctahedronGeometry(1.4, 0);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0891b2,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.9
      });
      const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
      crystalMesh.position.y = 7.0;
      leverShaft.add(crystalMesh);

      group.add(leverShaft);
      group.position.set(worldPos.x, worldPos.y, worldPos.z);
      this.boardGroup.add(group);

      const entry = {
        x: def.x,
        z: def.z,
        active: false,
        mesh: group,
        leverShaft,
        crystalMesh
      };
      this.runeSwitches.set(`${def.x},${def.z}`, entry);
    }
  }

  /**
   * Returns rune switch object if (x, z) is on or cardinally adjacent to (4, 3) or (5, 6).
   * @param {number} x
   * @param {number} z
   * @returns {{ x: number, z: number, active: boolean }|null}
   */
  getAdjacentSwitch(x, z) {
    for (const sw of this.runeSwitches.values()) {
      const dist = Math.abs(x - sw.x) + Math.abs(z - sw.z);
      if (dist <= 1) {
        return { x: sw.x, z: sw.z, active: sw.active, ...sw };
      }
    }
    return null;
  }

  /**
   * Toggles the battlefield floodgate rune switch:
   * toggles this.floodgateRaised, tilts the lever, emits water ripples, and raises/submerges
   * the ford tiles (2,4), (2,5), (7,4), (7,5).
   * @param {number} [x]
   * @param {number} [z]
   * @returns {boolean}
   */
  toggleRuneSwitch(x, z) {
    this.floodgateRaised = !this.floodgateRaised;

    for (const sw of this.runeSwitches.values()) {
      sw.active = this.floodgateRaised;
      if (sw.leverShaft) {
        sw.leverShaft.rotation.z = this.floodgateRaised ? 0.42 : -0.42;
      }
      if (sw.crystalMesh) {
        sw.crystalMesh.material.color.setHex(this.floodgateRaised ? 0xfbbf24 : 0x22d3ee);
        sw.crystalMesh.material.emissive.setHex(this.floodgateRaised ? 0xd97706 : 0x0891b2);
      }
    }

    // Trigger water ripples across the stream
    this.triggerWaterRipple(0, 0, 1.5);
    this.triggerWaterRipple(-48, 0, 1.2);
    this.triggerWaterRipple(48, 0, 1.2);

    // Toggle ford tiles (2, 4), (2, 5), (7, 4), (7, 5)
    const fordCoords = [
      { x: 2, z: 4 },
      { x: 2, z: 5 },
      { x: 7, z: 4 },
      { x: 7, z: 5 }
    ];

    const bottomY = -ELEVATION_STEP * 2;
    for (const coord of fordCoords) {
      const tile = this.getTile(coord.x, coord.z);
      if (!tile) continue;

      tile.elevation = this.floodgateRaised ? 1 : 0;
      tile.terrain = this.floodgateRaised ? 'bridge' : 'water';
      tile.type = tile.terrain;
      tile.isWater = !this.floodgateRaised;
      tile.moveCost = this.floodgateRaised ? 1 : 2;
      tile.passable = true;
      tile.worldY = tile.elevation * ELEVATION_STEP;

      if (tile.mesh) {
        const topY = tile.worldY;
        const height = topY - bottomY;
        const centerY = (topY + bottomY) / 2;

        tile.mesh.geometry.dispose();
        tile.mesh.geometry = new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE);
        tile.mesh.position.y = centerY;

        const topMat = this.floodgateRaised
          ? (this.veinedMarbleMaterial || this.materials.bridge)
          : this.materials.water;

        if (Array.isArray(tile.mesh.material)) {
          tile.mesh.material[2] = topMat;
        }
      }
    }

    return this.floodgateRaised;
  }

  /**
   * Alias for toggleRuneSwitch to toggle the battlefield floodgates.
   * @param {number} [x]
   * @param {number} [z]
   * @returns {boolean}
   */
  toggleFloodgates(x, z) {
    return this.toggleRuneSwitch(x, z);
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
   * Retrieves tile elevation at (x, z).
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  getElevation(x, z) {
    const tile = this.getTile(x, z);
    return tile ? (tile.elevation ?? 0) : 0;
  }

  /**
   * Check if tile at (x, z) is passable.
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isWalkable(x, z) {
    const tile = this.getTile(x, z);
    if (!tile) return false;
    return tile.passable !== false;
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
   * Returns living unit occupying (x, z), if registered with unitActorManager.
   * @param {number} x
   * @param {number} z
   * @returns {Object|null}
   */
  getUnitAt(x, z) {
    if (this.unitActorManager?.units) {
      for (const actor of this.unitActorManager.units.values()) {
        const u = actor?.unit;
        if (u && !u.isDead && !u.inPrison && u.alive !== false && (u.hp === undefined || u.hp > 0)) {
          const ux = u.gridX !== undefined ? u.gridX : u.x;
          const uz = u.gridZ !== undefined ? u.gridZ : u.z;
          if (ux === x && uz === z) return u;
        }
      }
    }
    return null;
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

    // 1. Raycast against living unit hitboxes / body meshes first
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
   * Direction between two tiles matching Jimmy Lee's coordinate system.
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

    if (dx > 0 && dz === 0) return 'SE';
    if (dx === 0 && dz > 0) return 'SW';
    if (dx < 0 && dz === 0) return 'NW';
    if (dx === 0 && dz < 0) return 'NE';

    if (dx > 0 && dz > 0) return 'S';
    if (dx < 0 && dz > 0) return 'W';
    if (dx < 0 && dz < 0) return 'N';
    if (dx > 0 && dz < 0) return 'E';

    const deg = (Math.atan2(dz, dx) * 180) / Math.PI;
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

  _initWaterSimulation(seed) {
    // Modular GPU Water Surface with real-time caustic mesh projection & post raymarching
    this.waterSurface = new WaterSurface(this.boardGroup, {
      width: 240,
      depth: 48,
      y: 0.08,
      seed: typeof seed === 'number' ? seed : 42
    });

    // Backward-compatibility aliases
    this.waterSurfaceMesh = this.waterSurface.mesh;
    this.waterSurfaceMaterial = this.waterSurface.material;
    this.waterSwell = this.waterSurface.waterSwell;
    this.waterRipples = this.waterSurface.waterRipples;
    this.waterSwellTexture = this.waterSurface.waterSwellTexture;
    this.waterRippleTexture = this.waterSurface.waterRippleTexture;
    this.activeWaterRipples = this.waterSurface.activeWaterRipples;
    this.waterBasePositions = this.waterSurface.basePositions;
  }

  /**
   * Initializes 4 submerged/emergent veined marble posts along the waterway (z = 4.5):
   * (1, 4.5), (3, 4.5), (6, 4.5), (8, 4.5), passing normalized UV centers and heights to waterSurface.
   */
  _initRiverPosts() {
    this.riverPosts = [];
    this.riverPostMeshes = [];

    const postDefs = [
      { gridX: 1, gridZ: 4.5, emergent: true,  topY: 2.2, height: 16 },
      { gridX: 3, gridZ: 4.5, emergent: false, topY: -0.6, height: 13 },
      { gridX: 6, gridZ: 4.5, emergent: false, topY: -0.6, height: 13 },
      { gridX: 8, gridZ: 4.5, emergent: true,  topY: 2.2, height: 16 }
    ];

    const postData = [];
    for (const def of postDefs) {
      const worldX = (def.gridX - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
      const worldZ = (def.gridZ - (BOARD_SIZE - 1) / 2) * TILE_SIZE;
      const halfX = 2.4;
      const halfZ = 2.4;

      // River plane spans X: [-120, 120] (domain 240), Z: [-24, 24] (domain 48)
      const uvX = (worldX + 120) / 240;
      const uvZ = (worldZ + 24) / 48;

      postData.push({
        x: worldX,
        z: worldZ,
        halfX,
        halfZ,
        top: def.topY,
        height: def.height,
        uvX,
        uvZ
      });

      // Create physical 3D veined marble pillar mesh in the river channel
      const geo = new THREE.CylinderGeometry(2.2, 2.5, def.height, 16);
      const mat = this.veinedMarbleMaterial || this.materials.stone;
      const mesh = new THREE.Mesh(geo, mat);
      const centerY = def.topY - def.height * 0.5;
      mesh.position.set(worldX, centerY, worldZ);
      mesh.name = `RiverPost_${def.gridX}_${def.gridZ}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Add ornamental capital ring on emergent posts
      if (def.emergent) {
        const capGeo = new THREE.CylinderGeometry(2.8, 2.3, 1.2, 16);
        const capMesh = new THREE.Mesh(capGeo, mat);
        capMesh.position.y = def.height * 0.5 - 0.6;
        mesh.add(capMesh);
      }

      this.boardGroup.add(mesh);
      this.riverPostMeshes.push(mesh);
      this.riverPosts.push({ ...def, worldX, worldZ, uvX, uvZ, mesh });
    }

    if (this.waterSurface) {
      this.waterSurface.setPosts(postData);
    }
  }

  /**
   * Executes the real-time GPU Caustic Mesh projection pass.
   * main.js can call this in the render loop before scene rendering.
   * @param {THREE.WebGLRenderer} renderer
   */
  updateWaterCaustics(renderer) {
    if (this.waterSurface && typeof this.waterSurface.updateCaustics === 'function') {
      this.waterSurface.updateCaustics(renderer);
    }
  }

  /**
   * Spawns an expanding 3D cyan water ripple ring + steps the water ripple solver at (worldX, worldZ).
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} [strength=1.0]
   */
  triggerWaterRipple(worldX, worldZ, strength = 1.0) {
    if (this.waterSurface) {
      this.waterSurface.triggerRipple(worldX, worldZ, strength);
    }
  }

  /**
   * Update highlight animations, FFT water swell, ripples, and caustics.
   * @param {number} now
   * @param {THREE.WebGLRenderer} [renderer]
   */
  update(now, renderer = null) {
    const nowSec = now || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);

    if (this.activeUnitGroup.visible) {
      const pulse = 0.45 + 0.35 * (Math.sin(nowSec * 5.0) * 0.5 + 0.5);
      this.activeUnitMaterial.opacity = pulse;
    }

    if (this.waterSurface) {
      this.waterSurface.update(nowSec);
      if (renderer) {
        this.waterSurface.updateCaustics(renderer);
      }
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

    if (this.marbleBake) {
      this.marbleBake.dispose();
      this.marbleBake = null;
    }
    if (this.veinedMarbleMaterial) {
      this.veinedMarbleMaterial.dispose();
      this.veinedMarbleMaterial = null;
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

    if (this.activeWaterRipples) {
      for (const r of this.activeWaterRipples) {
        if (r.mesh) {
          this.boardGroup.remove(r.mesh);
          r.mesh.geometry?.dispose();
          r.mesh.material?.dispose();
        }
      }
      this.activeWaterRipples = [];
    }

    if (this.waterSwellTexture) {
      this.waterSwellTexture.dispose();
      this.waterSwellTexture = null;
    }
    if (this.waterRippleTexture) {
      this.waterRippleTexture.dispose();
      this.waterRippleTexture = null;
    }

    if (this.waterSurface) {
      this.waterSurface.dispose();
      this.waterSurface = null;
    }
    this.waterSurfaceMesh = null;
    this.waterSurfaceMaterial = null;
    this.waterBasePositions = null;
    this.waterSwell = null;
    this.waterRipples = null;
    this.riverPosts = [];
    this.riverPostMeshes = [];

    if (this.runeSwitches) {
      for (const sw of this.runeSwitches.values()) {
        if (sw.mesh) {
          sw.mesh.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
              if (Array.isArray(c.material)) c.material.forEach((m) => m?.dispose?.());
              else c.material.dispose();
            }
          });
        }
      }
      this.runeSwitches.clear();
    }
    this.interactiveMeshes = [];
    this.tiles = [];
    this.unitActorManager = null;
  }
}
