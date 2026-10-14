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
  dashSpeed: 0.7,
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'core'],
  abilityText: {
    acid: { title: 'Blighted Tracks', desc: (r) => (r === 1 ? 'Claws and hooves leave patches of black fire' : 'Wider, longer-lasting black fire') },
    storm: { title: 'Hungry Ghosts', desc: (r) => (r === 1 ? 'Ghosts rise off it and hunt every 6s' : '+3 ghosts, they hunt more often') },
    chitin: { title: 'Gaunt Hide', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Insatiable', desc: () => '+6 HP per kill' },
    spines: { title: 'Bone Ward', desc: (r) => (r === 1 ? 'Bone shards shoot down incoming shells and missiles' : 'Faster, wider bone ward') },
    swat: { title: 'Shadow Hands+', desc: () => 'More hands drag down flyers, faster and harder' },
    nova: { title: 'Withering Ring', desc: (r) => (r === 1 ? 'Claws slam out a ring of rot every 7s' : 'Wider, deadlier, more frequent rings') },
    mortar: { title: 'Evil Eye', desc: (r) => (r === 1 ? 'Its glance sets artillery, SAMs, trucks alight with black fire' : 'More victims, wider black fire') },
    core: { title: 'Ravenous Hunger', desc: (r) => (r === 1 ? 'Wounds feed its hunger: more damage, and a withering aura when starved' : 'Deeper hunger: more damage, wider aura') },
  },
  upgradeText: {
    damage: { title: 'Bloodlust' },
    attackSpeed: { title: 'Frenzy' },
    vitality: { title: 'Undying' },
    regen: { title: 'Feast' },
    stompRadius: { title: 'Tremor', desc: '+20% claw and stomp radius' },
    multiShot: { title: 'Twin Curse', desc: '+1 Dread Gaze victim per volley' },
    moveSpeed: { title: "Stalker's Pace" },
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
