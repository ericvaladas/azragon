import { useRef, useCallback } from 'react';
import { GameScene } from './GameScene';
import './style.css';

function App() {
  const gameRef = useRef<GameScene | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (container && !gameRef.current) {
      gameRef.current = new GameScene(container);
    }
  }, []);

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div className="hud" />
    </div>
  );
}

export default App;
