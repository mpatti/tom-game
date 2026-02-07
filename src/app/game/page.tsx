'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { GameEngine } from '../../game/engine';
import { LobbyPlayer } from '../../game/types';
import { LobbyUI } from '../../lobby/LobbyUI';
import { Matchmaker } from '../../lobby/matchmaker';
import { HostManager } from '../../network/host';
import { ClientManager } from '../../network/client';
import { PresenceChannel } from 'pusher-js';
import { COUNTDOWN_TIME, PLAYER_NAMES } from '../../game/constants';

type GameScreen = 'lobby' | 'playing';

function GameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const matchmakerRef = useRef<Matchmaker | null>(null);
  const hostManagerRef = useRef<HostManager | null>(null);
  const clientManagerRef = useRef<ClientManager | null>(null);

  const [screen, setScreen] = useState<GameScreen>('lobby');
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [myId, setMyId] = useState('');
  const [roomId, setRoomId] = useState('');

  const isSolo = searchParams.get('solo') === 'true';
  const roomParam = searchParams.get('room');

  // Solo mode: skip lobby, start immediately with bots
  useEffect(() => {
    if (isSolo) {
      setScreen('playing');
    }
  }, [isSolo]);

  // Online mode: connect to Pusher lobby
  useEffect(() => {
    if (isSolo || screen !== 'lobby') return;

    // Check if Pusher keys are configured
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      // No Pusher keys - fall back to solo mode
      console.warn('Pusher not configured, falling back to solo mode');
      setScreen('playing');
      return;
    }

    const matchmaker = new Matchmaker({
      onPlayersUpdate: (newPlayers, id) => {
        setPlayers(newPlayers);
        setMyId(id);
      },
      onGameStart: (room, gamePlayers, id) => {
        setRoomId(room);
        setMyId(id);
        setPlayers(gamePlayers);
        setScreen('playing');
      },
      onError: (error) => {
        console.error('Matchmaker error:', error);
      },
    });

    matchmaker.joinLobby(roomParam || undefined);
    matchmakerRef.current = matchmaker;
    setRoomId(matchmaker.getRoomId());

    return () => {
      matchmaker.leave();
    };
  }, [isSolo, roomParam, screen]);

  // Game initialization
  useEffect(() => {
    if (screen !== 'playing' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const playerId = myId || `local-${Math.random().toString(36).substring(2, 9)}`;
    const engine = new GameEngine(canvas, playerId);
    engineRef.current = engine;

    if (isSolo || !process.env.NEXT_PUBLIC_PUSHER_KEY) {
      // Solo mode with bots
      const playerName = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
      engine.addPlayer(playerId, playerName, 'blue', 0);
      engine.addBots();
      engine.startCountdown();
      engine.start();
    } else {
      // Online mode
      const channel = matchmakerRef.current?.getChannel();
      if (channel) {
        // Add all lobby players to the game
        players.forEach((p, i) => {
          const team = p.team || (i % 2 === 0 ? 'blue' : 'red');
          const teamIndex = players.filter((pp, j) => j < i && (pp.team || (j % 2 === 0 ? 'blue' : 'red')) === team).length;
          engine.addPlayer(p.id, p.name, team, teamIndex);
        });

        // Determine if we're the host (alphabetically first member)
        const sortedIds = players.map(p => p.id).sort();
        const isHost = sortedIds[0] === playerId;

        if (isHost) {
          const hostManager = new HostManager(channel, engine);
          hostManagerRef.current = hostManager;
          engine.startCountdown();
          hostManager.startBroadcasting();
        } else {
          const clientManager = new ClientManager(channel, engine, playerId);
          clientManagerRef.current = clientManager;
        }

        // Handle player disconnect
        channel.bind('pusher:member_removed', (member: { id: string }) => {
          engine.removePlayer(member.id);

          // Check if we need to become host
          const remainingIds = Object.keys(engine.state.players).sort();
          if (remainingIds[0] === playerId && !hostManagerRef.current) {
            // We're now the host
            clientManagerRef.current?.destroy();
            clientManagerRef.current = null;
            const hostManager = new HostManager(channel, engine);
            hostManagerRef.current = hostManager;
            hostManager.startBroadcasting();
          }
        });

        engine.start();
      } else {
        // Fallback to solo if no channel
        const playerName = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
        engine.addPlayer(playerId, playerName, 'blue', 0);
        engine.addBots();
        engine.startCountdown();
        engine.start();
      }
    }

    // Click to resume AudioContext (browser requires user gesture)
    const handleClick = () => {
      engine.sounds.play('countdown');
    };
    canvas.addEventListener('click', handleClick, { once: true });

    return () => {
      engine.stop();
      hostManagerRef.current?.destroy();
      clientManagerRef.current?.destroy();
      canvas.removeEventListener('click', handleClick);
    };
  }, [screen, isSolo, myId, players]);

  const handleStartGame = useCallback(() => {
    matchmakerRef.current?.triggerStart();
  }, []);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/game?room=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback
      prompt('Share this link:', url);
    });
  }, [roomId]);

  if (screen === 'lobby') {
    return (
      <LobbyUI
        players={players}
        myId={myId}
        roomId={roomId}
        onStartGame={handleStartGame}
        onCopyLink={handleCopyLink}
      />
    );
  }

  return (
    <div className="game-container" tabIndex={0}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="loading"><p className="loading-text">Loading...</p></div>}>
      <GameContent />
    </Suspense>
  );
}
