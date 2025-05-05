"use client";

import { useState } from 'react';
import { Trait, QueueSong, SongQueueRequest, SongQueueResponse } from '../types/song-queue';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';

export default function SongQueuePage() {
  const [currentSong, setCurrentSong] = useState('song1');
  const [transitionLength, setTransitionLength] = useState(3);
  const [traits, setTraits] = useState<Trait[]>([
    { name: 'energy', value: 60 },
    { name: 'mood', value: 50 },
    { name: 'tempo', value: 70 }
  ]);
  const [queueResult, setQueueResult] = useState<QueueSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handler for trait value change
  const handleTraitChange = (index: number, value: number) => {
    const updatedTraits = [...traits];
    updatedTraits[index].value = Math.max(1, Math.min(100, value));
    setTraits(updatedTraits);
  };

  // Function to generate queue
  const generateQueue = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Convert trait values from 1-100 to 0.1-1.0 range
      const normalizedTraits = traits.map(trait => ({
        name: trait.name,
        value: 0.1 + (trait.value - 1) * (0.9 / 99) // Maps 1-100 to 0.1-1.0 precisely
      }));
      
      const response = await fetch('/api/song-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSong,
          traits: normalizedTraits,
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

  // Prepare data for the chart
  const prepareChartData = () => {
    if (!queueResult.length) return [];
    
    // Start with the current song at index 0
    return queueResult.map((song, index) => {
      return {
        name: song.title || song.songID,
        songIndex: index + 1, // +1 because we're starting from 1 on x-axis
        vibeScore: song.vibeScore || 0,
      };
    });
  };
  
  // Calculate min and max for better scaling
  const calculateYAxisDomain = () => {
    if (!queueResult.length) return [0, 1];
    
    let min = 1;
    let max = 0;
    
    // Find min and max across all vibeScores
    queueResult.forEach(song => {
      min = Math.min(min, song.vibeScore);
      max = Math.max(max, song.vibeScore);
    });
    
    // Add padding to make the visualization clearer (10% padding)
    const padding = (max - min) * 0.1;
    
    // If the range is very small (less than 0.05), expand it to make differences more visible
    if (max - min < 0.05) {
      const midpoint = (max + min) / 2;
      min = Math.max(0, midpoint - 0.05);
      max = Math.min(1, midpoint + 0.05);
      return [min, max];
    }
    
    return [
      Math.max(0, min - padding), // Don't go below 0
      Math.min(1, max + padding)  // Don't go above 1
    ];
  };
  
  // Calculate average vibe score
  const calculateAverage = () => {
    if (!queueResult.length) return 0;
    
    const sum = queueResult.reduce((acc, song) => acc + song.vibeScore, 0);
    return sum / queueResult.length;
  };

  // Generate random colors for chart lines
  const getLineColor = () => {
    return '#8884d8';
  };

  const chartData = prepareChartData();
  const yAxisDomain = calculateYAxisDomain();
  const averageVibeScore = calculateAverage();

  // Calculate differences between consecutive songs
  const calculateDifferences = () => {
    if (queueResult.length < 2) return [];
    
    const differences = [];
    
    for (let i = 1; i < queueResult.length; i++) {
      const currentSong = queueResult[i];
      const previousSong = queueResult[i-1];
      
      differences.push({
        songName: currentSong.title || currentSong.songID,
        vibeScoreDiff: currentSong.vibeScore - previousSong.vibeScore
      });
    }
    
    return differences;
  };
  
  const songDifferences = calculateDifferences();

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
          <option value="2_guys_n_the_parque_simp_squirrels_in_my_pants">2 Guys N The Parque - Simp Squirrels In My Pants</option>
          <option value="311_amber">311 - Amber</option>
          <option value="80purppp_hex">80purppp - Hex</option>
          <option value="adventure_time_im_just_your_problem_feat_olivia_olson">Adventure Time - Im Just Your Problem (feat. Olivia Olson)</option>
          <option value="ajr_100_bad_days">AJR - 100 Bad Days</option>
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
              min="1" 
              max="100"
              value={trait.value} 
              onChange={(e) => handleTraitChange(index, Number(e.target.value))}
              className="mx-2"
            />
            <span className="w-12 text-center">{trait.value}</span>
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
          
          {/* Chart visualization */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Vibe Score Progression Chart</h3>
            <div className="bg-white p-4 rounded shadow" style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" label={{ value: 'Song Position', position: 'insideBottomRight', offset: -10 }} />
                  <YAxis 
                    domain={yAxisDomain} 
                    label={{ value: 'Vibe Score', angle: -90, position: 'insideLeft' }}
                    tickFormatter={(value) => value.toFixed(3)}
                  />
                  <Tooltip 
                    formatter={(value: number) => value.toFixed(4)} 
                    labelFormatter={(label) => `Song: ${label}`}
                  />
                  <Legend />
                  
                  {/* Reference area to highlight the value range */}
                  <ReferenceArea
                    y1={yAxisDomain[0]}
                    y2={yAxisDomain[1]}
                    x1={chartData[0]?.name}
                    x2={chartData[chartData.length - 1]?.name}
                    strokeOpacity={0.3}
                    fill="#f9f9f9"
                  />
                  
                  <Line 
                    type="monotone" 
                    dataKey="similarity" 
                    name={`Vibe Score (avg: ${averageVibeScore.toFixed(4)})`}
                    stroke={getLineColor()}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Song list */}
          <div className="bg-gray-100 p-4 rounded">
            {queueResult.map((song, index) => (
              <div key={index} className="mb-3 pb-3 border-b last:border-b-0">
                <div className="font-medium">Song ID: {song.songID}</div>
                {song.title && <div className="text-sm">Title: {song.title}</div>}
                {song.artist && <div className="text-sm">Artist: {song.artist}</div>}
                <div className="mt-1">
                  <span className="font-medium">Vibe Score: </span>
                  {song.vibeScore.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Differences between consecutive songs */}
          {songDifferences.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Vibe Score Changes Between Songs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border">Song</th>
                      <th className="py-2 px-4 border">Vibe Score Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {songDifferences.map((diff, index) => {
                      const isPositive = diff.vibeScoreDiff > 0;
                      const isZero = diff.vibeScoreDiff === 0;
                      return (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="py-2 px-4 border font-medium">{diff.songName}</td>
                          <td 
                            className={`py-2 px-4 border text-right ${
                              isZero ? '' : (isPositive ? 'text-green-600' : 'text-red-600')
                            }`}
                          >
                            {diff.vibeScoreDiff > 0 ? '+' : ''}{diff.vibeScoreDiff.toFixed(6)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 