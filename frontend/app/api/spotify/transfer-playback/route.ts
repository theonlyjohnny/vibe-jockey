import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';

export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.provider_token) {
      return NextResponse.json({ error: 'No Spotify access token available' }, { status: 401 });
    }

    const { device_id } = await req.json();

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.provider_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_ids: [device_id],
        play: false
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to transfer playback' }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in transfer-playback API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 