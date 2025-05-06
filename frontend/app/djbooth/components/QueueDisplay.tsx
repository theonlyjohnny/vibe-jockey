'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../utils/supabase/client';
import AuthButton from '../../components/AuthButton';
import { Song } from '../../types/song-queue';

interface QueueDisplayProps {
  queue: Song[];
  transitionLength: number;
  onCurrentTrackChange?: (trackId: string) => void;
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  album: {
    images: { url: string }[];
  };
  artists: { name: string }[];
}

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

function FadingPopup({ message, duration = 3000 }: { message: string; duration?: number }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-out">
      <div className="bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
        {message}
      </div>
    </div>
  );
}

export default function QueueDisplay({ queue, transitionLength, onCurrentTrackChange }: QueueDisplayProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const supabase = createClient();

  // Check queue length against transition length
  useEffect(() => {
    if (queue.length > 0 && queue.length < transitionLength) {
      setPopupMessage(`Queue length (${queue.length}) is less than the transition length (${transitionLength}). Some transitions may be skipped.`);
    }
  }, [queue.length, transitionLength]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      initializePlayer();
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const initializePlayer = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.provider_token) {
        setError('No Spotify access token available');
        return;
      }

      const player = new window.Spotify.Player({
        name: 'Vibe Jockey Web Player',
        getOAuthToken: (cb: (token: string) => void) => { 
          if (session.provider_token) {
            cb(session.provider_token);
          }
        },
        volume: 0.5
      });

      // Error handling
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Failed to initialize:', message);
        setError('Failed to initialize Spotify player');
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Failed to authenticate:', message);
        setError('Failed to authenticate with Spotify');
        setNeedsAuth(true);
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Failed to validate Spotify account:', message);
        setError('Failed to validate Spotify account');
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Failed to perform playback:', message);
        setError('Failed to perform playback');
      });

      // Playback status updates
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        
        const track = state.track_window.current_track;
        setCurrentTrack(track);
        setIsPlaying(!state.paused);
        if (track && onCurrentTrackChange) {
          onCurrentTrackChange(formatTrackId(track));
        }
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Ready with Device ID', device_id);
        // Transfer playback to this device
        fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.provider_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            device_ids: [device_id],
            play: false
          })
        });
      });

      // Not Ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline', device_id);
      });

      // Connect to the player!
      const connected = await player.connect();
      if (connected) {
        setPlayer(player);
      }
    } catch (error) {
      console.error('Error initializing player:', error);
      setError('Failed to initialize Spotify player');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/'; // Redirect to home page after logout
  };

  const formatTrackId = (track: SpotifyTrack): string => {
    const artist = track.artists[0]?.name || 'Unknown Artist';
    const title = track.name;
    return `${artist.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}_${title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}`;
  };

  const togglePlayback = async () => {
    if (!player) return;

    try {
      await player.togglePlay();
    } catch (error) {
      console.error('Error toggling playback:', error);
      setError('Failed to toggle playback');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-48">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="text-red-500 text-center p-4">
          {error}
        </div>
        {needsAuth && (
          <AuthButton type="login" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {popupMessage && <FadingPopup message={popupMessage} />}
      
      {/* Logout Button */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {/* Current Spotify Track */}
        {currentTrack && (
          <button
            onClick={togglePlayback}
            className="bg-gray-800 p-4 rounded-lg shadow-lg border-2 border-blue-500 hover:border-blue-400 transition-colors text-left"
          >
            {currentTrack.album.images[0]?.url && (
              <div className="relative">
                <img
                  src={currentTrack.album.images[0].url}
                  alt={currentTrack.name}
                  className="w-full aspect-square object-cover rounded-lg mb-4"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-40 transition-all duration-300 rounded-lg">
                  {isPlaying ? (
                    <svg className="w-16 h-16 text-white opacity-0 group-hover:opacity-100 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 text-white opacity-0 group-hover:opacity-100 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
              </div>
            )}
            <h3 className="text-lg font-semibold">{currentTrack.name}</h3>
            <p className="text-gray-400">
              {currentTrack.artists.map(artist => artist.name).join(', ')}
            </p>
            <p className="text-xs text-gray-500 mt-2">ID: {formatTrackId(currentTrack)}</p>
          </button>
        )}

        {/* Generated Queue */}
        {queue.map((song, index) => (
          <div
            key={song.songID}
            className={`bg-gray-800 p-4 rounded-lg shadow-lg ${index === 0 ? '' : 'opacity-75'}`}
          >
            <h3 className="text-lg font-semibold">{song.title}</h3>
            <p className="text-gray-400">{song.artist}</p>
            <div className="mt-2 flex justify-between text-sm">
              <span>Vibe Score: {Math.round(song.vibeScore * 100)}%</span>
              <span>Similarity: {Math.round(song.similarity * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 