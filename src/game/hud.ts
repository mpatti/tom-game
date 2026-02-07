import { GameState, Player, ChatMessage } from './types';
import { COLORS, DASH_COOLDOWN, SHOOT_COOLDOWN } from './constants';

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  localPlayer: Player | null,
  canvasWidth: number,
  canvasHeight: number,
  chatMessages?: ChatMessage[]
) {
  ctx.save();

  // Score display - top center
  const scoreY = 20;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';

  // Blue score
  ctx.fillStyle = COLORS.blue.primary;
  ctx.fillText(`BLUE ${state.score.blue}`, canvasWidth / 2 - 80, scoreY + 20);

  // Dash
  ctx.fillStyle = '#ffffff';
  ctx.fillText('-', canvasWidth / 2, scoreY + 20);

  // Red score
  ctx.fillStyle = COLORS.red.primary;
  ctx.fillText(`${state.score.red} RED`, canvasWidth / 2 + 80, scoreY + 20);

  // Dash cooldown bar - bottom center
  if (localPlayer && localPlayer.state !== 'dead') {
    const barWidth = 120;
    const barHeight = 8;
    const barX = canvasWidth / 2 - barWidth / 2;
    const barY = canvasHeight - 40;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

    // Fill
    const dashPct = Math.max(0, 1 - localPlayer.dashCooldown / DASH_COOLDOWN);
    const fillColor = dashPct >= 1 ? '#44ff44' : '#888888';
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, barWidth * dashPct, barHeight);

    // Label
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(dashPct >= 1 ? 'DASH READY [SPACE]' : 'DASH', canvasWidth / 2, barY - 6);

    // Shoot cooldown indicator (small bar below dash)
    const shootBarY = barY + 14;
    const shootPct = Math.max(0, 1 - localPlayer.shootCooldown / SHOOT_COOLDOWN);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX + 20, shootBarY, barWidth - 40, 4);
    ctx.fillStyle = shootPct >= 1 ? '#ffff44' : '#666666';
    ctx.fillRect(barX + 20, shootBarY, (barWidth - 40) * shootPct, 4);

    // Active power-ups
    let puX = canvasWidth / 2 - 60;
    const puY = canvasHeight - 70;
    if (localPlayer.speedBoostActive) {
      ctx.fillStyle = COLORS.speed;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SPEED ${Math.ceil(localPlayer.speedBoostTimer)}s`, puX, puY);
      puX += 80;
    }
    if (localPlayer.shieldActive) {
      ctx.fillStyle = COLORS.shield;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SHIELD ${Math.ceil(localPlayer.shieldTimer)}s`, puX, puY);
    }
  }

  // Dead overlay
  if (localPlayer && localPlayer.state === 'dead') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'center';
    ctx.fillText('ELIMINATED!', canvasWidth / 2, canvasHeight / 2 - 20);
    ctx.font = '18px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Respawning in ${Math.ceil(localPlayer.respawnTimer)}...`, canvasWidth / 2, canvasHeight / 2 + 20);
  }

  // Event feed - top right
  ctx.textAlign = 'right';
  ctx.font = '14px monospace';
  for (let i = 0; i < state.events.length; i++) {
    const ev = state.events[i];
    ctx.globalAlpha = Math.min(1, ev.timer);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    const textWidth = ctx.measureText(ev.text).width;
    ctx.fillRect(canvasWidth - textWidth - 20, 50 + i * 22 - 14, textWidth + 10, 20);
    ctx.fillStyle = ev.color;
    ctx.fillText(ev.text, canvasWidth - 15, 50 + i * 22);
  }
  ctx.globalAlpha = 1;

  // Player count at top left
  const bluePlayers = Object.values(state.players).filter(p => p.team === 'blue');
  const redPlayers = Object.values(state.players).filter(p => p.team === 'red');
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.blue.primary;
  ctx.fillText(`Blue: ${bluePlayers.length}`, 15, 50);
  ctx.fillStyle = COLORS.red.primary;
  ctx.fillText(`Red: ${redPlayers.length}`, 15, 66);

  // In-game chat messages - bottom left above controls hint
  if (chatMessages && chatMessages.length > 0 && state.gamePhase === 'playing') {
    const now = Date.now();
    const recentMsgs = chatMessages
      .filter(m => now - m.timestamp < 8000)
      .slice(-5);

    if (recentMsgs.length > 0) {
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      const chatY = canvasHeight - 80;

      for (let i = 0; i < recentMsgs.length; i++) {
        const msg = recentMsgs[i];
        const age = now - msg.timestamp;
        const alpha = age > 6000 ? Math.max(0, 1 - (age - 6000) / 2000) : 1;

        ctx.globalAlpha = alpha * 0.7;
        const text = `${msg.sender}: ${msg.text}`;
        const textW = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(12, chatY - 14 - (recentMsgs.length - 1 - i) * 18, textW + 8, 16);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = msg.team === 'blue' ? COLORS.blue.light : msg.team === 'red' ? COLORS.red.light : '#cccccc';
        ctx.fillText(text, 15, chatY - 3 - (recentMsgs.length - 1 - i) * 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Countdown
  if (state.gamePhase === 'countdown') {
    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(state.countdownTimer).toString(), canvasWidth / 2, canvasHeight / 2);
  }

  // Game over
  if (state.gamePhase === 'gameover' && state.winner) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = state.winner === 'blue' ? COLORS.blue.primary : COLORS.red.primary;
    ctx.textAlign = 'center';
    ctx.fillText(`${state.winner.toUpperCase()} WINS!`, canvasWidth / 2, canvasHeight / 2 - 20);
    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${state.score.blue} - ${state.score.red}`, canvasWidth / 2, canvasHeight / 2 + 30);
    ctx.font = '16px monospace';
    ctx.fillText('Returning to lobby...', canvasWidth / 2, canvasHeight / 2 + 60);
  }

  // Controls hint
  if (state.gamePhase === 'playing' && localPlayer?.state === 'alive') {
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'left';
    ctx.fillText('WASD: Move  SPACE: Dash  CLICK: Shoot  ENTER: Chat', 15, canvasHeight - 15);
  }

  ctx.restore();
}
