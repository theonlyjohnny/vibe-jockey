'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../utils/supabase/client';

type AuthButtonProps = {
  type: 'login' | 'logout';
  className?: string;
  children?: React.ReactNode;
};

export default function AuthButton({ type, className, children }: AuthButtonProps) {
  const router = useRouter();

  const handleAuth = async () => {
    try {
      const supabase = createClient();
      
      // Always sign out first
      await supabase.auth.signOut();
      
      // If it's login type, we just let the route handle redirecting to home (which will show login)
      // For logout, we explicitly navigate
      router.push('/');
      router.refresh(); // Force a refresh of the page
    } catch (error) {
      console.error('Auth action error:', error);
    }
  };

  // Set default styles based on type
  const defaultClass = type === 'login' 
    ? "bg-[#1DB954] text-white px-4 py-2 rounded hover:bg-[#1ed760] transition"
    : "bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition";

  return (
    <button
      onClick={handleAuth}
      className={className || defaultClass}
    >
      {children || (type === 'login' ? 'Sign in with Spotify' : 'Logout')}
    </button>
  );
} 