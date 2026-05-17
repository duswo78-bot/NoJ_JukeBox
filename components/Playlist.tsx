'use client'

import { motion } from 'framer-motion'
import { Play, Music, Video } from 'lucide-react'

interface Track {
  id: number
  title: string
  artist: string
  type: 'mp3' | 'mp4'
  genre: string
  mood: string
  bpm: number
  mediaPref: 'LP' | 'CD' | 'TAPE'
  duration: number
  lyrics: string[]
}

interface PlaylistProps {
  tracks: Track[]
  currentTrack: Track
  onTrackSelect: (track: Track) => void
}

export default function Playlist({ tracks, currentTrack, onTrackSelect }: PlaylistProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-2 overflow-y-auto flex-1">
      {tracks.map((track, index) => (
        <motion.button
          key={track.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onTrackSelect(track)}
          className={`w-full p-3 rounded-lg text-left transition-all ${
            currentTrack.id === track.id
              ? 'bg-neon-purple/20 border border-neon-purple'
              : 'bg-surface/50 hover:bg-surface border border-transparent'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              currentTrack.id === track.id ? 'bg-neon-cyan' : 'bg-surface'
            }`}>
              {currentTrack.id === track.id && currentTrack.type === 'mp3' ? (
                <Play className="w-5 h-5 text-background" />
              ) : track.type === 'mp3' ? (
                <Music className="w-5 h-5 text-gray-400" />
              ) : (
                <Video className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${
                currentTrack.id === track.id ? 'text-neon-cyan' : 'text-white'
              }`}>
                {track.title}
              </div>
              <div className="text-sm text-gray-400 truncate">{track.artist}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 bg-neon-purple/20 text-neon-purple rounded-full">
                  {track.genre}
                </span>
                <span className="text-xs text-gray-500">{formatTime(track.duration)}</span>
              </div>
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  )
}
