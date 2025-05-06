'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { SongQueueRequest, Song, Trait } from '../../types/song-queue';

interface QueueDrawerProps {
  onQueueGenerated: (queue: Song[]) => void;
  transitionLength: number;
  setTransitionLength: (length: number) => void;
  currentTrackId?: string;
}

export interface QueueDrawerRef {
  generateQueue: () => Promise<void>;
}

const QueueDrawer = forwardRef<QueueDrawerRef, QueueDrawerProps>((props, ref) => {
  const { onQueueGenerated, transitionLength, setTransitionLength, currentTrackId } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [traits, setTraits] = useState([
    { name: 'energy', value: 0.5 },
    { name: 'danceability', value: 0.5 },
    { name: 'valence', value: 0.5 }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [editingTraitIndex, setEditingTraitIndex] = useState<number | null>(null);
  const [editingTraitName, setEditingTraitName] = useState('');

  const generateQueue = async () => {
    if (!currentTrackId) {
      setError('No track is currently playing');
      return;
    }

    try {
      setError(null);
      const requestData: SongQueueRequest = {
        currentSong: currentTrackId,
        traits,
        transitionLength: Math.floor(transitionLength)
      };

      console.log('Sending request with data:', requestData);

      const response = await fetch('/api/song-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const responseText = await response.text();
      console.log('Raw API response:', responseText);

      if (!response.ok) {
        throw new Error(`Failed to generate queue: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        throw new Error('Invalid JSON response from server');
      }

      console.log('Parsed queue data:', data);
      
      if (!data.queue || !Array.isArray(data.queue)) {
        console.error('Invalid queue data received:', data);
        throw new Error('Invalid queue data received');
      }

      console.log('Queue length:', data.queue.length);
      onQueueGenerated(data.queue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error generating queue:', error);
      setError(errorMessage);
    }
  };

  const handleTraitEdit = (index: number) => {
    setEditingTraitIndex(index);
    setEditingTraitName(traits[index].name);
  };

  const handleTraitSave = (index: number) => {
    if (editingTraitName.trim()) {
      const newTraits = [...traits];
      newTraits[index] = { ...newTraits[index], name: editingTraitName.trim() };
      setTraits(newTraits);
    }
    setEditingTraitIndex(null);
  };

  const handleTraitKeyPress = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      handleTraitSave(index);
    } else if (e.key === 'Escape') {
      setEditingTraitIndex(null);
    }
  };

  useImperativeHandle(ref, () => ({
    generateQueue
  }));

  return (
    <div className={`fixed bottom-0 right-0 w-96 bg-gray-800 p-6 rounded-tl-lg shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-0 left-0 w-full h-12 bg-gray-700 rounded-tl-lg flex items-center justify-center"
      >
        {isOpen ? '▼' : '▲'} Queue Generator
      </button>

      <div className="mt-12 space-y-4">
        {error && (
          <div className="p-3 bg-red-900/50 text-red-200 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Current Song</label>
          <div className="px-3 py-2 bg-gray-700 rounded text-gray-300">
            {currentTrackId ? `Playing: ${currentTrackId}` : 'No track playing'}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Number of Songs</label>
          <input
            type="number"
            min="1"
            max="20"
            value={transitionLength}
            onChange={(e) => setTransitionLength(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="w-full px-3 py-2 bg-gray-700 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Traits</label>
          {traits.map((trait, index) => (
            <div key={trait.name} className="mb-2">
              <div className="flex items-center gap-2 mb-1">
                {editingTraitIndex === index ? (
                  <input
                    type="text"
                    value={editingTraitName}
                    onChange={(e) => setEditingTraitName(e.target.value)}
                    onKeyDown={(e) => handleTraitKeyPress(e, index)}
                    onBlur={() => handleTraitSave(index)}
                    className="flex-1 px-2 py-1 bg-gray-700 rounded text-sm"
                    autoFocus
                  />
                ) : (
                  <>
                    <label className="block text-xs flex-1">{trait.name}</label>
                    <button
                      onClick={() => handleTraitEdit(index)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
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
          disabled={!currentTrackId}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50"
        >
          Generate Queue
        </button>
      </div>
    </div>
  );
});

QueueDrawer.displayName = 'QueueDrawer';

export default QueueDrawer; 