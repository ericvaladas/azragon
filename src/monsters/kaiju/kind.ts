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
    acid: { title: 'Radiant Wake', desc: (r) => (r === 1 ? 'Steps leave glowing radioactive pools' : 'Bigger, longer-lasting pools') },
    storm: { title: 'Plate Barrage', desc: (r) => (r === 1 ? 'Plates fire homing plasma every 6s' : '+3 bolts, fires faster') },
    chitin: { title: 'Scale Armor', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Primal Hunger', desc: () => '+6 HP per kill' },
    spines: { title: 'Thermal Plates', desc: (r) => (r === 1 ? 'Plates zap incoming shells and missiles' : 'Faster, wider zapping') },
    swat: { title: 'Snap Bite+', desc: () => 'Bites flyers faster, harder, more at once' },
    nova: { title: 'Heat Pulse', desc: (r) => (r === 1 ? 'Heat shockwave pulse every 7s' : 'Bigger, stronger, more frequent pulses') },
    meltdown: { title: 'Meltdown', desc: (r) => (r === 1 ? 'Below 30% HP: +50% damage, breath recharges 2x' : 'Meltdown kicks in at higher HP') },
    mortar: { title: 'Plasma Lob', desc: (r) => (r === 1 ? 'Lobs plasma at artillery, SAMs, trucks' : 'More globs, bigger splash') },
  },
  upgradeText: {
    damage: { title: 'Atomic Fury' },
    attackSpeed: { title: 'Rapid Breath' },
    vitality: { title: 'Ironscale Hide' },
    regen: { title: 'Rad Regeneration' },
    stompRadius: { title: 'Earthshaker', desc: '+20% claw rake reach' },
    multiShot: { title: 'Wide Sweep', desc: 'Breath fires +1 extra beam' },
    moveSpeed: { title: 'Long Stride' },
  },
  fx: { spike: K.colors.plasma, glob: K.colors.plasma, pool: 0x4fd8ff, nova: K.colors.ember, particle: 'plasma', intercept: 'spark' },
  createBody: () => new KaijuBody(),
};
