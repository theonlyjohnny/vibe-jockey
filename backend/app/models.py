from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

class TrackRequest(BaseModel):
    audio_url: str
    id: str
    metadata: Optional[Dict[str, Any]] = {}

class ProcessUserTracksRequest(BaseModel):
    user_id: str

class Trait(BaseModel):
    name: str
    value: float = Field(ge=0, le=1)  # Clamp weights between 0 and 1

class SongQueueRequest(BaseModel):
    current_song_id: Optional[str] = None
    transition_length: int = Field(gt=0)
    traits: List[Trait]

class SongMetadata(BaseModel):
    id: str
    title: str
    artist: str
    similarity: float
    vibeScore: float = 0.0  # Overall alignment with requested vibe (weighted traits)

class SongQueueResponse(BaseModel):
    songs: List[SongMetadata]