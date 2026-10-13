import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { GolemBody } from './GolemBody';

const G = CONFIG.golem;

export const GOLEM: MonsterKind = {
  id: 'golem',
  name: 'Magma Golem',
  blurb: 'A mountain with a furnace for a heart. Slow, crushing, and it only gets hotter.',
  pips: { toughness: 5, power: 4, speed: 2 },
  moves: [
    { icon: '👊', label: 'Molten Fist' },
    { icon: '🌋', label: 'Magma Lob' },
    { icon: '♨️', label: 'Vent Burst' },
  ],
  stats: G.stats,
  melee: { kind: 'fist' },
  ranged: 'lob',
  antiAir: 'geyser',
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'core'],
  abilityText: {
    acid: { title: 'Lava Footprints', icon: '👣', desc: (r) => (r === 1 ? 'Fists and feet leave burning lava' : 'Bigger, longer-lasting lava') },
    storm: { title: 'Ember Storm', icon: '🌠', desc: (r) => (r === 1 ? 'Vents fire homing embers every 6s' : '+3 embers, fires faster') },
    chitin: { title: 'Basalt Skin', icon: '🪨', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Stoke the Fire', icon: '🔥', desc: () => '+6 HP per kill' },
    spines: { title: 'Vent Flak', icon: '💥', desc: (r) => (r === 1 ? 'Vents shoot down incoming shells and missiles' : 'Faster, wider flak') },
    swat: { title: 'Vent Burst+', icon: '♨️', desc: () => 'Geysers hit flyers faster, harder, more at once' },
    nova: { title: 'Eruption', icon: '🌋', desc: (r) => (r === 1 ? 'Fists slam out a magma ring every 7s' : 'Bigger, stronger, more frequent eruptions') },
    mortar: { title: 'Pyroclast', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs magma at artillery, SAMs, trucks' : 'More bombs, bigger splash') },
    core: { title: 'Molten Core', icon: '❤️‍🔥', desc: (r) => (r === 1 ? 'Hits heat your core: more damage, and a burning aura when hot' : 'Hotter core: more damage, wider aura') },
  },
  upgradeText: {
    damage: { title: 'Molten Fury' },
    attackSpeed: { title: 'Open Vents' },
    vitality: { title: 'Bedrock' },
    regen: { title: 'Reforge' },
    stompRadius: { title: 'Tremor', desc: '+20% fist and stomp radius' },
    multiShot: { title: 'Twin Vents', desc: '+1 magma bomb per volley' },
    moveSpeed: { title: 'Landslide' },
  },
  fx: { spike: G.colors.ember, glob: G.colors.magma, pool: G.colors.lava, nova: G.colors.magma, particle: 'magma', intercept: 'magma' },
  createBody: () => new GolemBody(),
};
