//NOTE(@jimmylee)
//Real-time Free-Roam Action Controller for Tactical RPG Stage.
//Ports Jimmy Lee's A1 character state machine and real-time physics:
//- States: GROUNDED, JUMPING, FALLING, ACTION.
//- 8-way camera-relative movement (WASD / ArrowKeys).
//- Jump physics with playerFallExtraAccel downward gravity stack.
//- Continuous 10x10 terrain collision, elevation ledge climb/landing, and water wading splashes.
//- KeyF / quickThrow(): launches physical 3D triplanar black marble sphere with gravity arc,
//  bouncing or splashing into the river.
//- KeyE (Slash / Player Stab) and KeyQ (Cast / Spin Dance).
//- Clean enable/disable lifecycle with graceful snap to nearest passable grid tile.

import * as THREE from 'three';
import { defaultGravity, playerFallExtraAccel } from '../three-isometric-engine/constants/physics.js';
import { createBlackMarbleMaterial } from '../three-isometric-engine/debug/marble-material.js';

export const FreeRoamState = {
  GROUNDED: 'GROUNDED',
  JUMPING: 'JUMPING',
  FALLING: 'FALLING',
  ACTION: 'ACTION'
};

const BOARD_SIZE = 10;
const TILE_SIZE = 24;
const ELEVATION_STEP = 7;
const HALF_BOARD = (BOARD_SIZE * TILE_SIZE) / 2; // 120

export class FreeRoamController {
  constructor() {
    this.state = FreeRoamState.GROUNDED;
    this.actor = null;
    this.board = null;
    this.scene = null;

    this.enabled = false;
    this.keys = new Set();

    // Physics parameters
    this.moveSpeed = 68.0; // units per second
    this.jumpLaunchV = 160.0;
    this.gravity = Math.abs(defaultGravity) + playerFallExtraAccel; // 550 u/s²
    this.velocityY = 0.0;

    // Movement state
    this.position = new THREE.Vector3();
    this.facing = 'SE';
    this.isMoving = false;

    // Water wading ripple throttle
    this.wadeRippleTimer = 0.0;

    // Action timer
    this.actionEndTime = 0;

    // Active thrown projectiles (black marbles)
    this.projectiles = [];

    // Bound event handlers
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
  }

  /**
   * Activates real-time free roam physics control on the specified unit actor.
   * @param {Object} unitActor
   * @param {IsometricBoard} board
   * @param {THREE.Scene} stageScene
   */
  enable(unitActor, board, stageScene) {
    if (!unitActor || !board) return;
    this.disable();

    this.actor = unitActor;
    this.board = board;
    this.scene = stageScene || (unitActor.sprite?.group?.parent) || null;

    const root = this._getActorRoot();
    if (root) {
      this.position.copy(root.position);
    } else if (unitActor.unit) {
      const wp = board.tileToWorld(unitActor.unit.x, unitActor.unit.z, unitActor.unit.elevation);
      this.position.set(wp.x, wp.y + (unitActor.sprite?.standHeight || 0), wp.z);
    }

    this.velocityY = 0.0;
    this.state = FreeRoamState.GROUNDED;
    this.enabled = true;
    this.keys.clear();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }

    this._playAnim('Idle');
  }

  /**
   * Deactivates free roam control and snaps unit cleanly to nearest valid passable tile.
   */
  disable() {
    if (!this.enabled && !this.actor) return;

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
    }
    this.keys.clear();

    // Clean up active thrown projectiles
    for (const proj of this.projectiles) {
      if (proj.mesh && this.scene) {
        this.scene.remove(proj.mesh);
        proj.mesh.geometry?.dispose();
        proj.mesh.material?.dispose();
      }
    }
    this.projectiles = [];

    // Snap unit cleanly to nearest valid passable diorama grid tile
    if (this.actor && this.board) {
      const snapTile = this._findNearestPassableTile(this.position.x, this.position.z);
      if (snapTile) {
        this.actor.unit.x = snapTile.x;
        this.actor.unit.z = snapTile.z;
        this.actor.unit.gridX = snapTile.x;
        this.actor.unit.gridZ = snapTile.z;
        this.actor.unit.elevation = snapTile.elevation;

        const isWater = (snapTile.terrain === 'water' || snapTile.isWater) && this.actor.unit.status !== 'floating';
        const waterOffset = isWater ? -3.5 : 0;
        const standH = this.actor.sprite?.standHeight || 0;

        const root = this._getActorRoot();
        if (root) {
          root.position.set(snapTile.worldX, snapTile.worldY + standH + waterOffset, snapTile.worldZ);
        }
        if (this.actor.ring) {
          this.actor.ring.position.set(snapTile.worldX, snapTile.worldY + 0.12, snapTile.worldZ);
        }
        if (this.actor.hitboxMesh) {
          this.actor.hitboxMesh.position.set(snapTile.worldX, snapTile.worldY + 13, snapTile.worldZ);
        }

        this.actor.inWater = isWater;
        if (this.actor.sprite?.player) {
          this.actor.sprite.player.water = isWater;
        }
      }

      this._playAnim('Idle');
    }

    this.actor = null;
    this.board = null;
    this.scene = null;
    this.enabled = false;
    this.state = FreeRoamState.GROUNDED;
  }

  _getActorRoot() {
    return this.actor?.root || this.actor?.sprite?.group || null;
  }

  _playAnim(animName, loop = true) {
    if (!this.actor?.sprite?.play) return;
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    try {
      this.actor.sprite.play(animName, now, { loop });
    } catch {
      try {
        this.actor.sprite.play('Idle', now, { loop: true });
      } catch {}
    }
  }

  _isInputBlocked(e) {
    if (e?.target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) {
      return true;
    }
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
        return true;
      }
      const studioModal = document.querySelector('.studio-modal');
      const forgeModal = document.querySelector('.forge-modal');
      if (studioModal && getComputedStyle(studioModal).display !== 'none') return true;
      if (forgeModal && getComputedStyle(forgeModal).display !== 'none') return true;
    }
    return false;
  }

  _handleKeyDown(e) {
    if (!this.enabled || !this.actor) return;
    if (this._isInputBlocked(e)) return;
    const code = e.code || e.key;

    // Prevent scrolling for navigation keys
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }

    this.keys.add(code);

    // Jump
    if (code === 'Space' && this.state === FreeRoamState.GROUNDED) {
      this.jump();
      return;
    }

    // Quick Throw black marble (KeyF)
    if (code === 'KeyF' || code === 'Keyf' || e.key === 'f' || e.key === 'F') {
      this.quickThrow();
      return;
    }

    // Slash / Player Stab (KeyE)
    if (code === 'KeyE' || code === 'Keye' || e.key === 'e' || e.key === 'E') {
      this.slash();
      return;
    }

    // Cast / Spin Dance (KeyQ)
    if (code === 'KeyQ' || code === 'Keyq' || e.key === 'q' || e.key === 'Q') {
      this.cast();
      return;
    }
  }

  _handleKeyUp(e) {
    if (!this.enabled) return;
    if (this._isInputBlocked(e)) return;
    const code = e.code || e.key;
    this.keys.delete(code);
  }

  jump() {
    if (this.state !== FreeRoamState.GROUNDED && this.state !== FreeRoamState.ACTION) return;
    this.state = FreeRoamState.JUMPING;
    this.velocityY = this.jumpLaunchV;
    this._playAnim('High Jump Start', false);
  }

  /**
   * Quick Throw action: plays 'Quick Throw' / 'Throw Stone' and launches
   * a physical 3D triplanar black marble sphere along unit's facing direction.
   */
  quickThrow() {
    if (this.state === FreeRoamState.ACTION) return;
    this.state = FreeRoamState.ACTION;
    this.actionEndTime = (typeof performance !== 'undefined' ? performance.now() / 1000 : 0) + 0.42;

    this._playAnim('Quick Throw', false);

    // Spawn and launch 3D black marble after windup
    setTimeout(() => {
      if (!this.enabled || !this.actor) return;
      this._launchBlackMarble();
    }, 140);
  }

  slash() {
    if (this.state === FreeRoamState.ACTION) return;
    this.state = FreeRoamState.ACTION;
    this.actionEndTime = (typeof performance !== 'undefined' ? performance.now() / 1000 : 0) + 0.35;
    this._playAnim('Player Stab', false);
  }

  cast() {
    if (this.state === FreeRoamState.ACTION) return;
    this.state = FreeRoamState.ACTION;
    this.actionEndTime = (typeof performance !== 'undefined' ? performance.now() / 1000 : 0) + 0.40;
    this._playAnim('Spin Dance', false);
  }

  _launchBlackMarble() {
    const root = this._getActorRoot();
    if (!root) return;

    const facing = this.actor.sprite?.player?.facing ?? this.facing;
    const facingIndex = typeof facing === 'number' ? facing : 1;
    const fAngle = (facingIndex * Math.PI) / 4;
    // Jimmy Lee coordinate system: SE (1) -> dx > 0, dz = 0
    // Facing vectors:
    const facingVectors = [
      { x: 1, z: -1 }, // E
      { x: 1, z: 0 },  // SE
      { x: 1, z: 1 },  // S
      { x: 0, z: 1 },  // SW
      { x: -1, z: 1 }, // W
      { x: -1, z: 0 }, // NW
      { x: -1, z: -1 },// N
      { x: 0, z: -1 }  // NE
    ];
    const fVec = facingVectors[facingIndex] || { x: 1, z: 0 };
    const mag = Math.hypot(fVec.x, fVec.z) || 1;
    const dirX = fVec.x / mag;
    const dirZ = fVec.z / mag;

    // Create physical 3D black marble mesh
    const geo = new THREE.SphereGeometry(2.0, 16, 16);
    let mat = null;
    if (this.actor.manager?.marbleTexture) {
      mat = createBlackMarbleMaterial(this.actor.manager.marbleTexture);
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x111116,
        roughness: 0.25,
        metalness: 0.85
      });
    }

    const marble = new THREE.Mesh(geo, mat);
    marble.position.set(root.position.x + dirX * 6, root.position.y + 10, root.position.z + dirZ * 6);
    marble.castShadow = true;

    const parent = this.scene || root.parent;
    if (parent) {
      parent.add(marble);
    }

    const proj = {
      mesh: marble,
      posX: marble.position.x,
      posY: marble.position.y,
      posZ: marble.position.z,
      velX: dirX * 135.0,
      velY: 65.0,
      velZ: dirZ * 135.0,
      bounces: 0,
      alive: true,
      age: 0
    };
    this.projectiles.push(proj);
  }

  /**
   * Step physics, keyboard input, continuous terrain collision, water ripples, and projectiles.
   * @param {number} dt
   * @param {number} [cameraAzimuth=0.785398]
   */
  update(dt, cameraAzimuth = Math.PI / 4) {
    if (!this.enabled || !this.actor || !this.board) return;
    const root = this._getActorRoot();
    if (!root) return;

    const delta = Math.min(Math.max(dt || 0.016, 0.001), 0.1);
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;

    // 1. Check Action State Expiration
    if (this.state === FreeRoamState.ACTION) {
      if (now >= this.actionEndTime) {
        this.state = FreeRoamState.GROUNDED;
        this._playAnim('Idle');
      }
    }

    // 2. Process 8-way Movement Input relative to camera azimuth
    let inX = 0;
    let inZ = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inX += 1;

    const moving = (inX !== 0 || inZ !== 0) && this.state !== FreeRoamState.ACTION;

    if (moving) {
      // Rotate screen-space input by camera azimuth angle (default PI/4 = 45 deg)
      const cosA = Math.cos(cameraAzimuth);
      const sinA = Math.sin(cameraAzimuth);
      const worldDirX = inX * cosA + inZ * sinA;
      const worldDirZ = -inX * sinA + inZ * cosA;

      const len = Math.hypot(worldDirX, worldDirZ) || 1;
      const normX = worldDirX / len;
      const normZ = worldDirZ / len;

      // Update 8-way facing direction
      const facingName = this._vectorToFacing(normX, normZ);
      if (facingName !== this.facing) {
        this.facing = facingName;
        if (this.actor.sprite?.setFacing) {
          this.actor.sprite.setFacing(facingName);
        }
      }

      // Propose new horizontal position
      const newX = this.position.x + normX * this.moveSpeed * delta;
      const newZ = this.position.z + normZ * this.moveSpeed * delta;

      // Clamp to board diorama boundaries [-114, 114]
      const clampedX = Math.max(-HALF_BOARD + 6, Math.min(HALF_BOARD - 6, newX));
      const clampedZ = Math.max(-HALF_BOARD + 6, Math.min(HALF_BOARD - 6, newZ));

      // Ledge climbing & collision test against diorama elevation
      const targetGridX = Math.floor((clampedX + HALF_BOARD) / TILE_SIZE);
      const targetGridZ = Math.floor((clampedZ + HALF_BOARD) / TILE_SIZE);
      const targetTile = this.board.getTile(targetGridX, targetGridZ);
      const targetSurfaceY = targetTile ? targetTile.elevation * ELEVATION_STEP : 0;

      // Check elevation difference:
      // When airborne, allow landing on ledges if y >= targetSurfaceY - 4.
      // When grounded, allow stepping up if elevation difference <= 1 step.
      const currentSurfaceY = this._getSurfaceGroundY(this.position.x, this.position.z);
      const canTraverse = (this.state === FreeRoamState.JUMPING || this.state === FreeRoamState.FALLING)
        ? (this.position.y >= targetSurfaceY - 4)
        : (targetSurfaceY - currentSurfaceY <= ELEVATION_STEP + 1);

      if (canTraverse && targetTile?.passable !== false) {
        this.position.x = clampedX;
        this.position.z = clampedZ;
      }

      if (!this.isMoving && this.state === FreeRoamState.GROUNDED) {
        this._playAnim('Walk');
      }
      this.isMoving = true;
    } else {
      if (this.isMoving && this.state === FreeRoamState.GROUNDED) {
        this._playAnim('Idle');
      }
      this.isMoving = false;
    }

    // 3. Vertical Physics & Jump / Fall Arc
    const surfaceGroundY = this._getSurfaceGroundY(this.position.x, this.position.z);
    const standH = this.actor.sprite?.standHeight || 0;

    if (this.state === FreeRoamState.JUMPING || this.state === FreeRoamState.FALLING) {
      this.velocityY -= this.gravity * delta;
      this.position.y += this.velocityY * delta;

      if (this.velocityY < 0 && this.state === FreeRoamState.JUMPING) {
        this.state = FreeRoamState.FALLING;
        this._playAnim('High Jump Hold', false);
      }

      // Landing test
      if (this.position.y <= surfaceGroundY + standH) {
        this.position.y = surfaceGroundY + standH;
        this.velocityY = 0;
        this.state = FreeRoamState.GROUNDED;

        // Splash ripple on landing in water
        const isWater = this._isWaterAt(this.position.x, this.position.z);
        if (isWater) {
          this.board.triggerWaterRipple(this.position.x, this.position.z, 1.2);
        }

        this._playAnim(this.isMoving ? 'Walk' : 'Idle');
      }
    } else if (this.state === FreeRoamState.GROUNDED) {
      // Snap vertical position to terrain surface (including water wading dip of -3.5)
      this.position.y = surfaceGroundY + standH;

      // Continuous water ripple splashes while wading through water
      const isWater = this._isWaterAt(this.position.x, this.position.z);
      this.actor.inWater = isWater;
      if (this.actor.sprite?.player) {
        this.actor.sprite.player.water = isWater;
      }

      if (isWater && this.isMoving) {
        this.wadeRippleTimer += delta;
        if (this.wadeRippleTimer >= 0.12) {
          this.wadeRippleTimer = 0.0;
          this.board.triggerWaterRipple(this.position.x, this.position.z, 0.015, 0.035);
        }
      }
    }

    // 4. Update Actor Transforms & Synced Overlays
    root.position.copy(this.position);
    this.actor.groundY = surfaceGroundY;

    if (this.actor.ring) {
      this.actor.ring.position.set(this.position.x, surfaceGroundY + 0.12, this.position.z);
    }
    if (this.actor.hitboxMesh) {
      this.actor.hitboxMesh.position.set(this.position.x, surfaceGroundY + 13, this.position.z);
    }

    // Update logical grid tile coordinates
    const curGx = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((this.position.x + HALF_BOARD) / TILE_SIZE)));
    const curGz = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((this.position.z + HALF_BOARD) / TILE_SIZE)));
    this.actor.unit.x = curGx;
    this.actor.unit.z = curGz;
    this.actor.unit.gridX = curGx;
    this.actor.unit.gridZ = curGz;

    // 5. Update Thrown Black Marble Projectiles
    this._updateProjectiles(delta);
  }

  _updateProjectiles(delta) {
    if (!this.projectiles.length) return;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += delta;

      // Prevent memory leak for out-of-bounds or long-lived projectiles
      if (p.age > 4.0 || p.posY < -100) {
        this._removeProjectile(i);
        continue;
      }

      // Integrate gravity & velocity
      p.velY -= 320.0 * delta;
      p.posX += p.velX * delta;
      p.posY += p.velY * delta;
      p.posZ += p.velZ * delta;

      p.mesh.position.set(p.posX, p.posY, p.posZ);
      p.mesh.rotation.x += delta * 12.0;
      p.mesh.rotation.y += delta * 8.0;

      const groundY = this._getSurfaceGroundY(p.posX, p.posZ);
      const isWater = this._isWaterAt(p.posX, p.posZ);

      // Hit test
      if (p.posY <= groundY + 2.0) {
        if (isWater) {
          // Splash into the crystal river with large water ripple
          this.board.triggerWaterRipple(p.posX, p.posZ, 1.5);
          this._removeProjectile(i);
          continue;
        } else if (p.bounces < 2 && Math.abs(p.velY) > 20.0) {
          // Bounce off stone/grass terrain
          p.posY = groundY + 2.0;
          p.velY = -p.velY * 0.45;
          p.velX *= 0.65;
          p.velZ *= 0.65;
          p.bounces++;
        } else {
          // Rest on ground and fade out
          p.posY = groundY + 2.0;
          p.velX = 0;
          p.velY = 0;
          p.velZ = 0;
          if (p.age > 1.2) {
            this._removeProjectile(i);
          }
        }
      }
    }
  }

  _removeProjectile(index) {
    const p = this.projectiles[index];
    if (p?.mesh) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    }
    this.projectiles.splice(index, 1);
  }

  _getSurfaceGroundY(worldX, worldZ) {
    const gx = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldX + HALF_BOARD) / TILE_SIZE)));
    const gz = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldZ + HALF_BOARD) / TILE_SIZE)));
    const tile = this.board.getTile(gx, gz);
    if (!tile) return 0;

    let y = tile.elevation * ELEVATION_STEP;
    // Sink -3.5 into river when wading through water tiles
    if ((tile.terrain === 'water' || tile.isWater) && this.actor?.unit?.status !== 'floating') {
      y -= 3.5;
    }
    return y;
  }

  _isWaterAt(worldX, worldZ) {
    const gx = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldX + HALF_BOARD) / TILE_SIZE)));
    const gz = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldZ + HALF_BOARD) / TILE_SIZE)));
    const tile = this.board.getTile(gx, gz);
    return Boolean((tile?.terrain === 'water' || tile?.isWater) && this.actor?.unit?.status !== 'floating');
  }

  _findNearestPassableTile(worldX, worldZ) {
    const cx = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldX + HALF_BOARD) / TILE_SIZE)));
    const cz = Math.max(0, Math.min(BOARD_SIZE - 1, Math.floor((worldZ + HALF_BOARD) / TILE_SIZE)));

    const isTileAvailable = (t) => {
      if (!t || t.passable === false) return false;
      if (this.board && typeof this.board.getUnitAt === 'function') {
        const occ = this.board.getUnitAt(t.x, t.z);
        if (occ && occ !== this.actor?.unit && occ.alive !== false && !occ.isDead) return false;
      }
      return true;
    };

    const initial = this.board.getTile(cx, cz);
    if (isTileAvailable(initial)) return initial;

    // Search outwards in Chebyshev rings
    for (let radius = 1; radius < BOARD_SIZE; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const t = this.board.getTile(cx + dx, cz + dz);
          if (isTileAvailable(t)) return t;
        }
      }
    }
    return initial;
  }

  _vectorToFacing(dx, dz) {
    if (dx === 0 && dz === 0) return 'SE';
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
}
