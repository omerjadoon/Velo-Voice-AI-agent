import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const roomName = 'voice-agent-room';
  const participantName = `user-${Math.floor(Math.random() * 10000)}`;

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
  const livekitUrl = process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  // Ensure explicit agent dispatch for room
  try {
    const httpUrl = livekitUrl.replace(/^ws/, 'http');
    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, '');
  } catch (err) {
    // Ignore if dispatch already active
    console.log('Agent dispatch request handled:', err instanceof Error ? err.message : err);
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
