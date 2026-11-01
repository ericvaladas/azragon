import { CONFIG } from '../../config';
import { STRIKE_TIMES } from '../../monster/strike';
import { TAIL_SWING_TIMES } from '../../monster/tailSwat';
import type { MonsterKind } from '../types';
import { InsectBody } from './InsectBody';

const M = CONFIG.monster;
const P = CONFIG.palette;

export const INSECT: MonsterKind = {
  id: 'insect',
  name: 'Insect Titan',
  blurb: 'Six-legged hive horror. Fast, venomous, relentless.',
  pips: { toughness: 3, power: 3, speed: 4 },
  moves: [
    { label: 'Leg Strike' },
    { label: 'Stinger Spikes' },
  ],
  stats: {
    maxHp: M.maxHp,
    moveSpeed: M.moveSpeed,
    turnRate: M.turnRate,
    damageMult: 1,
    strideLength: M.strideLength,
    bodyRadius: M.bodyRadius,
    footRadius: M.footRadius,
    footDamage: M.footDamage,
    meleeRange: M.meleeRange,
    meleeRadius: M.meleeRadius,
    meleeDamage: M.meleeDamage,
    meleeCooldown: M.meleeCooldown,
    meleeTiming: { windup: M.meleeWindup, impact: M.meleeWindup + STRIKE_TIMES.strike, end: M.meleeWindup + STRIKE_TIMES.recover },
    rangedRange: M.spikeRange,
    rangedDamage: M.spikeDamage,
    rangedCooldown: M.spikeCooldown,
    headHeight: CONFIG.passives.swat.headHeight,
    size: { width: 484, length: 451, height: 344 },
  },
  melee: { kind: 'point' },
  ranged: 'spikes',
  ultimate: { id: 'spikeRain', label: 'Spike Rain' },
  antiAir: 'tail',
  tailSweep: false,
  signatures: ['storm', 'chitin', 'spines', 'swat', 'nova', 'mortar'],
  builtInSwat: true,
  swatTiming: TAIL_SWING_TIMES,
  abilityText: {
    swat: { desc: (r) => (r === 1 ? 'Tail spikes can shoot aircraft' : 'Spikes hit aircraft harder and faster') },
  },
  upgradeText: {},
  fx: { spike: P.stinger, glob: P.acid, pool: P.acid, nova: P.acid, particle: 'acid', intercept: 'spark', spikeTrail: false },
  leapCrouch: 0.2,
  createBody: () => new InsectBody(),
};
