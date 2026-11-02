import * as THREE from 'three';
import { createAtlas, findAnimation, FACING_X, FACING_Z } from '../tactics-sprite/tactics-sprite.mjs';
import { createTacticsSprite, prepareSheet } from '../tactics-sprite/tactics-sprite-three.mjs';
import { readSetItems } from '../three-isometric-engine/weapons/set-items.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

function toFacingIndex(facing) {
  if (typeof facing === 'number') {
    return ((facing % 8) + 8) % 8;
  }
  if (typeof facing === 'string' && FACING_NAME_TO_INDEX[facing] !== undefined) {
    return FACING_NAME_TO_INDEX[facing];
  }
  return 1; // Default SE
}

export class StageUnitManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.units = new Map(); // id -> { unit, sprite, ring, carriedMesh }
    this.models = {}; // 'rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'
    this.projectiles = [];
    this.hitBursts = [];

    this.atlas = null;
    this.sheet = null;
    this.marbleTexture = null;
    this.mythrilMaterial = null;
    this.marbleMesh = null;
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

    // 3. Load marble texture
    this.marbleTexture = await this._loadTexture('/marble-black.gif');

    // 4. Load baked Set items GLB
    const glbBuffer = await this._loadArrayBuffer('/set-items.glb');
    const rawItems = readSetItems(glbBuffer);

    // Build THREE.BufferGeometry for each of the 7 Set models:
    // 'rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'
    const setNames = ['rifle', 'sword', 'katana', 'spear', 'shield', 'harp', 'tome'];
    for (const name of setNames) {
      const item = rawItems[name];
      if (item) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(item.position, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(item.normal, 3));
        geo.setAttribute('color', new THREE.Uint8BufferAttribute(item.color, 4, true)); // normalized: true
        geo.setIndex(new THREE.Uint16BufferAttribute(item.index, 1));
        this.models[name] = geo;
      }
    }

    // 5. Create reflective Mythril THREE.MeshStandardMaterial using PMREMGenerator and RoomEnvironment
    let envMap = null;
    if (renderer) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        envMap = pmrem.fromScene(room, 0.03).texture;
        room.dispose();
        pmrem.dispose();
      } catch (err) {
        console.warn('[StageUnitManager] PMREMGenerator warning:', err);
      }
    }

    this.mythrilMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.9,
      roughness: 0.18,
      envMap
    });

    // 6. Sphere mesh for thrown stones/marbles
    const marbleGeo = new THREE.SphereGeometry(2.2, 16, 16);
    const marbleMat = new THREE.MeshStandardMaterial({
      map: this.marbleTexture,
      color: 0x1a1a1a,
      roughness: 0.22,
      metalness: 0.75,
      envMap
    });
    this.marbleMesh = new THREE.Mesh(marbleGeo, marbleMat);

    this.loaded = true;
    return this;
  }

  /**
   * Instantiate a 3D weapon mesh from cached models.
   * @param {string} name
   * @returns {THREE.Mesh|null}
   */
  createWeaponMesh(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (lower === 'marble' || lower === 'stone') {
      return this.marbleMesh ? this.marbleMesh.clone() : null;
    }
    const geo = this.models[lower] || this.models.sword;
    if (!geo || !this.mythrilMaterial) return null;
    return new THREE.Mesh(geo, this.mythrilMaterial);
  }

  /**
   * Create ground indicator ring / plinth (Azure blue for blue clan, Crimson gold for red raiders).
   * @param {number} color
   * @returns {THREE.Group}
   */
  createTeamRing(color) {
    const group = new THREE.Group();
    group.name = 'TeamRing';
    group.rotation.x = -Math.PI / 2; // Lie flat in X-Z plane

    // Outer smooth ring
    const outerGeo = new THREE.RingGeometry(7.5, 9.4, 32);
    const outerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);

    // Inner octagon plinth
    const innerGeo = new THREE.RingGeometry(1.2, 6.8, 8);
    const innerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
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

    group.add(outerRing, innerOct, starLines);
    return group;
  }

  /**
   * Spawns sprites and under-foot team rings for units.
   * @param {Array<Object>} units
   * @param {IsometricBoard} board
   */
  spawnUnits(units, board) {
    // Clear existing units
    for (const actor of this.units.values()) {
      if (actor.sprite?.group) this.scene.remove(actor.sprite.group);
      if (actor.ring) this.scene.remove(actor.ring);
      if (actor.carriedMesh) this.scene.remove(actor.carriedMesh);
      if (actor.sprite?.dispose) actor.sprite.dispose();
    }
    this.units.clear();

    if (!units || !units.length) return;

    for (const unit of units) {
      if (unit.x === undefined && unit.gridX !== undefined) unit.x = unit.gridX;
      if (unit.z === undefined && unit.gridZ !== undefined) unit.z = unit.gridZ;
      if (unit.gridX === undefined && unit.x !== undefined) unit.gridX = unit.x;
      if (unit.gridZ === undefined && unit.z !== undefined) unit.gridZ = unit.z;

      const facing = unit.facing || 'SE';
      const animation = unit.animation || 'Idle';

      const sprite = createTacticsSprite(this.atlas, this.sheet, {
        facing,
        animation
      });
      sprite.player.facing = toFacingIndex(facing);

      // Stance position at worldPos.x, worldPos.y + sprite.standHeight, worldPos.z
      const worldPos = board.tileToWorld(unit.x, unit.z, unit.elevation);
      sprite.group.position.set(worldPos.x, worldPos.y + sprite.standHeight, worldPos.z);
      this.scene.add(sprite.group);

      // Under-foot team indicator ring
      const isBlue = unit.clan === 'blue' || unit.team === 'blue';
      const ringColor = isBlue ? 0x38bdf8 : 0xf43f5e;
      const ring = this.createTeamRing(ringColor);
      ring.position.set(worldPos.x, worldPos.y + 0.08, worldPos.z);
      this.scene.add(ring);

      // Helper to set facing easily
      sprite.setFacing = (f) => {
        sprite.player.facing = toFacingIndex(f);
        unit.facing = typeof f === 'number' ? FACING_INDEX_TO_NAME[f] : f;
      };

      const actor = {
        unit,
        sprite,
        ring,
        carriedMesh: null
      };

      const id = unit.id !== undefined ? unit.id : `unit_${this.units.size}`;
      this.units.set(id, actor);
    }
  }

  /**
   * Smoothly moves unit step-by-step along path.
   * Plays 'Jump Up' with parabolic arc, 'Jump Down', or 'Walk Fast'.
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
    const nextFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);

    for (let i = 0; i < path.length - 1; i++) {
      const prev = path[i];
      const next = path[i + 1];

      // Update facing toward next step
      const facing = board.getFacingBetween(prev.x, prev.z, next.x, next.z);
      actor.sprite.setFacing(facing);

      const prevElev = prev.elevation !== undefined ? prev.elevation : (board.getTile(prev.x, prev.z)?.elevation ?? 0);
      const nextElev = next.elevation !== undefined ? next.elevation : (board.getTile(next.x, next.z)?.elevation ?? 0);
      const dElev = nextElev - prevElev;

      let animName = 'Walk Fast';
      if (dElev > 0) animName = 'Jump Up';
      else if (dElev < 0) animName = 'Jump Down';

      actor.sprite.play(animName, getNow());

      const startWorld = board.tileToWorld(prev.x, prev.z, prevElev);
      const targetWorld = board.tileToWorld(next.x, next.z, nextElev);
      const stepDuration = dElev !== 0 ? 0.38 : 0.28;

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

          actor.sprite.group.position.set(curX, curY + actor.sprite.standHeight, curZ);
          actor.ring.position.set(curX, curY + 0.08, curZ);

          if (s < 1) {
            nextFrame(tick);
          } else {
            actor.sprite.group.position.set(targetWorld.x, targetWorld.y + actor.sprite.standHeight, targetWorld.z);
            actor.ring.position.set(targetWorld.x, targetWorld.y + 0.08, targetWorld.z);
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
   * reaction animation, and shield block attachment.
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
    const nextFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);

    // 1. Turn attacker toward defender
    const facing = board.getFacingBetween(attackerActor.unit.x, attackerActor.unit.z, defenderActor.unit.x, defenderActor.unit.z);
    attackerActor.sprite.setFacing(facing);

    // Turn defender toward attacker
    const defFacing = board.getFacingBetween(defenderActor.unit.x, defenderActor.unit.z, attackerActor.unit.x, attackerActor.unit.z);
    defenderActor.sprite.setFacing(defFacing);

    // 2. Attach 3D Set weapon mesh corresponding to forecast.animationName
    const animName = forecast?.animationName || 'Swing High';
    const holdData = this.atlas?.data?.holds?.[animName];
    const holdItemName = holdData?.item || attackerActor.unit.heldModelName || 'sword';
    const weaponMesh = this.createWeaponMesh(holdItemName);

    if (weaponMesh) {
      this.scene.add(weaponMesh);
      attackerActor.carriedMesh = weaponMesh;
      if (holdData) {
        try {
          attackerActor.sprite.carry(weaponMesh, animName);
        } catch (e) {
          console.warn('[StageUnitManager] carry weapon warning:', e);
        }
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
      // Small windup before firing
      await this._sleep(150);

      // Spawn flying projectile
      await new Promise((resolve) => {
        let projMesh;
        if (animName.startsWith('Gun')) {
          // Tracer streak
          const geo = new THREE.CylinderGeometry(0.3, 0.3, 12, 6);
          geo.rotateZ(Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
          projMesh = new THREE.Mesh(geo, mat);
        } else if (animName.startsWith('Bow')) {
          // Arrow
          const geo = new THREE.CylinderGeometry(0.25, 0.25, 8, 6);
          geo.rotateZ(Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
          projMesh = new THREE.Mesh(geo, mat);
        } else if (animName.includes('Casting')) {
          // Spell orb
          const geo = new THREE.SphereGeometry(2.5, 12, 12);
          const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
          projMesh = new THREE.Mesh(geo, mat);
        } else {
          // Marble / stone
          projMesh = this.createWeaponMesh('marble') || new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x333333 }));
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
            py += Math.sin(s * Math.PI) * 8; // Projectile arc
          }

          projMesh.position.set(px, py, pz);
          projMesh.lookAt(defenderPos.x, py, defenderPos.z);

          if (s < 1) {
            nextFrame(animProj);
          } else {
            this.scene.remove(projMesh);
            resolve();
          }
        };
        nextFrame(animProj);
      });
    } else {
      // Melee swing: hit moment is ~300ms into the swing
      await this._sleep(300);
    }

    // 5. Impact Moment: Spawn expanding 3D hit burst & elemental ring
    this._spawnHitBurst(defenderPos, outcome);

    // Reaction animation
    const reactionAnim = outcome?.reactionAnimation || 'Taking Damage';
    defenderActor.sprite.play(reactionAnim, getNow());

    // If blocked with a shield, attach 3D shield mesh to defenderSprite!
    let shieldMesh = null;
    if (reactionAnim.includes('Shield Block')) {
      shieldMesh = this.createWeaponMesh('shield');
      if (shieldMesh) {
        this.scene.add(shieldMesh);
        defenderActor.carriedMesh = shieldMesh;
        try {
          defenderActor.sprite.carry(shieldMesh, reactionAnim);
        } catch (e) {
          console.warn('[StageUnitManager] carry shield warning:', e);
        }
      }
    }

    // 6. Wait for animation sequence to complete (~500ms)
    await this._sleep(500);

    // Release and cleanup carried weapon from attacker
    attackerActor.sprite.release();
    if (attackerActor.carriedMesh) {
      this.scene.remove(attackerActor.carriedMesh);
      attackerActor.carriedMesh = null;
    }

    // Reset living attacker to Idle or Critical
    const attHp = attackerActor.unit.hp ?? attackerActor.unit.currentHp ?? 100;
    const attMax = attackerActor.unit.maxHp ?? 100;
    const isAttLow = attMax > 0 && attHp / attMax < 0.25;
    attackerActor.sprite.play(isAttLow ? 'Critical' : 'Idle', getNow());

    // Clean up defender shield if attached
    if (defenderActor.carriedMesh) {
      defenderActor.sprite.release();
      this.scene.remove(defenderActor.carriedMesh);
      defenderActor.carriedMesh = null;
    }

    // Reset living defender, or leave dead units in 'Dead' / 'Bounced to Death'
    const isDead =
      reactionAnim === 'Bounced to Death' ||
      reactionAnim === 'Dead' ||
      defenderActor.unit.isDead ||
      (defenderActor.unit.hp !== undefined && defenderActor.unit.hp <= 0);

    if (!isDead) {
      const defHp = defenderActor.unit.hp ?? defenderActor.unit.currentHp ?? 100;
      const defMax = defenderActor.unit.maxHp ?? 100;
      const isDefLow = defMax > 0 && defHp / defMax < 0.25;
      defenderActor.sprite.play(isDefLow ? 'Critical' : 'Idle', getNow());
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
      startTime: performance.now() / 1000,
      duration: 0.35
    });
  }

  /**
   * Per-frame update for all unit sprites, active projectiles, hit bursts, and team rings.
   * @param {number} nowSec
   * @param {number} dt
   * @param {THREE.Camera|TacticalCamera} camera
   */
  update(nowSec, dt, camera) {
    const cam = camera.camera || camera;

    // 1. Update unit sprites and team rings
    for (const actor of this.units.values()) {
      if (actor.sprite) {
        actor.sprite.update(nowSec, cam);
      }
      if (actor.ring && actor.sprite?.group) {
        // Follow feet and rotate subtly
        actor.ring.position.set(
          actor.sprite.group.position.x,
          actor.sprite.group.position.y - actor.sprite.standHeight + 0.08,
          actor.sprite.group.position.z
        );
        actor.ring.rotation.z += dt * 1.5;
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
        this.hitBursts.splice(i, 1);
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
      // Stance point is 18 above soles; top of head is 18 above stance (total 36 above soles)
      return new THREE.Vector3(pos.x, pos.y + 18, pos.z);
    }
    if (board && typeof unitId === 'object' && unitId !== null) {
      const worldPos = board.tileToWorld(unitId.x, unitId.z, unitId.elevation);
      return new THREE.Vector3(worldPos.x, worldPos.y + 36, worldPos.z);
    }
    return new THREE.Vector3(0, 36, 0);
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
    // Node.js fallback
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
    // Node.js fallback
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
    // Node.js mock DataTexture for testing
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    for (const actor of this.units.values()) {
      if (actor.sprite?.group) this.scene.remove(actor.sprite.group);
      if (actor.ring) this.scene.remove(actor.ring);
      if (actor.carriedMesh) this.scene.remove(actor.carriedMesh);
      if (actor.sprite?.dispose) actor.sprite.dispose();
    }
    this.units.clear();
  }
}
