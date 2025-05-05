import os
import logging
import torch
from transformers import ClapModel, ClapProcessor

# Set up logging
logger = logging.getLogger(__name__)

# Initialize variables for lazy loading
model = None
processor = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class ModelNotAvailableError(Exception):
    """Raised when the required model is not available."""
    pass

def load_model():
    """
    Centralized function to load the CLAP model and processor.
    Uses a cached model if already loaded, otherwise attempts to load from disk.
    
    Returns:
        tuple: (model, processor) - The loaded CLAP model and processor
        
    Raises:
        ModelNotAvailableError: If the model could not be loaded
    """
    global model, processor, device
    
    # Return cached model if already loaded
    if model is not None and processor is not None:
        return model, processor
    
    try:
        # Get project root directory
        module_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(os.path.dirname(module_dir))
        model_path = os.path.join(backend_dir, "model_cache/larger_clap")
        
        # Check for model in absolute Docker path first
        docker_model_path = "/app/model_cache/larger_clap"
        
        # Try Docker path first (this should work since we preload in Dockerfile)
        if os.path.exists(docker_model_path) and os.path.isfile(os.path.join(docker_model_path, "config.json")):
            try:
                logger.info(f"Loading CLAP model from Docker path: {docker_model_path}")
                model = ClapModel.from_pretrained(docker_model_path, local_files_only=True).to(device)
                processor = ClapProcessor.from_pretrained(docker_model_path, local_files_only=True)
                logger.info("Successfully loaded model from Docker path")
                return model, processor
            except Exception as local_e:
                logger.warning(f"Failed to load from Docker path: {local_e}, trying relative path")
        
        # Next, try the relative path
        if os.path.exists(model_path) and os.path.isfile(os.path.join(model_path, "config.json")):
            try:
                logger.info(f"Loading CLAP model from relative path: {model_path}")
                model = ClapModel.from_pretrained(model_path, local_files_only=True).to(device)
                processor = ClapProcessor.from_pretrained(model_path, local_files_only=True)
                logger.info("Successfully loaded model from relative path")
                return model, processor
            except Exception as local_e:
                logger.warning(f"Failed to load from relative path: {local_e}, falling back to HF download")
        
        # If we reach here, attempt to download from Hugging Face as a last resort
        logger.info("Local model not found or failed to load, attempting to download model")
        
        # Disable SSL verification if needed (might help with connection issues)
        os.environ["HF_HUB_DISABLE_SSL_VERIFICATION"] = "1"
        
        try:
            model = ClapModel.from_pretrained("laion/larger_clap_music_and_speech").to(device)
            processor = ClapProcessor.from_pretrained("laion/larger_clap_music_and_speech")
            
            # Save model for future use
            save_dir = model_path if os.access(os.path.dirname(model_path), os.W_OK) else docker_model_path
            if not os.path.exists(save_dir):
                os.makedirs(save_dir, exist_ok=True)
                
            logger.info(f"Saving model to {save_dir} for future use")
            model.save_pretrained(save_dir)
            processor.save_pretrained(save_dir)
            
            return model, processor
        except Exception as hf_e:
            # If Hugging Face download also fails, raise error
            logger.warning(f"HF download failed: {hf_e}")
            raise ModelNotAvailableError(f"Failed to load model via all methods: {hf_e}")
        
    except Exception as e:
        logger.error(f"Failed to initialize CLAP model: {e}")
        raise ModelNotAvailableError(f"CLAP model could not be loaded: {e}") 