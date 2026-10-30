import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { WendigoBody } from './WendigoBody';
import { WENDIGO_SWAT } from './handMath';

const G = CONFIG.wendigo;

/** The Wendigo (internally `wendigo`): a starved folklore horror of black magic, death and decay. */
export const WENDIGO: MonsterKind = {
  id: 'wendigo',
  name: 'Wendigo',
  blurb: 'A starved thing from the deep woods. Every kill only makes it hungrier.',
  pips: { toughness: 5, power: 4, speed: 2 },
  moves: [
    { label: 'Rending Claws' },
    { label: 'Dread Gaze' },
  ],
  stats: G.stats,
  melee: { kind: 'fist' },
  ranged: 'gaze',
  antiAir: 'hands',
  swatTiming: WENDIGO_SWAT,
  leapCrouch: 0.2,
  tailSweep: false,
  ultimate: { label: 'Devour' },
  signatures: ['storm', 'chitin', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {
    storm: { desc: (r) => (r === 1 ? 'Ghosts rise off it and hunt every 8s' : '+2 ghosts, they hunt more often') },
    chitin: { desc: () => '+15% chance to deflect hits' },
    spines: { desc: (r) => (r === 1 ? 'Bone shards shoot down incoming shells and missiles' : 'Faster, wider defense') },
    swat: { desc: (r) => (r === 1 ? 'Shadow Hands drag down nearby flyers' : 'More hands drag down flyers, faster and harder') },
    nova: { desc: (r) => (r === 1 ? 'Claws slam out a ring of rot every 7s' : 'Wider, deadlier, more frequent rings') },
    mortar: { desc: (r) => (r === 1 ? 'Its glance sets artillery, SAMs, trucks alight with black fire' : 'More victims, wider black fire') },
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
  createBody: () => new WendigoBody(),
};
