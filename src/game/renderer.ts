import { GameState, Player, Flag, PowerUp, TILE_SIZE, MAP_COLS, MAP_ROWS } from './types';
import { COLORS, PLAYER_RADIUS } from './constants';
import { MAP_DATA, getTile } from './map';
import { Sprites } from './sprites';
import { ParticleSystem } from './particles';
import { Camera } from './camera';
import { drawHUD } from './hud';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private mapCanvas: HTMLCanvasElement | null = null;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.mapCanvas = null; // Force redraw
  }

  private renderMapToCache() {
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = MAP_COLS * TILE_SIZE;
    mapCanvas.height = MAP_ROWS * TILE_SIZE;
    const mctx = mapCanvas.getContext('2d')!;
    mctx.imageSmoothingEnabled = false;

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const tile = getTile(col, row);
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (tile === 1) {
          // Wall
          const variant = (col * 7 + row * 13) % 4;
          const sprite = Sprites.wall(variant);
          mctx.drawImage(sprite, x, y);
        } else {
          // Floor
          const variant = (col * 3 + row * 7) % 8;
          const sprite = Sprites.floor(variant);
          mctx.drawImage(sprite, x, y);

          // Base tinting
          if (tile === 2) {
            mctx.fillStyle = COLORS.blue.base;
            mctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          } else if (tile === 3) {
            mctx.fillStyle = COLORS.red.base;
            mctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    this.mapCanvas = mapCanvas;
  }

  render(
    state: GameState,
    camera: Camera,
    particles: ParticleSystem,
    localPlayerId: string
  ) {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const cx = camera.scrollX;
    const cy = camera.scrollY;

    // Draw map (cached)
    if (!this.mapCanvas) this.renderMapToCache();
    if (this.mapCanvas) {
      ctx.drawImage(this.mapCanvas, -cx, -cy);
    }

    // Draw base zone highlights (pulsing)
    const pulse = 0.5 + Math.sin(Date.now() / 500) * 0.15;
    this.drawBaseZone(cx, cy, 'blue', pulse);
    this.drawBaseZone(cx, cy, 'red', pulse);

    // Draw power-ups
    for (const pu of state.powerUps) {
      if (!pu.active) continue;
      this.drawPowerUp(pu, cx, cy);
    }

    // Draw flags (only if not being carried)
    if (!state.flags.blue.carrierId) this.drawFlag(state.flags.blue, cx, cy);
    if (!state.flags.red.carrierId) this.drawFlag(state.flags.red, cx, cy);

    // Draw players (sorted by y for depth)
    const sortedPlayers = Object.values(state.players).sort((a, b) => a.y - b.y);
    for (const player of sortedPlayers) {
      this.drawPlayer(player, cx, cy, player.id === localPlayerId);
    }

    // Draw particles
    particles.draw(ctx, cx, cy);

    // Draw player names
    for (const player of sortedPlayers) {
      if (player.state === 'dead') continue;
      this.drawPlayerName(player, cx, cy, player.id === localPlayerId);
    }

    // HUD
    const localPlayer = state.players[localPlayerId] || null;
    drawHUD(ctx, state, localPlayer, this.width, this.height);

    // Minimap
    this.drawMinimap(state, localPlayerId);
  }

  private drawBaseZone(cx: number, cy: number, team: 'blue' | 'red', pulse: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = pulse * 0.1;
    ctx.fillStyle = team === 'blue' ? COLORS.blue.primary : COLORS.red.primary;

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const tile = MAP_DATA[row]?.[col];
        if ((team === 'blue' && tile === 2) || (team === 'red' && tile === 3)) {
          ctx.fillRect(col * TILE_SIZE - cx, row * TILE_SIZE - cy, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    ctx.restore();
  }

  private drawFlag(flag: Flag, cx: number, cy: number) {
    const sprite = Sprites.flag(flag.team, flag.animFrame);
    const screenX = Math.floor(flag.x - cx - 8);
    const screenY = Math.floor(flag.y - cy - 40);
    this.ctx.drawImage(sprite, screenX, screenY);

    // Glow effect
    this.ctx.save();
    this.ctx.globalAlpha = 0.15 + Math.sin(Date.now() / 300) * 0.1;
    this.ctx.fillStyle = flag.team === 'blue' ? COLORS.blue.primary : COLORS.red.primary;
    this.ctx.beginPath();
    this.ctx.arc(Math.floor(flag.x - cx), Math.floor(flag.y - cy - 16), 18, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Return timer
    if (flag.dropTimer > 0) {
      this.ctx.font = '12px monospace';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        Math.ceil(flag.dropTimer).toString(),
        Math.floor(flag.x - cx),
        Math.floor(flag.y - cy - 48)
      );
    }
  }

  private drawPlayer(player: Player, cx: number, cy: number, isLocal: boolean) {
    const ctx = this.ctx;
    const screenX = Math.floor(player.x - cx);
    const screenY = Math.floor(player.y - cy);

    if (player.state === 'dead') {
      // Ghost effect
      ctx.save();
      ctx.globalAlpha = 0.3;
      const sprite = Sprites.player(player.team, 0, false, false);
      ctx.drawImage(sprite, screenX - 16, screenY - 16);
      ctx.restore();
      return;
    }

    // Flash effect (when recently tagged, or dying)
    if (player.flashTimer > 0 && Math.floor(player.flashTimer * 10) % 2 === 0) {
      return; // Blink
    }

    // Dash trail (afterimages)
    if (player.isDashing) {
      ctx.save();
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.1 * i;
        const trailX = screenX - player.vx * 0.005 * i;
        const trailY = screenY - player.vy * 0.005 * i;
        const sprite = Sprites.player(player.team, player.animFrame, player.state === 'carrying', player.shieldActive);
        ctx.drawImage(sprite, Math.floor(trailX - 16), Math.floor(trailY - 16));
      }
      ctx.restore();
    }

    // Main sprite
    const sprite = Sprites.player(player.team, player.animFrame, player.state === 'carrying', player.shieldActive);
    ctx.drawImage(sprite, screenX - 16, screenY - 16);

    // Speed boost glow
    if (player.speedBoostActive) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = COLORS.speed;
      ctx.beginPath();
      ctx.arc(screenX, screenY, PLAYER_RADIUS + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Local player indicator
    if (isLocal) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      // Small triangle above head
      ctx.moveTo(screenX, screenY - 24);
      ctx.lineTo(screenX - 4, screenY - 30);
      ctx.lineTo(screenX + 4, screenY - 30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPlayerName(player: Player, cx: number, cy: number, isLocal: boolean) {
    const ctx = this.ctx;
    const screenX = Math.floor(player.x - cx);
    const screenY = Math.floor(player.y - cy);

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isLocal ? '#ffffff' : (player.team === 'blue' ? COLORS.blue.light : COLORS.red.light);
    ctx.fillText(player.name, screenX, screenY - 22);
  }

  private drawPowerUp(pu: PowerUp, cx: number, cy: number) {
    const frame = pu.animTimer > 0.25 ? 1 : 0;
    const sprite = Sprites.powerUp(pu.type, frame);
    const screenX = Math.floor(pu.x - cx - 12);
    const screenY = Math.floor(pu.y - cy - 12);
    this.ctx.drawImage(sprite, screenX, screenY);
  }

  private drawMinimap(state: GameState, localPlayerId: string) {
    const ctx = this.ctx;
    const mmWidth = 120;
    const mmHeight = 75;
    const mmX = this.width - mmWidth - 10;
    const mmY = this.height - mmHeight - 10;
    const scaleX = mmWidth / (MAP_COLS * TILE_SIZE);
    const scaleY = mmHeight / (MAP_ROWS * TILE_SIZE);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(mmX - 1, mmY - 1, mmWidth + 2, mmHeight + 2);

    // Walls (simplified)
    ctx.fillStyle = 'rgba(100, 100, 120, 0.5)';
    for (let row = 0; row < MAP_ROWS; row += 2) {
      for (let col = 0; col < MAP_COLS; col += 2) {
        if (MAP_DATA[row]?.[col] === 1) {
          ctx.fillRect(
            mmX + col * TILE_SIZE * scaleX,
            mmY + row * TILE_SIZE * scaleY,
            TILE_SIZE * 2 * scaleX,
            TILE_SIZE * 2 * scaleY
          );
        }
      }
    }

    // Flags
    for (const flag of [state.flags.blue, state.flags.red]) {
      ctx.fillStyle = flag.team === 'blue' ? COLORS.blue.primary : COLORS.red.primary;
      ctx.fillRect(mmX + flag.x * scaleX - 2, mmY + flag.y * scaleY - 2, 4, 4);
    }

    // Players
    for (const player of Object.values(state.players)) {
      if (player.state === 'dead') continue;
      const isLocal = player.id === localPlayerId;
      ctx.fillStyle = player.team === 'blue' ? COLORS.blue.primary : COLORS.red.primary;
      const size = isLocal ? 3 : 2;
      ctx.fillRect(
        mmX + player.x * scaleX - size / 2,
        mmY + player.y * scaleY - size / 2,
        size,
        size
      );
      if (isLocal) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          mmX + player.x * scaleX - 2,
          mmY + player.y * scaleY - 2,
          4,
          4
        );
      }
    }
  }
}
