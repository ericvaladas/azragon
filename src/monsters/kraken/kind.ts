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
    { label: 'Tentacle Slam' },
    { label: 'Hurl' },
    { label: 'Tentacle Lash' },
  ],
  stats: K.stats,
  melee: { kind: 'multi' },
  ranged: 'hurl',
  antiAir: 'lash',
  tailSweep: false,
  /** Ink Cloud fires about a third as often as Spine Shield. */
  interceptRate: 1 / 3,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'grip'],
  abilityText: {
    acid: { desc: (r) => (r === 1 ? 'Planted arms leave corrosive ink slicks' : 'Bigger, longer-lasting slicks') },
    storm: { desc: (r) => (r === 1 ? 'Every free arm hurls debris every 6s' : '+3 chunks, throws faster') },
    chitin: { desc: () => '+15% chance to deflect hits' },
    frenzy: { desc: () => '+6 HP per kill' },
    spines: { desc: (r) => (r === 1 ? 'Ink smothers incoming shells and missiles' : 'Thicker, wider ink') },
    swat: { desc: () => 'Lashes flyers faster, harder, more at once' },
    nova: { desc: (r) => (r === 1 ? 'All arms spin out every 7s, hitting everything near' : 'Wider, stronger, more often') },
    mortar: { desc: (r) => (r === 1 ? 'Lobs chunks at artillery, SAMs, trucks' : 'More chunks, bigger splash') },
    grip: { desc: (r) => (r === 1 ? 'Planted arms crush an enemy beside them' : 'Wider, harder grip') },
  },
  upgradeText: {
    stompRadius: { desc: '+20% slam radius' },
    multiShot: { desc: '+1 hurled chunk per throw' },
  },
  fx: { spike: K.colors.chunk, glob: K.colors.ink, pool: K.colors.ink, nova: 0x6a3a8a, particle: 'ink', intercept: 'ink', inkJet: true },
  createBody: () => new KrakenBody(),
};
