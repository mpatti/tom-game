'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameEngine } from '../../game/engine';
import { LobbyPlayer, ChatMessage } from '../../game/types';
import { LobbyUI } from '../../lobby/LobbyUI';
import { Matchmaker } from '../../lobby/matchmaker';
import { HostManager } from '../../network/host';
import { ClientManager } from '../../network/client';
import { PLAYER_NAMES } from '../../game/constants';

type GameScreen = 'lobby' | 'playing';

function GameContent() {
  const searchParams = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const matchmakerRef = useRef<Matchmaker | null>(null);
  const hostManagerRef = useRef<HostManager | null>(null);
  const clientManagerRef = useRef<ClientManager | null>(null);
  const gameStartedRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [screen, setScreen] = useState<GameScreen>('lobby');
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [myId, setMyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatText, setChatText] = useState('');

  const isSolo = searchParams.get('solo') === 'true';
  const roomParam = searchParams.get('room');

  // Solo mode or no Pusher: skip lobby, start immediately
  useEffect(() => {
    if (isSolo || !process.env.NEXT_PUBLIC_PUSHER_KEY) {
      setScreen('playing');
      return;
    }

    // Online mode: connect to Pusher lobby
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
      onCountdownUpdate: (value) => {
        setCountdown(value);
      },
      onChatMessage: (msg) => {
        setChatMessages(prev => {
          const updated = [...prev, msg];
          return updated.length > 50 ? updated.slice(-50) : updated;
        });
      },
    });

    matchmaker.joinLobby(roomParam || undefined);
    matchmakerRef.current = matchmaker;
    setRoomId(matchmaker.getRoomId());

    return () => {
      matchmaker.leave();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Game initialization - runs when screen changes to 'playing'
  useEffect(() => {
    if (screen !== 'playing' || gameStartedRef.current) return;

    // Wait for next frame to ensure canvas is mounted
    const timer = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      gameStartedRef.current = true;

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

      // Set up in-game chat toggle
      engine.input.onChatToggle = () => {
        setShowChatInput(prev => !prev);
      };

      // Click to resume AudioContext (browser requires user gesture)
      const handleClick = () => {
        engine.sounds.play('countdown');
      };
      canvas.addEventListener('click', handleClick, { once: true });
    });

    return () => {
      cancelAnimationFrame(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Focus chat input when it appears
  useEffect(() => {
    if (showChatInput && chatInputRef.current) {
      chatInputRef.current.focus();
      engineRef.current?.input.setChatInputActive(true);
    } else {
      engineRef.current?.input.setChatInputActive(false);
    }
  }, [showChatInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      hostManagerRef.current?.destroy();
      clientManagerRef.current?.destroy();
    };
  }, []);

  const handleToggleReady = useCallback(() => {
    matchmakerRef.current?.toggleReady();
  }, []);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/game?room=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => {
      prompt('Share this link:', url);
    });
  }, [roomId]);

  const handleSendLobbyChat = useCallback((text: string) => {
    matchmakerRef.current?.sendChat(text);
  }, []);

  const handleSendGameChat = useCallback(() => {
    if (!chatText.trim()) {
      setShowChatInput(false);
      return;
    }

    const engine = engineRef.current;
    const matchmaker = matchmakerRef.current;
    if (engine) {
      const localPlayer = engine.state.players[engine.localPlayerId];
      const msg: ChatMessage = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: localPlayer?.name || 'Unknown',
        text: chatText.trim().substring(0, 100),
        team: localPlayer?.team || null,
        timestamp: Date.now(),
      };
      engine.addChatMessage(msg);

      // Send over network
      if (matchmaker) {
        matchmaker.sendChat(chatText.trim());
      }
    }

    setChatText('');
    setShowChatInput(false);
  }, [chatText]);

  if (screen === 'lobby') {
    return (
      <LobbyUI
        players={players}
        myId={myId}
        roomId={roomId}
        countdown={countdown}
        messages={chatMessages}
        onToggleReady={handleToggleReady}
        onCopyLink={handleCopyLink}
        onSendChat={handleSendLobbyChat}
      />
    );
  }

  return (
    <div className="game-container" tabIndex={0}>
      <canvas ref={canvasRef} />
      {showChatInput && (
        <div className="game-chat-overlay">
          <input
            ref={chatInputRef}
            className="game-chat-input"
            placeholder="Type a message..."
            value={chatText}
            onChange={e => setChatText(e.target.value.substring(0, 100))}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendGameChat();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setChatText('');
                setShowChatInput(false);
              }
            }}
            maxLength={100}
          />
        </div>
      )}
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
