'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

interface VinylPlayerProps {
  isPlaying: boolean
  albumArt: string
}

export default function VinylPlayer({ isPlaying, albumArt }: VinylPlayerProps) {
  const [tonearmPosition, setTonearmPosition] = useState('rest')

  useEffect(() => {
    if (isPlaying) {
      setTonearmPosition('playing')
    } else {
      setTonearmPosition('rest')
    }
  }, [isPlaying])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Turntable base */}
      <div className="absolute w-[90%] h-[90%] bg-gradient-to-br from-gray-900 to-gray-800 rounded-full shadow-2xl border-4 border-gray-700">
        {/* Platter */}
        <div className="absolute inset-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full">
          {/* Vinyl record */}
          <motion.div
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={{ duration: 2, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
            className="absolute inset-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-full shadow-xl"
          >
            {/* Vinyl grooves effect */}
            <div className="absolute inset-0 rounded-full opacity-30">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-0 rounded-full border border-gray-600"
                  style={{
                    width: `${100 - (i + 1) * 10}%`,
                    height: `${100 - (i + 1) * 10}%`,
                    top: `${(i + 1) * 5}%`,
                    left: `${(i + 1) * 5}%`
                  }}
                />
              ))}
            </div>

            {/* Label */}
            <div className="absolute inset-[35%] bg-gradient-to-br from-neon-purple to-neon-pink rounded-full flex items-center justify-center shadow-lg">
              <div className="text-center">
                <div className="text-xs font-bold text-white mb-1">{albumArt}</div>
                <div className="w-3 h-3 bg-black rounded-full mx-auto" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Tonearm */}
      <motion.div
        animate={{
          rotate: tonearmPosition === 'playing' ? 25 : 0,
          x: tonearmPosition === 'playing' ? 20 : 0
        }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="absolute right-[5%] top-[10%] w-32 h-2 origin-right"
      >
        <div className="w-full h-full bg-gradient-to-r from-gray-400 to-gray-600 rounded-full shadow-lg" />
        {/* Tonearm head */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-6 h-8 bg-gradient-to-b from-gray-500 to-gray-700 rounded-lg shadow-lg" />
        {/* Pivot point */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-600 rounded-full border-2 border-gray-500" />
      </motion.div>

      {/* Center spindle */}
      <div className="absolute w-4 h-4 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full shadow-lg z-10" />
    </div>
  )
}
