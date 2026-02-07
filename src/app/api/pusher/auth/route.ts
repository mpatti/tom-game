import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');

  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // For presence channels, provide user data
  if (channelName.startsWith('presence-')) {
    // Generate a random player ID and name
    const userId = `user-${Math.random().toString(36).substring(2, 9)}`;
    const playerNames = [
      'Shadow', 'Blaze', 'Frost', 'Storm', 'Viper',
      'Ghost', 'Phoenix', 'Raven', 'Wolf', 'Hawk',
      'Cobra', 'Tiger', 'Eagle', 'Jaguar', 'Falcon',
      'Nova', 'Bolt', 'Flare', 'Drift', 'Spark',
    ];
    const name = playerNames[Math.floor(Math.random() * playerNames.length)];

    const authResponse = pusher.authorizeChannel(socketId, channelName, {
      user_id: userId,
      user_info: { name },
    });

    return NextResponse.json(authResponse);
  }

  // For private channels
  const authResponse = pusher.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}
