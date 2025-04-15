#!/usr/bin/env python3
"""
Production entry point for the audio processing API server
"""
import os
import multiprocessing

# Limit OpenBLAS threads to avoid resource issues
# This prevents numerical libraries from spawning too many threads per worker
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

# Get the number of available CPU cores
available_cores = multiprocessing.cpu_count()

# Calculate optimal workers: instead of 2n+1, use a more conservative approach
# For ML workloads, better to have fewer workers with more resources per worker
if available_cores <= 2:
    # For small machines, just use available cores
    workers = available_cores
else:
    # For larger machines, leave some capacity for numerical operations
    # Using n or n-1 workers is often better for ML workloads
    workers = max(1, available_cores - 1)

# Get port from environment or use default
port = int(os.getenv("PORT", "8000"))

# Import this after setting environment variables
import uvicorn

if __name__ == "__main__":
    # Start with production settings
    uvicorn.run(
        "app.api:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        log_level="info",
        proxy_headers=True,
        access_log=True,
        forwarded_allow_ips="*"
    ) 