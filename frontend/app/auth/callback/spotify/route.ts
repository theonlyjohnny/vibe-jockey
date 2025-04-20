import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
  }

  return response;
} 