/**
 * INTDEV TACTICS — Master Game Controller
 * 3d.internet.dev × set.world
 *
 * Seamlessly integrates:
 * - Three.js WebGL tactical renderer with atmospheric lighting
 * - TacticalCamera (Jimmy Lee 23° elevation, 8-step 45° azimuth rotation, smooth pan & zoom)
 * - IsometricBoard (10x10 stepped diorama, crystal stream, bridge, ruins, elevation heights)
 * - StageUnitManager (8-direction TYPE1 sprite animations + 3D Mythril weapon carry/hold)
 * - TurnManager (FFTA CT threshold 100, resting CT preservation, Tactical AI engine)
 * - TacticalHUD (CT turn order ribbon, FFTA command menu, combat forecast, overhead 3D bars)
 * - ForgeModal (Set.world Orb Lottery Forge /api/craft, salvage sink, clan armory & equipping)
 */

import * as THREE from 'three';
import './styles/main.css';
import { TacticalCamera } from './stage/tactical-camera.js';
import { IsometricBoard } from './stage/isometric-board.js';
import { StageUnitManager } from './stage/unit-actor.js';
import { TurnManager } from './game/turn-manager.js';
import { TacticalHUD } from './ui/tactical-hud.js';
import { ForgeModal, normalizeSlot, EQUIPMENT_SLOTS, computeSetWorldResonance } from './ui/forge-modal.js';
import { SpriteStudioModal } from './ui/sprite-studio-modal.js';
import * as SetWorldClient from './game/setworld-client.js';
import * as CombatRules from './game/combat-rules.js';
import {
  generateClanRoster,
  craftItem,
  salvageItem,
  mapToolToWeaponSpec,
  deriveSeed
} from './game/setworld-client.js';
import {
  getReachableTiles,
  getAttackableTiles,
  calculateCombatForecast,
  executeCombatAction,
  calculateFacing
} from './game/combat-rules.js';

// Safe dynamic loader for stage/free-roam-controller.js
let StageFreeRoamController = null;
try {
  const frMod = await import(/* @vite-ignore */ './stage/free-roam-controller.js').catch(() => null);
  StageFreeRoamController = frMod?.FreeRoamController || null;
} catch (e) {
  StageFreeRoamController = null;
}

// Fallback FreeRoamController
class FallbackFreeRoamController {
  constructor() {
    this.actor = null;
    this.board = null;
    this.scene = null;
    this.active = false;
    this.keys = {};
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.quickThrow();
      if (e.code === 'KeyE') this.actor?.playAttack?.();
      if (e.code === 'KeyQ') this.actor?.playPose?.('Cast');
      if (e.code === 'Space') this.actor?.playPose?.('Jump');
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
  }

  enable(actor, board, scene) {
    this.actor = actor;
    this.board = board;
    this.scene = scene;
    this.active = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  disable() {
    this.active = false;
    this.keys = {};
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this.actor?.sprite) {
      this.actor.sprite.play?.('Idle', performance.now() / 1000);
    }
  }

  update(dt, cameraAzimuth = 0) {
    if (!this.active || !this.actor) return;
    let forward = 0;
    let strafe = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) strafe += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      const speed = 4.0;
      const angle = cameraAzimuth + Math.atan2(strafe, forward);
      const vx = Math.sin(angle) * speed * dt;
      const vz = Math.cos(angle) * speed * dt;
      if (this.actor.mesh) {
        this.actor.mesh.position.x += vx;
        this.actor.mesh.position.z += vz;
        this.actor.mesh.position.x = Math.max(0.5, Math.min(9.5, this.actor.mesh.position.x));
        this.actor.mesh.position.z = Math.max(0.5, Math.min(9.5, this.actor.mesh.position.z));
      }
      this.actor.playPose?.('Walk');
    }
  }

  quickThrow() {
    if (!this.actor) return;
    this.actor.playPose?.('Item Throw');
  }
}

export const GAUNTLET_FLOORS = SetWorldClient.GAUNTLET_FLOORS || 5;

export function fallbackRollGauntletFloorEnemies(seed, floor, board) {
  const floorThemes = [
    { name: 'Crimson Vanguard Patrol', count: 3, jobs: ['Warrior', 'Archer', 'Knight'], level: 1, boss: false },
    { name: 'Crimson Phalanx', count: 4, jobs: ['Knight', 'Knight', 'Sniper', 'Hexer'], level: 2, boss: false },
    { name: 'Pyre Sanctum Cabal', count: 4, jobs: ['Hexer', 'Arcane Mage', 'Warrior', 'Hexer'], level: 3, boss: false },
    { name: 'Shadow Assassins', count: 4, jobs: ['Trickster', 'Ninja', 'Sniper', 'Trickster'], level: 4, boss: false },
    { name: 'Sovereign Sanctum Raid', count: 4, jobs: ['Warlord Boss', 'Vanguard', 'Hexer', 'Deadeye'], level: 5, boss: true }
  ];

  const theme = floorThemes[(floor - 1) % floorThemes.length] || floorThemes[0];
  const enemies = [];
  const coords = [
    { x: 8, z: 8 },
    { x: 9, z: 7 },
    { x: 7, z: 9 },
    { x: 9, z: 9 }
  ];

  for (let i = 0; i < theme.count; i++) {
    const job = theme.jobs[i] || 'Warrior';
    const isBoss = theme.boss && i === 0;
    const pos = coords[i % coords.length];
    const elev = board?.getElevation?.(pos.x, pos.z) ?? 0;

    enemies.push({
      id: `gauntlet-enemy-f${floor}-${i + 1}`,
      unitId: `gauntlet-enemy-f${floor}-${i + 1}`,
      name: isBoss ? 'Sovereign Malakor' : `Crimson ${job} ${i + 1}`,
      job: job,
      className: job,
      team: 'crimson',
      color: 0xf43f5e,
      gridX: pos.x,
      gridZ: pos.z,
      x: pos.x,
      z: pos.z,
      elevation: elev,
      hp: isBoss ? 600 : 90 + floor * 20,
      maxHp: isBoss ? 600 : 90 + floor * 20,
      mp: 40 + floor * 10,
      maxMp: 40 + floor * 10,
      ct: 0,
      isBoss: isBoss,
      alive: true,
      hasMoved: false,
      hasActed: false,
      powerRating: isBoss ? 990 : 500 + floor * 70,
      stats: {
        STR: 25 + floor * 6,
        DEX: 22 + floor * 5,
        INT: 20 + floor * 5,
        AGI: 24 + floor * 5,
        VIT: 28 + floor * 6,
        DEF: 25 + floor * 5
      }
    });
  }
  return enemies;
}

// Fallback or imported Set.world item booster (+1 ★ up to +5 ★)
const boostItemWithOrbs = typeof SetWorldClient['boostItemWithOrbs'] === 'function'
  ? SetWorldClient['boostItemWithOrbs']
  : (item, orbs = 75) => {
      if (!item) return item;
      item.stars = Math.min(5, (item.stars || 0) + 1);
      const tiers = ['Bronze', 'Bronze', 'Iron', 'Mythril', 'Gold', 'Adamantite'];
      item.finishTier = tiers[item.stars] || 'Mythril';
      const prefixes = ['Boreal', 'Astral', 'Chaotic', 'Celestial', 'Fiery'];
      if (!item.elementalPrefix) {
        item.elementalPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      }
      item.orbValue = (item.orbValue || 25) + orbs;
      return item;
    };

class TacticsGame {
  constructor() {
    this.canvas = document.getElementById('tactics-stage');
    this.uiContainer = document.getElementById('tactics-ui');

    if (!this.canvas || !this.uiContainer) {
      throw new Error('Required DOM container elements (#tactics-stage, #tactics-ui) not found.');
    }

    // Battle Configuration & Persistence
    this.baseSeed = 0x1337;
    const urlSeedParam = new URLSearchParams(window.location.search).get('seed');
    if (urlSeedParam) {
      if (urlSeedParam.toLowerCase().startsWith('0x')) {
        const parsed = parseInt(urlSeedParam, 16);
        if (!isNaN(parsed)) this.baseSeed = parsed >>> 0;
      } else {
        const parsed = parseInt(urlSeedParam, 10);
        if (!isNaN(parsed)) this.baseSeed = parsed >>> 0;
      }
    }

    this.playerOrbs = 450;
    this.raidBossMode = false;
    this.autoBattle = false;
    this.battleOver = false;
    this.turnCount = 1;
    this._isProcessingTurn = false;
    this.matchId = 0;
    this._turnTimer = null;
    this.statsSummary = {
      turns: 0,
      damageDealt: 0,
      crits: 0,
      orbsWon: 0
    };

    // State Machine
    this.units = [];
    this.activeUnit = null;
    this.currentMode = 'standby'; // 'standby' | 'menu' | 'move' | 'act' | 'wait' | 'animating'
    this.reachableTiles = [];
    this.attackableTiles = [];
    this.selectedAbility = null;
    this.inspectedTarget = null;
    this.activeForecast = null;
    this.hoveredTile = null;

    // Clan Inventory for Set.world Armory
    this.playerInventory = [
      {
        id: 'item-init-1',
        name: 'Mythril Broadsword',
        type: 'weapon',
        grade: 'B',
        tier: 'B',
        tierGrade: 'B',
        orbValue: 125,
        material: 'Mythril Steel',
        statsBonus: '+12 STR, +4 VIT',
        rawItem: { tier: 'B', tierGrade: 'B', orbValue: 125, name: 'Mythril Broadsword', slot: 'tool' },
        equippedTo: 'unit_azure_0',
        equippedSlot: 'tool'
      },
      {
        id: 'item-init-2',
        name: 'Composite Longbow',
        type: 'weapon',
        grade: 'B',
        tier: 'B',
        tierGrade: 'B',
        orbValue: 125,
        material: 'Ironwood & Mythril',
        statsBonus: '+14 DEX, +6 AGI',
        rawItem: { tier: 'B', tierGrade: 'B', orbValue: 125, name: 'Composite Longbow', slot: 'tool' },
        equippedTo: 'unit_azure_1',
        equippedSlot: 'tool'
      },
      {
        id: 'item-init-3',
        name: 'Arcane Focus Rod',
        type: 'weapon',
        grade: 'A',
        tier: 'A',
        tierGrade: 'A',
        orbValue: 625,
        material: 'Starlight Crystal',
        statsBonus: '+22 INT, +10 WIS',
        rawItem: { tier: 'A', tierGrade: 'A', orbValue: 625, name: 'Arcane Focus Rod', slot: 'tool' },
        equippedTo: 'unit_azure_2',
        equippedSlot: 'tool'
      },
      {
        id: 'item-init-4',
        name: 'Obsidian Dirk',
        type: 'weapon',
        grade: 'C',
        tier: 'C',
        tierGrade: 'C',
        orbValue: 25,
        material: 'Obsidian Glass',
        statsBonus: '+6 DEX, +4 LUK',
        rawItem: { tier: 'C', tierGrade: 'C', orbValue: 25, name: 'Obsidian Dirk', slot: 'tool' },
        equippedTo: 'unit_azure_3',
        equippedSlot: 'tool'
      },
      {
        id: 'item-init-5',
        name: 'Tower Aegis Shield',
        type: 'armor',
        grade: 'B',
        tier: 'B',
        tierGrade: 'B',
        orbValue: 125,
        material: 'Tempered Mythril',
        statsBonus: '+18 DEF, +8 VIT',
        rawItem: { tier: 'B', tierGrade: 'B', orbValue: 125, name: 'Tower Aegis Shield', slot: 'offhand' },
        equippedTo: null,
        equippedSlot: 'offhand'
      }
    ];

    // Restore saved clan state from localStorage if available
    this._loadClanState();

    // Sprint 4: Free-Roam, Gauntlet & Sprite Studio State
    this.freeRoamActive = false;
    this.freeRoamController = null;
    this.gauntletActive = false;
    this.gauntletFloor = 1;
    this.gauntletMaxFloors = 5;
    this.spriteStudioModal = null;
    this.spriteData = null;

    // Initialize Subsystems
    this._initRenderer();
    this._initScene();
    this._initLighting();
    this._initManagers();
    this.hud = this.tacticalHud; // Convenient alias
    this._initEventListeners();

    // Start lifecycle
    this.start();
  }

  _loadClanState() {
    try {
      const raw = localStorage.getItem('intdevtactics_clan_save_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.playerOrbs === 'number' && !isNaN(parsed.playerOrbs)) {
          this.playerOrbs = parsed.playerOrbs;
        }
        if (Array.isArray(parsed.playerInventory) && parsed.playerInventory.length > 0) {
          this.playerInventory = parsed.playerInventory;
        }
      }
    } catch (err) {
      console.warn('[TacticsGame] Error loading saved clan state:', err);
    }
  }

  _saveClanState() {
    try {
      const data = {
        playerOrbs: this.playerOrbs,
        playerInventory: this.playerInventory
      };
      localStorage.setItem('intdevtactics_clan_save_v1', JSON.stringify(data));
    } catch (err) {
      console.warn('[TacticsGame] Error saving clan state to localStorage:', err);
    }
  }

  /* ========================================================================
     Subsystem Initialization
     ======================================================================== */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a); // --bg-obsidian-deep
  }

  _initLighting() {
    // Warm sun sky / cool obsidian ground hemisphere ambient
    const hemiLight = new THREE.HemisphereLight(0xffecd2, 0x1e293b, 1.25);
    this.scene.add(hemiLight);

    // Directional tactical sun light
    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.85);
    sunLight.position.set(220, 380, 180);
    this.scene.add(sunLight);

    // Cool azure rim/fill light
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-200, 160, -200);
    this.scene.add(rimLight);

    // Subtle base ambient
    this.scene.add(new THREE.AmbientLight(0x334155, 0.45));
  }

  _initManagers() {
    this.tacticalCamera = new TacticalCamera(this.canvas);
    this.isometricBoard = new IsometricBoard(this.scene, this.baseSeed);
    this.stageUnitManager = new StageUnitManager(this.scene);
    if (this.renderer) {
      this.stageUnitManager.renderer = this.renderer;
    }
    this.turnManager = new TurnManager({ ctThreshold: 100 });

    // Project 3D world space coordinate into 2D screen pixels for HUD overhead bars & popups
    this.projectWorldToScreen = (pos3D) => {
      const p = new THREE.Vector3(pos3D.x, pos3D.y, pos3D.z);
      p.project(this.tacticalCamera.camera);

      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;
      const isVisible =
        p.z >= -1 &&
        p.z <= 1 &&
        p.x >= -1.25 &&
        p.x <= 1.25 &&
        p.y >= -1.25 &&
        p.y <= 1.25;

      const screenX = ((p.x + 1) / 2) * width;
      const screenY = ((-p.y + 1) / 2) * height;

      return { x: screenX, y: screenY, visible: isVisible };
    };

    // Tactical HUD Callbacks
    this.tacticalHud = new TacticalHUD(this.uiContainer, {
      onSelectMove: () => this.enterMoveMode(),
      onSelectAbility: (ability) => this.enterActMode(ability),
      onOpenWaitCompass: () => this.enterWaitMode(),
      onConfirmEndTurn: (facing) => this.confirmEndTurn(facing),
      onPreviewFacing: (dir) => {
        const actor = this.stageUnitManager?._getActor?.(this.activeUnit);
        if (typeof actor?.playRotateStep === 'function') {
          actor.playRotateStep(dir);
        } else if (actor?.sprite) {
          actor.sprite.setFacing?.(dir);
        }
      },
      onCancelMode: () => this.cancelCurrentMode(),
      onConfirmCombat: () => this.confirmCombatAction(),
      onRotateCamera: (delta) => this.rotateCamera(delta),
      onZoomCamera: (delta) => this.tacticalCamera.zoom(delta),
      onToggleAutoBattle: () => this.toggleAutoBattle(),
      onTogglePhysicsDebug: () => this.togglePhysicsDebug(),
      onToggleRaidBoss: () => this.toggleRaidBossMode(),
      onToggleFreeRoam: () => this.toggleFreeRoamMode(),
      onToggleGauntlet: () => this.toggleGauntletMode(),
      onOpenSpriteStudio: () => this.openSpriteStudio(),
      onNewSeed: () => this.rollNewBattlefield(),
      onOpenForge: () => this.openForgeModal(),
      onFlipSwitch: (switchInfo) => this.executeFlipSwitch(switchInfo)
    });

    // Set.world Clan Forge Modal Callbacks
    this.forgeModal = new ForgeModal(document.body, {
      onCraftItem: (orbs) => this.handleCraftItem(orbs),
      onBoostItem: (index) => this.handleBoostItem(index),
      onSalvageItem: (index, yieldOrbs) => this.handleSalvageItem(index, yieldOrbs),
      onEquipItem: (index, unitId, slot) => this.handleEquipItem(index, unitId, slot),
      onRerollUnit: (unit, customSeed) => this.handleRerollUnit(unit, customSeed),
      onClose: () => {
        this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      }
    });
  }

  /* ========================================================================
     Lifecycle & Battle Setup
     ======================================================================== */

  async start() {
    try {
      this._bootStage = 'starting';
      this.tacticalHud.addLog('TACTICS ENGINE INITIALIZING // Loading 3D Mythril Assets...', 'system');

      // 1. Start render & animation loop immediately so the 3D diorama is visible right away
      this._startRenderLoop();

      // 2. Load sprite atlas, sprite sheet, Set 3D item models and Mythril materials
      this._bootStage = 'loadingAssets';
      await this.stageUnitManager.loadAssets(this.renderer);

      // 3. Load seeded 4v4 clan roster and spawn units
      this._bootStage = 'setupBattlefield';
      await this.setupBattlefield(this.baseSeed);

      // 4. Begin FFTA CT Turn Loop
      this._bootStage = 'ready';
      this.advanceTurn();
    } catch (err) {
      this._bootError = String(err?.stack || err);
      console.error('START_BOOT_ERROR:', err);
      this.tacticalHud.addLog(`BOOT ERROR: ${err?.message || err}`, 'system');
    }
  }

  async setupBattlefield(seed) {
    this.matchId++;
    const currentMatchId = this.matchId;
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }

    this.battleOver = false;
    this._isProcessingTurn = false;
    this.turnCount = 1;
    this.baseSeed = (seed >>> 0);

    // Reset TurnManager state with new seed
    this.turnManager.reset(this.baseSeed);

    // Reset interaction modes and active target selections
    this.currentMode = 'standby';
    this.activeUnit = null;
    this.inspectedTarget = null;
    this.activeForecast = null;
    this.selectedAbility = null;
    this.hoveredTile = null;
    this.reachableTiles = [];
    this.attackableTiles = [];

    // Wipe HUD overlays, panels, and banners
    if (this.tacticalHud?.resetBattlefieldHUD) {
      this.tacticalHud.resetBattlefieldHUD();
    }

    // Rebuild terrain for new seed
    this.isometricBoard.dispose();
    this.isometricBoard = new IsometricBoard(this.scene, this.baseSeed);
    if (this.renderer) {
      this.isometricBoard.initMarbleBake?.(this.renderer);
    }

    // Generate seeded clan roster (4 Azure Clan vs 4 Crimson Order, or 250x Raid Boss)
    const rosterData = await generateClanRoster(this.baseSeed, this.isometricBoard, { raidBossMode: this.raidBossMode });
    if (this.matchId !== currentMatchId) return;

    this.units = rosterData.units;

    // Ensure synchronized x/gridX and z/gridZ coordinates on all units
    for (const unit of this.units) {
      if (unit.x === undefined && unit.gridX !== undefined) unit.x = unit.gridX;
      if (unit.z === undefined && unit.gridZ !== undefined) unit.z = unit.gridZ;
      if (unit.gridX === undefined && unit.x !== undefined) unit.gridX = unit.x;
      if (unit.gridZ === undefined && unit.z !== undefined) unit.gridZ = unit.z;
      unit.hasMoved = false;
      unit.hasActed = false;
      unit.standHeight = 18;
    }

    // Re-apply ALL equipped inventory items across all 6 slots so forged armor, shields, rings, and weapons persist across matches
    for (const item of this.playerInventory) {
      if (item.equippedTo) {
        const u = this.units.find((unit) => unit.id === item.equippedTo);
        if (u) {
          const targetSlot = item.equippedSlot || normalizeSlot(item);
          item.equippedSlot = targetSlot;
          if (typeof SetWorldClient['applyEquipmentToUnit'] === 'function') {
            SetWorldClient['applyEquipmentToUnit'](u, item, targetSlot);
          } else {
            u.equipment = u.equipment || {};
            u.equipment[targetSlot] = item;
            const stars = item.stars || item.boostStars || 0;
            const grade = (item.grade || item.tierGrade || 'B').toUpperCase();
            const bonus = (grade === 'S' ? 20 : grade === 'A' ? 14 : grade === 'B' ? 8 : grade === 'C' ? 4 : 2) + stars * 3;
            u.stats = u.stats || {};
            if (targetSlot === 'tool') {
              const newSpec = mapToolToWeaponSpec(item.rawItem || item, u.className);
              u.weapon = newSpec;
              u.weaponType = newSpec.weaponType;
              u.heldModelName = newSpec.heldModelName;
              u.abilities = newSpec.abilities;
              u.attackRange = newSpec.attackRange;
              u.stats.physicalDamage = (u.stats.physicalDamage || 35) + bonus;
              u.stats.STR = (u.stats.STR || 35) + bonus;
            } else if (targetSlot === 'offhand' || targetSlot === 'chest' || targetSlot === 'head') {
              u.stats.armor = (u.stats.armor || 20) + bonus;
              u.stats.DEF = (u.stats.DEF || 20) + bonus;
              u.maxHp = (u.maxHp || 100) + bonus * 2;
              u.hp = u.maxHp;
            } else if (targetSlot === 'legs') {
              u.stats.AGI = (u.stats.AGI || 30) + bonus;
              u.stats.walkSpeed = (u.stats.walkSpeed || 1.0) + (bonus * 0.04);
            } else if (targetSlot === 'finger') {
              u.stats.magicDamage = (u.stats.magicDamage || 25) + bonus;
              u.stats.INT = (u.stats.INT || 25) + bonus;
              u.maxMp = (u.maxMp || 40) + bonus;
              u.mp = u.maxMp;
            }
          }
        }
      }
    }

    // Spawn 3D sprite actors and ground plinths
    this.stageUnitManager.spawnUnits(this.units, this.isometricBoard);
    if (this.physicsDebugEnabled) {
      this.stageUnitManager?.togglePhysicsDebug?.(true);
    }

    // Apply visual 3D weapon meshes for equipped tools
    for (const item of this.playerInventory) {
      if (item.equippedTo) {
        const u = this.units.find((unit) => unit.id === item.equippedTo);
        if (u) {
          const slot = item.equippedSlot || normalizeSlot(item);
          if (slot === 'tool' && u.heldModelName) {
            this.stageUnitManager?.setUnitWeapon?.(u.id, u.heldModelName, u.team, item.finishTier);
          }
        }
      }
    }

    // Link sprite groups for screen projection and synchronize standHeight with actual actor stature
    for (const unit of this.units) {
      const actor = this.stageUnitManager.units.get(unit.id);
      if (actor && actor.sprite) {
        unit.group = actor.sprite.group;
        unit.standHeight = actor.sprite.standHeight;
      }
    }

    // Update Forge Clan Roster State with Azure units
    this._syncForgeRoster();

    // Initialize HUD Header
    this.tacticalHud.setHeaderState({
      seed: `0x${this.baseSeed.toString(16).toUpperCase()}`,
      orbs: this.playerOrbs,
      compassLabel: `${this.tacticalCamera.compass} ${this.tacticalCamera.step * 45}°`,
      autoBattle: this.autoBattle,
      turnNumber: this.turnCount,
      raidBossMode: this.raidBossMode,
      physicsDebug: !!this.physicsDebugEnabled
    });

    // Update active law banner if Judge Law system exists
    const activeLaw = this.turnManager.getActiveLaw?.();
    if (activeLaw) {
      this.tacticalHud.updateLawBanner?.(activeLaw);
    }

    this.tacticalHud.addLog(
      `BATTLEFIELD SEED 0x${this.baseSeed.toString(16).toUpperCase()} READY // Azure Clan vs Crimson Order.`,
      'system'
    );
  }

  toggleRaidBossMode() {
    this.raidBossMode = !this.raidBossMode;
    this.tacticalHud.setHeaderState({ raidBossMode: this.raidBossMode });
    if (this.raidBossMode) {
      this.tacticalHud.addLog('☠ WARNING: 250x SET.WORLD RAID BOSS SOVEREIGN APPROACHING!', 'system');
    } else {
      this.tacticalHud.addLog('Raid Boss Mode deactivated // Standard Clan skirmish.', 'system');
    }
    this.setupBattlefield(this.baseSeed).then(() => {
      this.advanceTurn();
    });
  }

  _syncForgeRoster() {
    const azureUnits = this.units.filter((u) => u.team === 'blue' || u.team === 'azure');
    const rosterUnits = azureUnits.map((u) => {
      const eq = {
        tool: u.equipment?.tool || { name: u.weapon?.name || (u.weapon?.heldModelName ? `${u.weapon.heldModelName.toUpperCase()} Blade` : 'Mythril Broadsword'), tier: u.grade || 'B', slot: 'tool' },
        offhand: u.equipment?.offhand || { name: u.equipment?.shield?.name || (u.className === 'Knight' ? 'Kite Shield' : u.className === 'Paladin' ? 'Holy Aegis' : 'Focus Orb'), tier: 'B', slot: 'offhand' },
        head: u.equipment?.head || { name: `${u.className} Visor`, tier: 'B', slot: 'head' },
        chest: u.equipment?.chest || { name: 'Azure Clan Mail', tier: 'A', slot: 'chest' },
        legs: u.equipment?.legs || { name: `${u.className} Greaves`, tier: 'B', slot: 'legs' },
        feet: u.equipment?.feet || { name: `${u.className} Sabatons`, tier: 'B', slot: 'feet' },
        neck: u.equipment?.neck || { name: 'Amulet of Set', tier: 'A', slot: 'neck' },
        finger: u.equipment?.finger || { name: 'Band of Set Heritage', tier: 'A', slot: 'finger' }
      };

      for (const item of this.playerInventory) {
        if (item.equippedTo === u.id) {
          const slot = item.equippedSlot || normalizeSlot(item);
          eq[slot] = item;
        }
      }

      u.equipment = eq;
      u.resonances = computeSetWorldResonance(u);

      return {
        id: u.id,
        name: u.name,
        job: u.className || u.job,
        grade: u.grade,
        powerRating: u.rawCharacter?.powerRating || 750,
        stats: {
          STR: u.stats?.physicalDamage || 35,
          DEX: u.stats?.accuracy || 30,
          INT: u.stats?.magicDamage || 25,
          AGI: Math.round((u.stats?.walkSpeed || 1.0) * 25),
          VIT: Math.round((u.stats?.maxHealth || 100) * 0.35),
          WIS: u.stats?.magicResistance || 24,
          WIL: 28,
          LUK: u.stats?.dodge || 15,
          DEF: u.stats?.armor || 20
        },
        traits: ['Set Heritage', `${u.className} Discipline`],
        equippedTool: eq.tool?.name ? `${eq.tool.name} (✦ ${eq.tool.orbValue || 125} Orbs)` : `${u.weapon?.heldModelName ? u.weapon.heldModelName.toUpperCase() : 'WEAPON'} (✦ 125 Orbs)`,
        equippedArmor: eq.chest?.name || 'Azure Clan Mail',
        equipment: eq,
        passive: u.passive,
        resonances: u.resonances,
        seed: String(u.seed)
      };
    });

    this.clanRoster = azureUnits;

    this.forgeModal.updateState({
      orbs: this.playerOrbs,
      inventory: this.playerInventory,
      clanUnits: rosterUnits
    });
  }

  /* ========================================================================
     FFTA CT Turn Loop Core
     ======================================================================== */

  async advanceTurn() {
    const currentMatchId = this.matchId;
    if (this.battleOver || this.matchId !== currentMatchId) return;
    if (this._isProcessingTurn) return;
    this._isProcessingTurn = true;

    try {
      // Check if battle has already ended
      if (this._checkBattleOutcome()) {
        this._isProcessingTurn = false;
        return;
      }

      // Check and update active Judge Law
      const activeLaw = this.turnManager.getActiveLaw?.();
      if (activeLaw) {
        this.tacticalHud.updateLawBanner?.(activeLaw);
        this.hud?.updateLawBanner?.(activeLaw);
      }

      // Advance CT clock to next ready unit
      const nextResult = this.turnManager.nextTurn(this.units);
      this.activeUnit = nextResult.activeUnit;

      if (!this.activeUnit) {
        console.warn('[TacticsGame] No living units ready for next turn.');
        this._isProcessingTurn = false;
        return;
      }

      this.turnCount++;
      this.activeUnit.hasMoved = false;
      this.activeUnit.hasActed = false;

      // Status Effects incapacitation check (Frozen / Sleeping)
      const rawStatus = (this.activeUnit.status || '').toLowerCase();
      if (rawStatus === 'frozen' || rawStatus === 'sleeping' || rawStatus === 'sleep') {
        const isFrozen = rawStatus === 'frozen';
        const statusLabel = isFrozen ? '❄️ FROZEN — TURN SKIPPED' : '💤 SLEEPING — TURN SKIPPED';
        this.tacticalHud.addLog(
          `✦ ${this.activeUnit.name} is ${isFrozen ? 'frozen solid' : 'fast asleep'} and must skip their turn!`,
          'combat'
        );
        const headAnchor = this.stageUnitManager.getUnitScreenAnchor(this.activeUnit.id, this.isometricBoard);
        this.tacticalHud.spawnFloatingText(headAnchor, statusLabel, 'crit', this.projectWorldToScreen);

        this.turnManager.endTurn(this.activeUnit, false, false);
        if (!this.activeUnit.status) {
          this.stageUnitManager.setUnitStatus?.(this.activeUnit.id, null);
        }
        this.isometricBoard.setActiveUnitTile(null, null);

        this._isProcessingTurn = false;
        if (this._turnTimer) clearTimeout(this._turnTimer);
        this._turnTimer = setTimeout(() => {
          if (this.matchId !== currentMatchId) return;
          this.advanceTurn();
        }, 450);
        return;
      }

      // Pan camera to focus on active unit
      const unitWorldPos = this.isometricBoard.tileToWorld(
        this.activeUnit.gridX,
        this.activeUnit.gridZ,
        this.activeUnit.elevation
      );
      this.tacticalCamera.setFocus(unitWorldPos.x, unitWorldPos.y, unitWorldPos.z);

      // Highlight active unit tile with pulsing gold border
      this.isometricBoard.setActiveUnitTile(this.activeUnit.gridX, this.activeUnit.gridZ);

      // Update HUD
      this.tacticalHud.setHeaderState({
        turnNumber: this.turnCount,
        orbs: this.playerOrbs
      });
      this.tacticalHud.updateTurnQueue(
        this.turnManager.getTurnQueuePreview(this.units, 8),
        this.activeUnit
      );
      this.tacticalHud.setInspectedTarget(null, null, null);

      const isPlayerClan = this.activeUnit.team === 'blue' || this.activeUnit.team === 'azure';
      const isAuto = this.autoBattle || !isPlayerClan;

      this.tacticalHud.addLog(
        `✦ TURN ${this.turnCount} [${this.activeUnit.team.toUpperCase()}]: ${this.activeUnit.name} ready (CT ${this.activeUnit.ct}).`,
        'info'
      );

      if (this.matchId !== currentMatchId) return;

      if (isAuto) {
        // AI Controlled Turn (Crimson Order or Auto-Battle Azure)
        await this._executeAITurn();
      } else {
        // Player Interactive Turn - release lock so player can take actions
        this._isProcessingTurn = false;
        this.enterCommandMenu();
      }
    } catch (err) {
      console.error('[TacticsGame] advanceTurn error:', err);
      this._isProcessingTurn = false;
    }
  }

  togglePhysicsDebug() {
    const active = !!(this.stageUnitManager?.togglePhysicsDebug?.());
    this.physicsDebugEnabled = active;
    this.tacticalHud.setHeaderState({ physicsDebug: active });
    this.tacticalHud.addLog(
      `🔬 3d.internet.dev Volumetric Physics Hulls & 6-Layer Inspector: ${active ? 'ACTIVE' : 'OFF'}`,
      'system'
    );
    return active;
  }

  enterCommandMenu() {
    this.currentMode = 'menu';
    this.isometricBoard.clearHighlights();
    const adjSwitch = this.isometricBoard?.getAdjacentSwitch?.(this.activeUnit.gridX, this.activeUnit.gridZ);
    this.activeUnit._adjacentSwitch = adjSwitch;
    this.tacticalHud.setActiveUnit(this.activeUnit, 'menu', null);
  }

  async executeFlipSwitch(switchInfo) {
    if (!this.activeUnit || this.currentMode === 'animating') return;
    const currentMatchId = this.matchId;
    this.currentMode = 'animating';
    this.tacticalHud.setActiveUnit(this.activeUnit, 'animating');
    try {
      if (typeof this.stageUnitManager?.animateFlipSwitch === 'function') {
        await this.stageUnitManager.animateFlipSwitch(this.activeUnit, switchInfo, this.isometricBoard);
      } else if (typeof this.isometricBoard?.toggleRuneSwitch === 'function') {
        this.isometricBoard.toggleRuneSwitch(switchInfo?.x ?? switchInfo?.gridX, switchInfo?.z ?? switchInfo?.gridZ);
      }
      if (this.matchId !== currentMatchId) return;
      this.tacticalHud.addLog(
        `⚙️ ${this.activeUnit.name} flipped the Ancient Rune Switch! Floodgate causeways toggled!`,
        'system'
      );
    } catch (err) {
      console.error('[TacticsGame] executeFlipSwitch error:', err);
    } finally {
      if (this.matchId === currentMatchId) {
        this.enterCommandMenu();
      }
    }
  }

  /* ========================================================================
     Player Actions: Move, Act, Wait
     ======================================================================== */

  enterMoveMode() {
    if (!this.activeUnit || this.activeUnit.hasMoved || this.currentMode === 'animating') return;

    this.currentMode = 'move';
    this.reachableTiles = getReachableTiles(this.activeUnit, this.isometricBoard, this.units);

    // Display azure blue glowing reachable tiles
    this.isometricBoard.showMoveHighlights(this.reachableTiles);
    this.tacticalHud.setActiveUnit(this.activeUnit, 'move', null);
    this.tacticalHud.addLog('Select reachable tile [BLUE] to move.', 'system');
  }

  async executeMove(targetTile) {
    if (!this.activeUnit || this.currentMode !== 'move') return;
    const currentMatchId = this.matchId;

    const matchedPathEntry = this.reachableTiles.find(
      (t) => t.x === targetTile.x && t.z === targetTile.z
    );

    if (!matchedPathEntry) return;

    this.currentMode = 'animating';
    this.activeUnit.hasMoved = true;
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(this.activeUnit, 'animating');

    try {
      // Smooth step-by-step movement with Jump Up/Down arc animations
      await this.stageUnitManager.animateMovePath(
        this.activeUnit,
        matchedPathEntry.path,
        this.isometricBoard
      );
      if (this.matchId !== currentMatchId) return;

      // Ensure synchronized coordinates
      this.activeUnit.gridX = matchedPathEntry.x;
      this.activeUnit.gridZ = matchedPathEntry.z;
      this.activeUnit.x = matchedPathEntry.x;
      this.activeUnit.z = matchedPathEntry.z;
      this.activeUnit.elevation = matchedPathEntry.elevation ?? this.activeUnit.elevation;

      // Refocus active unit gold highlight and camera
      this.isometricBoard.setActiveUnitTile(this.activeUnit.gridX, this.activeUnit.gridZ);
      const newPos = this.isometricBoard.tileToWorld(
        this.activeUnit.gridX,
        this.activeUnit.gridZ,
        this.activeUnit.elevation
      );
      this.tacticalCamera.setFocus(newPos.x, newPos.y, newPos.z);

      this.tacticalHud.addLog(
        `${this.activeUnit.name} moved to (${matchedPathEntry.x}, ${matchedPathEntry.z}).`,
        'info'
      );

      // Check if there is a loot bag at the destination tile
      if (this.stageUnitManager?.pickupLootBag) {
        const loot = await this.stageUnitManager.pickupLootBag(this.activeUnit.x, this.activeUnit.z, this.activeUnit);
        if (loot) {
          const isPlayerClan = this.activeUnit.team === 'blue' || this.activeUnit.team === 'azure';
          if (isPlayerClan) {
            const orbsEarned = loot.orbs || 35;
            this.playerOrbs += orbsEarned;
            this.statsSummary.orbsWon += orbsEarned;
            if (loot.item) {
              this.playerInventory.unshift(loot.item);
            }
            const headAnchor = this.stageUnitManager.getUnitScreenAnchor(this.activeUnit.id, this.isometricBoard);
            this.tacticalHud.spawnFloatingText(
              headAnchor,
              `✦ LOOT POUCH: +${orbsEarned} ORBS!`,
              'orbs',
              this.projectWorldToScreen
            );
            this.tacticalHud.addLog(
              `✦ LOOT CLAIMED: ${this.activeUnit.name} picked up a Loot Pouch (+${orbsEarned} Orbs)!`,
              'loot'
            );
            this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
            this._syncForgeRoster();
          }
        }
      }

      // If unit has already acted, proceed to facing compass
      if (this.activeUnit.hasActed) {
        this.enterWaitMode();
      } else {
        this.enterCommandMenu();
      }
    } catch (err) {
      console.error('[TacticsGame] player action error:', err);
      if (this.matchId === currentMatchId) this.enterCommandMenu();
    }
  }

  enterActMode(ability = null) {
    if (!this.activeUnit || this.activeUnit.hasActed || this.currentMode === 'animating') return;

    this.currentMode = 'act';
    const abilities = this.activeUnit.abilities || this.activeUnit.weapon?.abilities || [];
    this.selectedAbility =
      ability ||
      abilities[0] || {
        id: 'basic_attack',
        name: 'Weapon Strike',
        range: this.activeUnit.weapon?.attackRange || { min: 1, max: 1 },
        animPrefix: this.activeUnit.weapon?.baseAnimPrefix || 'Swing',
        powerMult: 1.0,
        costMp: 0
      };

    this.attackableTiles = getAttackableTiles(
      this.activeUnit,
      this.activeUnit.gridX,
      this.activeUnit.gridZ,
      this.selectedAbility,
      this.isometricBoard
    );

    // Show red attack or emerald support highlights
    this.isometricBoard.showAttackHighlights(
      this.attackableTiles,
      !!this.selectedAbility.isSupport
    );
    this.tacticalHud.setActiveUnit(this.activeUnit, 'act', this.selectedAbility);
    this.tacticalHud.addLog(
      `Targeting with ${this.selectedAbility.name} [RNG ${this.selectedAbility.range?.min ?? 1}-${this.selectedAbility.range?.max ?? 1}].`,
      'system'
    );
  }

  selectTargetUnit(targetUnit) {
    if (!this.activeUnit || !this.selectedAbility || !targetUnit) return;

    this.inspectedTarget = targetUnit;
    const rawForecast = calculateCombatForecast(
      this.activeUnit,
      targetUnit,
      this.selectedAbility,
      this.isometricBoard
    );

    // Format forecast for HUD
    this.activeForecast = {
      ...rawForecast,
      attacker: this.activeUnit,
      defender: targetUnit,
      ability: this.selectedAbility,
      abilityName: this.selectedAbility.name,
      damage: rawForecast.expectedDamage,
      hitRate: rawForecast.hitChance,
      critRate: rawForecast.critChance,
      stance:
        rawForecast.stance === 'High'
          ? 'HIGH (+15%)'
          : rawForecast.stance === 'Low'
          ? 'LOW (-15%)'
          : 'MID',
      angle:
        rawForecast.attackAngle === 'Back'
          ? 'BACKSTAB +30%!'
          : rawForecast.attackAngle === 'Side'
          ? 'SIDE +15%'
          : 'FRONT',
      isBackstab: rawForecast.attackAngle === 'Back',
      isFlank: rawForecast.attackAngle === 'Side'
    };

    this.tacticalHud.setInspectedTarget(targetUnit, null, this.activeForecast);
  }

  async confirmCombatAction() {
    if (
      !this.activeUnit ||
      !this.inspectedTarget ||
      !this.selectedAbility ||
      this.currentMode === 'animating'
    ) {
      return;
    }
    const currentMatchId = this.matchId;

    const attacker = this.activeUnit;
    const defender = this.inspectedTarget;
    const ability = this.selectedAbility;
    const forecast = this.activeForecast;

    this.currentMode = 'animating';
    attacker.hasActed = true;
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(attacker, 'animating');
    this.tacticalHud.setInspectedTarget(null, null, null);

    try {
      // Before/during attack, evaluate FFTA Judge Law compliance
      const lawResult = this._checkJudgeLaw(attacker, defender, forecast);
      if (lawResult?.redCard) {
        attacker.hasActed = true;
        this.currentMode = 'standby';
        this.turnManager.endTurn(attacker, attacker.hasMoved, true);
        if (this._checkBattleOutcome()) return;
        this.advanceTurn();
        return;
      }

      // Execute deterministic combat outcome
      const outcome = executeCombatAction(attacker, defender, ability, this.isometricBoard);
      outcome.reactionAnimation = outcome.defenderAnim;
      outcome.critical = outcome.crit;
      outcome.isHeal = outcome.heal > 0;

      // Track combat telemetry
      if (outcome.damage > 0) {
        this.statsSummary.damageDealt += outcome.damage;
      }
      if (outcome.crit) {
        this.statsSummary.crits++;
      }

      // Animate 3D weapon strike, projectile, and impact reaction
      await this.stageUnitManager.animateCombatAction(
        attacker,
        defender,
        forecast,
        outcome,
        this.isometricBoard
      );
      if (this.matchId !== currentMatchId) return;

      const attackerActor = this.stageUnitManager?._getActor?.(attacker);
      const defenderActor = this.stageUnitManager?._getActor?.(defender);
      const headAnchor = this.stageUnitManager.getUnitScreenAnchor(defender.id, this.isometricBoard);

      // 1. Combo Attack (pummel_combo or comboTier > 1)
      const comboTier = outcome.comboTier || (ability?.id === 'pummel_combo' ? 3 : 1);
      if (comboTier > 1 && typeof attackerActor?.playComboAttack === 'function') {
        await attackerActor.playComboAttack(defenderActor, comboTier);
        this.tacticalHud.spawnFloatingText(headAnchor, `COMBO x${comboTier}!`, 'crit', this.projectWorldToScreen);
        this.tacticalHud.addLog(`🥊 PUMMEL COMBO! ${attacker.name} executed a ${comboTier}-hit combo!`, 'combat');
      }

      // 2. Channeled Bard / Dancer Performance (bard_anthem, dancer_allure)
      if ((ability?.isChannel || ability?.id === 'bard_anthem' || ability?.id === 'dancer_allure') && typeof attackerActor?.playBardPerformance === 'function') {
        const targetActors = [defenderActor].filter(Boolean);
        await attackerActor.playBardPerformance(ability, targetActors);
        this.tacticalHud.addLog(`🎺 PERFORMANCE! ${attacker.name} performed ${ability.name}!`, 'combat');
      }

      // 3. Orator Talk Skill (talk_recruit)
      if (ability?.isTalkSkill || ability?.id === 'talk_recruit' || outcome.isTalkSkill) {
        if (typeof attackerActor?.playTalkSkill === 'function') {
          await attackerActor.playTalkSkill(defenderActor, outcome.recruited);
        }
        if (outcome.recruited) {
          defender.team = 'azure';
          defender.color = 0x38bdf8;
          defender.alive = true;
          this.tacticalHud.showCelebrationBanner(
            `🤝 RECRUITED!`,
            `${defender.name} defected to your Clan!`
          );
          this.tacticalHud.addLog(`🤝 RECRUITED! ${defender.name} defected to your Clan!`, 'combat');
          if (!this.clanRoster.some(u => u.id === defender.id)) {
            this.clanRoster.push(defender);
          }
          this._syncForgeRoster();
          this.tacticalHud.updateOverheadBars(this.units, this.projectWorldToScreen);
          if (this._checkBattleOutcome()) return;
        }
      }

      // 4. Samurai Shirahadori Counter
      if (outcome.samuraiCounter?.triggered) {
        if (typeof defenderActor?.playSamuraiCounter === 'function') {
          await defenderActor.playSamuraiCounter(attackerActor);
        }
        const counterDmg = outcome.samuraiCounter.damage || 45;
        attacker.hp = Math.max(0, (attacker.hp || 100) - counterDmg);
        const atkAnchor = this.stageUnitManager.getUnitScreenAnchor(attacker.id, this.isometricBoard);
        this.tacticalHud.spawnFloatingText(atkAnchor, `⚔️ SHIRAHADORI -${counterDmg}`, 'crit', this.projectWorldToScreen);
        this.tacticalHud.addLog(`⚔️ SHIRAHADORI! ${defender.name} caught the blade and countered for ${counterDmg} DMG!`, 'combat');
      }

      // 5. Lifesteal heal / CT strip telemetry
      if (outcome.lifestealHeal > 0) {
        attacker.hp = Math.min(attacker.maxHp || 100, (attacker.hp || 0) + outcome.lifestealHeal);
        const atkAnchor = this.stageUnitManager.getUnitScreenAnchor(attacker.id, this.isometricBoard);
        this.tacticalHud.spawnFloatingText(atkAnchor, `+${outcome.lifestealHeal} LIFESTEAL`, 'heal', this.projectWorldToScreen);
      }
      if (outcome.ctStripped > 0) {
        defender.ct = Math.max(0, (defender.ct || 0) - outcome.ctStripped);
        this.tacticalHud.spawnFloatingText(headAnchor, `-${outcome.ctStripped} CT`, 'crit', this.projectWorldToScreen);
      }

      // Spawn floating damage/heal/crit/orbs popups
      if (outcome.heal > 0) {
        this.tacticalHud.spawnFloatingText(headAnchor, outcome.heal, 'heal', this.projectWorldToScreen);
        this.tacticalHud.addLog(
          `${attacker.name} restored +${outcome.heal} HP to ${defender.name}.`,
          'combat'
        );
      } else if (outcome.hit) {
        const kind = outcome.crit ? 'crit' : 'damage';
        this.tacticalHud.spawnFloatingText(headAnchor, outcome.damage, kind, this.projectWorldToScreen);

        let combatMsg = `${attacker.name} struck ${defender.name} with ${ability.name} for ${outcome.damage} DMG`;
        if (outcome.crit) combatMsg += ' [CRITICAL!]';
        if (outcome.blocked) combatMsg += ' [SHIELD BLOCKED -65%]';
        this.tacticalHud.addLog(combatMsg, 'combat');

        if (outcome.defenderDead || (defender.hp !== undefined && defender.hp <= 0)) {
          this.tacticalHud.addLog(`💀 ${defender.name} was defeated!`, 'combat');
          const defX = defender.x ?? defender.gridX;
          const defZ = defender.z ?? defender.gridZ;
          const lootData = outcome.lootDrop || { orbs: 35, x: defX, z: defZ };
          this.stageUnitManager.spawnLootBag?.(defX, defZ, this.isometricBoard, lootData);
          this.tacticalHud.addLog(`✦ Loot Pouch dropped at (${defX}, ${defZ})!`, 'loot');
        }
      } else {
        this.tacticalHud.spawnFloatingText(headAnchor, 'MISS', 'miss', this.projectWorldToScreen);
        this.tacticalHud.addLog(`${attacker.name}'s attack missed ${defender.name}!`, 'combat');
      }

      // Handle Revive action
      if (outcome.revived || ability?.isRevive) {
        defender.alive = true;
        defender.isDead = false;
        defender.inPrison = false;
        if (defender.hp <= 0) {
          defender.hp = outcome.heal || Math.round((defender.maxHp || 100) * 0.5);
        }
        this.stageUnitManager?.reviveUnit?.(defender.id, this.isometricBoard);
        this.tacticalHud.addLog(`✨ ${attacker.name} resurrected ${defender.name} with ${ability.name}!`, 'combat');
        this.tacticalHud.spawnFloatingText(headAnchor, '✨ REVIVED!', 'heal', this.projectWorldToScreen);
      }

      // Handle Plunder / Steal
      if (outcome.stolenItem) {
        this.playerInventory.unshift(outcome.stolenItem);
        const stolenOrbs = outcome.stolenOrbs || 35;
        this.playerOrbs += stolenOrbs;
        this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
        this.tacticalHud.addLog(`🖐️ PLUNDERED: ${attacker.name} stole ${outcome.stolenItem.name} (+${stolenOrbs} Orbs)!`, 'loot');
        this._syncForgeRoster();
        this._saveClanState();
      }

      // Handle Knockback
      if (outcome.knockbackTile) {
        defender.gridX = outcome.knockbackTile.x;
        defender.gridZ = outcome.knockbackTile.z;
        defender.x = outcome.knockbackTile.x;
        defender.z = outcome.knockbackTile.z;
        if (outcome.knockbackTile.elevation !== undefined) {
          defender.elevation = outcome.knockbackTile.elevation;
        }
        this.tacticalHud.addLog(
          `💥 KNOCKBACK! ${defender.name} was blasted back to (${outcome.knockbackTile.x}, ${outcome.knockbackTile.z})!`,
          'combat'
        );
      }

      // Apply status effects if triggered
      if (outcome.statusApplied) {
        defender.status = outcome.statusApplied;
        this.stageUnitManager.setUnitStatus?.(defender.id, outcome.statusApplied);
        const statusIcons = {
          frozen: '❄️ FROZEN!',
          sleeping: '💤 ASLEEP!',
          confused: '💫 CONFUSED!',
          float: '🪽 FLOAT!',
          floating: '🪽 FLOAT!'
        };
        const statusText = statusIcons[outcome.statusApplied.toLowerCase()] || `⚡ ${outcome.statusApplied.toUpperCase()}!`;
        this.tacticalHud.spawnFloatingText(headAnchor, statusText, 'crit', this.projectWorldToScreen);
        this.tacticalHud.addLog(`✦ STATUS APPLIED: ${defender.name} is now ${statusText}`, 'combat');
      }

      // Award Set Orbs for combat
      if (outcome.orbsEarned > 0) {
        this.playerOrbs += outcome.orbsEarned;
        this.statsSummary.orbsWon += outcome.orbsEarned;
        this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
        this.tacticalHud.spawnFloatingText(
          headAnchor,
          outcome.orbsEarned,
          'orbs',
          this.projectWorldToScreen
        );
      }

      // Check if combat concluded the battle
      if (this._checkBattleOutcome()) return;

      // If unit has already moved, proceed to facing compass
      if (attacker.hasMoved) {
        this.enterWaitMode();
      } else {
        this.enterCommandMenu();
      }
    } catch (err) {
      console.error('[TacticsGame] player action error:', err);
      if (this.matchId === currentMatchId) this.enterCommandMenu();
    }
  }

  executeAttack(attacker, defender, ability) {
    if (attacker) this.activeUnit = attacker;
    if (defender) this.inspectedTarget = defender;
    if (ability) this.selectedAbility = ability;
    return this.confirmCombatAction();
  }

  _checkJudgeLaw(attacker, defender, forecast) {
    if (!this.turnManager?.evaluateLawCompliance) return null;

    const isBackstab = !!(forecast?.isBackstab || forecast?.attackAngle === 'Back');
    const distance = Math.abs(attacker.gridX - defender.gridX) + Math.abs(attacker.gridZ - defender.gridZ);
    const heightDelta = (attacker.elevation || 0) - (defender.elevation || 0);
    const weaponModel = attacker.heldModelName || attacker.weapon?.heldModelName || attacker.weaponType || 'sword';

    const result = this.turnManager.evaluateLawCompliance(attacker, defender, {
      ability: this.selectedAbility || attacker.weapon?.abilities?.[0],
      forecast,
      isBackstab,
      distance,
      heightDelta,
      weaponModel
    });

    if (result?.redCard) {
      this.tacticalHud.addLog(
        `🟥 JUDGE RED CARD! ${attacker.name} committed a 2nd Law violation and is banished to Judge Prison!`,
        'combat'
      );
      const anchor = this.stageUnitManager.getUnitScreenAnchor(attacker.id, this.isometricBoard);
      this.tacticalHud.spawnFloatingText(anchor, '🟥 RED CARD: BANISHED!', 'crit', this.projectWorldToScreen);
      const isPlayerClan = attacker.team === 'blue' || attacker.team === 'azure';
      if (isPlayerClan) {
        this.playerOrbs = Math.max(0, this.playerOrbs - 50);
        this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      }
      attacker.inPrison = true;
      attacker.alive = false;
      attacker.isDead = true;
      attacker.hp = 0;
      this.stageUnitManager?.playDefeat?.(attacker.id);
      this._saveClanState();
    } else if (result && (result.violated || result.penalty)) {
      const lawName = result.lawName || result.law?.name || 'Judge Law';
      const reason = result.reason || 'Forbidden Action';
      this.tacticalHud.addLog(
        `⚖️ JUDGE YELLOW CARD! ${attacker.name} violated ${lawName} (${reason})!`,
        'combat'
      );

      // Deduct 1 Set Orb and apply CT penalty
      this.playerOrbs = Math.max(0, this.playerOrbs - 1);
      attacker.ct = Math.max(0, (attacker.ct || 100) - 20);
      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });

      const anchor = this.stageUnitManager.getUnitScreenAnchor(attacker.id, this.isometricBoard);
      this.tacticalHud.spawnFloatingText(anchor, 'JUDGE: YELLOW CARD!', 'crit', this.projectWorldToScreen);
      this._saveClanState();
    }

    if (result?.lawBonusOrbs) {
      this.playerOrbs += result.lawBonusOrbs;
      this.tacticalHud.addLog(
        `⚖️ JUDGE LAW BONUS: +${result.lawBonusOrbs} Set Orbs (${result.lawBonusReason || 'Lawful Streak'})!`,
        'loot'
      );
      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      const anchor = this.stageUnitManager.getUnitScreenAnchor(attacker.id, this.isometricBoard);
      this.tacticalHud.spawnFloatingText(anchor, `+${result.lawBonusOrbs} LAW BONUS`, 'orbs', this.projectWorldToScreen);
      this._saveClanState();
    }

    return result;
  }

  enterWaitMode() {
    if (!this.activeUnit || this.currentMode === 'animating') return;

    this.currentMode = 'wait';
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(this.activeUnit, 'wait', null);
    this.tacticalHud.addLog('Choose final facing direction [8-way compass].', 'system');
  }

  confirmEndTurn(facing) {
    if (!this.activeUnit || this.currentMode === 'animating') return;
    const currentMatchId = this.matchId;

    // Update facing
    const finalFacing = facing || this.activeUnit.facing || 'SE';
    this.activeUnit.facing = finalFacing;
    const actor = this.stageUnitManager?._getActor?.(this.activeUnit);
    if (typeof actor?.playRotateStep === 'function') {
      actor.playRotateStep(finalFacing);
    } else if (actor?.sprite) {
      actor.sprite.setFacing(finalFacing);
    }

    // Deduct CT based on resting status (base 60, +20 moved, +20 acted)
    const result = this.turnManager.endTurn(
      this.activeUnit,
      this.activeUnit.hasMoved,
      this.activeUnit.hasActed
    );

    if (!this.activeUnit.hasMoved && !this.activeUnit.hasActed) {
      this.tacticalHud.addLog(
        `${this.activeUnit.name} rested, conserving 40 CT (remaining: ${result.remainingCt}).`,
        'info'
      );
    } else {
      this.tacticalHud.addLog(
        `${this.activeUnit.name} ended turn facing ${finalFacing} (CT deducted: ${result.ctCost}).`,
        'info'
      );
    }

    this.currentMode = 'standby';
    this.activeUnit = null;
    this.inspectedTarget = null;
    this.activeForecast = null;
    this.isometricBoard.clearHighlights();
    this.isometricBoard.setActiveUnitTile(null, null);

    // Schedule next turn asynchronously to unwind promise call stack
    if (this._turnTimer) clearTimeout(this._turnTimer);
    this._turnTimer = setTimeout(() => {
      if (this.matchId !== currentMatchId) return;
      this.advanceTurn();
    }, 80);
  }

  cancelCurrentMode() {
    if (this.currentMode === 'animating') return;

    if (this.currentMode === 'act' || this.currentMode === 'move' || this.currentMode === 'wait') {
      this.enterCommandMenu();
    } else if (this.activeForecast) {
      this.activeForecast = null;
      this.inspectedTarget = null;
      this.tacticalHud.setInspectedTarget(null, null, null);
    }
  }

  /* ========================================================================
     AI Controlled Turn Automation
     ======================================================================== */

  async _executeAITurn() {
    const currentMatchId = this.matchId;
    const aiUnit = this.activeUnit;
    let turnEnded = false;

    try {
      this.currentMode = 'animating';
      this.tacticalHud.setActiveUnit(aiUnit, 'animating');
      this.isometricBoard.clearHighlights();

      // Compute tactical decision via high-level evaluation
      const decision = this.turnManager.computeTacticalAI(
        aiUnit,
        this.units,
        this.isometricBoard
      );

      // 1. Animate Movement if AI decided to reposition
      if (decision.movePath && decision.movePath.length > 1) {
        aiUnit.hasMoved = true;
        await this.stageUnitManager.animateMovePath(
          aiUnit,
          decision.movePath,
          this.isometricBoard
        );
        if (this.matchId !== currentMatchId) return;

        aiUnit.gridX = decision.moveTile.x;
        aiUnit.gridZ = decision.moveTile.z;
        aiUnit.x = decision.moveTile.x;
        aiUnit.z = decision.moveTile.z;
        aiUnit.elevation = decision.moveTile.elevation ?? aiUnit.elevation;

        this.isometricBoard.setActiveUnitTile(aiUnit.gridX, aiUnit.gridZ);
        const newPos = this.isometricBoard.tileToWorld(aiUnit.gridX, aiUnit.gridZ, aiUnit.elevation);
        this.tacticalCamera.setFocus(newPos.x, newPos.y, newPos.z);

        // Check if AI stepped on a loot bag
        if (this.stageUnitManager?.pickupLootBag) {
          const loot = await this.stageUnitManager.pickupLootBag(aiUnit.x, aiUnit.z, aiUnit);
          if (loot) {
            const isPlayerClan = aiUnit.team === 'blue' || aiUnit.team === 'azure';
            if (isPlayerClan) {
              const orbsEarned = loot.orbs || 35;
              this.playerOrbs += orbsEarned;
              this.statsSummary.orbsWon += orbsEarned;
              if (loot.item) {
                this.playerInventory.unshift(loot.item);
              }
              const headAnchor = this.stageUnitManager.getUnitScreenAnchor(aiUnit.id, this.isometricBoard);
              this.tacticalHud.spawnFloatingText(
                headAnchor,
                `✦ LOOT POUCH: +${orbsEarned} ORBS!`,
                'orbs',
                this.projectWorldToScreen
              );
              this.tacticalHud.addLog(
                `✦ LOOT CLAIMED: ${aiUnit.name} picked up a Loot Pouch (+${orbsEarned} Orbs)!`,
                'loot'
              );
              this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
              this._syncForgeRoster();
            } else {
              this.tacticalHud.addLog(`☠ Loot bag seized by enemy ${aiUnit.name}!`, 'combat');
            }
          }
        }
      }

      // Short readable tactical pause
      await this._sleep(350);
      if (this.matchId !== currentMatchId) return;

      // 2. Animate Combat Strike if target was in range
      if (decision.ability && decision.targetUnit) {
        aiUnit.hasActed = true;
        const target = decision.targetUnit;
        const ability = decision.ability;

        const rawForecast = calculateCombatForecast(
          aiUnit,
          target,
          ability,
          this.isometricBoard
        );
        const forecast = {
          ...rawForecast,
          attacker: aiUnit,
          defender: target,
          ability,
          abilityName: ability.name,
          damage: rawForecast.expectedDamage,
          hitRate: rawForecast.hitChance,
          critRate: rawForecast.critChance,
          stance:
            rawForecast.stance === 'High'
              ? 'HIGH (+15%)'
              : rawForecast.stance === 'Low'
              ? 'LOW (-15%)'
              : 'MID',
          angle:
            rawForecast.attackAngle === 'Back'
              ? 'BACKSTAB +30%!'
              : rawForecast.attackAngle === 'Side'
              ? 'SIDE +15%'
              : 'FRONT'
        };

        this.tacticalHud.setInspectedTarget(target, null, forecast);
        await this._sleep(400);
        if (this.matchId !== currentMatchId) return;

        // Check Judge Law compliance for AI combat
        const lawResult = this._checkJudgeLaw(aiUnit, target, forecast);
        if (lawResult?.redCard) {
          aiUnit.hasActed = true;
          this.turnManager.endTurn(aiUnit, aiUnit.hasMoved, true);
          turnEnded = true;
          this.isometricBoard.setActiveUnitTile(null, null);
          if (this._checkBattleOutcome()) {
            this._isProcessingTurn = false;
            return;
          }
          await this._sleep(250);
          if (this.matchId !== currentMatchId) return;
          this._isProcessingTurn = false;
          if (this._turnTimer) clearTimeout(this._turnTimer);
          this._turnTimer = setTimeout(() => {
            if (this.matchId !== currentMatchId) return;
            this.advanceTurn();
          }, 80);
          return;
        }

        const outcome = executeCombatAction(aiUnit, target, ability, this.isometricBoard);
        outcome.reactionAnimation = outcome.defenderAnim;
        outcome.critical = outcome.crit;
        outcome.isHeal = outcome.heal > 0;

        // Status effects applied by AI
        if (outcome.statusApplied) {
          target.status = outcome.statusApplied;
          this.stageUnitManager.setUnitStatus?.(target.id, outcome.statusApplied);
          const statusIcons = {
            frozen: '❄️ FROZEN!',
            sleeping: '💤 ASLEEP!',
            confused: '💫 CONFUSED!',
            float: '🪽 FLOAT!',
            floating: '🪽 FLOAT!'
          };
          const statusText = statusIcons[outcome.statusApplied.toLowerCase()] || `⚡ ${outcome.statusApplied.toUpperCase()}!`;
          const headAnchor = this.stageUnitManager.getUnitScreenAnchor(target.id, this.isometricBoard);
          this.tacticalHud.spawnFloatingText(headAnchor, statusText, 'crit', this.projectWorldToScreen);
          this.tacticalHud.addLog(`✦ STATUS APPLIED: ${target.name} is now ${statusText}`, 'combat');
        }

        await this.stageUnitManager.animateCombatAction(
          aiUnit,
          target,
          forecast,
          outcome,
          this.isometricBoard
        );
        if (this.matchId !== currentMatchId) return;

        const aiActor = this.stageUnitManager?._getActor?.(aiUnit);
        const targetActor = this.stageUnitManager?._getActor?.(target);

        // 1. Combo Attack
        const comboTier = outcome.comboTier || (ability?.id === 'pummel_combo' ? 3 : 1);
        if (comboTier > 1 && typeof aiActor?.playComboAttack === 'function') {
          await aiActor.playComboAttack(targetActor, comboTier);
        }

        // 2. Performance
        if ((ability?.isChannel || ability?.id === 'bard_anthem' || ability?.id === 'dancer_allure') && typeof aiActor?.playBardPerformance === 'function') {
          const targetActors = [targetActor].filter(Boolean);
          await aiActor.playBardPerformance(ability, targetActors);
        }

        // 3. Talk Skill
        if (ability?.isTalkSkill || ability?.id === 'talk_recruit' || outcome.isTalkSkill) {
          if (typeof aiActor?.playTalkSkill === 'function') {
            await aiActor.playTalkSkill(targetActor, outcome.recruited);
          }
          if (outcome.recruited) {
            target.team = 'crimson';
            this.tacticalHud.showCelebrationBanner(`🗣️ DEFECTED!`, `${target.name} defected to the Crimson Order!`);
          }
        }

        // 4. Samurai Counter
        if (outcome.samuraiCounter?.triggered) {
          if (typeof targetActor?.playSamuraiCounter === 'function') {
            await targetActor.playSamuraiCounter(aiActor);
          }
          const counterDmg = outcome.samuraiCounter.damage || 45;
          aiUnit.hp = Math.max(0, (aiUnit.hp || 100) - counterDmg);
          const aiAnchor = this.stageUnitManager.getUnitScreenAnchor(aiUnit.id, this.isometricBoard);
          this.tacticalHud.spawnFloatingText(aiAnchor, `⚔️ SHIRAHADORI -${counterDmg}`, 'crit', this.projectWorldToScreen);
          this.tacticalHud.addLog(`⚔️ SHIRAHADORI! ${target.name} countered ${aiUnit.name} for ${counterDmg} DMG!`, 'combat');
        }

        const headAnchor = this.stageUnitManager.getUnitScreenAnchor(
          target.id,
          this.isometricBoard
        );
        if (outcome.heal > 0) {
          this.tacticalHud.spawnFloatingText(
            headAnchor,
            outcome.heal,
            'heal',
            this.projectWorldToScreen
          );
          this.tacticalHud.addLog(
            `${aiUnit.name} healed ${target.name} for +${outcome.heal} HP.`,
            'combat'
          );
        } else if (outcome.hit) {
          const kind = outcome.crit ? 'crit' : 'damage';
          this.tacticalHud.spawnFloatingText(
            headAnchor,
            outcome.damage,
            kind,
            this.projectWorldToScreen
          );
          let msg = `${aiUnit.name} struck ${target.name} for ${outcome.damage} DMG`;
          if (outcome.crit) msg += ' [CRITICAL!]';
          this.tacticalHud.addLog(msg, 'combat');

          if (outcome.defenderDead || (target.hp !== undefined && target.hp <= 0)) {
            this.tacticalHud.addLog(`💀 ${target.name} fell in combat!`, 'combat');
            const tgtX = target.x ?? target.gridX;
            const tgtZ = target.z ?? target.gridZ;
            const lootData = outcome.lootDrop || { orbs: 35, x: tgtX, z: tgtZ };
            this.stageUnitManager.spawnLootBag?.(tgtX, tgtZ, this.isometricBoard, lootData);
            this.tacticalHud.addLog(`✦ Loot Pouch dropped at (${tgtX}, ${tgtZ})!`, 'loot');
          }
        } else {
          this.tacticalHud.spawnFloatingText(
            headAnchor,
            'MISS',
            'miss',
            this.projectWorldToScreen
          );
          this.tacticalHud.addLog(`${aiUnit.name}'s attack missed!`, 'combat');
        }

        // Handle Revive action
        if (outcome.revived || ability?.isRevive) {
          target.alive = true;
          target.isDead = false;
          target.inPrison = false;
          if (target.hp <= 0) {
            target.hp = outcome.heal || Math.round((target.maxHp || 100) * 0.5);
          }
          this.stageUnitManager?.reviveUnit?.(target.id, this.isometricBoard);
          this.tacticalHud.addLog(`✨ ${aiUnit.name} resurrected ${target.name} with ${ability.name}!`, 'combat');
          this.tacticalHud.spawnFloatingText(headAnchor, '✨ REVIVED!', 'heal', this.projectWorldToScreen);
        }

        // Handle Plunder / Steal
        if (outcome.stolenItem) {
          const isPlayerClan = aiUnit.team === 'blue' || aiUnit.team === 'azure';
          if (isPlayerClan) {
            this.playerInventory.unshift(outcome.stolenItem);
            const stolenOrbs = outcome.stolenOrbs || 35;
            this.playerOrbs += stolenOrbs;
            this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
            this.tacticalHud.addLog(`🖐️ PLUNDERED: ${aiUnit.name} stole ${outcome.stolenItem.name} (+${stolenOrbs} Orbs)!`, 'loot');
            this._syncForgeRoster();
            this._saveClanState();
          } else {
            this.tacticalHud.addLog(`🖐️ PLUNDERED: ${aiUnit.name} plundered ${outcome.stolenItem.name} from ${target.name}!`, 'combat');
          }
        }

        // Handle Knockback
        if (outcome.knockbackTile) {
          target.gridX = outcome.knockbackTile.x;
          target.gridZ = outcome.knockbackTile.z;
          target.x = outcome.knockbackTile.x;
          target.z = outcome.knockbackTile.z;
          if (outcome.knockbackTile.elevation !== undefined) {
            target.elevation = outcome.knockbackTile.elevation;
          }
          this.tacticalHud.addLog(
            `💥 KNOCKBACK! ${target.name} was blasted back to (${outcome.knockbackTile.x}, ${outcome.knockbackTile.z})!`,
            'combat'
          );
        }

        this.tacticalHud.setInspectedTarget(null, null, null);
      }

      // 3. Finalize AI Facing and Deduct CT
      if (decision.endFacing) {
        aiUnit.facing = decision.endFacing;
        const actor = this.stageUnitManager.units.get(aiUnit.id);
        if (actor && actor.sprite) {
          actor.sprite.setFacing(decision.endFacing);
        }
      }

      this.turnManager.endTurn(aiUnit, aiUnit.hasMoved, aiUnit.hasActed);
      turnEnded = true;
      this.isometricBoard.setActiveUnitTile(null, null);

      // Check if AI turn ended the battle
      if (this._checkBattleOutcome()) {
        this._isProcessingTurn = false;
        return;
      }

      await this._sleep(250);
      if (this.matchId !== currentMatchId) return;
      // Unwind call stack before proceeding to next turn
      this._isProcessingTurn = false;
      if (this._turnTimer) clearTimeout(this._turnTimer);
      this._turnTimer = setTimeout(() => {
        if (this.matchId !== currentMatchId) return;
        this.advanceTurn();
      }, 80);
    } catch (err) {
      console.error('[TacticsGame] _executeAITurn error:', err);
      if (this.matchId === currentMatchId) {
        if (!turnEnded && aiUnit) {
          this.turnManager.endTurn(aiUnit, !!aiUnit.hasMoved, !!aiUnit.hasActed);
          turnEnded = true;
        }
        const actor = this.stageUnitManager?.units?.get(aiUnit?.id);
        if (actor?.sprite) {
          actor.sprite.play('Idle', performance.now() / 1000);
        }
        this.isometricBoard?.setActiveUnitTile(null, null);
        this.currentMode = 'standby';
        this._isProcessingTurn = false;
        if (!this._checkBattleOutcome()) {
          if (this._turnTimer) clearTimeout(this._turnTimer);
          this._turnTimer = setTimeout(() => {
            if (this.matchId !== currentMatchId) return;
            this.advanceTurn();
          }, 80);
        }
      }
    } finally {
      if (this.matchId === currentMatchId && !turnEnded && aiUnit) {
        this.turnManager.endTurn(aiUnit, !!aiUnit.hasMoved, !!aiUnit.hasActed);
        turnEnded = true;
      }
      this._isProcessingTurn = false;
    }
  }

  /* ========================================================================
     Win / Loss Conditions & Victory Banner
     ======================================================================== */

  _checkBattleOutcome() {
    const azureAlive = this.units.filter(
      (u) => (u.team === 'blue' || u.team === 'azure') && u.alive !== false && !u.isDead && !u.inPrison && (u.hp === undefined || u.hp > 0)
    ).length;

    const crimsonAlive = this.units.filter(
      (u) => (u.team === 'red' || u.team === 'crimson') && u.alive !== false && !u.isDead && !u.inPrison && (u.hp === undefined || u.hp > 0)
    ).length;

    if (crimsonAlive === 0) {
      if (this.gauntletActive) {
        if (this.gauntletFloor < this.gauntletMaxFloors) {
          // Advance to next Gauntlet Floor!
          const nextFloor = this.gauntletFloor + 1;
          this.gauntletFloor = nextFloor;
          this.playerOrbs += 2; // +2 Set.world Orbs per floor cleared
          this.statsSummary.orbsWon += 2;
          this.tacticalHud.setHeaderState({
            orbs: this.playerOrbs,
            gauntletFloor: nextFloor,
            gauntletActive: true
          });

          // Heal surviving clan units by 35% of max HP & MP
          const survivors = this.units.filter((u) => (u.team === 'blue' || u.team === 'azure') && u.alive !== false && !u.isDead && !u.inPrison);
          survivors.forEach((u) => {
            const healHp = Math.round((u.maxHp || 100) * 0.35);
            const healMp = Math.round((u.maxMp || 40) * 0.35);
            u.hp = Math.min(u.maxHp || 100, (u.hp || 0) + healHp);
            u.mp = Math.min(u.maxMp || 40, (u.mp || 0) + healMp);
          });
          this.clanRoster = survivors;

          this.tacticalHud.showCelebrationBanner(
            `🏰 TOWER GAUNTLET ADVANCEMENT!`,
            `Cleared Floor ${nextFloor - 1}! Entering Floor ${nextFloor}/${this.gauntletMaxFloors} (+2 Orbs, +35% HP/MP)!`
          );
          this.tacticalHud.addLog(
            `🏰 TOWER GAUNTLET: Cleared Floor ${nextFloor - 1}! Advancing to Floor ${nextFloor}/${this.gauntletMaxFloors}!`,
            'system'
          );

          this._saveClanState();
          this._startGauntletFloor(nextFloor);
          return true;
        } else {
          // Sovereign Sanctum Raid Boss Cleared!
          this.battleOver = true;
          this.playerOrbs += 350;
          this.statsSummary.orbsWon += 350;
          this.statsSummary.turns = this.turnCount;
          this.tacticalHud.setHeaderState({ orbs: this.playerOrbs, gauntletActive: false });
          this._saveClanState();
          this.tacticalHud.showVictoryBanner('azure', this.statsSummary, () => {
            this.rollNewBattlefield();
          });
          this.tacticalHud.showCelebrationBanner(
            `👑 SOVEREIGN CONQUEROR!`,
            `All 5 Gauntlet Floors Conquered! Ultimate Victory (+350 Orbs)!`
          );
          this.tacticalHud.addLog('👑 TOWER GAUNTLET COMPLETE! Sovereign Sanctum defeated!', 'system');
          return true;
        }
      }

      // Azure Clan Victory!
      this.battleOver = true;
      this.playerOrbs += 150;
      this.statsSummary.orbsWon += 150;
      this.statsSummary.turns = this.turnCount;

      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      this._saveClanState();
      this.tacticalHud.showVictoryBanner('azure', this.statsSummary, () => {
        this.rollNewBattlefield();
      });
      this.tacticalHud.addLog('✦ VICTORY! Crimson Order was driven from the stage!', 'system');
      return true;
    }

    if (azureAlive === 0) {
      // Crimson Order Defeat!
      this.battleOver = true;
      this.statsSummary.turns = this.turnCount;

      this.tacticalHud.showVictoryBanner('crimson', this.statsSummary, () => {
        this.rollNewBattlefield();
      });
      this.tacticalHud.addLog('⚔️ DEFEAT! Azure Clan forces have fallen.', 'system');
      return true;
    }

    return false;
  }

  /* ========================================================================
     Set.world Clan Forge & Armory Integration
     ======================================================================== */

  openForgeModal() {
    this._syncForgeRoster();
    this.forgeModal.open({
      orbs: this.playerOrbs,
      inventory: this.playerInventory
    });
  }

  async handleCraftItem(orbs) {
    try {
      const craftResult = await craftItem(orbs, deriveSeed(this.baseSeed, Date.now()));
      const grade = craftResult.item.tierGrade || craftResult.item.tier || 'C';
      const forgedItem = {
        id: `item-${Date.now()}`,
        name: craftResult.item.name,
        type:
          craftResult.item.slot === 'tool'
            ? 'weapon'
            : craftResult.item.slot === 'chest' || craftResult.item.slot === 'head'
            ? 'armor'
            : 'weapon',
        grade: grade,
        tier: grade,
        tierGrade: grade,
        orbValue: craftResult.item.orbValue || orbs,
        material: craftResult.item.material?.name || 'Mythril Steel',
        statsBonus: `Score ${craftResult.item.score} // ${craftResult.item.props?.[0]?.name || 'Refined'}`,
        rawItem: craftResult.item,
        equippedTo: null
      };

      const receipt = {
        candidateRolls: craftResult.rolls,
        tierGrade: grade,
        score: craftResult.item.score,
        orbValue: orbs,
        material: craftResult.item.material?.name || 'Mythril Steel',
        item: forgedItem,
        provenance: `https://set.world/craft?orbs=${orbs}&seed=${craftResult.seed}`
      };

      this.playerOrbs = Math.max(0, this.playerOrbs - orbs);
      this.playerInventory.unshift(forgedItem);
      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      this._saveClanState();

      this.tacticalHud.addLog(
        `✦ FORGED [Grade ${forgedItem.grade}]: ${forgedItem.name} using ${orbs} Set Orbs.`,
        'loot'
      );

      return { item: forgedItem, receipt, remainingOrbs: this.playerOrbs };
    } catch (err) {
      console.error('[TacticsGame] handleCraftItem error:', err);
      return null;
    }
  }

  handleSalvageItem(itemOrIndex, yieldOrbs) {
    let item = null;
    let index = -1;
    if (typeof itemOrIndex === 'object' && itemOrIndex !== null) {
      item = itemOrIndex;
      index = this.playerInventory.indexOf(item);
    } else {
      index = itemOrIndex;
      item = this.playerInventory[index];
    }

    if (!item) return;

    const actualYield = salvageItem(item.rawItem || item) || yieldOrbs || Math.max(1, Math.round((item.orbValue || 25) * 0.1));
    this.playerOrbs += actualYield;

    if (index >= 0 && index < this.playerInventory.length && this.playerInventory[index] === item) {
      this.playerInventory.splice(index, 1);
    } else {
      const idx = this.playerInventory.indexOf(item);
      if (idx !== -1) this.playerInventory.splice(idx, 1);
    }

    this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
    this._saveClanState();
    this.forgeModal.updateState({ orbs: this.playerOrbs, inventory: this.playerInventory });
    this.tacticalHud.addLog(
      `✦ SALVAGED: ${item.name} disassembled for +${actualYield} Set Orbs (10% sink).`,
      'loot'
    );
  }

  handleEquipItem(index, unitId, slot) {
    const item = this.playerInventory[index];
    if (!item) return;

    const targetSlot = slot || item.equippedSlot || normalizeSlot(item);

    // Unequip any other inventory item that was previously equipped to the same unitId AND the same targetSlot
    if (unitId) {
      for (let i = 0; i < this.playerInventory.length; i++) {
        const otherItem = this.playerInventory[i];
        if (i !== index && otherItem.equippedTo === unitId) {
          const otherSlot = otherItem.equippedSlot || normalizeSlot(otherItem);
          if (otherSlot === targetSlot) {
            otherItem.equippedTo = null;
            otherItem.equippedSlot = null;
          }
        }
      }
    }

    item.equippedTo = unitId || null;
    item.equippedSlot = targetSlot;

    if (unitId) {
      const unit = this.units.find((u) => u.id === unitId);
      if (unit) {
        if (typeof SetWorldClient['applyEquipmentToUnit'] === 'function') {
          SetWorldClient['applyEquipmentToUnit'](unit, item, targetSlot);
          if (targetSlot === 'tool' && unit.heldModelName && this.stageUnitManager?.setUnitWeapon) {
            this.stageUnitManager.setUnitWeapon(unit.id, unit.heldModelName, unit.team, item.finishTier);
          }
        } else {
          unit.equipment = unit.equipment || {};
          unit.equipment[targetSlot] = item;

          const stars = item.stars || item.boostStars || 0;
          const grade = (item.grade || item.tierGrade || 'B').toUpperCase();
          const baseBonus = grade === 'S' ? 20 : grade === 'A' ? 14 : grade === 'B' ? 8 : grade === 'C' ? 4 : 2;
          const totalBonus = baseBonus + stars * 3;

          unit.stats = unit.stats || {};
          if (targetSlot === 'tool') {
            const newSpec = mapToolToWeaponSpec(item.rawItem || item, unit.className);
            unit.weapon = newSpec;
            unit.weaponType = newSpec.weaponType;
            unit.heldModelName = newSpec.heldModelName;
            unit.abilities = newSpec.abilities;
            unit.attackRange = newSpec.attackRange;

            unit.stats.physicalDamage = (unit.stats.physicalDamage || 35) + totalBonus;
            unit.stats.STR = (unit.stats.STR || 35) + totalBonus;

            if (this.stageUnitManager?.setUnitWeapon) {
              this.stageUnitManager.setUnitWeapon(unit.id, newSpec.heldModelName, unit.team, item.finishTier);
            }
          } else if (targetSlot === 'offhand' || targetSlot === 'chest' || targetSlot === 'head') {
            unit.stats.armor = (unit.stats.armor || 20) + totalBonus;
            unit.stats.DEF = (unit.stats.DEF || 20) + totalBonus;
            unit.maxHp = (unit.maxHp || 100) + totalBonus * 2;
            unit.hp = Math.min(unit.maxHp, (unit.hp || 100) + totalBonus * 2);
          } else if (targetSlot === 'legs') {
            unit.stats.walkSpeed = (unit.stats.walkSpeed || 1.0) + (totalBonus * 0.05);
            unit.stats.AGI = (unit.stats.AGI || 30) + totalBonus;
          } else if (targetSlot === 'feet') {
            unit.stats.walkSpeed = (unit.stats.walkSpeed || 1.0) + (totalBonus * 0.08);
            unit.stats.AGI = (unit.stats.AGI || 30) + totalBonus;
          } else if (targetSlot === 'neck') {
            unit.stats.WIL = (unit.stats.WIL || 25) + totalBonus;
            unit.stats.WIS = (unit.stats.WIS || 25) + totalBonus;
            unit.maxMp = (unit.maxMp || 40) + totalBonus * 2;
            unit.mp = Math.min(unit.maxMp, (unit.mp || 40) + totalBonus * 2);
          } else if (targetSlot === 'finger') {
            unit.stats.magicDamage = (unit.stats.magicDamage || 25) + totalBonus;
            unit.stats.INT = (unit.stats.INT || 25) + totalBonus;
            unit.maxMp = (unit.maxMp || 40) + totalBonus;
            unit.mp = Math.min(unit.maxMp, (unit.mp || 40) + totalBonus);
          }

          unit.resonances = computeSetWorldResonance(unit);
        }

        this.tacticalHud.addLog(
          `⚔️ EQUIPPED [${targetSlot.toUpperCase()}]: ${unit.name} equipped ${item.name}.`,
          'loot'
        );

        // Update active unit card if currently inspected
        if (this.activeUnit === unit) {
          this.tacticalHud.setActiveUnit(unit, this.currentMode, this.selectedAbility);
        }
      }
    }

    this._syncForgeRoster();
    this._saveClanState();
  }

  handleBoostItem(itemOrIndex) {
    let item = null;
    let index = -1;
    if (typeof itemOrIndex === 'object' && itemOrIndex !== null) {
      item = itemOrIndex;
      index = this.playerInventory.indexOf(item);
    } else {
      index = itemOrIndex;
      item = this.playerInventory[index];
    }

    if (!item) return;

    if (this.playerOrbs < 75) {
      this.tacticalHud.addLog('⚠️ Insufficient Set Orbs! Boosting requires 75 Orbs.', 'system');
      return;
    }

    if ((item.stars || 0) >= 5) {
      this.tacticalHud.addLog(`✦ ${item.name} is already max rank (+5 ★)!`, 'system');
      return;
    }

    this.playerOrbs -= 75;
    const upgradedItem = boostItemWithOrbs(item, 75) || item;

    // If the item is currently equipped to a unit, update that unit's weapon stats/stars/finishTier
    // AND call this.stageUnitManager.setUnitWeapon?.(unit.id, unit.weapon?.heldModelName, unit.team, item.finishTier)
    if (upgradedItem.equippedTo) {
      const unit = this.units.find((u) => u.id === upgradedItem.equippedTo);
      if (unit) {
        if (unit.weapon) {
          unit.weapon.stars = upgradedItem.stars;
          unit.weapon.finishTier = upgradedItem.finishTier;
          unit.weapon.elementalPrefix = upgradedItem.elementalPrefix;
          if (upgradedItem.statsBonus) {
            unit.weapon.statsBonus = upgradedItem.statsBonus;
          }
        }
        unit.stars = upgradedItem.stars;
        unit.finishTier = upgradedItem.finishTier;
        unit.elementalPrefix = upgradedItem.elementalPrefix;

        const heldModel = unit.weapon?.heldModelName || unit.heldModelName || 'sword';
        this.stageUnitManager.setUnitWeapon?.(unit.id, heldModel, unit.team, upgradedItem.finishTier);

        if (this.activeUnit === unit) {
          this.tacticalHud.setActiveUnit(unit, this.currentMode, this.selectedAbility);
        }
      }
    }

    this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
    this._saveClanState();
    this.forgeModal.updateState({ orbs: this.playerOrbs, inventory: this.playerInventory });
    this.tacticalHud.addLog(
      `✦ BOOSTED: ${upgradedItem.name} [${upgradedItem.elementalPrefix || 'ASTRAL'}] upgraded to ★ +${upgradedItem.stars} (${upgradedItem.finishTier} finish)!`,
      'loot'
    );
    this._syncForgeRoster();
  }

  /* ========================================================================
     User Interactions & Keyboard Routing
     ======================================================================== */

  rotateCamera(deltaDeg) {
    const stepDelta = deltaDeg > 0 ? 1 : -1;
    const res = this.tacticalCamera.rotateStep(stepDelta);
    this.tacticalHud.setHeaderState({
      compassLabel: `${res.compass} ${res.step * 45}°`
    });
  }

  toggleAutoBattle() {
    this.autoBattle = !this.autoBattle;
    this.tacticalHud.setHeaderState({ autoBattle: this.autoBattle });
    this.tacticalHud.addLog(
      `AI Auto-Battle toggled: ${this.autoBattle ? 'ENABLED ⚡' : 'DISABLED'}.`,
      'system'
    );

    // If it was the player's turn, immediately trigger AI takeover safely under concurrency lock
    if (this.autoBattle && this.activeUnit && this.currentMode !== 'animating' && !this._isProcessingTurn) {
      this._isProcessingTurn = true;
      this._executeAITurn();
    }
  }

  openSpriteStudio() {
    if (!this.spriteStudioModal) {
      this.spriteStudioModal = new SpriteStudioModal(this.uiContainer || document.body, {
        onSyncToActor: (seqName) => {
          const actor = this.stageUnitManager?._getActor?.(this.activeUnit);
          if (actor) {
            if (typeof actor.playSequence === 'function') {
              actor.playSequence(seqName);
            } else if (actor.sprite) {
              actor.sprite.play?.(seqName, performance.now() / 1000);
            }
          }
        },
        onApplyCustomSheet: (dataUrl) => {
          this.tacticalHud.addLog('Custom a1.png applied to 3D battlefield units.', 'system');
        }
      });
    }

    const loadData = this.spriteData
      ? Promise.resolve(this.spriteData)
      : fetch('/tactics-sprite-data.json')
          .then((r) => r.json())
          .catch(() => null);

    loadData.then((data) => {
      this.spriteData = data;
      this.spriteStudioModal.loadSpriteData(data, this.units);
      this.spriteStudioModal.open();
    });
  }

  async toggleFreeRoamMode() {
    this.freeRoamActive = !this.freeRoamActive;
    this.tacticalHud.setHeaderState({ freeRoam: this.freeRoamActive });

    if (this.freeRoamActive) {
      if (!this.freeRoamController) {
        if (StageFreeRoamController) {
          this.freeRoamController = new StageFreeRoamController();
        } else {
          this.freeRoamController = new FallbackFreeRoamController();
        }
      }
      const actor = this.stageUnitManager?._getActor?.(this.activeUnit);
      this.freeRoamController.enable(actor, this.isometricBoard, this.scene);
      this.tacticalHud.addLog('🕹️ Real-Time Free-Roam Mode ENABLED.', 'system');
    } else {
      this.freeRoamController?.disable();
      this.tacticalHud.addLog('🕹️ Free-Roam Mode DISABLED. Restored tactical grid.', 'system');
    }
  }

  toggleGauntletMode() {
    this.gauntletActive = !this.gauntletActive;
    if (this.gauntletActive) {
      this.gauntletFloor = 1;
      this.tacticalHud.setHeaderState({
        gauntletActive: true,
        gauntletFloor: 1,
        gauntletMaxFloors: 5
      });
      this.tacticalHud.showCelebrationBanner('🏰 TOWER GAUNTLET STARTED!', 'Floor 1/5: Crimson Scouting Party');
      this.tacticalHud.addLog('🏰 TOWER GAUNTLET STARTED: Fight through all 5 floors!', 'system');
      this._startGauntletFloor(1);
    } else {
      this.tacticalHud.setHeaderState({ gauntletActive: false });
      this.tacticalHud.addLog('🏰 Tower Gauntlet mode exited.', 'system');
    }
  }

  _startGauntletFloor(floor) {
    this.gauntletFloor = floor;
    this.battleOver = false;
    this._isProcessingTurn = false;

    const rollEnemiesFn = typeof SetWorldClient.rollGauntletFloorEnemies === 'function'
      ? SetWorldClient.rollGauntletFloorEnemies
      : fallbackRollGauntletFloorEnemies;
    const newEnemies = rollEnemiesFn(this.seed || this.baseSeed, floor, this.isometricBoard);

    // Position player clan on lower coords (x: 1..3, z: 1..3)
    const startCoords = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
      { x: 3, z: 1 },
      { x: 1, z: 3 }
    ];

    const currentClan = this.clanRoster && this.clanRoster.length > 0
      ? this.clanRoster
      : this.units.filter((u) => u.team === 'blue' || u.team === 'azure');

    currentClan.forEach((u, i) => {
      const pos = startCoords[i % startCoords.length];
      u.gridX = pos.x;
      u.gridZ = pos.z;
      u.x = pos.x;
      u.z = pos.z;
      u.elevation = this.isometricBoard?.getElevation(pos.x, pos.z) ?? 0;
      u.team = 'azure';
      u.alive = true;
      u.isDead = false;
      u.inPrison = false;
      u.hasMoved = false;
      u.hasActed = false;
      u.ct = 0;
    });

    this.units = [...currentClan, ...newEnemies];
    this.stageUnitManager.initUnits(this.units, this.isometricBoard);
    this.turnManager.initQueue(this.units);
    this.tacticalHud.updateTurnRibbon(this.turnManager.getTurnOrder(8));
    this.tacticalHud.updateOverheadBars(this.units, this.projectWorldToScreen);
    this.advanceTurn();
  }

  handleRerollUnit(unit, customSeed) {
    this._syncForgeRoster();
    this._saveClanState();
    const actor = this.stageUnitManager?._getActor?.(unit);
    if (actor) {
      actor.unit = unit;
    }
    this.tacticalHud.updateOverheadBars(this.units, this.projectWorldToScreen);
    this.tacticalHud.addLog(`🎲 Unit ${unit.name} re-rolled with seed ${customSeed}.`, 'system');
  }

  async rollNewBattlefield() {
    const nextSeed = deriveSeed(this.baseSeed, Date.now());
    const hexSeed = `0x${nextSeed.toString(16).toUpperCase()}`;
    try {
      window.history.replaceState(null, '', `?seed=${hexSeed}`);
    } catch (e) {
      // Sandbox guard
    }
    this.tacticalHud.addLog(`Generating new battlefield seed ${hexSeed}...`, 'system');
    await this.setupBattlefield(nextSeed);
    this.advanceTurn();
  }

  _pickTileOrUnit(clientX, clientY) {
    let picked = this.isometricBoard.pickTile(
      clientX,
      clientY,
      this.tacticalCamera,
      this.canvas
    );

    // If pickTile didn't hit a top tile face directly under a unit sprite,
    // check screen-projected distance to living units within 36px
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    let closestUnit = null;
    let minUnitDist = 36; // 36px threshold
    const isReviveTargeting = this.currentMode === 'act' && (this.selectedAbility?.isRevive || this.selectedAbility?.targetsDead);

    for (const unit of this.units) {
      const isDead = unit.isDead || unit.alive === false || (unit.hp !== undefined && unit.hp <= 0);
      if (isDead) {
        if (!isReviveTargeting || unit.team !== this.activeUnit?.team) continue;
      }
      const actorPos = this.stageUnitManager.getUnitScreenAnchor(unit.id, this.isometricBoard) || unit.group?.position;
      if (actorPos) {
        const proj = this.projectWorldToScreen(actorPos);
        if (proj && proj.visible !== false) {
          const dist = Math.hypot(proj.x - mouseX, proj.y - mouseY);
          if (dist < minUnitDist) {
            minUnitDist = dist;
            closestUnit = unit;
          }
        }
      }
    }

    if (closestUnit) {
      return {
        x: closestUnit.gridX ?? closestUnit.x,
        z: closestUnit.gridZ ?? closestUnit.z,
        elevation: closestUnit.elevation ?? 0,
        unit: closestUnit
      };
    }

    return picked;
  }

  _initEventListeners() {
    // Canvas Resize Observer
    window.addEventListener('resize', () => {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h);
      this.tacticalCamera.resize(w, h);
    });

    // Mouse Move Hover Raycasting
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.currentMode === 'animating') return;

      const picked = this._pickTileOrUnit(e.clientX, e.clientY);

      if (picked) {
        this.isometricBoard.setHoverTile(picked.x, picked.z);

        // Find unit at tile (supporting Phoenix Revive targeting dead allies)
        const isReviveMode = this.currentMode === 'act' && (this.selectedAbility?.isRevive || this.selectedAbility?.targetsDead);
        const unitAtTile = picked.unit || this.units.find((u) => {
          if (u.gridX !== picked.x || u.gridZ !== picked.z) return false;
          const isDead = u.isDead || u.alive === false || (u.hp !== undefined && u.hp <= 0);
          if (isReviveMode) {
            return isDead ? (u.team === this.activeUnit?.team) : true;
          }
          return !isDead;
        });

        if (unitAtTile) {
          if (this.currentMode === 'act' && this.selectedAbility) {
            // Check if in attackable range
            const inRange = this.attackableTiles.some(
              (t) => t.x === picked.x && t.z === picked.z
            );
            if (inRange) {
              this.selectTargetUnit(unitAtTile);
              return;
            }
          }
          // Inspect unit
          this.tacticalHud.setInspectedTarget(unitAtTile, picked, null);
        } else {
          // Inspect tile terrain
          this.tacticalHud.setInspectedTarget(null, picked, null);
        }
      } else {
        this.isometricBoard.setHoverTile(null, null);
      }
    });

    // Mouse Click Tile & Target Confirmation
    this.canvas.addEventListener('click', (e) => {
      if (this.currentMode === 'animating') return;

      const picked = this._pickTileOrUnit(e.clientX, e.clientY);

      if (!picked) return;

      if (this.currentMode === 'move') {
        this.executeMove(picked);
      } else if (this.currentMode === 'act') {
        const isReviveMode = this.currentMode === 'act' && (this.selectedAbility?.isRevive || this.selectedAbility?.targetsDead);
        const unitAtTile = picked.unit || this.units.find((u) => {
          if (u.gridX !== picked.x || u.gridZ !== picked.z) return false;
          const isDead = u.isDead || u.alive === false || (u.hp !== undefined && u.hp <= 0);
          if (isReviveMode) {
            return isDead ? (u.team === this.activeUnit?.team) : true;
          }
          return !isDead;
        });

        if (unitAtTile) {
          const inRange = this.attackableTiles.some(
            (t) => t.x === picked.x && t.z === picked.z
          );
          if (inRange) {
            if (this.inspectedTarget === unitAtTile && this.activeForecast) {
              // Second click confirms attack
              this.confirmCombatAction();
            } else {
              this.selectTargetUnit(unitAtTile);
            }
          }
        }
      }
    });

    // Right-click cancel
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.cancelCurrentMode();
    });
  }

  /* ========================================================================
     Continuous Render & Animation Loop
     ======================================================================== */

  _startRenderLoop() {
    let lastTime = performance.now();

    const frame = (now) => {
      requestAnimationFrame(frame);

      const nowSec = now / 1000;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update camera smooth pan & azimuth rotation
      this.tacticalCamera.update(dt);

      // Update active gold tile pulsation
      this.isometricBoard.update(nowSec);

      // Live GPU water caustics update
      this.isometricBoard.updateWaterCaustics?.(this.renderer);

      // Real-time Free-Roam controller update
      if (this.freeRoamActive && this.freeRoamController) {
        const az = this.tacticalCamera?.currentAzimuth ?? this.tacticalCamera?.azimuth ?? 0;
        this.freeRoamController.update(dt, az);
      }

      // Update sprites, projectiles, and hit burst shockwaves
      this.stageUnitManager.update(nowSec, dt, this.tacticalCamera);

      // Update 2D overhead unit tags and HP bars in screen space
      this.tacticalHud.updateOverheadBars(this.units, this.projectWorldToScreen);

      // Render Three.js scene
      this.renderer.render(this.scene, this.tacticalCamera.camera);
    };

    requestAnimationFrame(frame);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Bootstrap master game on DOMContentLoaded or immediate execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.tacticsApp = new TacticsGame();
  });
} else {
  window.tacticsApp = new TacticsGame();
}
