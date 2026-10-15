import { useRef, useState, useCallback } from 'react';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameScene } from './GameScene';
import type { GameState, HudSnapshot, RunStats, ThreatArrow, UpgradeOffer } from './GameEvents';
import { EdgeArrows } from './ui/EdgeArrows';
import { AbilityButtons } from './ui/AbilityButtons';
import type { AbilityView, ActiveId } from './systems/abilities';
import { Hud } from './ui/Hud';
import { LevelUpCards } from './ui/LevelUpCards';
import { PauseMenu } from './ui/PauseMenu';
import { PauseButton, showPauseButton } from './ui/PauseButton';
import { GameOver } from './ui/GameOver';
import { Title } from './ui/Title';
import { MonsterSelect } from './ui/MonsterSelect';
import type { RosterEntry } from './monsters/roster';
import type { PickStore } from './monsters/pick';
import './style.css';

/** Touch devices tap; desktops click or press a key. */
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const SKIP_HINT = TOUCH ? 'Tap to skip' : 'Click or press any key to skip';
const EMPTY_HUD: HudSnapshot = { hp: 1, maxHp: 1, exp: 0, expToNext: 1, level: 1, timeSec: 0, levelingUp: false };

/** RUN app storage for the remembered pick, or null outside the RUN host. */
function appStore(): PickStore | null {
  try {
    const s = RundotGameAPI.appStorage;
    return { getItem: (k) => s.getItem(k), setItem: (k, v) => s.setItem(k, v) };
  } catch {
    return null;
  }
}

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
  const [musicOn, setMusicOn] = useState(true);
  const [musicVolume, setMusicVolume] = useState(1);
  const [state, setState] = useState<GameState>('loading');
  const [skipHint, setSkipHint] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [offer, setOffer] = useState<{ seq: number; level: number; offers: UpgradeOffer[]; all: boolean } | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [threats, setThreats] = useState<ThreatArrow[]>([]);
  const [abilities, setAbilities] = useState<AbilityView[]>([]);
  const [roster, setRoster] = useState<{ entries: RosterEntry[]; index: number } | null>(null);
  const [expPop, setExpPop] = useState<{ amount: number; key: number } | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (!container || gameRef.current) return;
    const game = new GameScene(container, appStore());
    gameRef.current = game;
    // Dev-only handle for scripted browser checks.
    if (import.meta.env.DEV) (window as unknown as { __game: GameScene }).__game = game;
    game.events.on('stateChange', setState);
    game.events.on('music', setMusicOn);
    game.events.on('musicVolume', setMusicVolume);
    game.events.on('hud', setHud);
    game.events.on('levelUpOffer', setOffer);
    game.events.on('gameOver', setStats);
    game.events.on('threats', setThreats);
    game.events.on('abilities', setAbilities);
    game.events.on('roster', setRoster);
    game.events.on('skipHint', setSkipHint);
    game.events.on('expGain', (amount) => setExpPop((p) => ({ amount, key: (p?.key ?? 0) + 1 })));
    // The constructor already entered 'title' before these subscriptions existed.
    setState(game.getState());
    setMusicOn(game.isMusicOn());
    setMusicVolume(game.getMusicVolume());
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
  const step = useCallback((d: number) => gameRef.current?.selectStep(d), []);
  const play = useCallback(() => gameRef.current?.playSelected(), []);
  const changeMonster = useCallback(() => {
    setStats(null);
    gameRef.current?.changeMonster();
  }, []);
  const resume = useCallback(() => gameRef.current?.resume(), []);
  const openMenu = useCallback(() => gameRef.current?.togglePause(), []);
  const toggleMusic = useCallback(() => {
    const game = gameRef.current;
    if (game) game.setMusicOn(!game.isMusicOn());
  }, []);
  const changeVolume = useCallback((v: number) => gameRef.current?.setMusicVolume(v), []);
  const exitGame = useCallback(() => gameRef.current?.exitToTitle(), []);
  // Paused from the select screen is still a menu: no run HUD behind the pause menu.
  const under = state === 'paused' ? gameRef.current?.pausedFrom() : state;
  const inMenu = under === 'title' || under === 'select';

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div ref={hudRef} className="hud">
        {state === 'playing' && <EdgeArrows arrows={threats} />}
        {state !== 'loading' && state !== 'intro' && !inMenu && <Hud hud={hud} expPop={expPop} />}
        {state === 'title' && <Title />}
        {state === 'select' && roster && <MonsterSelect entries={roster.entries} index={roster.index} onStep={step} onPlay={play} />}
        {state === 'intro' && skipHint && <div className="skip-hint">{SKIP_HINT}</div>}
        {hud.levelingUp && <div className="level-up-banner">Level Up!</div>}
        {state === 'playing' && <AbilityButtons views={abilities} onPress={press} />}
        {state === 'levelup' && offer && (
          <LevelUpCards key={offer.seq} level={offer.level} offers={offer.offers} all={offer.all} onPick={(id) => pick(id, offer.seq)} />
        )}
        {showPauseButton(state, TOUCH) && <PauseButton onPress={openMenu} onSelect={state === 'select'} />}
        {state === 'paused' && <PauseMenu musicOn={musicOn} volume={musicVolume} onResume={resume} onToggleMusic={toggleMusic} onVolume={changeVolume} onExit={exitGame} />}
        {state === 'gameover' && stats && <GameOver stats={stats} onRestart={restart} onChangeMonster={changeMonster} />}
      </div>
    </div>
  );
}

export default App;
