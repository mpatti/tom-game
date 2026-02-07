import { GameState, CompactGameState, CompactInput, InputState, Player, Team, Projectile } from '../game/types';

// Encode game state to compact format for network transmission
export function encodeGameState(state: GameState): CompactGameState {
  const players: CompactGameState['p'] = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = [
      Math.round(p.x),
      Math.round(p.y),
      encodeDirection(p.direction),
      encodePlayerState(p.state),
      p.team === 'blue' ? 0 : 1,
      p.isDashing ? 1 : 0,
      p.shieldActive ? 1 : 0,
      p.speedBoostActive ? 1 : 0,
      p.animFrame,
    ];
  }

  // Encode projectiles: [x, y, vx, vy, teamBit]
  const bullets: [number, number, number, number, number][] = state.projectiles.map(b => [
    Math.round(b.x),
    Math.round(b.y),
    Math.round(b.vx),
    Math.round(b.vy),
    b.team === 'blue' ? 0 : 1,
  ]);

  return {
    p: players,
    f: [
      [Math.round(state.flags.blue.x), Math.round(state.flags.blue.y), state.flags.blue.carrierId, Math.round(state.flags.blue.dropTimer * 10)],
      [Math.round(state.flags.red.x), Math.round(state.flags.red.y), state.flags.red.carrierId, Math.round(state.flags.red.dropTimer * 10)],
    ],
    s: [state.score.blue, state.score.red],
    pw: state.powerUps.filter(p => p.active).map(p => [
      p.type === 'speed' ? 0 : p.type === 'shield' ? 1 : 2,
      Math.round(p.x),
      Math.round(p.y),
      p.id,
    ]),
    b: bullets,
    ph: state.gamePhase === 'waiting' ? 'w' : state.gamePhase === 'countdown' ? 'c' : state.gamePhase === 'playing' ? 'p' : 'g',
    ct: Math.round(state.countdownTimer * 10),
    w: state.winner,
    t: state.tick,
  };
}

// Decode compact game state to full state (merging with existing)
export function decodeGameState(compact: CompactGameState, existing: GameState): GameState {
  const players: Record<string, Player> = {};
  for (const [id, data] of Object.entries(compact.p)) {
    const existingPlayer = existing.players[id];
    players[id] = {
      id,
      name: existingPlayer?.name || id.substring(0, 8),
      team: (data[4] === 0 ? 'blue' : 'red') as Team,
      x: data[0],
      y: data[1],
      vx: existingPlayer?.vx || 0,
      vy: existingPlayer?.vy || 0,
      direction: decodeDirection(data[2]),
      state: decodePlayerState(data[3]),
      health: 100,
      dashCooldown: existingPlayer?.dashCooldown || 0,
      isDashing: data[5] === 1,
      dashTimer: existingPlayer?.dashTimer || 0,
      respawnTimer: existingPlayer?.respawnTimer || 0,
      shieldActive: data[6] === 1,
      shieldTimer: existingPlayer?.shieldTimer || 0,
      speedBoostActive: data[7] === 1,
      speedBoostTimer: existingPlayer?.speedBoostTimer || 0,
      shootCooldown: existingPlayer?.shootCooldown || 0,
      animFrame: data[8],
      animTimer: existingPlayer?.animTimer || 0,
      flashTimer: existingPlayer?.flashTimer || 0,
    };
  }

  // Decode projectiles
  const projectiles: Projectile[] = (compact.b || []).map((b, i) => ({
    id: `net-${i}`,
    ownerId: '',
    team: (b[4] === 0 ? 'blue' : 'red') as Team,
    x: b[0],
    y: b[1],
    vx: b[2],
    vy: b[3],
    life: 1.0, // Remote bullets get a fresh lifetime
  }));

  const typeMap = ['speed', 'shield', 'dash_reset'] as const;

  return {
    ...existing,
    players,
    flags: {
      blue: {
        ...existing.flags.blue,
        x: compact.f[0][0],
        y: compact.f[0][1],
        carrierId: compact.f[0][2],
        dropTimer: compact.f[0][3] / 10,
      },
      red: {
        ...existing.flags.red,
        x: compact.f[1][0],
        y: compact.f[1][1],
        carrierId: compact.f[1][2],
        dropTimer: compact.f[1][3] / 10,
      },
    },
    score: { blue: compact.s[0], red: compact.s[1] },
    powerUps: compact.pw.map(pw => ({
      id: pw[3] as string,
      type: typeMap[pw[0] as number],
      x: pw[1] as number,
      y: pw[2] as number,
      animTimer: 0,
      active: true,
    })),
    projectiles,
    gamePhase: compact.ph === 'w' ? 'waiting' : compact.ph === 'c' ? 'countdown' : compact.ph === 'p' ? 'playing' : 'gameover',
    countdownTimer: compact.ct / 10,
    winner: compact.w as Team | null,
    tick: compact.t,
  };
}

export function encodeInput(input: InputState): CompactInput {
  let k = 0;
  if (input.up) k |= 1;
  if (input.down) k |= 2;
  if (input.left) k |= 4;
  if (input.right) k |= 8;
  if (input.dash) k |= 16;
  return { k, t: Date.now() };
}

export function decodeInput(compact: CompactInput): InputState {
  return {
    up: (compact.k & 1) !== 0,
    down: (compact.k & 2) !== 0,
    left: (compact.k & 4) !== 0,
    right: (compact.k & 8) !== 0,
    dash: (compact.k & 16) !== 0,
  };
}

function encodeDirection(dir: string): number {
  const dirs = ['idle', 'up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'];
  return dirs.indexOf(dir);
}

function decodeDirection(n: number): Player['direction'] {
  const dirs: Player['direction'][] = ['idle', 'up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'];
  return dirs[n] || 'idle';
}

function encodePlayerState(state: string): number {
  return state === 'alive' ? 0 : state === 'dead' ? 1 : 2;
}

function decodePlayerState(n: number): Player['state'] {
  return n === 0 ? 'alive' : n === 1 ? 'dead' : 'carrying';
}
