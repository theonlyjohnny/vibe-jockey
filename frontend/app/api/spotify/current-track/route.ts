import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.provider_token) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${session.provider_token}`
      }
    });

    // Handle 204 No Content response
    if (response.status === 204) {
      return NextResponse.json({ 
        is_playing: false,
        item: null 
      });
    }

    if (!response.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch current track' 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in current-track API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 