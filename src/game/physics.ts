import { Player, InputState, Direction, Flag, PowerUp, GameState } from './types';
import {
  PLAYER_SPEED, PLAYER_ACCEL, PLAYER_DECEL, PLAYER_RADIUS,
  DASH_SPEED, DASH_DURATION, DASH_COOLDOWN,
  FLAG_PICKUP_RADIUS, FLAG_SCORE_RADIUS, TAG_RADIUS,
  FLAG_RETURN_TIME, RESPAWN_TIME, SCORE_TO_WIN,
  SPEED_BOOST_MULTIPLIER, SPEED_BOOST_DURATION, SHIELD_DURATION,
  POWERUP_SPAWN_INTERVAL, SCREEN_SHAKE_CAPTURE, SCREEN_SHAKE_TAG,
} from './constants';
import { collideWithWalls, BLUE_FLAG_POS, RED_FLAG_POS, BLUE_SPAWNS, RED_SPAWNS, POWERUP_LOCATIONS } from './map';
import { ParticleSystem } from './particles';
import { Camera } from './camera';
import { SoundManager } from '../utils/sounds';

export function getDirection(input: InputState): Direction {
  const { up, down, left, right } = input;
  if (up && left) return 'up-left';
  if (up && right) return 'up-right';
  if (down && left) return 'down-left';
  if (down && right) return 'down-right';
  if (up) return 'up';
  if (down) return 'down';
  if (left) return 'left';
  if (right) return 'right';
  return 'idle';
}

export function updatePlayer(player: Player, input: InputState, dt: number): void {
  if (player.state === 'dead') {
    player.respawnTimer -= dt;
    player.vx = 0;
    player.vy = 0;
    return;
  }

  // Update timers
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.shieldTimer > 0) {
    player.shieldTimer -= dt;
    if (player.shieldTimer <= 0) player.shieldActive = false;
  }
  if (player.speedBoostTimer > 0) {
    player.speedBoostTimer -= dt;
    if (player.speedBoostTimer <= 0) player.speedBoostActive = false;
  }
  if (player.flashTimer > 0) player.flashTimer -= dt;

  // Animation
  player.animTimer += dt;
  if (player.animTimer > 0.2) {
    player.animTimer = 0;
    player.animFrame = player.animFrame === 0 ? 1 : 0;
  }

  // Dash
  if (input.dash && player.dashCooldown <= 0 && !player.isDashing) {
    player.isDashing = true;
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
  }

  if (player.isDashing) {
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) {
      player.isDashing = false;
    }
  }

  const dir = getDirection(input);
  player.direction = dir === 'idle' ? player.direction : dir;

  // Target velocity
  let targetVx = 0;
  let targetVy = 0;
  if (input.left) targetVx -= 1;
  if (input.right) targetVx += 1;
  if (input.up) targetVy -= 1;
  if (input.down) targetVy += 1;

  // Normalize diagonal
  const len = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
  if (len > 0) {
    targetVx /= len;
    targetVy /= len;
  }

  let speed = PLAYER_SPEED;
  if (player.isDashing) speed = DASH_SPEED;
  if (player.speedBoostActive) speed *= SPEED_BOOST_MULTIPLIER;

  targetVx *= speed;
  targetVy *= speed;

  // Acceleration / deceleration
  const accel = len > 0 ? PLAYER_ACCEL : PLAYER_DECEL;
  const dvx = targetVx - player.vx;
  const dvy = targetVy - player.vy;
  const dvLen = Math.sqrt(dvx * dvx + dvy * dvy);
  if (dvLen > 0) {
    const change = Math.min(accel * dt, dvLen);
    player.vx += (dvx / dvLen) * change;
    player.vy += (dvy / dvLen) * change;
  }

  // Move
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Wall collision
  const resolved = collideWithWalls(player.x, player.y, PLAYER_RADIUS);
  player.x = resolved.x;
  player.y = resolved.y;
}

export function updateGameLogic(
  state: GameState,
  localPlayerId: string,
  particles: ParticleSystem,
  camera: Camera,
  sounds: SoundManager
): void {
  const { players, flags, score, powerUps } = state;
  const dt = 1 / 60;

  // Update power-up spawn timer
  state.powerUpSpawnTimer -= dt;
  if (state.powerUpSpawnTimer <= 0 && powerUps.filter(p => p.active).length < 3) {
    state.powerUpSpawnTimer = POWERUP_SPAWN_INTERVAL;
    spawnPowerUp(state);
  }

  // Power-up animation
  for (const pu of powerUps) {
    if (!pu.active) continue;
    pu.animTimer += dt;
    if (pu.animTimer > 0.5) pu.animTimer = 0;
  }

  // Flag animation
  flags.blue.animTimer += dt;
  if (flags.blue.animTimer > 0.4) { flags.blue.animTimer = 0; flags.blue.animFrame = flags.blue.animFrame === 0 ? 1 : 0; }
  flags.red.animTimer += dt;
  if (flags.red.animTimer > 0.4) { flags.red.animTimer = 0; flags.red.animFrame = flags.red.animFrame === 0 ? 1 : 0; }

  // Update flag positions for carried flags
  for (const flag of [flags.blue, flags.red]) {
    if (flag.carrierId && players[flag.carrierId]) {
      flag.x = players[flag.carrierId].x;
      flag.y = players[flag.carrierId].y;
    }

    // Drop timer
    if (!flag.carrierId && flag.dropTimer > 0) {
      flag.dropTimer -= dt;
      if (flag.dropTimer <= 0) {
        flag.x = flag.baseX;
        flag.y = flag.baseY;
      }
    }
  }

  const playerArr = Object.values(players);

  for (const player of playerArr) {
    if (player.state === 'dead') {
      // Respawn
      if (player.respawnTimer <= 0) {
        const spawns = player.team === 'blue' ? BLUE_SPAWNS : RED_SPAWNS;
        const spawnIdx = Math.floor(Math.random() * spawns.length);
        player.x = spawns[spawnIdx].x;
        player.y = spawns[spawnIdx].y;
        player.state = 'alive';
        player.vx = 0;
        player.vy = 0;
        particles.emitRing(player.x, player.y, 16, player.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('respawn');
      }
      continue;
    }

    // Flag pickup
    const enemyFlag = player.team === 'blue' ? flags.red : flags.blue;
    if (!enemyFlag.carrierId && player.state === 'alive') {
      const dx = player.x - enemyFlag.x;
      const dy = player.y - enemyFlag.y;
      if (Math.sqrt(dx * dx + dy * dy) < FLAG_PICKUP_RADIUS) {
        enemyFlag.carrierId = player.id;
        player.state = 'carrying';
        particles.emit(enemyFlag.x, enemyFlag.y, 12, enemyFlag.team === 'blue' ? '#4488ff' : '#ff4444', 80, 0.4);
        addEvent(state, `${player.name} grabbed the ${enemyFlag.team} flag!`, enemyFlag.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('pickup');
      }
    }

    // Flag scoring
    if (player.state === 'carrying') {
      const ownFlag = player.team === 'blue' ? flags.blue : flags.red;
      const ownBase = player.team === 'blue' ? BLUE_FLAG_POS : RED_FLAG_POS;

      // Can score if own flag is at base
      const ownFlagAtBase = !ownFlag.carrierId &&
        Math.abs(ownFlag.x - ownBase.x) < 16 && Math.abs(ownFlag.y - ownBase.y) < 16;

      if (ownFlagAtBase) {
        const dx = player.x - ownBase.x;
        const dy = player.y - ownBase.y;
        if (Math.sqrt(dx * dx + dy * dy) < FLAG_SCORE_RADIUS) {
          // SCORE!
          score[player.team]++;
          enemyFlag.carrierId = null;
          enemyFlag.x = enemyFlag.baseX;
          enemyFlag.y = enemyFlag.baseY;
          enemyFlag.dropTimer = 0;
          player.state = 'alive';
          particles.emit(player.x, player.y, 30, player.team === 'blue' ? '#4488ff' : '#ff4444', 200, 0.8, 5);
          particles.emitRing(player.x, player.y, 24, '#ffffff', 30);
          camera.shake(SCREEN_SHAKE_CAPTURE);
          addEvent(state, `${player.name} SCORED for ${player.team}!`, '#ffff44');
          sounds.play('score');

          if (score[player.team] >= SCORE_TO_WIN) {
            state.gamePhase = 'gameover';
            state.winner = player.team;
            addEvent(state, `${player.team.toUpperCase()} TEAM WINS!`, '#ffff44');
            sounds.play('win');
          }
        }
      }
    }

    // Tagging enemies
    for (const other of playerArr) {
      if (other.team === player.team || other.state !== 'carrying') continue;

      const dx = player.x - other.x;
      const dy = player.y - other.y;
      if (Math.sqrt(dx * dx + dy * dy) < TAG_RADIUS) {
        // Check shield
        if (other.shieldActive) {
          other.shieldActive = false;
          other.shieldTimer = 0;
          particles.emitRing(other.x, other.y, 12, COLORS.shield);
          sounds.play('shieldBreak');
          continue;
        }

        // Drop flag
        const carriedFlag = other.team === 'blue' ? flags.red : flags.blue;
        carriedFlag.carrierId = null;
        carriedFlag.dropTimer = FLAG_RETURN_TIME;

        // Kill carrier
        other.state = 'dead';
        other.respawnTimer = RESPAWN_TIME;
        other.flashTimer = 0.3;
        particles.emit(other.x, other.y, 20, other.team === 'blue' ? '#4488ff' : '#ff4444', 120, 0.5);
        camera.shake(SCREEN_SHAKE_TAG);
        addEvent(state, `${player.name} tagged ${other.name}!`, '#ffffff');
        sounds.play('tag');
      }
    }

    // Power-up collection
    for (const pu of powerUps) {
      if (!pu.active) continue;
      const dx = player.x - pu.x;
      const dy = player.y - pu.y;
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        pu.active = false;
        particles.emitRing(pu.x, pu.y, 12, pu.type === 'speed' ? COLORS.speed : pu.type === 'shield' ? COLORS.shield : COLORS.dashReset);
        sounds.play('powerup');

        switch (pu.type) {
          case 'speed':
            player.speedBoostActive = true;
            player.speedBoostTimer = SPEED_BOOST_DURATION;
            addEvent(state, `${player.name} got Speed Boost!`, COLORS.speed);
            break;
          case 'shield':
            player.shieldActive = true;
            player.shieldTimer = SHIELD_DURATION;
            addEvent(state, `${player.name} got Shield!`, COLORS.shield);
            break;
          case 'dash_reset':
            player.dashCooldown = 0;
            addEvent(state, `${player.name} got Dash Reset!`, COLORS.dashReset);
            break;
        }
      }
    }
  }

  // Update events
  for (let i = state.events.length - 1; i >= 0; i--) {
    state.events[i].timer -= dt;
    if (state.events[i].timer <= 0) {
      state.events.splice(i, 1);
    }
  }
}

function addEvent(state: GameState, text: string, color: string) {
  state.events.push({ text, color, timer: 4 });
  if (state.events.length > 5) state.events.shift();
}

function spawnPowerUp(state: GameState) {
  const types: Array<'speed' | 'shield' | 'dash_reset'> = ['speed', 'shield', 'dash_reset'];
  const type = types[Math.floor(Math.random() * types.length)];
  const loc = POWERUP_LOCATIONS[Math.floor(Math.random() * POWERUP_LOCATIONS.length)];

  // Check if there's already a power-up at this location
  if (state.powerUps.some(p => p.active && Math.abs(p.x - loc.x) < 32 && Math.abs(p.y - loc.y) < 32)) return;

  state.powerUps.push({
    id: `pu-${Date.now()}-${Math.random()}`,
    type,
    x: loc.x,
    y: loc.y,
    animTimer: 0,
    active: true,
  });
}

// Needed by physics for shield color reference
const COLORS = {
  shield: '#44ffff',
  speed: '#ffff44',
  dashReset: '#ff44ff',
};

export function createInitialGameState(): GameState {
  return {
    players: {},
    flags: {
      blue: {
        team: 'blue',
        x: BLUE_FLAG_POS.x,
        y: BLUE_FLAG_POS.y,
        baseX: BLUE_FLAG_POS.x,
        baseY: BLUE_FLAG_POS.y,
        carrierId: null,
        dropTimer: 0,
        animFrame: 0,
        animTimer: 0,
      },
      red: {
        team: 'red',
        x: RED_FLAG_POS.x,
        y: RED_FLAG_POS.y,
        baseX: RED_FLAG_POS.x,
        baseY: RED_FLAG_POS.y,
        carrierId: null,
        dropTimer: 0,
        animFrame: 0,
        animTimer: 0,
      },
    },
    score: { blue: 0, red: 0 },
    powerUps: [],
    particles: [],
    events: [],
    gamePhase: 'waiting',
    countdownTimer: 0,
    winner: null,
    tick: 0,
    powerUpSpawnTimer: POWERUP_SPAWN_INTERVAL,
  };
}

export function createPlayer(id: string, name: string, team: 'blue' | 'red', spawnIndex: number): Player {
  const spawns = team === 'blue' ? BLUE_SPAWNS : RED_SPAWNS;
  const spawn = spawns[spawnIndex % spawns.length];

  return {
    id,
    name,
    team,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    direction: team === 'blue' ? 'right' : 'left',
    state: 'alive',
    health: 100,
    dashCooldown: 0,
    isDashing: false,
    dashTimer: 0,
    respawnTimer: 0,
    shieldActive: false,
    shieldTimer: 0,
    speedBoostActive: false,
    speedBoostTimer: 0,
    animFrame: 0,
    animTimer: 0,
    flashTimer: 0,
  };
}
