from pydantic import BaseModel
from typing import Dict, Any, Optional

class TrackRequest(BaseModel):
    audio_url: str
    id: str
    metadata: Optional[Dict[str, Any]] = {} 