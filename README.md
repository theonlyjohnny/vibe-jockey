# Semantic DJ

A web application that uses semantic search to help you control your Spotify queue based on "vibes" rather than specific songs. Want to make your queue 10% more energetic? Or add some songs that are 40% more rat-like? Semantic DJ will help you find and queue songs that match your desired direction.

## Project Structure

This project is divided into two main components:

### 1. Downloading Module (`downloading/`)

This module handles the Spotify integration and song downloading:
- Authenticates with your Spotify account
- Fetches your liked songs
- Downloads 30-second previews of songs for analysis

#### Setup
1. Install the required dependencies:
```bash
cd downloading
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Create a Spotify Developer account and set up a new application:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new application
   - Add `http://localhost:8888/callback` as a redirect URI in your app settings
   - Copy your Client ID and Client Secret

3. Create a `.env` file:
   - Copy `.env.example` to `.env`
   - Fill in your Spotify Client ID and Client Secret

#### Usage
```bash
python spotify_downloader.py
```

### 2. Indexing Module (`indexing/`)

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
```bash
python encode.py <path_to_wav_file>
```

## Project Vision

Semantic DJ aims to revolutionize how we interact with music by:
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

3. Song Processing Service
   - Combine downloading and indexing modules into a unified service
   - Process user's liked songs on initial sign-in
   - Store song embeddings in a remote PGVector database
   - Implement background job queue for processing
   - Add monitoring and error handling for long-running processes

## Notes

- Preview files are saved as MP3s with the format: `Artist - Song Title.mp3`
- Some songs may not have previews available
- The downloading script handles pagination to fetch all liked songs
- Authentication tokens are cached locally for future use 