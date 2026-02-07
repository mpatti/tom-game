import { PresenceChannel } from 'pusher-js';
import { subscribeToPresenceChannel, unsubscribe } from '../network/pusher-client';
import { LobbyPlayer, Team } from '../game/types';

export interface MatchmakerCallbacks {
  onPlayersUpdate: (players: LobbyPlayer[], myId: string) => void;
  onGameStart: (roomId: string, players: LobbyPlayer[], myId: string) => void;
  onError: (error: string) => void;
}

export class Matchmaker {
  private lobbyChannel: PresenceChannel | null = null;
  private gameChannel: PresenceChannel | null = null;
  private callbacks: MatchmakerCallbacks;
  private myId = '';
  private roomId: string;

  constructor(callbacks: MatchmakerCallbacks) {
    this.callbacks = callbacks;
    this.roomId = `game-${Math.random().toString(36).substring(2, 8)}`;
  }

  joinLobby(roomId?: string) {
    if (roomId) this.roomId = roomId;

    const channelName = `presence-${this.roomId}`;
    this.lobbyChannel = subscribeToPresenceChannel(channelName);

    this.lobbyChannel.bind('pusher:subscription_succeeded', (members: { myID: string; count: number; members: Record<string, { name: string }> }) => {
      this.myId = members.myID;
      this.updatePlayers();
    });

    this.lobbyChannel.bind('pusher:member_added', () => {
      this.updatePlayers();
    });

    this.lobbyChannel.bind('pusher:member_removed', () => {
      this.updatePlayers();
    });

    this.lobbyChannel.bind('client-start-game', () => {
      const players = this.getPlayers();
      this.callbacks.onGameStart(this.roomId, players, this.myId);
    });
  }

  private getPlayers(): LobbyPlayer[] {
    if (!this.lobbyChannel) return [];
    const members = this.lobbyChannel.members;
    const players: LobbyPlayer[] = [];

    members.each((member: { id: string; info: { name: string } }) => {
      players.push({
        id: member.id,
        name: member.info.name,
        team: null,
      });
    });

    // Auto-assign teams
    players.sort((a, b) => a.id.localeCompare(b.id));
    players.forEach((p, i) => {
      p.team = i % 2 === 0 ? 'blue' : 'red';
    });

    return players;
  }

  private updatePlayers() {
    const players = this.getPlayers();
    this.callbacks.onPlayersUpdate(players, this.myId);

    // Auto-start when 6 players join
    if (players.length >= 6) {
      this.triggerStart();
    }
  }

  triggerStart() {
    if (!this.lobbyChannel) return;
    try {
      this.lobbyChannel.trigger('client-start-game', {});
    } catch (e) {
      // May fail if not enough members for client events
    }
    const players = this.getPlayers();
    this.callbacks.onGameStart(this.roomId, players, this.myId);
  }

  getRoomId(): string {
    return this.roomId;
  }

  getMyId(): string {
    return this.myId;
  }

  getChannel(): PresenceChannel | null {
    return this.lobbyChannel;
  }

  leave() {
    if (this.lobbyChannel) {
      unsubscribe(`presence-${this.roomId}`);
      this.lobbyChannel = null;
    }
  }
}
