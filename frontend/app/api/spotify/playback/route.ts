import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';

export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Error getting session:', sessionError);
      return NextResponse.json({ 
        error: 'Failed to get session' 
      }, { status: 401 });
    }

    // If no session or no provider token, try to refresh
    if (!session?.provider_token) {
      console.log('No provider token found, attempting refresh...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({ 
          error: 'Session expired. Please sign in again.' 
        }, { status: 401 });
      }

      if (!refreshData.session?.provider_token) {
        console.error('No provider token after refresh');
        return NextResponse.json({ 
          error: 'No Spotify access token available. Please sign in again.' 
        }, { status: 401 });
      }
      
      session = refreshData.session;
      console.log('Session refreshed successfully');
    }

    const { action } = await req.json(); // 'play' or 'pause'

    if (!action || !['play', 'pause'].includes(action)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be either "play" or "pause".' 
      }, { status: 400 });
    }

    // Check user's subscription status
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${session.provider_token}`
      }
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json().catch(() => ({}));
      console.error('Failed to fetch user data:', errorData);
      return NextResponse.json({ 
        error: 'Failed to verify Spotify account status' 
      }, { status: userResponse.status });
    }

    const userData = await userResponse.json();
    if (userData.product !== 'premium') {
      return NextResponse.json({ 
        error: 'Spotify Premium is required to control playback. Please upgrade your account.' 
      }, { status: 403 });
    }

    // Get available devices first
    const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: {
        'Authorization': `Bearer ${session.provider_token}`
      }
    });

    if (!devicesResponse.ok) {
      const errorData = await devicesResponse.json().catch(() => ({}));
      console.error('Failed to fetch devices:', errorData);
      return NextResponse.json({ 
        error: 'Failed to fetch available devices' 
      }, { status: devicesResponse.status });
    }

    const { devices } = await devicesResponse.json();
    if (!devices.length) {
      return NextResponse.json({ 
        error: 'No Spotify devices found. Please open Spotify on your device first.' 
      }, { status: 400 });
    }

    // Find an active device or use the first available one
    let targetDevice = devices.find((device: any) => device.is_active) || devices[0];
    console.log('Target device:', targetDevice.name, targetDevice.id);

    // Check if the device supports remote control
    if (!targetDevice.supports_remote_control) {
      return NextResponse.json({ 
        error: 'This device does not support remote control. Please use a different device.' 
      }, { status: 400 });
    }

    // Check current playback state
    const playbackResponse = await fetch('https://api.spotify.com/v1/me/player', {
      headers: {
        'Authorization': `Bearer ${session.provider_token}`
      }
    });

    let isPlaying = false;
    if (playbackResponse.ok) {
      const playbackData = await playbackResponse.json();
      isPlaying = playbackData.is_playing;
    }

    // If we're trying to pause but nothing is playing, or play but something is already playing,
    // we don't need to do anything
    if ((action === 'pause' && !isPlaying) || (action === 'play' && isPlaying)) {
      return NextResponse.json({ success: true });
    }

    // First, ensure the device is active
    const transferResponse = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.provider_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_ids: [targetDevice.id],
        play: false
      })
    });

    if (!transferResponse.ok) {
      console.error('Failed to transfer playback to device');
      return NextResponse.json({ 
        error: 'Failed to initialize Spotify device. Please make sure Spotify is open and ready.' 
      }, { status: 400 });
    }

    // Wait a moment for the transfer to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!session.provider_token) {
      return NextResponse.json({ 
        error: 'No valid Spotify token available' 
      }, { status: 401 });
    }

    console.log('Attempting playback control with token:', session.provider_token.substring(0, 10) + '...');
    
    const response = await fetch(`https://api.spotify.com/v1/me/player/${action}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.provider_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_id: targetDevice.id
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Spotify API error:', errorData);
      
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ 
          error: 'Session expired. Please sign in again.' 
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: `Failed to ${action} playback: ${errorData.error?.message || response.statusText}` 
      }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in playback API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 