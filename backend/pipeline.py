import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
import requests
import json
import re
from pathlib import Path
import time
from typing import Optional, Dict, Any, List
from bs4 import BeautifulSoup
import torch
import numpy as np
from transformers import ClapModel, ClapProcessor
import librosa
import sys
import logging
from vector_store import SupabaseVectorStore, SupabaseConnectionError

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Custom exceptions
class SpotifyAuthError(Exception):
    """Raised when Spotify authentication fails."""
    pass

class AudioProcessingError(Exception):
    """Raised when audio processing or embedding generation fails."""
    pass

class PreviewDownloadError(Exception):
    """Raised when preview download fails."""
    pass

# Load environment variables
load_dotenv()

# Validate environment variables
required_env_vars = {
    'SPOTIFY_CLIENT_ID': os.getenv('SPOTIFY_CLIENT_ID'),
    'SPOTIFY_CLIENT_SECRET': os.getenv('SPOTIFY_CLIENT_SECRET'),
    'SUPABASE_URL': os.getenv('SUPABASE_URL'),
    'SUPABASE_KEY': os.getenv('SUPABASE_KEY')
}

missing_vars = [var for var, value in required_env_vars.items() if not value]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

# Spotify API credentials
SPOTIFY_CLIENT_ID = required_env_vars['SPOTIFY_CLIENT_ID']
SPOTIFY_CLIENT_SECRET = required_env_vars['SPOTIFY_CLIENT_SECRET']
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://localhost:8888/callback')

# Deezer API configuration
DEEZER_API_BASE = "https://api.deezer.com"
DEEZER_RATE_LIMIT = 50  # requests per second
DEEZER_REQUEST_DELAY = 1.0 / DEEZER_RATE_LIMIT  # delay between requests in seconds

# Directory setup
BASE_DIR = Path(__file__).parent

# Set up CLAP model
try:
    device = torch.device("cpu")
    logger.info("Using CPU for CLAP model")
    model = ClapModel.from_pretrained("laion/larger_clap_music_and_speech").to(device)
    processor = ClapProcessor.from_pretrained("laion/larger_clap_music_and_speech")
except Exception as e:
    logger.error(f"Failed to initialize CLAP model: {e}")
    raise

def setup_spotify():
    """Set up Spotify client with authentication.
    
    Returns:
        Tuple[spotipy.Spotify, str]: Tuple containing authenticated Spotify client and user ID
        
    Raises:
        SpotifyAuthError: If authentication fails
    """
    try:
        auth_manager = SpotifyOAuth(
            client_id=SPOTIFY_CLIENT_ID,
            client_secret=SPOTIFY_CLIENT_SECRET,
            redirect_uri=SPOTIFY_REDIRECT_URI,
            scope='user-library-read',
            open_browser=False
        )
        
        if not auth_manager.get_cached_token():
            auth_url = auth_manager.get_authorize_url()
            logger.info("\n----------------------------------------")
            logger.info("Please navigate to this URL in your browser:")
            logger.info(auth_url)
            logger.info("----------------------------------------\n")
            
            code = input("After authorizing, paste the code query parameter from the redirect url here: ")
            
            try:
                auth_manager.get_access_token(code)
            except Exception as e:
                raise SpotifyAuthError(f"Failed to get access token: {e}")
        
        client = spotipy.Spotify(auth_manager=auth_manager)
        
        # Test the client and get user ID
        try:
            user_info = client.current_user()
            user_id = user_info['id']
            logger.info("Successfully authenticated with Spotify")
            return client, user_id
        except Exception as e:
            raise SpotifyAuthError(f"Failed to verify Spotify client: {e}")
            
    except Exception as e:
        raise SpotifyAuthError(f"Failed to set up Spotify client: {e}")

def get_liked_songs(sp) -> List[Dict[str, Any]]:
    """Fetch all liked songs from the user's library.
    
    Args:
        sp: Authenticated Spotify client
        
    Returns:
        List[Dict[str, Any]]: List of track information
        
    Raises:
        SpotifyAuthError: If API calls fail
    """
    try:
        results = sp.current_user_saved_tracks()
        tracks = results['items']
        
        logger.info(f"Found initial batch of {len(tracks)} liked songs")
        
        while results['next']:
            try:
                results = sp.next(results)
                logger.info(f"Found additional {len(results['items'])} liked songs")
                tracks.extend(results['items'])
            except Exception as e:
                logger.error(f"Error during pagination: {e}")
                break
        
        logger.info(f"Total tracks found: {len(tracks)}")
        return tracks
        
    except Exception as e:
        raise SpotifyAuthError(f"Failed to fetch liked songs: {e}")

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

def encode_audio(audio_file_path: str) -> np.ndarray:
    """Encode audio file into CLAP embedding.
    
    Args:
        audio_file_path: Path to the audio file
        
    Returns:
        np.ndarray: Audio embedding
        
    Raises:
        AudioProcessingError: If encoding fails
    """
    try:
        # Validate file exists and is readable
        if not os.path.exists(audio_file_path):
            raise AudioProcessingError(f"Audio file does not exist: {audio_file_path}")
        
        if not os.access(audio_file_path, os.R_OK):
            raise AudioProcessingError(f"Audio file is not readable: {audio_file_path}")
        
        # Load and validate audio file
        try:
            audio_array, sampling_rate = librosa.load(audio_file_path, sr=48000)
        except Exception as e:
            raise AudioProcessingError(f"Failed to load audio file: {e}")
            
        if len(audio_array) == 0:
            raise AudioProcessingError("Audio file is empty")
            
        # Process audio
        try:
            inputs = processor(
                audios=audio_array,
                sampling_rate=48000,
                return_tensors="pt"
            )
        except Exception as e:
            raise AudioProcessingError(f"Failed to process audio: {e}")
            
        # Move inputs to device
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
            
        # Generate embeddings
        with torch.no_grad():
            audio_embeddings = model.get_audio_features(**inputs)
            
        embedding = audio_embeddings.detach().cpu().numpy()
            
        return embedding
            
    except AudioProcessingError:
        raise
    except Exception as e:
        raise AudioProcessingError(f"Unexpected error in encode_audio: {e}")

def process_track(track: Dict[str, Any], user_id: str) -> None:
    """Process a single track through the pipeline without downloading.
    
    Args:
        track: Track information dictionary
        user_id: Spotify user ID
        
    Raises:
        AudioProcessingError: If audio processing fails
        SupabaseConnectionError: If vector storage fails
    """
    try:
        track_name = track['track']['name']
        artist_name = track['track']['artists'][0]['name']
        
        logger.info(f"Processing: {track_name} by {artist_name}")
        
        # Step 1: Get preview URL
        deezer_track = search_deezer_track(track_name, artist_name)
        if not deezer_track or not deezer_track.get('preview'):
            raise PreviewDownloadError(f"No preview available for {track_name}")
        
        preview_url = deezer_track['preview']
        
        # Stream audio data
        logger.info(f"Streaming from: {preview_url}")
        try:
            response = requests.get(preview_url, timeout=30)
            response.raise_for_status()
            
            # Load audio data directly from memory using pydub
            import io
            from pydub import AudioSegment
            audio_data = io.BytesIO(response.content)
            
            # Convert MP3 to WAV in memory
            audio_segment = AudioSegment.from_mp3(audio_data)
            wav_data = io.BytesIO()
            audio_segment.export(wav_data, format="wav")
            wav_data.seek(0)
            
            # Use librosa to read the WAV data
            import librosa
            audio_array, sampling_rate = librosa.load(wav_data, sr=48000, mono=True)
            
            if len(audio_array) == 0:
                raise AudioProcessingError("Audio file is empty")
            
            # Generate embedding
            logger.info("Generating embedding...")
            
            # Process audio
            try:
                inputs = processor(
                    audios=audio_array,
                    sampling_rate=48000,
                    return_tensors="pt"
                )
            except Exception as e:
                raise AudioProcessingError(f"Failed to process audio: {e}")
            
            # Move inputs to device
            inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
            
            # Generate embeddings
            with torch.no_grad():
                audio_embeddings = model.get_audio_features(**inputs)
            
            embedding = audio_embeddings.detach().cpu().numpy()
            
            # Store in vector database
            try:
                vector_store = SupabaseVectorStore(
                    table_name="song_embeddings",
                    embedding_column="embedding",
                    content_column="preview_url",
                    metadata_columns=["title", "artist", "genre", "user_id"]
                )
                
                metadata = {
                    "title": track_name,
                    "artist": artist_name,
                    "genre": track['track'].get('album', {}).get('genres', ['unknown'])[0] if track['track'].get('album', {}).get('genres') else 'unknown',
                    "user_id": user_id
                }
                
                vector_store.add_embeddings(
                    embeddings=[embedding[0]],
                    contents=[preview_url],
                    metadata=[metadata]
                )
                logger.info(f"Stored embedding in vector database for {track_name}")
                
            except Exception as e:
                logger.error(f"Failed to store embedding in vector database: {e}")
                raise SupabaseConnectionError(f"Failed to store embedding: {e}")
                
        except requests.exceptions.RequestException as e:
            raise AudioProcessingError(f"Failed to stream audio: {e}")
            
    except (PreviewDownloadError, AudioProcessingError, SupabaseConnectionError) as e:
        logger.error(f"Error processing {track_name}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing {track_name}: {str(e)}")
        raise

def main() -> int:
    """Main processing pipeline.
    
    Returns:
        int: Exit code (0 for success, 1 for error)
    """
    try:
        # Set up Spotify client
        logger.info("Setting up Spotify client...")
        sp, user_id = setup_spotify()
        
        # Get liked songs
        logger.info("\nFetching liked songs from Spotify...")
        tracks = get_liked_songs(sp)
        logger.info(f"\nTotal tracks found: {len(tracks)}")
        
        # Process each track
        logger.info("\nStarting processing pipeline...")
        for i, track in enumerate(tracks, 1):
            try:
                logger.info(f"\nProcessing track {i}/{len(tracks)}")
                process_track(track, user_id)
            except Exception as e:
                logger.error(f"Failed to process track: {e}")
                # Continue with next track
                continue
        
        logger.info("\nPipeline complete!")
        return 0
        
    except KeyboardInterrupt:
        logger.info("\nProcessing interrupted. Progress has been saved.")
        return 0
    except Exception as e:
        logger.error(f"\nUnexpected error in main processing loop: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 