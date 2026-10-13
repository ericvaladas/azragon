/** Uniform scale of the monster model; world-space monster and camera distances below are multiplied by it. */
const MONSTER_SCALE = 0.6;

/** All tunable constants. World units are metres; times are seconds. */
export const CONFIG = {
  render: {
    pixelScale: 3,
    minInternalHeight: 180,
    shadowMapSize: 1024,
    shadowExtent: 900,
  },
  palette: {
    skyZenith: 0x6f9fd8,
    skyHorizon: 0xc4d6e0,
    fog: 0xc4d6e0,
    ground: 0x8fb46a,
    groundDark: 0x6f9a52,
    ochre: 0xc9b06a,
    road: 0x9a9184,
    roadLine: 0xd9d0b8,
    sun: 0xfff1d6,
    hemiSky: 0xcfe3ff,
    hemiGround: 0x6b5a3a,
    buildingFacades: [0xe8d9c4, 0xc9d6df, 0xe6c3b0, 0xd4dcc2, 0xbfb8d6],
    roof: 0x5d5a66,
    carapace: 0x7fd41e,
    carapaceDark: 0x4e8f12,
    joint: 0x7a2fa8,
    stinger: 0xe8ff6a,
    eye: 0xffe14d,
    tank: 0x6b7a3a,
    tankDark: 0x4a5528,
    jet: 0x4f5963,
    fire: 0xff8a1f,
    smoke: 0x4d4a48,
    dust: 0xcbb592,
    debris: 0x8a8378,
    chevron: 0xff3b2f,
    acid: 0x9bff3a,
    drone: 0x3b5d18,
    blimp: 0xe6e2da,
    samHatch: 0x2e3236,
    truck: 0xd2512b,
    laserFaint: 0xcfe8ff,
    laserCore: 0xf0ffff,
    scorch: 0x2a2620,
    truckDark: 0x3d3328,
    cable: 0x1d1f22,
    strike: 0xff3b2f,
    artillery: 0x5f6b45,
    samLauncher: 0xeceae2,
    samTube: 0xd8322a,
    samHazard: 0xf2c230,
    samHazardDark: 0x2b2b2b,
    missile: 0xf2f2ee,
    blimpTrim: 0xd8322a,
    blimpTrimDark: 0x5a1612,
  },
  fog: { near: 1200, far: 4600 },
  camera: {
    near: 5,
    far: 12000,
    baseVFovDeg: 60,
    maxHFovDeg: 82,
    defaultYaw: 0,
    defaultPitch: 0.72,
    minPitch: 0.12,
    maxPitch: 1.15,
    defaultDistance: 1500 * MONSTER_SCALE,
    minDistance: 900 * MONSTER_SCALE,
    maxDistance: 2400 * MONSTER_SCALE,
    shoulderHeight: 350 * MONSTER_SCALE,
    shoulderOffset: 0,
    lookAhead: 800 * MONSTER_SCALE,
    dragSensitivity: 0.006,
    wheelSensitivity: 0.8,
    shakeMaxOffset: 22,
    shakeDecay: 1.6,
  },
  input: { tapMaxMovePx: 10, tapMaxMs: 300, pickRadiusPx: 28, /** Wheel units per pixel of pinch. */ pinchSensitivity: 3.5 },
  world: {
    seed: 1337,
    /** City blocks per chunk side; chunks stream in around the monster. */
    chunkBlocks: 4,
    /** Chunks whose nearest point is within loadRadius are loaded; beyond unloadRadius they are dropped. loadRadius must exceed fog.far. */
    loadRadius: 4800,
    unloadRadius: 5600,
    chunksPerFrame: 3,
    maxBuildings: 7000,
    maxTrees: 3000,
    maxRubble: 2500,
    blockSize: 200,
    roadWidth: 36,
    /** Crater around the origin (the pod's impact site; the decal is half a block wider), sized to the cocoon. */
    clearRadius: 650,
    parkChance: 0.12,
    minBuildingH: 20,
    maxBuildingH: 120,
    groundExtent: 30000,
    buildingHpPerMetre: 1.5,
    /** EXP per building HP, rounded per building (min 1); 0.0365 is ~30% below the original 0.05 on average. */
    buildingExpPerHp: 0.0365,
    collapseTime: 1.4,
  },
  monster: {
    scale: MONSTER_SCALE,
    height: 550 * MONSTER_SCALE,
    maxHp: 1000,
    regenPerSec: 4,
    moveSpeed: 130,
    turnRate: 2.4,
    arriveRadius: 25 * MONSTER_SCALE,
    bodyRadius: 170 * MONSTER_SCALE,
    contactDps: 60,
    /** Each landed foot damages ground targets and buildings within footRadius. */
    footRadius: 45,
    footDamage: 120,
    /** In model units (before MONSTER_SCALE). */
    strideLength: 260,
    /** Leg-strike reach from the monster's root. */
    meleeRange: 480,
    meleeRadius: 170 * MONSTER_SCALE,
    meleeDamage: 60,
    meleeCooldown: 0.7,
    meleeWindup: 0.3,
    spikeRange: 1700,
    spikeDamage: 45,
    spikeCooldown: 1.0,
    spikeSpeed: 1100,
    spikeSpreadRad: 0.12,
    deathTime: 2.2,
  },
  /** Reptile Kaiju. Stats feed its MonsterKind; breath tunes Plasma Breath; colours its body and effects. */
  kaiju: {
    stats: {
      maxHp: 1250,
      moveSpeed: 140,
      turnRate: 1.9,
      damageMult: 1.15,
      strideLength: 300,
      bodyRadius: 140 * MONSTER_SCALE,
      footRadius: 70,
      footDamage: 150,
      meleeRange: 420,
      meleeRadius: 0,
      meleeDamage: 75,
      meleeCooldown: 0.9,
      meleeTiming: { windup: 0.25, impact: 0.4, end: 0.8 },
      rangedRange: 1300,
      rangedDamage: 70,
      rangedCooldown: 2.2,
      headHeight: 560,
      /** Measured standing bounding box (world m) — re-measure in Step 6 after any model change. */
      size: { width: 180, length: 617, height: 385 },
    },
    /**
     * Neck aiming for Plasma Breath: reach either side of the body (rad), turn speed (rad/s), how close the
     * head must be to fire (rad), and how long a charged breath waits for the head before giving up (s).
     */
    neck: { limit: 1.6, turnRate: 3.5, aimTolerance: 0.1, maxWait: 1.2 },
    /**
     * Tail Sweep (auto): hits ground targets beside/behind within `reach`, chosen within `rearHalf` (rad) of
     * straight behind; damage lands in a wedge of ±`hitHalf` toward the target. Buildings take buildingMult×.
     */
    tail: { reach: 520, rearHalf: 1.9, hitHalf: 0.8, damage: 90, buildingMult: 3, cooldown: 2.0, timing: { windup: 0.25, impact: 0.45, end: 1.0 } },
    /** Claw Rake: half-angle (rad) of the forward arc. */
    rakeHalfAngle: 0.9,
    /** Plasma Breath: charge (s), beam on-screen time (s), beam half-width (m), visual sweep (rad), fan per extra beam (rad), beam cap, building damage per hit. */
    breath: { charge: 0.4, show: 0.35, halfWidth: 45, sweep: 0.1, fan: 0.12, maxLines: 4, buildingDamage: 120 },
    colors: {
      scale: 0x3f5f48,
      scaleDark: 0x2b4234,
      belly: 0x9aa883,
      claw: 0xe6e0cc,
      plate: 0x6ff6ff,
      eye: 0xa8fdff,
      plasma: 0x6ff6ff,
      ember: 0xff9a3c,
    },
  },
  /** The Kraken. Stats feed its MonsterKind; arms tune the tentacles; colours its body and effects. */
  kraken: {
    stats: {
      maxHp: 1100,
      moveSpeed: 125,
      turnRate: 2.0,
      damageMult: 1.1,
      /** One crawl cycle covers this many model units (each front arm pulls the mantle half of it). */
      strideLength: 320,
      bodyRadius: 150 * MONSTER_SCALE,
      footRadius: 60,
      footDamage: 120,
      /** Slam reach (world m) — also the brain's melee range for attack orders. */
      meleeRange: 400,
      meleeRadius: 90,
      meleeDamage: 70,
      meleeCooldown: 1.4,
      meleeTiming: { windup: 0.3, impact: 0.45, end: 0.85 },
      rangedRange: 1400,
      rangedDamage: 85,
      rangedCooldown: 1.8,
      headHeight: 420,
      /** Measured standing bounding box (world m), resting arms included. */
      size: { width: 689, length: 661, height: 369 },
    },
    arms: {
      /** Hurl: seconds to grab, release (throw), end; chunk splash radius (m), flight time (s), arc height (m). */
      hurl: { timing: { windup: 0.35, impact: 0.55, end: 0.9 }, splash: 110, flight: 1.3, arc: 500 },
      /** Whirlpool arm swing duration (s): wind left, lash right, settle. */
      spinTime: 1.3,
    },
    colors: {
      mantle: 0x7a2348,
      mantleDark: 0x4a1430,
      underside: 0xe0a6a0,
      eye: 0xffb320,
      ink: 0x2a1838,
      chunk: 0x8a8378,
    },
  },
  artillery: {
    hp: 120, exp: 20, size: 40, guns: 3, gunSpacing: 70, distMin: 2500, distMax: 3500,
    salvoEvery: 6, fillTime: 3.2, shellFlight: 1.8, shellArc: 750, radius: 90, damage: 60, buildingDamage: 200, spread: 260,
    baseSalvo: 3, levelsPerExtra: 3, maxSalvo: 8,
  },
  passives: {
    acid: { radius: 60, life: 3, radiusPerRank: 0.2, lifePerRank: 1, dps: 30 },
    storm: { interval: 6, intervalStep: 1, spikes: 6, extraSpikes: 3 },
    chitin: { perRank: 0.15 },
    frenzy: { perRank: 6 },
    brood: { interval: 10, drones: 3, extraDrones: 2, life: 8, speed: 450, damage: 40, hitCooldown: 0.5 },
    /** Overload: absorb the next beam/orbital hit and fire it back (truck destroyed; orbital = energy blast). */
    overload: { cooldown: [0, 20, 15, 11], blastRadius: 450, blastDamage: 250, reflectDamage: 400 },
    /** Arrays are indexed by rank (0 = not taken; Tail Swat rank 0 is the base kit). */
    spines: { rate: [0, 2, 3, 4.5], radius: [0, 500, 600, 700] },
    swat: { cooldown: [2.5, 2, 1.6, 1.3], range: [450, 500, 550, 600], damage: [120, 180, 240, 320], targets: [1, 2, 3, 4], headHeight: 380 },
    nova: { interval: [0, 7, 6, 5], radius: [0, 600, 700, 800], damage: [0, 80, 120, 170] },
    mortar: { interval: [0, 4, 3.5, 3], globs: [0, 2, 3, 4], splash: [0, 90, 110, 130], damage: 90, range: 1800, flightTime: 1.2, arc: 300 },
    bubble: { duration: [0, 3, 3.5, 4], cooldown: [0, 25, 21, 17] },
    reflect: { duration: [0, 4, 5, 6], cooldown: [0, 20, 17, 14], radius: 380, damage: 60 },
    /** Meltdown (Kaiju): below threshold[rank] of max HP, damage × damageMult and ranged cooldown × cooldownMult. */
    meltdown: { threshold: [0, 0.3, 0.4, 0.5], damageMult: 1.5, cooldownMult: 0.5 },
    /** Sucker Grip (Kraken): each plant crushes the nearest ground enemy within radius[rank] of the tip. */
    grip: { radius: [0, 140, 180, 220], damage: [0, 90, 140, 200] },
    /** Auto-shields trigger only when something is about to hit: projectiles or blimps within this range. */
    threatRange: 700,
    earlyAbilityPicks: 3,
  },
  abilities: {
    /** Cooldown multiplier by rank (Dash/Roar ranks come from level-up picks; Leap is always rank 1). */
    rankCooldown: [1, 1, 0.8, 0.65],
    dash: { cooldown: 10, range: 900, duration: 0.6, crushRadius: 95 },
    leap: { cooldown: 8, range: 1600, duration: 1.4, peak: 340, landRadius: 260, damage: 150 },
    roar: { cooldown: 20, radius: 600, duration: 1.2, damage: 120, buildingDamage: 300 },
  },
  laser: {
    trackTime: 2.5, lockTime: 0.8, fireTime: 1.5, cooldownMin: 20, cooldownMax: 30,
    trackSpeed: 80, startOffset: 150, radius: 110, dps: 220, buildingDps: 400, beamHeight: 4000, scorchLife: 10,
  },
  /** Laser Cannon Truck: deploys, tracks with a sight line, locks, then fires a beam along the locked line. */
  truck: { hp: 70, exp: 22, size: 110, speed: 45, range: 1200, deployTime: 0.8, aimTime: 2, lockTime: 1.2, fireTime: 1.2, cooldown: 5, beamWidth: 50, beamLength: 1700, hitRadius: 93, dps: 140, buildingDps: 300, aimHeight: 250 },
  sam: {
    hp: 260, exp: 30, size: 130, spawnMin: 600, spawnMax: 1400,
    riseTime: 1, upTime: 6, sinkTime: 1, downMin: 4, downMax: 6, fireDelay: 1.2,
    missiles: 4, missileSpeed: 300, missileTurn: 1.6, missileDamage: 35, missileExp: 2, missileTtl: 12, missileHitDist: 120,
  },
  blimp: { hp: 180, speed: 40, size: 170, spawnDist: 2200, altitude: 520, headHeight: 330, triggerDist: 190, damage: 120, exp: 25 },
  tank: { hp: 30, speed: 45, range: 950, damage: 6, fireCooldown: 3.2, shellFlightTime: 1.6, shellArc: 140, exp: 5, size: 40 },
  jet: { hp: 60, speed: 260, altitude: 430 * MONSTER_SCALE, turnRate: 0.9, damage: 10, rocketsPerSalvo: 3, salvoMin: 700, salvoMax: 1600, rocketSpeed: 650, exp: 15, size: 70, hitRadius: 90, exitDistance: 2600 },
  director: {
    baseRate: 0.6,
    /** Spawn budget points per second gained per player level above 1. */
    rateGrowthPerLevel: 0.3,
    budgetCap: 12,
    spawnRing: 2000,
  },
  /** Per-kind spawn rules: player level that unlocks it, budget cost, concurrent cap, pick weight. */
  spawns: {
    tank: { unlockLevel: 1, cost: 1, cap: 40, weight: 10 },
    jet: { unlockLevel: 2, cost: 4, cap: 8, weight: 4 },
    blimp: { unlockLevel: 3, cost: 3, cap: 6, weight: 3 },
    sam: { unlockLevel: 5, cost: 5, cap: 4, weight: 2 },
    artillery: { unlockLevel: 7, cost: 8, cap: 2, weight: 2 },
    truck: { unlockLevel: 9, cost: 5, cap: 4, weight: 2 },
    laser: { unlockLevel: 11, cost: 10, cap: 1, weight: 4 },
  },
  /** Enemy HP and damage multipliers grow with the player's level (not run time). */
  difficulty: { hpPerLevel: 0.12, dmgPerLevel: 0.075 },
  progression: { expBase: 20, expExponent: 1.55, offerCount: 3 },
  /** One-off wave at the start of every run, outside the spawn budget. */
  opening: { time: 5, count: 8, radius: 1200 },
  /** Menu cameras: a slow high circle over the city (title), and a turntable orbit of the monster (select). */
  menu: {
    title: { radius: 2400, height: 1300, speed: 0.04, startAngle: 2.4 },
    select: { distance: 2.4, pad: 250, lift: 1.0, speed: 0.25, startAngle: 0.5 },
  },
  intro: {
    /** Phase start times (s); `done` is the intro length. The cut to the game world is at `clouds`. */
    starts: { space: 0, reentry: 3.5, clouds: 5.5, descent: 8.5, impact: 10.5, settle: 11, emerge: 13, done: 15 },
    /** Pod drop in the game world: starts this high and this far behind (-Z), lands at the origin. */
    dropHeight: 4200,
    dropBack: 1400,
    /** Pod rests half-buried after impact (world y). */
    podRestY: 0,
    /** Camera offsets from the pod while falling (start of clouds) and the wide shot at impact (absolute). */
    camFollow: [0, 650, -1700] as const,
    camWide: [-1100, 720, -1900] as const,
    lookFollow: [0, -600, 1200] as const,
    lookImpact: [0, 120, 0] as const,
    /** Inside the cocoon the monster stands curled down by crouchDip (model units of body drop); it straightens over riseTime s after the split. */
    crouchDip: 170,
    riseTime: 1.4,
    clouds: { count: 80, minY: 1500, maxY: 4000, spreadX: 1500, minZ: -2200, maxZ: 900, minSize: 500, maxSize: 1100 },
    /** Fog while inside the cloud band (eases back to CONFIG.fog through the descent). */
    cloudFog: { near: 700, far: 3400 },
    /** Cocoon length = the monster's largest dimension × podFit (the Insect's 484 m span gets a 620 m cocoon). */
    podFit: 1.28,
    /** Screen wash: builds over `rise` s before the cut, holds, fades; a full white-out at impact. */
    flash: { rise: 1.0, hold: 0.15, fade: 0.7, impactPeak: 1, impactFade: 0.9 },
    /** Camera shake offset (m) at full trauma. */
    shakeAmp: 75,
    /**
     * The crash. Buildings topple out to `outer` × crater radius (thinning with distance) as the shock front
     * passes at `shockSpeed` m/s; three staggered rings (radius × crater radius, life s); boulders hurled outward;
     * a ring of secondary fireballs; crater fires per second during the settle.
     */
    impact: {
      outer: 2,
      shockSpeed: 1400,
      rings: [
        { radius: 2.4, life: 0.8, delay: 0 },
        { radius: 3.2, life: 1.1, delay: 0.1 },
        { radius: 4.2, life: 1.9, delay: 0.25 },
      ],
      boulders: 40,
      fireballs: 10,
      fireRate: 14,
    },
    /**
     * Space scene (its own units). The pod's altitude above Earth's surface shrinks exponentially from gapStart
     * at t=0 to gapEnd at the cut, so Earth swells at a steady rate (no slow-down); it burns once inside the
     * atmosphere (rim radius × `atmosphere`). Earth's centre sits at (0, -(earthDrop + 0.3d), d) from the pod.
     */
    space: { earthRadius: 1000, atmosphere: 1.08, gapStart: 8000, gapEnd: 25, earthDrop: 650,
      /** Below zoomAlt the camera tucks in toward the pod (down to zoomMin of its offset), so the ground keeps rushing up. */
      zoomAlt: 100, zoomMin: 0.6, stars: 700, podLength: 20 },
  },
  readability: {
    threatKinds: ['blimp', 'sam', 'artillery', 'truck'] as readonly string[],
    maxArrows: 8,
    arrowMarginPx: 28,
    chevronMax: 80,
  },
  /** Level-up moment: slow-motion beat with the gold aura before the upgrade cards appear. */
  levelUp: { momentTime: 1.2, timeScale: 0.35, auraTime: 1.6, auraRadius: 230, auraHeight: 760, color: 0xffd23f },
  hudHz: 10,
} as const;
