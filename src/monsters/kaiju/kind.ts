import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { KaijuBody } from './KaijuBody';

const K = CONFIG.kaiju;

export const KAIJU: MonsterKind = {
  id: 'kaiju',
  name: 'Reptile Kaiju',
  blurb: 'Walking extinction. Armoured, unstoppable, breathes plasma.',
  pips: { toughness: 4, power: 4, speed: 3 },
  moves: [
    { label: 'Claw Rake' },
    { label: 'Plasma Breath' },
    { label: 'Snap Bite' },
    { label: 'Tail Sweep' },
  ],
  stats: K.stats,
  melee: { kind: 'arc', halfAngle: K.rakeHalfAngle },
  ranged: 'breath',
  antiAir: 'bite',
  tailSweep: true,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'meltdown'],
  abilityText: {
    acid: { desc: (r) => (r === 1 ? 'Steps leave glowing radioactive pools' : 'Bigger, longer-lasting pools') },
    storm: { desc: (r) => (r === 1 ? 'Plates fire homing plasma every 6s' : '+3 bolts, fires faster') },
    chitin: { desc: () => '+15% chance to deflect hits' },
    frenzy: { desc: () => '+6 HP per kill' },
    spines: { desc: (r) => (r === 1 ? 'Plates zap incoming shells and missiles' : 'Faster, wider zapping') },
    swat: { desc: () => 'Bites flyers faster, harder, more at once' },
    nova: { desc: (r) => (r === 1 ? 'Heat shockwave pulse every 7s' : 'Bigger, stronger, more frequent pulses') },
    meltdown: { desc: (r) => (r === 1 ? 'Below 30% HP: +50% damage, breath recharges 2x' : 'Kicks in at higher HP') },
    mortar: { desc: (r) => (r === 1 ? 'Lobs plasma at artillery, SAMs, trucks' : 'More globs, bigger splash') },
  },
  upgradeText: {
    stompRadius: { desc: '+20% claw rake reach' },
    multiShot: { desc: 'Breath fires +1 extra beam' },
  },
  fx: { spike: K.colors.plasma, glob: K.colors.plasma, pool: 0x4fd8ff, nova: K.colors.ember, particle: 'plasma', intercept: 'spark' },
  createBody: () => new KaijuBody(),
};
