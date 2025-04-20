import Link from 'next/link';
import SpotifyLoginButton from './components/SpotifyLoginButton';
import SpotifyPlayer from './components/SpotifyPlayer';
import AuthButton from './components/AuthButton';
import { createClient } from './utils/supabase/server';

function LoginContent() {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md w-full flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-black dark:text-white">Login to Vibe Jockey</h2>
      <p className="text-black dark:text-white">Connect with your Spotify account to get started</p>
      <SpotifyLoginButton />
    </div>
  );
}

function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 gap-4">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm flex">
        <h1 className="text-3xl font-bold text-black dark:text-white">Vibe Jockey</h1>
      </div>
      <div className="flex flex-col items-center gap-4 w-full max-w-md">
        {children}
      </div>
    </main>
  );
}

function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center p-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-black dark:text-white">Vibe Jockey</h1>
        <AuthButton type="logout" />
      </div>
      <div className="flex-1 w-full flex items-center justify-center">
        {children}
      </div>
    </main>
  );
}

export default async function Home() {
  const supabase = createClient();

  try {
    let { data: { session } } = await supabase.auth.getSession();
    
    // Log session info for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('Session user:', !!session?.user);
      console.log('Provider token exists:', !!session?.provider_token);
    }
    
    // If there's a user but no provider token, try refreshing the session
    if (session?.user && !session?.provider_token) {
      console.log('User logged in but no provider token - attempting refresh');
      const { data: refreshData, error } = await supabase.auth.refreshSession();
      
      if (!error && refreshData.session?.provider_token) {
        console.log('Token refresh successful');
        // Update our session reference
        session = refreshData.session;
      } else {
        console.error('Token refresh failed:', error);
      }
    }
    
    // Only show the player if we have a user AND a provider token
    if (session?.user && session?.provider_token) {
      return (
        <PlayerLayout>
          <SpotifyPlayer />
        </PlayerLayout>
      );
    }

    // If user is logged in but no provider token, show a message
    if (session?.user) {
      return (
        <PlayerLayout>
          <div className="flex flex-col items-center justify-center w-full">
            <p className="text-red-500 mb-4">Spotify access token is missing. Please sign in again.</p>
            <AuthButton type="login" />
          </div>
        </PlayerLayout>
      );
    }

    return (
      <LoginLayout>
        <LoginContent />
      </LoginLayout>
    );
  } catch (error) {
    console.error('Error loading user session:', error);
    return (
      <LoginLayout>
        <LoginContent />
      </LoginLayout>
    );
  }
}
