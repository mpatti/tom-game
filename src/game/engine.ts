import { GameState, InputState, Player } from './types';
import { updatePlayer, updateGameLogic, createInitialGameState, createPlayer } from './physics';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { ParticleSystem } from './particles';
import { Camera } from './camera';
import { SoundManager } from '../utils/sounds';
import { COUNTDOWN_TIME, PLAYER_NAMES } from './constants';

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

  // Remote player inputs (for host)
  remoteInputs: Record<string, InputState> = {};

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
    const teams: Array<'blue' | 'red'> = ['blue', 'blue', 'blue', 'red', 'red', 'red'];
    const usedNames = new Set<string>();

    // First player is the local player
    let localTeam: 'blue' | 'red' = 'blue';
    let localIdx = 0;

    if (!this.state.players[this.localPlayerId]) {
      const name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
      usedNames.add(name);
      this.addPlayer(this.localPlayerId, name, localTeam, localIdx);
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
    }

    // Update remote players (from network)
    for (const [id, remoteInput] of Object.entries(this.remoteInputs)) {
      const player = state.players[id];
      if (player && id !== localPlayerId && !id.startsWith('bot-')) {
        updatePlayer(player, remoteInput, dt);
      }
    }

    // Game logic (flags, scoring, power-ups)
    updateGameLogic(state, localPlayerId, particles, camera, sounds);

    // Particles
    particles.update(dt);

    // Camera
    if (localPlayer) {
      camera.follow(localPlayer.x, localPlayer.y);
    }
    camera.update(dt);

    state.tick++;
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
      // Go to enemy flag
      const enemyFlag = bot.team === 'blue' ? state.flags.red : state.flags.blue;
      targetX = enemyFlag.x;
      targetY = enemyFlag.y;
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
    this.renderer.render(this.state, this.camera, this.particles, this.localPlayerId);
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
