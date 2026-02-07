import { PresenceChannel } from 'pusher-js';
import { CompactGameState } from '../game/types';
import { GameEngine } from '../game/engine';
import { decodeGameState, encodeInput } from './messages';

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

    // Send inputs to host when they change
    this.engine.onInputChange = (encoded: number) => {
      try {
        this.channel.trigger('client-input', {
          k: encoded,
          t: Date.now(),
          id: this.playerId,
        });
      } catch (e) {
        console.warn('Input send failed:', e);
      }
    };
  }

  destroy() {
    this.engine.onInputChange = undefined;
  }
}
