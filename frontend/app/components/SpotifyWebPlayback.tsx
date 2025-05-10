'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../utils/supabase/client';
import Link from 'next/link';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
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

interface SpotifyWebPlaybackProps {
  onPlayerReady?: (deviceId: string) => void;
  onPlayerError?: (error: string) => void;
  onTrackChange?: (track: SpotifyTrack | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}

function ErrorDisplay({ message }: { message: string }) {
  const isPremiumError = message.includes('Premium account required');
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {isPremiumError ? 'Spotify Premium Required' : 'Error'}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {message}
          </p>
          {isPremiumError && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                The Spotify Web Playback SDK requires a Premium account to work. You can upgrade your account to continue using all features.
              </p>
              <a
                href="https://www.spotify.com/premium"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
              >
                Upgrade to Premium
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpotifyWebPlayback({
  onPlayerReady,
  onPlayerError,
  onTrackChange,
  onPlaybackStateChange
}: SpotifyWebPlaybackProps) {
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Check if user has Premium account
  const checkPremiumStatus = async (token: string) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      return data.product === 'premium';
    } catch (error) {
      console.error('Error checking premium status:', error);
      return false;
    }
  };

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
        const errorMsg = 'No Spotify access token available';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
        return;
      }

      // Check Premium status before initializing player
      const isPremium = await checkPremiumStatus(session.provider_token);
      if (!isPremium) {
        const errorMsg = 'Spotify Premium account required for playback control';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
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
        const errorMsg = 'Failed to initialize Spotify player';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Failed to authenticate:', message);
        const errorMsg = 'Failed to authenticate with Spotify';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Failed to validate Spotify account:', message);
        const errorMsg = 'Failed to validate Spotify account';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Failed to perform playback:', message);
        const errorMsg = 'Failed to perform playback';
        setError(errorMsg);
        onPlayerError?.(errorMsg);
      });

      // Playback status updates
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        
        const track = state.track_window.current_track;
        setCurrentTrack(track);
        setIsPlaying(!state.paused);
        onTrackChange?.(track);
        onPlaybackStateChange?.(!state.paused);
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Ready with Device ID', device_id);
        setError(null);
        onPlayerReady?.(device_id);
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
      const errorMsg = 'Failed to initialize Spotify player';
      setError(errorMsg);
      onPlayerError?.(errorMsg);
    }
  };

  return error ? <ErrorDisplay message={error} /> : null;
} 