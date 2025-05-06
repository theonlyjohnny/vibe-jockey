'use client';

import { Song } from '../../types/song-queue';

interface QueueDisplayProps {
  queue: Song[];
  transitionLength: number;
}

export default function QueueDisplay({ queue, transitionLength }: QueueDisplayProps) {
  // Only show up to 5 songs
  const displayQueue = queue.slice(0, 5);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {displayQueue.map((song, index) => (
        <div
          key={song.songID}
          className="bg-gray-800 p-4 rounded-lg shadow-lg"
          style={{
            animation: `fadeIn 0.5s ease-in-out ${index * 0.5}s forwards`,
            opacity: 0
          }}
        >
          <h3 className="text-lg font-semibold">{song.title}</h3>
          <p className="text-gray-400">{song.artist}</p>
          <div className="mt-2 flex justify-between text-sm">
            <span>Vibe Score: {Math.round(song.vibeScore * 100)}%</span>
            <span>Similarity: {Math.round(song.similarity * 100)}%</span>
          </div>
          {song.previewURL && (
            <audio controls className="w-full mt-2">
              <source src={song.previewURL} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          )}
        </div>
      ))}
    </div>
  );
} 