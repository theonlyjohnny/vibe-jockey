'use client';

import { Song } from '../../types/song-queue';
import { useEffect, useState } from 'react';
import { createClient } from '../../utils/supabase/client';
import AuthButton from '../../components/AuthButton';

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

export default function QueueDisplay({ queue, transitionLength, onCurrentTrackChange }: QueueDisplayProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Function to get a valid Spotify token
  const getValidToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.provider_token) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshData.session?.provider_token) {
        throw new Error('Failed to refresh token');
      }
      
      return refreshData.session.provider_token;
    }
    
    return session.provider_token;
  };

  // Function to fetch the current Spotify track
  const fetchCurrentTrack = async () => {
    try {
      const token = await getValidToken();
      
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          setNeedsAuth(true);
          throw new Error('Missing playback permissions. Please sign in again.');
        }
        throw new Error('Failed to fetch current track');
      }

      const data = await response.json();
      if (data.item) {
        setCurrentTrack(data.item);
        setIsPlaying(!data.is_playing);
        onCurrentTrackChange?.(data.item.id);
      }
    } catch (err) {
      console.error('Error fetching current track:', err);
      if (err instanceof Error && err.message.includes('Missing playback permissions')) {
        setError(err.message);
      }
    }
  };

  // Function to toggle play/pause
  const togglePlayback = async () => {
    try {
      const token = await getValidToken();
      
      const response = await fetch('https://api.spotify.com/v1/me/player/' + (isPlaying ? 'pause' : 'play'), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          setNeedsAuth(true);
          throw new Error('Missing playback permissions. Please sign in again.');
        }
        throw new Error('Failed to toggle playback');
      }

      setIsPlaying(!isPlaying);
    } catch (err) {
      console.error('Error toggling playback:', err);
      if (err instanceof Error && err.message.includes('Missing playback permissions')) {
        setError(err.message);
      } else {
        setError('Failed to toggle playback');
      }
    }
  };

  // Initial fetch and periodic updates
  useEffect(() => {
    fetchCurrentTrack();
    const interval = setInterval(fetchCurrentTrack, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [onCurrentTrackChange]);

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
            <p className="text-xs text-gray-500 mt-2">ID: {currentTrack.id}</p>
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