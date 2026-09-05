import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const roomName = 'voice-agent-room';
  const participantName = `user-${Math.floor(Math.random() * 10000)}`;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

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
