#!/usr/bin/env python3
"""
Entry point for running the audio processing API server
"""
import os

# Limit OpenBLAS threads to avoid resource issues
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

from app.main import start_server

if __name__ == "__main__":
    start_server() 