'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '../utils/supabase/client';
import Link from 'next/link';
import AuthButton from './AuthButton';
import { Trait, QueueSong } from '../types/song-queue';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

// Add a new utility function to check and refresh token if needed
async function getValidToken() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  console.log('Client-side session check:', {
    hasUser: !!session?.user,
    hasToken: !!session?.provider_token
  });
  
  if (!session?.provider_token) {
    // Try to refresh the session to get a fresh token
    console.log('Token missing, attempting refresh');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !refreshData.session?.provider_token) {
      console.error("Failed to refresh token:", refreshError);
      return null;
    }
    
    console.log('Token refresh successful');
    return refreshData.session.provider_token;
  }
  
  return session.provider_token;
}

async function transferPlayback(deviceId: string, accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play: true
    })
  });

  if (!response.ok) {
    throw new Error('Failed to transfer playback');
  }
}

interface SpotifyArtist {
  name: string;
  uri: string;
}

interface SpotifyTrack {
  name: string;
  uri: string;
  duration_ms: number;
  album: {
    images: { url: string }[];
  };
  artists: SpotifyArtist[];
}

interface QueueState {
  previousTracks: SpotifyTrack[];
  currentTrack: SpotifyTrack | null;
  nextTracks: SpotifyTrack[];
}

export default function SpotifyPlayer() {
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueState, setQueueState] = useState<QueueState>({
    previousTracks: [],
    currentTrack: null,
    nextTracks: []
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | null>(null);
  const [volume, setVolume] = useState(50);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traits, setTraits] = useState<Trait[]>([
    { name: 'energy', value: 60 },
    { name: 'mood', value: 50 },
    { name: 'tempo', value: 70 }
  ]);
  const [transitionLength, setTransitionLength] = useState(3);
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);
  const playerRef = useRef<any>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  // Toggle play/pause state and ensure playback is on the correct device
  const togglePlay = useCallback(async () => {
    if (!player || !deviceId) return;
    
    const token = await getValidToken();
    
    if (!token) {
      setError('No Spotify access token found. Please sign in with Spotify.');
      return;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 204 || 
          (response.ok && (await response.json()).device?.id !== deviceId)) {
        await transferPlayback(deviceId, token);
      }
      
      await player.togglePlay();
    } catch (error) {
      console.error('Error toggling playback:', error);
      setError('Failed to toggle playback. Please try again.');
    }
  }, [player, deviceId]);

  // Space key handler to toggle play/pause
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore space key if focus is in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.code === 'Space' && player) {
        event.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [player, togglePlay]);

  // Initialize the Spotify Web Playback SDK
  useEffect(() => {
    const initializePlayer = async () => {
      try {
        const token = await getValidToken();
        
        if (!token) {
          setError('No Spotify access token found. Please sign in with Spotify.');
          setIsLoading(false);
          return;
        }

        // Load the Spotify Web Playback SDK if not already loaded
        if (!window.Spotify) {
          scriptRef.current = document.createElement("script");
          scriptRef.current.src = "https://sdk.scdn.co/spotify-player.js";
          scriptRef.current.async = true;
          document.body.appendChild(scriptRef.current);

          // Wait for SDK to load
          await new Promise<void>((resolve) => {
            window.onSpotifyWebPlaybackSDKReady = resolve;
          });
        }

        // Initialize the Spotify player
        const player = new window.Spotify.Player({
          name: 'Vibe Jockey Player',
          getOAuthToken: async (cb: (token: string) => void) => {
            const validToken = await getValidToken();
            if (validToken) {
              cb(validToken);
            } else {
              setError('Spotify session expired. Please sign in again.');
            }
          },
          volume: 0.5
        });

        playerRef.current = player;

        // Set up event listeners for player state changes
        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          console.log('Ready with Device ID', device_id);
          setDeviceId(device_id);
          setIsLoading(false);
        });

        player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          console.log('Device ID has gone offline', device_id);
          setError('Player is not ready');
          setIsLoading(false);
        });

        player.addListener('initialization_error', ({ message }: { message: string }) => {
          console.error('Failed to initialize', message);
          setError('Failed to initialize player');
          setIsLoading(false);
        });

        player.addListener('authentication_error', async ({ message }: { message: string }) => {
          console.error('Failed to authenticate', message);
          const token = await getValidToken();
          if (!token) {
            setError('Failed to authenticate with Spotify. Please sign in again.');
            setIsLoading(false);
          }
        });

        player.addListener('account_error', ({ message }: { message: string }) => {
          console.error('Failed to validate Spotify account', message);
          setError('Failed to validate Spotify account');
          setIsLoading(false);
        });

        // Track state changes and update the UI
        player.addListener('player_state_changed', async (state: any) => {
          if (!state) return;
          
          console.log('Track Window:', {
            current: state.track_window.current_track,
            previous: state.track_window.previous_tracks,
            next: state.track_window.next_tracks
          });
          
          // Update the queue state with current, previous, and next tracks
          setQueueState(prevState => ({
            previousTracks: [...state.track_window.previous_tracks].reverse().slice(0, 5),
            currentTrack: state.track_window.current_track,
            nextTracks: [...state.track_window.next_tracks].slice(0, 5)
          }));
          
          // Fetch additional tracks from queue API for a fuller display
          const token = await getValidToken();
          if (token) {
            try {
              const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (response.ok) {
                const queueData = await response.json();
                if (queueData.queue && queueData.queue.length > 0) {
                  // Get any tracks from the API that aren't already in our next tracks
                  // This assumes the first 2 tracks in queueData match what's in state.track_window.next_tracks
                  const additionalTracks = queueData.queue.slice(state.track_window.next_tracks.length);
                  
                  if (additionalTracks.length > 0) {
                    setQueueState(prevState => ({
                      ...prevState,
                      nextTracks: [...prevState.nextTracks, ...additionalTracks].slice(0, 5)
                    }));
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching queue:', error);
            }
          }
          
          // Update play state
          setIsPlaying(!state.paused);
        });

        // Connect to Spotify and fetch initial queue
        await player.connect();
        setPlayer(player);

        if (token) {
          try {
            const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (response.ok) {
              const queueData = await response.json();
              if (queueData.queue && queueData.queue.length > 0) {
                // We'll update this once we get the player state with the current track
                setQueueState(prevState => ({
                  ...prevState,
                  nextTracks: [...queueData.queue]
                }));
              }
            }
          } catch (error) {
            console.error('Error fetching initial queue:', error);
          }
        }
      } catch (err) {
        console.error('Error initializing player:', err);
        setError('Failed to initialize player');
        setIsLoading(false);
      }
    };

    initializePlayer();

    // Cleanup function to disconnect player and remove SDK script
    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
      if (scriptRef.current) {
        document.body.removeChild(scriptRef.current);
      }
    };
  }, []);

  // Skip to the next track and update the queue display
  const nextTrack = async () => {
    if (!player || isAnimating) return;
    setIsAnimating(true);
    setAnimationDirection('left');
    
    // Update queue state before skipping
    setQueueState(prevState => {
      if (!prevState.currentTrack || prevState.nextTracks.length === 0) return prevState;
      
      return {
        previousTracks: [prevState.currentTrack, ...prevState.previousTracks].slice(0, 5),
        currentTrack: prevState.nextTracks[0],
        nextTracks: prevState.nextTracks.slice(1)
      };
    });
    
    await player.nextTrack();
    
    // Fetch the latest track in the queue to update the display
    const token = await getValidToken();
    if (token) {
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const queueData = await response.json();
          if (queueData.queue && queueData.queue.length > 0) {
            setQueueState(prevState => {
              // Calculate how many tracks we need to add
              // This assumes queueData.queue includes all tracks including those we already have
              const existingNextTracksCount = prevState.nextTracks.length;
              const additionalTracks = queueData.queue.slice(existingNextTracksCount);
              
              return {
                ...prevState,
                nextTracks: [...prevState.nextTracks, ...additionalTracks]
              };
            });
          }
        }
      } catch (error) {
        console.error('Error fetching queue:', error);
      }
    }
    
    setTimeout(() => {
      setIsAnimating(false);
      setAnimationDirection(null);
    }, 500);
  };

  // Go back to the previous track and update the queue display
  const previousTrack = async () => {
    if (!player || isAnimating || !queueState.previousTracks.length) return;
    setIsAnimating(true);
    setAnimationDirection('right');
    
    // Update queue state before going back
    setQueueState(prevState => {
      if (!prevState.currentTrack || prevState.previousTracks.length === 0) return prevState;
      
      return {
        previousTracks: prevState.previousTracks.slice(1),
        currentTrack: prevState.previousTracks[0],
        nextTracks: [prevState.currentTrack, ...prevState.nextTracks].slice(0, 5)
      };
    });
    
    await player.previousTrack();
    
    setTimeout(() => {
      setIsAnimating(false);
      setAnimationDirection(null);
    }, 500);
  };

  // Set the player volume and update local volume state
  const setPlayerVolume = async (value: number) => {
    if (!player) return;
    await player.setVolume(value / 100);
    setVolume(value);
  };

  // Handler for trait value change
  const handleTraitChange = (index: number, value: number) => {
    const updatedTraits = [...traits];
    updatedTraits[index].value = Math.max(1, Math.min(100, value));
    setTraits(updatedTraits);
  };

  // Function to generate queue
  const generateQueue = async () => {
    if (!queueState.currentTrack) {
      setError('No song is currently playing');
      return;
    }

    setIsGeneratingQueue(true);
    setError(null);
    
    try {
      // Clear the current queue state
      setQueueState(prevState => ({
        previousTracks: [],
        currentTrack: prevState.currentTrack,
        nextTracks: []
      }));

      // Get token for API calls
      const token = await getValidToken();
      if (!token) {
        throw new Error('No Spotify access token found');
      }

      // Clear the Spotify queue by starting a new playback with just the current track
      try {
        // Get the current track URI
        const currentTrackUri = queueState.currentTrack?.uri;
        if (!currentTrackUri) {
          throw new Error('No current track found');
        }

        console.log('Attempting to clear queue with track:', currentTrackUri);

        // First, try to get the current playback state
        const playbackStateResponse = await fetch('https://api.spotify.com/v1/me/player', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!playbackStateResponse.ok) {
          const errorData = await playbackStateResponse.json();
          console.error('Failed to get playback state:', errorData);
          throw new Error(`Failed to get playback state: ${playbackStateResponse.status}`);
        }

        const playbackState = await playbackStateResponse.json();
        console.log('Current playback state:', playbackState);

        // Ensure we're playing on the correct device
        if (deviceId && playbackState.device?.id !== deviceId) {
          console.log('Transferring playback to correct device');
          await transferPlayback(deviceId, token);
          // Wait for the transfer to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Pause playback first
        if (player) {
          console.log('Pausing playback');
          await player.pause();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // First, try to clear the queue by starting a new context
        console.log('Starting playback with single track');
        const playBody = {
          uris: [currentTrackUri]
        };
        console.log('Play request body:', playBody);

        const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(playBody)
        });

        if (!playResponse.ok) {
          const errorData = await playResponse.json();
          console.error('Failed to start playback:', {
            status: playResponse.status,
            statusText: playResponse.statusText,
            error: errorData
          });
          throw new Error(`Failed to start playback: ${playResponse.status} - ${JSON.stringify(errorData)}`);
        }

        console.log('Playback started successfully');

        // Wait for the new context to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Now try to clear the next in queue by seeking to the end of the track
        if (player) {
          console.log('Seeking to end of track to clear next in queue');
          const trackDuration = queueState.currentTrack?.duration_ms || 0;
          await player.seek(trackDuration - 1000); // Seek to 1 second before the end
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Verify the queue is cleared
        const queueResponse = await fetch('https://api.spotify.com/v1/me/player/queue', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          console.log('Queue after reset:', queueData);
          if (queueData.queue && queueData.queue.length > 0) {
            console.warn('Queue not fully cleared:', queueData.queue.length, 'tracks remaining');
          }
        }

        // Reset playback position to start of track
        if (player) {
          console.log('Resetting playback position');
          await player.seek(0);
        }
      } catch (error) {
        console.error('Error clearing queue:', error);
        throw new Error(`Failed to clear Spotify queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Convert trait values from 1-100 to 0.1-1.0 range
      const normalizedTraits = traits.map(trait => ({
        name: trait.name,
        value: 0.1 + (trait.value - 1) * (0.9 / 99) // Maps 1-100 to 0.1-1.0 precisely
      }));
      
      const response = await fetch('/api/song-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSong: queueState.currentTrack.uri.split(':').pop(),
          traits: normalizedTraits,
          transitionLength
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate queue');
      }

      const data = await response.json();
      
      // Search for each song and add it to the queue
      for (const song of data.queue) {
        try {
          // Search for the song using the title and artist
          const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(song.title || song.songID)}&type=track&limit=1`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.tracks.items.length > 0) {
              const trackUri = searchData.tracks.items[0].uri;
              await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              await new Promise(resolve => setTimeout(resolve, 100));
            } else {
              console.warn(`Could not find track for: ${song.title || song.songID}`);
            }
          }
        } catch (error) {
          console.error(`Error adding track to queue: ${song.title || song.songID}`, error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsGeneratingQueue(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="w-64 h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <p className="text-center text-red-500 mb-4">{error}</p>
        {error.includes('No Spotify access token') && (
          <AuthButton type="login" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="relative w-full max-w-7xl h-[calc(100vh-200px)] flex items-center justify-center overflow-hidden">
        <div className="w-full">
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3">
                {/* Previous Tracks (up to 2) */}
                {queueState.previousTracks.slice(0, 2).map((track, index) => (
                  track?.album?.images[0]?.url && (
                    <div key={`prev-${index}`} className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 flex-shrink-0">
                      <img
                        src={track.album.images[0].url}
                        alt={`Previous track ${index + 1}`}
                        className="w-full h-full rounded-lg object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/50 rounded-lg"></div>
                    </div>
                  )
                ))}

                {/* Current Track */}
                <button
                  onClick={togglePlay}
                  className="relative group w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 flex-shrink-0 hover:scale-105 focus:outline-none transition-transform duration-300"
                >
                  {queueState.currentTrack?.album?.images[0]?.url ? (
                    <>
                      <img
                        src={queueState.currentTrack.album.images[0].url}
                        alt={queueState.currentTrack.name || 'Album cover'}
                        className="w-full h-full rounded-lg shadow-xl object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 ease-in-out rounded-lg">
                        {isPlaying ? (
                          <svg className="w-16 h-16 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-16 h-16 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full rounded-lg shadow-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <svg className="w-16 h-16 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* Next Tracks (up to 4) */}
                <div className="flex items-center gap-3">
                  {queueState.nextTracks.slice(0, 4).map((track, index) => (
                    track?.album?.images[0]?.url && (
                      <div key={`next-${index}`} className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 flex-shrink-0">
                        <img
                          src={track.album.images[0].url}
                          alt={`Next track ${index + 1}`}
                          className="w-full h-full rounded-lg object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/50 rounded-lg"></div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl flex flex-col gap-6 px-8">
        {/* Queue Generation Controls */}
        <div className="flex flex-col gap-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold">Queue Generation</h3>
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block mb-2 font-medium">Transition Length</label>
              <input 
                type="number" 
                min="1" 
                max="5"
                value={transitionLength} 
                onChange={(e) => setTransitionLength(Number(e.target.value))}
                className="p-2 border rounded w-32 text-gray-800 dark:text-gray-200 dark:bg-gray-700"
              />
            </div>

            <button 
              onClick={generateQueue}
              disabled={isGeneratingQueue || !queueState.currentTrack}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              {isGeneratingQueue ? 'Generating...' : 'Generate Queue'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {traits.map((trait, index) => (
              <div key={trait.name} className="flex flex-col gap-2">
                <label className="font-medium">{trait.name}</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" 
                    min="1" 
                    max="100"
                    value={trait.value} 
                    onChange={(e) => handleTraitChange(index, Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{trait.value}</span>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-2 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
              {error}
            </div>
          )}
        </div>

        {/* Queue Visualization */}
        {queueState.nextTracks.length > 0 && (
          <div className="flex flex-col gap-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="text-lg font-semibold">Queue Progression</h3>
            
            <div className="flex items-center gap-4 overflow-x-auto pb-4">
              {/* Previous Tracks */}
              {queueState.previousTracks.map((track, index) => (
                <div key={`prev-${index}`} className="flex-shrink-0 w-48">
                  <div className="relative">
                    <img
                      src={track.album.images[0]?.url}
                      alt={track.name}
                      className="w-full h-48 object-cover rounded-lg opacity-50"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg">
                      <div className="absolute bottom-2 left-2 right-2 text-white text-sm">
                        <p className="font-medium truncate">{track.name}</p>
                        <p className="text-xs opacity-80 truncate">
                          {track.artists.map(artist => artist.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Current Track */}
              {queueState.currentTrack && (
                <div className="flex-shrink-0 w-48">
                  <div className="relative">
                    <img
                      src={queueState.currentTrack.album.images[0]?.url}
                      alt={queueState.currentTrack.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg">
                      <div className="absolute bottom-2 left-2 right-2 text-white text-sm">
                        <p className="font-medium truncate">{queueState.currentTrack.name}</p>
                        <p className="text-xs opacity-80 truncate">
                          {queueState.currentTrack.artists.map(artist => artist.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Next Tracks */}
              {queueState.nextTracks.map((track, index) => (
                <div key={`next-${index}`} className="flex-shrink-0 w-48">
                  <div className="relative">
                    <img
                      src={track.album.images[0]?.url}
                      alt={track.name}
                      className="w-full h-48 object-cover rounded-lg opacity-50"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg">
                      <div className="absolute bottom-2 left-2 right-2 text-white text-sm">
                        <p className="font-medium truncate">{track.name}</p>
                        <p className="text-xs opacity-80 truncate">
                          {track.artists.map(artist => artist.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Queue List */}
            <div className="mt-4">
              <h4 className="text-md font-medium mb-2">Upcoming Tracks</h4>
              <div className="space-y-2">
                {queueState.nextTracks.map((track, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded">
                    <img
                      src={track.album.images[0]?.url}
                      alt={track.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                        {track.artists.map(artist => artist.name).join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <button
                onClick={previousTrack}
                className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 focus:outline-none"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextTrack}
                className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 focus:outline-none"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {queueState.currentTrack && (
              <div className="text-sm">
                <p className="font-medium text-gray-800 dark:text-gray-200">{queueState.currentTrack.name}</p>
                <p className="text-gray-600 dark:text-gray-400">{queueState.currentTrack.artists?.map((artist: SpotifyArtist) => artist.name).join(', ')}</p>
              </div>
            )}
          </div>

          <div className="w-64">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setPlayerVolume(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 transition-all duration-300 ease-in-out"
            />
          </div>
        </div>
      </div>
    </div>
  );
} 