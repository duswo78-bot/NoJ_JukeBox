'use client'

import { motion } from 'framer-motion'
import { Heart, Tag, Clock } from 'lucide-react'

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

interface MetadataPanelProps {
  track: Track
}

export default function MetadataPanel({ track }: MetadataPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-neon-pink" />
        <h3 className="text-lg font-bold text-white">Track Info</h3>
      </div>

      {/* Metadata */}
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-surface/50 rounded-lg">
          <span className="text-sm text-gray-400">BPM</span>
          <span className="text-lg font-bold text-neon-cyan">{track.bpm}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-surface/50 rounded-lg">
          <span className="text-sm text-gray-400">Genre</span>
          <span className="text-sm font-medium text-white">{track.genre}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-surface/50 rounded-lg">
          <span className="text-sm text-gray-400">Mood</span>
          <span className="text-sm font-medium text-white">{track.mood}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-surface/50 rounded-lg">
          <span className="text-sm text-gray-400">Type</span>
          <span className="text-sm font-medium text-white uppercase">{track.type}</span>
        </div>
      </div>

      {/* Mood Tags */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-neon-purple" />
          <h4 className="text-sm font-semibold text-gray-400">Tags</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {track.mood.split('/').map((tag, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="text-xs px-3 py-1 bg-gradient-to-r from-neon-purple/20 to-neon-cyan/20 text-neon-cyan rounded-full border border-neon-purple/30"
            >
              #{tag.trim()}
            </motion.span>
          ))}
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs px-3 py-1 bg-gradient-to-r from-neon-pink/20 to-neon-orange/20 text-neon-pink rounded-full border border-neon-pink/30"
          >
            #{track.genre.toLowerCase()}
          </motion.span>
        </div>
      </div>

      {/* Lyrics */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-neon-cyan" />
          <h4 className="text-sm font-semibold text-gray-400">Lyrics</h4>
        </div>
        <div className="bg-surface/50 rounded-lg p-4 max-h-48 overflow-y-auto">
          <div className="space-y-2">
            {track.lyrics.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="text-sm text-gray-300 leading-relaxed"
              >
                {line}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
