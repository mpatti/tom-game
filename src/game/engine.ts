import { GameState, InputState, Player, Projectile, ChatMessage } from './types';
import { updatePlayer, updateGameLogic, createInitialGameState, createPlayer } from './physics';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { ParticleSystem } from './particles';
import { Camera } from './camera';
import { SoundManager } from '../utils/sounds';
import { COUNTDOWN_TIME, PLAYER_NAMES, BULLET_SPEED, SHOOT_COOLDOWN, PLAYER_RADIUS } from './constants';

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: GameState;
  input: InputManager;
  renderer: Renderer;
  particles: ParticleSystem;
  camera: Camera;
  sounds: SoundManager;
  localPlayerId: string;
  isHost: boolean;
  running = false;
  lastTime = 0;

  // Network callbacks
  onInputChange?: (encoded: number) => void;
  onStateUpdate?: (state: GameState) => void;
  onShootEvent?: (dx: number, dy: number) => void;
  onChatSend?: (text: string) => void;

  // Chat messages (separate from GameState to avoid network overhead)
  chatMessages: ChatMessage[] = [];

  // Remote player inputs (for host)
  remoteInputs: Record<string, InputState> = {};

  // Bot shoot timers
  private botShootTimers: Record<string, number> = {};

  constructor(canvas: HTMLCanvasElement, localPlayerId: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.state = createInitialGameState();
    this.input = new InputManager();
    this.particles = new ParticleSystem();
    this.camera = new Camera(canvas.width, canvas.height);
    this.sounds = new SoundManager();
    this.renderer = new Renderer(this.ctx, canvas.width, canvas.height);
    this.localPlayerId = localPlayerId;
    this.isHost = false;

    this.input.onInputChange = (encoded) => {
      this.onInputChange?.(encoded);
    };

    // Bind canvas for mouse input
    this.input.bindCanvas(canvas);

    // Shoot handler
    this.input.onShoot = () => {
      const localPlayer = this.state.players[this.localPlayerId];
      if (!localPlayer || localPlayer.state === 'dead' || this.state.gamePhase !== 'playing') return;
      if (localPlayer.shootCooldown > 0) return;

      // Convert screen mouse position to world coords
      const worldX = this.input.mouseScreenX + this.camera.scrollX;
      const worldY = this.input.mouseScreenY + this.camera.scrollY;

      // Direction from player to mouse
      const dx = worldX - localPlayer.x;
      const dy = worldY - localPlayer.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      const dirX = dx / len;
      const dirY = dy / len;

      this.createProjectile(localPlayer, dirX, dirY);
      this.sounds.play('shoot');

      // Network: notify about shoot
      this.onShootEvent?.(dirX, dirY);
    };

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  handleResize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.camera.width = this.canvas.width;
    this.camera.height = this.canvas.height;
    this.renderer.resize(this.canvas.width, this.canvas.height);
  };

  createProjectile(player: Player, dirX: number, dirY: number) {
    if (player.shootCooldown > 0) return;

    player.shootCooldown = SHOOT_COOLDOWN;

    const bullet: Projectile = {
      id: `b-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ownerId: player.id,
      team: player.team,
      x: player.x + dirX * (PLAYER_RADIUS + 4),
      y: player.y + dirY * (PLAYER_RADIUS + 4),
      vx: dirX * BULLET_SPEED,
      vy: dirY * BULLET_SPEED,
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

    // First player is the local player
    let localTeam: 'blue' | 'red' = 'blue';

    if (!this.state.players[this.localPlayerId]) {
      const name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
      usedNames.add(name);
      this.addPlayer(this.localPlayerId, name, localTeam, 0);
    } else {
      localTeam = this.state.players[this.localPlayerId].team;
      usedNames.add(this.state.players[this.localPlayerId].name);
    }

    // Fill remaining slots with bots
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
  }

  private loop = (time: number) => {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // Cap at 50ms
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    const { state, input, particles, camera, sounds, localPlayerId } = this;

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
      return;
    }

    if (state.gamePhase !== 'playing') return;

    // Update local player
    const localPlayer = state.players[localPlayerId];
    if (localPlayer) {
      updatePlayer(localPlayer, input.state, dt);

      // Dash particles
      if (localPlayer.isDashing) {
        const color = localPlayer.team === 'blue' ? '#88bbff' : '#ff8888';
        particles.emitDirectional(
          localPlayer.x, localPlayer.y,
          -localPlayer.vx, -localPlayer.vy,
          2, color, 80
        );
        if (localPlayer.dashTimer > 0.15) sounds.play('dash');
      }
    }

    // Update bots (simple AI)
    for (const [id, player] of Object.entries(state.players)) {
      if (id === localPlayerId) continue;
      if (!id.startsWith('bot-')) continue;

      const botInput = this.getBotInput(player);
      updatePlayer(player, botInput, dt);

      if (player.isDashing) {
        const color = player.team === 'blue' ? '#88bbff' : '#ff8888';
        particles.emitDirectional(player.x, player.y, -player.vx, -player.vy, 1, color, 60);
      }

      // Bot shooting AI
      this.updateBotShooting(player, dt);
    }

    // Update remote players (from network)
    for (const [id, remoteInput] of Object.entries(this.remoteInputs)) {
      const player = state.players[id];
      if (player && id !== localPlayerId && !id.startsWith('bot-')) {
        updatePlayer(player, remoteInput, dt);
      }
    }

    // Game logic (flags, scoring, power-ups, projectiles)
    updateGameLogic(state, localPlayerId, particles, camera, sounds);

    // Particles
    particles.update(dt);

    // Camera
    if (localPlayer) {
      camera.follow(localPlayer.x, localPlayer.y);
    }
    camera.update(dt);

    // Decay chat messages
    for (let i = this.chatMessages.length - 1; i >= 0; i--) {
      const age = Date.now() - this.chatMessages[i].timestamp;
      if (age > 30000) { // Remove after 30s
        this.chatMessages.splice(i, 1);
      }
    }

    state.tick++;
  }

  private updateBotShooting(bot: Player, dt: number) {
    if (bot.state === 'dead') return;
    if (!this.botShootTimers[bot.id]) this.botShootTimers[bot.id] = Math.random() * 2;

    this.botShootTimers[bot.id] -= dt;
    if (this.botShootTimers[bot.id] > 0) return;

    // Reset timer (0.6-1.2s effective cooldown for bots)
    this.botShootTimers[bot.id] = 0.6 + Math.random() * 0.6;

    // Find nearest enemy within 300px
    let nearestDist = 300;
    let nearestEnemy: Player | null = null;
    for (const other of Object.values(this.state.players)) {
      if (other.team === bot.team || other.state === 'dead') continue;
      const dx = other.x - bot.x;
      const dy = other.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = other;
      }
    }

    if (!nearestEnemy) return;

    // Aim at enemy with ±15° random inaccuracy
    const dx = nearestEnemy.x - bot.x;
    const dy = nearestEnemy.y - bot.y;
    const angle = Math.atan2(dy, dx);
    const spread = (Math.random() - 0.5) * (Math.PI / 6); // ±15°
    const aimAngle = angle + spread;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    this.createProjectile(bot, dirX, dirY);
  }

  private getBotInput(bot: Player): InputState {
    const state = this.state;
    const input: InputState = { up: false, down: false, left: false, right: false, dash: false };

    if (bot.state === 'dead') return input;

    // Simple bot AI
    let targetX: number, targetY: number;

    if (bot.state === 'carrying') {
      // Go to own base to score
      const ownFlag = bot.team === 'blue' ? state.flags.blue : state.flags.red;
      targetX = ownFlag.baseX;
      targetY = ownFlag.baseY;
    } else {
      // Check if own flag is dropped - 50% chance to prioritize returning it
      const ownFlag = bot.team === 'blue' ? state.flags.blue : state.flags.red;
      if (!ownFlag.carrierId && ownFlag.dropTimer > 0 && Math.random() < 0.5) {
        // Go return own flag
        targetX = ownFlag.x;
        targetY = ownFlag.y;
      } else {
        // Go to enemy flag
        const enemyFlag = bot.team === 'blue' ? state.flags.red : state.flags.blue;
        targetX = enemyFlag.x;
        targetY = enemyFlag.y;
      }
    }

    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Add some randomness to bot movement
    const jitter = Math.sin(Date.now() / 1000 + bot.x) * 0.3;

    if (dx > 10) input.right = true;
    if (dx < -10) input.left = true;
    if (dy > 10) input.down = true;
    if (dy < -10) input.up = true;

    // Dash when close to flag or being chased
    if (dist < 100 && bot.dashCooldown <= 0) {
      input.dash = true;
    }

    // Random direction changes to avoid getting stuck on walls
    if (Math.random() < 0.02) {
      if (jitter > 0) {
        input.up = !input.up;
      } else {
        input.left = !input.left;
      }
    }

    return input;
  }

  private render() {
    this.renderer.render(this.state, this.camera, this.particles, this.localPlayerId, this.chatMessages);
  }

  // For network: apply state from host
  applyRemoteState(remoteState: Partial<GameState>) {
    // Merge remote state, but keep local player position if we're predicting
    const localPlayer = this.state.players[this.localPlayerId];

    Object.assign(this.state, remoteState);

    // Restore local player prediction (smooth correction)
    if (localPlayer && this.state.players[this.localPlayerId]) {
      const remote = this.state.players[this.localPlayerId];
      const dx = remote.x - localPlayer.x;
      const dy = remote.y - localPlayer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // If divergence is small, smoothly correct; if large, snap
      if (dist < 50) {
        this.state.players[this.localPlayerId].x = localPlayer.x + dx * 0.3;
        this.state.players[this.localPlayerId].y = localPlayer.y + dy * 0.3;
      }
    }
  }
}
