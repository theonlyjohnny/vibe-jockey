#!/usr/bin/env python3
"""
Production entry point for the audio processing API server
"""
import os
import multiprocessing

# Calculate workers based on CPU cores
workers = multiprocessing.cpu_count() * 2 + 1

# Get port from environment or use default
port = int(os.getenv("PORT", "8000"))

# Import this after setting number of workers
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