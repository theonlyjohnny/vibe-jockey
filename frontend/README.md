# Semantic DJ

A Next.js application using Supabase for Spotify OAuth authentication.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Supabase Setup for Spotify OAuth

1. Go to your [Supabase Dashboard](https://app.supabase.com/) and select your project
2. Navigate to Authentication → Providers
3. Find Spotify in the list and enable it
4. Add the following credentials:
   - Client ID: `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` from your .env.local
   - Client Secret: `SPOTIFY_CLIENT_SECRET` from your .env.local
5. Set Redirect URL to: `http://localhost:3000/auth/callback/spotify`
6. Save the configuration

## Spotify Developer Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create or select your app
3. Set the Redirect URI to: `http://localhost:3000/auth/callback/spotify`
4. Save the configuration

## Environment Variables

Create a `.env.local` file in the frontend directory with the following:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/callback/spotify
```

## Deployment

This application can be deployed to Vercel. When deploying, make sure to configure the environment variables in your hosting provider's dashboard.

## Setting up Supabase and Spotify in Production

1. Update the Redirect URI in both Supabase and Spotify Developer Dashboard to your production URL
2. Update environment variables with production values
