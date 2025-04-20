import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set the cookie on the request so that subsequent middleware
            // can access the modified value
            request.cookies.set({
              name,
              value,
              ...options,
            })
            
            // Set the cookie on the response so that it's sent back to the browser
            response.cookies.set({
              name,
              value,
              ...options,
            })
          })
        }
      },
    }
  )

  // This will refresh the session if it exists
  // IMPORTANT! Make sure this is always immediately after you create the client
  await supabase.auth.getUser()

  return response
} 