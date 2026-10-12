# 3D React Template

A React + Three.js + Vite + TypeScript template for RUN.game apps. React handles HUD overlays while Three.js owns the 3D scene directly.

## What's Included

- **Game state machine** — `loading` / `playing` / `paused` / `gameover` states with transitions
- **Event bridge** — Typed event emitter connecting game logic to React UI (score, state changes)
- **HUD overlay** — Score display + game-over panel, wired to game events
- **Three.js scene** — Fullscreen 3D renderer with sky, shadows, OrbitControls, and StowKit asset loading
- **StowKit pipeline** — Dice mesh loaded from `.stow` pack via CDN as a working demo
- **Theme system** — Color tokens applied as CSS variables
- **Error boundary** — Catches and displays errors gracefully

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/
├── components/         # ErrorBoundary
├── App.tsx             # Shell: mounts GameScene, renders HUD overlay
├── GameScene.ts        # Three.js game class with state machine
├── GameEvents.ts       # Typed event emitter (game → React bridge)
├── loadStowKitPack.ts  # StowKit pack loader
├── theme.ts            # Color tokens + applyTheme
├── main.tsx            # Entry point
└── style.css           # Global + HUD styles
```

## Customizing

1. **Game logic** — Put gameplay in `updatePlaying()` inside `GameScene.ts`
2. **Score** — Call `this.addScore(n)` from game logic; HUD updates automatically
3. **New events** — Add to `GameEventMap` in `GameEvents.ts`, emit from `GameScene`, subscribe in `App.tsx`
4. **HUD** — Add React elements in the `.hud` div in `App.tsx`
5. **Theme colors** — Edit `src/theme.ts`
6. **Assets** — Place files in `assets/`, run `stowkit build`, load with `pack.loadMesh('id')`
