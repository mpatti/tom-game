import React from 'react';
import { GameState, ChatMessage, Player } from './types';
import { COLORS, DASH_COOLDOWN, SHOOT_COOLDOWN } from './constants';

interface GameHUDProps {
  state: GameState;
  localPlayerId: string;
  chatMessages: ChatMessage[];
  pointerLocked: boolean;
}

export function GameHUD({ state, localPlayerId, chatMessages, pointerLocked }: GameHUDProps) {
  const localPlayer: Player | undefined = state.players[localPlayerId];
  const now = Date.now();

  // --- Score display ---
  const scoreDisplay = (
    <div className="hud-score">
      <span style={{ color: COLORS.blue.primary }}>{state.score.blue}</span>
      <span className="hud-score-divider"> - </span>
      <span style={{ color: COLORS.red.primary }}>{state.score.red}</span>
    </div>
  );

  // --- Cooldown bars ---
  const dashFraction = localPlayer
    ? Math.max(0, 1 - localPlayer.dashCooldown / DASH_COOLDOWN)
    : 1;
  const shootFraction = localPlayer
    ? Math.max(0, 1 - localPlayer.shootCooldown / SHOOT_COOLDOWN)
    : 1;

  const cooldownBars = localPlayer && localPlayer.state !== 'dead' ? (
    <div className="hud-cooldowns">
      <div className="hud-cooldown-row">
        <span className="hud-cooldown-label">DASH</span>
        <div className="hud-cooldown-bar">
          <div
            className="hud-cooldown-fill hud-cooldown-dash"
            style={{ width: `${dashFraction * 100}%` }}
          />
        </div>
      </div>
      <div className="hud-cooldown-row">
        <span className="hud-cooldown-label">FIRE</span>
        <div className="hud-cooldown-bar">
          <div
            className="hud-cooldown-fill hud-cooldown-shoot"
            style={{ width: `${shootFraction * 100}%` }}
          />
        </div>
      </div>
    </div>
  ) : null;

  // --- Power-up indicators ---
  const powerUpIndicators = localPlayer ? (
    <div className="hud-powerups">
      {localPlayer.shieldActive && (
        <div className="hud-powerup-item" style={{ color: COLORS.shield }}>
          SHIELD {Math.ceil(localPlayer.shieldTimer)}s
        </div>
      )}
      {localPlayer.speedBoostActive && (
        <div className="hud-powerup-item" style={{ color: COLORS.speed }}>
          SPEED {Math.ceil(localPlayer.speedBoostTimer)}s
        </div>
      )}
      {localPlayer.state === 'carrying' && (
        <div className="hud-powerup-item" style={{ color: '#ffff44' }}>
          FLAG CARRIER
        </div>
      )}
    </div>
  ) : null;

  // --- Chat messages (fade after 6s) ---
  const visibleChat = chatMessages.filter(msg => now - msg.timestamp < 6000);
  const chatDisplay = visibleChat.length > 0 ? (
    <div className="hud-chat">
      {visibleChat.slice(-5).map(msg => {
        const age = now - msg.timestamp;
        const opacity = age > 4000 ? Math.max(0, 1 - (age - 4000) / 2000) : 1;
        const teamClass = msg.team || 'system';
        return (
          <div
            key={msg.id}
            className={`hud-chat-msg ${teamClass}`}
            style={{ opacity }}
          >
            <span className="hud-chat-sender">{msg.sender}: </span>
            {msg.text}
          </div>
        );
      })}
    </div>
  ) : null;

  // --- Controls hint ---
  const hint = (
    <div className="hud-hint">
      WASD move | SPACE dash | MOUSE aim+shoot | ENTER chat
    </div>
  );

  // --- Event feed (top right) ---
  const eventFeed = state.events.length > 0 ? (
    <div className="hud-events">
      {state.events.map((evt, i) => (
        <div
          key={`evt-${i}-${evt.text}`}
          className="hud-event-item"
          style={{ color: evt.color, opacity: Math.min(1, evt.timer / 1) }}
        >
          {evt.text}
        </div>
      ))}
    </div>
  ) : null;

  // --- Countdown ---
  const countdownDisplay = state.gamePhase === 'countdown' && state.countdownTimer > 0 ? (
    <div className="hud-countdown">
      {Math.ceil(state.countdownTimer)}
    </div>
  ) : null;

  // --- Death overlay ---
  const deathOverlay = localPlayer && localPlayer.state === 'dead' ? (
    <div className="hud-death-overlay">
      <div className="hud-death-text">ELIMINATED</div>
      <div className="hud-death-timer">
        Respawning in {Math.ceil(localPlayer.respawnTimer)}...
      </div>
    </div>
  ) : null;

  // --- Game over ---
  const gameOverOverlay = state.gamePhase === 'gameover' ? (
    <div className="hud-gameover">
      <div className="hud-gameover-title">GAME OVER</div>
      <div
        className="hud-gameover-winner"
        style={{ color: state.winner === 'blue' ? COLORS.blue.primary : COLORS.red.primary }}
      >
        {state.winner?.toUpperCase()} TEAM WINS!
      </div>
      <div className="hud-gameover-score">
        {state.score.blue} - {state.score.red}
      </div>
    </div>
  ) : null;

  // --- Crosshair ---
  const crosshair = pointerLocked && localPlayer && localPlayer.state !== 'dead' ? (
    <div className="hud-crosshair" />
  ) : null;

  // --- Click to play ---
  const clickToPlay = !pointerLocked && state.gamePhase !== 'gameover' ? (
    <div className="hud-click-to-play">
      Click to play
    </div>
  ) : null;

  return (
    <div className="hud-overlay">
      {scoreDisplay}
      {cooldownBars}
      {powerUpIndicators}
      {chatDisplay}
      {hint}
      {eventFeed}
      {countdownDisplay}
      {deathOverlay}
      {gameOverOverlay}
      {crosshair}
      {clickToPlay}
    </div>
  );
}
