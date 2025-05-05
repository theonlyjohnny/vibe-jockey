import { Inngest } from 'inngest';
import { serve } from 'inngest/next';

// Create a client
export const inngest = new Inngest({ name: 'Semantic DJ' });

// Define your function
export const generateSongQueue = inngest.createFunction(
  { id: 'generate-song-queue' },
  { event: 'app/song-queue.requested' },
  async ({ event, step }) => {
    // Fetch data from the backend
    const response = await step.run('fetch-song-queue', async () => {
      const backendRequest = {
        current_song_id: event.data.currentSong,
        traits: event.data.traits.map(trait => ({
          name: trait.name,
          value: Math.max(0, Math.min(1, trait.value))
        })),
        transition_length: event.data.transitionLength
      };

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
      
      return await queueResponse.json();
    });

    // Return transformed response
    return {
      queue: response.songs.map((song: any) => ({
        songID: song.id,
        vibeScore: song.vibeScore,
        previewURL: song.preview_url,
        title: song.title || 'Unknown Title',
        artist: song.artist || 'Unknown Artist',
        similarity: song.similarity || 0
      }))
    };
  }
);

// Create a server
export const GET = serve({
  client: inngest,
  functions: [generateSongQueue],
});

export const POST = GET;