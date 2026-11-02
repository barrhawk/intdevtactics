//NOTE(jimmylee)
//Marble physics defaults. The demo catalog reads the restitution for its stone collision, and a game
//with a physics engine has the rest.
export const MARBLE_DEFAULTS = {
  mass: 5,
  shape: 'SPHERE',
  friction: 0.15,
  rollingFriction: 0.01,
  restitution: 0.3,
  ccdThreshold: 1,
};
