'use client';

import { useState } from 'react';
import { SongQueueRequest, Song } from '../../types/song-queue';

interface QueueDrawerProps {
  onQueueGenerated: (queue: Song[]) => void;
  transitionLength: number;
  setTransitionLength: (length: number) => void;
}

export default function QueueDrawer({ 
  onQueueGenerated, 
  transitionLength, 
  setTransitionLength 
}: QueueDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSong, setCurrentSong] = useState('');
  const [traits, setTraits] = useState([
    { name: 'energy', value: 0.5 },
    { name: 'danceability', value: 0.5 },
    { name: 'valence', value: 0.5 }
  ]);

  const generateQueue = async () => {
    try {
      const requestData: SongQueueRequest = {
        currentSong,
        traits,
        transitionLength
      };

      const response = await fetch('/api/song-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate queue');
      }

      const data = await response.json();
      onQueueGenerated(data.queue);
    } catch (error) {
      console.error('Error generating queue:', error);
    }
  };

  return (
    <div className={`fixed bottom-0 right-0 w-96 bg-gray-800 p-6 rounded-tl-lg shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-0 left-0 w-full h-12 bg-gray-700 rounded-tl-lg flex items-center justify-center"
      >
        {isOpen ? '▼' : '▲'} Queue Generator
      </button>

      <div className="mt-12 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Current Song ID</label>
          <input
            type="text"
            value={currentSong}
            onChange={(e) => setCurrentSong(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Transition Length (seconds)</label>
          <input
            type="number"
            value={transitionLength}
            onChange={(e) => setTransitionLength(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Traits</label>
          {traits.map((trait, index) => (
            <div key={trait.name} className="mb-2">
              <label className="block text-xs mb-1">{trait.name}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={trait.value}
                onChange={(e) => {
                  const newTraits = [...traits];
                  newTraits[index].value = parseFloat(e.target.value);
                  setTraits(newTraits);
                }}
                className="w-full"
              />
            </div>
          ))}
        </div>

        <button
          onClick={generateQueue}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
        >
          Generate Queue
        </button>
      </div>
    </div>
  );
} 