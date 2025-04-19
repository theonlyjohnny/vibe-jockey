import backendClient from '../../lib/backendClient';

/**
 * Process a track through the backend service
 */
export async function processAudioTrack(
  trackId: string,
  audioUrl: string,
  metadata: Record<string, any>
) {
  try {
    return await backendClient.processTrack({
      id: trackId,
      audio_url: audioUrl,
      metadata,
    });
  } catch (error) {
    console.error('Failed to process audio track:', error);
    throw error;
  }
}

/**
 * Trigger processing of all unembedded tracks for a user
 */
export async function processUserTracks(userId: string) {
  try {
    return await backendClient.processUserTracks(userId);
  } catch (error) {
    console.error('Failed to process user tracks:', error);
    throw error;
  }
}