from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends, Header
import logging
import os
from .models import TrackRequest, ProcessUserTracksRequest
from .processor import process_track_with_metadata, process_user_tracks
from fastapi.security.api_key import APIKeyHeader
from fastapi import Security
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

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

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process-track")
async def process_track_endpoint(track_request: TrackRequest, background_tasks: BackgroundTasks, authorized: bool = Depends(get_api_key)):
    try:
        # Process track in background
        background_tasks.add_task(
            process_track_with_metadata,
            track_request.id,
            track_request.audio_url,
            track_request.metadata
        )
        
        return {
            "status": "processing", 
            "message": f"Processing track with ID: {track_request.id}",
            "id": track_request.id
        }
    except Exception as e:
        logger.error(f"Error in API: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-user-tracks")
async def process_user_tracks_endpoint(
    request: ProcessUserTracksRequest,
    background_tasks: BackgroundTasks,
    x_spotify_token: Optional[str] = Header(None),
    authorized: bool = Depends(get_api_key)
):
    try:
        if not x_spotify_token:
            raise HTTPException(status_code=400, detail="X-Spotify-Token header is required")
            
        # Process user tracks in background
        background_tasks.add_task(
            process_user_tracks,
            request.user_id,
            x_spotify_token
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