// Song queue related types
export type Trait = {
  name: string;
  value: number;
};

export type TraitValues = {
  [key: string]: number;
};

export type QueueSong = {
  songID: string;
  traitValues: TraitValues;
};

export type SongQueueRequest = {
  currentSong: string;
  traits: Trait[];
  transitionLength: number;
};

export type SongQueueResponse = {
  queue: QueueSong[];
}; 