from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends
import logging
import os
from .models import TrackRequest, ProcessUserTracksRequest, SongQueueRequest, SongQueueResponse, SongMetadata
from .processor import process_track_with_metadata, process_user_tracks
from .model_loader import load_model, ModelNotAvailableError, device
from fastapi.security.api_key import APIKeyHeader
from fastapi import Security
from fastapi.responses import JSONResponse
import torch
from typing import Dict, List, Optional
import numpy as np
from .vector_store import SupabaseVectorStore
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# API key configuration
API_KEY = os.getenv("API_KEY")
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# Load environment variables
load_dotenv()

# Initialize vector store
vector_store = SupabaseVectorStore(
    table_name="song_embeddings",
    embedding_column="embedding"
)

async def get_api_key(api_key_header: str = Security(api_key_header)):
    if not API_KEY:
        logger.warning("API_KEY environment variable not set, authentication disabled")
        return True
    
    if api_key_header != API_KEY:
        logger.warning("Invalid API key attempt")
        raise HTTPException(
            status_code=403, detail="Invalid API key"
        )
    return True

app = FastAPI(title="Audio Processing API")

@app.post("/process-user-tracks")
async def process_user_tracks_endpoint(request: ProcessUserTracksRequest, background_tasks: BackgroundTasks, authorized: bool = Depends(get_api_key)):
    try:
        # Process user tracks in background
        background_tasks.add_task(
            process_user_tracks,
            request.user_id
        )
        
        return {
            "status": "processing",
            "message": f"Processing unembedded tracks for user: {request.user_id}",
            "user_id": request.user_id
        }
    except Exception as e:
        logger.error(f"Error in process-user-tracks API: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint that doesn't require authentication"""
    return {"status": "healthy"}

def embed_text(text: str) -> np.ndarray:
    """Convert text to CLAP embedding."""
    try:
        # Load model using shared loader
        current_model, current_processor = load_model()
        
        inputs = current_processor(text=text, return_tensors="pt", padding=True)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            # Use get_text_features method for ClapModel
            embeddings = current_model.get_text_features(**inputs)
        
        # Log the embedding process
        logger.info(f"Generated embedding for text: '{text}'")
        
        # Convert to numpy and normalize
        embedding = embeddings[0].cpu().numpy()
        
        # Ensure the embedding is normalized
        normalized_embedding = vector_store.normalize_vector(embedding)
        
        return normalized_embedding
    except ModelNotAvailableError as e:
        logger.error(f"Text model not available: {str(e)}")
        raise

@app.post("/api/queue", response_model=SongQueueResponse)
async def get_song_queue(request: SongQueueRequest) -> SongQueueResponse:
    """Generate a queue of similar songs based on weighted traits."""
    try:
        # Validate request
        if not request.traits:
            raise HTTPException(status_code=400, detail="No traits provided")
        if request.transition_length < 1:
            raise HTTPException(status_code=400, detail="Invalid transition length")
            
        # Embed each trait and combine with weights
        trait_embeddings = []
        trait_names = []
        
        for trait in request.traits:
            embedding = embed_text(trait.name)
            trait_embeddings.append((embedding, trait.value))
            trait_names.append(trait.name)
        
        # Combine trait embeddings into a single vector
        trait_vector = vector_store.combine_trait_vectors(trait_embeddings)
        
        # Log trait information for debugging
        logger.info(f"Processing queue with {len(trait_names)} traits: {', '.join(trait_names)}")
        
        # Find similar songs
        songs = vector_store.find_similar_songs(
            trait_vector=trait_vector,
            match_count=request.transition_length * 3,  # Fetch extra for filtering
            match_threshold=0.5,
            exclude_song_id=request.current_song_id
        )
        
        # Handle edge case of insufficient results
        if len(songs) < request.transition_length:
            # TODO: Implement fallback strategy from section 6 of the plan
            # For now, just return what we have
            logger.warning(f"Found only {len(songs)} songs, fewer than requested {request.transition_length}")
        else:
            # Sort songs by vibeScore in ascending order (lowest to highest)
            # This ensures we get to higher scores over time
            songs.sort(key=lambda song: song.vibeScore)
            
            # Take only the requested number of songs
            songs = songs[:request.transition_length]
        
        return SongQueueResponse(
            songs=songs,
            trait_vector=trait_vector.tolist()
        )
    
    except ModelNotAvailableError as e:
        logger.error(f"Model not available for queue generation: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Model not available: {str(e)}")
    except Exception as e:
        logger.error(f"Error generating song queue: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))