'use client';

import { useState, useEffect, useCallback } from 'react';
import { LobbyPlayer } from '../game/types';

interface LobbyUIProps {
  players: LobbyPlayer[];
  myId: string;
  roomId: string;
  onStartGame: () => void;
  onCopyLink: () => void;
}

export function LobbyUI({ players, myId, roomId, onStartGame, onCopyLink }: LobbyUIProps) {
  const bluePlayers = players.filter(p => p.team === 'blue');
  const redPlayers = players.filter(p => p.team === 'red');
  const canStart = players.length >= 2; // Allow 2+ for testing (6 for full game)

  return (
    <div className="lobby-container">
      <h2 className="lobby-title">WAITING FOR PLAYERS</h2>
      <p className="lobby-room">Room: {roomId}</p>

      <div className="lobby-teams">
        <div className="lobby-team blue">
          <h3>BLUE TEAM</h3>
          {[0, 1, 2].map(i => (
            <div key={i} className={`lobby-slot ${bluePlayers[i] ? 'filled' : 'empty'}`}>
              {bluePlayers[i] ? (
                <>
                  <span className="player-name">{bluePlayers[i].name}</span>
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
                  <span className="player-name">{redPlayers[i].name}</span>
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
        {canStart && (
          <button className="lobby-btn start" onClick={onStartGame}>
            Start Game {players.length < 6 ? `(${players.length}/6)` : ''}
          </button>
        )}
      </div>

      <p className="lobby-hint">
        {players.length < 6
          ? `Share the link to invite players (${players.length}/6)`
          : 'Full lobby! Starting soon...'}
      </p>
    </div>
  );
}
