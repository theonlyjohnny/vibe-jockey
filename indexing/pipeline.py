import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
import requests
import json
import re
from pathlib import Path
import time
from typing import Optional, Dict, Any
from bs4 import BeautifulSoup
import torch
import numpy as np
from transformers import ClapModel, ClapProcessor
import librosa
import sys

# Load environment variables
load_dotenv()

# Spotify API credentials
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://localhost:8888/callback')

# Deezer API configuration
DEEZER_API_BASE = "https://api.deezer.com"
DEEZER_RATE_LIMIT = 50  # requests per second
DEEZER_REQUEST_DELAY = 1.0 / DEEZER_RATE_LIMIT  # delay between requests in seconds

# Directory setup
BASE_DIR = Path(__file__).parent  # Gets us to the indexing directory
PREVIEW_DIR = BASE_DIR / "data/previews"
EMBEDDINGS_DIR = BASE_DIR / "data/embeddings"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)

# Set up CLAP model
device = torch.device("cpu")
print("Using CPU")
model = ClapModel.from_pretrained("laion/larger_clap_music_and_speech").to(device)
processor = ClapProcessor.from_pretrained("laion/larger_clap_music_and_speech")

def setup_spotify():
    """Set up Spotify client with authentication."""
    auth_manager = SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope='user-library-read',
        open_browser=False  # Prevent automatic browser opening
    )
    
    # Check if we need to get a new token
    if not auth_manager.get_cached_token():
        # Get the authorization URL
        auth_url = auth_manager.get_authorize_url()
        print("\n----------------------------------------")
        print("Please navigate to this URL in your browser:")
        print(auth_url)
        print("----------------------------------------\n")
        
        # Ask for the redirect URL after authentication
        code = input("After authorizing, paste the code query parameter from the redirect url here: ")
        
        # Get access token using the code
        auth_manager.get_access_token(code)
    
    return spotipy.Spotify(auth_manager=auth_manager)

def get_liked_songs(sp):
    """Fetch all liked songs from the user's library."""
    results = sp.current_user_saved_tracks()
    tracks = results['items']
    
    print(f"Found {len(tracks)} liked songs")
    
    # Get all tracks (handle pagination)
    while results['next']:
        results = sp.next(results)
        print(f"Found {len(results['items'])} liked songs")
        tracks.extend(results['items'])
    
    return tracks

def get_preview_url_from_embed(track_id):
    """Workaround to get preview URL from Spotify's embed page."""
    embed_url = f"https://open.spotify.com/embed/track/{track_id}"
    
    try:
        response = requests.get(embed_url)
        if response.status_code != 200:
            print(f"Failed to fetch embed page: {response.status_code}")
            return None
        
        # Parse the HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the script containing the JSON data
        script_tags = soup.find_all('script')
        for script in script_tags:
            if script.string and 'audioPreview' in script.string:
                # Extract the JSON using regex
                match = re.search(r'Spotify\.Entity = (.+?)};', script.string)
                if match:
                    data_json = match.group(1) + '}'
                    try:
                        data = json.loads(data_json)
                        if 'audioPreview' in data and 'url' in data['audioPreview']:
                            return data['audioPreview']['url']
                    except json.JSONDecodeError:
                        pass
        
        print(f"Couldn't find audioPreview in embed page for track {track_id}")
        return None
    except Exception as e:
        print(f"Error fetching preview from embed: {e}")
        return None

def search_deezer_track(track_name: str, artist_name: str, max_retries: int = 3) -> Optional[Dict[str, Any]]:
    """
    Search for a track on Deezer with exponential backoff.
    
    Args:
        track_name: Name of the track to search for
        artist_name: Name of the artist
        max_retries: Maximum number of retry attempts
    
    Returns:
        Dict containing track information if found, None otherwise
    """
    query = f"{track_name} {artist_name}"
    encoded_query = requests.utils.quote(query)
    url = f"{DEEZER_API_BASE}/search?q={encoded_query}"
    
    for attempt in range(max_retries):
        try:
            # Respect rate limiting
            time.sleep(DEEZER_REQUEST_DELAY)
            
            response = requests.get(url)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('data') and len(data['data']) > 0:
                    return data['data'][0]
            elif response.status_code in (403, 429):
                # Calculate exponential backoff delay
                backoff_delay = (2 ** attempt) * DEEZER_REQUEST_DELAY
                print(f"Rate limited. Waiting {backoff_delay:.2f} seconds before retry...")
                time.sleep(backoff_delay)
            else:
                print(f"Error searching Deezer: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error during Deezer search: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None
    
    return None

def get_safe_filename(track_name: str, artist_name: str) -> str:
    """Create a safe filename for a track."""
    filename = f"{artist_name} - {track_name}.mp3"
    return "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.'))

def encode_audio(audio_file_path):
    """Encode audio file into CLAP embedding."""
    try:
        # Load your audio file
        audio_array, sampling_rate = librosa.load(audio_file_path, sr=48000)  # CLAP expects 48kHz

        # Process the audio and get embeddings
        inputs = processor(
            audios=audio_array, 
            sampling_rate=48000,  # Explicitly pass sampling rate
            return_tensors="pt"
        )
        
        # Move inputs to the same device as the model
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

        # Extract features
        with torch.no_grad():
            audio_embeddings = model.get_audio_features(**inputs)

        # Convert to numpy if needed
        audio_embeddings_np = audio_embeddings.detach().cpu().numpy()
        return audio_embeddings_np
    except Exception as e:
        print(f"\nError in encode_audio for {audio_file_path}:")
        print(f"Type: {type(e).__name__}")
        print(f"Details: {str(e)}")
        raise

def process_track(track: Dict[str, Any]) -> None:
    """Download and process a single track through the entire pipeline."""
    track_name = track['track']['name']
    artist_name = track['track']['artists'][0]['name']
    
    # Create safe filenames for both MP3 and embedding
    filename = get_safe_filename(track_name, artist_name)
    mp3_path = PREVIEW_DIR / filename
    embedding_path = EMBEDDINGS_DIR / filename.replace('.mp3', '.npy')
    
    # Skip if embedding already exists
    if embedding_path.exists():
        print(f"Skipping {track_name} - embedding already exists")
        return
    
    print(f"Processing: {track_name} by {artist_name}")
    
    try:
        # Step 1: Download from Deezer
        deezer_track = search_deezer_track(track_name, artist_name)
        if not deezer_track or not deezer_track.get('preview'):
            print(f"No preview available for {track_name}")
            return
        
        preview_url = deezer_track['preview']
        
        # Download the preview
        print(f"Downloading from: {preview_url}")
        response = requests.get(preview_url)
        if response.status_code == 200:
            # Check if directory exists
            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            
            with open(mp3_path, 'wb') as f:
                f.write(response.content)
            print(f"Downloaded preview for: {track_name}")
            
            # Check if file exists and is readable
            if not mp3_path.exists():
                print(f"Error: File {mp3_path} was not created successfully")
                return
                
            if not os.access(mp3_path, os.R_OK):
                print(f"Error: File {mp3_path} is not readable")
                return
            
            try:
                # Step 2: Generate embedding
                print("Generating embedding...")
                embedding = encode_audio(str(mp3_path))
                
                # Ensure embeddings directory exists
                EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
                
                # Save embedding
                np.save(embedding_path, embedding)
                print(f"Saved embedding to {embedding_path}")
                
            except Exception as e:
                print(f"Error generating embedding for {track_name}:")
                print(f"Type: {type(e).__name__}")
                print(f"Details: {str(e)}")
            
        else:
            print(f"Failed to download preview for {track_name} (Status: {response.status_code})")
        
    except Exception as e:
        print(f"Error processing {track_name}:")
        print(f"Type: {type(e).__name__}")
        print(f"Details: {str(e)}")
    
    finally:
        # Clean up MP3 file
        if mp3_path.exists():
            try:
                mp3_path.unlink()
            except Exception as e:
                print(f"Warning: Could not delete temporary file {mp3_path}: {str(e)}")

def main():
    # Check for required environment variables
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("Error: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env file")
        return
    
    try:
        # Set up Spotify client
        print("Setting up Spotify client...")
        sp = setup_spotify()
        
        # Get liked songs
        print("\nFetching liked songs from Spotify...")
        tracks = get_liked_songs(sp)
        print(f"\nTotal tracks found: {len(tracks)}")
        
        # Count existing files
        existing_files = set(f.name for f in EMBEDDINGS_DIR.glob("*.npy"))
        print(f"Found {len(existing_files)} existing embedding files")
        
        # Process each track
        print("\nStarting processing pipeline...")
        for i, track in enumerate(tracks, 1):
            print(f"\nProcessing track {i}/{len(tracks)}")
            process_track(track)
        
        print("\nPipeline complete!")
        
    except KeyboardInterrupt:
        print("\nProcessing interrupted. Progress has been saved.")
    except Exception as e:
        print(f"\nUnexpected error in main processing loop:")
        print(f"Type: {type(e).__name__}")
        print(f"Details: {str(e)}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main()) 