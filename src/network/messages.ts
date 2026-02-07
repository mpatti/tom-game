import { GameState, CompactGameState, CompactInput, InputState, Player, Team, Projectile } from '../game/types';

// Encode game state to compact format for network transmission
// Player tuple: [x*100, z*100, yaw*1000, pitch*1000, stateBits, teamBit, flagBits, shootCooldown*100]
//   stateBits: alive=0, dead=1, carrying=2
//   teamBit: blue=0, red=1
//   flagBits: bitmask for isDashing|shieldActive|speedBoostActive
export function encodeGameState(state: GameState): CompactGameState {
  const players: CompactGameState['p'] = {};
  for (const [id, p] of Object.entries(state.players)) {
    const stateBits = p.state === 'alive' ? 0 : p.state === 'dead' ? 1 : 2;
    const teamBit = p.team === 'blue' ? 0 : 1;
    let flagBits = 0;
    if (p.isDashing) flagBits |= 1;
    if (p.shieldActive) flagBits |= 2;
    if (p.speedBoostActive) flagBits |= 4;

    players[id] = [
      Math.round(p.x * 100),
      Math.round(p.z * 100),
      Math.round(p.yaw * 1000),
      Math.round(p.pitch * 1000),
      stateBits,
      teamBit,
      flagBits,
      Math.round(p.shootCooldown * 100),
    ];
  }

  // Encode projectiles: [x*100, z*100, y*100, vx*10, vz*10, vy*10, teamBit]
  const bullets: [number, number, number, number, number, number, number][] = state.projectiles.map(b => [
    Math.round(b.x * 100),
    Math.round(b.z * 100),
    Math.round(b.y * 100),
    Math.round(b.vx * 10),
    Math.round(b.vz * 10),
    Math.round(b.vy * 10),
    b.team === 'blue' ? 0 : 1,
  ]);

  // Flag tuple: [x*100, z*100, carrierId, dropTimer*10]
  return {
    p: players,
    f: [
      [Math.round(state.flags.blue.x * 100), Math.round(state.flags.blue.z * 100), state.flags.blue.carrierId, Math.round(state.flags.blue.dropTimer * 10)],
      [Math.round(state.flags.red.x * 100), Math.round(state.flags.red.z * 100), state.flags.red.carrierId, Math.round(state.flags.red.dropTimer * 10)],
    ],
    s: [state.score.blue, state.score.red],
    pw: state.powerUps.filter(p => p.active).map(p => [
      p.type === 'speed' ? 0 : p.type === 'shield' ? 1 : 2,
      Math.round(p.x * 100),
      Math.round(p.z * 100),
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
    const stateBits = data[4];
    const teamBit = data[5];
    const flagBits = data[6];

    players[id] = {
      id,
      name: existingPlayer?.name || id.substring(0, 8),
      team: (teamBit === 0 ? 'blue' : 'red') as Team,
      x: data[0] / 100,
      y: 0,
      z: data[1] / 100,
      vx: existingPlayer?.vx || 0,
      vy: 0,
      vz: existingPlayer?.vz || 0,
      yaw: data[2] / 1000,
      pitch: data[3] / 1000,
      state: stateBits === 0 ? 'alive' : stateBits === 1 ? 'dead' : 'carrying',
      health: 100,
      dashCooldown: existingPlayer?.dashCooldown || 0,
      isDashing: (flagBits & 1) !== 0,
      dashTimer: existingPlayer?.dashTimer || 0,
      respawnTimer: existingPlayer?.respawnTimer || 0,
      shieldActive: (flagBits & 2) !== 0,
      shieldTimer: existingPlayer?.shieldTimer || 0,
      speedBoostActive: (flagBits & 4) !== 0,
      speedBoostTimer: existingPlayer?.speedBoostTimer || 0,
      shootCooldown: data[7] / 100,
      flashTimer: existingPlayer?.flashTimer || 0,
    };
  }

  // Decode projectiles: [x*100, z*100, y*100, vx*10, vz*10, vy*10, teamBit]
  const projectiles: Projectile[] = (compact.b || []).map((b, i) => ({
    id: `net-${i}`,
    ownerId: '',
    team: (b[6] === 0 ? 'blue' : 'red') as Team,
    x: b[0] / 100,
    z: b[1] / 100,
    y: b[2] / 100,
    vx: b[3] / 10,
    vz: b[4] / 10,
    vy: b[5] / 10,
    life: 1.0,
  }));

  const typeMap = ['speed', 'shield', 'dash_reset'] as const;

  // PowerUp tuple: [type, x*100, z*100, id]
  return {
    ...existing,
    players,
    flags: {
      blue: {
        ...existing.flags.blue,
        x: compact.f[0][0] / 100,
        z: compact.f[0][1] / 100,
        carrierId: compact.f[0][2],
        dropTimer: compact.f[0][3] / 10,
      },
      red: {
        ...existing.flags.red,
        x: compact.f[1][0] / 100,
        z: compact.f[1][1] / 100,
        carrierId: compact.f[1][2],
        dropTimer: compact.f[1][3] / 10,
      },
    },
    score: { blue: compact.s[0], red: compact.s[1] },
    powerUps: compact.pw.map(pw => ({
      id: pw[3] as string,
      type: typeMap[pw[0] as number],
      x: (pw[1] as number) / 100,
      z: (pw[2] as number) / 100,
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

export function encodeInput(input: InputState, yaw: number, pitch: number): CompactInput {
  let k = 0;
  if (input.up) k |= 1;
  if (input.down) k |= 2;
  if (input.left) k |= 4;
  if (input.right) k |= 8;
  if (input.dash) k |= 16;
  return { k, yaw, pitch, t: Date.now() };
}

export function decodeInput(compact: CompactInput): InputState {
  return {
    up: (compact.k & 1) !== 0,
    down: (compact.k & 2) !== 0,
    left: (compact.k & 4) !== 0,
    right: (compact.k & 8) !== 0,
    dash: (compact.k & 16) !== 0,
    shoot: false,
  };
}
