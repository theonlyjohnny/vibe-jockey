"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import backendClient from '../../lib/backendClient';
import { createBrowserClient } from '@supabase/ssr';
import AuthButton from '../components/AuthButton';

export default function ImportLikedSongsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleImport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(false);

      // Create Supabase client
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setError('Please log in to import your liked songs');
        return;
      }

      if (!session.provider_token) {
        setError('No Spotify access token found. Please log in again.');
        return;
      }

      // Call the backend to process user tracks
      const result = await backendClient.processUserTracks(session.user.id, session.provider_token);
      
      if (result.status === 'processing') {
        setSuccess(true);
      } else {
        setError(result.message || 'Failed to import liked songs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Import Your Liked Songs</h1>
      
      <div className="max-w-md bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Click the button below to import all your Spotify liked songs into Vibe Jockey. 
          This will allow us to analyze your music preferences and create better playlists for you.
        </p>

        <button
          onClick={handleImport}
          disabled={isLoading}
          className="w-full bg-[#1DB954] text-white p-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#1ed760] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {isLoading ? (
            <span>Importing...</span>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Import Liked Songs</span>
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4">
            <span className="block sm:inline">Successfully imported your liked songs!</span>
          </div>
        )}
      </div>
    </div>
  );
} 