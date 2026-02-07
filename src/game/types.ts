export type Team = 'blue' | 'red';

export type PlayerState = 'alive' | 'dead' | 'carrying';

export type PowerUpType = 'speed' | 'shield' | 'dash_reset';

export interface Player {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;  // height above ground (0 for grounded)
  z: number;  // depth (forward/back on floor plane)
  vx: number;
  vy: number; // vertical velocity (0 for now)
  vz: number; // depth velocity
  yaw: number;   // horizontal look angle (radians)
  pitch: number; // vertical look angle (radians)
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
  flashTimer: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  team: Team;
  x: number;
  y: number;  // height
  z: number;  // depth
  vx: number;
  vy: number; // vertical velocity
  vz: number; // depth velocity
  life: number;
}

export interface Flag {
  team: Team;
  x: number;
  y: number;  // height (always 0)
  z: number;  // depth
  baseX: number;
  baseZ: number;
  carrierId: string | null;
  dropTimer: number;
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  x: number;
  z: number;
  animTimer: number;
  active: boolean;
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
  shoot: boolean;
}

// Network compact encoding: player tuple
// [x*100, z*100, yaw*1000, pitch*1000, stateBits, teamBit, flagBits, shootCooldown*100]
export interface CompactGameState {
  p: Record<string, [number, number, number, number, number, number, number, number]>;
  f: [[number, number, string | null, number], [number, number, string | null, number]];
  s: [number, number];
  pw: [number, number, number, string][];
  b: [number, number, number, number, number, number, number][];  // bullet: x,z,y,vx,vz,vy,team
  ph: 'w' | 'c' | 'p' | 'g';
  ct: number;
  w: string | null;
  t: number;
}

export interface CompactInput {
  k: number;
  yaw: number;
  pitch: number;
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

