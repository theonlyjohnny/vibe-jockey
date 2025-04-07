import torch
import numpy as np
from transformers import ClapModel, ClapProcessor
import librosa

# Set device to CPU
device = torch.device("cpu")
print("Using CPU")

# Load the model and processor
model = ClapModel.from_pretrained("laion/larger_clap_music_and_speech").to(device)
processor = ClapProcessor.from_pretrained("laion/larger_clap_music_and_speech")


def encode_audio(audio_file_path):
    # Load your audio file
    audio_array, sampling_rate = librosa.load(audio_file_path, sr=48000)  # CLAP expects 48kHz

    # Process the audio and get embeddings
    inputs = processor(audios=audio_array, return_tensors="pt")
    # Move inputs to the same device as the model
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    # Extract features
    with torch.no_grad():
        audio_embeddings = model.get_audio_features(**inputs)

    # Convert to numpy if needed
    audio_embeddings_np = audio_embeddings.detach().cpu().numpy()

    return audio_embeddings_np


# if __name__ == "__main__":
#     audio_file_path = "./test_audio.wav"
#     audio_embeddings = encode_audio(audio_file_path)
#     print(audio_embeddings)
