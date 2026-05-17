'use client'

import { motion } from 'framer-motion'

interface TapePlayerProps {
  isPlaying: boolean
  progress: number
  albumArt: string
}

export default function TapePlayer({ isPlaying, progress, albumArt }: TapePlayerProps) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Cassette tape body */}
      <div className="relative w-[85%] h-[60%] bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg shadow-2xl border-2 border-gray-700">
        {/* Tape window */}
        <div className="absolute top-4 left-4 right-4 h-[45%] bg-gradient-to-b from-gray-700 to-gray-800 rounded border border-gray-600">
          {/* Left spindle */}
          <motion.div
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={{ duration: 1, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
            className="absolute left-8 top-1/2 -translate-y-1/2 w-16 h-16"
          >
            <div className="relative w-full h-full">
              {/* Spindle hub */}
              <div className="absolute inset-0 bg-gray-900 rounded-full border-4 border-gray-600" />
              {/* Tape on spindle */}
              <div
                className="absolute inset-2 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full"
                style={{
                  transform: `scale(${1 - progress * 0.3})`
                }}
              />
              {/* Center hole */}
              <div className="absolute inset-[35%] bg-gray-900 rounded-full" />
            </div>
          </motion.div>

          {/* Right spindle */}
          <motion.div
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={{ duration: 1, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
            className="absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16"
          >
            <div className="relative w-full h-full">
              {/* Spindle hub */}
              <div className="absolute inset-0 bg-gray-900 rounded-full border-4 border-gray-600" />
              {/* Tape on spindle */}
              <div
                className="absolute inset-2 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full"
                style={{
                  transform: `scale(${0.7 + progress * 0.3})`
                }}
              />
              {/* Center hole */}
              <div className="absolute inset-[35%] bg-gray-900 rounded-full" />
            </div>
          </motion.div>

          {/* Tape path between spindles */}
          <div className="absolute left-24 right-24 top-1/2 -translate-y-1/2 h-8 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 rounded" />
        </div>

        {/* Label area */}
        <div className="absolute bottom-4 left-4 right-4 h-[35%] bg-gradient-to-br from-neon-purple to-neon-pink rounded flex flex-col items-center justify-center p-4">
          <div className="text-sm font-bold text-white text-center mb-1">{albumArt}</div>
          <div className="text-[10px] text-white/80 text-center">AI Jukebox</div>
          
          {/* Tape brand indicator */}
          <div className="absolute bottom-2 right-2 text-[8px] text-white/60">HI-FI</div>
        </div>

        {/* Screw heads */}
        <div className="absolute top-2 left-2 w-2 h-2 bg-gray-600 rounded-full" />
        <div className="absolute top-2 right-2 w-2 h-2 bg-gray-600 rounded-full" />
        <div className="absolute bottom-2 left-2 w-2 h-2 bg-gray-600 rounded-full" />
        <div className="absolute bottom-2 right-2 w-2 h-2 bg-gray-600 rounded-full" />

        {/* Write protection tab */}
        <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-6 bg-gray-600 rounded-l" />
      </div>
    </div>
  )
}
