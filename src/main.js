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
import { TacticalCamera } from './stage/tactical-camera.js';
import { IsometricBoard } from './stage/isometric-board.js';
import { StageUnitManager } from './stage/unit-actor.js';
import { TurnManager } from './game/turn-manager.js';
import { TacticalHUD } from './ui/tactical-hud.js';
import { ForgeModal } from './ui/forge-modal.js';
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

class TacticsGame {
  constructor() {
    this.canvas = document.getElementById('tactics-stage');
    this.uiContainer = document.getElementById('tactics-ui');

    if (!this.canvas || !this.uiContainer) {
      throw new Error('Required DOM container elements (#tactics-stage, #tactics-ui) not found.');
    }

    // Battle Configuration & Persistence
    this.baseSeed = 0x1337;
    this.playerOrbs = 450;
    this.autoBattle = false;
    this.battleOver = false;
    this.turnCount = 1;
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
        orbValue: 125,
        material: 'Mythril Steel',
        statsBonus: '+12 STR, +4 VIT',
        equippedTo: 'unit_blue_0'
      },
      {
        id: 'item-init-2',
        name: 'Composite Longbow',
        type: 'weapon',
        grade: 'B',
        orbValue: 125,
        material: 'Ironwood & Mythril',
        statsBonus: '+14 DEX, +6 AGI',
        equippedTo: 'unit_blue_1'
      },
      {
        id: 'item-init-3',
        name: 'Arcane Focus Rod',
        type: 'weapon',
        grade: 'A',
        orbValue: 625,
        material: 'Starlight Crystal',
        statsBonus: '+22 INT, +10 WIS',
        equippedTo: 'unit_blue_2'
      },
      {
        id: 'item-init-4',
        name: 'Obsidian Dirk',
        type: 'weapon',
        grade: 'C',
        orbValue: 25,
        material: 'Obsidian Glass',
        statsBonus: '+6 DEX, +4 LUK',
        equippedTo: 'unit_blue_3'
      },
      {
        id: 'item-init-5',
        name: 'Tower Aegis Shield',
        type: 'armor',
        grade: 'B',
        orbValue: 125,
        material: 'Tempered Mythril',
        statsBonus: '+18 DEF, +8 VIT',
        equippedTo: null
      }
    ];

    // Initialize Subsystems
    this._initRenderer();
    this._initScene();
    this._initLighting();
    this._initManagers();
    this._initEventListeners();

    // Start lifecycle
    this.start();
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
      onCancelMode: () => this.cancelCurrentMode(),
      onConfirmCombat: () => this.confirmCombatAction(),
      onRotateCamera: (delta) => this.rotateCamera(delta),
      onZoomCamera: (delta) => this.tacticalCamera.zoom(delta),
      onToggleAutoBattle: () => this.toggleAutoBattle(),
      onNewSeed: () => this.rollNewBattlefield(),
      onOpenForge: () => this.openForgeModal()
    });

    // Set.world Clan Forge Modal Callbacks
    this.forgeModal = new ForgeModal(document.body, {
      onCraftItem: (orbs) => this.handleCraftItem(orbs),
      onSalvageItem: (index, yieldOrbs) => this.handleSalvageItem(index, yieldOrbs),
      onEquipItem: (index, unitId) => this.handleEquipItem(index, unitId),
      onClose: () => {
        this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
      }
    });
  }

  /* ========================================================================
     Lifecycle & Battle Setup
     ======================================================================== */

  async start() {
    this.tacticalHud.addLog('TACTICS ENGINE INITIALIZING // Loading 3D Mythril Assets...', 'system');

    // 1. Load sprite atlas, sprite sheet, Set 3D item models and Mythril materials
    await this.stageUnitManager.loadAssets(this.renderer);

    // 2. Load seeded 4v4 clan roster and spawn units
    await this.setupBattlefield(this.baseSeed);

    // 3. Start render & animation loop
    this._startRenderLoop();

    // 4. Begin FFTA CT Turn Loop
    this.advanceTurn();
  }

  async setupBattlefield(seed) {
    this.battleOver = false;
    this.turnCount = 1;
    this.baseSeed = (seed >>> 0);

    // Rebuild terrain for new seed
    this.isometricBoard.dispose();
    this.isometricBoard = new IsometricBoard(this.scene, this.baseSeed);

    // Generate seeded clan roster (4 Azure Clan vs 4 Crimson Order)
    const rosterData = await generateClanRoster(this.baseSeed, this.isometricBoard);
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

    // Spawn 3D sprite actors and ground plinths
    this.stageUnitManager.spawnUnits(this.units, this.isometricBoard);

    // Link sprite groups for screen projection
    for (const unit of this.units) {
      const actor = this.stageUnitManager.units.get(unit.id);
      if (actor && actor.sprite) {
        unit.group = actor.sprite.group;
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
      turnNumber: this.turnCount
    });

    this.tacticalHud.addLog(
      `BATTLEFIELD SEED 0x${this.baseSeed.toString(16).toUpperCase()} READY // Azure Clan vs Crimson Order.`,
      'system'
    );
  }

  _syncForgeRoster() {
    const azureUnits = this.units.filter((u) => u.team === 'blue');
    const rosterUnits = azureUnits.map((u) => ({
      id: u.id,
      name: u.name,
      job: u.className,
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
      equippedTool: `${u.weapon?.heldModelName ? u.weapon.heldModelName.toUpperCase() : 'WEAPON'} (✦ 125 Orbs)`,
      equippedArmor: 'Azure Clan Mail',
      seed: String(u.seed)
    }));

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
    if (this.battleOver) return;

    // Check if battle has already ended
    if (this._checkBattleOutcome()) return;

    // Advance CT clock to next ready unit
    const nextResult = this.turnManager.nextTurn(this.units);
    this.activeUnit = nextResult.activeUnit;

    if (!this.activeUnit) {
      console.warn('[TacticsGame] No living units ready for next turn.');
      return;
    }

    this.turnCount++;
    this.activeUnit.hasMoved = false;
    this.activeUnit.hasActed = false;

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

    const isPlayerClan = this.activeUnit.team === 'blue';
    const isAuto = this.autoBattle || !isPlayerClan;

    this.tacticalHud.addLog(
      `✦ TURN ${this.turnCount} [${this.activeUnit.team.toUpperCase()}]: ${this.activeUnit.name} ready (CT ${this.activeUnit.ct}).`,
      'info'
    );

    if (isAuto) {
      // AI Controlled Turn (Crimson Order or Auto-Battle Azure)
      await this._executeAITurn();
    } else {
      // Player Interactive Turn
      this.enterCommandMenu();
    }
  }

  enterCommandMenu() {
    this.currentMode = 'menu';
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(this.activeUnit, 'menu', null);
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

    const matchedPathEntry = this.reachableTiles.find(
      (t) => t.x === targetTile.x && t.z === targetTile.z
    );

    if (!matchedPathEntry) return;

    this.currentMode = 'animating';
    this.activeUnit.hasMoved = true;
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(this.activeUnit, 'animating');

    // Smooth step-by-step movement with Jump Up/Down arc animations
    await this.stageUnitManager.animateMovePath(
      this.activeUnit,
      matchedPathEntry.path,
      this.isometricBoard
    );

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

    // If unit has already acted, proceed to facing compass
    if (this.activeUnit.hasActed) {
      this.enterWaitMode();
    } else {
      this.enterCommandMenu();
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

    const attacker = this.activeUnit;
    const defender = this.inspectedTarget;
    const ability = this.selectedAbility;
    const forecast = this.activeForecast;

    this.currentMode = 'animating';
    attacker.hasActed = true;
    this.isometricBoard.clearHighlights();
    this.tacticalHud.setActiveUnit(attacker, 'animating');
    this.tacticalHud.setInspectedTarget(null, null, null);

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

    // Spawn floating damage/heal/crit/orbs popups
    const headAnchor = this.stageUnitManager.getUnitScreenAnchor(defender.id, this.isometricBoard);
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

      if (outcome.defenderDead) {
        this.tacticalHud.addLog(`💀 ${defender.name} was defeated!`, 'combat');
      }
    } else {
      this.tacticalHud.spawnFloatingText(headAnchor, 'MISS', 'miss', this.projectWorldToScreen);
      this.tacticalHud.addLog(`${attacker.name}'s attack missed ${defender.name}!`, 'combat');
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

    // Update facing
    const finalFacing = facing || this.activeUnit.facing || 'SE';
    this.activeUnit.facing = finalFacing;
    const actor = this.stageUnitManager.units.get(this.activeUnit.id);
    if (actor && actor.sprite) {
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

    // Proceed to next CT turn
    this.advanceTurn();
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
    const aiUnit = this.activeUnit;
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

      aiUnit.gridX = decision.moveTile.x;
      aiUnit.gridZ = decision.moveTile.z;
      aiUnit.x = decision.moveTile.x;
      aiUnit.z = decision.moveTile.z;
      aiUnit.elevation = decision.moveTile.elevation ?? aiUnit.elevation;

      this.isometricBoard.setActiveUnitTile(aiUnit.gridX, aiUnit.gridZ);
      const newPos = this.isometricBoard.tileToWorld(aiUnit.gridX, aiUnit.gridZ, aiUnit.elevation);
      this.tacticalCamera.setFocus(newPos.x, newPos.y, newPos.z);
    }

    // Short readable tactical pause
    await this._sleep(350);

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

      const outcome = executeCombatAction(aiUnit, target, ability, this.isometricBoard);
      outcome.reactionAnimation = outcome.defenderAnim;
      outcome.critical = outcome.crit;
      outcome.isHeal = outcome.heal > 0;

      await this.stageUnitManager.animateCombatAction(
        aiUnit,
        target,
        forecast,
        outcome,
        this.isometricBoard
      );

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

        if (outcome.defenderDead) {
          this.tacticalHud.addLog(`💀 ${target.name} fell in combat!`, 'combat');
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
    this.isometricBoard.setActiveUnitTile(null, null);

    // Check if AI turn ended the battle
    if (this._checkBattleOutcome()) return;

    await this._sleep(250);
    this.advanceTurn();
  }

  /* ========================================================================
     Win / Loss Conditions & Victory Banner
     ======================================================================== */

  _checkBattleOutcome() {
    const azureAlive = this.units.filter(
      (u) => u.team === 'blue' && u.alive !== false && (u.hp === undefined || u.hp > 0)
    ).length;

    const crimsonAlive = this.units.filter(
      (u) => u.team === 'red' && u.alive !== false && (u.hp === undefined || u.hp > 0)
    ).length;

    if (crimsonAlive === 0) {
      // Azure Clan Victory!
      this.battleOver = true;
      this.playerOrbs += 150;
      this.statsSummary.orbsWon += 150;
      this.statsSummary.turns = this.turnCount;

      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
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
      const forgedItem = {
        id: `item-${Date.now()}`,
        name: craftResult.item.name,
        type:
          craftResult.item.slot === 'tool'
            ? 'weapon'
            : craftResult.item.slot === 'chest' || craftResult.item.slot === 'head'
            ? 'armor'
            : 'weapon',
        grade: craftResult.item.tierGrade || 'C',
        orbValue: craftResult.item.orbValue || orbs,
        material: craftResult.item.material?.name || 'Mythril Steel',
        statsBonus: `Score ${craftResult.item.score} // ${craftResult.item.props?.[0]?.name || 'Refined'}`,
        rawItem: craftResult.item,
        equippedTo: null
      };

      const receipt = {
        candidateRolls: craftResult.rolls,
        tierGrade: craftResult.item.tierGrade || 'C',
        score: craftResult.item.score,
        orbValue: orbs,
        material: craftResult.item.material?.name || 'Mythril Steel',
        item: forgedItem,
        provenance: `https://set.world/craft?orbs=${orbs}&seed=${craftResult.seed}`
      };

      this.playerOrbs = Math.max(0, this.playerOrbs - orbs);
      this.playerInventory.unshift(forgedItem);
      this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });

      this.tacticalHud.addLog(
        `✦ FORGED [Grade ${forgedItem.grade}]: ${forgedItem.name} using ${orbs} Set Orbs.`,
        'loot'
      );

      return { item: forgedItem, receipt };
    } catch (err) {
      console.error('[TacticsGame] handleCraftItem error:', err);
      return null;
    }
  }

  handleSalvageItem(index, yieldOrbs) {
    const item = this.playerInventory[index];
    if (!item) return;

    const actualYield = salvageItem(item.rawItem) || yieldOrbs || Math.max(1, Math.round((item.orbValue || 25) * 0.1));
    this.playerOrbs += actualYield;
    this.tacticalHud.setHeaderState({ orbs: this.playerOrbs });
    this.tacticalHud.addLog(
      `✦ SALVAGED: ${item.name} disassembled for +${actualYield} Set Orbs (10% sink).`,
      'loot'
    );
  }

  handleEquipItem(index, unitId) {
    const item = this.playerInventory[index];
    if (!item) return;

    item.equippedTo = unitId || null;

    if (unitId) {
      const unit = this.units.find((u) => u.id === unitId);
      if (unit) {
        if (item.type === 'weapon' || item.slot === 'tool') {
          // Re-map weapon model and tactical abilities live!
          const newSpec = mapToolToWeaponSpec(item.rawItem || item, unit.className);
          unit.weapon = newSpec;
          unit.weaponType = newSpec.weaponType;
          unit.heldModelName = newSpec.heldModelName;
          unit.abilities = newSpec.abilities;
          unit.attackRange = newSpec.attackRange;

          this.tacticalHud.addLog(
            `⚔️ EQUIPPED: ${unit.name} wields ${item.name} [3D Model: ${newSpec.heldModelName}].`,
            'loot'
          );

          // Update active unit card if currently inspected
          if (this.activeUnit === unit) {
            this.tacticalHud.setActiveUnit(unit, this.currentMode, this.selectedAbility);
          }
        }
      }
    }
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

    // If it was the player's turn, immediately trigger AI takeover
    if (this.autoBattle && this.activeUnit && this.currentMode !== 'animating') {
      this._executeAITurn();
    }
  }

  async rollNewBattlefield() {
    const nextSeed = deriveSeed(this.baseSeed, Date.now());
    this.tacticalHud.addLog(`Generating new battlefield seed 0x${nextSeed.toString(16)}...`, 'system');
    await this.setupBattlefield(nextSeed);
    this.advanceTurn();
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

      const picked = this.isometricBoard.pickTile(
        e.clientX,
        e.clientY,
        this.tacticalCamera,
        this.canvas
      );

      if (picked) {
        this.isometricBoard.setHoverTile(picked.x, picked.z);

        // Find unit at tile
        const unitAtTile = this.units.find(
          (u) =>
            u.alive !== false &&
            (u.hp === undefined || u.hp > 0) &&
            u.gridX === picked.x &&
            u.gridZ === picked.z
        );

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

      const picked = this.isometricBoard.pickTile(
        e.clientX,
        e.clientY,
        this.tacticalCamera,
        this.canvas
      );

      if (!picked) return;

      if (this.currentMode === 'move') {
        this.executeMove(picked);
      } else if (this.currentMode === 'act') {
        const unitAtTile = this.units.find(
          (u) =>
            u.alive !== false &&
            (u.hp === undefined || u.hp > 0) &&
            u.gridX === picked.x &&
            u.gridZ === picked.z
        );

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
  document.addEventListener('DOMContentLoaded', () => new TacticsGame());
} else {
  new TacticsGame();
}
