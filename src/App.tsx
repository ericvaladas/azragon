import { useRef, useState, useCallback } from 'react';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameScene } from './GameScene';
import type { GameState, HudSnapshot, RunStats, ThreatArrow, UpgradeOffer } from './GameEvents';
import { EdgeArrows } from './ui/EdgeArrows';
import { AbilityButtons } from './ui/AbilityButtons';
import type { AbilityView, ActiveId } from './systems/abilities';
import { Hud } from './ui/Hud';
import { LevelUpCards } from './ui/LevelUpCards';
import { GameOver } from './ui/GameOver';
import './style.css';

const EMPTY_HUD: HudSnapshot = { hp: 1, maxHp: 1, exp: 0, expToNext: 1, level: 1, timeSec: 0, levelingUp: false };

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
  const [offer, setOffer] = useState<{ seq: number; offers: UpgradeOffer[] } | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [threats, setThreats] = useState<ThreatArrow[]>([]);
  const [abilities, setAbilities] = useState<AbilityView[]>([]);
  const [expPop, setExpPop] = useState<{ amount: number; key: number } | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (!container || gameRef.current) return;
    const game = new GameScene(container);
    gameRef.current = game;
    // Dev-only handle for scripted browser checks.
    if (import.meta.env.DEV) (window as unknown as { __game: GameScene }).__game = game;
    game.events.on('stateChange', setState);
    game.events.on('hud', setHud);
    game.events.on('levelUpOffer', setOffer);
    game.events.on('gameOver', setStats);
    game.events.on('threats', setThreats);
    game.events.on('abilities', setAbilities);
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

  const pick = useCallback((id: string, seq: number) => gameRef.current?.chooseUpgrade(id, seq), []);
  const press = useCallback((id: ActiveId) => gameRef.current?.pressAbility(id), []);
  const restart = useCallback(() => {
    setStats(null);
    gameRef.current?.restart();
  }, []);

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div ref={hudRef} className="hud">
        {state === 'playing' && <EdgeArrows arrows={threats} />}
        {state !== 'loading' && <Hud hud={hud} expPop={expPop} />}
        {hud.levelingUp && <div className="level-up-banner">Level Up!</div>}
        {state === 'playing' && <AbilityButtons views={abilities} onPress={press} />}
        {state === 'levelup' && offer && (
          <LevelUpCards key={offer.seq} offers={offer.offers} onPick={(id) => pick(id, offer.seq)} />
        )}
        {state === 'gameover' && stats && <GameOver stats={stats} onRestart={restart} />}
      </div>
    </div>
  );
}

export default App;
