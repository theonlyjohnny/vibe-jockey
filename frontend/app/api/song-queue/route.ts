import { NextResponse } from 'next/server';
import { Trait, TraitValues, QueueSong, SongQueueRequest, SongQueueResponse } from '../../types/song-queue';

type MockSong = {
  id: string;
  title: string;
  artist: string;
  traits: TraitValues;
};

// Mock song data for demonstration
const mockSongs: MockSong[] = [
  { id: 'song1', title: 'Sunlight', artist: 'DJ Summer', traits: { energy: 4, mood: 3, tempo: 4 } },
  { id: 'song2', title: 'Midnight Drive', artist: 'Night Owl', traits: { energy: 2, mood: -1, tempo: 2 } },
  { id: 'song3', title: 'Cosmic Wave', artist: 'Stella Nova', traits: { energy: 3, mood: 4, tempo: 3 } },
  { id: 'song4', title: 'Deep Blue', artist: 'Ocean Floor', traits: { energy: -2, mood: -3, tempo: -2 } },
  { id: 'song5', title: 'Electric Sky', artist: 'Thunderbolt', traits: { energy: 5, mood: 2, tempo: 5 } },
  { id: 'song6', title: 'Gentle Rain', artist: 'Cloud Walker', traits: { energy: -1, mood: 1, tempo: -3 } },
  { id: 'song7', title: 'Urban Jungle', artist: 'City Beat', traits: { energy: 3, mood: -2, tempo: 4 } },
  { id: 'song8', title: 'Tranquil Mind', artist: 'Zen Master', traits: { energy: -4, mood: 2, tempo: -4 } },
];

export async function POST(request: Request) {
  try {
    const { currentSong, traits, transitionLength } = await request.json() as SongQueueRequest;
    
    // Validate input
    if (!currentSong || !traits || !transitionLength) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Generate a theoretical queue based on requested traits
    // For now, this just returns random songs with fake trait values
    const queueLength = Math.min(transitionLength, 5); // Cap at 5 songs for demo
    const queue: QueueSong[] = [];
    
    // Get random songs excluding the current one
    const availableSongs = mockSongs.filter(song => song.id !== currentSong);
    
    for (let i = 0; i < queueLength; i++) {
      const randomIndex = Math.floor(Math.random() * availableSongs.length);
      const selectedSong = availableSongs[randomIndex];
      
      // Create a response object for each song in the queue
      const songInQueue: QueueSong = {
        songID: selectedSong.id,
        traitValues: {}
      };
      
      // Add requested trait values
      traits.forEach((trait: Trait) => {
        // Use the song's trait value if it exists, otherwise generate a random value between -5 and 5
        const traitValue = selectedSong.traits[trait.name] !== undefined 
          ? selectedSong.traits[trait.name] 
          : Math.floor(Math.random() * 11) - 5;
        
        songInQueue.traitValues[trait.name] = traitValue;
      });
      
      queue.push(songInQueue);
      
      // Remove the selected song to avoid duplicates
      availableSongs.splice(randomIndex, 1);
      
      // Break if we run out of songs
      if (availableSongs.length === 0) break;
    }

    const response: SongQueueResponse = { queue };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating song queue:', error);
    return NextResponse.json(
      { error: 'Failed to generate song queue' },
      { status: 500 }
    );
  }
} 