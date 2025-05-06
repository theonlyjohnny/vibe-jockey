'use client';

import { useState, useRef } from 'react';
import QueueDrawer from './components/QueueDrawer';
import QueueDisplay from './components/QueueDisplay';
import { Song } from '../types/song-queue';

export default function DJBooth() {
  const [queue, setQueue] = useState<Song[]>([]);
  const [transitionLength, setTransitionLength] = useState<number>(30);
  const [currentTrackId, setCurrentTrackId] = useState<string>('');
  const queueDrawerRef = useRef<{ generateQueue: () => Promise<void> }>(null);

  const handleGenerateQueue = async () => {
    if (queueDrawerRef.current) {
      await queueDrawerRef.current.generateQueue();
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-8">DJ Booth</h1>
      
      <QueueDisplay 
        queue={queue} 
        transitionLength={transitionLength}
        onCurrentTrackChange={setCurrentTrackId}
      />
      
      <QueueDrawer 
        ref={queueDrawerRef}
        onQueueGenerated={setQueue}
        transitionLength={transitionLength}
        setTransitionLength={setTransitionLength}
        currentTrackId={currentTrackId}
      />
    </main>
  );
} 