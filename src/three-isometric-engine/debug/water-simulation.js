//NOTE(@jimmylee)
//The water of the ThreeJS demos, without three.js: a port of the ocean under the offshore platform in
//www-prototypes (world-meshes/ocean-fft.ts and ocean-ripples.ts), at the scale of a demo scene. Two
//simulations, as there:
//
//The swell is a Tessendorf ocean: a Phillips spectrum evolved by the deep-water dispersion and read with
//three inverse FFTs into height, choppy displacement and slope. Its size is a power of two. It is pure
//in `time`, so one swell serves every scene and a replay at the same time is the same water.
//
//The ripples are a damped wave equation on an open grid, one per scene: what a body in the water does to
//the surface around it, and nothing else. They step at a fixed rate from the bodies of the drawn frame.
//
//Neither allocates after it is created.

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fft1d(real, imag, count) {
  for (let i = 1, j = 0; i < count; i++) {
    let bit = count >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const swapReal = real[i];
      real[i] = real[j];
      real[j] = swapReal;
      const swapImag = imag[i];
      imag[i] = imag[j];
      imag[j] = swapImag;
    }
  }
  for (let length = 2; length <= count; length <<= 1) {
    const angle = (2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    const half = length >> 1;
    for (let start = 0; start < count; start += length) {
      let twiddleReal = 1;
      let twiddleImag = 0;
      for (let pair = 0; pair < half; pair++) {
        const top = start + pair;
        const bottom = top + half;
        const productReal = real[bottom] * twiddleReal - imag[bottom] * twiddleImag;
        const productImag = real[bottom] * twiddleImag + imag[bottom] * twiddleReal;
        real[bottom] = real[top] - productReal;
        imag[bottom] = imag[top] - productImag;
        real[top] += productReal;
        imag[top] += productImag;
        const nextTwiddleReal = twiddleReal * stepReal - twiddleImag * stepImag;
        twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}

//NOTE(@jimmylee)
//`heightDisplacement` is RGBA per cell: height, x displacement, z displacement, foam (where the
//displacement's Jacobian folds). `slope` is RGBA with x and z slope in R and G. Height is normalized at
//the first update so its RMS is `targetHeight`, so the spectrum's absolute scale does not matter: set
//wave size with `targetHeight`, wavelengths with `windSpeed` (the dominant wave is V² / g) and
//`smallWave`, and foam with `foamThreshold` and `foamStrength`. The spectrum uses the natural FFT
//layout, DC at index 0, so no checkerboard sign correction applies.
export function createWaterSwell({ size, domain, windX, windZ, windSpeed, gravity, smallWave, choppiness, targetHeight, repeatPeriod, foamThreshold, foamStrength, seed }) {
  const cells = size * size;
  const random = mulberry32(seed);
  const windLength = Math.hypot(windX, windZ) || 1;
  const largestWave = (windSpeed * windSpeed) / gravity;
  const repeatOmega = (2 * Math.PI) / repeatPeriod;
  const toWave = (index) => ((index < size / 2 ? index : index - size) * 2 * Math.PI) / domain;

  const waveX = new Float32Array(cells);
  const waveZ = new Float32Array(cells);
  const waveInverse = new Float32Array(cells);
  const omega = new Float32Array(cells);
  const startReal = new Float32Array(cells);
  const startImag = new Float32Array(cells);
  const mirrorReal = new Float32Array(cells);
  const mirrorImag = new Float32Array(cells);
  const spectrumReal = new Float32Array(cells);
  const spectrumImag = new Float32Array(cells);
  const fieldReal = new Float32Array(cells);
  const fieldImag = new Float32Array(cells);
  const rowReal = new Float32Array(size);
  const rowImag = new Float32Array(size);
  const height = new Float32Array(cells);
  const displaceX = new Float32Array(cells);
  const displaceZ = new Float32Array(cells);
  const slopeX = new Float32Array(cells);
  const slopeZ = new Float32Array(cells);
  const heightDisplacement = new Float32Array(cells * 4);
  const slope = new Float32Array(cells * 4);
  let outputScale = 0;

  function phillips(kx, kz) {
    const squared = kx * kx + kz * kz;
    if (squared < 1e-12) return 0;
    const facing = (kx * windX + kz * windZ) / (Math.sqrt(squared) * windLength);
    const spectrum = (Math.exp(-1 / (squared * largestWave * largestWave)) / (squared * squared)) * facing * facing * Math.exp(-squared * smallWave * smallWave);
    return facing < 0 ? spectrum * 0.07 : spectrum;
  }

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const cell = row * size + column;
      const kx = toWave(column);
      const kz = toWave(row);
      const magnitude = Math.hypot(kx, kz);
      waveX[cell] = kx;
      waveZ[cell] = kz;
      waveInverse[cell] = magnitude > 1e-6 ? 1 / magnitude : 0;
      omega[cell] = Math.floor(Math.sqrt(gravity * magnitude) / repeatOmega) * repeatOmega;
      const radius = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-7)));
      const angle = 2 * Math.PI * random();
      const amplitude = Math.sqrt(phillips(kx, kz) * 0.5);
      startReal[cell] = radius * Math.cos(angle) * amplitude;
      startImag[cell] = radius * Math.sin(angle) * amplitude;
    }
  }
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const mirror = ((size - row) % size) * size + (size - column) % size;
      mirrorReal[row * size + column] = startReal[mirror];
      mirrorImag[row * size + column] = -startImag[mirror];
    }
  }

  function inverse2d() {
    for (let row = 0; row < size; row++) {
      const base = row * size;
      for (let column = 0; column < size; column++) {
        rowReal[column] = fieldReal[base + column];
        rowImag[column] = fieldImag[base + column];
      }
      fft1d(rowReal, rowImag, size);
      for (let column = 0; column < size; column++) {
        fieldReal[base + column] = rowReal[column];
        fieldImag[base + column] = rowImag[column];
      }
    }
    for (let column = 0; column < size; column++) {
      for (let row = 0; row < size; row++) {
        rowReal[row] = fieldReal[row * size + column];
        rowImag[row] = fieldImag[row * size + column];
      }
      fft1d(rowReal, rowImag, size);
      for (let row = 0; row < size; row++) {
        fieldReal[row * size + column] = rowReal[row];
        fieldImag[row * size + column] = rowImag[row];
      }
    }
  }

  function update(time) {
    for (let cell = 0; cell < cells; cell++) {
      const phase = omega[cell] * time;
      const cosine = Math.cos(phase);
      const sine = Math.sin(phase);
      spectrumReal[cell] = startReal[cell] * cosine - startImag[cell] * sine + mirrorReal[cell] * cosine + mirrorImag[cell] * sine;
      spectrumImag[cell] = startReal[cell] * sine + startImag[cell] * cosine - mirrorReal[cell] * sine + mirrorImag[cell] * cosine;
      fieldReal[cell] = spectrumReal[cell];
      fieldImag[cell] = spectrumImag[cell];
    }
    inverse2d();
    height.set(fieldReal);

    //NOTE(@jimmylee)
    //Two real fields share one complex transform: x in the real part, z in the imaginary part.
    for (let cell = 0; cell < cells; cell++) {
      const factorX = waveX[cell] * waveInverse[cell];
      const factorZ = waveZ[cell] * waveInverse[cell];
      fieldReal[cell] = factorX * spectrumImag[cell] + factorZ * spectrumReal[cell];
      fieldImag[cell] = -factorX * spectrumReal[cell] + factorZ * spectrumImag[cell];
    }
    inverse2d();
    displaceX.set(fieldReal);
    displaceZ.set(fieldImag);

    for (let cell = 0; cell < cells; cell++) {
      fieldReal[cell] = -waveX[cell] * spectrumImag[cell] - waveZ[cell] * spectrumReal[cell];
      fieldImag[cell] = waveX[cell] * spectrumReal[cell] - waveZ[cell] * spectrumImag[cell];
    }
    inverse2d();
    slopeX.set(fieldReal);
    slopeZ.set(fieldImag);

    if (outputScale === 0) {
      let squares = 0;
      for (let cell = 0; cell < cells; cell++) squares += height[cell] * height[cell];
      const rms = Math.sqrt(squares / cells);
      outputScale = rms > 1e-6 ? targetHeight / rms : 1;
    }
    for (let cell = 0; cell < cells; cell++) {
      height[cell] *= outputScale;
      displaceX[cell] *= outputScale * choppiness;
      displaceZ[cell] *= outputScale * choppiness;
      slopeX[cell] *= outputScale;
      slopeZ[cell] *= outputScale;
    }

    const doubleStep = (2 * domain) / size;
    for (let row = 0; row < size; row++) {
      const next = ((row + 1) % size) * size;
      const previous = ((row - 1 + size) % size) * size;
      const base = row * size;
      for (let column = 0; column < size; column++) {
        const cell = base + column;
        const right = (column + 1) % size;
        const left = (column - 1 + size) % size;
        const dxdx = (displaceX[base + right] - displaceX[base + left]) / doubleStep;
        const dzdz = (displaceZ[next + column] - displaceZ[previous + column]) / doubleStep;
        const dxdz = (displaceX[next + column] - displaceX[previous + column]) / doubleStep;
        const dzdx = (displaceZ[base + right] - displaceZ[base + left]) / doubleStep;
        const jacobian = (1 + dxdx) * (1 + dzdz) - dxdz * dzdx;
        const foam = (foamThreshold - jacobian) * foamStrength;
        const target = cell * 4;
        heightDisplacement[target] = height[cell];
        heightDisplacement[target + 1] = displaceX[cell];
        heightDisplacement[target + 2] = displaceZ[cell];
        heightDisplacement[target + 3] = foam < 0 ? 0 : foam > 1 ? 1 : foam;
        slope[target] = slopeX[cell];
        slope[target + 1] = slopeZ[cell];
      }
    }
  }

  return { size, heightDisplacement, slope, update };
}

//NOTE(@jimmylee)
//Below this height the ripples have died out, and a field with nothing in it stops stepping.
const RIPPLE_REST_HEIGHT = 1e-4;
const RIPPLE_STAMP_MARGIN = 4;
//NOTE(@jimmylee)
//How fast the surface has to move, in units per step, to break into froth, how much froth that makes per
//unit past it, and how much of it is left after a step: about half a second of it.
const WAKE_SPEED = 0.13;
const WAKE_GAIN = 1.1;
const WAKE_FADE = 0.977;
const WAKE_REST = 0.01;
const SPONGE_STRENGTH = 0.25;

//NOTE(@jimmylee)
//`propagation` stays below 0.5 for the scheme's stability. `field` is RGBA per cell: height, x slope,
//z slope and foam: `hug`, which is 1 inside whatever stands in the water and falls to 0 just outside it, or
//the wake, whichever is more. The wake is the froth a breaking wave leaves: it gathers where the surface
//moves fast and fades, so a stride or a splash trails foam after the wave has gone. It is all ready for a
//texture. The grid does not wrap: the outer `sponge` cells absorb a wave, so nothing comes
//back or shows on the other side. Positions are world units from the domain's center.
//
//Nothing disturbs the surface but the bodies stamped into it. Each drawn frame, displace() says how much
//volume sits below the surface, cover() how much area the waterline takes and wall() how much of it a
//fixed body takes, then settle() turns the change since the last settle into waves. A body that enters,
//leaves or moves through the water pushes it aside, and one that holds still does nothing. Cells under
//a waterline or a wall hold no waves, so ripples reflect off a body instead of crossing it. A wall adds
//nothing to `hug`: the shader knows a fixed body's outline exactly.
export function createWaterRipples({ size, domain, propagation, damping, sponge }) {
  const cells = size * size;
  const cellSize = domain / size;
  const cellArea = cellSize * cellSize;
  const doubleStep = 2 * cellSize;
  const field = new Float32Array(cells * 4);
  const border = new Float32Array(cells);
  const open = new Float32Array(cells);
  const solid = new Float32Array(cells);
  const walled = new Float32Array(cells);
  const hug = new Float32Array(cells);
  const wake = new Float32Array(cells);
  const scratch = new Float32Array(cells);
  const smoothed = new Float32Array(cells);
  let current = new Float32Array(cells);
  let previous = new Float32Array(cells);
  let column = new Float32Array(cells);
  let lastColumn = new Float32Array(cells);
  let awake = false;
  const stamped = { minColumn: size, maxColumn: -1, minRow: size, maxRow: -1 };
  const lastStamped = { minColumn: size, maxColumn: -1, minRow: size, maxRow: -1 };

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const edge = Math.min(row, col, size - 1 - row, size - 1 - col);
      const fade = edge < sponge ? 1 - edge / sponge : 0;
      border[row * size + col] = 1 - SPONGE_STRENGTH * fade * fade;
      open[row * size + col] = border[row * size + col];
    }
  }

  function splat(target, x, z, amount) {
    const fromColumn = (x / domain + 0.5) * size - 0.5;
    const fromRow = (z / domain + 0.5) * size - 0.5;
    const col = Math.floor(fromColumn);
    const row = Math.floor(fromRow);
    if (col < 1 || row < 1 || col > size - 3 || row > size - 3) return;
    const fx = fromColumn - col;
    const fz = fromRow - row;
    const cell = row * size + col;
    target[cell] += amount * (1 - fx) * (1 - fz);
    target[cell + 1] += amount * fx * (1 - fz);
    target[cell + size] += amount * (1 - fx) * fz;
    target[cell + size + 1] += amount * fx * fz;
    if (col < stamped.minColumn) stamped.minColumn = col;
    if (col + 1 > stamped.maxColumn) stamped.maxColumn = col + 1;
    if (row < stamped.minRow) stamped.minRow = row;
    if (row + 1 > stamped.maxRow) stamped.maxRow = row + 1;
  }

  //NOTE(@jimmylee)
  //`volume` world units³ of body below the surface at (x, z).
  function displace(x, z, volume) {
    splat(column, x, z, volume / cellArea);
  }

  //NOTE(@jimmylee)
  //`area` world units² of waterline at (x, z).
  function cover(x, z, area) {
    splat(solid, x, z, area / cellArea);
  }

  //NOTE(@jimmylee)
  //`area` world units² of a fixed body at (x, z).
  function wall(x, z, area) {
    splat(walled, x, z, area / cellArea);
  }

  function blur(from, to, minColumn, maxColumn, minRow, maxRow) {
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minColumn; col <= maxColumn; col++) {
        const cell = row * size + col;
        to[cell] = (4 * from[cell] + 2 * (from[cell - 1] + from[cell + 1] + from[cell - size] + from[cell + size]) + from[cell - size - 1] + from[cell - size + 1] + from[cell + size - 1] + from[cell + size + 1]) / 16;
      }
    }
  }

  //NOTE(@jimmylee)
  //Turns the stamps since the last settle into waves. `gain` of a displaced column lifts the surface
  //around it, and that lift tops out at `limit`, so a stone dropping in splashes and does not tower over
  //the swell while a unit's slow rise against it still shows. A gain of 0 only records the stamps: what a
  //surface holds when it first sees a body is not news.
  function settle(gain, limit) {
    if (stamped.maxColumn < 0 && lastStamped.maxColumn < 0) return;
    const minColumn = Math.max(1, Math.min(stamped.minColumn, lastStamped.minColumn) - RIPPLE_STAMP_MARGIN);
    const maxColumn = Math.min(size - 2, Math.max(stamped.maxColumn, lastStamped.maxColumn) + RIPPLE_STAMP_MARGIN);
    const minRow = Math.max(1, Math.min(stamped.minRow, lastStamped.minRow) - RIPPLE_STAMP_MARGIN);
    const maxRow = Math.min(size - 2, Math.max(stamped.maxRow, lastStamped.maxRow) + RIPPLE_STAMP_MARGIN);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minColumn; col <= maxColumn; col++) {
        const cell = row * size + col;
        scratch[cell] = column[cell] - lastColumn[cell];
        if (solid[cell] > 1) solid[cell] = 1;
        open[cell] = border[cell] * (1 - Math.max(solid[cell], Math.min(walled[cell], 1)));
      }
    }
    blur(scratch, smoothed, minColumn + 1, maxColumn - 1, minRow + 1, maxRow - 1);
    for (let row = minRow + 1; row < maxRow; row++) {
      for (let col = minColumn + 1; col < maxColumn; col++) {
        const cell = row * size + col;
        const lift = gain * smoothed[cell];
        current[cell] += lift / (1 + Math.abs(lift) / limit);
      }
    }
    blur(solid, smoothed, minColumn + 1, maxColumn - 1, minRow + 1, maxRow - 1);
    blur(smoothed, hug, minColumn + 2, maxColumn - 2, minRow + 2, maxRow - 2);

    const swap = column;
    column = lastColumn;
    lastColumn = swap;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minColumn; col <= maxColumn; col++) {
        const cell = row * size + col;
        column[cell] = 0;
        solid[cell] = 0;
        walled[cell] = 0;
      }
    }
    Object.assign(lastStamped, stamped);
    stamped.minColumn = size;
    stamped.maxColumn = -1;
    stamped.minRow = size;
    stamped.maxRow = -1;
    awake = true;
  }

  function step() {
    let peak = 0;
    for (let row = 1; row < size - 1; row++) {
      const base = row * size;
      for (let col = 1; col < size - 1; col++) {
        const cell = base + col;
        const laplacian = current[cell - 1] + current[cell + 1] + current[cell - size] + current[cell + size] - 4 * current[cell];
        const next = (2 * current[cell] - previous[cell] + propagation * laplacian) * damping * open[cell];
        const breaking = Math.abs(next - current[cell]) - WAKE_SPEED;
        const froth = wake[cell] * WAKE_FADE + (breaking > 0 ? breaking * WAKE_GAIN : 0);
        wake[cell] = froth > 1 ? 1 : froth;
        if (wake[cell] > WAKE_REST && WAKE_REST > peak) peak = WAKE_REST;
        previous[cell] = next;
        if (next > peak) peak = next;
        else if (-next > peak) peak = -next;
      }
    }
    const swap = current;
    current = previous;
    previous = swap;

    for (let row = 1; row < size - 1; row++) {
      const base = row * size;
      for (let col = 1; col < size - 1; col++) {
        const cell = base + col;
        const target = cell * 4;
        field[target] = current[cell];
        field[target + 1] = (current[cell + 1] - current[cell - 1]) / doubleStep;
        field[target + 2] = (current[cell + size] - current[cell - size]) / doubleStep;
        field[target + 3] = hug[cell] > wake[cell] ? hug[cell] : wake[cell];
      }
    }
    awake = peak >= RIPPLE_REST_HEIGHT || lastStamped.maxColumn >= 0;
  }

  function clear() {
    for (const values of [field, solid, walled, hug, wake, current, previous, column, lastColumn]) values.fill(0);
    open.set(border);
    stamped.minColumn = lastStamped.minColumn = size;
    stamped.maxColumn = lastStamped.maxColumn = -1;
    stamped.minRow = lastStamped.minRow = size;
    stamped.maxRow = lastStamped.maxRow = -1;
    awake = true;
  }

  return { size, cellSize, field, displace, cover, wall, settle, step, clear, isAwake: () => awake };
}

//NOTE(@jimmylee)
//Channel of a wrapping RGBA field at (u, v), bilinear: the swell's height under a body.
export function sampleWaterField(field, size, u, v, channel) {
  const column = (u - Math.floor(u)) * size;
  const row = (v - Math.floor(v)) * size;
  const column0 = Math.floor(column) % size;
  const row0 = Math.floor(row) % size;
  const column1 = (column0 + 1) % size;
  const row1 = (row0 + 1) % size;
  const fx = column - Math.floor(column);
  const fz = row - Math.floor(row);
  const top = field[(row0 * size + column0) * 4 + channel] * (1 - fx) + field[(row0 * size + column1) * 4 + channel] * fx;
  const bottom = field[(row1 * size + column0) * 4 + channel] * (1 - fx) + field[(row1 * size + column1) * 4 + channel] * fx;
  return top * (1 - fz) + bottom * fz;
}
