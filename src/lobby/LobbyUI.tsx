'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LobbyPlayer, ChatMessage } from '../game/types';

interface LobbyUIProps {
  players: LobbyPlayer[];
  myId: string;
  roomId: string;
  countdown: number;
  messages: ChatMessage[];
  onToggleReady: () => void;
  onCopyLink: () => void;
  onSendChat: (text: string) => void;
}

export function LobbyUI({ players, myId, roomId, countdown, messages, onToggleReady, onCopyLink, onSendChat }: LobbyUIProps) {
  const bluePlayers = players.filter(p => p.team === 'blue');
  const redPlayers = players.filter(p => p.team === 'red');
  const me = players.find(p => p.id === myId);
  const amReady = me?.ready || false;
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendChat = useCallback(() => {
    if (chatText.trim()) {
      onSendChat(chatText.trim());
      setChatText('');
    }
  }, [chatText, onSendChat]);

  return (
    <div className="lobby-container">
      <h2 className="lobby-title">
        {countdown > 0 ? '' : 'WAITING FOR PLAYERS'}
      </h2>
      {countdown > 0 && (
        <div className="lobby-countdown">{countdown}</div>
      )}
      <p className="lobby-room">Room: {roomId}</p>

      <div className="lobby-teams">
        <div className="lobby-team blue">
          <h3>BLUE TEAM</h3>
          {[0, 1, 2].map(i => (
            <div key={i} className={`lobby-slot ${bluePlayers[i] ? 'filled' : 'empty'}`}>
              {bluePlayers[i] ? (
                <>
                  <span className="player-name">
                    <span className={`ready-indicator ${bluePlayers[i].ready ? 'is-ready' : ''}`}>
                      {bluePlayers[i].ready ? '\u2713' : '\u25CB'}
                    </span>
                    {bluePlayers[i].name}
                  </span>
                  {bluePlayers[i].id === myId && <span className="you-tag">YOU</span>}
                </>
              ) : (
                <span className="waiting">Waiting...</span>
              )}
            </div>
          ))}
        </div>

        <div className="lobby-vs">VS</div>

        <div className="lobby-team red">
          <h3>RED TEAM</h3>
          {[0, 1, 2].map(i => (
            <div key={i} className={`lobby-slot ${redPlayers[i] ? 'filled' : 'empty'}`}>
              {redPlayers[i] ? (
                <>
                  <span className="player-name">
                    <span className={`ready-indicator ${redPlayers[i].ready ? 'is-ready' : ''}`}>
                      {redPlayers[i].ready ? '\u2713' : '\u25CB'}
                    </span>
                    {redPlayers[i].name}
                  </span>
                  {redPlayers[i].id === myId && <span className="you-tag">YOU</span>}
                </>
              ) : (
                <span className="waiting">Waiting...</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="lobby-actions">
        <button className="lobby-btn share" onClick={onCopyLink}>
          Copy Invite Link
        </button>
        <button
          className={`lobby-btn ${amReady ? 'ready' : 'not-ready'}`}
          onClick={onToggleReady}
        >
          {amReady ? 'READY \u2713' : 'READY UP'}
        </button>
      </div>

      <p className="lobby-hint">
        {countdown > 0
          ? 'Game starting...'
          : players.length < 2
            ? 'Share the link to invite players'
            : players.every(p => p.ready)
              ? 'All players ready!'
              : 'Click READY UP when you\'re set'}
      </p>

      {/* Chat Panel */}
      <div className="chat-panel">
        <div className="chat-messages">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-msg ${msg.team || 'system'}`}
            >
              <span className="chat-sender">{msg.sender}:</span> {msg.text}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="Type a message..."
            value={chatText}
            onChange={e => setChatText(e.target.value.substring(0, 100))}
            onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            maxLength={100}
          />
          <button className="chat-send-btn" onClick={handleSendChat}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
