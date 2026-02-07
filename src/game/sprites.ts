import { COLORS } from './constants';
import { Team } from './types';

// All sprites are programmatically generated pixel art
// Each sprite is drawn to an offscreen canvas and cached

const spriteCache = new Map<string, HTMLCanvasElement>();

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale: number = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(x * scale, y * scale, scale, scale);
}

// Player sprite: 16x16 at 2x scale = 32x32
function drawPlayerSprite(team: Team, frame: number, carrying: boolean, shielded: boolean): HTMLCanvasElement {
  const key = `player-${team}-${frame}-${carrying}-${shielded}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;

  const [canvas, ctx] = createCanvas(32, 32);
  const s = 2; // scale
  const c = COLORS[team];

  // Body (8 wide, 10 tall centered in 16x16)
  const bodyColor = c.primary;
  const lightColor = c.light;
  const darkColor = c.dark;
  const skinColor = '#ffcc99';
  const eyeColor = '#ffffff';
  const pupilColor = '#222222';

  // Head (row 2-5)
  pixel(ctx, 6, 2, skinColor, s);
  pixel(ctx, 7, 2, skinColor, s);
  pixel(ctx, 8, 2, skinColor, s);
  pixel(ctx, 9, 2, skinColor, s);
  pixel(ctx, 5, 3, skinColor, s);
  pixel(ctx, 6, 3, skinColor, s);
  pixel(ctx, 7, 3, eyeColor, s);
  pixel(ctx, 8, 3, skinColor, s);
  pixel(ctx, 9, 3, eyeColor, s);
  pixel(ctx, 10, 3, skinColor, s);
  pixel(ctx, 6, 4, skinColor, s);
  pixel(ctx, 7, 4, pupilColor, s);
  pixel(ctx, 8, 4, skinColor, s);
  pixel(ctx, 9, 4, pupilColor, s);
  pixel(ctx, 5, 4, skinColor, s);
  pixel(ctx, 10, 4, skinColor, s);
  pixel(ctx, 6, 5, skinColor, s);
  pixel(ctx, 7, 5, skinColor, s);
  pixel(ctx, 8, 5, '#ff9999', s); // mouth
  pixel(ctx, 9, 5, skinColor, s);

  // Hair/hat
  pixel(ctx, 5, 1, darkColor, s);
  pixel(ctx, 6, 1, darkColor, s);
  pixel(ctx, 7, 1, bodyColor, s);
  pixel(ctx, 8, 1, bodyColor, s);
  pixel(ctx, 9, 1, darkColor, s);
  pixel(ctx, 10, 1, darkColor, s);
  pixel(ctx, 5, 2, bodyColor, s);
  pixel(ctx, 10, 2, bodyColor, s);

  // Body (row 6-10)
  for (let y = 6; y <= 9; y++) {
    pixel(ctx, 6, y, bodyColor, s);
    pixel(ctx, 7, y, bodyColor, s);
    pixel(ctx, 8, y, lightColor, s);
    pixel(ctx, 9, y, bodyColor, s);
  }
  // Shoulders
  pixel(ctx, 5, 6, bodyColor, s);
  pixel(ctx, 10, 6, bodyColor, s);

  // Arms - animate
  const armOffset = frame === 1 ? 1 : 0;
  pixel(ctx, 4, 7 + armOffset, skinColor, s);
  pixel(ctx, 5, 7, skinColor, s);
  pixel(ctx, 10, 7, skinColor, s);
  pixel(ctx, 11, 7 + (frame === 1 ? -1 : 0), skinColor, s);

  // Legs - animate
  if (frame === 0) {
    pixel(ctx, 6, 10, darkColor, s);
    pixel(ctx, 7, 10, darkColor, s);
    pixel(ctx, 8, 10, darkColor, s);
    pixel(ctx, 9, 10, darkColor, s);
    pixel(ctx, 6, 11, '#443333', s);
    pixel(ctx, 9, 11, '#443333', s);
  } else {
    pixel(ctx, 5, 10, darkColor, s);
    pixel(ctx, 6, 10, darkColor, s);
    pixel(ctx, 9, 10, darkColor, s);
    pixel(ctx, 10, 10, darkColor, s);
    pixel(ctx, 5, 11, '#443333', s);
    pixel(ctx, 10, 11, '#443333', s);
  }

  // Flag above head if carrying
  if (carrying) {
    const flagColor = team === 'blue' ? COLORS.red.primary : COLORS.blue.primary;
    pixel(ctx, 8, 0, '#886644', s); // pole
    pixel(ctx, 9, 0, flagColor, s);
    pixel(ctx, 10, 0, flagColor, s);
    pixel(ctx, 9, -1, flagColor, s);
    pixel(ctx, 10, -1, flagColor, s);
  }

  // Shield glow
  if (shielded) {
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.2;
    ctx.beginPath();
    ctx.arc(16, 14, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  spriteCache.set(key, canvas);
  return canvas;
}

// Flag sprite: 16x24 at 2x = 32x48
function drawFlagSprite(team: Team, frame: number): HTMLCanvasElement {
  const key = `flag-${team}-${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;

  const [canvas, ctx] = createCanvas(32, 48);
  const s = 2;
  const c = COLORS[team];

  // Pole
  for (let y = 0; y <= 20; y++) {
    pixel(ctx, 4, y, '#886644', s);
  }

  // Flag cloth (waves based on frame)
  const flagOffset = frame === 0 ? 0 : 1;
  for (let y = 1; y <= 6; y++) {
    for (let x = 5; x <= 10; x++) {
      const shade = (x + y + flagOffset) % 3 === 0 ? c.light : c.primary;
      pixel(ctx, x, y + flagOffset, shade, s);
    }
  }

  // Base
  pixel(ctx, 2, 21, '#666666', s);
  pixel(ctx, 3, 21, '#666666', s);
  pixel(ctx, 4, 21, '#666666', s);
  pixel(ctx, 5, 21, '#666666', s);
  pixel(ctx, 6, 21, '#666666', s);

  spriteCache.set(key, canvas);
  return canvas;
}

// Wall tile: 32x32
function drawWallTile(variant: number): HTMLCanvasElement {
  const key = `wall-${variant}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;

  const [canvas, ctx] = createCanvas(32, 32);
  const s = 2;

  // Stone brick pattern
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, 32, 32);

  // Brick lines
  ctx.fillStyle = COLORS.wallDark;
  ctx.fillRect(0, 7 * s, 32, 1);
  ctx.fillRect(0, 15 * s, 32, 1);
  ctx.fillRect(8 * s, 0, 1, 7 * s);
  ctx.fillRect(4 * s + ((variant % 2) * 4 * s), 7 * s, 1, 8 * s);
  ctx.fillRect(12 * s, 15 * s, 1, 32);

  // Highlights
  ctx.fillStyle = COLORS.wallLight;
  for (let i = 0; i < 4; i++) {
    const px = (variant * 3 + i * 4) % 16;
    const py = (variant * 5 + i * 3) % 16;
    pixel(ctx, px, py, COLORS.wallLight, s);
  }

  spriteCache.set(key, canvas);
  return canvas;
}

// Floor tile: 32x32
function drawFloorTile(variant: number): HTMLCanvasElement {
  const key = `floor-${variant}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;

  const [canvas, ctx] = createCanvas(32, 32);

  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, 32, 32);

  // Subtle grass texture
  const rng = variant * 7 + 13;
  for (let i = 0; i < 8; i++) {
    const px = ((rng * (i + 1) * 37) % 30) + 1;
    const py = ((rng * (i + 1) * 53) % 30) + 1;
    const colors = [COLORS.grass2, COLORS.grass3];
    ctx.fillStyle = colors[i % 2];
    ctx.fillRect(px, py, 2, 2);
  }

  spriteCache.set(key, canvas);
  return canvas;
}

// Power-up sprites
function drawPowerUpSprite(type: string, frame: number): HTMLCanvasElement {
  const key = `powerup-${type}-${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;

  const [canvas, ctx] = createCanvas(24, 24);
  const s = 2;

  const bob = frame === 0 ? 0 : 1;

  // Glow circle
  ctx.fillStyle = type === 'speed' ? COLORS.speed : type === 'shield' ? COLORS.shield : COLORS.dashReset;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(12, 12 + bob, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (type === 'speed') {
    // Lightning bolt
    pixel(ctx, 7, 2 + bob, COLORS.speed, s);
    pixel(ctx, 6, 3 + bob, COLORS.speed, s);
    pixel(ctx, 5, 4 + bob, COLORS.speed, s);
    pixel(ctx, 4, 5 + bob, COLORS.speed, s);
    pixel(ctx, 5, 5 + bob, COLORS.speed, s);
    pixel(ctx, 6, 5 + bob, COLORS.speed, s);
    pixel(ctx, 7, 5 + bob, COLORS.speed, s);
    pixel(ctx, 6, 6 + bob, COLORS.speed, s);
    pixel(ctx, 5, 7 + bob, COLORS.speed, s);
    pixel(ctx, 4, 8 + bob, COLORS.speed, s);
  } else if (type === 'shield') {
    // Shield icon
    pixel(ctx, 5, 2 + bob, COLORS.shield, s);
    pixel(ctx, 6, 2 + bob, COLORS.shield, s);
    pixel(ctx, 7, 2 + bob, COLORS.shield, s);
    pixel(ctx, 4, 3 + bob, COLORS.shield, s);
    pixel(ctx, 8, 3 + bob, COLORS.shield, s);
    pixel(ctx, 4, 4 + bob, COLORS.shield, s);
    pixel(ctx, 8, 4 + bob, COLORS.shield, s);
    pixel(ctx, 5, 5 + bob, COLORS.shield, s);
    pixel(ctx, 7, 5 + bob, COLORS.shield, s);
    pixel(ctx, 6, 6 + bob, COLORS.shield, s);
  } else {
    // Star
    pixel(ctx, 6, 2 + bob, COLORS.dashReset, s);
    pixel(ctx, 4, 4 + bob, COLORS.dashReset, s);
    pixel(ctx, 5, 4 + bob, COLORS.dashReset, s);
    pixel(ctx, 6, 4 + bob, COLORS.dashReset, s);
    pixel(ctx, 7, 4 + bob, COLORS.dashReset, s);
    pixel(ctx, 8, 4 + bob, COLORS.dashReset, s);
    pixel(ctx, 5, 5 + bob, COLORS.dashReset, s);
    pixel(ctx, 7, 5 + bob, COLORS.dashReset, s);
    pixel(ctx, 4, 6 + bob, COLORS.dashReset, s);
    pixel(ctx, 8, 6 + bob, COLORS.dashReset, s);
  }

  spriteCache.set(key, canvas);
  return canvas;
}

export const Sprites = {
  player: drawPlayerSprite,
  flag: drawFlagSprite,
  wall: drawWallTile,
  floor: drawFloorTile,
  powerUp: drawPowerUpSprite,
  clearCache: () => spriteCache.clear(),
};
