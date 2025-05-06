import { NextResponse } from 'next/server';
import { SongQueueRequest } from '../../types/song-queue';

// Process API request
export async function POST(request: Request) {
  try {
    const requestData = await request.json() as SongQueueRequest;
    
    // Validate input
    if (!requestData.currentSong || !requestData.traits || !requestData.transitionLength) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Prepare backend request
    const backendRequest = {
      current_song_id: requestData.currentSong,
      traits: requestData.traits.map((trait) => ({
        name: trait.name,
        value: Math.max(0, Math.min(1, trait.value))
      })),
      transition_length: requestData.transitionLength
    };

    // Call backend API directly
    const queueResponse = await fetch(`${process.env.BACKEND_API_URL}/api/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      },
      body: JSON.stringify(backendRequest)
    });
    
    if (!queueResponse.ok) {
      throw new Error(`Failed to generate song queue: ${queueResponse.statusText}`);
    }
    
    const response = await queueResponse.json();
    
    // Transform and return response
    return NextResponse.json({
      queue: response.songs.map((song: any) => ({
        songID: song.id,
        vibeScore: song.vibeScore,
        previewURL: song.preview_url,
        title: song.title || 'Unknown Title',
        artist: song.artist || 'Unknown Artist',
        similarity: song.similarity || 0
      }))
    });
    
  } catch (error) {
    console.error('Error generating song queue:', error);
    return NextResponse.json(
      { error: 'Failed to generate song queue' },
      { status: 500 }
    );
  }
} 