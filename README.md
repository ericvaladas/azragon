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
| Dash (level-up pick) | Tap Dash button, then tap a direction | E, then click |
| Roar (level-up pick) | Tap Roar button | R |

## Threats

| Enemy | Arrives | How to counter it |
|---|---|---|
| Tanks | 0:00 | Stomp them, or spike them from range |
| Jets | 0:20 | Spikes only; they loop back for more passes |
| Kamikaze blimp | 0:45 | Shoot it down before it drifts into your head; Roar knocks it out of the sky |
| SAM silo | 1:30 | Reach it while it's raised; spikes shoot its missiles down |
| Artillery | 2:30 | Step or Leap out of the red circles, or hunt the guns down in the fog |
| Laser cannon truck | 3:30 | Step out of its red sight line once it locks, kill it, or take Overload to fire the beam back |
| Orbital laser | 4:30 | Walk out of the faint beam before it locks, or Leap |

Level-ups offer stat boosts and six rankable abilities (Acid Footprints, Spike Storm, Chitin Deflection, Feeding Frenzy, Brood Swarm, Overload, and more).

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
