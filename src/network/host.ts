import { PresenceChannel } from 'pusher-js';
import { ChatMessage } from '../game/types';
import { GameEngine } from '../game/engine';
import { encodeGameState } from './messages';
import { NETWORK_UPDATE_RATE } from '../game/constants';
import { InputManager } from '../game/input';

export class HostManager {
  private channel: PresenceChannel;
  private engine: GameEngine;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;

  constructor(channel: PresenceChannel, engine: GameEngine) {
    this.channel = channel;
    this.engine = engine;
    this.engine.isHost = true;

    // Listen for client inputs
    this.channel.bind('client-input', (data: { k: number; yaw: number; pitch: number; t: number; id: string }) => {
      const input = InputManager.decode(data.k);
      this.engine.remoteInputs[data.id] = input;

      // Apply yaw/pitch to the remote player
      const player = this.engine.state.players[data.id];
      if (player) {
        player.yaw = data.yaw;
        player.pitch = data.pitch;
      }
    });

    // Listen for client shoot events (3D direction)
    this.channel.bind('client-shoot', (data: { id: string; dx: number; dy: number; dz: number }) => {
      const player = this.engine.state.players[data.id];
      if (player && player.state !== 'dead') {
        this.engine.createProjectile(player, data.dx, data.dy, data.dz);
      }
    });

    // Listen for chat messages
    this.channel.bind('client-chat', (data: ChatMessage) => {
      this.engine.addChatMessage(data);
    });
  }

  startBroadcasting() {
    this.broadcastInterval = setInterval(() => {
      try {
        const compact = encodeGameState(this.engine.state);
        this.channel.trigger('client-state', compact);
      } catch (e) {
        // Client events can fail if channel isn't ready
        console.warn('Broadcast failed:', e);
      }
    }, NETWORK_UPDATE_RATE);
  }

  stopBroadcasting() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  destroy() {
    this.stopBroadcasting();
  }
}
