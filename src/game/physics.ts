import { Player, InputState, Direction, Flag, PowerUp, GameState, Projectile } from './types';
import {
  PLAYER_SPEED, PLAYER_ACCEL, PLAYER_DECEL, PLAYER_RADIUS,
  DASH_SPEED, DASH_DURATION, DASH_COOLDOWN,
  FLAG_PICKUP_RADIUS, FLAG_SCORE_RADIUS,
  FLAG_RETURN_TIME, FLAG_TOUCH_RETURN_RADIUS, RESPAWN_TIME, SCORE_TO_WIN,
  SPEED_BOOST_MULTIPLIER, SPEED_BOOST_DURATION, SHIELD_DURATION,
  POWERUP_SPAWN_INTERVAL, SCREEN_SHAKE_CAPTURE, SCREEN_SHAKE_TAG,
  BULLET_SPEED, BULLET_RADIUS, BULLET_LIFETIME,
} from './constants';
import { collideWithWalls, isWall, worldToTile, BLUE_FLAG_POS, RED_FLAG_POS, BLUE_SPAWNS, RED_SPAWNS, POWERUP_LOCATIONS } from './map';
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
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
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

// Kill a player — handles flag drop, death state, particles, shake, events, sound
export function killPlayer(
  victim: Player,
  killerName: string,
  state: GameState,
  particles: ParticleSystem,
  camera: Camera,
  sounds: SoundManager,
  localPlayerId: string,
): void {
  const { flags } = state;

  // If carrying a flag, drop it at the victim's position
  if (victim.state === 'carrying') {
    const carriedFlag = victim.team === 'blue' ? flags.red : flags.blue;
    carriedFlag.x = victim.x;
    carriedFlag.y = victim.y;
    carriedFlag.carrierId = null;
    carriedFlag.dropTimer = FLAG_RETURN_TIME;
  }

  victim.state = 'dead';
  victim.respawnTimer = RESPAWN_TIME;
  victim.flashTimer = 0.3;
  particles.emit(victim.x, victim.y, 20, victim.team === 'blue' ? '#4488ff' : '#ff4444', 120, 0.5);
  camera.shake(SCREEN_SHAKE_TAG);
  addEvent(state, `${killerName} eliminated ${victim.name}!`, '#ffffff');
  if (victim.id === localPlayerId) sounds.play('hit');
  else sounds.play('tag');
}

// Update projectiles: move, collide, hit detection
export function updateProjectiles(
  state: GameState,
  localPlayerId: string,
  particles: ParticleSystem,
  camera: Camera,
  sounds: SoundManager,
): void {
  const dt = 1 / 60;
  const { projectiles, players } = state;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const bullet = projectiles[i];

    // Move
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    // Lifetime expiry
    if (bullet.life <= 0) {
      projectiles.splice(i, 1);
      continue;
    }

    // Wall collision
    const tile = worldToTile(bullet.x, bullet.y);
    if (isWall(tile.col, tile.row)) {
      particles.emit(bullet.x, bullet.y, 6, bullet.team === 'blue' ? '#88bbff' : '#ff8888', 40, 0.2);
      projectiles.splice(i, 1);
      continue;
    }

    // Hit detection vs enemies (any alive or carrying player, not just carriers)
    let hit = false;
    for (const player of Object.values(players)) {
      if (player.team === bullet.team) continue;
      if (player.state === 'dead') continue;

      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_RADIUS + BULLET_RADIUS) {
        // Check shield
        if (player.shieldActive) {
          player.shieldActive = false;
          player.shieldTimer = 0;
          particles.emitRing(player.x, player.y, 12, PHYS_COLORS.shield);
          sounds.play('shieldBreak');
          hit = true;
          break;
        }

        // Find killer name
        const killer = players[bullet.ownerId];
        const killerName = killer ? killer.name : 'Unknown';
        killPlayer(player, killerName, state, particles, camera, sounds, localPlayerId);
        hit = true;
        break;
      }
    }

    if (hit) {
      projectiles.splice(i, 1);
    }
  }
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

    // Flag return: touch your own team's dropped flag to instantly return it
    const ownFlag = player.team === 'blue' ? flags.blue : flags.red;
    if (!ownFlag.carrierId && ownFlag.dropTimer > 0) {
      const dx = player.x - ownFlag.x;
      const dy = player.y - ownFlag.y;
      if (Math.sqrt(dx * dx + dy * dy) < FLAG_TOUCH_RETURN_RADIUS) {
        // Return flag to base
        ownFlag.x = ownFlag.baseX;
        ownFlag.y = ownFlag.baseY;
        ownFlag.dropTimer = 0;
        particles.emit(ownFlag.baseX, ownFlag.baseY, 16, player.team === 'blue' ? '#4488ff' : '#ff4444', 100, 0.5);
        particles.emitRing(ownFlag.baseX, ownFlag.baseY, 12, '#ffffff');
        addEvent(state, `${player.name} returned the ${ownFlag.team} flag!`, player.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('pickup');
      }
    }

    // Flag pickup (enemy flag)
    const enemyFlag = player.team === 'blue' ? flags.red : flags.blue;
    if (!enemyFlag.carrierId && (player.state === 'alive' || player.state === 'carrying')) {
      // Only pick up if not already carrying
      if (player.state === 'alive') {
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
    }

    // Flag scoring
    if (player.state === 'carrying') {
      const ownBase = player.team === 'blue' ? BLUE_FLAG_POS : RED_FLAG_POS;
      const playerOwnFlag = player.team === 'blue' ? flags.blue : flags.red;

      // Can score if own flag is at base
      const ownFlagAtBase = !playerOwnFlag.carrierId &&
        Math.abs(playerOwnFlag.x - ownBase.x) < 16 && Math.abs(playerOwnFlag.y - ownBase.y) < 16;

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

    // Power-up collection
    for (const pu of powerUps) {
      if (!pu.active) continue;
      const dx = player.x - pu.x;
      const dy = player.y - pu.y;
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        pu.active = false;
        particles.emitRing(pu.x, pu.y, 12, pu.type === 'speed' ? PHYS_COLORS.speed : pu.type === 'shield' ? PHYS_COLORS.shield : PHYS_COLORS.dashReset);
        sounds.play('powerup');

        switch (pu.type) {
          case 'speed':
            player.speedBoostActive = true;
            player.speedBoostTimer = SPEED_BOOST_DURATION;
            addEvent(state, `${player.name} got Speed Boost!`, PHYS_COLORS.speed);
            break;
          case 'shield':
            player.shieldActive = true;
            player.shieldTimer = SHIELD_DURATION;
            addEvent(state, `${player.name} got Shield!`, PHYS_COLORS.shield);
            break;
          case 'dash_reset':
            player.dashCooldown = 0;
            addEvent(state, `${player.name} got Dash Reset!`, PHYS_COLORS.dashReset);
            break;
        }
      }
    }
  }

  // Update projectiles
  updateProjectiles(state, localPlayerId, particles, camera, sounds);

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
const PHYS_COLORS = {
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
    projectiles: [],
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
    shootCooldown: 0,
    animFrame: 0,
    animTimer: 0,
    flashTimer: 0,
  };
}
