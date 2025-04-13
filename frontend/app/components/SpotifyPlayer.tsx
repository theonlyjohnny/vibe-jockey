'use client';

import { useEffect, useState } from 'react';

interface SpotifyPlayerProps {
  accessToken?: string;
}

export default function SpotifyPlayer({ accessToken }: SpotifyPlayerProps) {
  console.log('SpotifyPlayer rendering, accessToken:', accessToken ? 'present' : 'missing');
  
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<Spotify.Track | null>(null);
  const [volume, setVolume] = useState(50);
  const [isInitializing, setIsInitializing] = useState(true);
  const [deviceId, setDeviceId] = useState<string>('');
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user has premium
  useEffect(() => {
    if (!accessToken) return;

    const checkPremium = async () => {
      try {
        const response = await fetch('https://api.spotify.com/v1/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        const data = await response.json();
        setIsPremium(data.product === 'premium');
      } catch (error) {
        console.error('Error checking premium status:', error);
        setError('Failed to check Spotify subscription status');
      }
    };

    checkPremium();
  }, [accessToken]);

  // Initialize premium player
  useEffect(() => {
    if (!accessToken || !isPremium) return;

    let spotifyPlayer: Spotify.Player | null = null;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
    console.log('Spotify SDK script added to page');

    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log('Spotify SDK ready');
      spotifyPlayer = new window.Spotify.Player({
        name: 'Semantic DJ Web Player',
        getOAuthToken: cb => { cb(accessToken); },
        volume: volume / 100
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Player ready with Device ID:', device_id);
        setDeviceId(device_id);
        setIsReady(true);
        setIsInitializing(false);
      });

      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('Player not ready, Device ID:', device_id);
        setIsReady(false);
      });

      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) {
          console.log('No player state available');
          return;
        }
        
        console.log('Player state changed:', state);
        setCurrentTrack(state.track_window.current_track);
        setIsPaused(state.paused);
      });

      spotifyPlayer.connect().then(success => {
        if (success) {
          setPlayer(spotifyPlayer);
        }
      });
    };

    return () => {
      if (spotifyPlayer) {
        console.log('Disconnecting player');
        spotifyPlayer.disconnect();
      }
    };
  }, [accessToken, isPremium]);

  // For non-premium users: Get current playback state
  useEffect(() => {
    if (!accessToken || isPremium) return;

    const getCurrentPlayback = async () => {
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (response.status === 200) {
          const data = await response.json();
          if (data?.item) {
            setCurrentTrack({
              name: data.item.name,
              artists: data.item.artists,
              album: data.item.album,
            });
            setIsPaused(!data.is_playing);
          }
        }
      } catch (error) {
        console.error('Error getting playback state:', error);
      }
    };

    // Poll for updates every 5 seconds
    getCurrentPlayback();
    const interval = setInterval(getCurrentPlayback, 5000);

    return () => clearInterval(interval);
  }, [accessToken, isPremium]);

  // Handle volume change
  useEffect(() => {
    if (player && isReady) {
      player.setVolume(volume / 100);
    }
  }, [volume, player, isReady]);

  const transferPlayback = async () => {
    if (!deviceId || !accessToken) return;
    
    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: true,
        }),
      });
    } catch (error) {
      console.error('Error transferring playback:', error);
    }
  };

  const handlePlayPause = async () => {
    if (!player || !isReady) return;
    
    try {
      if (isPaused) {
        // If paused, first try to transfer playback to this device
        await transferPlayback();
      }
      await player.togglePlay();
    } catch (error) {
      console.error('Error toggling play state:', error);
    }
  };

  const handlePrevious = async () => {
    if (!player || !isReady) return;
    try {
      if (isPaused) {
        await transferPlayback();
      }
      await player.previousTrack();
    } catch (error) {
      console.error('Error playing previous track:', error);
    }
  };

  const handleNext = async () => {
    if (!player || !isReady) return;
    try {
      if (isPaused) {
        await transferPlayback();
      }
      await player.nextTrack();
    } catch (error) {
      console.error('Error playing next track:', error);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    if (player && isReady) {
      try {
        await player.setVolume(newVolume / 100);
      } catch (error) {
        console.error('Error setting volume:', error);
      }
    }
  };

  if (!accessToken) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full">
        <p className="text-black dark:text-white text-center">Please log in to use the player</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full">
        <p className="text-red-500 text-center">{error}</p>
      </div>
    );
  }

  if (isPremium === null) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full">
        <p className="text-black dark:text-white text-center">Loading Spotify player...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full">
      <div className="flex flex-col items-center gap-4">
        {currentTrack ? (
          <>
            <img 
              src={currentTrack.album.images[0]?.url} 
              alt={currentTrack.album.name}
              className="w-48 h-48 rounded-lg shadow-lg"
            />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {currentTrack.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {currentTrack.artists.map(artist => artist.name).join(', ')}
              </p>
            </div>
            
            {isPremium ? (
              // Premium controls
              <>
                {/* Playback Controls */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePrevious}
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    aria-label="Previous track"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black dark:text-white">
                      <polygon points="19 20 9 12 19 4 19 20"></polygon>
                      <line x1="5" y1="19" x2="5" y2="5"></line>
                    </svg>
                  </button>
                  
                  <button
                    onClick={handlePlayPause}
                    className="p-3 rounded-full bg-green-500 hover:bg-green-600 transition"
                    aria-label={isPaused ? "Play" : "Pause"}
                  >
                    {isPaused ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                      </svg>
                    )}
                  </button>
                  
                  <button
                    onClick={handleNext}
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    aria-label="Next track"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black dark:text-white">
                      <polygon points="5 4 15 12 5 20 5 4"></polygon>
                      <line x1="19" y1="5" x2="19" y2="19"></line>
                    </svg>
                  </button>
                </div>
                
                {/* Volume Control */}
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black dark:text-white">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    aria-label="Volume control"
                  />
                </div>
              </>
            ) : (
              // Non-premium user message
              <div className="text-center p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Control playback from your Spotify app
                </p>
                <a 
                  href="https://www.spotify.com/premium/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-500 hover:text-green-600 text-sm mt-2 block"
                >
                  Upgrade to Premium for web playback control
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-black dark:text-white text-center">
            {isPremium ? (isReady ? 'Ready to play' : 'Connecting to Spotify...') : 'Start playing on any device to see track info'}
          </p>
        )}
      </div>
    </div>
  );
} 