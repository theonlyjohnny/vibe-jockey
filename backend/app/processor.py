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