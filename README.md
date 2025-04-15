# Vibe Jockey

A web application that uses semantic search to help you control your Spotify queue based on "vibes" rather than specific songs. Want to make your queue 10% more energetic? Or add some songs that are 40% more rat-like? Vibe Jockey will help you find and queue songs that match your desired direction.

## Project Structure

The project consists of a unified backend system that handles audio processing, embedding generation, and database storage:

### Backend Pipeline (`backend/`)

The backend pipeline handles the entire process from Spotify integration to embedding storage:

- Authenticates with Spotify and fetches liked songs
- Streams 30-second previews from Deezer's API (no local storage needed)
- Processes audio using CLAP (Contrastive Language-Audio Pretraining) model
- Generates and stores embeddings in Supabase with pgvector

#### Key Features

- **Efficient Processing**: Streams audio directly from Deezer without local storage
- **Duplicate Detection**: Prevents re-processing of existing tracks
- **Consistent ID Generation**: Uses normalized artist/track names for unique IDs
- **Vector Storage**: Stores embeddings in Supabase for semantic search

#### Setup

1. Install the required dependencies:
```bash
cd downloading
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Set up your credentials:
   - Create a Spotify Developer account and application at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Add `http://localhost:8888/callback` as a redirect URI
   - Set up a Supabase project and enable the pgvector extension
3. Create a `.env` file with the following:
     ```
     SPOTIFY_CLIENT_ID=your_spotify_client_id
     SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
     SUPABASE_URL=your_supabase_url
     SUPABASE_KEY=your_supabase_key
     ```

#### Database Schema

This module processes audio files and creates semantic embeddings:
- Uses the CLAP (Contrastive Language-Audio Pretraining) model
- Converts audio files into vector embeddings
- Enables semantic search and comparison of songs

#### Setup
```bash
cd indexing
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Usage

Run the main pipeline:
```bash
python pipeline.py
```

This will:
1. Authenticate with Spotify
2. Fetch your liked songs
3. Check for existing tracks in the database
4. Process new tracks and generate embeddings
5. Store results in Supabase

## Project Vision

Vibe Jockey aims to revolutionize how we interact with music by:
- Using semantic embeddings to understand the "vibe" of songs
- Allowing users to modify their queue based on semantic directions
- Providing a web interface that integrates with the Spotify Player SDK
- Enabling natural language requests for queue modifications

## TODO

The following components are needed to complete the project:

1. Web Interface
   - Create a React/Next.js frontend
   - Integrate Spotify Player SDK for playback control
   - Design a user-friendly interface for semantic controls
   - Implement real-time queue visualization
   - Add controls for modifying active vibes

2. Backend API
   - Implement Spotify OAuth authentication flow
   - Create endpoints for:
      - Adding new vibes to the queue
      - Getting next song based on current song + active vibes
      - Managing user session state
   - Handle queue modification requests through Spotify API
   - Trigger background processing jobs for new users
     - Semantic search
     - User preferences
   - Handle Spotify API integration
   - Add real-time processing status

3. Song Processing Service
   - Combine downloading and indexing modules into a unified service
   - Process user's liked songs on initial sign-in
   - Store song embeddings in a remote PGVector database
   - Implement background job queue for processing
   - Add monitoring and error handling for long-running processes

4. Enhanced Features
   - Add batch processing for large libraries
   - Implement more sophisticated embedding comparison
   - Add user-defined semantic directions
   - Create collaborative playlists based on shared vibes

## Technical Details

### CLAP Model

We use the LAION CLAP model for generating audio embeddings:
- Model: `laion/larger_clap_music_and_speech`
- Input: 30-second audio previews (48kHz mono)
- Output: High-dimensional embedding vectors

### Vector Storage

Using Supabase with pgvector for:
- Efficient vector similarity search
- Metadata storage and retrieval
- Real-time querying capabilities

### Audio Processing

The pipeline uses:
- `pydub` for audio format conversion
- `librosa` for audio processing
- `ffmpeg` for audio manipulation
- Direct streaming from Deezer's preview API


## Helpful Readings

1. [CLAP (Contrastive Language-Audio Pretraining)](https://github.com/LAION-AI/CLAP?tab=readme-ov-file)
   - Explains how the CLAP model works, which we use for generating semantic embeddings of songs
   - Details the architecture and training process of the model
   - Provides implementation details and usage examples

2. [Vector Embeddings in RAG Applications](https://wandb.ai/mostafaibrahim17/ml-articles/reports/Vector-Embeddings-in-RAG-Applications--Vmlldzo3OTk1NDA5)
   - Explains how vector embeddings are used in Retrieval-Augmented Generation (RAG) systems
   - Relevant to our approach of using semantic embeddings to find similar songs
   - Provides insights into vector similarity search and database implementations

## Notes

- Preview files are saved as MP3s with the format: `Artist - Song Title.mp3`
- Some songs may not have previews available
- The downloading script handles pagination to fetch all liked songs
- Authentication tokens are cached locally for future use

# Semantic DJ

## Audio Processing API

### Running in Production

To run the API in production mode:

```bash
cd backend
python run_production.py
```

This will:
- Use multiple worker processes (2 * CPU cores + 1)
- Enable proxy headers support for running behind a reverse proxy
- Set up appropriate logging and other production settings

For deployment on platforms like Heroku, a Procfile is included.

### API Endpoints

#### Process Track
`POST /process-track`

Required fields:
- `audio_url`: URL of the audio file to process
- `id`: ID to save the embedding with

Optional fields:
- `metadata`: Any additional metadata as key-value pairs

Example request:
```json
{
  "audio_url": "https://example.com/audio.mp3",
  "id": "my_track_id_123",
  "metadata": {
    "title": "Song Title",
    "artist": "Artist Name"
  }
}
```

Response:
```json
{
  "status": "processing",
  "message": "Processing track with ID: my_track_id_123",
  "id": "my_track_id_123"
}
```

#### Health Check
`GET /health`

Response:
```json
{
  "status": "healthy"
}
``` 