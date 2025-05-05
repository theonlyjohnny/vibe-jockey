import os
import requests
import json
import logging
import torch
import numpy as np
import librosa
import io
from pydub import AudioSegment
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
import urllib.parse
from .vector_store import SupabaseVectorStore, SupabaseConnectionError
from .model_loader import load_model, ModelNotAvailableError, device

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

class DeezerAPIError(Exception):
    """Raised when there's an issue with the Deezer API."""
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

def get_preview_url_from_deezer(track_info: Dict[str, Any]) -> Optional[str]:
    """
    Fetch a preview URL from the Deezer API based on track information.
    
    Args:
        track_info (Dict[str, Any]): Track information containing at least artist_name and track_name
        
    Returns:
        Optional[str]: URL to the preview audio or None if not found
    """
    try:
        # Extract search terms
        artist_name = track_info.get("artist")
        track_name = track_info.get("title")
        
        if not artist_name or not track_name:
            logger.warning(f"Missing artist_name or track_name for track {track_info.get('id')}")
            return None
        
        # Build search query
        query = f'artist:"{artist_name}" track:"{track_name}"'
        encoded_query = urllib.parse.quote(query)
        search_url = f"https://api.deezer.com/search?q={encoded_query}"
        
        # Make request
        logger.info(f"Searching Deezer API for: {artist_name} - {track_name}")
        response = requests.get(search_url, timeout=30)
        response.raise_for_status()
        
        # Parse response
        search_results = response.json()
        
        if 'error' in search_results:
            logger.warning(f"Deezer API error: {search_results['error']}")
            return None
            
        if not search_results.get('data') or len(search_results['data']) == 0:
            logger.warning(f"No results found for {artist_name} - {track_name}")
            return None
            
        # Get preview URL from first result
        preview_url = search_results['data'][0].get('preview')
        
        if not preview_url:
            logger.warning(f"No preview URL found for {artist_name} - {track_name}")
            return None
            
        logger.info(f"Found preview URL for {artist_name} - {track_name}")
        return preview_url
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Request to Deezer API failed: {e}")
        raise DeezerAPIError(f"Failed to fetch from Deezer API: {e}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Deezer API response: {e}")
        raise DeezerAPIError(f"Failed to parse Deezer API response: {e}")
    except Exception as e:
        logger.error(f"Unexpected error with Deezer API: {e}")
        raise DeezerAPIError(f"Unexpected error with Deezer API: {e}")

def download_and_process_audio(audio_url: str) -> np.ndarray:
    """Download and process audio from a URL into an embedding."""
    try:
        # Load model using shared loader
        current_model, current_processor = load_model()
        
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
        inputs = current_processor(
            audios=audio_array,
            sampling_rate=48000,
            padding=True,
            return_tensors="pt"
        )
        
        # Move inputs to device
        inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
        
        # Generate embeddings
        with torch.no_grad():
            audio_embeddings = current_model.get_audio_features(**inputs)
        
        embedding = audio_embeddings.detach().cpu().numpy()
        return embedding
            
    except requests.exceptions.RequestException as e:
        raise PreviewDownloadError(f"Failed to download audio: {e}")
    except AudioProcessingError:
        raise
    except ModelNotAvailableError:
        raise
    except Exception as e:
        raise AudioProcessingError(f"Unexpected error processing audio: {e}")

def save_embedding(id: str, embedding: np.ndarray, audio_url: str, metadata: Dict[str, Any]) -> None:
    """Save embedding to vector store."""
    try:
        # Initialize the SupabaseVectorStore
        vector_store = SupabaseVectorStore(
            id=id,
            table_name="song_embeddings",
            embedding_column="embedding",
            content_column="content",
            metadata_columns=metadata.items() if metadata else []
        )
        
        # Get direct access to the Supabase client
        client = vector_store.client
        
        # Check if the record already exists
        response = client.table("song_embeddings").select("id").eq("id", id).execute()
        record_exists = response.data and len(response.data) > 0
        
        if record_exists:
            # Update existing record with the embedding
            logger.info(f"Record with ID {id} already exists, updating embedding")
            update_data = {
                "embedding": embedding[0].tolist()
            }
            # Update metadata fields if provided
            if metadata:
                update_data.update(metadata)
                
            response = client.table("song_embeddings").update(update_data).eq("id", id).execute()
            if hasattr(response, 'error') and response.error:
                raise SupabaseConnectionError(f"Failed to update embedding: {json.dumps(response.error)}")
            logger.info(f"Updated embedding in vector database for ID: {id}")
        else:
            # Insert new record
            vector_store.add_embeddings(
                embeddings=[embedding[0]],
                contents=[""],
                metadata=[metadata] if metadata else [{}]
            )
            logger.info(f"Stored new embedding in vector database with ID: {id}")
        
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
    except ModelNotAvailableError as e:
        logger.error(f"Model not available: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error processing track: {str(e)}")
        raise

def process_user_tracks(user_id: str) -> Dict[str, Any]:
    """Process all unembedded tracks for a specific user."""
    try:
        logger.info(f"Processing unembedded tracks for user: {user_id}")
        
        # Initialize Supabase client to query directly
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
            
        vector_store = SupabaseVectorStore()
        client = vector_store.client
        
        # Query for tracks without embeddings for the specified user
        response = client.table("song_embeddings").select("*").eq("user_id", user_id).is_("embedding", "null").execute()
        
        if hasattr(response, 'error') and response.error:
            raise SupabaseConnectionError(f"Supabase query failed: {json.dumps(response.error)}")
        
        unembedded_tracks = response.data
        logger.info(f"Found {len(unembedded_tracks)} unembedded tracks for user {user_id}")
        
        processed_count = 0
        failed_tracks = []
        
        # First, let's check if model is available
        try:
            load_model()
        except ModelNotAvailableError as e:
            logger.error(f"Model not available, cannot process tracks: {e}")
            return {
                "status": "failed",
                "reason": f"Model not available: {str(e)}",
                "total_tracks": len(unembedded_tracks),
                "processed_tracks": 0,
                "user_id": user_id
            }
        
        # Process each track
        for track in unembedded_tracks:
            try:
                track_id = track.get("id")
                if not track_id:
                    logger.warning("Track missing ID, skipping")
                    continue
                
                # Extract metadata fields
                metadata = {
                    key: track.get(key) for key in track 
                    if key not in ["id", "embedding", "created_at", "updated_at"]
                }
                
                # Fetch from Deezer
                logger.info(f"Track {track_id} needs processing, fetching from Deezer")
                preview_url = get_preview_url_from_deezer(track)
                    
                if not preview_url:
                    logger.warning(f"Unable to find preview URL for track {track_id}, skipping")
                    failed_tracks.append({
                        "id": track_id,
                        "reason": "Could not find preview URL from Deezer"
                    })
                    continue
                
                # Process the track
                process_track_with_metadata(
                    id=track_id,
                    audio_url=preview_url,
                    metadata=metadata
                )
                
                processed_count += 1
                logger.info(f"Processed track {track_id} ({processed_count}/{len(unembedded_tracks)})")
                
            except Exception as e:
                track_id = track.get("id", "unknown")
                logger.error(f"Failed to process track {track_id}: {str(e)}")
                failed_tracks.append({
                    "id": track_id,
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