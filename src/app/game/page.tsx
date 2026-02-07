'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameEngine } from '../../game/engine';
import { LobbyPlayer, ChatMessage, GameState } from '../../game/types';
import { LobbyUI } from '../../lobby/LobbyUI';
import { Matchmaker } from '../../lobby/matchmaker';
import { HostManager } from '../../network/host';
import { ClientManager } from '../../network/client';
import { PLAYER_NAMES, MAP_COLS, MAP_ROWS } from '../../game/constants';
import { GameHUD } from '../../game/GameHUD';
import { MAP_DATA } from '../../game/map';

type GameScreen = 'lobby' | 'playing';

function GameContent() {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const matchmakerRef = useRef<Matchmaker | null>(null);
  const hostManagerRef = useRef<HostManager | null>(null);
  const clientManagerRef = useRef<ClientManager | null>(null);
  const gameStartedRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const hudPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [screen, setScreen] = useState<GameScreen>('lobby');
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [myId, setMyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatText, setChatText] = useState('');
  const [pointerLocked, setPointerLocked] = useState(false);

  // HUD state polled from engine
  const [hudState, setHudState] = useState<GameState | null>(null);
  const [hudChatMessages, setHudChatMessages] = useState<ChatMessage[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState('');

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
  }, []);

  // Game initialization - runs when screen changes to 'playing'
  useEffect(() => {
    if (screen !== 'playing' || gameStartedRef.current) return;

    const timer = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      gameStartedRef.current = true;

      const container = containerRef.current;
      const playerId = myId || `local-${Math.random().toString(36).substring(2, 9)}`;
      setLocalPlayerId(playerId);

      const engine = new GameEngine(container, playerId);
      engineRef.current = engine;

      // Pointer lock callback
      engine.input.onPointerLockChange = (locked: boolean) => {
        setPointerLocked(locked);
      };

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
          players.forEach((p, i) => {
            const team = p.team || (i % 2 === 0 ? 'blue' : 'red');
            const teamIndex = players.filter((pp, j) => j < i && (pp.team || (j % 2 === 0 ? 'blue' : 'red')) === team).length;
            engine.addPlayer(p.id, p.name, team, teamIndex);
          });

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

          channel.bind('pusher:member_removed', (member: { id: string }) => {
            engine.removePlayer(member.id);

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

      // HUD polling at ~30fps
      hudPollRef.current = setInterval(() => {
        if (engineRef.current) {
          setHudState({ ...engineRef.current.getState() });
          setHudChatMessages([...engineRef.current.getChatMessages()]);
        }
      }, 33);
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

  // Minimap drawing
  useEffect(() => {
    if (!hudState || !minimapRef.current) return;
    const canvas = minimapRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const scaleX = w / MAP_COLS;
    const scaleY = h / MAP_ROWS;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);

    // Walls
    ctx.fillStyle = '#444466';
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (MAP_DATA[row]?.[col] === 1) {
          ctx.fillRect(col * scaleX, row * scaleY, scaleX, scaleY);
        }
      }
    }

    // Flags
    const blueFlag = hudState.flags.blue;
    const redFlag = hudState.flags.red;
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(blueFlag.x * scaleX - 2, blueFlag.z * scaleY - 2, 4, 4);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(redFlag.x * scaleX - 2, redFlag.z * scaleY - 2, 4, 4);

    // Players
    for (const player of Object.values(hudState.players)) {
      if (player.state === 'dead') continue;
      ctx.fillStyle = player.team === 'blue' ? '#4488ff' : '#ff4444';
      if (player.id === localPlayerId) {
        // Local player: slightly larger, white outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x * scaleX, player.z * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Direction indicator
        const dirLen = 6;
        const dirX = -Math.sin(player.yaw) * dirLen;
        const dirZ = -Math.cos(player.yaw) * dirLen;
        ctx.beginPath();
        ctx.moveTo(player.x * scaleX, player.z * scaleY);
        ctx.lineTo(player.x * scaleX + dirX, player.z * scaleY + dirZ);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(player.x * scaleX, player.z * scaleY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [hudState, localPlayerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hudPollRef.current) clearInterval(hudPollRef.current);
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
      const localP = engine.state.players[engine.localPlayerId];
      const msg: ChatMessage = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: localP?.name || 'Unknown',
        text: chatText.trim().substring(0, 100),
        team: localP?.team || null,
        timestamp: Date.now(),
      };
      engine.addChatMessage(msg);

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
      <div ref={containerRef} className="game-canvas-container" />

      {/* HUD overlay */}
      {hudState && (
        <GameHUD
          state={hudState}
          localPlayerId={localPlayerId}
          chatMessages={hudChatMessages}
          pointerLocked={pointerLocked}
        />
      )}

      {/* Minimap */}
      <canvas
        ref={minimapRef}
        className="hud-minimap"
        width={160}
        height={100}
      />

      {/* Chat input overlay */}
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
