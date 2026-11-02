import * as THREE from 'three';

// Jimmy Lee's exact tactical RPG camera geometry from 3d.internet.dev/references/threejs.md:
// elevation = Math.atan2(0.3, Math.SQRT1_2) (~23 degrees above ground).
// azimuth = Math.atan2(0.5, -0.5) + (step * Math.PI) / 4 (8 steps of 45 degrees around the stage).
export const DEFAULT_ELEVATION = Math.atan2(0.3, Math.SQRT1_2);
export const DEFAULT_AZIMUTH = Math.atan2(0.5, -0.5);
export const STEP_ANGLE = Math.PI / 4;
export const CAMERA_DISTANCE = 400;

// Compass viewing direction for steps 0..7 (looking towards):
// Step 0: camera at (+X, -Z) looking toward SW.
export const COMPASS_LABELS = ['SW', 'S', 'SE', 'E', 'NE', 'N', 'NW', 'W'];

export class TacticalCamera {
  /**
   * @param {HTMLCanvasElement|null} canvas
   */
  constructor(canvas = null) {
    this.canvas = canvas;
    this.elevation = DEFAULT_ELEVATION;
    this.distance = CAMERA_DISTANCE;

    this.step = 0;
    this.currentAzimuth = DEFAULT_AZIMUTH;
    this.targetAzimuth = DEFAULT_AZIMUTH;

    this.currentFocus = new THREE.Vector3(0, 14, 0);
    this.targetFocus = new THREE.Vector3(0, 14, 0);

    // Default 140 world height half-extent, zoomable between 70 and 240
    this.currentZoom = 140;
    this.targetZoom = 140;
    this.minZoom = 70;
    this.maxZoom = 240;

    const width = canvas?.clientWidth || 800;
    const height = canvas?.clientHeight || 600;
    this.aspect = width / Math.max(height, 1);

    this.camera = new THREE.OrthographicCamera(
      -this.currentZoom * this.aspect,
      this.currentZoom * this.aspect,
      this.currentZoom,
      -this.currentZoom,
      1,
      2500
    );

    this._updateProjection();
    this._updateCamera();

    // Optional mouse wheel zooming when canvas is provided
    if (canvas && typeof canvas.addEventListener === 'function') {
      this._wheelHandler = (e) => {
        e.preventDefault();
        this.zoom(e.deltaY * 0.1);
      };
      canvas.addEventListener('wheel', this._wheelHandler, { passive: false });
    }
  }

  get compass() {
    return COMPASS_LABELS[this.step];
  }

  /**
   * Update aspect ratio and frustum bounds on canvas resize.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (!width || !height) return;
    this.aspect = width / Math.max(height, 1);
    this._updateProjection();
  }

  /**
   * Rotate camera by delta steps around stage (+1 clockwise / E, -1 counterclockwise / Q).
   * Smoothly animates targetAzimuth without 360-degree wrapping spin.
   * @param {number} delta
   * @returns {{ step: number, compass: string, label: string }}
   */
  rotateStep(delta) {
    this.step = ((this.step + delta) % 8 + 8) % 8;
    this.targetAzimuth += delta * STEP_ANGLE;
    const compass = this.compass;
    return {
      step: this.step,
      compass,
      label: compass,
      toString() {
        return compass;
      },
      valueOf() {
        return this.step;
      }
    };
  }

  /**
   * Set target focus position in world space.
   * @param {number|{x: number, y: number, z: number}} x
   * @param {number|boolean} [y]
   * @param {number} [z]
   * @param {boolean} [instant=false]
   */
  setFocus(x, y, z, instant = false) {
    if (typeof x === 'object' && x !== null) {
      instant = Boolean(y);
      this.targetFocus.set(x.x, x.y, x.z);
    } else {
      this.targetFocus.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }

    if (instant) {
      this.currentFocus.copy(this.targetFocus);
      this._updateCamera();
    }
  }

  /**
   * Adjust camera zoom half-extent by delta, clamped between minZoom and maxZoom.
   * @param {number} delta
   */
  zoom(delta) {
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom + delta));
  }

  /**
   * Update camera interpolation and matrix.
   * @param {number} [dt=1/60]
   */
  update(dt = 1 / 60) {
    const safeDt = Math.min(Math.max(dt, 0.0001), 0.1);
    const t = 1 - Math.exp(-safeDt * 12);

    // Smooth focus pan
    this.currentFocus.lerp(this.targetFocus, t);

    // Smooth azimuth rotation
    const azDiff = this.targetAzimuth - this.currentAzimuth;
    if (Math.abs(azDiff) > 0.0001) {
      this.currentAzimuth += azDiff * t;
    } else {
      this.currentAzimuth = this.targetAzimuth;
    }

    // Smooth zoom
    const zoomDiff = this.targetZoom - this.currentZoom;
    if (Math.abs(zoomDiff) > 0.001) {
      this.currentZoom += zoomDiff * t;
      this._updateProjection();
    } else if (this.currentZoom !== this.targetZoom) {
      this.currentZoom = this.targetZoom;
      this._updateProjection();
    }

    this._updateCamera();
  }

  _updateProjection() {
    const halfH = this.currentZoom;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.left = -halfH * this.aspect;
    this.camera.right = halfH * this.aspect;
    this.camera.updateProjectionMatrix();
  }

  _updateCamera() {
    const flat = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      this.currentFocus.x + Math.sin(this.currentAzimuth) * flat,
      this.currentFocus.y + Math.sin(this.elevation) * this.distance,
      this.currentFocus.z + Math.cos(this.currentAzimuth) * flat
    );
    this.camera.lookAt(this.currentFocus);
    this.camera.updateMatrixWorld(true);

    this.camera.userData.azimuthStep = this.step;
    this.camera.userData.currentAzimuth = this.currentAzimuth;
    this.camera.userData.isTacticalCamera = true;
  }

  dispose() {
    if (this.canvas && this._wheelHandler) {
      this.canvas.removeEventListener('wheel', this._wheelHandler);
      this._wheelHandler = null;
    }
  }
}
