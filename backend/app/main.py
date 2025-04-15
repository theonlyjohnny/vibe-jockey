import uvicorn
import os
import logging
from .api import app

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def start_server():
    """Start the FastAPI server."""
    if os.getenv("PORT"):
        port = int(os.getenv("PORT"))
    else:
        port = 8000
    
    # Start the server
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__main__":
    start_server() 