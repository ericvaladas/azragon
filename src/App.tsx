import { useRef, useState, useCallback } from 'react';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameScene } from './GameScene';
import type { GameState, HudSnapshot, RunStats, UpgradeOffer } from './GameEvents';
import { Hud } from './ui/Hud';
import { LevelUpCards } from './ui/LevelUpCards';
import { GameOver } from './ui/GameOver';
import './style.css';

const EMPTY_HUD: HudSnapshot = { hp: 1, maxHp: 1, exp: 0, expToNext: 1, level: 1, timeSec: 0 };

function applySafeArea(el: HTMLElement): void {
  try {
    const { top, right, bottom, left } = RundotGameAPI.system.getSafeArea();
    el.style.setProperty('--safe-top', `${top}px`);
    el.style.setProperty('--safe-right', `${right}px`);
    el.style.setProperty('--safe-bottom', `${bottom}px`);
    el.style.setProperty('--safe-left', `${left}px`);
  } catch {
    // Safe area unavailable before SDK init; CSS env() fallbacks apply.
  }
}

function App() {
  const gameRef = useRef<GameScene | null>(null);
  const [state, setState] = useState<GameState>('loading');
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [offers, setOffers] = useState<UpgradeOffer[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [expPop, setExpPop] = useState<{ amount: number; key: number } | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (!container || gameRef.current) return;
    const game = new GameScene(container);
    gameRef.current = game;
    // Dev-only handle for scripted browser checks.
    if (import.meta.env.DEV) (window as unknown as { __game: GameScene }).__game = game;
    game.events.on('stateChange', setState);
    game.events.on('hud', setHud);
    game.events.on('levelUpOffer', setOffers);
    game.events.on('gameOver', setStats);
    game.events.on('expGain', (amount) => setExpPop((p) => ({ amount, key: (p?.key ?? 0) + 1 })));
    // The constructor already entered 'playing' before these subscriptions existed.
    setState(game.getState());
    try {
      RundotGameAPI.lifecycles.onPause(() => game.pause());
      RundotGameAPI.lifecycles.onResume(() => game.resume());
    } catch {
      // Lifecycle hooks unavailable outside the RUN host.
    }
  }, []);

  const hudRef = useCallback((el: HTMLDivElement | null) => {
    if (el) applySafeArea(el);
  }, []);

  const pick = useCallback((id: string) => gameRef.current?.chooseUpgrade(id), []);
  const restart = useCallback(() => {
    setStats(null);
    gameRef.current?.restart();
  }, []);

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div ref={hudRef} className="hud">
        {state !== 'loading' && <Hud hud={hud} expPop={expPop} />}
        {state === 'levelup' && offers.length > 0 && <LevelUpCards offers={offers} onPick={pick} />}
        {state === 'gameover' && stats && <GameOver stats={stats} onRestart={restart} />}
      </div>
    </div>
  );
}

export default App;
