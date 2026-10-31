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
    /** Main battle tank (olive is `tank`): darker olive lower hull/mantlet/hatches, tracks, road wheels, gunmetal fittings, lights. */
    tank: 0x6b7a3a,
    tankDark: 0x4a5528,
    tankTrack: 0x2a2b2a,
    tankWheel: 0x3c4425,
    tankMetal: 0x2f3230,
    tankLight: 0xffe7a3,
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
    artillery: 0xd0ae68,
    /** Towed howitzer (desert tan is `artillery`): dark brown carriage/cradle, brown camo patches, gunmetal tube ends, tyres, hubs. */
    artilleryDark: 0x5c4a30,
    artilleryCamo: 0x8f6f40,
    artilleryMetal: 0x2a2d2b,
    artilleryTyre: 0x1f2022,
    artilleryHub: 0x8d8266,
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
    /** Osprey (body is `ospreyBody`): light navy grey airframe, dark trim, tinted glass, gunmetal rotors; safety-orange net rope that reads over the monsters' dark hides. */
    ospreyBody: 0x8f9aa6,
    ospreyDark: 0x3b434d,
    ospreyGlass: 0x7fb4c4,
    ospreyRotor: 0x1d1f22,
    netRope: 0xff6a13,
    /**
     * Schwerer Gustav (hull is `gustav`): bronze, darker bronze carriage and trim, dark tracks, gunmetal fittings, worn
     * bronze weathering, a yellow-and-black hazard band. Its shell: steel body, brass nose cone, copper driving band.
     */
    gustav: 0xb08d57,
    gustavDark: 0x6e5434,
    gustavTrack: 0x222324,
    gustavMetal: 0x3a3d3f,
    gustavWorn: 0x5a4228,
    gustavShell: 0x5d6248,
    gustavShellNose: 0xc9a227,
    gustavShellBand: 0xb5652b,
    /** Scenery landforms (Toronto's islands and spit): sand, grass, paths, the airport, lighthouses, island cottages. */
    landSand: 0xe3d3a1,
    landGrass: 0x6a9a4c,
    landPath: 0xcfc8b4,
    landRunway: 0x55595d,
    landMarking: 0xf2f2ee,
    landTerminal: 0xd6dadd,
    lighthouseWhite: 0xf4f1ea,
    lighthouseRed: 0xc8352b,
    cottage1: 0xe8c7c8,
    cottage2: 0xc9dbe8,
    cottage3: 0xf2e2b0,
    cottage4: 0xcfe3c8,
    gustavHazard: 0xf2c230,
    gustavHazardDark: 0x1e1e1e,
    /** Shield Bubble: the cyan dome's fill and the triangle lattice over it. Reflect Shield's patches are violet. */
    bubbleFill: 0x6fe7ff,
    bubbleRim: 0xbff6ff,
    reflectFill: 0x8a3fd6,
    reflectRim: 0xe2c2ff,
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
    /** While a walking key is held, the camera swings round behind the monster at this rate (1/s; higher is snappier). */
    behindLambda: 3,
  },
  input: {
    tapMaxMovePx: 10,
    tapMaxMs: 300,
    pickRadiusPx: 28,
    /** Wheel units per pixel of pinch. */
    pinchSensitivity: 3.5,
    /** Keys are ignored this long (ms) after each level-up offer appears, as taps are (`cards-guard` in style.css). */
    offerGuardMs: 250,
  },
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
    clearRadius: 500,
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
    moveSpeed: 150,
    turnRate: 2.4,
    /** Backing up (S held) runs at this fraction of the walk speed. */
    reverseSpeed: 0.5,
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
    meleeDamage: 112,
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
      moveSpeed: 161,
      turnRate: 1.9,
      damageMult: 1.15,
      strideLength: 300,
      bodyRadius: 140 * MONSTER_SCALE,
      footRadius: 70,
      footDamage: 150,
      meleeRange: 420,
      meleeRadius: 0,
      meleeDamage: 144,
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
     * head must be to fire (rad), and how long a charged breath waits for the head before giving up (s). While an
     * ultimate holds the Kaiju the neck turns at carriedTurnRate (rad/s of world time), fast enough for Plasma Lance's sweep.
     */
    neck: { limit: 1.6, turnRate: 3.5, aimTolerance: 0.1, maxWait: 1.2, carriedTurnRate: 14 },
    /**
     * Tail Sweep (auto): hits ground targets beside/behind within `reach`, chosen within `rearHalf` (rad) of
     * straight behind; damage lands in a wedge of ±`hitHalf` toward the target. Buildings take buildingMult×.
     */
    tail: { reach: 520, rearHalf: 1.9, hitHalf: 0.8, damage: 90, buildingMult: 3, cooldown: 2.0, timing: { windup: 0.25, impact: 0.45, end: 1.0 } },
    /** Claw Rake: half-angle (rad) of the forward arc. */
    rakeHalfAngle: 0.9,
    /** Plasma Breath: charge (s), beam on-screen time (s), beam half-width (m), visual sweep (rad), fan per extra beam (rad), beam cap, building damage per hit. */
    breath: { charge: 0.4, show: 0.35, halfWidth: 45, sweep: 0.1, fan: 0.12, maxLines: 4, buildingDamage: 120 },
    /**
     * Plasma Lance (Q), on real seconds: the beam's range (m) and half the wedge it sweeps (rad, either side of the
     * facing), the world time scale, the camera pull; the rising glints (how many, how high they climb (m), their
     * sizes (m), the ring around the Kaiju they start in (m), and how fast they twinkle (rad/s)); the beam's core and edge radii (m); the trench it burns along the
     * ground under its whole length (disc radius (m), how long one takes to fade (s), how many at once, spacing along
     * the beam (m), and how far from the Kaiju it starts (m)); the beats (s); and the night sky's light intensities.
     * The Kaiju's roar builds from Q to roarUp as the camera pulls out (on real time, so slowly), holds until roarDown,
     * eases off by roarTo, then the head turns round to the right edge by fire.
     */
    ultimate: {
      range: 1400, halfAngle: 1.047, timeScale: 0.25, cameraDistanceMult: 2.0,
      debris: 200, debrisLift: 260, debrisSize: [6, 12], debrisNear: 120, debrisRange: 900, debrisTwinkle: [3, 7],
      beamCore: 18, beamEdge: 55, scarWidth: 50, scarLife: 2.5, scars: 1000, scarSpacing: 60, scarFrom: 150,
      t: { easeIn: 0.2, sky: 2.0, liftFrom: 0.1, glowFrom: 0.3, glowTo: 2.5, roarUp: 1.4, roarDown: 1.7, roarTo: 2.0, fire: 2.5, sweepTo: 5.0, outroFrom: 5.0, end: 6.5 },
      hemiIntensity: 0.5, sunIntensity: 0.45,
    },
    colors: {
      scale: 0x3f5f48,
      scaleDark: 0x2b4234,
      belly: 0x9aa883,
      claw: 0xe6e0cc,
      plate: 0x6ff6ff,
      eye: 0xa8fdff,
      plasma: 0x6ff6ff,
      ember: 0xff9a3c,
      /** Plasma Lance's night sky (zenith, horizon, fog, moonlight from the sky and ground, the moon, lit windows), the beam's white core, its scar and the rising glints. */
      lanceZenith: 0x05070f,
      lanceHorizon: 0x1a2438,
      lanceFog: 0x121a28,
      lanceHemiSky: 0x5a6e96,
      lanceHemiGround: 0x0a0d14,
      lanceSun: 0x9ab4e8,
      lanceWindows: 0xffd890,
      beamCore: 0xffffff,
      scar: 0x6ff6ff,
      glint: 0xe8f4ff,
    },
  },
  /** The Insect Titan's own settings (its stats and colours live in `monster` and `palette`). */
  insect: {
    /**
     * Spike Rain (Q), on real seconds: the area the spikes rain on (from `near` to `far` m in front, `halfAngle` rad
     * either side of the facing), the world time scale, the camera pull; the spikes (the pool, how many fall at least,
     * each one's flight (s), arc height (m), length and width (m)); the purple fog's near and
     * far (m); the purple sky's light intensities; and the beats (s).
     */
    ultimate: {
      near: 250, far: 1400, halfAngle: 0.873, timeScale: 0.25, cameraDistanceMult: 2.0,
      pool: 256, spikes: 160, flight: 1.0, arc: 600, spikeLength: 45, spikeWidth: 7,
      fogNear: 1200, fogFar: 3600, hemiIntensity: 0.45, sunIntensity: 0.4,
      t: { easeIn: 0.2, sky: 1.5, rearUp: 1.5, volleyFrom: 1.0, volleyTo: 3.0, rainFrom: 2.0, rainTo: 4.0, outroFrom: 4.0, end: 5.5 },
    },
    /** Spike Rain's purple sky (zenith, horizon, fog, the two lights). */
    colors: {
      rainZenith: 0x1c0a2e,
      rainHorizon: 0x5a2a7a,
      rainFog: 0x3e1f56,
      rainHemiSky: 0x9a6ac8,
      rainHemiGround: 0x1a0c24,
      rainSun: 0xc8a0f0,
    },
  },
  /** The Kraken. Stats feed its MonsterKind; arms tune the tentacles; colours its body and effects. */
  kraken: {
    stats: {
      maxHp: 1100,
      moveSpeed: 144,
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
      meleeDamage: 131,
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
      /** Ink Storm's sky (zenith, horizon, fog, the two lights) and its rain. */
      stormZenith: 0x2a3848,
      stormHorizon: 0x6a7a8c,
      stormFog: 0x5c6670,
      stormHemiSky: 0x8a9ab0,
      stormHemiGround: 0x2a3038,
      stormSun: 0xb8c8da,
      rain: 0xa8b8cc,
      /** Ink Storm's lightning: its white core, cold edge and the scorch it leaves. */
      boltCore: 0xf4f8ff,
      boltEdge: 0x6fa8ff,
      boltScorch: 0x14161c,
    },
    /**
     * Ink Storm (Q), on real seconds: the ink's radius (m), the world time scale, chunks (one per arm), the leap's
     * peak (m), the camera pull, a chunk's flight (s), arc (m) and size (m), the ink jets, how long (s) the siphon takes
     * to squirt them, the scale of the cloud each bursts into (InkFx.burst) and how fast the ink plays (its own slow
     * motion), how far out the arms dig in (m), the beats (s), and the storm's light intensities.
     * The leap is one arc: up to (1 - hangDrop) of the peak by peakAt, drifting over the peak through the hang (until
     * fallFrom) and back to that height, then falling. Lightning strikes at the bolts times (s), within boltSpread of the radius. The camera pulls back until cameraTo.
     * The arms brace on the ground from braceFrom, fully by braceIn, and push off until pushTo. Each throw is a swing (s):
     * the arm draws back for swingWindup, the last swingWhip of it lashing out, the chunk leaving as it ends, then
     * follows through for swingFollow.
     */
    ultimate: {
      radius: 900, timeScale: 0.25, chunks: 8, peak: 600, hangDrop: 0.15, cameraDistanceMult: 2.2, chunkFlight: 0.9, chunkArc: 120, chunkSize: 80,
      inkJets: 30, inkSquirt: 0.5, inkScale: 3.6, inkSpeed: 0.3, grabReach: 280, bolts: [0.25, 0.6], boltSpread: 0.6, swingWindup: 0.7, swingWhip: 0.3, swingFollow: 0.6,
      t: { easeIn: 0.2, sky: 0.8, rainFrom: 0.3, cameraTo: 2.6, grabFrom: 0.5, grabTo: 1.4, braceFrom: 0.5, braceIn: 0.9, leapFrom: 1.4, pushTo: 1.75, peakAt: 2.6, inkFrom: 2.0, inkTo: 3.2, throwFrom: 4.2, throwTo: 5.0, fallFrom: 5.6, fallTo: 6.6, outroFrom: 6.6, end: 7.8 },
      hemiIntensity: 0.65, sunIntensity: 0.8,
    },
  },
  /** The Wendigo (id `wendigo`). Stats feed its MonsterKind; fist and lob tune its attacks; colours its body and effects. */
  wendigo: {
    /** The Wendigo's size: its body is drawn at this scale (inside the monster scale), and its body-size stats match. */
    scale: 0.9,
    stats: {
      maxHp: 1450,
      moveSpeed: 127,
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
      meleeDamage: 181,
      meleeCooldown: 1.2,
      meleeTiming: { windup: 0.2, impact: 0.33, end: 0.7 },
      rangedRange: 1000,
      rangedDamage: 90,
      rangedCooldown: 3.0,
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
      backhandTiming: { windup: 0.45, impact: 0.7, end: 1.35 },
      /** Flyers at or below this altitude (m) are in the claws' reach (helicopters and jets; not blimps or bombers). */
      airHeight: 300,
    },
    /**
     * Dread Gaze: the target burns `delay` s after the Wendigo looks at it, then the black fire flares over `splash` m;
     * it leaves a patch of black fire (radius m, life s).
     */
    gaze: { splash: 120, delay: 1.4, poolRadius: 110, poolLife: 3 },
    /**
     * Devour (the ultimate): a black circle of `radius` m at the press point; world time slows to timeScale; up to
     * maxFigures hands (DevourHands) start up to handStagger s apart, each rising out of the ground under its victim;
     * the effect holds until the last is back under. Anyone else inside at the grasp beat (past the hand cap, or come
     * in since) is taken in a burst of shadow; a boss takes bossDamage × the damage
     * multiplier. The camera pulls back to cameraDistanceMult × its default distance, keeping its angle. Lightning strikes
     * every boltEvery[0]..[1] s within boltSpread × radius. `t`: the beats in real seconds (see devourPhase); the camera
     * takes cameraIn s to pull back and cameraOut s to return from outroFrom, finishing after control comes back at `end`.
     * The blood sky: its lights' intensities (the colours are bloodZenith…bloodSun below).
     */
    ultimate: {
      radius: 900, timeScale: 0.25, maxFigures: 24, handStagger: 0.9,
      /**
       * A hand: its scale (the anti-air hands are 2), how fast it rises (m/s, real time), how long it takes to reach a
       * flyer (s, however high), how long it brakes to a stop at the top of its rise (s), how long it takes to close into a fist (s), how fast it sinks back (m/s), how
       * long it takes to sink back from a flyer (s, however high), and how high its wrist is at the lowest grasp (m),
       * so the whole hand is above the ground.
       */
      hand: { scale: 2.2, riseSpeed: 180, airRiseTime: 0.45, easeTime: 0.6, closeTime: 1.6, sinkSpeed: 100, airSinkTime: 1.2, wristClear: 15 },
      bossDamage: 2000,
      cameraDistanceMult: 2.2,
      boltEvery: [0.9, 1.6], boltSpread: 1.3,
      t: { easeIn: 0.2, sky: 0.6, cameraIn: 3.0, cameraOut: 2.4, boltsFrom: 0.3, boltsTo: 3.3, circleFrom: 0.5, circleTo: 1.3, grasp: 1.9, outroFrom: 3.4, end: 4.4 },
      hemiIntensity: 0.55, sunIntensity: 0.9,
    },
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
      /** Devour's blood sky (zenith, horizon, fog, the two lights), its circle and lightning. */
      bloodZenith: 0x220a0d,
      bloodHorizon: 0x6e2426,
      bloodFog: 0x321416,
      bloodHemiSky: 0x9a4a50,
      bloodHemiGround: 0x16080a,
      bloodSun: 0xf07a66,
      /** The dark husk a Devour hand drags under in place of its victim. */
      husk: 0x120a10,
      circle: 0x050204,
      boltCore: 0xfff2f0,
      boltEdge: 0xff2a2a,
    },
  },
  /** Artillery batteries: `guns` guns gunSpacing m apart, placed distMin..distMax m from the monster; a battery fires a salvo every salvoEvery s while the monster is within `range` m of it. */
  artillery: {
    hp: 120, exp: 20, size: 62, guns: 3, gunSpacing: 109, distMin: 1400, distMax: 2000, range: 2200,
    salvoEvery: 6, fillTime: 3.2, shellFlight: 1.8, shellArc: 750, radius: 90, damage: 60, buildingDamage: 200, spread: 260,
    baseSalvo: 3, levelsPerExtra: 3, maxSalvo: 8,
  },
  passives: {
    /** Burning ground patches (the Wendigo's black fire): damage per second to ground enemies inside one. */
    acid: { dps: 30 },
    storm: { interval: 8, intervalStep: 1, spikes: 4, extraSpikes: 2 },
    chitin: { perRank: 0.15 },
    /** Overload: absorb the next beam/orbital hit and fire it back (truck destroyed; orbital = energy blast). */
    overload: { cooldown: [0, 20, 15, 11], blastRadius: 450, blastDamage: 250, reflectDamage: 400 },
    /** Arrays are indexed by rank (0 = not taken). */
    spines: { rate: [0, 2, 3, 4.5], radius: [0, 500, 600, 700] },
    swat: { cooldown: [0, 3.75, 2.85, 1.95], range: [0, 450, 525, 600], damage: [0, 120, 220, 320], targets: [0, 1, 2, 3], headHeight: 380 },
    nova: { interval: [0, 7, 6, 5], radius: [0, 600, 700, 800], damage: [0, 80, 120, 170] },
    mortar: { interval: [0, 4, 3.5, 3], globs: [0, 2, 3, 4], splash: [0, 90, 110, 130], damage: 90, range: 1800, flightTime: 1.2, arc: 300 },
    /**
     * Shield Bubble: invincible for the rank's duration. The dome builds itself from the ground up over `build` s —
     * each triangle spends `brickWindow` of that opening (so a brick's own pop lasts build × brickWindow; the rest
     * is the front's climb) and glows `flash` times as bright the moment it lands. When the bubble ends the dome
     * lets go where it hung: out by `fadeSwell` of its radius as it dims, over `fade` s.
     */
    bubble: { duration: [0, 3, 3.5, 4], cooldown: [0, 25, 21, 17], build: 0.9, brickWindow: 0.28, flash: 16, fade: 0.4, fadeSwell: 0.05 },
    reflect: { duration: [0, 4, 5, 6], cooldown: [0, 20, 17, 14], radius: 380, damage: 60 },
    /**
     * Haste When Hurt: heat 0..1 rises by (damage taken / max HP) × gain and cools by `cool` per second.
     * Every cooldown recovers (1 + heat × haste[rank]) times as fast.
     */
    core: { gain: 4, cool: 0.12, haste: [0, 0.5, 0.75, 1] },
    /** Auto-shields trigger only when something is about to hit: projectiles or blimps within this range. */
    threatRange: 700,
    earlyAbilityPicks: 3,
  },
  /**
   * Snare (Osprey nets): while active the monster walks at speedMult × its speed and cannot leap or dash.
   * It lasts `duration` s; each attack takes `perAttack` s off, but never ends it sooner than `minDuration` s after it started.
   */
  snare: { duration: 6, perAttack: 1, minDuration: 2, speedMult: 0.3 },
  /**
   * The ultimate (Q): its cooldown in seconds of plain game time (no upgrade or Haste When Hurt shortens it), and
   * whether a run starts with it ready (true while the ultimates are being built; false starts it on its full cooldown).
   */
  ultimate: { cooldown: 100, startReady: true },
  abilities: {
    /** Cooldown multiplier by rank (Dash/Roar ranks come from level-up picks; Leap is always rank 1). */
    rankCooldown: [1, 1, 0.8, 0.65],
    /** Dash: `range` m in a straight line at speedMult × the monster's walk speed (Move Speed upgrades included). */
    dash: { cooldown: 10, range: 900, speedMult: 6, crushRadius: 95 },
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
  truck: { hp: 70, exp: 22, size: 88, speed: 50, range: 1200, deployTime: 0.8, aimTime: 2, trackRate: 0.08, turnRate: 2, lockTime: 1.2, fireTime: 1.2, cooldown: 5, beamWidth: 50, beamLength: 1700, hitRadius: 93, dps: 140, buildingDps: 300, aimHeight: 250 },
  sam: {
    hp: 260, exp: 30, size: 91, spawnMin: 600, spawnMax: 1400,
    riseTime: 1, upTime: 6, sinkTime: 1, downMin: 4, downMax: 6, fireDelay: 1.2,
    missiles: 4, missileSpeed: 300, missileTurn: 1.6, missileDamage: 35, missileExp: 2, missileTtl: 12, missileHitDist: 120,
  },
  blimp: { hp: 180, speed: 44, size: 136, spawnDist: 2200, altitude: 520, headHeight: 330, triggerDist: 190, damage: 120, exp: 25 },
  /** Tanks: their shells fly at shellSpeed m/s on an arc peaking shellArc m. */
  tank: { hp: 30, speed: 50, range: 950, damage: 20, fireCooldown: 3.2, shellSpeed: 1100, shellArc: 140, exp: 5, size: 48 },
  /**
   * Schwerer Gustav, a gigantic tracked land battleship (`size` m nose to tail, its hull drawn `width` m across, just
   * wider than a road). It spawns on a road spawnBeyond..spawnBeyond + spawnSpread m beyond its range from the monster,
   * so it engages soon after it appears. It follows the roads toward the monster at `speed` m/s (re-planning every replanEvery s), its
   * hull turning at turnRate rad/s; it never damages buildings. Within `range` m it stops (driving on only once the
   * monster is more than disengageMargin m beyond that) and turns its gun at aimRate rad/s; within aimTolerance rad it
   * fires one shell straight at the monster every fireCooldown s (the first firstShotMin..firstShotMax s after it
   * stops) for `damage`. The shell flies in a straight line at shellSpeed m/s, is drawn shellLength × shellDiameter m
   * with a nose cone, and lays a chemtrail: a contrail puff every trailSpacing m. Each shot shakes the screen by
   * fireShake and kicks the turret back `recoil` × size, returning over recoilTime s.
   */
  gustav: {
    hp: 450, exp: 60, size: 160, width: 42, speed: 50, turnRate: 0.6, replanEvery: 4,
    range: 1500, disengageMargin: 100, spawnBeyond: 200, spawnSpread: 200, aimRate: 0.5, aimTolerance: 0.05, damage: 60, fireCooldown: 8, firstShotMin: 3, firstShotMax: 6,
    shellSpeed: 1700, shellLength: 44, shellDiameter: 12, trailSpacing: 26, fireShake: 0.35, recoil: 0.06, recoilTime: 0.7,
  },
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
    radius: 700, altitude: 300 * MONSTER_SCALE, orbitSpeed: 132, approachSpeed: 242, approachGain: 0.6, fadeDist: 600,
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
    spawnDist: 2600, exitDist: 2600, altitude: 650, speed: 264,
    bombs: 6, spacing: 90, bombGravity: 160, warnLead: 1.2,
    patchRadius: 60, patchLife: 6, patchFade: 1, dps: 12, contactFrac: 0.25, burnTick: 0.5,
    propSpin: 30,
  },
  /**
   * Osprey Net squads: four Ospreys (one per net corner) spawn spawnDist m out and fly at cruiseSpeed and
   * cruiseAltitude in a square bodyRadius × netHalfMult m from the centre to each, carrying the net open, homing on
   * the monster. Within arriveDist they position for positionTime s: the formation centre follows the monster at up
   * to trackSpeed m/s, the squad sinks to the monster's height + dropClearance over the first settleFrac of the
   * phase, and the rotor pods swivel up over tiltTime s. Then, with at least minToDrop alive,
   * the net drops onto the monster; otherwise it drops toward the ground and the squad aborts. Survivors climb back at climbRate m/s, close the square to
   * tightHalf m at tightenRate m/s and fly out, despawning exitDist m from the monster.
   * Net: a cloth whose corners hang `cable` m below each Osprey; released, it falls onto the monster (snaring it)
   * or the ground, and a net on the ground fades out over groundLife s. Its burst when torn free spreads
   * max(bodyRadius × domeRadiusMult, width × domeWidthMult) m. `size` is nose-to-tail length (m); rotors spin at rotorSpin rad/s.
   */
  osprey: {
    hp: 100, exp: 15, size: 80, hitRadius: 80,
    spawnDist: 2600, exitDist: 2600,
    cruiseSpeed: 220, cruiseAltitude: 650, arriveDist: 150,
    tightHalf: 45, netHalfMult: 2.6, dropClearance: 200,
    positionTime: 2.5, settleFrac: 0.6, tiltTime: 1.2, trackSpeed: 400,
    climbRate: 120, tightenRate: 60,
    minToDrop: 3,
    cable: 40, groundLife: 4, groundY: 3,
    domeRadiusMult: 2.2, domeWidthMult: 0.55,
    rotorSpin: 14, landShake: 0.4,
    /**
     * The net's cloth: gravity (m/s²), velocity kept per substep (damping), rope passes per substep (iterations), rope
     * length beyond the carried span (slack, a fraction), sliding loss on contact (friction), rest height above a
     * surface (thickness, m), deepest a point is lifted onto the body (maxPush, m; deeper points are under it, not on
     * it), the share of the monster's height above which contact catches the rope (catchFrac), the falling net's pull
     * back over its target (homing, rad/s), the substep length (s), and the corner weights: cornerMass × an
     * ordinary point, pulled down at cornerPull × gravity so they lead the fall, drawn as balls weightSize m across.
     * Torn free, it breaks into pieces thrown outward at tearOut m/s and upward at tearUp m/s.
     */
    cloth: { cornerMass: 8, cornerPull: 3, weightSize: 10, tearOut: 90, tearUp: 70, gravity: 400, damping: 0.985, iterations: 8, slack: 0.15, friction: 0.6, thickness: 8, maxPush: 60, catchFrac: 0.45, homing: 5, substep: 1 / 60 },
  },
  jet: { hp: 60, speed: 286, altitude: 430 * MONSTER_SCALE, turnRate: 0.9, damage: 10, rocketsPerSalvo: 3, salvoMin: 700, salvoMax: 1600, rocketSpeed: 650, exp: 15, size: 70, hitRadius: 90, exitDistance: 2600 },
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
    sam: { unlockLevel: 6, cost: 5, cap: 4, weight: 2 },
    artillery: { unlockLevel: 5, cost: 8, cap: 2, weight: 2 },
    truck: { unlockLevel: 8, cost: 5, cap: 4, weight: 2 },
    laser: { unlockLevel: 10, cost: 10, cap: 1, weight: 4 },
    heli: { unlockLevel: 1, cost: 4, cap: 4, weight: 3 },
    napalm: { unlockLevel: 4, cost: 6, cap: 2, weight: 2 },
    osprey: { unlockLevel: 7, cost: 8, cap: 1, weight: 2 },
    gustav: { unlockLevel: 1, cost: 4, cap: 2, weight: 5 },
  },
  /** Enemy HP and damage multipliers grow with the player's level (not run time). */
  difficulty: { hpPerLevel: 0.12, dmgPerLevel: 0.075 },
  /** EXP to reach the next level is expBase × level^expExponent, × earlyMult for levels up to earlyLevels. */
  progression: { expBase: 20, expExponent: 1.55, earlyLevels: 3, earlyMult: 1.25, offerCount: 3 },
  /** One-off wave at the start of every run, outside the spawn budget. */
  opening: { time: 5, count: 8, radius: 1200 },
  /**
   * Runaway: the monster counts as running once its straight-line travel over the last `window` s (sampled every
   * `sample` s) reaches `distance` m, and stops counting once that falls below release × distance. While it runs,
   * enemies spawn within ±cone rad of its travel direction, and a run's start drops a wave of waveCount tanks on the
   * roads waveRadius m around a point waveAhead m ahead (at most one wave every waveCooldown s).
   */
  runaway: { window: 15, sample: 0.5, distance: 1200, release: 0.5, cone: Math.PI / 4, waveCount: 6, waveAhead: 1200, waveRadius: 300, waveCooldown: 45 },
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
    threatKinds: ['blimp', 'sam', 'artillery', 'truck', 'heli', 'napalm', 'osprey', 'gustav'] as readonly string[],
    maxArrows: 8,
    arrowMarginPx: 28,
    chevronMax: 80,
  },
  /** Level-up moment: slow-motion beat with the gold aura before the upgrade cards appear. */
  levelUp: { momentTime: 1.2, timeScale: 0.35, auraTime: 1.6, auraRadius: 230, auraHeight: 760, color: 0xffd23f },
  hudHz: 10,
} as const;
