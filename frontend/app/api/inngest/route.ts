import { serve } from 'inngest/next';
import { inngest, generateSongQueue, processUserTracks, testFunction } from '@/lib/inngest';

// Create a server
export const GET = serve({
  client: inngest,
  functions: [generateSongQueue, processUserTracks, testFunction],
});

export const POST = GET;
export const PUT = GET;

// Add a direct debug log here to check if this file is being loaded
console.log("Inngest route.ts loaded, registered functions:", 
  [generateSongQueue, processUserTracks, testFunction].map(fn => fn.name || fn.id || "unnamed")
);