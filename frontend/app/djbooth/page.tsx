'use client';

import { useState } from 'react';
import QueueDrawer from './components/QueueDrawer';
import QueueDisplay from './components/QueueDisplay';
import { Song } from '../types/song-queue';

export default function DJBooth() {
  const [queue, setQueue] = useState<Song[]>([]);
  const [transitionLength, setTransitionLength] = useState<number>(30);

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-8">DJ Booth</h1>
      
      <QueueDisplay 
        queue={queue} 
        transitionLength={transitionLength} 
      />
      
      <QueueDrawer 
        onQueueGenerated={setQueue}
        transitionLength={transitionLength}
        setTransitionLength={setTransitionLength}
      />
    </main>
  );
} 