import { PresenceChannel } from 'pusher-js';
import { CompactGameState, ChatMessage } from '../game/types';
import { GameEngine } from '../game/engine';
import { decodeGameState } from './messages';

export class ClientManager {
  private channel: PresenceChannel;
  private engine: GameEngine;
  private playerId: string;

  constructor(channel: PresenceChannel, engine: GameEngine, playerId: string) {
    this.channel = channel;
    this.engine = engine;
    this.playerId = playerId;

    // Listen for state updates from host
    this.channel.bind('client-state', (data: CompactGameState) => {
      const decoded = decodeGameState(data, this.engine.state);
      this.engine.applyRemoteState(decoded);
    });

    // Send inputs to host when they change (include yaw/pitch)
    this.engine.onInputChange = (encoded: number) => {
      try {
        const localPlayer = this.engine.state.players[this.playerId];
        this.channel.trigger('client-input', {
          k: encoded,
          yaw: localPlayer?.yaw || 0,
          pitch: localPlayer?.pitch || 0,
          t: Date.now(),
          id: this.playerId,
        });
      } catch (e) {
        console.warn('Input send failed:', e);
      }
    };

    // Send shoot events to host (3D direction)
    this.engine.onShootEvent = (dx: number, dy: number, dz: number) => {
      try {
        this.channel.trigger('client-shoot', {
          id: this.playerId,
          dx,
          dy,
          dz,
        });
      } catch (e) {
        console.warn('Shoot send failed:', e);
      }
    };

    // Listen for chat messages
    this.channel.bind('client-chat', (data: ChatMessage) => {
      this.engine.addChatMessage(data);
    });
  }

  destroy() {
    this.engine.onInputChange = undefined;
    this.engine.onShootEvent = undefined;
  }
}
