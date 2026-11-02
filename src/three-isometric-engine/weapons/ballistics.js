//NOTE(@jimmylee)
//Projectile math shared by every generated weapon and thrown object: no sprite or three.js.
//Everything flies under the engine's defaultGravity.

import { defaultGravity } from '@engine/constants/physics';

//NOTE(@jimmylee)
//The low arc that takes a projectile `speed` across `dx` horizontally and `dy` up:
//{ vh, vv, flightS } (dx / vh = flightS). Null when `speed` cannot reach it.
export function solveArc(dx, dy, speed) {
  const g = -defaultGravity;
  const v2 = speed * speed;
  const root = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (root < 0) return null;
  const angle = Math.atan2(v2 - Math.sqrt(root), g * dx);
  const vh = speed * Math.cos(angle);
  return { vh, vv: speed * Math.sin(angle), flightS: dx / vh };
}

//NOTE(@jimmylee)
//Head-on collision, mass `m` at speed `v` into `other` at rest, with restitution `e`:
//{ after, struck }, the speeds of the two along `v`. Momentum is conserved and the bodies separate at
//e · v.
export function collide(m, v, other, e) {
  return { after: ((m - e * other) * v) / (m + other), struck: ((1 + e) * m * v) / (m + other) };
}

//NOTE(@jimmylee)
//Seconds for a body at height `y0` above its rest height, rising at `vv`, to come down to it.
export function fallTime(y0, vv) {
  return (-vv - Math.sqrt(vv * vv - 2 * defaultGravity * y0)) / defaultGravity;
}
