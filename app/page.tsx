'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, SkipBack, SkipForward, Volume2, List, Settings, Search } from 'lucide-react'
import VinylPlayer from '@/components/VinylPlayer'
import CDPlayer from '@/components/CDPlayer'
import TapePlayer from '@/components/TapePlayer'
import AudioVisualizer from '@/components/AudioVisualizer'
import EQController from '@/components/EQController'
import Playlist from '@/components/Playlist'
import MetadataPanel from '@/components/MetadataPanel'

type MediaType = 'LP' | 'CD' | 'TAPE'

interface Track {
  id: number
  title: string
  artist: string
  type: 'mp3' | 'mp4'
  genre: string
  mood: string
  bpm: number
  mediaPref: MediaType
  duration: number
  lyrics: string[]
}

const mockTracks: Track[] = [
  {
    id: 1,
    title: "Neon Nights",
    artist: "Shine On (샤인온)",
    type: "mp3",
    genre: "City Pop",
    mood: "Retro/Chill",
    bpm: 105,
    mediaPref: "LP",
    duration: 240,
    lyrics: [
      "도시의 불빛이 흐르네",
      "네온 사인 속에 나를 찾아",
      "밤거울을 걷는 이 느낌",
      "추억 속의 멜로디",
      "Neon nights, shining bright",
      "우리의 밤은 계속되네"
    ]
  },
  {
    id: 2,
    title: "Midnight Highway",
    artist: "Unknown",
    type: "mp4",
    genre: "Eurodance",
    mood: "Energetic",
    bpm: 130,
    mediaPref: "CD",
    duration: 210,
    lyrics: [
      "Midnight highway, we ride tonight",
      "Speeding through the city lights",
      "Music pumping, hearts beating fast",
      "This moment's meant to last",
      "Eurodance vibes all night long",
      "Singing our favorite song"
    ]
  }
]

export default function Home() {
  const [currentTrack, setCurrentTrack] = useState<Track>(mockTracks[0])
  const [isPlaying, setIsPlaying] = useState(false)
  const [mediaType, setMediaType] = useState<MediaType>(mockTracks[0].mediaPref)
  const [currentTime, setCurrentTime] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [showEQ, setShowEQ] = useState(false)
  const [volume, setVolume] = useState(75)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (currentTrack.type === 'mp3' && audioRef.current) {
      audioRef.current.volume = volume / 100
    }
  }, [volume])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleTrackChange = (track: Track) => {
    setCurrentTrack(track)
    setMediaType(track.mediaPref)
    setCurrentTime(0)
    setIsPlaying(false)
  }

  const handleMediaTypeChange = (type: MediaType) => {
    setMediaType(type)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background effect */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-surface to-background opacity-50" />
      
      {/* Main container */}
      <div className="relative z-10 flex h-screen">
        {/* Left sidebar - Playlist */}
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: showPlaylist ? 0 : -280, opacity: showPlaylist ? 1 : 0.5 }}
          transition={{ duration: 0.3 }}
          className="w-80 bg-surface/80 backdrop-blur-xl border-r border-neon-purple/20 p-6 flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold neon-text">Library</h2>
            <button
              onClick={() => setShowPlaylist(!showPlaylist)}
              className="p-2 hover:bg-neon-purple/20 rounded-lg transition-colors"
            >
              <List className="w-5 h-5 text-neon-cyan" />
            </button>
          </div>
          <Playlist tracks={mockTracks} currentTrack={currentTrack} onTrackSelect={handleTrackChange} />
        </motion.div>

        {/* Center - Main Player */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-16 bg-surface/50 backdrop-blur-sm border-b border-neon-purple/20 flex items-center justify-between px-8">
            <h1 className="text-2xl font-bold neon-text">AI Jukebox</h1>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-neon-purple/20 rounded-lg transition-colors">
                <Search className="w-5 h-5 text-neon-cyan" />
              </button>
              <button
                onClick={() => setShowEQ(!showEQ)}
                className="p-2 hover:bg-neon-purple/20 rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5 text-neon-cyan" />
              </button>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
            {/* Media Type Toggle */}
            <div className="absolute top-4 right-4 flex gap-2 bg-surface/80 backdrop-blur-sm rounded-full p-1 border border-neon-purple/30">
              {(['LP', 'CD', 'TAPE'] as MediaType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleMediaTypeChange(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    mediaType === type
                      ? 'bg-neon-cyan text-background shadow-lg shadow-neon-cyan/50'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Media Player */}
            <div className="relative w-full max-w-2xl aspect-square mb-8">
              <AnimatePresence mode="wait">
                {currentTrack.type === 'mp3' ? (
                  <>
                    {mediaType === 'LP' && (
                      <VinylPlayer
                        key="lp"
                        isPlaying={isPlaying}
                        albumArt={currentTrack.title}
                      />
                    )}
                    {mediaType === 'CD' && (
                      <CDPlayer
                        key="cd"
                        isPlaying={isPlaying}
                        albumArt={currentTrack.title}
                      />
                    )}
                    {mediaType === 'TAPE' && (
                      <TapePlayer
                        key="tape"
                        isPlaying={isPlaying}
                        progress={currentTime / currentTrack.duration}
                        albumArt={currentTrack.title}
                      />
                    )}
                  </>
                ) : (
                  <motion.div
                    key="video"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl shadow-neon-purple/30"
                  >
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      poster={`https://via.placeholder.com/800x800/1E1E1E/00F5FF?text=${encodeURIComponent(currentTrack.title)}`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Audio Visualizer for MP3 */}
              {currentTrack.type === 'mp3' && (
                <div className="absolute inset-0 pointer-events-none">
                  <AudioVisualizer isPlaying={isPlaying} />
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold mb-2 neon-text">{currentTrack.title}</h2>
              <p className="text-xl text-neon-cyan">{currentTrack.artist}</p>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-2xl mb-6">
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-neon-purple to-neon-cyan"
                  initial={{ width: 0 }}
                  animate={{ width: `${(currentTime / currentTrack.duration) * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6">
              <button className="p-3 hover:bg-neon-purple/20 rounded-full transition-colors">
                <SkipBack className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={handlePlayPause}
                className="p-6 bg-gradient-to-br from-neon-purple to-neon-cyan rounded-full hover:scale-110 transition-transform shadow-lg shadow-neon-purple/50"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-background" />
                ) : (
                  <Play className="w-8 h-8 text-background ml-1" />
                )}
              </button>
              <button className="p-3 hover:bg-neon-purple/20 rounded-full transition-colors">
                <SkipForward className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 mt-6">
              <Volume2 className="w-5 h-5 text-neon-cyan" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-32 accent-neon-cyan"
              />
            </div>
          </div>
        </div>

        {/* Right sidebar - Metadata & EQ */}
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: showEQ ? 0 : 280, opacity: showEQ ? 1 : 0.5 }}
          transition={{ duration: 0.3 }}
          className="w-80 bg-surface/80 backdrop-blur-xl border-l border-neon-purple/20 p-6 flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold neon-text">Controls</h2>
            <button
              onClick={() => setShowEQ(!showEQ)}
              className="p-2 hover:bg-neon-purple/20 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5 text-neon-cyan" />
            </button>
          </div>
          
          <MetadataPanel track={currentTrack} />
          <EQController />
        </motion.div>
      </div>

      {/* Hidden audio element */}
      {currentTrack.type === 'mp3' && (
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
    </div>
  )
}
