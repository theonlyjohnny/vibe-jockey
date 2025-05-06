import { NextResponse } from 'next/server';
import { SongQueueRequest } from '../../types/song-queue';
import { inngest } from '@/lib/inngest';

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

    // Send the event to Inngest
    await inngest.send({
      name: 'app/song-queue.requested',
      data: requestData
    });
    
    // Return immediately with an acknowledgment
    return NextResponse.json({ 
      message: 'Queue generation started',
      jobId: `${requestData.currentSong}-${Date.now()}`
    });
    
  } catch (error) {
    console.error('Error initiating song queue generation:', error);
    return NextResponse.json(
      { error: 'Failed to initiate song queue generation' },
      { status: 500 }
    );
  }
} 