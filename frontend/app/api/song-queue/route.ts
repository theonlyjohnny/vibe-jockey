import { NextResponse } from 'next/server';
import { SongQueueRequest, SongQueueResponse } from '../../types/song-queue';

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

    // Transform the request to match the backend API format
    const backendRequest = {
      current_song_id: requestData.currentSong,
      traits: requestData.traits.map(trait => ({
        name: trait.name,
        value: Math.max(0, Math.min(1, trait.value)) // Ensure value is in 0-1 range (should already be 0.1-1.0)
      })),
      transition_length: requestData.transitionLength
    };

    // Forward the request to the Python backend
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
    
    const queueData = await queueResponse.json();
    
    // Log the structure of the response for debugging
    // console.log('Backend response structure:', JSON.stringify(queueData, null, 2));
    
    // Transform the response to match the frontend expected format
    const response: SongQueueResponse = { 
      queue: queueData.songs.map((song: any) => {
        // Check for different possible field names due to snake_case vs camelCase
        const vibeScore = song.vibeScore;
        
        return {
          songID: song.id,
          vibeScore: vibeScore,
          title: song.title || 'Unknown Title',
          artist: song.artist || 'Unknown Artist',
          similarity: song.similarity || 0
        };
      })
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error generating song queue:', error);
    return NextResponse.json(
      { error: 'Failed to generate song queue' },
      { status: 500 }
    );
  }
} 