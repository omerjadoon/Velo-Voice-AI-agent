import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const roomName = `room-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const participantName = `user-${Math.floor(Math.random() * 10000)}`;

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  // Generate participant room token
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: participantName,
  });

  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();

  return NextResponse.json({ token });
}
