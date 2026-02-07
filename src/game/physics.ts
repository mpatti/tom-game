import { Player, InputState, GameState } from './types';
import {
  PLAYER_SPEED_3D, PLAYER_ACCEL_3D, PLAYER_DECEL_3D, PLAYER_RADIUS_3D,
  DASH_SPEED_3D, DASH_DURATION, DASH_COOLDOWN,
  FLAG_PICKUP_RADIUS_3D, FLAG_SCORE_RADIUS_3D,
  FLAG_RETURN_TIME, FLAG_TOUCH_RETURN_RADIUS_3D, RESPAWN_TIME, SCORE_TO_WIN,
  SPEED_BOOST_MULTIPLIER, SPEED_BOOST_DURATION, SHIELD_DURATION,
  POWERUP_SPAWN_INTERVAL, SCREEN_SHAKE_CAPTURE, SCREEN_SHAKE_TAG,
  PLAYER_EYE_HEIGHT,
} from './constants';
import {
  collideWithWalls3D, isWall3D,
  BLUE_FLAG_POS_3D, RED_FLAG_POS_3D,
  BLUE_SPAWNS_3D, RED_SPAWNS_3D,
  POWERUP_LOCATIONS_3D,
} from './map';
import { ParticleSystem3D } from './particles3d';
import { Camera3D } from './camera3d';
import { SoundManager } from '../utils/sounds';

export function updatePlayer(player: Player, input: InputState, dt: number, camera3d?: Camera3D): void {
  if (player.state === 'dead') {
    player.respawnTimer -= dt;
    player.vx = 0;
    player.vz = 0;
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

  // Dash initiation
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

  // Compute movement direction
  let moveX = 0;
  let moveZ = 0;

  if (camera3d) {
    // Camera-relative movement (local player with FPS camera)
    const fwd = camera3d.getForwardXZ();
    const right = camera3d.getRightXZ();

    if (input.up) { moveX += fwd.x; moveZ += fwd.z; }
    if (input.down) { moveX -= fwd.x; moveZ -= fwd.z; }
    if (input.right) { moveX += right.x; moveZ += right.z; }
    if (input.left) { moveX -= right.x; moveZ -= right.z; }
  } else {
    // Raw input (bots, remote players)
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;
    if (input.up) moveZ -= 1;
    if (input.down) moveZ += 1;
  }

  // Normalize diagonal
  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;
  }

  let speed = PLAYER_SPEED_3D;
  if (player.isDashing) speed = DASH_SPEED_3D;
  if (player.speedBoostActive) speed *= SPEED_BOOST_MULTIPLIER;

  const targetVx = moveX * speed;
  const targetVz = moveZ * speed;

  // Acceleration / deceleration
  const accel = len > 0 ? PLAYER_ACCEL_3D : PLAYER_DECEL_3D;
  const dvx = targetVx - player.vx;
  const dvz = targetVz - player.vz;
  const dvLen = Math.sqrt(dvx * dvx + dvz * dvz);
  if (dvLen > 0) {
    const change = Math.min(accel * dt, dvLen);
    player.vx += (dvx / dvLen) * change;
    player.vz += (dvz / dvLen) * change;
  }

  // Move
  player.x += player.vx * dt;
  player.z += player.vz * dt;

  // Wall collision
  const resolved = collideWithWalls3D(player.x, player.z, PLAYER_RADIUS_3D);
  player.x = resolved.x;
  player.z = resolved.z;
}

// Kill a player -- handles flag drop, death state, particles, shake, events, sound
export function killPlayer(
  victim: Player,
  killerName: string,
  state: GameState,
  particles: ParticleSystem3D,
  camera3d: Camera3D,
  sounds: SoundManager,
  localPlayerId: string,
): void {
  const { flags } = state;

  // If carrying a flag, drop it at the victim's position
  if (victim.state === 'carrying') {
    const carriedFlag = victim.team === 'blue' ? flags.red : flags.blue;
    carriedFlag.x = victim.x;
    carriedFlag.z = victim.z;
    carriedFlag.carrierId = null;
    carriedFlag.dropTimer = FLAG_RETURN_TIME;
  }

  victim.state = 'dead';
  victim.respawnTimer = RESPAWN_TIME;
  victim.flashTimer = 0.3;

  const deathColor = victim.team === 'blue' ? '#4488ff' : '#ff4444';
  particles.emit(victim.x, PLAYER_EYE_HEIGHT, victim.z, 20, deathColor, 3, 0.5);
  camera3d.shake(SCREEN_SHAKE_TAG);
  addEvent(state, `${killerName} eliminated ${victim.name}!`, '#ffffff');
  if (victim.id === localPlayerId) sounds.play('hit');
  else sounds.play('tag');
}

// Update projectiles: move, collide, hit detection
export function updateProjectiles(
  state: GameState,
  localPlayerId: string,
  particles: ParticleSystem3D,
  camera3d: Camera3D,
  sounds: SoundManager,
): void {
  const dt = 1 / 60;
  const { projectiles, players } = state;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const bullet = projectiles[i];

    // Move in 3D
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.z += bullet.vz * dt;
    bullet.life -= dt;

    // Lifetime expiry
    if (bullet.life <= 0) {
      projectiles.splice(i, 1);
      continue;
    }

    // Floor / ceiling bounds
    if (bullet.y < 0 || bullet.y > 3) {
      particles.emit(bullet.x, Math.max(0.1, Math.min(bullet.y, 2.9)), bullet.z, 4, bullet.team === 'blue' ? '#88bbff' : '#ff8888', 1, 0.2);
      projectiles.splice(i, 1);
      continue;
    }

    // Wall collision
    if (isWall3D(bullet.x, bullet.z)) {
      particles.emit(bullet.x, bullet.y, bullet.z, 6, bullet.team === 'blue' ? '#88bbff' : '#ff8888', 1.5, 0.2);
      projectiles.splice(i, 1);
      continue;
    }

    // Hit detection vs enemies
    let hit = false;
    for (const player of Object.values(players)) {
      if (player.team === bullet.team) continue;
      if (player.state === 'dead') continue;

      const dx = bullet.x - player.x;
      const dz = bullet.z - player.z;
      const dist2d = Math.sqrt(dx * dx + dz * dz);
      // Also check vertical: bullet must be within player body height (0 to ~1.6)
      if (dist2d < PLAYER_RADIUS_3D + 0.1 && bullet.y > 0 && bullet.y < 1.8) {
        // Check shield
        if (player.shieldActive) {
          player.shieldActive = false;
          player.shieldTimer = 0;
          particles.emitRing(player.x, PLAYER_EYE_HEIGHT * 0.5, player.z, 12, '#44ffff');
          sounds.play('shieldBreak');
          hit = true;
          break;
        }

        // Find killer name
        const killer = players[bullet.ownerId];
        const killerName = killer ? killer.name : 'Unknown';
        killPlayer(player, killerName, state, particles, camera3d, sounds, localPlayerId);
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
  particles: ParticleSystem3D,
  camera3d: Camera3D,
  sounds: SoundManager,
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

  // Update flag positions for carried flags
  for (const flag of [flags.blue, flags.red]) {
    if (flag.carrierId && players[flag.carrierId]) {
      flag.x = players[flag.carrierId].x;
      flag.z = players[flag.carrierId].z;
    }

    // Drop timer
    if (!flag.carrierId && flag.dropTimer > 0) {
      flag.dropTimer -= dt;
      if (flag.dropTimer <= 0) {
        flag.x = flag.baseX;
        flag.z = flag.baseZ;
      }
    }
  }

  const playerArr = Object.values(players);

  for (const player of playerArr) {
    if (player.state === 'dead') {
      // Respawn
      if (player.respawnTimer <= 0) {
        const spawns = player.team === 'blue' ? BLUE_SPAWNS_3D : RED_SPAWNS_3D;
        const spawnIdx = Math.floor(Math.random() * spawns.length);
        player.x = spawns[spawnIdx].x;
        player.z = spawns[spawnIdx].z;
        player.state = 'alive';
        player.vx = 0;
        player.vz = 0;
        particles.emitRing(player.x, 0.5, player.z, 16, player.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('respawn');
      }
      continue;
    }

    // Flag return: touch your own team's dropped flag to instantly return it
    const ownFlag = player.team === 'blue' ? flags.blue : flags.red;
    if (!ownFlag.carrierId && ownFlag.dropTimer > 0) {
      const dx = player.x - ownFlag.x;
      const dz = player.z - ownFlag.z;
      if (Math.sqrt(dx * dx + dz * dz) < FLAG_TOUCH_RETURN_RADIUS_3D) {
        ownFlag.x = ownFlag.baseX;
        ownFlag.z = ownFlag.baseZ;
        ownFlag.dropTimer = 0;
        particles.emit(ownFlag.baseX, 1.0, ownFlag.baseZ, 16, player.team === 'blue' ? '#4488ff' : '#ff4444', 3, 0.5);
        particles.emitRing(ownFlag.baseX, 0.5, ownFlag.baseZ, 12, '#ffffff');
        addEvent(state, `${player.name} returned the ${ownFlag.team} flag!`, player.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('pickup');
      }
    }

    // Flag pickup (enemy flag)
    const enemyFlag = player.team === 'blue' ? flags.red : flags.blue;
    if (!enemyFlag.carrierId && player.state === 'alive') {
      const dx = player.x - enemyFlag.x;
      const dz = player.z - enemyFlag.z;
      if (Math.sqrt(dx * dx + dz * dz) < FLAG_PICKUP_RADIUS_3D) {
        enemyFlag.carrierId = player.id;
        player.state = 'carrying';
        particles.emit(enemyFlag.x, 1.0, enemyFlag.z, 12, enemyFlag.team === 'blue' ? '#4488ff' : '#ff4444', 2, 0.4);
        addEvent(state, `${player.name} grabbed the ${enemyFlag.team} flag!`, enemyFlag.team === 'blue' ? '#4488ff' : '#ff4444');
        if (player.id === localPlayerId) sounds.play('pickup');
      }
    }

    // Flag scoring
    if (player.state === 'carrying') {
      const ownBase = player.team === 'blue' ? BLUE_FLAG_POS_3D : RED_FLAG_POS_3D;
      const playerOwnFlag = player.team === 'blue' ? flags.blue : flags.red;

      // Can score if own flag is at base
      const ownFlagAtBase = !playerOwnFlag.carrierId &&
        Math.abs(playerOwnFlag.x - ownBase.x) < 0.5 && Math.abs(playerOwnFlag.z - ownBase.z) < 0.5;

      if (ownFlagAtBase) {
        const dx = player.x - ownBase.x;
        const dz = player.z - ownBase.z;
        if (Math.sqrt(dx * dx + dz * dz) < FLAG_SCORE_RADIUS_3D) {
          // SCORE!
          score[player.team]++;
          enemyFlag.carrierId = null;
          enemyFlag.x = enemyFlag.baseX;
          enemyFlag.z = enemyFlag.baseZ;
          enemyFlag.dropTimer = 0;
          player.state = 'alive';
          particles.emit(player.x, PLAYER_EYE_HEIGHT, player.z, 30, player.team === 'blue' ? '#4488ff' : '#ff4444', 5, 0.8);
          particles.emitRing(player.x, 0.5, player.z, 24, '#ffffff', 1.0);
          camera3d.shake(SCREEN_SHAKE_CAPTURE);
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
      const dz = player.z - pu.z;
      if (Math.sqrt(dx * dx + dz * dz) < 0.625) {
        pu.active = false;
        const puColor = pu.type === 'speed' ? '#ffff44' : pu.type === 'shield' ? '#44ffff' : '#ff44ff';
        particles.emitRing(pu.x, 1.0, pu.z, 12, puColor);
        sounds.play('powerup');

        switch (pu.type) {
          case 'speed':
            player.speedBoostActive = true;
            player.speedBoostTimer = SPEED_BOOST_DURATION;
            addEvent(state, `${player.name} got Speed Boost!`, '#ffff44');
            break;
          case 'shield':
            player.shieldActive = true;
            player.shieldTimer = SHIELD_DURATION;
            addEvent(state, `${player.name} got Shield!`, '#44ffff');
            break;
          case 'dash_reset':
            player.dashCooldown = 0;
            addEvent(state, `${player.name} got Dash Reset!`, '#ff44ff');
            break;
        }
      }
    }
  }

  // Update projectiles
  updateProjectiles(state, localPlayerId, particles, camera3d, sounds);

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
  const loc = POWERUP_LOCATIONS_3D[Math.floor(Math.random() * POWERUP_LOCATIONS_3D.length)];

  // Check if there's already a power-up at this location
  if (state.powerUps.some(p => p.active && Math.abs(p.x - loc.x) < 1 && Math.abs(p.z - loc.z) < 1)) return;

  state.powerUps.push({
    id: `pu-${Date.now()}-${Math.random()}`,
    type,
    x: loc.x,
    z: loc.z,
    animTimer: 0,
    active: true,
  });
}

export function createInitialGameState(): GameState {
  return {
    players: {},
    flags: {
      blue: {
        team: 'blue',
        x: BLUE_FLAG_POS_3D.x,
        y: 0,
        z: BLUE_FLAG_POS_3D.z,
        baseX: BLUE_FLAG_POS_3D.x,
        baseZ: BLUE_FLAG_POS_3D.z,
        carrierId: null,
        dropTimer: 0,
      },
      red: {
        team: 'red',
        x: RED_FLAG_POS_3D.x,
        y: 0,
        z: RED_FLAG_POS_3D.z,
        baseX: RED_FLAG_POS_3D.x,
        baseZ: RED_FLAG_POS_3D.z,
        carrierId: null,
        dropTimer: 0,
      },
    },
    score: { blue: 0, red: 0 },
    powerUps: [],
    projectiles: [],
    events: [],
    gamePhase: 'waiting',
    countdownTimer: 0,
    winner: null,
    tick: 0,
    powerUpSpawnTimer: POWERUP_SPAWN_INTERVAL,
  };
}

export function createPlayer(id: string, name: string, team: 'blue' | 'red', spawnIndex: number): Player {
  const spawns = team === 'blue' ? BLUE_SPAWNS_3D : RED_SPAWNS_3D;
  const spawn = spawns[spawnIndex % spawns.length];

  return {
    id,
    name,
    team,
    x: spawn.x,
    y: 0,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: team === 'blue' ? 0 : Math.PI,
    pitch: 0,
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
    flashTimer: 0,
  };
}
