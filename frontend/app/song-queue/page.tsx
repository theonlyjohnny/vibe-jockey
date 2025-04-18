"use client";

import { useState } from 'react';
import { Trait, QueueSong, SongQueueRequest, SongQueueResponse } from '../types/song-queue';

export default function SongQueuePage() {
  const [currentSong, setCurrentSong] = useState('song1');
  const [transitionLength, setTransitionLength] = useState(3);
  const [traits, setTraits] = useState<Trait[]>([
    { name: 'energy', value: 3 },
    { name: 'mood', value: 2 },
    { name: 'tempo', value: 4 }
  ]);
  const [queueResult, setQueueResult] = useState<QueueSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handler for trait value change
  const handleTraitChange = (index: number, value: number) => {
    const updatedTraits = [...traits];
    updatedTraits[index].value = Math.max(-5, Math.min(5, value));
    setTraits(updatedTraits);
  };

  // Function to generate queue
  const generateQueue = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/song-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSong,
          traits,
          transitionLength
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate queue');
      }

      const data = await response.json();
      setQueueResult(data.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 text-gray-800">
      <h1 className="text-2xl font-bold mb-6">Song Queue Generator</h1>
      
      <div className="mb-6">
        <label className="block mb-2 font-medium">Current Song</label>
        <select 
          value={currentSong} 
          onChange={(e) => setCurrentSong(e.target.value)}
          className="p-2 border rounded w-full max-w-md text-gray-800"
        >
          <option value="song1">Sunlight - DJ Summer</option>
          <option value="song2">Midnight Drive - Night Owl</option>
          <option value="song3">Cosmic Wave - Stella Nova</option>
          <option value="song4">Deep Blue - Ocean Floor</option>
          <option value="song5">Electric Sky - Thunderbolt</option>
        </select>
      </div>

      <div className="mb-6">
        <label className="block mb-2 font-medium">Transition Length</label>
        <input 
          type="number" 
          min="1" 
          max="5"
          value={transitionLength} 
          onChange={(e) => setTransitionLength(Number(e.target.value))}
          className="p-2 border rounded w-32 text-gray-800"
        />
      </div>

      <div className="mb-6">
        <label className="block mb-2 font-medium">Traits</label>
        {traits.map((trait, index) => (
          <div key={trait.name} className="flex items-center mb-2">
            <span className="w-24">{trait.name}</span>
            <input 
              type="range" 
              min="-5" 
              max="5"
              value={trait.value} 
              onChange={(e) => handleTraitChange(index, Number(e.target.value))}
              className="mx-2"
            />
            <span className="w-8 text-center">{trait.value}</span>
          </div>
        ))}
      </div>

      <button 
        onClick={generateQueue}
        disabled={isLoading}
        className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
      >
        {isLoading ? 'Generating...' : 'Generate Queue'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {queueResult.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4">Generated Queue</h2>
          <div className="bg-gray-100 p-4 rounded">
            {queueResult.map((song, index) => (
              <div key={index} className="mb-3 pb-3 border-b last:border-b-0">
                <div className="font-medium">Song ID: {song.songID}</div>
                <div className="mt-1">
                  <span className="font-medium">Traits:</span>
                  <ul className="ml-4 mt-1">
                    {Object.entries(song.traitValues).map(([name, value]) => (
                      <li key={name}>{name}: {value}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 