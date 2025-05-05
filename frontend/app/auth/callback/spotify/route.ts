import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    // genres are not available at this level in the API
  };
  preview_url: string | null;
}

interface SavedTrack {
  track: SpotifyTrack;
}

// Function to sanitize text for ID creation
function sanitizeForId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_')    // Replace whitespace with underscore
    .trim();
}

// Function to fetch all liked songs from Spotify
async function fetchUserLikedSongs(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let nextUrl: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';
  
  while (nextUrl) {
    const response: Response = await fetch(nextUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error fetching liked songs: ${response.status} - ${errorText}`);
    }
    
    const data: {
      items: SavedTrack[];
      next: string | null;
    } = await response.json();
    const items: SavedTrack[] = data.items || [];
    
    // Add tracks to our collection
    tracks.push(...items.map(item => item.track));
    
    // Check if there are more tracks to fetch
    nextUrl = data.next;
  }
  
  return tracks;
}

// Function to create song embedding records in the database
async function createSongEmbeddingRecords(
  tracks: SpotifyTrack[],
  userId: string,
  supabase: any
): Promise<{ inserted: number, errors: any[] }> {
  const errors = [];
  let inserted = 0;
  
  // Process tracks in batches of 20 to avoid hitting rate limits
  const batchSize = 20;
  
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    const records = batch.map(track => {
      const artist = track.artists[0]?.name || 'Unknown Artist';
      const title = track.name || 'Unknown Track';
      
      // Create a sanitized ID
      const sanitizedArtist = sanitizeForId(artist);
      const sanitizedTitle = sanitizeForId(title);
      const id = `${sanitizedArtist}_${sanitizedTitle}`;
      
      return {
        id,
        title,
        artist,
        user_id: userId,
      };
    });
    
    // Insert records into the database
    const { data, error } = await supabase
      .from('song_embeddings')
      .upsert(records, { onConflict: 'id' });
    
    if (error) {
      errors.push(error);
      console.error('Error inserting batch:', error);
    } else {
      inserted += records.length;
      console.log(`Inserted ${records.length} records`);
    }
    
    // Brief pause to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return { inserted, errors };
}

// Server-side implementation for backend client
async function processUserTracks(userId: string, providerToken: string, supabase: any) {
  try {
    console.log("Fetching user's liked songs from Spotify...");
    const tracks = await fetchUserLikedSongs(providerToken);
    console.log(`Fetched ${tracks.length} liked songs`);
    
    console.log("Creating song embedding records in the database...");
    const { inserted, errors } = await createSongEmbeddingRecords(tracks, userId, supabase);
    console.log(`Database records: inserted ${inserted} records with ${errors.length} errors`);
    
    // Only call the backend API if we successfully inserted records
    if (inserted > 0) {
      console.log("Triggering backend processing for the inserted tracks...");
      const apiUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
      const apiKey = process.env.BACKEND_API_KEY || '';
      
      const response = await fetch(`${apiUrl}/process-user-tracks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ user_id: userId }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      
      return await response.json();
    } else {
      return { status: "error", message: "No tracks were inserted, skipping backend processing" };
    }
  } catch (error) {
    console.error('Error processing user tracks:', error);
    throw error;
  }
}

// Function to trigger background processing
function triggerBackgroundProcessing(userId: string, providerToken: string, supabaseUrl: string, supabaseKey: string) {
  // Create a lightweight supabase client for the background process
  const backgroundSupabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() { return []; },
        setAll() { /* no-op */ }
      }
    }
  );
  
  // We're deliberately not awaiting this Promise so it runs in background
  (async () => {
    try {
      console.log(`[Background] Starting track processing for user ${userId}`);
      await processUserTracks(userId, providerToken, backgroundSupabase);
      console.log(`[Background] Completed track processing for user ${userId}`);
    } catch (error) {
      console.error(`[Background] Error processing tracks for user ${userId}:`, error);
    }
  })();
  
  return { status: "processing_started" };
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/';

  console.log(`Processing Spotify auth callback with code: ${code ? 'present' : 'missing'}`);

  // Create a response early so we can set cookies on it
  const response = NextResponse.redirect(new URL(next, origin));
  
  if (code) {
    // Create a Supabase client using the newer @supabase/ssr package
    const cookieStore = cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
                response.cookies.set({
                  name,
                  value,
                  ...options,
                });
              });
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing user sessions.
            }
          }
        }
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("Error exchanging code for session:", error);
      // Redirect to an error page
      return NextResponse.redirect(new URL('/auth-error', origin));
    }
    
    console.log("Session exchange successful, retrieving session to verify token");
    
    // Verify provider token is present
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error("Session is missing after authentication");
      return NextResponse.redirect(new URL('/auth-error?reason=missing_session', origin));
    }
    
    if (!session.provider_token) {
      console.error("Provider token missing after authentication");
      // Try to extract debug information about the session
      console.log("Session debug info:", {
        hasUser: !!session.user,
        hasAccess: !!session.access_token,
        hasRefresh: !!session.refresh_token,
        provider: session.user?.app_metadata?.provider,
        scopes: session.user?.app_metadata?.scopes
      });
      
      // Redirect to an error page that specifically mentions token issues
      return NextResponse.redirect(new URL('/auth-error?reason=missing_token', origin));
    }
    
    console.log("Authentication successful with provider token");
    
    // Check if this is a new sign-up by querying metadata from Supabase
    try {
      // Query user metadata to check if first login
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error("Error getting user data:", authError);
      } else if (authData?.user) {
        const user = authData.user;
        const createdAt = new Date(user.created_at);
        const now = new Date();
        
        // If the user was created within the last minute, consider it a new sign-up
        const isNewUser = (now.getTime() - createdAt.getTime()) < 60000 || process.env.NODE_ENV === 'development' || true; // FOr now, always index on login
        
        if (isNewUser) {
          console.log("New user detected, triggering background track processing");
          
          // Trigger background processing without blocking the response
          triggerBackgroundProcessing(
            user.id,
            session.provider_token,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          );
        } else {
          console.log("Returning user, skipping track processing");
        }
      }
    } catch (error) {
      console.error("Error checking user status:", error);
    }
  }

  // Return the response immediately without waiting for track processing
  return response;
} 