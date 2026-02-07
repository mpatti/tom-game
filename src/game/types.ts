export type Team = 'blue' | 'red';

export type PlayerState = 'alive' | 'dead' | 'carrying';

export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'idle';

export type PowerUpType = 'speed' | 'shield' | 'dash_reset';

export interface Player {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  state: PlayerState;
  health: number;
  dashCooldown: number;
  isDashing: boolean;
  dashTimer: number;
  respawnTimer: number;
  shieldActive: boolean;
  shieldTimer: number;
  speedBoostActive: boolean;
  speedBoostTimer: number;
  shootCooldown: number;
  animFrame: number;
  animTimer: number;
  flashTimer: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Flag {
  team: Team;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  carrierId: string | null;
  dropTimer: number;
  animFrame: number;
  animTimer: number;
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  animTimer: number;
  active: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface EventMessage {
  text: string;
  color: string;
  timer: number;
}

export interface GameState {
  players: Record<string, Player>;
  flags: { blue: Flag; red: Flag };
  score: { blue: number; red: number };
  powerUps: PowerUp[];
  projectiles: Projectile[];
  particles: Particle[];
  events: EventMessage[];
  gamePhase: 'waiting' | 'countdown' | 'playing' | 'gameover';
  countdownTimer: number;
  winner: Team | null;
  tick: number;
  powerUpSpawnTimer: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;
}

export interface CompactGameState {
  p: Record<string, [number, number, number, number, number, number, number, number, number]>;
  f: [[number, number, string | null, number], [number, number, string | null, number]];
  s: [number, number];
  pw: [number, number, number, string][];
  b: [number, number, number, number, number][];
  ph: 'w' | 'c' | 'p' | 'g';
  ct: number;
  w: string | null;
  t: number;
}

export interface CompactInput {
  k: number;
  t: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team | null;
  ready: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  team: Team | null;
  timestamp: number;
}

export interface LobbyState {
  roomId: string;
  players: LobbyPlayer[];
  gameStarting: boolean;
  countdown: number;
}

export const TILE_SIZE = 32;
export const MAP_COLS = 40;
export const MAP_ROWS = 25;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
