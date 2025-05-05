// Song queue related types
export type Trait = {
  name: string;
  value: number;
};

export type QueueSong = {
  songID: string;
  vibeScore: number;
  previewURL?: string;
  title?: string;
  artist?: string;
  similarity?: number;
};

export type SongQueueRequest = {
  currentSong: string;
  traits: Trait[];
  transitionLength: number;
};

export type SongQueueResponse = {
  queue: QueueSong[];
}; 