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
    /** The crash crater: dark earth, burnt darkest toward the middle, flecked with paler grit. */
    crater: 0x5e4630,
    craterScorch: 0x3a2a1e,
    craterFleck: 0x7d6446,
    road: 0x9a9184,
    roadLine: 0xd9d0b8,
    sun: 0xfff1d6,
    hemiSky: 0xcfe3ff,
    hemiGround: 0x6b5a3a,
    roof: 0x5d5a66,
    carapace: 0x7fd41e,
    carapaceDark: 0x4e8f12,
    joint: 0x7a2fa8,
    stinger: 0xe8ff6a,
    eye: 0xffe14d,
    tank: 0x6b7a3a,
    tankDark: 0x4a5528,
    jet: 0x2c3238,
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
    truckTyre: 0x2a2b2e,
    truckHub: 0x6f7378,
    truckWindow: 0x1f272c,
    truckGlass: 0x8fc8dc,
    truckLight: 0xffe7a3,
    truckCoil: 0xc98a3a,
    cable: 0x1d1f22,
    strike: 0xff3b2f,
    artillery: 0x5f6b45,
    samLauncher: 0xeceae2,
    samTube: 0xd8322a,
    samHazard: 0xf2c230,
    samHazardDark: 0x2b2b2b,
    /** SAM launcher: sand-khaki turntable and cab, olive missile pod, dark frame/cradle accents, pale radar face. */
    samBody: 0xc2b27a,
    samBodyDark: 0x34352a,
    samPod: 0x7f8a4a,
    samRadar: 0xc9cdb8,
    missile: 0xf2f2ee,
    blimpTrim: 0xd8322a,
    blimpTrimDark: 0x5a1612,
    /** Helicopter: olive drab body, darker engine/skids/boom accents, cockpit glass, rotor blades and their blur disc. */
    heli: 0x4a5532,
    heliDark: 0x2f3620,
    heliGlass: 0x7fb4c4,
    heliRotor: 0x1d1f22,
    /** Fighter jet (body is `jet`): pale underside, dark panel stripes, tinted canopy, nozzle ring, afterburner glow. */
    jetBelly: 0x9aa3ab,
    jetDark: 0x111316,
    jetCanopy: 0x6f9fb2,
    jetNozzle: 0x15171a,
    jetBurner: 0xff8a2a,
    napalmBomber: 0x48512f,
    napalmBelly: 0x9aa58a,
    napalmGlass: 0x7fb4c4,
    napalmDark: 0x262b1a,
    napalmBomb: 0x22241f,
    napalmFire: 0xff7a1a,
    napalmScorch: 0x1c120b,
  },
  fog: { near: 2200, far: 4700 },
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
    /** Random buildings per chunk (Tokyo's cap); a city's buildingCapScale multiplies it. */
    buildingsPerChunk: 64,
    /** Building pool: the largest city cap (Toronto's 80) × maxLoadedChunks (185) = 14800, rounded up. */
    maxBuildings: 15000,
    /** Tree cones; a per-chunk cap (maxTrees / maxLoadedChunks) keeps a full load inside the pool. */
    maxTrees: 37000,
    /** Pool size for neon sign boxes across all loaded chunks. */
    maxSigns: 12000,
    /** Pool size for animated video-screen signs across all loaded chunks. */
    maxScreens: 60,
    /**
     * Pool size for ground pads (park greens, port quays, residential lawns) across all loaded chunks. A cell holds at
     * most one pad, so maxLoadedChunks (185) × 16 cells = 2960 always fits.
     */
    maxParks: 3000,
    /** Gantry crane pool (scenery along the coast): a full load peaks at 19 (swept ±12 km), so 32 leaves headroom. */
    maxCranes: 32,
    /** Sea-wall edges and foam strips: a full load peaks at 110 (swept 200 m grid, x -6000..4000, z -6000..4000), so 128 leaves 16% headroom. */
    maxSeaWall: 128,
    maxFoam: 128,
    maxRubble: 2500,
    /** Road segment pool: at most 32 segments start in a chunk, times maxLoadedChunks (185), rounded up. */
    maxRoads: 6000,
    /** Intersection squares plus bridge deck slabs (at most 16 intersections per chunk), with 10% headroom over the swept peak. */
    maxNodes: 3300,
    /** River and bay cell quads (sized for a load centred on land). */
    maxWater: 2400,
    blockSize: 200,
    roadWidth: 36,
    /** Crater around the origin (the pod's impact site; the decal is half a block wider), sized to the cocoon. */
    clearRadius: 650,
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
  /** The Wendigo (id `wendigo`). Stats feed its MonsterKind; fist and lob tune its attacks; colours its body and effects. */
  wendigo: {
    /** The Wendigo's size: its body is drawn at this scale (inside the monster scale), and its body-size stats match. */
    scale: 0.9,
    stats: {
      maxHp: 1450,
      moveSpeed: 110,
      turnRate: 1.6,
      damageMult: 1.2,
      /** One knuckle-walk cycle (all four limbs) covers this many model units. */
      strideLength: 306,
      bodyRadius: 153 * MONSTER_SCALE,
      footRadius: 67.5,
      footDamage: 160,
      /** Fist reach (world m) — also the brain's melee range for attack orders. */
      meleeRange: 324,
      meleeRadius: 110,
      meleeDamage: 95,
      meleeCooldown: 1.2,
      meleeTiming: { windup: 0.3, impact: 0.45, end: 0.85 },
      rangedRange: 1400,
      rangedDamage: 90,
      rangedCooldown: 2.0,
      headHeight: 432,
      /** Measured standing bounding box (world m). */
      size: { width: 425, length: 408, height: 371 },
    },
    /**
     * Rending Claws: targets within `frontHalf` (rad) of dead ahead take a slam; others a backhand whose hit arc
     * is centred `backhandCenter` rad off the nose on the target's side, ±`backhandHalf`. Buildings take buildingMult×.
     */
    fist: {
      frontHalf: 0.75,
      backhandCenter: 1.95,
      backhandHalf: 1.25,
      buildingMult: 2,
      /** The backhand's own timeline (s): a slower, heavier coil, sweep and follow-through than the slam's meleeTiming. */
      backhandTiming: { windup: 0.36, impact: 0.57, end: 1.15 },
    },
    /**
     * Dread Gaze: the target burns `delay` s after the Wendigo looks at it, then the black fire flares over `splash` m;
     * it leaves a patch of black fire (radius m, life s).
     */
    gaze: { splash: 120, delay: 1.4, poolRadius: 110, poolLife: 3 },
    colors: {
      /** Tight, starved olive-grey skin (base, ridge highlight over the ribs and bones, shadowed underside) and the black sinew. */
      skin: 0x4c5142,
      skinLight: 0x676c57,
      skinDark: 0x34372d,
      sinew: 0x1b1a16,
      /** Matted fur: the dark mane, its umber body, the lighter weathered tips that catch the light; moss on the antlers. */
      furDark: 0x17130f,
      fur: 0x2c231c,
      furTip: 0x5e5244,
      moss: 0x2d3222,
      /** Weathered bone-grey skull, its shade (jaw, ridges, teeth) and the dark gnarled antlers with paler worn tips. */
      bone: 0xb9b3a5,
      boneShade: 0x8a8476,
      antler: 0x5f5548,
      antlerTip: 0x8c8172,
      /** Hooves and claws; the empty sockets, nasal cavity and mouth. */
      horn: 0x121010,
      socket: 0x090707,
      /**
       * Death-and-decay FX, not on the body: black fire (near-black flame tongues, a deep violet heart) and the patches it
       * leaves, rotting black-green ground, rot clumps, black-purple shade smoke, dark blood mist, bone-white shards,
       * the pale Hungry Ghosts and Shadow Hands.
       */
      hexfire: 0x0c0710,
      hexember: 0x3d1a52,
      hexPool: 0x120a17,
      blight: 0x1a2312,
      rot: 0x2a3319,
      shade: 0x150e19,
      mist: 0x4a0e14,
      boneShard: 0xdcd4c0,
      ghost: 0xd6d3dc,
      handSmoke: 0x2b1d33,
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
    /**
     * Ravenous Hunger (Wendigo): heat 0..1 rises by (damage taken / max HP) × gain and cools by `cool` per second.
     * Damage × (1 + heat × bonus[rank]); at heat ≥ auraAt a withering aura of radius[rank] deals dps[rank] to ground enemies.
     */
    core: { gain: 4, cool: 0.12, auraAt: 0.5, bonus: [0, 0.3, 0.45, 0.6], radius: [0, 260, 320, 380], dps: [0, 40, 60, 85] },
    /** Auto-shields trigger only when something is about to hit: projectiles or blimps within this range. */
    threatRange: 700,
    earlyAbilityPicks: 3,
  },
  abilities: {
    /** Cooldown multiplier by rank (Dash/Roar ranks come from level-up picks; Leap is always rank 1). */
    rankCooldown: [1, 1, 0.8, 0.65],
    dash: { cooldown: 10, range: 900, duration: 1.2, crushRadius: 95 },
    /** `peak` is the height of a full-range leap; shorter leaps arc lower in proportion, down to `minPeak` × peak. */
    leap: { cooldown: 8, range: 1280, duration: 1.4, peak: 340, minPeak: 0.2, landRadius: 260, damage: 150 },
    roar: { cooldown: 20, radius: 600, duration: 1.2, damage: 120, buildingDamage: 300 },
  },
  laser: {
    trackTime: 2.5, lockTime: 0.8, fireTime: 1.5, cooldownMin: 20, cooldownMax: 30,
    trackSpeed: 80, startOffset: 150, radius: 110, dps: 220, buildingDps: 400, beamHeight: 4000, scorchLife: 10,
  },
  /**
   * Laser Cannon Truck: deploys, tracks with a sight line, locks, then fires a beam along the locked line.
   * trackRate (rad/s) caps how fast the cannon's aim turns while tracking: below the ~0.17 rad/s sweep of a
   * monster walking across the line at 700 m, so it drags behind and the monster slips out before lock.
   * turnRate (rad/s) caps how fast the truck body turns to face its waypoint or the monster.
   */
  truck: { hp: 70, exp: 22, size: 88, speed: 45, range: 1200, deployTime: 0.8, aimTime: 2, trackRate: 0.08, turnRate: 2, lockTime: 1.2, fireTime: 1.2, cooldown: 5, beamWidth: 50, beamLength: 1700, hitRadius: 93, dps: 140, buildingDps: 300, aimHeight: 250 },
  sam: {
    hp: 260, exp: 30, size: 130, spawnMin: 600, spawnMax: 1400,
    riseTime: 1, upTime: 6, sinkTime: 1, downMin: 4, downMax: 6, fireDelay: 1.2,
    missiles: 4, missileSpeed: 300, missileTurn: 1.6, missileDamage: 35, missileExp: 2, missileTtl: 12, missileHitDist: 120,
  },
  blimp: { hp: 180, speed: 40, size: 136, spawnDist: 2200, altitude: 520, headHeight: 330, triggerDist: 190, damage: 120, exp: 25 },
  tank: { hp: 30, speed: 45, range: 950, damage: 6, fireCooldown: 3.2, shellFlightTime: 1.6, shellArc: 140, exp: 5, size: 48 },
  /**
   * Attack helicopters: spawn spawnMin..spawnMax m out, fly in at up to approachSpeed (closing speed eases off as
   * approachGain × distance-to-orbit, tangential speed fading in over fadeDist), then circle a centre that eases
   * toward the monster (centreFollow /s, at most centreMaxSpeed m/s) at `radius` m and `altitude`, at orbitSpeed. "On orbit" is within settleDist
   * of the radius; the first volley follows firstVolley s later, then one every volleyEvery s, rocketsPerVolley jet
   * rockets each (jet damage). Banking: roll = yaw rate × bankGain, capped at bankMax rad. Rotors spin in rad/s.
   */
  heli: {
    hp: 100, exp: 20, size: 70, hitRadius: 80,
    spawnMin: 2200, spawnMax: 2600,
    radius: 700, altitude: 300 * MONSTER_SCALE, orbitSpeed: 120, approachSpeed: 220, approachGain: 0.6, fadeDist: 600,
    centreFollow: 2, centreMaxSpeed: 400, settleDist: 25,
    firstVolley: 2, volleyEvery: 4, rocketsPerVolley: 2,
    bankGain: 2.2, bankMax: 0.35, pitchMax: 0.2,
    rotorSpin: 18, tailRotorSpin: 40,
  },
  /**
   * Napalm bombers: spawn spawnDist m from the monster on a random bearing and fly a straight line at `speed`
   * over the monster's position at spawn (the aim point), despawning exitDist m past it. They lay `bombs` bombs
   * whose impacts sit `spacing` m apart along the flight line, centred on the aim point; each falls from the
   * bomber under bombGravity (m/s²) keeping the bomber's forward speed. A dark strip marks the line warnLead s
   * before the first release. Each impact leaves a burning patch (patchRadius m, patchLife s, fading over the last
   * patchFade s); the monster burns at `dps` while its centre is within patchRadius + contactFrac × body radius
   * of any patch (patches never stack), dealt in burnTick-s ticks (the first on stepping in) so the hit flash
   * pulses instead of holding the monster white. `span` is the wingspan; propellers spin at propSpin rad/s.
   */
  napalm: {
    hp: 90, exp: 30, span: 90, hitRadius: 80,
    spawnDist: 2600, exitDist: 2600, altitude: 650, speed: 240,
    bombs: 6, spacing: 90, bombGravity: 160, warnLead: 1.2,
    patchRadius: 60, patchLife: 6, patchFade: 1, dps: 12, contactFrac: 0.25, burnTick: 0.5,
    propSpin: 30,
  },
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
    heli: { unlockLevel: 2, cost: 4, cap: 4, weight: 3 },
    napalm: { unlockLevel: 6, cost: 6, cap: 2, weight: 2 },
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
    /**
     * Phase start times (s); `done` is the intro length. The cut to the game world is at `clouds`; the cloud
     * scene was trimmed to nothing, so the game world opens straight on the descent.
     */
    starts: { space: 0, reentry: 3.5, clouds: 5.5, descent: 5.5, impact: 7.5, settle: 8, emerge: 10, done: 12 },
    /** The full pod drop: a straight, nose-first line from this high and this far behind (-Z), landing at the origin (a 45° dive). */
    dropHeight: 4200,
    dropBack: 4200,
    /** Fraction of the full drop already fallen at the cut: the game world joins the fall part-way (3 s of a 5 s fall). */
    dropJoin: 0.6,
    /** The cocoon's spin about its long axis (rad/s); it freezes where it was at impact. */
    spin: 0.8,
    /** Fade in from black over this long (s) at the very start. */
    fadeIn: 1.2,
    /**
     * Chase framing, in pod lengths, in the pod's travel frame (+Z ahead, +Y up away from the ground): the camera
     * sits behind, above and a little to the side, looking ahead and down. Space and the fall share it, so the shot
     * holds through the cut and after the crash.
     */
    chase: { back: 3.2, lift: 1.7, side: 0.45, ahead: 4, dip: 0.9 },
    /**
     * The reveal. At impact (under the white flash) the pod gives way to the monster, black, and a dense cloud
     * (`cloud` puffs, fed at `feedRate`/s for `feedFor` s) erupts over the crater, hiding both. It thins from about
     * `emerge`; the silhouette shows through, stays black until emerge + `hold`, then comes into colour over `fade` s.
     * It stands up inside the cloud `riseAfter` s after impact, so a dark figure looms through it as it thins.
     */
    reveal: { hold: 1.1, fade: 0.7, cloud: 20, feedRate: 36, feedFor: 1.2, riseAfter: 1.5 },
    /** In the cloud the monster starts curled down by crouchDip (model units of body drop); it straightens over riseTime s (see reveal.riseAfter). */
    crouchDip: 170,
    riseTime: 1.4,
    /** A skip lands this long (s) before `emerge`, so the reveal and the music change on it still play. */
    skipLead: 0.5,
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
      outer: 1.3,
      shockSpeed: 1400,
      rings: [
        { radius: 2.4, life: 0.8, delay: 0 },
        { radius: 3.2, life: 1.1, delay: 0.1 },
        { radius: 4.2, life: 1.9, delay: 0.25 },
      ],
      boulders: 40,
      /** Impact dust clouds: billows rolling out from dustRing/2 × crater radius, and puffs in the rising column. */
      dustRing: 0.9,
      dustBillows: 40,
      dustColumn: 5,
      fireballs: 10,
      fireRate: 14,
    },
    /**
     * Space scene (its own units). The pod's altitude above Earth's surface shrinks exponentially from gapStart
     * at t=0 to gapEnd at the cut, so Earth swells at a steady rate (no slow-down); it burns once inside the
     * atmosphere (rim radius × `atmosphere`). Earth's centre sits at (0, -(earthDrop + 0.3d), d) from the pod.
     */
    space: { earthRadius: 1000, atmosphere: 1.08, gapStart: 8000, gapEnd: 25, earthDrop: 650,
      stars: 700, podLength: 20 },
  },
  music: {
    /** Master volume, 0..1. */
    volume: 0.8,
    /** CDN fetch timeout (ms); each file is a few MB. */
    fetchTimeout: 60000,
    /** The Intro: loops as a whole file through the menus and the cutscene. */
    intro: { file: 'audio/intro.m4a' },
    /** Main gameplay 1: starts from its top on the reveal, plays once (the file ends after its final hit). */
    main1: { file: 'audio/main1.m4a' },
    /** Main gameplay 2: follows Main 1 and loops as a whole song. */
    main2: { file: 'audio/main2.m4a' },
    /** The Intro and Main 1 crossfade over this long (s) the moment the reveal starts. */
    crossfade: 1.0,
    /** Gameplay music fades out over this long (s) when a menu brings the Intro back. */
    returnFade: 1.0,
  },
  readability: {
    threatKinds: ['blimp', 'sam', 'artillery', 'truck', 'heli', 'napalm'] as readonly string[],
    maxArrows: 8,
    arrowMarginPx: 28,
    chevronMax: 80,
  },
  /** Level-up moment: slow-motion beat with the gold aura before the upgrade cards appear. */
  levelUp: { momentTime: 1.2, timeScale: 0.35, auraTime: 1.6, auraRadius: 230, auraHeight: 760, color: 0xffd23f },
  hudHz: 10,
} as const;
