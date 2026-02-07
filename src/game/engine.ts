import { GameState, InputState, Player, Projectile, ChatMessage } from './types';
import { updatePlayer, updateGameLogic, createInitialGameState, createPlayer } from './physics';
import { InputManager } from './input';
import { Renderer3D } from './renderer3d';
import { ParticleSystem3D } from './particles3d';
import { Camera3D } from './camera3d';
import { SoundManager } from '../utils/sounds';
import {
  COUNTDOWN_TIME, PLAYER_NAMES,
  BULLET_SPEED_3D, SHOOT_COOLDOWN, PLAYER_RADIUS_3D, PLAYER_EYE_HEIGHT,
} from './constants';

export class GameEngine {
  private container: HTMLElement;
  state: GameState;
  input: InputManager;
  renderer3d: Renderer3D;
  particles3d: ParticleSystem3D;
  camera3d: Camera3D;
  sounds: SoundManager;
  localPlayerId: string;
  isHost: boolean;
  running = false;
  lastTime = 0;

  // Network callbacks
  onInputChange?: (encoded: number) => void;
  onStateUpdate?: (state: GameState) => void;
  onShootEvent?: (dx: number, dy: number, dz: number) => void;
  onChatSend?: (text: string) => void;

  // Chat messages (separate from GameState to avoid network overhead)
  chatMessages: ChatMessage[] = [];

  // Remote player inputs (for host)
  remoteInputs: Record<string, InputState> = {};

  // Bot shoot timers
  private botShootTimers: Record<string, number> = {};

  // Shoot cooldown tracked separately for input polling
  private localShootCooldown = 0;

  constructor(container: HTMLElement, localPlayerId: string) {
    this.container = container;
    this.state = createInitialGameState();
    this.input = new InputManager();
    this.camera3d = new Camera3D();
    this.sounds = new SoundManager();
    this.localPlayerId = localPlayerId;
    this.isHost = false;

    // Create 3D renderer
    this.renderer3d = new Renderer3D(container);
    this.particles3d = new ParticleSystem3D();
    this.renderer3d.addToScene(this.particles3d.getObject());

    // Bind input to the renderer's canvas
    this.input.bindCanvas(this.renderer3d.getCanvas());

    // Forward input changes for network
    this.input.onInputChange = (encoded) => {
      this.onInputChange?.(encoded);
    };

    // Handle resize
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer3d.resize(w, h);
  };

  createProjectile(player: Player, dirX: number, dirY: number, dirZ: number) {
    if (player.shootCooldown > 0) return;

    player.shootCooldown = SHOOT_COOLDOWN;

    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len === 0) return;
    const ndx = dirX / len;
    const ndy = dirY / len;
    const ndz = dirZ / len;

    const bullet: Projectile = {
      id: `b-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ownerId: player.id,
      team: player.team,
      x: player.x + ndx * (PLAYER_RADIUS_3D + 0.15),
      y: PLAYER_EYE_HEIGHT + ndy * (PLAYER_RADIUS_3D + 0.15),
      z: player.z + ndz * (PLAYER_RADIUS_3D + 0.15),
      vx: ndx * BULLET_SPEED_3D,
      vy: ndy * BULLET_SPEED_3D,
      vz: ndz * BULLET_SPEED_3D,
      life: 1.5,
    };

    this.state.projectiles.push(bullet);
  }

  addChatMessage(msg: ChatMessage) {
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 50) this.chatMessages.shift();
  }

  addPlayer(id: string, name: string, team: 'blue' | 'red', spawnIndex: number) {
    this.state.players[id] = createPlayer(id, name, team, spawnIndex);
  }

  removePlayer(id: string) {
    // If player was carrying a flag, drop it
    for (const flag of [this.state.flags.blue, this.state.flags.red]) {
      if (flag.carrierId === id) {
        flag.carrierId = null;
        flag.dropTimer = 5;
      }
    }
    delete this.state.players[id];
  }

  startCountdown() {
    this.state.gamePhase = 'countdown';
    this.state.countdownTimer = COUNTDOWN_TIME;
  }

  startGame() {
    this.state.gamePhase = 'playing';
    this.sounds.play('go');
  }

  // Add bots for single-player testing
  addBots() {
    const usedNames = new Set<string>();

    let localTeam: 'blue' | 'red' = 'blue';

    if (!this.state.players[this.localPlayerId]) {
      const name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
      usedNames.add(name);
      this.addPlayer(this.localPlayerId, name, localTeam, 0);
    } else {
      localTeam = this.state.players[this.localPlayerId].team;
      usedNames.add(this.state.players[this.localPlayerId].name);
    }

    let blueCount = localTeam === 'blue' ? 1 : 0;
    let redCount = localTeam === 'red' ? 1 : 0;

    for (let i = 0; i < 5; i++) {
      let name: string;
      do {
        name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
      } while (usedNames.has(name));
      usedNames.add(name);

      let team: 'blue' | 'red';
      if (blueCount < 3) {
        team = 'blue';
        blueCount++;
      } else {
        team = 'red';
        redCount++;
      }

      const spawnIdx = team === 'blue' ? blueCount - 1 : redCount - 1;
      this.addPlayer(`bot-${i}`, name, team, spawnIdx);
      this.botShootTimers[`bot-${i}`] = Math.random() * 2;
    }
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.input.destroy();
    window.removeEventListener('resize', this.handleResize);
    this.renderer3d.dispose();
  }

  getState(): GameState {
    return this.state;
  }

  getLocalPlayer(): Player | undefined {
    return this.state.players[this.localPlayerId];
  }

  getChatMessages(): ChatMessage[] {
    return this.chatMessages;
  }

  private loop = (time: number) => {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.update(dt, time / 1000);
    this.render(time / 1000);

    requestAnimationFrame(this.loop);
  };

  private update(dt: number, time: number) {
    const { state, input, particles3d, camera3d, sounds, localPlayerId } = this;

    // 1. Consume mouse deltas and apply to camera
    const { dx: mouseDx, dy: mouseDy } = input.consumeMouseDelta();
    if (mouseDx !== 0 || mouseDy !== 0) {
      camera3d.applyMouseDelta(mouseDx, mouseDy);
    }

    // Countdown
    if (state.gamePhase === 'countdown') {
      const prevSec = Math.ceil(state.countdownTimer);
      state.countdownTimer -= dt;
      const newSec = Math.ceil(state.countdownTimer);
      if (newSec !== prevSec && newSec > 0) {
        sounds.play('countdown');
      }
      if (state.countdownTimer <= 0) {
        this.startGame();
      }
      // Still update camera position during countdown
      const localPlayer = state.players[localPlayerId];
      if (localPlayer) {
        localPlayer.yaw = camera3d.yaw;
        localPlayer.pitch = camera3d.pitch;
        camera3d.setPosition(localPlayer.x, localPlayer.z);
      }
      camera3d.update(dt);
      return;
    }

    if (state.gamePhase !== 'playing') return;

    // 2. Update local player
    const localPlayer = state.players[localPlayerId];
    if (localPlayer) {
      // Set player yaw/pitch from camera
      localPlayer.yaw = camera3d.yaw;
      localPlayer.pitch = camera3d.pitch;

      // Camera-relative movement
      updatePlayer(localPlayer, input.state, dt, camera3d);

      // 3. Shooting: mouse held check
      this.localShootCooldown -= dt;
      if (input.isMouseHeld() && this.localShootCooldown <= 0 && localPlayer.state !== 'dead') {
        const aim = camera3d.getAimDirection();
        this.createProjectile(localPlayer, aim.x, aim.y, aim.z);
        this.localShootCooldown = SHOOT_COOLDOWN;
        sounds.play('shoot');
        this.onShootEvent?.(aim.x, aim.y, aim.z);
      }

      // Dash particles
      if (localPlayer.isDashing) {
        const color = localPlayer.team === 'blue' ? '#88bbff' : '#ff8888';
        particles3d.emitDirectional(
          localPlayer.x, PLAYER_EYE_HEIGHT * 0.5, localPlayer.z,
          -localPlayer.vx, 0, -localPlayer.vz,
          2, color, 2
        );
        if (localPlayer.dashTimer > 0.15) sounds.play('dash');
      }
    }

    // 4. Update bots
    for (const [id, player] of Object.entries(state.players)) {
      if (id === localPlayerId) continue;
      if (!id.startsWith('bot-')) continue;

      const botInput = this.getBotInput(player);
      updatePlayer(player, botInput, dt);

      if (player.isDashing) {
        const color = player.team === 'blue' ? '#88bbff' : '#ff8888';
        particles3d.emitDirectional(player.x, 0.5, player.z, -player.vx, 0, -player.vz, 1, color, 1.5);
      }

      // Bot shooting AI
      this.updateBotShooting(player, dt);
    }

    // 5. Update remote players (from network)
    for (const [id, remoteInput] of Object.entries(this.remoteInputs)) {
      const player = state.players[id];
      if (player && id !== localPlayerId && !id.startsWith('bot-')) {
        updatePlayer(player, remoteInput, dt);
      }
    }

    // 6. Game logic (flags, scoring, power-ups, projectiles)
    updateGameLogic(state, localPlayerId, particles3d, camera3d, sounds);

    // 7. Particles
    particles3d.update(dt);

    // 8. Camera
    if (localPlayer) {
      camera3d.setPosition(localPlayer.x, localPlayer.z);
    }
    camera3d.update(dt);

    // Decay chat messages
    for (let i = this.chatMessages.length - 1; i >= 0; i--) {
      const age = Date.now() - this.chatMessages[i].timestamp;
      if (age > 30000) {
        this.chatMessages.splice(i, 1);
      }
    }

    state.tick++;
  }

  private render(time: number) {
    // 9. Sync entity meshes
    this.renderer3d.syncEntities(this.state, this.localPlayerId, time);
    // 10. Render
    this.renderer3d.render(this.camera3d);
  }

  private updateBotShooting(bot: Player, dt: number) {
    if (bot.state === 'dead') return;
    if (!this.botShootTimers[bot.id]) this.botShootTimers[bot.id] = Math.random() * 2;

    this.botShootTimers[bot.id] -= dt;
    if (this.botShootTimers[bot.id] > 0) return;

    // Reset timer
    this.botShootTimers[bot.id] = 0.6 + Math.random() * 0.6;

    // Find nearest enemy within 10 world units
    let nearestDist = 10;
    let nearestEnemy: Player | null = null;
    for (const other of Object.values(this.state.players)) {
      if (other.team === bot.team || other.state === 'dead') continue;
      const dx = other.x - bot.x;
      const dz = other.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = other;
      }
    }

    if (!nearestEnemy) return;

    // Aim at enemy with spread
    const dx = nearestEnemy.x - bot.x;
    const dz = nearestEnemy.z - bot.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist === 0) return;

    const baseYaw = Math.atan2(-dx, -dz);
    const spread = (Math.random() - 0.5) * (Math.PI / 6); // +/-15 degrees
    const yaw = baseYaw + spread;
    const pitch = (Math.random() - 0.5) * 0.2; // slight vertical randomness

    const cosPitch = Math.cos(pitch);
    const dirX = -Math.sin(yaw) * cosPitch;
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * cosPitch;

    this.createProjectile(bot, dirX, dirY, dirZ);
  }

  private getBotInput(bot: Player): InputState {
    const state = this.state;
    const botInput: InputState = { up: false, down: false, left: false, right: false, dash: false, shoot: false };

    if (bot.state === 'dead') return botInput;

    // Simple bot AI - all in world units
    let targetX: number;
    let targetZ: number;

    if (bot.state === 'carrying') {
      // Go to own base to score
      const ownFlag = bot.team === 'blue' ? state.flags.blue : state.flags.red;
      targetX = ownFlag.baseX;
      targetZ = ownFlag.baseZ;
    } else {
      // Check if own flag is dropped
      const ownFlag = bot.team === 'blue' ? state.flags.blue : state.flags.red;
      if (!ownFlag.carrierId && ownFlag.dropTimer > 0 && Math.random() < 0.5) {
        targetX = ownFlag.x;
        targetZ = ownFlag.z;
      } else {
        const enemyFlag = bot.team === 'blue' ? state.flags.red : state.flags.blue;
        targetX = enemyFlag.x;
        targetZ = enemyFlag.z;
      }
    }

    const dx = targetX - bot.x;
    const dz = targetZ - bot.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Threshold in world units
    if (dx > 0.3) botInput.right = true;
    if (dx < -0.3) botInput.left = true;
    if (dz > 0.3) botInput.down = true;
    if (dz < -0.3) botInput.up = true;

    // Dash when close to flag or being chased
    if (dist < 3 && bot.dashCooldown <= 0) {
      botInput.dash = true;
    }

    // Random direction changes to avoid getting stuck
    const jitter = Math.sin(Date.now() / 1000 + bot.x) * 0.3;
    if (Math.random() < 0.02) {
      if (jitter > 0) {
        botInput.up = !botInput.up;
      } else {
        botInput.left = !botInput.left;
      }
    }

    return botInput;
  }

  // For network: apply state from host
  applyRemoteState(remoteState: Partial<GameState>) {
    const localPlayer = this.state.players[this.localPlayerId];

    Object.assign(this.state, remoteState);

    // Restore local player prediction (smooth correction)
    if (localPlayer && this.state.players[this.localPlayerId]) {
      const remote = this.state.players[this.localPlayerId];
      const dx = remote.x - localPlayer.x;
      const dz = remote.z - localPlayer.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // If divergence is small, smoothly correct; if large (>1.5 units), snap
      if (dist < 1.5) {
        this.state.players[this.localPlayerId].x = localPlayer.x + dx * 0.3;
        this.state.players[this.localPlayerId].z = localPlayer.z + dz * 0.3;
      }
      // Preserve local yaw/pitch
      this.state.players[this.localPlayerId].yaw = this.camera3d.yaw;
      this.state.players[this.localPlayerId].pitch = this.camera3d.pitch;
    }
  }
}
