import { CONFIG } from '../../config';
import type { LandformDetail, LandformSpec, OutlinePt, Pt } from '../types';
import { ellipse, ribbon } from '../../world/landforms';

/**
 * Toronto's waterfront scenery, traced from the real geography (game metres, about 5.4 m per pixel of the owner's
 * reference map, scaled by the game's Rogers Centre and Scotiabank Arena). It is drawn over the lake and plays no
 * part in gameplay.
 */
const P = CONFIG.palette;
const COTTAGES = [P.cottage1, P.cottage2, P.cottage3, P.cottage4] as const;

/** A flat strip from a to b, `width` across (paths, runways, markings). */
function strip(a: Pt, b: Pt, width: number, h: number, color: number, y = 0): LandformDetail {
  return { kind: 'box', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: width, d: Math.hypot(b.x - a.x, b.z - a.z), h, yaw: Math.atan2(b.x - a.x, b.z - a.z), color, y };
}

/** The airport runway's ends: 1,050 m along the island's long axis, turned 14° from east. */
const RUNWAY_A = { x: -1850 - 509, z: 2580 - 127 };
const RUNWAY_B = { x: -1850 + 509, z: 2580 + 127 };

/** Ten white centre-line dashes along the runway. */
const RUNWAY_DASHES: LandformDetail[] = Array.from({ length: 10 }, (_, k) => {
  const t0 = (k + 0.25) / 10;
  const t1 = (k + 0.6) / 10;
  const at = (t: number) => ({ x: RUNWAY_A.x + (RUNWAY_B.x - RUNWAY_A.x) * t, z: RUNWAY_A.z + (RUNWAY_B.z - RUNWAY_A.z) * t });
  return strip(at(t0), at(t1), 3, 0.4, P.landMarking);
});

/** 25 cottages in two rows along Ward's and Algonquin's east arm. */
const COTTAGE_DETAILS: LandformDetail[] = (() => {
  const a = { x: 650, z: 4280 };
  const b = { x: 1350, z: 3990 };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / len;
  const uz = (b.z - a.z) / len;
  const yaw = Math.atan2(ux, uz);
  return Array.from({ length: 25 }, (_, k) => {
    const row = k < 13 ? -1 : 1;
    const i = k < 13 ? k : k - 13;
    const t = (i + 0.5) / (row < 0 ? 13 : 12);
    const off = 70 * row;
    return { kind: 'box', x: a.x + ux * len * t - uz * off, z: a.z + uz * len * t + ux * off, w: 10, d: 8, h: 7, yaw, color: COTTAGES[k % COTTAGES.length]! } as LandformDetail;
  });
})();

/** The Toronto Islands crescent, from the airport's northwest corner clockwise. Beaches: 60 m on Hanlan's lake shore, 50 m on Centre's south shore. */
const ISLAND_OUTLINE: OutlinePt[] = [
  { x: -2483, z: 2360 }, { x: -1457, z: 2360 }, { x: -1106, z: 2520 }, { x: -1187, z: 2844 }, { x: -1133, z: 3168 },
  { x: -485, z: 3762 }, { x: 55, z: 4194 }, { x: 703, z: 3978 }, { x: 1297, z: 3708 }, { x: 1459, z: 3654 },
  { x: 1648, z: 3978 }, { x: 1621, z: 4194 },
  { x: 1135, z: 4437, beach: 50 }, { x: 379, z: 4653, beach: 50 }, { x: -701, z: 4815, beach: 50 }, { x: -1673, z: 4788, beach: 50 },
  { x: -2105, z: 4572, beach: 60 }, { x: -2375, z: 3708, beach: 60 }, { x: -2618, z: 2898, beach: 60 },
];

export const ISLANDS: LandformSpec = {
  name: 'Toronto Islands',
  outline: ISLAND_OUTLINE,
  holes: [
    // Blockhouse Bay, inside the crescent along its inner shore.
    ellipse(-250, 4300, 380, 150, 38),
    ribbon([{ x: -1950, z: 3200 }, { x: -1800, z: 3500 }, { x: -1800, z: 3900 }, { x: -1650, z: 4300 }], 80),
    ribbon([{ x: -1500, z: 3500 }, { x: -1300, z: 3700 }, { x: -1000, z: 3900 }, { x: -800, z: 4150 }], 70),
  ],
  beach: 40,
  treeEvery: 1500,
  details: [
    // Billy Bishop airport: the apron, the runway and its dashes, the terminal.
    { kind: 'box', x: -1900, z: 2760, w: 500, d: 260, h: 0.2, yaw: 0, color: P.landPath },
    strip(RUNWAY_A, RUNWAY_B, 70, 0.3, P.landRunway),
    ...RUNWAY_DASHES,
    { kind: 'box', x: -1950, z: 2700, w: 120, d: 60, h: 18, yaw: 0, color: P.landTerminal, y: 0.2 },
    // Gibraltar Point lighthouse, near the southwest corner.
    { kind: 'tower', x: -1950, z: 4560, r: 5, h: 25, color: P.lighthouseWhite, cap: P.lighthouseWhite },
    // Centre Island's pier, running south from the beach into the lake.
    { kind: 'box', x: -700, z: 4880, w: 12, d: 160, h: 2, yaw: 0, color: P.landPath, water: true },
    // The ferry dock on the harbour side near Ward's tip.
    { kind: 'box', x: 1380, z: 3640, w: 60, d: 15, h: 2, yaw: 0, color: P.landPath, water: true },
    ...COTTAGE_DETAILS,
  ],
};

const LESLIE_SHORE = { x: 4699, z: 2150 };
const CAUSEWAY_KNEE = { x: 4699, z: 3168 };
const CAUSEWAY_END = { x: 3727, z: 4788 };

/** The spit's causeway: down Leslie St from the shore, then diagonally southwest to the lobes, a pale path along it. */
export const SPIT_CAUSEWAY: LandformSpec = {
  name: 'Tommy Thompson Park causeway',
  outline: ribbon([LESLIE_SHORE, CAUSEWAY_KNEE, CAUSEWAY_END], 110),
  sharp: true,
  holes: [],
  beach: 20,
  treeEvery: 6000,
  details: [strip({ x: 4699, z: 2250 }, CAUSEWAY_KNEE, 12, 0.3, P.landPath), strip(CAUSEWAY_KNEE, { x: 3760, z: 4730 }, 12, 0.3, P.landPath)],
};

/** The spit's lobes, wrapping the Outer Harbour, with their two lagoons and the lighthouse at the southern tip. */
export const SPIT_LOBES: LandformSpec = {
  name: 'Tommy Thompson Park lobes',
  outline: [
    CAUSEWAY_END, { x: 3600, z: 5200 }, { x: 3300, z: 5700 }, { x: 2809, z: 6408 }, { x: 2323, z: 5868 }, { x: 1675, z: 6030 },
    { x: 1243, z: 6084 }, { x: 1135, z: 5868 }, { x: 1513, z: 5328 }, { x: 2107, z: 4788 }, { x: 2485, z: 4680 }, { x: 3025, z: 4788 },
  ],
  holes: [ellipse(2647, 5220, 330, 190, 0), ellipse(2000, 5700, 260, 150, 0)],
  beach: 20,
  treeEvery: 1500,
  details: [{ kind: 'tower', x: 2809, z: 6250, r: 4, h: 18, color: P.lighthouseWhite, cap: P.lighthouseRed }],
};

/** The arm back north toward the Outer Harbour marina, leaving the harbour mouth. */
export const SPIT_ARM: LandformSpec = {
  name: 'Tommy Thompson Park arm',
  outline: ribbon([{ x: 3025, z: 4788 }, { x: 3295, z: 4572 }, { x: 3420, z: 4260 }], 50),
  sharp: true,
  holes: [],
  beach: 10,
  treeEvery: 6000,
  details: [],
};

export const TORONTO_LANDFORMS: readonly LandformSpec[] = [ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM];
