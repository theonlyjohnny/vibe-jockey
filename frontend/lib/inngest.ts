import { Inngest } from 'inngest';
import { createServerClient } from '@supabase/ssr';

// Create a client
export const inngest = new Inngest({ 
  id: 'vibe-jockey',
  name: 'Vibe Jockey' 
});

// Define your function
export const generateSongQueue = inngest.createFunction(
  { id: 'generate-song-queue' },
  { event: 'app/song-queue.requested' },
  async ({ event, step }) => {
    // Fetch data from the backend
    const response = await step.run('fetch-song-queue', async () => {
      const backendRequest = {
        current_song_id: event.data.currentSong,
        traits: event.data.traits.map((trait: { name: string; value: number }) => ({
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

// Define a function to process user's Spotify tracks
export const processUserTracks = inngest.createFunction(
  { id: 'process-user-tracks' },
  { event: 'app/user.tracks.process' },
  async ({ event, step }) => {
    console.log("⚡ Starting to process tracks for user", event.data.userId);
    try {
      const { userId, providerToken } = event.data;
      
      console.log("🔍 Processing tracks step started");
      // Create a Supabase client for database operations
      // We're not using cookies here since this runs in a background function
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return []; },
            setAll() { /* no-op */ }
          }
        }
      );
      
      // Helper function to sanitize text for ID creation
      function sanitizeForId(text: string): string {
        return text
          .toLowerCase()
          .replace(/[^\w\s]/g, '') // Remove special characters
          .replace(/\s+/g, '_')    // Replace whitespace with underscore
          .trim();
      }
      
      // 1. Fetch the user's liked songs from Spotify - in batches to avoid large data payloads
      let hasMoreTracks = true;
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';
      let batchNumber = 0;
      let totalProcessed = 0;
      
      while (hasMoreTracks) {
        batchNumber++;
        console.log(`🔍 Fetching Spotify tracks - batch ${batchNumber}, URL: ${nextUrl}`);
        
        // Fetch one batch of tracks
        const batchResult = await step.run(`fetch-spotify-tracks-batch-${batchNumber}`, async () => {
          const response: Response = await fetch(nextUrl!, {
            headers: {
              'Authorization': `Bearer ${providerToken}`,
            },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error fetching liked songs: ${response.status} - ${errorText}`);
          }
          
          const data: { items: any[], next: string | null } = await response.json();
          // Return only essential data we need for processing
          return {
            tracks: data.items.map(item => ({
              id: item.track.id,
              name: item.track.name || 'Unknown Track',
              artists: item.track.artists ? item.track.artists.map((a: any) => a.name) : ['Unknown Artist'],
              preview_url: item.track.preview_url
            })),
            nextUrl: data.next
          };
        });
        
        // Process this batch immediately
        await step.run(`process-tracks-batch-${batchNumber}`, async () => {
          const tracks = batchResult.tracks;
          const batchSize = 20; // Sub-batch size for database operations
          let inserted = 0;
          let errors = 0;
          
          for (let i = 0; i < tracks.length; i += batchSize) {
            const subBatch = tracks.slice(i, i + batchSize);
            const records = subBatch.map((track: any) => {
              const artist = track.artists[0] || 'Unknown Artist';
              const title = track.name;
              
              // Create a sanitized ID
              const sanitizedArtist = sanitizeForId(artist);
              const sanitizedTitle = sanitizeForId(title);
              const id = `${sanitizedArtist}_${sanitizedTitle}`;
              
              return {
                id,
                title,
                artist,
                user_id: userId,
                preview_url: track.preview_url
              };
            });
            
            // Insert records into the database
            const { error } = await supabase
              .from('song_embeddings')
              .upsert(records, { onConflict: 'id' });
            
            if (error) {
              errors++;
              console.error('Error inserting batch:', error);
            } else {
              inserted += records.length;
            }
            
            // Brief pause to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          totalProcessed += inserted;
          console.log(`✅ Processed batch ${batchNumber}: ${inserted} tracks inserted, ${errors} errors`);
          return { inserted, errors };
        });
        
        // Check if we need to continue to the next batch
        nextUrl = batchResult.nextUrl;
        hasMoreTracks = !!nextUrl;
      }
      
      console.log(`🎉 Completed processing all Spotify tracks. Total processed: ${totalProcessed}`);
      
      // 3. Trigger backend processing
      return await step.run('trigger-backend', async () => {
        const apiUrl = process.env.BACKEND_API_URL || '';
        const apiKey = process.env.BACKEND_API_KEY || '';
        
        const response = await fetch(`${apiUrl}/process-user-tracks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ user_id: userId }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Backend processing failed: ${response.status} - ${errorText}`);
        }
        
        return await response.json();
      });
    } catch (error) {
      console.error('Error processing user tracks:', error);
      throw error;
    }
  }
);