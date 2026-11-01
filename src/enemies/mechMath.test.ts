import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { chooseAction, laserPhase, movePhase, punchHits, slamHits, type MechMind } from './mechMath';

const M = CONFIG.mech;
/** Where the surfaces touch, for a monster of radius 100. */
const contact = M.radius + 100;
/** Everything on cooldown, engaged, at middle distance: walks. */
const idle: MechMind = { dist: 800, contact, engaged: true, meleeCd: 1, dashCd: 1, rocketCd: 1, barrageCd: 1, evadeCd: 1, laserCd: 1, roll: 0.5, evadeRoll: 1 };

describe('mech brain', () => {
  it('fires the laser only when engaged, ready and in range', () => {
    const ready = { ...idle, dist: M.laserRange - 1, laserCd: 0 };
    expect(chooseAction(ready)).toBe('laser');
    expect(chooseAction({ ...ready, laserCd: 0.1 })).toBe('walk');
    expect(chooseAction({ ...ready, engaged: false })).toBe('walk');
    expect(chooseAction({ ...ready, dist: M.laserRange + 1 })).toBe('walk');
  });

  it('ranks the laser below melee and the dash, above the barrage and rockets', () => {
    const ready = { ...idle, dist: M.laserRange - 1, laserCd: 0 };
    expect(chooseAction({ ...ready, dist: contact, meleeCd: 0, roll: 0.9 })).toBe('punch');
    expect(M.laserRange).toBeLessThan(M.dashTrigger);
    expect(chooseAction({ ...ready, dist: M.dashTrigger + 1, dashCd: 0 })).toBe('dash');
    expect(chooseAction({ ...ready, barrageCd: 0, rocketCd: 0 })).toBe('laser');
  });

  it('dashes when far and ready', () => {
    expect(chooseAction({ ...idle, dist: M.dashTrigger + 1, dashCd: 0 })).toBe('dash');
  });

  it('never dashes from inside where a dash stops', () => {
    const big = M.dashTrigger - M.stopGap;
    expect(chooseAction({ ...idle, dist: M.dashTrigger + 1, dashCd: 0, contact: big })).toBe('walk');
    expect(chooseAction({ ...idle, dist: big + M.stopGap + M.dashStopShort + 1, dashCd: 0, contact: big })).toBe('dash');
  });

  it('never dashes on cooldown', () => {
    expect(chooseAction({ ...idle, dist: M.dashTrigger + 1, dashCd: 0.1 })).toBe('walk');
  });

  it('never dashes before engaged', () => {
    expect(chooseAction({ ...idle, dist: M.dashTrigger + 1, dashCd: 0, engaged: false })).toBe('walk');
  });

  it('punches or slams in reach by roll', () => {
    const near = { ...idle, dist: contact + M.punchReach - 1, meleeCd: 0 };
    expect(chooseAction({ ...near, roll: 0.2 })).toBe('slam');
    expect(chooseAction({ ...near, roll: 0.9 })).toBe('punch');
    // Reach is measured past contact: a bigger monster is punched from further off.
    expect(chooseAction({ ...near, dist: contact + M.punchReach + 1 })).toBe('walk');
    expect(chooseAction({ ...near, dist: contact + M.punchReach + 1, contact: contact + 10 })).toBe('punch');
  });

  it('barrage before rockets when both ready', () => {
    expect(chooseAction({ ...idle, barrageCd: 0, rocketCd: 0 })).toBe('barrage');
    expect(chooseAction({ ...idle, rocketCd: 0 })).toBe('rockets');
    expect(chooseAction({ ...idle, rocketCd: 0, dist: M.rocketRange + 1 })).toBe('walk');
  });

  describe('evades', () => {
    const near: MechMind = { ...idle, dist: contact + M.punchReach - 1, evadeCd: 0 };
    const hop = M.evadeChance * M.hopChance;

    it('hops back or sidesteps by the evade roll, in reach with melee cooling down', () => {
      expect(chooseAction({ ...near, evadeRoll: hop - 0.01 })).toBe('hopback');
      expect(chooseAction({ ...near, evadeRoll: hop + 0.01 })).toBe('sidestep');
    });

    it('needs the evade roll under evadeChance', () => {
      expect(chooseAction({ ...near, evadeRoll: M.evadeChance })).toBe('walk');
      expect(chooseAction(near)).toBe('walk');
    });

    it('waits out evadeCooldown', () => {
      expect(chooseAction({ ...near, evadeRoll: 0, evadeCd: 0.1 })).toBe('walk');
    });

    it('needs the monster in melee reach', () => {
      expect(chooseAction({ ...near, evadeRoll: 0, dist: contact + M.punchReach + 1 })).toBe('walk');
    });

    it('never evades before engaged', () => {
      expect(chooseAction({ ...near, evadeRoll: 0, engaged: false })).toBe('walk');
    });

    it('never evades when melee is ready', () => {
      expect(chooseAction({ ...near, evadeRoll: 0, meleeCd: 0, roll: 0.9 })).toBe('punch');
    });
  });

  it('walks when nothing is ready', () => {
    expect(chooseAction(idle)).toBe('walk');
    expect(chooseAction({ ...idle, dist: 10 })).toBe('walk');
  });

  it('movePhase follows windup, strike, recover, done', () => {
    const p = M.moves.punch;
    const e = 0.01;
    expect(movePhase('punch', 0)).toBe('windup');
    expect(movePhase('punch', p.windup - e)).toBe('windup');
    expect(movePhase('punch', p.windup + e)).toBe('strike');
    expect(movePhase('punch', p.windup + p.strike - e)).toBe('strike');
    expect(movePhase('punch', p.windup + p.strike + e)).toBe('recover');
    expect(movePhase('punch', p.windup + p.strike + p.recover - e)).toBe('recover');
    expect(movePhase('punch', p.windup + p.strike + p.recover + e)).toBe('done');
  });

  it('punchHits needs reach and facing', () => {
    const mech = { x: 0, z: 0 };
    const reach = M.radius + 50 + M.punchReach;
    // Facing +Z (yaw 0), against a monster of radius 50.
    expect(punchHits(mech, 0, { x: 0, z: reach - 10 }, 50)).toBe(true);
    expect(punchHits(mech, 0, { x: 0, z: reach + 10 }, 50)).toBe(false);
    expect(punchHits(mech, 0, { x: 0, z: -100 }, 50)).toBe(false);
    expect(punchHits(mech, Math.PI / 2, { x: 100, z: 0 }, 50)).toBe(true);
    // Off to the side, beyond punchArc.
    expect(punchHits(mech, 0, { x: 100, z: 20 }, 50)).toBe(false);
  });

  it('slamHits is radial', () => {
    const mech = { x: 10, z: 10 };
    for (const a of [0, 1, 2, 3, 4, 5]) {
      const r = M.radius + M.slamRadius + 40;
      expect(slamHits(mech, { x: 10 + Math.sin(a) * r, z: 10 + Math.cos(a) * r }, 50)).toBe(true);
      const far = M.radius + M.slamRadius + 60;
      expect(slamHits(mech, { x: 10 + Math.sin(a) * far, z: 10 + Math.cos(a) * far }, 50)).toBe(false);
    }
  });
});

describe('laserPhase', () => {
  it('runs charge, aim, lock, fire, recover, done', () => {
    let t = 0.01;
    expect(laserPhase(t)).toBe('charge');
    expect(laserPhase((t += M.laserCharge))).toBe('aim');
    expect(laserPhase((t += M.laserAim))).toBe('lock');
    expect(laserPhase((t += M.laserLock))).toBe('fire');
    expect(laserPhase((t += M.laserFire))).toBe('recover');
    expect(laserPhase((t += M.laserRecover))).toBe('done');
  });
});
