// Song queue related types
export interface Trait {
  name: string;
  value: number;
}

export interface SongQueueRequest {
  currentSong: string;
  traits: Trait[];
  transitionLength: number;
}

export interface Song {
  songID: string;
  vibeScore: number;
  previewURL: string;
  title: string;
  artist: string;
  similarity: number;
}

export type QueueSong = {
  songID: string;
  vibeScore: number;
  title?: string;
  artist?: string;
  similarity?: number;
};

export type SongQueueResponse = {
  queue: QueueSong[];
}; 