// Jimbog — Counter-Strike style movement (Source engine physics).
//
// Ground friction + acceleration, air acceleration with the 30-unit wish cap
// (so air-strafing works), CS gravity and jump impulse, weapon-dependent
// max speed, walk (Shift) at 52% and crouch at 34%, crouch-jumping, a
// stamina penalty that stops bunny-hop abuse, and "tagging" (slow-down when
// shot). 1 Source unit = 2.54 cm.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  const UNIT = 0.0254;
  const C = {
    GRAVITY: 800 * UNIT,            // 20.32 m/s²
    JUMP: 301.993 * UNIT,           // 7.67 m/s -> ~1.45 m jump
    ACCEL: 5.5, AIR_ACCEL: 12, FRICTION: 5.2,
    STOP_SPEED: 80 * UNIT,          // friction floor
    AIR_CAP: 30 * UNIT,             // air wish-speed cap (air strafing)
    WALK: 0.52, DUCK: 0.34,
    STAND_H: 1.72, CROUCH_H: 1.15,
    SAFE_FALL: 580 * UNIT, FATAL_FALL: 1024 * UNIT,
    STEP_RUN: 3.5                   // footsteps are audible above this speed (m/s)
  };

  // Surface under a fighter's feet, for footstep sounds.
  function surfaceAt(level, x, z, y) {
    const r = level.regionAt(x, z, y);
    if (!r) return 'concrete';
    const f = r.fmat || '';
    if (/diamond|grate|roof_metal/.test(f) || (r.isStair && !r.outdoor && /diamond/.test(f))) return 'metal';
    if (/tiles|lino/.test(f)) return 'tile';
    if (/grass|soil/.test(f)) return 'grass';
    if (/timber/.test(f)) return 'wood';
    if (/carpet/.test(f)) return 'carpet';
    if (/gravel/.test(f)) return 'gravel';
    if (r.isStair && /diamond/.test(f)) return 'metal';
    return 'concrete';
  }

  function accelerate(v, wx, wz, wishspeed, accel, dt) {
    const cur = v.x * wx + v.z * wz;
    const add = wishspeed - cur;
    if (add <= 0) return;
    let a = accel * dt * wishspeed;
    if (a > add) a = add;
    v.x += a * wx; v.z += a * wz;
  }
  function airAccelerate(v, wx, wz, wishspeed, accel, dt) {
    const capped = Math.min(wishspeed, C.AIR_CAP);
    const cur = v.x * wx + v.z * wz;
    const add = capped - cur;
    if (add <= 0) return;
    let a = accel * wishspeed * dt;
    if (a > add) a = add;
    v.x += a * wx; v.z += a * wz;
  }
  function friction(v, dt) {
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.01) { v.x = 0; v.z = 0; return; }
    const control = speed < C.STOP_SPEED ? C.STOP_SPEED : speed;
    const ns = Math.max(0, speed - control * C.FRICTION * dt);
    v.x *= ns / speed; v.z *= ns / speed;
  }

  // Max ground speed for a fighter right now.
  function maxSpeed(f) {
    const def = JB.Weapons.DEFS[f.current];
    let s = def.speed || 6.1;
    if (def.scope && f.zoom > 0 && def.scopedSpeed) s = def.scopedSpeed;
    return s * (f.velMod || 1);
  }

  // One fixed physics step for a fighter. Returns events for the caller
  // ('jump', 'land' with speed, 'step') so it can play sounds / apply damage.
  function step(game, f, dt, events) {
    const inp = f.input, b = f.body, world = game.world;
    // ---- crouch, with CS crouch-jump (tuck the feet up while airborne)
    // (the 'stepup' events keep the camera steady while the feet move)
    const dH = C.STAND_H - C.CROUCH_H;
    if (b.onGround) f.tucked = false;
    if (inp.crouch && !f.crouching) {
      if (!b.onGround && world.fits(f.pos.x, f.pos.y + dH, f.pos.z, b.r, C.CROUCH_H)) {
        f.pos.y += dH; f.tucked = true;
        if (events) events.push(['stepup', dH]);
      }
      f.crouching = true;
    } else if (!inp.crouch && f.crouching) {
      if (f.tucked && world.fits(f.pos.x, f.pos.y - dH, f.pos.z, b.r, C.STAND_H)) {
        f.pos.y -= dH; f.crouching = false; f.tucked = false;
        if (events) events.push(['stepup', -dH]);
      } else if (world.fits(f.pos.x, f.pos.y, f.pos.z, b.r, C.STAND_H)) { f.crouching = false; f.tucked = false; }
    }
    b.h = f.crouching ? C.CROUCH_H : C.STAND_H;
    f.crouchK = U.damp(f.crouchK, f.crouching ? 1 : 0, 12, dt);
    f.eyeH = 1.58 - f.crouchK * 0.52;

    // ---- wish direction / speed
    const L = Math.hypot(inp.mx, inp.mz);
    const wx = L > 1e-3 ? inp.mx / L : 0, wz = L > 1e-3 ? inp.mz / L : 0;
    let wishspeed = maxSpeed(f) * Math.min(1, L);
    if (inp.walk) wishspeed *= C.WALK;
    if (f.crouching && b.onGround) wishspeed *= C.DUCK;
    // stamina after jumping/landing slows you (anti bunny-hop)
    f.stamina = Math.max(0, (f.stamina || 0) - 60 * dt);
    if (b.onGround) wishspeed *= 1 - f.stamina / 100;

    const v = f.vel;
    // ---- jump (needs a fresh press, like CS without auto-bhop)
    const jumpPressed = inp.jump && !f.jumpHeld;
    f.jumpHeld = inp.jump;
    if (b.onGround && jumpPressed && (f.jumpCool || 0) <= 0) {
      v.y = C.JUMP;
      b.onGround = false;
      f.jumpCool = 0.1;
      f.stamina = Math.min(80, f.stamina + 25);
      if (events) events.push(['jump']);
    }
    f.jumpCool = (f.jumpCool || 0) - dt;

    if (b.onGround) {
      friction(v, dt);
      if (L > 1e-3) accelerate(v, wx, wz, wishspeed, C.ACCEL, dt);
    } else if (L > 1e-3) airAccelerate(v, wx, wz, wishspeed, C.AIR_ACCEL, dt);
    v.y -= C.GRAVITY * dt;

    const wasGround = b.onGround;
    b.landSpeed = 0;
    world.move(b, dt);
    if (b.stepUp > 0 && events) events.push(['stepup', b.stepUp]);
    if (b.snapDown > 0 && events) events.push(['stepup', -b.snapDown]);
    if (!wasGround && b.onGround) {
      const ls = b.landSpeed || 0;
      if (ls > 2) f.stamina = Math.min(80, f.stamina + U.clamp(ls * 2.2, 5, 25));
      if (events) events.push(['land', ls]);
    }
    // ---- tagging recovery
    f.velMod = Math.min(1, (f.velMod || 1) + dt * 0.8);

    // ---- footsteps: loud above walking speed, silent when walking/crouched
    const hs = Math.hypot(v.x, v.z);
    if (b.onGround && hs > 0.8) {
      f.stepAcc = (f.stepAcc || 0) + hs * dt;
      if (f.stepAcc > 2.0) {
        f.stepAcc = 0;
        if (events) events.push(['step', hs > C.STEP_RUN && !f.crouching && !inp.walk]);
      }
    }
  }

  // CS fall damage (Source: safe below 580 u/s, fatal at 1024 u/s).
  function fallDamage(speed) {
    if (speed <= C.SAFE_FALL) return 0;
    return (speed - C.SAFE_FALL) * (100 / (C.FATAL_FALL - C.SAFE_FALL));
  }

  JB.Movement = { C, step, maxSpeed, surfaceAt, fallDamage };
})();
