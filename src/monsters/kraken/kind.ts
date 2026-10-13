import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { KrakenBody } from './KrakenBody';

const K = CONFIG.kraken;

export const KRAKEN: MonsterKind = {
  id: 'kraken',
  name: 'Kraken',
  blurb: 'Hauls itself through the streets on eight grasping arms. Hits everything, everywhere.',
  pips: { toughness: 3, power: 4, speed: 3 },
  moves: [
    { icon: '🐙', label: 'Tentacle Slam' },
    { icon: '🪨', label: 'Hurl' },
    { icon: '🪢', label: 'Tentacle Lash' },
  ],
  stats: K.stats,
  melee: { kind: 'multi' },
  ranged: 'hurl',
  antiAir: 'lash',
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'grip'],
  abilityText: {
    acid: { title: 'Ink Trail', icon: '🖤', desc: (r) => (r === 1 ? 'Planted arms leave corrosive ink slicks' : 'Bigger, longer-lasting slicks') },
    storm: { title: 'Barrage', icon: '🪨', desc: (r) => (r === 1 ? 'Every free arm hurls debris every 6s' : '+3 chunks, throws faster') },
    chitin: { title: 'Thick Hide', icon: '🛡️', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Devour', icon: '🍖', desc: () => '+6 HP per kill' },
    spines: { title: 'Ink Cloud', icon: '🌫️', desc: (r) => (r === 1 ? 'Ink smothers incoming shells and missiles' : 'Thicker, wider ink') },
    swat: { title: 'Lash+', icon: '🪢', desc: () => 'Lashes flyers faster, harder, more at once' },
    nova: { title: 'Whirlpool', icon: '🌀', desc: (r) => (r === 1 ? 'All arms spin out every 7s, hitting everything near' : 'Wider, stronger, more often') },
    mortar: { title: 'Deep Throw', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs chunks at artillery, SAMs, trucks' : 'More chunks, bigger splash') },
    grip: { title: 'Sucker Grip', icon: '🐙', desc: (r) => (r === 1 ? 'Planted arms crush an enemy beside them' : 'Wider, harder grip') },
  },
  upgradeText: {
    damage: { title: 'Crushing Coils' },
    attackSpeed: { title: 'Frenzied Arms' },
    vitality: { title: 'Leviathan Bulk' },
    regen: { title: 'Regrowth' },
    stompRadius: { title: 'Wide Grip', desc: '+20% slam radius' },
    multiShot: { title: 'More Arms', desc: '+1 hurled chunk per throw' },
    moveSpeed: { title: 'Undertow' },
  },
  fx: { spike: K.colors.chunk, glob: K.colors.ink, pool: K.colors.ink, nova: 0x6a3a8a, particle: 'ink', intercept: 'ink' },
  createBody: () => new KrakenBody(),
};
