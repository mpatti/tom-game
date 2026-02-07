import Pusher, { Channel, PresenceChannel } from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
  if (!pusherInstance) {
    pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: '/api/pusher/auth',
    });
  }
  return pusherInstance;
}

export function subscribeToPresenceChannel(channelName: string): PresenceChannel {
  const pusher = getPusher();
  return pusher.subscribe(channelName) as PresenceChannel;
}

export function subscribeToChannel(channelName: string): Channel {
  const pusher = getPusher();
  return pusher.subscribe(channelName);
}

export function unsubscribe(channelName: string) {
  const pusher = getPusher();
  pusher.unsubscribe(channelName);
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}

export function getConnectionState(): string {
  return pusherInstance?.connection?.state || 'disconnected';
}
