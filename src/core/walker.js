/**
 * On-foot physics for the away team.
 *
 * Real rules, scaled for fun: your legs push off with the same speed on every
 * world, so how high you go depends only on gravity. On Earth (1 g) a jump is
 * about half a metre; on a 0.17 g moon like Luna it is about three metres and
 * you hang in the air for seconds. In the air you keep most of your momentum
 * (there is nothing to push against), and slopes too steep to climb push you
 * back down.
 *
 * Pure maths: tested in tests/walker.test.mjs.
 */

export const G = 9.81;              // m/s² at 1 g
export const JUMP_SPEED = 3.2;      // m/s straight up, the same legs everywhere
export const MAX_SLOPE = 0.9;       // rise over run you can still walk up
export const AIR_CONTROL = 0.35;    // how much you can steer mid-air

/** Peak height of a standing jump at this gravity (metres). */
export function jumpHeight(gravityG) {
  const g = G * Math.max(0.05, gravityG);
  return (JUMP_SPEED * JUMP_SPEED) / (2 * g);
}

/** Seconds from take-off back to the ground. */
export function airTime(gravityG) {
  return (2 * JUMP_SPEED) / (G * Math.max(0.05, gravityG));
}

/**
 * Advance one frame.
 * @param {{y:number, vy:number, grounded:boolean}} body  updated in place
 * @param {number} ground   terrain height under the body
 * @param {number} gravityG world gravity in g
 * @param {boolean} jump    jump pressed this frame
 * @param {number} dt
 * @returns {{landed:boolean, impact:number}} impact = downward speed on landing
 */
export function stepVertical(body, ground, gravityG, jump, dt) {
  const g = G * Math.max(0.05, gravityG);
  let landed = false, impact = 0;
  if (body.grounded) {
    if (jump) { body.vy = JUMP_SPEED; body.grounded = false; }
    else {
      // walking: follow the ground (down small steps too, not a ballistic drop)
      if (body.y - ground > 0.35) body.grounded = false;
      else { body.y = ground; body.vy = 0; return { landed, impact }; }
    }
  }
  body.vy -= g * dt;
  body.y += body.vy * dt;
  if (body.y <= ground) {
    impact = -body.vy;
    landed = true;
    body.y = ground;
    body.vy = 0;
    body.grounded = true;
  }
  return { landed, impact };
}

/**
 * Horizontal move with slope limits. Returns the allowed step [dx, dz].
 * @param {(x:number,z:number)=>number} heightAt
 */
export function slopeLimited(x, z, dx, dz, heightAt, grounded) {
  if (!grounded) return [dx, dz];
  const step = Math.hypot(dx, dz);
  if (step < 1e-6) return [0, 0];
  const rise = heightAt(x + dx, z + dz) - heightAt(x, z);
  if (rise / step > MAX_SLOPE) return [0, 0];
  return [dx, dz];
}
