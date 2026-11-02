//NOTE(@jimmylee)
//A weighted cloth bag on a cord, the weapon of the Cloth Bag cards. TYPE1 draws an empty hand on the Swing
//frames, so the bag is generated like the bow: a spec and a simulation here, and a mesh in
//cloth-bag-mesh.js. Nothing here imports three.js.
//
//The frame is the plane of the unit's facing and world up: x forward, y up, world units. The cord is a chain
//of point masses under XPBD distance constraints with the bag as the last one, stepped at a fixed
//CLOTH_BAG_STEP_S, so a swing does not depend on the frame rate or the camera. A chain this much lighter than
//its bag converges too slowly to hold its length, so one pass out from the hand finishes each step and
//leaves no link longer than it is. The hand steps with the
//sprite's frames, and the cord's first node follows it through a short lag, so a stepped hand reads as a
//pull on the cord and never as a teleport. It carries tension only, as a cord does: a node can come closer
//to its neighbour than a link's length, and then it simply falls.

export const CLOTH_BAG_SPEC = {
  links: 6,
  cordLength: 9,
  cordMass: 0.015,
  bagMass: 0.25,
  bagRadius: 3,
  //NOTE(@jimmylee)
  //A heavy bag in a swing of about 35 ticks: it falls within the swing, where the engine's defaultGravity
  //would leave it floating.
  gravity: 420,
  compliance: 1e-7,
  drag: 1.4,
  handLagS: 1.5 / 60,
  restitution: 0.2,
  impactDecayS: 8 / 60,
};

export const CLOTH_BAG_STEP_S = 1 / 240;
const SOLVER_PASSES = 8;

//NOTE(@jimmylee)
//How long the sack is from its neck, the last node of the chain, to its bottom.
export const clothBagLength = (spec) => spec.bagRadius * 2;

//NOTE(@jimmylee)
//`x`, `y` hold nodes 0..links, the hand first and the bag last. `wall` is the forward position of what the
//bag can hit (Infinity for nothing), and `floor` the height it rests on. `impact` is 1 on contact and
//decays, for the mesh to squash on. `speed` is the bag's, in world units per second.
export function createClothBag(spec = CLOTH_BAG_SPEC) {
  const nodes = spec.links + 1;
  const bag = { spec, nodes, x: new Float64Array(nodes), y: new Float64Array(nodes), lastX: new Float64Array(nodes), lastY: new Float64Array(nodes), inverseMass: new Float64Array(nodes), rest: spec.cordLength / spec.links, handX: 0, handY: 0, wall: Infinity, floor: -Infinity, impact: 0, speed: 0, struck: false };
  for (let i = 1; i < nodes; i++) bag.inverseMass[i] = 1 / (i === nodes - 1 ? spec.bagMass : spec.cordMass);
  return bag;
}

//NOTE(@jimmylee)
//The bag at rest, hanging straight down from a hand at (handX, handY).
export function resetClothBag(bag, handX, handY) {
  bag.handX = handX;
  bag.handY = handY;
  for (let i = 0; i < bag.nodes; i++) {
    bag.x[i] = bag.lastX[i] = handX;
    bag.y[i] = bag.lastY[i] = handY - i * bag.rest;
  }
  bag.impact = 0;
  bag.speed = 0;
  bag.struck = false;
}

//NOTE(@jimmylee)
//The snap of the swing: sets the bag going so that, falling under the spec's gravity, it reaches
//(targetX, targetY) in `seconds`, and the cord with it in proportion along its length. Only a cord this
//long reaches that far, so a wall that is out of reach is never met.
export function whipClothBag(bag, targetX, targetY, seconds) {
  const { x, y, lastX, lastY, nodes, spec } = bag;
  const last = nodes - 1;
  const vx = (targetX - x[last]) / seconds;
  const vy = (targetY - y[last]) / seconds + (spec.gravity * seconds) / 2;
  for (let i = 1; i < nodes; i++) {
    const share = i / last;
    lastX[i] = x[i] - vx * share * CLOTH_BAG_STEP_S;
    lastY[i] = y[i] - vy * share * CLOTH_BAG_STEP_S;
  }
}

//NOTE(@jimmylee)
//One fixed step toward a hand at (handX, handY). Allocates nothing.
export function stepClothBag(bag, handX, handY) {
  const { spec, nodes, x, y, lastX, lastY, inverseMass, rest } = bag;
  const h = CLOTH_BAG_STEP_S;
  const follow = 1 - Math.exp(-h / spec.handLagS);
  bag.handX += (handX - bag.handX) * follow;
  bag.handY += (handY - bag.handY) * follow;
  const keep = Math.exp(-spec.drag * h);
  for (let i = 1; i < nodes; i++) {
    const px = x[i];
    const py = y[i];
    x[i] += (px - lastX[i]) * keep;
    y[i] += (py - lastY[i]) * keep - spec.gravity * h * h;
    lastX[i] = px;
    lastY[i] = py;
  }
  x[0] = bag.handX;
  y[0] = bag.handY;

  const alpha = spec.compliance / (h * h);
  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    for (let i = 0; i + 1 < nodes; i++) {
      const dx = x[i + 1] - x[i];
      const dy = y[i + 1] - y[i];
      const length = Math.hypot(dx, dy);
      if (length <= rest) continue;
      const weight = inverseMass[i] + inverseMass[i + 1];
      const lambda = (length - rest) / (weight + alpha) / length;
      x[i] += dx * lambda * inverseMass[i];
      y[i] += dy * lambda * inverseMass[i];
      x[i + 1] -= dx * lambda * inverseMass[i + 1];
      y[i + 1] -= dy * lambda * inverseMass[i + 1];
    }
  }

  for (let i = 1; i < nodes; i++) {
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    const length = Math.hypot(dx, dy);
    if (length <= rest) continue;
    x[i] = x[i - 1] + (dx / length) * rest;
    y[i] = y[i - 1] + (dy / length) * rest;
  }

  const last = nodes - 1;
  const limit = bag.wall - clothBagLength(spec);
  if (x[last] > limit) {
    const inbound = (x[last] - lastX[last]) / h;
    x[last] = limit;
    lastX[last] = limit + inbound * spec.restitution * h;
    if (!bag.struck) {
      bag.struck = true;
      bag.impact = 1;
    }
  }
  const lowest = bag.floor + spec.bagRadius;
  if (y[last] < lowest) {
    y[last] = lowest;
    lastY[last] = lowest;
  }
  bag.speed = Math.hypot(x[last] - lastX[last], y[last] - lastY[last]) / h;
  bag.impact = Math.max(0, bag.impact - h / spec.impactDecayS);
}
