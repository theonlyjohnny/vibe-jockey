from fastapi import FastAPI, HTTPException, BackgroundTasks
import logging
import os
from .models import TrackRequest
from .processor import process_track_with_metadata

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Processing API")

@app.post("/process-track")
async def process_track_endpoint(track_request: TrackRequest, background_tasks: BackgroundTasks):
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

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"} 