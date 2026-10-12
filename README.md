# AZRAGON

You are a skyscraper-sized alien that has crash-landed on Earth. Flatten the city while the military throws everything it has at you.

## Controls

| Action | Phone | Desktop |
|---|---|---|
| Walk | Tap ground | Click ground |
| Attack | Tap tank, jet, or building | Click it |
| Orbit camera | Drag | Drag (left or right button) |
| Zoom | — | Mouse wheel |
| Leap | Tap Leap button, then tap a spot | Space, then click |
| Dash (level-up pick) | Tap Dash button (charges straight ahead) | E |
| Roar (level-up pick) | Tap Roar button | R |

## Threats

| Enemy | Arrives at | How to counter it |
|---|---|---|
| Tanks | Level 1 | Stomp them, or spike them from range |
| Jets | Level 2 | Spikes only; they loop back for more passes |
| Kamikaze blimp | Level 3 | Shoot it down before it drifts into your head; Roar knocks it out of the sky |
| SAM silo | Level 5 | Reach it while it's raised; spikes shoot its missiles down |
| Artillery | Level 7 | Step or Leap out of the red circles, or hunt the guns down in the fog |
| Laser cannon truck | Level 9 | Step out of its red sight line once it locks, kill it, or take Overload to fire the beam back |
| Orbital laser | Level 11 | Walk out of the faint beam before it locks, or Leap |

Difficulty follows your level: each level adds enemy toughness and spawn rate. Level-ups offer stat boosts and rankable abilities (Dash, Roar, Spine Shield, Venom Nova, Acid Mortar, Shield Bubble, Reflect Shield, Acid Footprints, Spike Storm, Chitin Deflection, Feeding Frenzy, Brood Swarm, Overload, and more).

## Develop

```bash
npm install
npm run dev       # http://localhost:5173 (?debug=1 for fps/draw calls)
npm test          # unit tests
npm run shot      # phone + desktop screenshots into ./screenshots (dev server must be running)
npm run build
```

All tunable values (look, camera, balance) live in `src/config.ts`.

## Deploy

```bash
rundot login
npm run build && rundot deploy
```

Design spec: `docs/superpowers/specs/`. Implementation plan: `docs/superpowers/plans/`.
