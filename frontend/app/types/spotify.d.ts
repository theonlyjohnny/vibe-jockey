interface Window {
  Spotify: {
    Player: new (options: {
      name: string;
      getOAuthToken: (callback: (token: string) => void) => void;
      volume: number;
    }) => Spotify.Player;
  };
  onSpotifyWebPlaybackSDKReady: () => void;
}

declare namespace Spotify {
  interface Player {
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(eventName: string, callback: (state: any) => void): void;
    setVolume(volume: number): Promise<void>;
    togglePlay(): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
  }

  interface Album {
    images: { url: string }[];
    name: string;
  }

  interface Artist {
    name: string;
  }

  interface Track {
    album: Album;
    artists: Artist[];
    name: string;
  }
} 