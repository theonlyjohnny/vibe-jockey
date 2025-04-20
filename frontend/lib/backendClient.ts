/**
 * Client for communicating with the Python backend API
 */

type TrackMetadata = {
  [key: string]: any;
};

export type TrackRequest = {
  id: string;
  audio_url: string;
  metadata: TrackMetadata;
};

export type ProcessUserTracksRequest = {
  user_id: string;
};

class BackendClient {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    // Default to localhost:8000 if not specified
    this.apiUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    this.apiKey = process.env.BACKEND_API_KEY || '';

    if (!this.apiKey) {
      console.warn('BACKEND_API_KEY not set in environment variables');
    }
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  /**
   * ================================
   *      ENDPOINT FUNCTIONS
   * ================================
   */

  /**
   * Process a single track
   */
  async processTrack(trackRequest: TrackRequest): Promise<{ status: string; message: string; id: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/process-track`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(trackRequest),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error processing track:', error);
      throw error;
    }
  }

  /**
   * Process all unembedded tracks for a user
   */
  async processUserTracks(userId: string): Promise<{ status: string; message: string; user_id: string }> {
    try {
      const request: ProcessUserTracksRequest = { user_id: userId };
      const response = await fetch(`${this.apiUrl}/process-user-tracks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error processing user tracks:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const backendClient = new BackendClient();
export default backendClient; 