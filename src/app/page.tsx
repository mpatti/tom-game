'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Screen = 'landing' | 'lobby';

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');

  const handlePlay = useCallback(() => {
    // Generate a random room code and go to lobby
    const code = Math.random().toString(36).substring(2, 8);
    router.push(`/game?room=${code}`);
  }, [router]);

  const handleSoloPlay = useCallback(() => {
    router.push('/game?solo=true');
  }, [router]);

  const handleJoin = useCallback(() => {
    if (roomCode.trim()) {
      router.push(`/game?room=${roomCode.trim()}`);
    }
  }, [router, roomCode]);

  return (
    <div className="landing">
      <h1 className="landing-title">Capture<br/>The Flag</h1>
      <p className="landing-subtitle">3 v 3 Multiplayer</p>

      <button className="play-btn" onClick={handlePlay}>
        Play Online
      </button>

      <button className="solo-btn" onClick={handleSoloPlay}>
        Practice vs Bots
      </button>

      <div className="join-section">
        <input
          className="join-input"
          placeholder="Room code..."
          value={roomCode}
          onChange={e => setRoomCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        <button className="join-btn" onClick={handleJoin}>
          Join
        </button>
      </div>

      <div className="landing-info">
        <div>
          <span>WASD</span>
          Move
        </div>
        <div>
          <span>SPACE</span>
          Dash
        </div>
        <div>
          <span>3</span>
          Captures to Win
        </div>
      </div>
    </div>
  );
}
