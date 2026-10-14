import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { GolemBody } from './GolemBody';
import { WENDIGO_SWAT } from './handMath';

const G = CONFIG.golem;

/** The Wendigo (internally `golem`): a starved folklore horror of black magic, death and decay. */
export const GOLEM: MonsterKind = {
  id: 'golem',
  name: 'Wendigo',
  blurb: 'A starved thing from the deep woods. Every kill only makes it hungrier.',
  pips: { toughness: 5, power: 4, speed: 2 },
  moves: [
    { label: 'Rending Claws' },
    { label: 'Dread Gaze' },
    { label: 'Shadow Hands' },
  ],
  stats: G.stats,
  melee: { kind: 'fist' },
  ranged: 'gaze',
  antiAir: 'hands',
  swatTiming: WENDIGO_SWAT,
  leapCrouch: 0.2,
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'core'],
  abilityText: {
    acid: { desc: (r) => (r === 1 ? 'Claws and hooves leave patches of black fire' : 'Wider, longer-lasting black fire') },
    storm: { desc: (r) => (r === 1 ? 'Ghosts rise off it and hunt every 6s' : '+3 ghosts, they hunt more often') },
    chitin: { desc: () => '+15% chance to deflect hits' },
    frenzy: { desc: () => '+6 HP per kill' },
    spines: { desc: (r) => (r === 1 ? 'Bone shards shoot down incoming shells and missiles' : 'Faster, wider defense') },
    swat: { desc: () => 'More hands drag down flyers, faster and harder' },
    nova: { desc: (r) => (r === 1 ? 'Claws slam out a ring of rot every 7s' : 'Wider, deadlier, more frequent rings') },
    mortar: { desc: (r) => (r === 1 ? 'Its glance sets artillery, SAMs, trucks alight with black fire' : 'More victims, wider black fire') },
    core: { desc: (r) => (r === 1 ? 'Wounds feed its hunger: more damage, and a withering aura when starved' : 'Deeper hunger: more damage, wider aura') },
  },
  upgradeText: {
    stompRadius: { desc: '+20% claw and stomp radius' },
    multiShot: { desc: '+1 gaze victim per volley' },
  },
  fx: {
    spike: G.colors.ghost,
    glob: G.colors.hexfire,
    pool: G.colors.hexPool,
    poolOpacity: 0.8,
    poolLift: true,
    nova: G.colors.shade,
    particle: 'rot',
    intercept: 'bone',
    stormShot: 'wisp',
    mortarGaze: true,
    shards: G.colors.boneShard,
  },
  createBody: () => new GolemBody(),
};
