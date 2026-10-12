# AZRAGON

You are a skyscraper-sized alien that has crash-landed on Earth. Flatten the city while the military throws everything it has at you.

## Controls

| Action | Phone | Desktop |
|---|---|---|
| Walk | Tap ground | Click ground |
| Attack | Tap tank, jet, or building | Click it |
| Orbit camera | Drag | Drag (left or right button) |
| Zoom | — | Mouse wheel |

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
