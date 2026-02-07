import { PresenceChannel } from 'pusher-js';
import { subscribeToPresenceChannel, unsubscribe } from '../network/pusher-client';
import { LobbyPlayer, Team, ChatMessage } from '../game/types';

export interface MatchmakerCallbacks {
  onPlayersUpdate: (players: LobbyPlayer[], myId: string) => void;
  onGameStart: (roomId: string, players: LobbyPlayer[], myId: string) => void;
  onError: (error: string) => void;
  onCountdownUpdate?: (countdown: number) => void;
  onChatMessage?: (msg: ChatMessage) => void;
}

export class Matchmaker {
  private lobbyChannel: PresenceChannel | null = null;
  private callbacks: MatchmakerCallbacks;
  private myId = '';
  private roomId: string;
  private readyStates: Record<string, boolean> = {};
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private countdownValue = 0;

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
      this.readyStates[this.myId] = false;
      this.updatePlayers();
    });

    this.lobbyChannel.bind('pusher:member_added', () => {
      this.updatePlayers();
    });

    this.lobbyChannel.bind('pusher:member_removed', (member: { id: string }) => {
      delete this.readyStates[member.id];
      this.cancelCountdown();
      this.updatePlayers();
    });

    this.lobbyChannel.bind('client-start-game', () => {
      const players = this.getPlayers();
      this.callbacks.onGameStart(this.roomId, players, this.myId);
    });

    // Listen for ready state changes
    this.lobbyChannel.bind('client-ready', (data: { id: string; ready: boolean }) => {
      this.readyStates[data.id] = data.ready;
      this.updatePlayers();
      this.checkCountdown();
    });

    // Listen for chat messages
    this.lobbyChannel.bind('client-chat', (data: ChatMessage) => {
      this.callbacks.onChatMessage?.(data);
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
        ready: this.readyStates[member.id] || false,
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
  }

  toggleReady() {
    if (!this.lobbyChannel) return;
    const current = this.readyStates[this.myId] || false;
    this.readyStates[this.myId] = !current;
    try {
      this.lobbyChannel.trigger('client-ready', { id: this.myId, ready: !current });
    } catch (e) {
      // May fail if not enough members
    }
    this.updatePlayers();
    this.checkCountdown();
  }

  private checkCountdown() {
    const players = this.getPlayers();
    if (players.length < 2) {
      this.cancelCountdown();
      return;
    }

    const allReady = players.every(p => p.ready);
    if (allReady && !this.countdownInterval) {
      // Start countdown
      this.countdownValue = 5;
      this.callbacks.onCountdownUpdate?.(this.countdownValue);
      this.countdownInterval = setInterval(() => {
        this.countdownValue--;
        this.callbacks.onCountdownUpdate?.(this.countdownValue);
        if (this.countdownValue <= 0) {
          this.cancelCountdown();
          this.triggerStart();
        }
      }, 1000);
    } else if (!allReady && this.countdownInterval) {
      this.cancelCountdown();
    }
  }

  private cancelCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      this.countdownValue = 0;
      this.callbacks.onCountdownUpdate?.(0);
    }
  }

  sendChat(text: string) {
    if (!this.lobbyChannel || !text.trim()) return;
    const players = this.getPlayers();
    const me = players.find(p => p.id === this.myId);
    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: me?.name || 'Unknown',
      text: text.trim().substring(0, 100),
      team: me?.team || null,
      timestamp: Date.now(),
    };

    try {
      this.lobbyChannel.trigger('client-chat', msg);
    } catch (e) {
      // May fail
    }
    // Also add locally
    this.callbacks.onChatMessage?.(msg);
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
    this.cancelCountdown();
    if (this.lobbyChannel) {
      unsubscribe(`presence-${this.roomId}`);
      this.lobbyChannel = null;
    }
  }
}
