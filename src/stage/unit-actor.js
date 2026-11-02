import * as THREE from 'three';
import { createAtlas, findAnimation, FACING_X, FACING_Z } from '../tactics-sprite/tactics-sprite.mjs';
import { createTacticsSprite, prepareSheet, SCALE_X, SCALE_Y } from '../tactics-sprite/tactics-sprite-three.mjs';
import { readSetItems } from '../three-isometric-engine/weapons/set-items.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { BOW_SPEC, createBow, resetBow, bendAt, simulateShot } from '@engine/weapons/bow';
import { createBowMesh, createArrowGeometries, createArrowMesh, syncBowMesh } from '@engine/weapons/bow-mesh';
import { solveArc } from '@engine/weapons/ballistics';
import { defaultGravity, spawnFadeMs, despawnFadeMs } from '@engine/constants/physics';
import { CLOTH_BAG_SPEC, createClothBag, resetClothBag, whipClothBag, stepClothBag } from '@engine/weapons/cloth-bag';
import { createClothBagResources, createClothBagMesh, syncClothBagMesh } from '@engine/weapons/cloth-bag-mesh';
import { ITEM_FACES, applyItemFaces as _applyItemFaces, createItemFinishBake } from '@engine/weapons/item-finish';
import { patchGroupSpawnMaterials, updateSpawnProgress, computeSpawnProgress } from '@engine/meshes/spawn-effect';

export { BOW_SPEC, createBow, bendAt, simulateShot, createBowMesh, createArrowGeometries, createArrowMesh, solveArc };
export { CLOTH_BAG_SPEC, createClothBag, resetClothBag, whipClothBag, stepClothBag, createClothBagMesh };
export { ITEM_FACES, createItemFinishBake };

/**
 * Universal wrapper for applyItemFaces supporting both:
 * applyItemFaces(material, bake, itemName)
 * and applyItemFaces(material, face, { plate, inside })
 */
export function applyItemFaces(material, bakeOrFace, nameOrTextures) {
  if (bakeOrFace && (bakeOrFace.plate || bakeOrFace.bake) && typeof nameOrTextures === 'string') {
    const name = nameOrTextures.toLowerCase();
    const bake = bakeOrFace;
    const face = ITEM_FACES[name];
    if (!face) return material;
    const textures = {
      plate: { value: bake.plate },
      inside: { value: name === 'tome' ? bake.pages : bake.back }
    };
    return _applyItemFaces(material, face, textures);
  }
  return _applyItemFaces(material, bakeOrFace, nameOrTextures);
}

export const FACING_NAME_TO_INDEX = {
  E: 0,
  SE: 1,
  S: 2,
  SW: 3,
  W: 4,
  NW: 5,
  N: 6,
  NE: 7
};

export const FACING_INDEX_TO_NAME = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/**
 * Convert any facing representation (string or number) into a valid 0..7 integer.
 * Default is 1 ('SE').
 * @param {string|number} facing
 * @returns {number}
 */
export function toFacingIndex(facing) {
  if (typeof facing === 'number' && !isNaN(facing)) {
    return ((Math.round(facing) % 8) + 8) % 8;
  }
  if (typeof facing === 'string' && FACING_NAME_TO_INDEX[facing] !== undefined) {
    return FACING_NAME_TO_INDEX[facing];
  }
  return 1; // Default SE
}

/**
 * 15-color palette remapping tables for distinct unit visual differentiation.
 * Source a1.png is indexed to 15 colors:
 * Outlines: '281626', '252028' (luma < 0.14)
 * Clothes/Tunic (GG): '263d33' (dark), '2c5b46' (mid), '237253' (light)
 * Metal/Armor (SS): '888988' (dark), 'b8b9b8' (mid), 'e0e1e0' (light)
 * Hair/Cape (H): '5c2259' (shadow), '89326d' (dark), 'a34d95' (mid), 'ae4b9b' (light)
 * Skin/Face (F): 'c972ad' (shadow), 'da7bc4' (mid), 'f5adde' (light)
 */
export const PALETTE_MAPPINGS = {
  // Crimson Order Slot 0 Boss: Obsidian & Blood-Crimson Warlord
  crimson_warlord: {
    '281626': 0x180608,
    '252028': 0x140406,
    // Clothes / tunic: blazing blood-crimson
    '263d33': 0x450a0a,
    '2c5b46': 0x991b1b,
    '237253': 0xdc2626,
    // Metal / armor: dark obsidian-iron with molten gold trim highlight
    '888988': 0x1c1917,
    'b8b9b8': 0x332f2c,
    'e0e1e0': 0xf59e0b,
    // Hair / cape: blood-crimson cape
    '5c2259': 0x2e0606,
    '89326d': 0x7f1d1d,
    'a34d95': 0xb91c1c,
    'ae4b9b': 0xef4444,
    // Skin: pale ash skin & glowing crimson eyes
    'c972ad': 0x78716c,
    'da7bc4': 0xa8a29e,
    'f5adde': 0xe7e5e4
  },

  // Crimson Order Slot 1 Heavy: Blood-Iron Juggernaut
  crimson_vanguard: {
    '281626': 0x140808,
    '252028': 0x100606,
    // Tunic: dark charcoal
    '263d33': 0x18181b,
    '2c5b46': 0x27272a,
    '237253': 0x3f3f46,
    // Armor: deep rust-crimson & bronze plate
    '888988': 0x451a03,
    'b8b9b8': 0x78350f,
    'e0e1e0': 0xb45309,
    // Hair / cape: deep rust crimson
    '5c2259': 0x3b0712,
    '89326d': 0x881337,
    'a34d95': 0xbe123c,
    'ae4b9b': 0xe11d48,
    // Skin: battle-hardened warm skin
    'c972ad': 0x9a3412,
    'da7bc4': 0xc2410c,
    'f5adde': 0xfed7aa
  },

  // Crimson Order Slot 2 Caster: Void-Pyre Hexer
  crimson_hexer: {
    '281626': 0x120618,
    '252028': 0x0e0414,
    // Robes: abyssal violet & necrotic magenta
    '263d33': 0x2e1065,
    '2c5b46': 0x581c87,
    '237253': 0x7e22ce,
    // Trim: necrotic magenta
    '888988': 0x4a044e,
    'b8b9b8': 0x86198f,
    'e0e1e0': 0xc026d3,
    // Hair: ghostly silver-violet
    '5c2259': 0x475569,
    '89326d': 0x64748b,
    'a34d95': 0xa855f7,
    'ae4b9b': 0xd8b4fe,
    // Skin: pale dusk skin
    'c972ad': 0x701a75,
    'da7bc4': 0xa21caf,
    'f5adde': 0xf0abfc
  },

  // Crimson Order Slot 3 Sniper: Nightshade Deadeye
  crimson_deadeye: {
    '281626': 0x0a0c16,
    '252028': 0x080a12,
    // Stealth garb: midnight indigo
    '263d33': 0x0f172a,
    '2c5b46': 0x1e1b4b,
    '237253': 0x312e81,
    // Trim/mask: scarlet mask/trim
    '888988': 0x7f1d1d,
    'b8b9b8': 0xb91c1c,
    'e0e1e0': 0xef4444,
    // Hair: silver hair
    '5c2259': 0x334155,
    '89326d': 0x64748b,
    'a34d95': 0x94a3b8,
    'ae4b9b': 0xe2e8f0,
    // Skin: fair cool ivory
    'c972ad': 0x64748b,
    'da7bc4': 0x94a3b8,
    'f5adde': 0xf1f5f9
  },

  // Azure Clan Slot 0: Royal Cobalt & Mythril Gold
  azure_knight: {
    '281626': 0x081020,
    '252028': 0x060c18,
    // Tunic: royal cobalt
    '263d33': 0x1e3a8a,
    '2c5b46': 0x1d4ed8,
    '237253': 0x3b82f6,
    // Armor: mythril gold
    '888988': 0x92400e,
    'b8b9b8': 0xd97706,
    'e0e1e0': 0xfbbf24,
    // Hair: golden blonde
    '5c2259': 0x78350f,
    '89326d': 0xb45309,
    'a34d95': 0xd97706,
    'ae4b9b': 0xfde047,
    // Skin: healthy fair skin
    'c972ad': 0xb45309,
    'da7bc4': 0xf59e0b,
    'f5adde': 0xffedd5
  },

  // Azure Clan Slot 1: Arcane Sapphire & Starlight Cyan
  azure_mage: {
    '281626': 0x061424,
    '252028': 0x040e1c,
    // Robes: arcane sapphire
    '263d33': 0x0c4a6e,
    '2c5b46': 0x0284c7,
    '237253': 0x0ea5e9,
    // Trim: starlight cyan
    '888988': 0x0891b2,
    'b8b9b8': 0x06b6d4,
    'e0e1e0': 0x67e8f9,
    // Hair: mystical midnight
    '5c2259': 0x0f172a,
    '89326d': 0x1e293b,
    'a34d95': 0x334155,
    'ae4b9b': 0x475569,
    // Skin: fair starlight skin
    'c972ad': 0x94a3b8,
    'da7bc4': 0xcbd5e1,
    'f5adde': 0xf8fafc
  },

  // Azure Clan Slot 2: Emerald Forest & Gold-Leaf
  azure_ranger: {
    '281626': 0x061810,
    '252028': 0x04120c,
    // Cloak: emerald forest
    '263d33': 0x064e3b,
    '2c5b46': 0x047857,
    '237253': 0x10b981,
    // Trim/leather: gold-leaf
    '888988': 0x78350f,
    'b8b9b8': 0xb45309,
    'e0e1e0': 0xf59e0b,
    // Hair: auburn chestnut
    '5c2259': 0x451a03,
    '89326d': 0x7c2d12,
    'a34d95': 0x9a3412,
    'ae4b9b': 0xea580c,
    // Skin: warm sun-kissed skin
    'c972ad': 0xc2410c,
    'da7bc4': 0xfb923c,
    'f5adde': 0xfed7aa
  },

  // Azure Clan Slot 3: Celestial White-Gold & Azure
  azure_paladin: {
    '281626': 0x0a101c,
    '252028': 0x060c16,
    // Tabard: royal azure
    '263d33': 0x1e40af,
    '2c5b46': 0x2563eb,
    '237253': 0x60a5fa,
    // Armor: celestial white-silver
    '888988': 0x64748b,
    'b8b9b8': 0x94a3b8,
    'e0e1e0': 0xf1f5f9,
    // Hair: platinum gold
    '5c2259': 0xa16207,
    '89326d': 0xca8a04,
    'a34d95': 0xeab308,
    'ae4b9b': 0xfef08a,
    // Skin: radiant noble skin
    'c972ad': 0x9a3412,
    'da7bc4': 0xea580c,
    'f5adde': 0xffedd5
  }
};

export class StageUnitManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.units = new Map(); // id -> actor
    this.models = {}; // 'rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'
    this.projectiles = [];
    this.hitBursts = [];

    this.atlas = null;
    this.sheet = null;
    this.rawImage = null;
    this.paletteCache = new Map();

    this.marbleTexture = null;
    this.marbleMesh = null;
    this.envMap = null;

    // Faction weapon material templates
    this.azureMythrilMaterial = null;
    this.crimsonObsidianMaterial = null;
    this.mythrilMaterial = null; // backward compatibility alias

    // GPU-baked item finish for hammered shield and spellbook pages
    this.itemFinishBake = null;
    this.clothBagResources = null;
    this.lootBags = new Map(); // "${x},${z}" -> { mesh, x, z, data }

    this.loaded = false;
  }

  /**
   * Load sprite data, sprite sheet, Set 3D item models, and materials.
   * @param {THREE.WebGLRenderer|null} renderer
   */
  async loadAssets(renderer = null) {
    // 1. Load sprite data
    const spriteData = await this._loadJson('/tactics-sprite-data.json');
    this.atlas = createAtlas(spriteData);

    // 2. Load and prepare sheet
    const rawSheet = await this._loadTexture('/a1.png');
    this.sheet = prepareSheet(rawSheet);
    this.rawImage = rawSheet.image || null;

    // 3. Load marble texture
    this.marbleTexture = await this._loadTexture('/marble-black.gif');

    // 4. Load baked Set items GLB
    const glbBuffer = await this._loadArrayBuffer('/set-items.glb');
    const rawItems = readSetItems(glbBuffer);

    // Build BufferGeometry for all 7 Set models:
    // 'rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'
    const setNames = ['rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'];
    for (const name of setNames) {
      const item = rawItems[name];
      if (item) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(item.position, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(item.normal, 3));
        geo.setAttribute('color', new THREE.Uint8BufferAttribute(item.color, 4, true));
        geo.setIndex(new THREE.Uint16BufferAttribute(item.index, 1));
        this.models[name] = geo;
      }
    }

    // 5. Create reflective materials using RoomEnvironment PMREM
    if (renderer) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        this.envMap = pmrem.fromScene(room, 0.03).texture;
        room.dispose();
        pmrem.dispose();
      } catch (err) {
        console.warn('[StageUnitManager] PMREMGenerator warning:', err);
      }
    }

    // Azure-Mythril gleaming alloy material
    this.azureMythrilMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.88,
      roughness: 0.20,
      color: 0x93c5fd,
      envMap: this.envMap
    });

    // Crimson-Obsidian sinister dark steel material
    this.crimsonObsidianMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.92,
      roughness: 0.16,
      color: 0x991b1b,
      envMap: this.envMap
    });

    this.mythrilMaterial = this.azureMythrilMaterial;

    // 6. Sphere mesh for thrown stones/marbles
    const marbleGeo = new THREE.SphereGeometry(2.2, 16, 16);
    const marbleMat = new THREE.MeshStandardMaterial({
      map: this.marbleTexture,
      color: 0x1a1a1a,
      roughness: 0.22,
      metalness: 0.75,
      envMap: this.envMap
    });
    this.marbleMesh = new THREE.Mesh(marbleGeo, marbleMat);

    // 7. Initialize GPU-baked item finish (hammered shield rivets & spellbook pages)
    if (renderer) {
      try {
        this.itemFinishBake = createItemFinishBake(renderer);
        this.itemFinishBake.bake();
      } catch (err) {
        console.warn('[StageUnitManager] createItemFinishBake fallback:', err);
        this.itemFinishBake = null;
      }
    } else {
      this.itemFinishBake = null;
    }

    // 8. Shared resources for XPBD physics cloth bag
    try {
      this.clothBagResources = createClothBagResources(CLOTH_BAG_SPEC);
    } catch (err) {
      console.warn('[StageUnitManager] createClothBagResources fallback:', err);
      this.clothBagResources = null;
    }

    this.loaded = true;
    return this;
  }

  /**
   * Generates a cached CanvasTexture with pixel-level palette synthesis.
   * Preserves dark outlines (luma < 0.14) and remaps colors cleanly.
   * @param {string} paletteId
   * @param {'azure'|'crimson'} [team='azure']
   * @param {number} [index=0]
   * @returns {THREE.Texture}
   */
  getPalettedSheetTexture(paletteId, team = 'azure', index = 0) {
    if (!paletteId) {
      const isCrimson = team === 'crimson' || team === 'red';
      paletteId = isCrimson
        ? (index === 0 ? 'crimson_warlord' : index === 1 ? 'crimson_vanguard' : index === 2 ? 'crimson_hexer' : 'crimson_deadeye')
        : (index === 0 ? 'azure_knight' : index === 1 ? 'azure_mage' : index === 2 ? 'azure_ranger' : 'azure_paladin');
    }

    if (this.paletteCache.has(paletteId)) {
      return this.paletteCache.get(paletteId);
    }

    if (typeof document === 'undefined' || !this.rawImage) {
      return this.sheet;
    }

    const mapping = PALETTE_MAPPINGS[paletteId];
    if (!mapping) {
      return this.sheet;
    }

    const w = this.rawImage.width || 256;
    const h = this.rawImage.height || 488;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(this.rawImage, 0, 0);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
      const targetColor = mapping[hex];

      if (targetColor !== undefined) {
        data[i] = (targetColor >> 16) & 0xff;
        data[i + 1] = (targetColor >> 8) & 0xff;
        data[i + 2] = targetColor & 0xff;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    this.paletteCache.set(paletteId, texture);
    return texture;
  }

  /**
   * Helper to generate a 5-tier metallic standard material:
   * 'bronze', 'iron', 'mythril', 'gold', 'adamantite'.
   * @param {'azure'|'crimson'|'blue'|'red'} [team='azure']
   * @param {'bronze'|'iron'|'mythril'|'gold'|'adamantite'} [finishTier='mythril']
   * @param {boolean} [isWeapon=false]
   * @returns {THREE.MeshStandardMaterial}
   */
  _createTierMaterial(team = 'azure', finishTier = 'mythril', isWeapon = false) {
    const isCrimson = team === 'crimson' || team === 'red';
    const tier = (finishTier || 'mythril').toLowerCase();

    let color = isCrimson ? 0x991b1b : 0x93c5fd;
    let metalness = 0.88;
    let roughness = 0.20;
    let emissive = 0x000000;
    let emissiveIntensity = 0;

    switch (tier) {
      case 'bronze':
        color = 0xcd7f32;
        metalness = 0.75;
        roughness = 0.35;
        break;
      case 'iron':
        color = 0x64748b;
        metalness = 0.85;
        roughness = 0.28;
        break;
      case 'mythril':
        color = isCrimson ? 0x991b1b : 0x93c5fd;
        metalness = isCrimson ? 0.92 : 0.88;
        roughness = isCrimson ? 0.16 : 0.20;
        break;
      case 'gold':
        color = 0xf59e0b;
        metalness = 0.95;
        roughness = 0.12;
        emissive = 0x78350f;
        emissiveIntensity = 0.35;
        break;
      case 'adamantite':
        color = 0x06b6d4;
        metalness = 0.98;
        roughness = 0.08;
        emissive = 0x0891b2;
        emissiveIntensity = 0.45;
        break;
      default:
        color = isCrimson ? 0x991b1b : 0x93c5fd;
        metalness = isCrimson ? 0.92 : 0.88;
        roughness = isCrimson ? 0.16 : 0.20;
        break;
    }

    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity,
      vertexColors: isWeapon,
      envMap: this.envMap
    });
  }

  /**
   * Instantiate a 3D weapon mesh from cached models with 5 finish tiers:
   * 'bronze', 'iron', 'mythril', 'gold', 'adamantite'.
   * Supports:
   * - 2400Hz flexible Bow ('bow')
   * - XPBD physics cloth bag flail ('cloth_bag')
   * - GPU-baked hammered shield and spellbook pages ('shield', 'tome')
   * - Thrown marble ('marble', 'stone')
   * - Set items ('sword', 'katana', 'spear', 'rifle', 'harp')
   * @param {string} name
   * @param {'azure'|'crimson'|'blue'|'red'} [team='azure']
   * @param {'bronze'|'iron'|'mythril'|'gold'|'adamantite'} [finishTier='mythril']
   * @returns {THREE.Mesh|THREE.Group|null}
   */
  createWeaponMesh(name, team = 'azure', finishTier = 'mythril') {
    if (!name) return null;
    const lower = name.toLowerCase();

    // 1. Thrown Stone / Marble
    if (lower === 'marble' || lower === 'stone') {
      if (!this.marbleMesh) return null;
      const mesh = new THREE.Mesh(this.marbleMesh.geometry.clone(), this.marbleMesh.material.clone());
      mesh.name = `WeaponMesh_marble_${team}`;
      return mesh;
    }

    // 2. 2400Hz Flexible Physics Bow
    if (lower === 'bow') {
      const bow = createBow(BOW_SPEC);
      const staveMat = this._createTierMaterial(team, finishTier, true);
      const stringMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
      const bowMesh = createBowMesh(bow, { stave: staveMat, string: stringMat });
      bowMesh.userData.bow = bow;
      bowMesh.name = `WeaponMesh_bow_${team}_${finishTier}`;
      return bowMesh;
    }

    // 3. XPBD Physics Cloth Bag Flail
    if (lower === 'cloth_bag' || lower === 'bag' || lower === 'clothbag') {
      const bag = createClothBag(CLOTH_BAG_SPEC);
      resetClothBag(bag, 0, 0);
      this.clothBagResources = this.clothBagResources || createClothBagResources(CLOTH_BAG_SPEC);
      const bagMat = this._createTierMaterial(team, finishTier, true);
      const group = new THREE.Group();
      const bagMesh = createClothBagMesh(bag, this.clothBagResources, bagMat, group);
      syncClothBagMesh(bagMesh, bag, new THREE.Vector3(0, 0, 0), 1, 0);
      group.userData.clothBag = { bag, bagMesh };
      group.name = `WeaponMesh_cloth_bag_${team}_${finishTier}`;
      return group;
    }

    // 4. Set Item Models
    const geo = this.models[lower] || this.models.sword;
    if (!geo) return null;

    const mat = this._createTierMaterial(team, finishTier, true);

    // Apply GPU-baked hammered finish for shield and spellbook pages for tome
    if (this.itemFinishBake && (lower === 'shield' || lower === 'tome')) {
      try {
        applyItemFaces(mat, this.itemFinishBake, lower);
      } catch (err) {
        console.warn('[StageUnitManager] applyItemFaces warning:', err);
      }
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `WeaponMesh_${lower}_${team}_${finishTier}`;
    return mesh;
  }

  /**
   * Hot-swap 3D idle weapon mesh on a unit actor live on stage.
   * @param {string|number|Object} unitOrId
   * @param {string} weaponName
   * @param {string} [team]
   */
  setUnitWeapon(unitOrId, weaponName, team) {
    const actor = this._getActor(unitOrId);
    if (!actor) return;

    const unitTeam = team || actor.team || 'azure';
    const newMesh = this.createWeaponMesh(weaponName, unitTeam);
    if (!newMesh) return;

    if (actor.idleWeaponMesh) {
      if (actor.idleWeaponMesh.material) {
        actor.idleWeaponMesh.material.dispose();
      }
      this.scene.remove(actor.idleWeaponMesh);
      actor.idleWeaponMesh = null;
    }

    const aScale = actor.actorScale || 1.0;
    newMesh.scale.setScalar(0.72 * aScale);
    newMesh.frustumCulled = false;
    newMesh.visible = !actor.unit.isDead;
    this.scene.add(newMesh);
    actor.idleWeaponMesh = newMesh;
  }

  /**
   * Create ground indicator ring / plinth.
   * For Crimson Order: includes a 3D raised octagonal spiked beacon rim.
   * For Enemy Boss: includes a dual golden-crimson aura.
   * @param {number} color
   * @param {boolean} [isCrimson=false]
   * @param {boolean} [isBoss=false]
   * @returns {THREE.Group}
   */
  createTeamRing(color, isCrimson = false, isBoss = false) {
    const group = new THREE.Group();
    group.name = 'TeamRing';

    // 1. Flat ground plinth group lying in X-Z plane
    const flatGroup = new THREE.Group();
    flatGroup.rotation.x = -Math.PI / 2;

    // Outer smooth ring
    const outerGeo = new THREE.RingGeometry(7.5, 9.4, 32);
    const outerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isCrimson ? 0.8 : 0.65,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);

    // Inner octagon plinth
    const innerGeo = new THREE.RingGeometry(1.2, 6.8, 8);
    const innerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isCrimson ? 0.45 : 0.3,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const innerOct = new THREE.Mesh(innerGeo, innerMat);

    // Octagram star boundary lines
    const starGeo = new THREE.EdgesGeometry(new THREE.CircleGeometry(8.5, 8));
    const starMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85
    });
    const starLines = new THREE.LineSegments(starGeo, starMat);
    flatGroup.add(outerRing, innerOct, starLines);

    // Golden inner aura for the boss
    if (isBoss) {
      const bossAuraGeo = new THREE.RingGeometry(3.5, 7.2, 8);
      const bossAuraMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const bossAura = new THREE.Mesh(bossAuraGeo, bossAuraMat);
      bossAura.position.z = 0.01;
      flatGroup.add(bossAura);
    }

    group.add(flatGroup);

    // 2. 3D Raised octagonal spiked beacon rim for Crimson Order (unmistakable at 23° angle)
    if (isCrimson) {
      const rimGeo = new THREE.CylinderGeometry(7.8, 8.4, 1.4, 8, 1, true);
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = 0.7;
      group.add(rimMesh);

      const rimEdgeGeo = new THREE.EdgesGeometry(rimGeo);
      const rimEdgeMat = new THREE.LineBasicMaterial({
        color: isBoss ? 0xfde047 : 0xffa4a4,
        transparent: true,
        opacity: 0.95
      });
      const rimEdges = new THREE.LineSegments(rimEdgeGeo, rimEdgeMat);
      rimEdges.position.y = 0.7;
      group.add(rimEdges);
    }

    return group;
  }

  /**
   * Floating 3D Boss Crown / Diamond Sigil for Warlord.
   * @returns {THREE.Group}
   */
  createBossCrown() {
    const crownGroup = new THREE.Group();
    crownGroup.name = 'BossCrown';

    // Central Octahedron diamond
    const diamondGeo = new THREE.OctahedronGeometry(2.4, 0);
    diamondGeo.scale(1.0, 1.4, 1.0);
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.65,
      metalness: 0.85,
      roughness: 0.2,
      envMap: this.envMap
    });
    const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
    crownGroup.add(diamondMesh);

    // Glowing halo ring around crown
    const haloGeo = new THREE.TorusGeometry(3.6, 0.22, 8, 16);
    haloGeo.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    crownGroup.add(halo);

    return crownGroup;
  }

  /**
   * Spawns paletted sprites, 3D idle weapons, team plinths, and boss crowns for units.
   * @param {Array<Object>} units
   * @param {IsometricBoard} board
   */
  spawnUnits(units, board) {
    // Clear existing units
    this.dispose();

    if (!units || !units.length) return;

    if (board && typeof board.setUnitActorManager === 'function') {
      board.setUnitActorManager(this);
    }

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (unit.x === undefined && unit.gridX !== undefined) unit.x = unit.gridX;
      if (unit.z === undefined && unit.gridZ !== undefined) unit.z = unit.gridZ;
      if (unit.gridX === undefined && unit.x !== undefined) unit.gridX = unit.x;
      if (unit.gridZ === undefined && unit.z !== undefined) unit.gridZ = unit.z;

      const isBlue = unit.clan === 'blue' || unit.team === 'blue' || unit.team === 'azure';
      const team = isBlue ? 'azure' : 'crimson';
      const slotIndex = (unit.unitIndex !== undefined ? unit.unitIndex : i) % 4;
      const isBoss = !isBlue && (unit.isBoss || slotIndex === 0);

      // Determine palette ID
      let paletteId = unit.paletteId;
      if (!paletteId) {
        if (isBlue) {
          paletteId = slotIndex === 0 ? 'azure_knight'
            : slotIndex === 1 ? 'azure_mage'
            : slotIndex === 2 ? 'azure_ranger'
            : 'azure_paladin';
        } else {
          paletteId = isBoss ? 'crimson_warlord'
            : slotIndex === 1 ? 'crimson_vanguard'
            : slotIndex === 2 ? 'crimson_hexer'
            : 'crimson_deadeye';
        }
      }

      // Determine stature scale:
      // Boss: 1.18, Heavy: 1.08, Deadeye: 0.94, Paladin: 1.08
      let actorScale = unit.scale;
      if (actorScale === undefined) {
        if (!isBlue) {
          actorScale = isBoss ? 1.18 : slotIndex === 1 ? 1.08 : slotIndex === 3 ? 0.94 : 1.0;
        } else {
          actorScale = slotIndex === 3 ? 1.08 : slotIndex === 1 ? 0.98 : slotIndex === 2 ? 1.02 : 1.0;
        }
      }

      // Get unique paletted sheet texture
      const sheetTexture = this.getPalettedSheetTexture(paletteId, team, slotIndex);

      // CRITICAL FIX 1: ALWAYS convert facing to valid integer (0..7) BEFORE createTacticsSprite
      const facingIdx = toFacingIndex(unit.facing);
      const animation = unit.animation || 'Idle';

      const sprite = createTacticsSprite(this.atlas, sheetTexture, {
        facing: facingIdx,
        animation,
        scaleX: SCALE_X * actorScale,
        scaleY: SCALE_Y * actorScale
      });
      sprite.player.facing = facingIdx;

      // Check if unit is spawning in water (wadeable shallow stream)
      const tile = board?.getTile?.(unit.x, unit.z);
      const isInWater = (tile?.terrain === 'water' || tile?.isWater) && unit.status !== 'floating';
      const waterOffset = isInWater ? -3.5 : 0;

      // Stance position at worldPos.x, worldPos.y + sprite.standHeight + waterOffset, worldPos.z
      const worldPos = board.tileToWorld(unit.x, unit.z, unit.elevation);
      sprite.group.position.set(worldPos.x, worldPos.y + sprite.standHeight + waterOffset, worldPos.z);
      if (isInWater) {
        sprite.player.water = true;
        board?.triggerWaterRipple?.(worldPos.x, worldPos.z, 1.0);
      } else {
        sprite.player.water = false;
      }
      this.scene.add(sprite.group);

      // PS1 / FFTA 4x4 Bayer Dithered Spawn Materialization
      const spawnRefs = patchGroupSpawnMaterials(sprite.group);
      updateSpawnProgress(spawnRefs, 0.0);

      // Under-foot grounded team indicator ring
      const ringColor = isBlue ? 0x38bdf8 : 0xf43f5e;
      const ring = this.createTeamRing(ringColor, !isBlue, isBoss);
      ring.position.set(worldPos.x, worldPos.y + 0.12, worldPos.z);
      this.scene.add(ring);

      // Boss Crown floating above Warlord's head
      let bossCrown = null;
      if (isBoss) {
        bossCrown = this.createBossCrown();
        bossCrown.position.set(worldPos.x, worldPos.y + sprite.standHeight + 22, worldPos.z);
        this.scene.add(bossCrown);
      }

      // Persistent 3D weapon held/holstered during Idle and Walk
      const weaponType = this._determineUnitWeaponName(unit);
      const idleWeaponMesh = this.createWeaponMesh(weaponType, team);
      if (idleWeaponMesh) {
        idleWeaponMesh.scale.setScalar(0.72 * actorScale);
        idleWeaponMesh.frustumCulled = false;
        this.scene.add(idleWeaponMesh);
      }

      // Hitbox cylinder for raycasting top of tile / body selection
      const hitboxGeo = new THREE.CylinderGeometry(7.5, 7.5, 26, 8);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });
      const hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitboxMesh.position.set(worldPos.x, worldPos.y + 13, worldPos.z);
      this.scene.add(hitboxMesh);

      // Helper to set facing easily and safely
      sprite.setFacing = (f) => {
        const idx = toFacingIndex(f);
        sprite.player.facing = idx;
        unit.facing = FACING_INDEX_TO_NAME[idx];
      };

      const actor = {
        unit,
        team,
        paletteId,
        actorScale,
        sprite,
        ring,
        bossCrown,
        idleWeaponMesh,
        carriedMesh: null,
        hitboxMesh,
        groundY: worldPos.y,
        inWater: isInWater,
        spawnRefs,
        spawnStartTime: typeof performance !== 'undefined' ? performance.now() / 1000 : 0,
        spawnProgress: 0.0,
        statusRingMesh: null,
        _materialProxy: null
      };

      // Wrap sprite.play so wading sprites keep player.water = true during animations
      const origPlay = sprite.play.bind(sprite);
      sprite.play = (anim, at, opts = {}) => {
        if (actor.inWater && actor.unit.status !== 'floating') {
          opts = { ...opts, water: true };
        }
        const res = origPlay(anim, at, opts);
        if (actor.inWater && actor.unit.status !== 'floating') {
          actor.sprite.player.water = true;
        }
        return res;
      };

      // Alias sprite.mesh to sprite.group and support actor.sprite.mesh.material.opacity = 0.28
      sprite.mesh = sprite.group;
      actor._materialProxy = {
        _opacity: 1.0,
        get opacity() {
          return this._opacity;
        },
        set opacity(val) {
          this._opacity = val;
          if (sprite.group) {
            sprite.group.traverse((child) => {
              if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = val;
                child.material.needsUpdate = true;
              }
            });
          }
        }
      };

      Object.defineProperty(sprite.group, 'material', {
        get: () => actor._materialProxy,
        configurable: true
      });

      hitboxMesh.userData.unitActor = actor;
      hitboxMesh.userData.tile = { x: unit.x, z: unit.z, elevation: unit.elevation };

      const id = unit.id !== undefined ? unit.id : `unit_${team}_${slotIndex}`;
      unit.isDead = false;
      unit.alive = true;
      if (sprite.group) sprite.group.visible = true;
      this.setActorOpacity(actor, 1.0);
      this.units.set(id, actor);
    }
  }

  /**
   * Smoothly moves unit step-by-step along path.
   * Keeps team ring grounded on floor surface (lerping baseY + 0.12).
   * @param {Object} unit
   * @param {Array<{ x: number, z: number, elevation?: number }>} path
   * @param {IsometricBoard} board
   * @param {Function} [nowSecGetter]
   * @returns {Promise<void>}
   */
  async animateMovePath(unit, path, board, nowSecGetter) {
    const actor = this._getActor(unit);
    if (!actor || !path || path.length <= 1) return;

    const getNow = typeof nowSecGetter === 'function' ? nowSecGetter : () => performance.now() / 1000;
    const nextFrame = (cb) => setTimeout(cb, 16);

    for (let i = 0; i < path.length - 1; i++) {
      const prev = path[i];
      const next = path[i + 1];

      // CRITICAL FIX 1 & 2: facing calculation and safe conversion
      const facing = board.getFacingBetween(prev.x, prev.z, next.x, next.z);
      actor.sprite.setFacing(facing);

      const prevElev = prev.elevation !== undefined ? prev.elevation : (board.getTile(prev.x, prev.z)?.elevation ?? 0);
      const nextElev = next.elevation !== undefined ? next.elevation : (board.getTile(next.x, next.z)?.elevation ?? 0);
      const dElev = nextElev - prevElev;

      const startWorld = board.tileToWorld(prev.x, prev.z, prevElev);
      const targetWorld = board.tileToWorld(next.x, next.z, nextElev);

      const nextTile = board.getTile(next.x, next.z);
      const prevTile = board.getTile(prev.x, prev.z);
      const isWaterStep = (nextTile?.terrain === 'water' || nextTile?.isWater) && actor.unit.status !== 'floating';
      const prevInWater = (prevTile?.terrain === 'water' || prevTile?.isWater) && actor.unit.status !== 'floating';

      actor.inWater = isWaterStep;
      if (isWaterStep) {
        actor.sprite.player.water = true;
        board?.triggerWaterRipple?.(targetWorld.x, targetWorld.z, 1.0);
      } else {
        actor.sprite.player.water = false;
      }

      let animName = 'Walk Fast';
      if (dElev > 0) animName = 'Jump Up';
      else if (dElev < 0) animName = 'Jump Down';

      actor.sprite.play(animName, getNow());

      const stepDuration = dElev !== 0 ? 0.38 : 0.28;

      // Defect D-18 fix: if walking onto a dead unit's tile, hide the corpse
      for (const otherActor of this.units.values()) {
        if (otherActor !== actor && otherActor.unit?.isDead) {
          const ox = otherActor.unit.gridX !== undefined ? otherActor.unit.gridX : otherActor.unit.x;
          const oz = otherActor.unit.gridZ !== undefined ? otherActor.unit.gridZ : otherActor.unit.z;
          if (ox === next.x && oz === next.z) {
            if (otherActor.sprite?.group) {
              otherActor.sprite.group.visible = false;
            }
          }
        }
      }

      await new Promise((resolve) => {
        const startTime = getNow();
        const tick = () => {
          const elapsed = getNow() - startTime;
          const s = Math.min(1, Math.max(0, elapsed / stepDuration));

          const curX = startWorld.x + (targetWorld.x - startWorld.x) * s;
          const curZ = startWorld.z + (targetWorld.z - startWorld.z) * s;
          let curY = startWorld.y + (targetWorld.y - startWorld.y) * s;

          if (dElev > 0) {
            curY += Math.sin(s * Math.PI) * (dElev * 7 + 8);
          } else if (dElev < 0) {
            curY += Math.sin(s * Math.PI) * 6;
          }

          // Sprite follows movement with water wade vertical offset (-3.5 when wading)
          const startWaterOffset = prevInWater ? -3.5 : 0;
          const targetWaterOffset = isWaterStep ? -3.5 : 0;
          const currentWaterOffset = startWaterOffset + (targetWaterOffset - startWaterOffset) * s;
          actor.sprite.group.position.set(curX, curY + actor.sprite.standHeight + currentWaterOffset, curZ);

          // CRITICAL FIX 5 (D-14): Keep ring grounded on floor surface!
          const groundY = startWorld.y + (targetWorld.y - startWorld.y) * s;
          actor.groundY = groundY;
          actor.ring.position.set(curX, groundY + 0.12, curZ);

          if (actor.hitboxMesh) {
            actor.hitboxMesh.position.set(curX, groundY + 13, curZ);
          }

          if (s < 1) {
            nextFrame(tick);
          } else {
            const finalWaterOffset = isWaterStep ? -3.5 : 0;
            actor.sprite.group.position.set(targetWorld.x, targetWorld.y + actor.sprite.standHeight + finalWaterOffset, targetWorld.z);
            actor.groundY = targetWorld.y;
            actor.ring.position.set(targetWorld.x, targetWorld.y + 0.12, targetWorld.z);

            if (actor.hitboxMesh) {
              actor.hitboxMesh.position.set(targetWorld.x, targetWorld.y + 13, targetWorld.z);
              actor.hitboxMesh.userData.tile = { x: next.x, z: next.z, elevation: nextElev };
            }

            actor.unit.x = next.x;
            actor.unit.z = next.z;
            actor.unit.gridX = next.x;
            actor.unit.gridZ = next.z;
            actor.unit.elevation = nextElev;
            resolve();
          }
        };
        nextFrame(tick);
      });
    }

    // Finished movement: return to 'Idle' (or 'Critical' if HP < 25%)
    const hp = actor.unit.hp ?? actor.unit.currentHp ?? 100;
    const maxHp = actor.unit.maxHp ?? 100;
    const isLowHp = maxHp > 0 && hp / maxHp < 0.25;
    const finalAnim = isLowHp ? 'Critical' : 'Idle';
    actor.sprite.play(finalAnim, getNow());
  }

  /**
   * Animate combat action: attacker strikes/shoots, projectile flight, impact burst,
   * reaction animation, shield block attachment, and defeat cleanup.
   * @param {Object} attacker
   * @param {Object} defender
   * @param {Object} forecast
   * @param {Object} outcome
   * @param {IsometricBoard} board
   * @param {Function} [nowSecGetter]
   * @returns {Promise<void>}
   */
  async animateCombatAction(attacker, defender, forecast, outcome, board, nowSecGetter) {
    const attackerActor = this._getActor(attacker);
    const defenderActor = this._getActor(defender);
    if (!attackerActor || !defenderActor) return;

    const getNow = typeof nowSecGetter === 'function' ? nowSecGetter : () => performance.now() / 1000;
    const nextFrame = (cb) => setTimeout(cb, 16);

    // 1. Turn attacker toward defender
    const attFacing = board.getFacingBetween(attackerActor.unit.x, attackerActor.unit.z, defenderActor.unit.x, defenderActor.unit.z);
    attackerActor.sprite.setFacing(attFacing);

    // Turn defender toward attacker
    const defFacing = board.getFacingBetween(defenderActor.unit.x, defenderActor.unit.z, attackerActor.unit.x, attackerActor.unit.z);
    defenderActor.sprite.setFacing(defFacing);

    // Hide persistent idle weapon while attack weapon runs
    if (attackerActor.idleWeaponMesh) {
      attackerActor.idleWeaponMesh.visible = false;
    }

    // 2. Attach 3D Set weapon mesh corresponding to forecast.animationName
    const animName = forecast?.animationName || 'Swing High';
    const holdData = this.atlas?.data?.holds?.[animName];
    const holdItemName = holdData?.item || attackerActor.unit.heldModelName || this._determineUnitWeaponName(attackerActor.unit);
    const weaponMesh = this.createWeaponMesh(holdItemName, attackerActor.team);

    if (weaponMesh) {
      this.scene.add(weaponMesh);
      attackerActor.carriedMesh = weaponMesh;

      if (holdData) {
        try {
          attackerActor.sprite.carry(weaponMesh, animName);
        } catch (e) {
          console.warn('[StageUnitManager] carry weapon warning:', e);
          const facing = toFacingIndex(attackerActor.sprite.player.facing);
          const fX = FACING_X[facing];
          const fZ = FACING_Z[facing];
          const pos = attackerActor.sprite.group.position;
          weaponMesh.position.set(pos.x + fX * 5, pos.y + 10, pos.z + fZ * 5);
          weaponMesh.scale.setScalar(0.72 * (attackerActor.actorScale || 1.0));
        }
      } else {
        // CRITICAL FIX 4 (D-06): NEVER leave weapon at (0,0,0) for Bow/Casting/Throw!
        const facing = toFacingIndex(attackerActor.sprite.player.facing);
        const fX = FACING_X[facing];
        const fZ = FACING_Z[facing];
        const pos = attackerActor.sprite.group.position;
        weaponMesh.position.set(pos.x + fX * 5, pos.y + 10, pos.z + fZ * 5);
        weaponMesh.lookAt(defenderActor.sprite.group.position.x, pos.y + 10, defenderActor.sprite.group.position.z);
        weaponMesh.scale.setScalar(0.72 * (attackerActor.actorScale || 1.0));
      }
    }

    // 3. Play attacker animation
    const startTime = getNow();
    attackerActor.sprite.play(animName, startTime);

    // 4. Combat effects synced to hit moment
    const isRanged =
      animName.startsWith('Bow') ||
      animName.startsWith('Gun') ||
      animName.includes('Casting') ||
      animName.startsWith('Item Throw') ||
      animName.includes('Throw');

    const attackerPos = attackerActor.sprite.group.position.clone();
    attackerPos.y += 12; // Release from chest/arm
    const defenderPos = defenderActor.sprite.group.position.clone();
    defenderPos.y += 10; // Chest target

    if (isRanged) {
      // 2400Hz Flexible Bow limb bending during draw phase
      if (weaponMesh && weaponMesh.userData?.bow) {
        const bow = weaponMesh.userData.bow;
        const { phi } = bendAt(bow, BOW_SPEC.drawLength);
        bow.phi = phi;
        syncBowMesh(weaponMesh, bow);
      }

      await this._sleep(150);

      // Spawn flying projectile (3D flexible bow arrow, gun bullet, spell sphere, or stone)
      await new Promise((resolve) => {
        if (animName.startsWith('Bow') || holdItemName === 'bow') {
          const dx = Math.hypot(defenderPos.x - attackerPos.x, defenderPos.z - attackerPos.z);
          const dy = defenderPos.y - attackerPos.y;
          const arrowSpeed = 190;
          const solved = solveArc(dx, dy, arrowSpeed);
          const flightDuration = solved ? solved.flightS : 0.32;
          const vh = solved ? solved.vh : (dx / flightDuration);
          const vv = solved ? solved.vv : ((dy - 0.5 * defaultGravity * flightDuration * flightDuration) / flightDuration);

          const arrowGeos = createArrowGeometries(BOW_SPEC.arrowLength);
          const arrowMats = {
            shaft: new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 }),
            head: new THREE.MeshStandardMaterial({ color: 0xd4e0ed, metalness: 0.8, roughness: 0.2 }),
            vanes: new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide })
          };
          const arrowMesh = createArrowMesh(arrowGeos, arrowMats);
          arrowMesh.scale.setScalar(0.72);
          this.scene.add(arrowMesh);

          const flightStart = getNow();
          const animArrow = () => {
            const elapsed = getNow() - flightStart;
            const t = Math.min(elapsed, flightDuration);
            const s = flightDuration > 0 ? t / flightDuration : 1;
            const px = attackerPos.x + (defenderPos.x - attackerPos.x) * s;
            const pz = attackerPos.z + (defenderPos.z - attackerPos.z) * s;
            const py = attackerPos.y + vv * t + 0.5 * defaultGravity * t * t;

            const curVy = vv + defaultGravity * t;
            const dirX = dx > 0 ? (defenderPos.x - attackerPos.x) / dx : 0;
            const dirZ = dx > 0 ? (defenderPos.z - attackerPos.z) / dx : 0;
            const curVx = dirX * vh;
            const curVz = dirZ * vh;

            arrowMesh.position.set(px, py, pz);
            arrowMesh.lookAt(px + curVx, py + curVy, pz + curVz);

            if (elapsed < flightDuration) {
              nextFrame(animArrow);
            } else {
              this.scene.remove(arrowMesh);
              arrowGeos.shaft.dispose();
              arrowGeos.head.dispose();
              arrowGeos.vanes.dispose();
              arrowMats.shaft.dispose();
              arrowMats.head.dispose();
              arrowMats.vanes.dispose();
              if (weaponMesh && weaponMesh.userData?.bow) {
                resetBow(weaponMesh.userData.bow);
                syncBowMesh(weaponMesh, weaponMesh.userData.bow);
              }
              resolve();
            }
          };
          nextFrame(animArrow);
          return;
        }

        let projMesh;
        if (animName.startsWith('Gun')) {
          const geo = new THREE.CylinderGeometry(0.3, 0.3, 12, 6);
          geo.rotateZ(Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
          projMesh = new THREE.Mesh(geo, mat);
        } else if (animName.includes('Casting')) {
          const geo = new THREE.SphereGeometry(2.5, 12, 12);
          const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
          projMesh = new THREE.Mesh(geo, mat);
        } else {
          projMesh = this.createWeaponMesh('marble', attackerActor.team) ||
            new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        }

        projMesh.position.copy(attackerPos);
        this.scene.add(projMesh);

        const flightDuration = animName.startsWith('Gun') ? 0.18 : 0.32;
        const flightStart = getNow();

        const animProj = () => {
          const elapsed = getNow() - flightStart;
          const s = Math.min(1, elapsed / flightDuration);

          const px = attackerPos.x + (defenderPos.x - attackerPos.x) * s;
          const pz = attackerPos.z + (defenderPos.z - attackerPos.z) * s;
          let py = attackerPos.y + (defenderPos.y - attackerPos.y) * s;

          if (!animName.startsWith('Gun')) {
            py += Math.sin(s * Math.PI) * 8;
          }

          projMesh.position.set(px, py, pz);
          projMesh.lookAt(defenderPos.x, py, defenderPos.z);

          if (s < 1) {
            nextFrame(animProj);
          } else {
            this.scene.remove(projMesh);
            if (projMesh.geometry) projMesh.geometry.dispose();
            if (projMesh.material) projMesh.material.dispose();
            resolve();
          }
        };
        nextFrame(animProj);
      });
    } else {
      // Step XPBD physics for cloth bag swing if swinging flail
      if (weaponMesh && weaponMesh.userData?.clothBag) {
        const { bag } = weaponMesh.userData.clothBag;
        whipClothBag(bag, defenderPos.x, defenderPos.y, 0.3);
        stepClothBag(bag, attackerPos.x, attackerPos.y);
        syncClothBagMesh(
          weaponMesh.userData.clothBag.bagMesh,
          bag,
          new THREE.Vector3(0, 0, 0),
          1,
          0
        );
      }
      await this._sleep(300);
    }

    // 5. Impact Moment: Spawn expanding 3D hit burst
    this._spawnHitBurst(defenderPos, outcome);

    // Reaction animation
    const reactionAnim = outcome?.reactionAnimation || 'Taking Damage';
    defenderActor.sprite.play(reactionAnim, getNow());

    // If blocked with a shield, attach 3D shield mesh to defender
    if (reactionAnim.includes('Shield Block')) {
      const shieldMesh = this.createWeaponMesh('shield', defenderActor.team);
      if (shieldMesh) {
        this.scene.add(shieldMesh);
        defenderActor.carriedMesh = shieldMesh;
        if (defenderActor.idleWeaponMesh) {
          defenderActor.idleWeaponMesh.visible = false;
        }
        try {
          defenderActor.sprite.carry(shieldMesh, reactionAnim);
        } catch (e) {
          console.warn('[StageUnitManager] carry shield warning:', e);
        }
      }
    }

    // 6. Wait for animation sequence to complete
    await this._sleep(500);

    // Release and cleanup carried weapon from attacker
    attackerActor.sprite.release();
    if (attackerActor.carriedMesh) {
      if (attackerActor.carriedMesh.material) {
        attackerActor.carriedMesh.material.onBeforeRender = null;
        attackerActor.carriedMesh.material.dispose();
      }
      this.scene.remove(attackerActor.carriedMesh);
      attackerActor.carriedMesh = null;
    }

    // Restore persistent idle weapon for attacker
    if (attackerActor.idleWeaponMesh && !attackerActor.unit.isDead) {
      attackerActor.idleWeaponMesh.visible = true;
    }

    // Reset living attacker to Idle or Critical
    const attHp = attackerActor.unit.hp ?? attackerActor.unit.currentHp ?? 100;
    const attMax = attackerActor.unit.maxHp ?? 100;
    const isAttLow = attMax > 0 && attHp / attMax < 0.25;
    attackerActor.sprite.play(isAttLow ? 'Critical' : 'Idle', getNow());

    // Clean up defender shield if attached
    if (defenderActor.carriedMesh) {
      defenderActor.sprite.release();
      if (defenderActor.carriedMesh.material) {
        defenderActor.carriedMesh.material.onBeforeRender = null;
        defenderActor.carriedMesh.material.dispose();
      }
      this.scene.remove(defenderActor.carriedMesh);
      defenderActor.carriedMesh = null;
    }

    // Check if defender died or was healed/revived
    const isHeal = Boolean(outcome?.isHeal || reactionAnim === 'Revived' || (outcome?.heal && outcome.heal > 0));
    const defHp = defenderActor.unit.hp ?? defenderActor.unit.currentHp ?? 100;

    if (isHeal || defHp > 0) {
      this.reviveUnit(defenderActor);
    }

    const isDead =
      !isHeal &&
      defHp <= 0 &&
      (reactionAnim === 'Bounced to Death' ||
       reactionAnim === 'Dead' ||
       outcome?.defenderDead ||
       defenderActor.unit.isDead);

    if (isDead) {
      await this.playDefeat(defenderActor.unit.id);
    } else {
      if (defenderActor.idleWeaponMesh) {
        defenderActor.idleWeaponMesh.visible = true;
      }
      const defMax = defenderActor.unit.maxHp ?? 100;
      const isDefLow = defMax > 0 && defHp / defMax < 0.25;
      defenderActor.sprite.play(isDefLow ? 'Critical' : 'Idle', getNow());
    }
  }

  /**
   * Fully restores a defeated or wounded unit to living combatant state:
   * resets isDead/alive, restores sprite opacity to 1.0, and unhides ring, hitbox, and weapon.
   * @param {string|number|Object} unitOrId
   */
  reviveUnit(unitOrId) {
    const actor = this._getActor(unitOrId);
    if (!actor) return;

    actor.unit.isDead = false;
    actor.unit.alive = true;

    if (actor.sprite?.group) {
      actor.sprite.group.visible = true;
    }
    this.setActorOpacity(actor, 1.0);

    if (actor.ring) {
      actor.ring.visible = true;
    }
    if (actor.hitboxMesh) {
      actor.hitboxMesh.visible = true;
    }
    if (actor.idleWeaponMesh) {
      actor.idleWeaponMesh.visible = true;
    }
    if (actor.bossCrown) {
      actor.bossCrown.visible = true;
    }

    const getNow = () => performance.now() / 1000;
    const hp = actor.unit.hp ?? actor.unit.currentHp ?? 100;
    const maxHp = actor.unit.maxHp ?? 100;
    const isLowHp = maxHp > 0 && hp / maxHp < 0.25;
    actor.sprite.play(isLowHp ? 'Critical' : 'Idle', getNow());
  }

  /**
   * Defeat sequence (Fix D-18):
   * Plays 'Dead' sequence, hides team ring & idle weapon, fades corpse opacity to 0.28.
   * @param {string|number|Object} unitOrId
   */
  async playDefeat(unitOrId) {
    const actor = this._getActor(unitOrId);
    if (!actor) return;

    actor.unit.alive = false;
    actor.unit.isDead = true;

    // 1. Hide idle weapon and carried weapon
    if (actor.idleWeaponMesh) {
      actor.idleWeaponMesh.visible = false;
    }
    if (actor.carriedMesh) {
      actor.sprite.release();
      if (actor.carriedMesh.material) {
        actor.carriedMesh.material.onBeforeRender = null;
        actor.carriedMesh.material.dispose();
      }
      this.scene.remove(actor.carriedMesh);
      actor.carriedMesh = null;
    }
    if (actor.bossCrown) {
      actor.bossCrown.visible = false;
    }
    if (actor.hitboxMesh) {
      actor.hitboxMesh.visible = false;
    }

    // 2. Play death sequence
    const getNow = () => performance.now() / 1000;
    actor.sprite.play('Dead', getNow());

    await this._sleep(500);

    // 3. Hide ground team indicator ring / plinth
    if (actor.ring) {
      actor.ring.visible = false;
    }

    // 4. Reduce corpse opacity to 0.28 so living units never collide visually
    this.setActorOpacity(actor, 0.28);
  }

  /**
   * Spawns a 3D golden-tied Loot Pouch mesh on tile (x, z) that gently bobs and sparkles on the surface.
   * @param {number} x
   * @param {number} z
   * @param {IsometricBoard} board
   * @param {Object} [lootData]
   * @returns {Object}
   */
  spawnLootBag(x, z, board, lootData) {
    const key = `${x},${z}`;
    if (this.lootBags.has(key)) {
      if (lootData) {
        this.lootBags.get(key).data = lootData;
      }
      return this.lootBags.get(key);
    }

    const worldPos = board ? board.tileToWorld(x, z) : new THREE.Vector3(0, 0, 0);
    const group = new THREE.Group();
    group.name = `LootBag_${key}`;

    // 1. Rich velvet bag body
    const sackGeo = new THREE.SphereGeometry(2.4, 16, 16);
    sackGeo.scale(1.0, 1.25, 1.0);
    const sackMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b, // rich blood-crimson velvet
      roughness: 0.65,
      metalness: 0.15,
      envMap: this.envMap
    });
    const sack = new THREE.Mesh(sackGeo, sackMat);
    sack.position.y = 2.4;
    group.add(sack);

    // 2. Gleaming golden cord / ribbon tie ring
    const tieGeo = new THREE.TorusGeometry(1.4, 0.35, 8, 16);
    tieGeo.rotateX(Math.PI / 2);
    const tieMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.12,
      emissive: 0xd97706,
      emissiveIntensity: 0.5,
      envMap: this.envMap
    });
    const tie = new THREE.Mesh(tieGeo, tieMat);
    tie.position.y = 4.2;
    group.add(tie);

    // 3. Top sack ruffle
    const ruffleGeo = new THREE.ConeGeometry(1.6, 1.4, 8, 1, true);
    ruffleGeo.rotateX(Math.PI);
    const ruffle = new THREE.Mesh(ruffleGeo, sackMat);
    ruffle.position.y = 5.0;
    group.add(ruffle);

    // 4. Sparkling golden gem sigil
    const sparkleGeo = new THREE.OctahedronGeometry(0.85, 0);
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      wireframe: true
    });
    const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
    sparkle.position.y = 6.4;
    group.add(sparkle);

    group.position.set(worldPos.x, worldPos.y, worldPos.z);
    this.scene.add(group);

    const entry = {
      mesh: group,
      x,
      z,
      data: lootData || { orbs: 50, item: 'Loot Pouch' },
      sparkle,
      baseY: worldPos.y
    };
    this.lootBags.set(key, entry);
    return entry;
  }

  /**
   * Unit picks up a dropped loot pouch at (x, z):
   * plays 'Found Item' or 'Chest Pickup' for 380ms, removes and disposes the pouch mesh,
   * and returns lootData.
   * @param {number} x
   * @param {number} z
   * @param {string|number|Object} unitOrId
   * @param {Function} [nowSecGetter]
   * @returns {Promise<Object|null>}
   */
  async pickupLootBag(x, z, unitOrId, nowSecGetter) {
    const key = `${x},${z}`;
    const entry = this.lootBags.get(key);
    if (!entry) return null;

    const actor = this._getActor(unitOrId);
    const getNow = typeof nowSecGetter === 'function' ? nowSecGetter : () => performance.now() / 1000;

    if (actor && actor.sprite) {
      try {
        actor.sprite.play('Found Item', getNow());
      } catch {
        try {
          actor.sprite.play('Chest Pickup', getNow());
        } catch {}
      }
    }

    await this._sleep(380);

    if (actor && actor.sprite && !actor.unit.isDead) {
      const hp = actor.unit.hp ?? actor.unit.currentHp ?? 100;
      const maxHp = actor.unit.maxHp ?? 100;
      const isLowHp = maxHp > 0 && hp / maxHp < 0.25;
      actor.sprite.play(isLowHp ? 'Critical' : 'Idle', getNow());
    }

    if (entry.mesh) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    this.lootBags.delete(key);
    return entry.data;
  }

  /**
   * Applies tactical RPG status to a unit:
   * 'frozen' -> plays 'Frozen' + icy blue tint ring
   * 'sleeping' -> plays 'Sleeping'
   * 'confused' -> plays 'Confused'
   * 'floating' -> plays 'Float' (actor.sprite.player.water = false, elevated +5 units)
   * null -> restores 'Idle' animation (and proper water status/stance)
   * @param {string|number|Object} unitOrId
   * @param {string|null} status
   */
  setUnitStatus(unitOrId, status) {
    const actor = this._getActor(unitOrId);
    if (!actor) return;

    actor.unit.status = status;
    const getNow = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const stat = status ? String(status).toLowerCase() : null;

    // Clean up previous status ring if any
    if (actor.statusRingMesh) {
      this.scene.remove(actor.statusRingMesh);
      if (actor.statusRingMesh.geometry) actor.statusRingMesh.geometry.dispose();
      if (actor.statusRingMesh.material) actor.statusRingMesh.material.dispose();
      actor.statusRingMesh = null;
    }

    if (stat === 'frozen') {
      actor.sprite.play('Frozen', getNow());
      // Icy blue tint ring around unit feet
      const iceGeo = new THREE.RingGeometry(6.2, 9.8, 16);
      const iceMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const iceMesh = new THREE.Mesh(iceGeo, iceMat);
      iceMesh.rotation.x = -Math.PI / 2;
      iceMesh.position.set(actor.sprite.group.position.x, actor.groundY + 0.2, actor.sprite.group.position.z);
      this.scene.add(iceMesh);
      actor.statusRingMesh = iceMesh;
    } else if (stat === 'sleeping') {
      actor.sprite.play('Sleeping', getNow());
    } else if (stat === 'confused') {
      actor.sprite.play('Confused', getNow());
    } else if (stat === 'floating') {
      actor.sprite.play('Float', getNow());
      actor.sprite.player.water = false;
      // Elevate unit +5 units in the air
      actor.sprite.group.position.y = actor.groundY + actor.sprite.standHeight + 5;
    } else {
      // null / cleared: restore Idle animation and proper water stance
      if (actor.inWater) {
        actor.sprite.player.water = true;
        actor.sprite.group.position.y = actor.groundY + actor.sprite.standHeight - 3.5;
      } else {
        actor.sprite.player.water = false;
        actor.sprite.group.position.y = actor.groundY + actor.sprite.standHeight;
      }
      const hp = actor.unit.hp ?? actor.unit.currentHp ?? 100;
      const maxHp = actor.unit.maxHp ?? 100;
      const isLowHp = maxHp > 0 && hp / maxHp < 0.25;
      actor.sprite.play(isLowHp ? 'Critical' : 'Idle', getNow());
    }
  }

  /**
   * Smooth PS1 / FFTA Bayer dithered teleport effect between two positions.
   * @param {string|number|Object} unitOrId
   * @param {{ x: number, y?: number, z: number }|THREE.Vector3} fromPos
   * @param {{ x: number, y?: number, z: number }|THREE.Vector3} toPos
   */
  async playTeleport(unitOrId, fromPos, toPos) {
    const actor = this._getActor(unitOrId);
    if (!actor) return;

    const getNow = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const nextFrame = (cb) => setTimeout(cb, 16);

    const refs = patchGroupSpawnMaterials(actor.sprite.group);

    // 1. Dither fade out at fromPos (progress 1.0 -> 0.0)
    const fadeOutDuration = 0.25;
    const startOut = getNow();
    await new Promise((resolve) => {
      const tickOut = () => {
        const elapsed = getNow() - startOut;
        const p = Math.max(0.0, 1.0 - elapsed / fadeOutDuration);
        updateSpawnProgress(refs, p);
        if (elapsed < fadeOutDuration) {
          nextFrame(tickOut);
        } else {
          updateSpawnProgress(refs, 0.0);
          resolve();
        }
      };
      nextFrame(tickOut);
    });

    // 2. Teleport position to toPos
    const tx = toPos.x ?? toPos.worldX ?? 0;
    const ty = toPos.y ?? toPos.worldY ?? 0;
    const tz = toPos.z ?? toPos.worldZ ?? 0;
    actor.groundY = ty;
    const waterOffset = actor.inWater && actor.unit.status !== 'floating' ? -3.5 : 0;
    actor.sprite.group.position.set(tx, ty + actor.sprite.standHeight + waterOffset, tz);
    if (actor.ring) actor.ring.position.set(tx, ty + 0.12, tz);
    if (actor.hitboxMesh) actor.hitboxMesh.position.set(tx, ty + 13, tz);

    // 3. Dither fade in at toPos (progress 0.0 -> 1.0)
    const fadeInDuration = 0.25;
    const startIn = getNow();
    await new Promise((resolve) => {
      const tickIn = () => {
        const elapsed = getNow() - startIn;
        const p = Math.min(1.0, elapsed / fadeInDuration);
        updateSpawnProgress(refs, p);
        if (elapsed < fadeInDuration) {
          nextFrame(tickIn);
        } else {
          updateSpawnProgress(refs, 1.0);
          resolve();
        }
      };
      nextFrame(tickIn);
    });
  }

  /**
   * Set opacity of all sprite mesh planes on an actor.
   * @param {Object} actor
   * @param {number} opacity
   */
  setActorOpacity(actor, opacity) {
    if (!actor) return;
    if (actor._materialProxy) {
      actor._materialProxy.opacity = opacity;
    }
    if (actor.sprite?.group) {
      actor.sprite.group.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.transparent = true;
          obj.material.opacity = opacity;
          obj.material.needsUpdate = true;
        }
      });
    }
  }

  _spawnHitBurst(position, outcome) {
    const isCritical = outcome?.reactionAnimation === 'Critical' || outcome?.critical;
    const isHeal = outcome?.reactionAnimation === 'Revived' || outcome?.isHeal;
    const burstColor = isHeal ? 0x10b981 : isCritical ? 0xef4444 : 0xfbbf24;

    const group = new THREE.Group();
    group.position.copy(position);

    // Expanding shockwave ring
    const ringGeo = new THREE.RingGeometry(0.5, 2.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: burstColor,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    group.add(ringMesh);

    // Radiant spark lines
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPoints = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      sparkPoints.push(0, 0, 0, Math.cos(angle) * 7, Math.sin(angle) * 7, 0);
    }
    sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPoints, 3));
    const sparkMat = new THREE.LineBasicMaterial({
      color: burstColor,
      transparent: true,
      opacity: 0.9
    });
    const sparks = new THREE.LineSegments(sparkGeo, sparkMat);
    group.add(sparks);

    this.scene.add(group);
    this.hitBursts.push({
      group,
      ringMat,
      sparkMat,
      ringGeo,
      sparkGeo,
      startTime: performance.now() / 1000,
      duration: 0.35
    });
  }

  /**
   * Per-frame update for all unit sprites, active projectiles, hit bursts, team rings,
   * idle weapons, and boss crowns.
   * @param {number} nowSec
   * @param {number} dt
   * @param {THREE.Camera|TacticalCamera} camera
   */
  update(nowSec, dt, camera) {
    const cam = camera.camera || camera;

    // 1. Update unit sprites, grounded team rings, idle weapons, and boss crowns
    for (const actor of this.units.values()) {
      if (actor.sprite) {
        actor.sprite.update(nowSec, cam);
      }

      // PS1 / FFTA 4x4 Bayer dither spawn progress update
      if (actor.spawnRefs && actor.spawnProgress < 1.0) {
        const p = Math.min(1.0, (nowSec - actor.spawnStartTime) / (spawnFadeMs / 1000));
        updateSpawnProgress(actor.spawnRefs, p);
        actor.spawnProgress = p;
        if (p >= 1.0) {
          actor.spawnRefs = null;
        }
      }

      // Rotate status aura ring if active
      if (actor.statusRingMesh) {
        actor.statusRingMesh.rotation.z += dt * 0.8;
      }

      // Grounded team indicator ring
      if (actor.ring && actor.sprite?.group) {
        const gy = actor.groundY !== undefined
          ? actor.groundY
          : (actor.sprite.group.position.y - actor.sprite.standHeight);
        actor.ring.position.set(
          actor.sprite.group.position.x,
          gy + 0.12,
          actor.sprite.group.position.z
        );
        actor.ring.rotation.y += dt * 1.5;
      }

      // Floating rotating 3D Boss Crown
      if (actor.bossCrown && actor.bossCrown.visible && actor.sprite?.group) {
        const groupPos = actor.sprite.group.position;
        const bob = Math.sin(nowSec * 3.5) * 1.2;
        actor.bossCrown.position.set(
          groupPos.x,
          groupPos.y + 22 + bob,
          groupPos.z
        );
        actor.bossCrown.rotation.y = nowSec * 1.8;
        actor.bossCrown.rotation.z = Math.sin(nowSec * 2.0) * 0.15;
      }

      // Persistent 3D held/holstered weapon with gentle breathing bob
      if (actor.idleWeaponMesh && actor.idleWeaponMesh.visible && actor.sprite?.group) {
        if (actor.unit.isDead) {
          actor.idleWeaponMesh.visible = false;
        } else {
          const facing = toFacingIndex(actor.sprite.player.facing ?? actor.unit.facing);
          const fX = FACING_X[facing];
          const fZ = FACING_Z[facing];
          const groupPos = actor.sprite.group.position;
          const aScale = actor.actorScale || 1.0;

          const bob = Math.sin(nowSec * 3.0 + (actor.unit.unitIndex || 0)) * 0.7;

          // Across vector (-fZ, 0, fX)
          const acrossX = -fZ;
          const acrossZ = fX;
          const side = 4.8 * aScale;
          const back = -1.2 * aScale;

          actor.idleWeaponMesh.position.set(
            groupPos.x + acrossX * side + fX * back,
            groupPos.y - 4.5 * aScale + bob,
            groupPos.z + acrossZ * side + fZ * back
          );

          const angle = Math.atan2(fX, fZ);
          actor.idleWeaponMesh.rotation.set(0.18, angle + 0.25, -0.15);
        }
      }
    }

    // 2. Animate expanding hit bursts
    for (let i = this.hitBursts.length - 1; i >= 0; i--) {
      const burst = this.hitBursts[i];
      const elapsed = nowSec - burst.startTime;
      const s = Math.min(1, Math.max(0, elapsed / burst.duration));

      const scale = 1.0 + s * 2.2;
      burst.group.scale.set(scale, scale, scale);
      burst.ringMat.opacity = Math.max(0, 0.95 * (1 - s));
      burst.sparkMat.opacity = Math.max(0, 0.9 * (1 - s));

      if (s >= 1) {
        this.scene.remove(burst.group);
        if (burst.ringGeo) burst.ringGeo.dispose();
        if (burst.sparkGeo) burst.sparkGeo.dispose();
        if (burst.ringMat) burst.ringMat.dispose();
        if (burst.sparkMat) burst.sparkMat.dispose();
        this.hitBursts.splice(i, 1);
      }
    }

    // 3. Animate 3D dropped loot bags (bobbing & sparkles)
    if (this.lootBags) {
      for (const loot of this.lootBags.values()) {
        if (loot.mesh) {
          const bob = Math.sin(nowSec * 3.5 + loot.x * 2 + loot.z) * 0.7;
          loot.mesh.position.y = loot.baseY + bob;
          loot.mesh.rotation.y = nowSec * 1.5;
          if (loot.sparkle) {
            loot.sparkle.rotation.x = nowSec * 2.5;
            loot.sparkle.rotation.z = nowSec * 2.0;
          }
        }
      }
    }
  }

  /**
   * Returns world space THREE.Vector3 at top of unit's head for floating HP / damage numbers.
   * @param {string|number|Object} unitId
   * @param {IsometricBoard} [board]
   * @returns {THREE.Vector3}
   */
  getUnitScreenAnchor(unitId, board) {
    const actor = this._getActor(unitId);
    if (actor && actor.sprite?.group) {
      const pos = actor.sprite.group.position;
      const scale = actor.actorScale || 1.0;
      return new THREE.Vector3(pos.x, pos.y + 18 * scale, pos.z);
    }
    if (board && typeof unitId === 'object' && unitId !== null) {
      const worldPos = board.tileToWorld(unitId.x, unitId.z, unitId.elevation);
      return new THREE.Vector3(worldPos.x, worldPos.y + 36, worldPos.z);
    }
    return new THREE.Vector3(0, 36, 0);
  }

  _determineUnitWeaponName(unit) {
    if (unit.heldModelName) return unit.heldModelName.toLowerCase();
    const searchStr = `${unit.weapon?.modelName || ''} ${unit.weapon?.type || ''} ${unit.weapon?.name || ''} ${unit.className || ''}`.toLowerCase();
    if (searchStr.includes('bow') || searchStr.includes('archer')) return 'bow';
    if (searchStr.includes('cloth_bag') || searchStr.includes('cloth bag') || searchStr.includes('bag') || searchStr.includes('flail')) return 'cloth_bag';
    if (searchStr.includes('katana') || searchStr.includes('samurai') || searchStr.includes('ninja') || searchStr.includes('blade')) return 'katana';
    if (searchStr.includes('spear') || searchStr.includes('dragoon') || searchStr.includes('lance') || searchStr.includes('halberd')) return 'spear';
    if (searchStr.includes('rifle') || searchStr.includes('gun') || searchStr.includes('sniper') || searchStr.includes('deadeye')) return 'rifle';
    if (searchStr.includes('shield') || searchStr.includes('paladin') || searchStr.includes('guardian') || searchStr.includes('vanguard') || searchStr.includes('juggernaut')) return 'shield';
    if (searchStr.includes('tome') || searchStr.includes('book') || searchStr.includes('scholar') || searchStr.includes('hexer') || searchStr.includes('caster')) return 'tome';
    if (searchStr.includes('harp') || searchStr.includes('bard') || searchStr.includes('song') || searchStr.includes('instrument')) return 'harp';
    return 'sword';
  }

  _getActor(unitOrId) {
    if (!unitOrId) return null;
    const id = typeof unitOrId === 'object' ? unitOrId.id : unitOrId;
    if (id !== undefined && this.units.has(id)) {
      return this.units.get(id);
    }
    for (const actor of this.units.values()) {
      if (actor.unit === unitOrId || actor.sprite === unitOrId) {
        return actor;
      }
    }
    return null;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _loadJson(url) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const res = await fetch(url);
      return await res.json();
    }
    const fsMod = 'fs';
    const pathMod = 'path';
    const fs = await import(/* @vite-ignore */ fsMod);
    const path = await import(/* @vite-ignore */ pathMod);
    const resolved = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
    return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  }

  async _loadArrayBuffer(url) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const res = await fetch(url);
      return await res.arrayBuffer();
    }
    const fsMod = 'fs';
    const pathMod = 'path';
    const fs = await import(/* @vite-ignore */ fsMod);
    const path = await import(/* @vite-ignore */ pathMod);
    const resolved = path.resolve(process.cwd(), 'public', url.replace(/^\//, ''));
    const buf = fs.readFileSync(resolved);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  async _loadTexture(url) {
    if (typeof window !== 'undefined') {
      const loader = new THREE.TextureLoader();
      return await loader.loadAsync(url);
    }
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    for (const actor of this.units.values()) {
      if (actor.sprite?.group) this.scene.remove(actor.sprite.group);
      if (actor.ring) {
        actor.ring.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
            else child.material.dispose();
          }
        });
        this.scene.remove(actor.ring);
      }
      if (actor.bossCrown) {
        actor.bossCrown.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
            else child.material.dispose();
          }
        });
        this.scene.remove(actor.bossCrown);
      }
      if (actor.idleWeaponMesh) {
        if (actor.idleWeaponMesh.material) actor.idleWeaponMesh.material.dispose();
        this.scene.remove(actor.idleWeaponMesh);
      }
      if (actor.carriedMesh) {
        if (actor.carriedMesh.material) actor.carriedMesh.material.dispose();
        this.scene.remove(actor.carriedMesh);
      }
      if (actor.hitboxMesh) {
        if (actor.hitboxMesh.geometry) actor.hitboxMesh.geometry.dispose();
        if (actor.hitboxMesh.material) actor.hitboxMesh.material.dispose();
        this.scene.remove(actor.hitboxMesh);
      }
      if (actor.statusRingMesh) {
        if (actor.statusRingMesh.geometry) actor.statusRingMesh.geometry.dispose();
        if (actor.statusRingMesh.material) actor.statusRingMesh.material.dispose();
        this.scene.remove(actor.statusRingMesh);
      }
      if (actor.sprite?.dispose) actor.sprite.dispose();
    }
    this.units.clear();

    if (this.lootBags) {
      for (const loot of this.lootBags.values()) {
        if (loot.mesh) {
          this.scene.remove(loot.mesh);
          loot.mesh.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
          });
        }
      }
      this.lootBags.clear();
    }

    if (this.itemFinishBake) {
      try {
        this.itemFinishBake.dispose();
      } catch {}
      this.itemFinishBake = null;
    }
    if (this.clothBagResources) {
      try {
        this.clothBagResources.dispose();
      } catch {}
      this.clothBagResources = null;
    }

    for (const burst of this.hitBursts) {
      this.scene.remove(burst.group);
      if (burst.ringGeo) burst.ringGeo.dispose();
      if (burst.sparkGeo) burst.sparkGeo.dispose();
      if (burst.ringMat) burst.ringMat.dispose();
      if (burst.sparkMat) burst.sparkMat.dispose();
    }
    this.hitBursts = [];
  }
}
