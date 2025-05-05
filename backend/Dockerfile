FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    OMP_NUM_THREADS=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    git \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create model cache directories
RUN mkdir -p /app/model_cache/larger_clap \
    /app/model_cache/clap-htsat

# Download CLAP model files
RUN curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/config.json -o /app/model_cache/larger_clap/config.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/preprocessor_config.json -o /app/model_cache/larger_clap/preprocessor_config.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/pytorch_model.bin -o /app/model_cache/larger_clap/pytorch_model.bin && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/special_tokens_map.json -o /app/model_cache/larger_clap/special_tokens_map.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/tokenizer.json -o /app/model_cache/larger_clap/tokenizer.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/tokenizer_config.json -o /app/model_cache/larger_clap/tokenizer_config.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/vocab.json -o /app/model_cache/larger_clap/vocab.json && \
    curl -L https://huggingface.co/laion/larger_clap_music_and_speech/resolve/main/merges.txt -o /app/model_cache/larger_clap/merges.txt

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Run the application
CMD ["python", "run_production.py"] 