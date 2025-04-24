import os
import requests
import json
import logging
import torch
import numpy as np
from transformers import ClapModel, ClapProcessor
import librosa
import io
from pydub import AudioSegment
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

# Import from parent directory module
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vector_store import SupabaseVectorStore, SupabaseConnectionError

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Custom exceptions
class AudioProcessingError(Exception):
    """Raised when audio processing or embedding generation fails."""
    pass

class PreviewDownloadError(Exception):
    """Raised when preview download fails."""
    pass

class SpotifyAPIError(Exception):
    """Raised when Spotify API calls fail."""
    pass

# Load environment variables
load_dotenv()

# Validate environment variables
required_env_vars = {
    'SUPABASE_URL': os.getenv('SUPABASE_URL'),
    'SUPABASE_KEY': os.getenv('SUPABASE_KEY')
}

missing_vars = [var for var, value in required_env_vars.items() if not value]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

# Set up CLAP model
try:
    device = torch.device("cpu")
    logger.info("Using CPU for CLAP model")
    model = ClapModel.from_pretrained("laion/larger_clap_music_and_speech").to(device)
    processor = ClapProcessor.from_pretrained("laion/larger_clap_music_and_speech")
except Exception as e:
    logger.error(f"Failed to initialize CLAP model: {e}")
    raise

def download_and_process_audio(audio_url: str) -> np.ndarray:
    """Download and process audio from a URL into an embedding."""
    try:
        # Stream audio data
        logger.info(f"Streaming from: {audio_url}")
        response = requests.get(audio_url, timeout=30)
        response.raise_for_status()
        
        # Load audio data directly from memory using pydub
        audio_data = io.BytesIO(response.content)
        
        # Convert MP3 to WAV in memory
        audio_segment = AudioSegment.from_mp3(audio_data)
        wav_data = io.BytesIO()
        audio_segment.export(wav_data, format="wav")
        wav_data.seek(0)
        
        # Use librosa to read the WAV data
        audio_array, sampling_rate = librosa.load(wav_data, sr=48000, mono=True)
        
        if len(audio_array) == 0:
            raise AudioProcessingError("Audio file is empty")
        
        # Process audio
        inputs = processor(
            audios=audio_array,
            sampling_rate=48000,
            return_tensors="pt"
        )
        
        # Move inputs to device
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
        
        # Generate embeddings
        with torch.no_grad():
            audio_embeddings = model.get_audio_features(**inputs)
        
        embedding = audio_embeddings.detach().cpu().numpy()
        return embedding
            
    except requests.exceptions.RequestException as e:
        raise PreviewDownloadError(f"Failed to download audio: {e}")
    except AudioProcessingError:
        raise
    except Exception as e:
        raise AudioProcessingError(f"Unexpected error processing audio: {e}")

def save_embedding(id: str, embedding: np.ndarray, audio_url: str, metadata: Dict[str, Any]) -> None:
    """Save embedding to vector store."""
    try:
        vector_store = SupabaseVectorStore(
            id=id,
            table_name="song_embeddings",
            embedding_column="embedding",
            content_column="preview_url",
            metadata_columns=metadata.items() if metadata else []
        )
        
        vector_store.add_embeddings(
            embeddings=[embedding[0]],
            contents=[audio_url],
            metadata=[metadata] if metadata else [{}]
        )
        logger.info(f"Stored embedding in vector database with ID: {id}")
        
    except Exception as e:
        logger.error(f"Failed to store embedding in vector database: {e}")
        raise SupabaseConnectionError(f"Failed to store embedding: {e}")

def process_track_with_metadata(id: str, audio_url: str, metadata: Dict[str, Any] = None):
    """Process a track and store in the vector database."""
    try:
        logger.info(f"Processing track with ID: {id}")
        
        # Generate embedding
        embedding = download_and_process_audio(audio_url)
        
        # Store in vector database
        save_embedding(id, embedding, audio_url, metadata or {})
        
        logger.info(f"Successfully processed track with ID: {id}")
    except Exception as e:
        logger.error(f"Error processing track: {str(e)}")
        raise

def get_spotify_token(user_id: str, supabase: Client) -> str:
    """Get Spotify access token for a user from Supabase auth.session."""
    try:
        response = supabase.auth.admin.get_user_by_id(user_id)
        if not response or not response.user:
            raise SpotifyAPIError(f"User {user_id} not found")
            
        provider_token = response.user.app_metadata.get('provider_token')
        if not provider_token:
            raise SpotifyAPIError("No Spotify access token found")
            
        return provider_token
    except Exception as e:
        raise SpotifyAPIError(f"Failed to get Spotify token: {str(e)}")

def process_user_tracks(user_id: str, spotify_token: str) -> Dict[str, Any]:
    """Process all unembedded tracks for a specific user."""
    try:
        logger.info(f"Processing tracks for user: {user_id}")
        
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
            
        vector_store = SupabaseVectorStore()
        
        # 1. Fetch user's liked songs from Spotify
        logger.info("Starting to fetch liked songs from Spotify API")
        songs = []
        total_songs = 0
        
        # First get user profile to determine their market
        verify_response = requests.get("https://api.spotify.com/v1/me", headers={"Authorization": f"Bearer {spotify_token}"})
        if not verify_response.ok:
            error_data = verify_response.json() if verify_response.content else "No error details"
            logger.error(f"Failed to verify Spotify token: Status {verify_response.status_code}, Response: {error_data}")
            raise SpotifyAPIError(f"Invalid Spotify token: {verify_response.status_code}")
        
        user_data = verify_response.json()
        user_market = user_data.get('country', 'US')  # Default to US if country not found
        logger.info(f"Successfully verified Spotify token for user: {user_data.get('display_name', 'Unknown')} (Market: {user_market})")
        
        # Fetch all liked songs with market parameter
        url = f"https://api.spotify.com/v1/me/tracks?limit=50&market={user_market}"
        headers = {"Authorization": f"Bearer {spotify_token}"}
        
        # Fetch all liked songs
        while url:
            logger.info(f"Fetching songs from: {url}")
            response = requests.get(url, headers=headers)
            
            if not response.ok:
                error_data = response.json() if response.content else "No error details"
                logger.error(f"Spotify API error: Status {response.status_code}, Response: {error_data}")
                raise SpotifyAPIError(f"Spotify API error: {response.status_code}")
            
            data = response.json()
            items = data.get('items', [])
            logger.info(f"Fetched {len(items)} songs from current page")
            
            for item in items:
                total_songs += 1
                track = item.get('track', {})
                if not track:
                    logger.warning("Found item without track data")
                    continue
                
                # Debug: Print full track data for the first few songs
                if total_songs <= 3:
                    logger.info(f"Full track data for song {total_songs}:")
                    logger.info(json.dumps(track, indent=2))
                
                preview_url = track.get('preview_url')
                track_name = track.get('name', 'Unknown')
                artist_name = track['artists'][0]['name'] if track.get('artists') else 'Unknown'
                
                if not preview_url:
                    logger.debug(f"No preview URL for track: '{track_name}' by {artist_name}")
                    continue
                
                try:
                    songs.append({
                        'id': track['id'],
                        'title': track_name,
                        'artist': artist_name,
                        'preview_url': preview_url
                    })
                    logger.info(f"Found preview URL for track: '{track_name}' by {artist_name}")
                except KeyError as e:
                    logger.warning(f"Missing required field in track data: {e}")
                    continue
            
            url = data.get('next')
            if url:
                logger.info("Found next page, continuing...")
        
        logger.info(f"Found {len(songs)} songs with preview URLs out of {total_songs} total liked songs")
        
        # 2. Store tracks in Supabase
        try:
            for track in songs:
                vector_store.client.table('song_embeddings').insert({
                    'id': track['id'],
                    'user_id': user_id,
                    'preview_url': track['preview_url'],
                    'title': track['title'],
                    'artist': track['artist'],
                    'embedding': None  # Will be filled in later
                }).execute()
            logger.info(f"Stored {len(songs)} tracks for user {user_id}")
        except Exception as e:
            raise SupabaseConnectionError(f"Failed to store tracks: {str(e)}")
        
        # 3. Process tracks that don't have embeddings
        response = vector_store.client.table("song_embeddings").select("*").eq("user_id", user_id).is_("embedding", "null").execute()
        
        if hasattr(response, 'error') and response.error:
            raise SupabaseConnectionError(f"Supabase query failed: {json.dumps(response.error)}")
        
        unembedded_tracks = response.data
        logger.info(f"Processing {len(unembedded_tracks)} unembedded tracks")
        
        processed_count = 0
        failed_tracks = []
        
        # Process each track
        for track in unembedded_tracks:
            try:
                if not track.get("preview_url"):
                    logger.warning(f"Track {track.get('id')} has no preview URL, skipping")
                    failed_tracks.append({
                        "id": track.get("id"),
                        "reason": "No preview URL"
                    })
                    continue
                
                # Extract metadata fields
                metadata = {
                    key: track.get(key) for key in track 
                    if key not in ["id", "preview_url", "embedding", "created_at", "updated_at"]
                }
                
                # Process the track
                process_track_with_metadata(
                    id=track.get("id"),
                    audio_url=track.get("preview_url"),
                    metadata=metadata
                )
                
                processed_count += 1
                logger.info(f"Processed track {track.get('id')} ({processed_count}/{len(unembedded_tracks)})")
                
            except Exception as e:
                logger.error(f"Failed to process track {track.get('id')}: {str(e)}")
                failed_tracks.append({
                    "id": track.get("id"),
                    "reason": str(e)
                })
        
        return {
            "status": "completed",
            "total_tracks": len(unembedded_tracks),
            "processed_tracks": processed_count,
            "failed_tracks": failed_tracks,
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Error processing user tracks: {str(e)}")
        raise 