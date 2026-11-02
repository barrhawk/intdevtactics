//NOTE(@jimmylee)
//A bow generated from a spec: nothing here reads a sprite sheet or three.js, so the demo
//catalog can ask what a shot does before anything is drawn, and weapons/bow-mesh.js builds the drawn
//bow from the same numbers. World units, seconds and the engine's mass units throughout.
//
//The bow's frame: +x along the arrow, +y up the limbs, the grip at the origin, the string behind it.
//The bow is symmetric about y = 0, so one limb and half the string are simulated; the other half is
//their mirror and every mass, force and energy below belongs to that half unless it says otherwise.
//
//Limb: an inextensible beam tillered to bend in a circular arc, the shape a well made bow takes, so
//one angle `phi` (the turn from its base to its tip) gives the whole curve and its length never
//changes. It stores bending energy U = k(phi - restBend)² / 2.
//String: a chain of point masses under XPBD distance constraints with the string's own compliance.
//It carries tension only, so it can go slack, whip and ring after the shot.
//Arrow: sits on the nock with no glue. It leaves when the string stops pushing it, which is when the
//nock starts to slow down.

export const BOW_STEP_S = 1 / 2400;
const STRING_NODES = 8;
const SOLVER_ITERATIONS = 3;
const SOFT_BEND = 1e-4;
const BISECT_STEPS = 60;
const CALIBRATE_STEPS = 8;
const SHOT_TIMEOUT_S = 2;

//NOTE(@jimmylee)
//The demo bow. Sized by the art: full draw is the distance between the Bow frames' two hands at
//the 0.75 x 0.9 billboard scale, and the 28 unit stave is a short bow on a 36 unit character.
//stringMass and stringStiffness set how it rings, drawForce and arrowMass how it shoots. A spec is all
//there is to a bow: `bendAt` and `createBow` work for any of them.
export const BOW_SPEC = {
  gripHalf: 2.5,
  limbLength: 12,
  restBend: 0.12,
  braceHeight: 3.5,
  drawLength: 9.5,
  drawForce: 15500,
  limbMass: 0.9,
  stringMass: 0.25,
  stringStiffness: 2.5e6,
  stringDamping: 5,
  limbDamping: 2,
  arrowMass: 1,
  arrowLength: 18,
  limbThickness: 0.75,
  limbWidth: 1.25,
  tipScale: 0.45,
  stringRadius: 0.2,
};

//NOTE(@jimmylee)
//(1 - cos(a)) / a and sin(a) / a, and their derivatives, which stay finite at a straight limb.
function sag(a) {
  return Math.abs(a) < SOFT_BEND ? a / 2 : (1 - Math.cos(a)) / a;
}
function run(a) {
  return Math.abs(a) < SOFT_BEND ? 1 - (a * a) / 6 : Math.sin(a) / a;
}
function sagSlope(a) {
  return Math.abs(a) < SOFT_BEND ? 0.5 : (a * Math.sin(a) - (1 - Math.cos(a))) / (a * a);
}
function runSlope(a) {
  return Math.abs(a) < SOFT_BEND ? -a / 3 : (a * Math.cos(a) - Math.sin(a)) / (a * a);
}

//NOTE(@jimmylee)
//The point `s` along a limb (0 at the end of the grip, spec.limbLength at the tip) bent by `phi`.
//Writes `out` ({ x, y }) and returns it.
export function limbPoint(spec, phi, s, out) {
  const a = (phi * s) / spec.limbLength;
  out.x = -s * sag(a);
  out.y = spec.gripHalf + s * run(a);
  return out;
}

function tipX(spec, phi) {
  return -spec.limbLength * sag(phi);
}

function tipY(spec, phi) {
  return spec.gripHalf + spec.limbLength * run(phi);
}

function tipSlopeX(spec, phi) {
  return -spec.limbLength * sagSlope(phi);
}

function tipSlopeY(spec, phi) {
  return spec.limbLength * runSlope(phi);
}

//NOTE(@jimmylee)
//String tension that balances the limb's bending moment at `phi`, with the nock `pull` behind the
//grip: the limb's restoring moment against the tip's lever arm on the string.
function balanceTension(spec, k, phi, pull) {
  const dx = -pull - tipX(spec, phi);
  const dy = -tipY(spec, phi);
  const length = Math.hypot(dx, dy);
  const arm = (tipSlopeX(spec, phi) * dx + tipSlopeY(spec, phi) * dy) / length;
  return (k * (phi - spec.restBend)) / arm;
}

function stringReach(spec, phi, pull) {
  return Math.hypot(pull + tipX(spec, phi), tipY(spec, phi));
}

//NOTE(@jimmylee)
//The limb angle with the nock `pull` behind the grip: where the string, stretched by its own
//tension, spans the tip to the nock.
function solveBend(derived, spec, pull) {
  let low = derived.phiBrace - 1e-9;
  let high = Math.PI;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const phi = (low + high) / 2;
    const stretched = derived.stringRest * (1 + balanceTension(spec, derived.k, phi, pull) / spec.stringStiffness);
    if (stringReach(spec, phi, pull) > stretched) low = phi;
    else high = phi;
  }
  return (low + high) / 2;
}

function solveBrace(spec) {
  let low = 0;
  let high = Math.PI;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const phi = (low + high) / 2;
    if (-tipX(spec, phi) < spec.braceHeight) low = phi;
    else high = phi;
  }
  return (low + high) / 2;
}

function strungRest(spec, derived) {
  const tension = balanceTension(spec, derived.k, derived.phiBrace, spec.braceHeight);
  return tipY(spec, derived.phiBrace) / (1 + tension / spec.stringStiffness);
}

//NOTE(@jimmylee)
//The nock force, whole-bow, with the nock `pull` behind the grip.
function forceAt(derived, spec, pull) {
  const phi = solveBend(derived, spec, pull);
  const tension = balanceTension(spec, derived.k, phi, pull);
  return (2 * tension * (pull + tipX(spec, phi))) / stringReach(spec, phi, pull);
}

//NOTE(@jimmylee)
//Fits the limb stiffness to spec.drawForce at spec.drawLength. Tension scales with k, so each pass
//scales it by the error; only the string's stretch keeps that from being exact in one.
function deriveBow(spec) {
  const phiBrace = solveBrace(spec);
  const derived = { phiBrace, k: 1e5, stringRest: 0, limbInertia: (spec.limbMass * spec.limbLength * spec.limbLength) / 20 };
  for (let i = 0; i < CALIBRATE_STEPS; i++) {
    derived.stringRest = strungRest(spec, derived);
    derived.k *= spec.drawForce / forceAt(derived, spec, spec.drawLength);
  }
  derived.stringRest = strungRest(spec, derived);
  return derived;
}

//NOTE(@jimmylee)
//What holding the nock `pull` behind the grip takes, whole-bow, solved from the geometry alone:
//{ phi, tension, force, energy }, energy being the bending energy stored in both limbs.
export function bendAt(bow, pull) {
  const { spec, k } = bow;
  const phi = solveBend(bow, spec, pull);
  const tension = balanceTension(spec, k, phi, pull);
  const force = (2 * tension * (pull + tipX(spec, phi))) / stringReach(spec, phi, pull);
  return { phi, tension, force, energy: k * (phi - spec.restBend) * (phi - spec.restBend) };
}

//NOTE(@jimmylee)
//The strung bow at rest. The returned object is the simulation's whole state, in typed arrays, so
//stepping it allocates nothing.
export function createBow(spec) {
  const derived = deriveBow(spec);
  const count = STRING_NODES + 1;
  const bow = {
    spec,
    ...derived,
    nodes: STRING_NODES,
    segment: derived.stringRest / STRING_NODES,
    nodeMass: spec.stringMass / 2 / STRING_NODES,
    x: new Float64Array(count),
    y: new Float64Array(count),
    vx: new Float64Array(count),
    vy: new Float64Array(count),
    px: new Float64Array(count),
    py: new Float64Array(count),
    lambda: new Float64Array(STRING_NODES),
    nx: new Float64Array(STRING_NODES),
    ny: new Float64Array(STRING_NODES),
    diagonal: new Float64Array(STRING_NODES),
    upper: new Float64Array(STRING_NODES),
    rhs: new Float64Array(STRING_NODES),
    phi: 0,
    phiDot: 0,
    arrowOn: false,
    arrowX: 0,
    arrowV: 0,
    tension: 0,
    nockForce: 0,
  };
  resetBow(bow);
  return bow;
}

//NOTE(@jimmylee)
//Back to the strung bow at rest, string straight between the tips, no arrow.
export function resetBow(bow) {
  const { spec, nodes, x, y } = bow;
  bow.phi = bow.phiBrace;
  bow.phiDot = 0;
  const topX = tipX(spec, bow.phi);
  const topY = tipY(spec, bow.phi);
  for (let i = 0; i <= nodes; i++) {
    x[i] = topX;
    y[i] = topY * (1 - i / nodes);
  }
  bow.vx.fill(0);
  bow.vy.fill(0);
  bow.arrowOn = false;
  bow.arrowX = 0;
  bow.arrowV = 0;
  bow.tension = 0;
  bow.nockForce = 0;
}

//NOTE(@jimmylee)
//One Newton step of the string's constraints as the tridiagonal system (J W Jt + a) dLambda = -C - a L:
//a chain couples each segment only to its neighbours, so one direct solve closes every segment at once,
//where sweeping them would leave a stiff string stretched. A string only pulls, so a slack segment
//leaves the system. Returns the tip's lever arm on the first segment.
function linearizeString(bow, nockW, nodeW, compliance) {
  const { spec, nodes, x, y, nx, ny, lambda, diagonal, upper, rhs, segment, limbInertia } = bow;
  x[0] = tipX(spec, bow.phi);
  y[0] = tipY(spec, bow.phi);
  for (let i = 0; i < nodes; i++) {
    const dx = x[i + 1] - x[i];
    const dy = y[i + 1] - y[i];
    const length = Math.hypot(dx, dy);
    nx[i] = dx / length;
    ny[i] = dy / length;
    rhs[i] = -(length - segment) - compliance * lambda[i];
  }
  const arm = tipSlopeX(spec, bow.phi) * nx[0] + tipSlopeY(spec, bow.phi) * ny[0];
  for (let i = 0; i < nodes; i++) {
    upper[i] = 0;
    if (rhs[i] >= 0 && lambda[i] === 0) {
      diagonal[i] = 1;
      rhs[i] = 0;
      continue;
    }
    const far = i + 1 === nodes ? nockW * nx[i] * nx[i] : nodeW;
    const near = i === 0 ? (arm * arm) / limbInertia : nodeW;
    diagonal[i] = near + far + compliance;
    if (i + 1 < nodes && (rhs[i + 1] < 0 || lambda[i + 1] !== 0)) upper[i] = -nodeW * (nx[i] * nx[i + 1] + ny[i] * ny[i + 1]);
  }
  return arm;
}

//NOTE(@jimmylee)
//Thomas algorithm on the symmetric system; leaves the solution in bow.rhs. Stays in place, so it
//allocates nothing.
function solveTridiagonal(bow) {
  const { nodes, diagonal, upper, rhs } = bow;
  for (let i = 1; i < nodes; i++) {
    const m = upper[i - 1] / diagonal[i - 1];
    diagonal[i] -= m * upper[i - 1];
    rhs[i] -= m * rhs[i - 1];
  }
  rhs[nodes - 1] /= diagonal[nodes - 1];
  for (let i = nodes - 2; i >= 0; i--) rhs[i] = (rhs[i] - upper[i] * rhs[i + 1]) / diagonal[i];
}

function applyString(bow, nockW, nodeW, arm) {
  const { nodes, x, y, nx, ny, lambda, rhs, limbInertia } = bow;
  for (let i = 0; i < nodes; i++) {
    //NOTE(@jimmylee)
    //The multiplier never crosses zero: that would be a string pushing.
    const next = Math.min(lambda[i] + rhs[i], 0);
    const applied = next - lambda[i];
    lambda[i] = next;
    if (i + 1 === nodes) {
      x[i + 1] += nockW * nx[i] * applied;
    } else {
      x[i + 1] += nodeW * nx[i] * applied;
      y[i + 1] += nodeW * ny[i] * applied;
    }
    if (i === 0) {
      bow.phi -= (arm * applied) / limbInertia;
    } else {
      x[i] -= nodeW * nx[i] * applied;
      y[i] -= nodeW * ny[i] * applied;
    }
  }
}

//NOTE(@jimmylee)
//Advances the bow BOW_STEP_S. `pull` >= 0 is the archer holding the nock that far behind the grip,
//with an arrow on the string; `pull` < 0 is an open hand. Letting go hands the arrow to the string,
//and it stays on the nock until the nock slows down.
export function stepBow(bow, pull) {
  const { spec, nodes, x, y, vx, vy, px, py, lambda, nodeMass, limbInertia, k, segment } = bow;
  const h = BOW_STEP_S;
  const held = pull >= 0;
  if (held) {
    bow.arrowOn = true;
    bow.arrowV = 0;
  }

  const phiStart = bow.phi;
  bow.phiDot += (h * (-k * (bow.phi - spec.restBend) - spec.limbDamping * bow.phiDot)) / limbInertia;
  bow.phi += h * bow.phiDot;

  //NOTE(@jimmylee)
  //Air drags the string, not the arrow riding its last node.
  const damping = 1 - h * spec.stringDamping;
  for (let i = 1; i <= nodes; i++) {
    px[i] = x[i];
    py[i] = y[i];
    if (i < nodes || !bow.arrowOn) {
      vx[i] *= damping;
      vy[i] *= damping;
    }
    x[i] += h * vx[i];
    y[i] += h * vy[i];
  }
  if (held) x[nodes] = -pull;
  y[nodes] = 0;

  //NOTE(@jimmylee)
  //Half the arrow and half the nock's share of the string ride the last node of the half model.
  const nockW = held ? 0 : 1 / (nodeMass / 2 + (bow.arrowOn ? spec.arrowMass / 2 : 0));
  const nodeW = 1 / nodeMass;
  const compliance = (segment / spec.stringStiffness) / (h * h);
  lambda.fill(0);
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    const armLength = linearizeString(bow, nockW, nodeW, compliance);
    solveTridiagonal(bow);
    applyString(bow, nockW, nodeW, armLength);
  }

  x[0] = tipX(spec, bow.phi);
  y[0] = tipY(spec, bow.phi);
  bow.phiDot = (bow.phi - phiStart) / h;
  for (let i = 1; i <= nodes; i++) {
    vx[i] = (x[i] - px[i]) / h;
    vy[i] = (y[i] - py[i]) / h;
  }
  vy[nodes] = 0;
  bow.tension = -lambda[0] / (h * h);
  bow.nockForce = (-2 * lambda[nodes - 1] * Math.abs(bow.nx[nodes - 1])) / (h * h);

  if (bow.arrowOn && !held) {
    if (vx[nodes] < bow.arrowV) {
      bow.arrowOn = false;
      bow.arrowX = x[nodes];
    } else {
      bow.arrowV = vx[nodes];
    }
  } else if (!bow.arrowOn) {
    bow.arrowX += h * bow.arrowV;
  }
}

//NOTE(@jimmylee)
//Everything the half model holds, doubled to the whole bow: bending energy, the limbs' and string's
//motion and the arrow's, whether on the nock or free.
export function bowEnergy(bow) {
  const { spec, nodes, x, y, vx, vy, nodeMass, limbInertia, k, segment } = bow;
  const bend = bow.phi - spec.restBend;
  let kinetic = (limbInertia * bow.phiDot * bow.phiDot) / 2;
  for (let i = 1; i <= nodes; i++) {
    const mass = i === nodes ? nodeMass / 2 : nodeMass;
    kinetic += (mass * (vx[i] * vx[i] + vy[i] * vy[i])) / 2;
  }
  const arrow = (spec.arrowMass / 2) * (bow.arrowOn ? vx[nodes] * vx[nodes] : bow.arrowV * bow.arrowV);
  let stretch = 0;
  for (let i = 0; i < nodes; i++) {
    const over = Math.max(0, Math.hypot(x[i + 1] - x[i], y[i + 1] - y[i]) - segment);
    stretch += over * over;
  }
  return { strain: k * bend * bend + (spec.stringStiffness / segment) * stretch, motion: 2 * kinetic, arrow };
}

//NOTE(@jimmylee)
//Nock pull at `tick` of a shot: nothing before `nockTick`, the brace height there, a smooth draw to
//full draw by `anchorTick`, the hold until `shotTick`, and an open hand from there. Negative means the
//hand is off the string.
export function bowPull(spec, tick, nockTick, anchorTick, shotTick) {
  if (tick < nockTick || tick >= shotTick) return -1;
  const s = Math.min(1, (tick - nockTick) / (anchorTick - nockTick));
  return spec.braceHeight + (spec.drawLength - spec.braceHeight) * s * s * (3 - 2 * s);
}

//NOTE(@jimmylee)
//One whole shot of `spec` on that schedule, from rest: { speed, strokeS, leavesAt, stored, efficiency,
//fullDrawForce }. `strokeS` is the time from the open hand to the arrow leaving, `leavesAt` where the
//nock is then, `stored` the energy the draw put in and `efficiency` the arrow's share of it.
export function simulateShot(spec, { nockTick, anchorTick, shotTick }) {
  const bow = createBow(spec);
  const braced = bowEnergy(bow).strain;
  const ticksPerStep = 60 * BOW_STEP_S;
  let tick = nockTick;
  while (tick < shotTick) {
    stepBow(bow, bowPull(spec, tick, nockTick, anchorTick, shotTick));
    tick += ticksPerStep;
  }
  const stored = bowEnergy(bow).strain - braced;
  let strokeS = 0;
  while (bow.arrowOn && strokeS < SHOT_TIMEOUT_S) {
    stepBow(bow, -1);
    strokeS += BOW_STEP_S;
  }
  const speed = bow.arrowV;
  return { speed, strokeS, leavesAt: bow.arrowX, stored, efficiency: ((spec.arrowMass / 2) * speed * speed) / stored, fullDrawForce: bendAt(bow, spec.drawLength).force };
}
