'use client'

import { motion } from 'framer-motion'

interface CDPlayerProps {
  isPlaying: boolean
  albumArt: string
}

export default function CDPlayer({ isPlaying, albumArt }: CDPlayerProps) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* CD Player base */}
      <div className="absolute w-[90%] h-[90%] bg-gradient-to-br from-gray-900 to-black rounded-2xl shadow-2xl border border-gray-800">
        {/* CD tray */}
        <div className="absolute inset-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center">
          {/* CD */}
          <motion.div
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={{ duration: 1.5, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
            className="relative w-[80%] h-[80%]"
          >
            {/* CD surface with rainbow reflection */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-gray-700 via-gray-500 to-gray-700 shadow-2xl">
              {/* Rainbow iridescence effect */}
              <motion.div
                animate={{
                  backgroundPosition: isPlaying ? ['0% 50%', '100% 50%', '0% 50%'] : '0% 50%'
                }}
                transition={{ duration: 3, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
                className="absolute inset-0 rounded-full opacity-60"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,0,110,0.3), rgba(0,245,255,0.3), rgba(139,92,246,0.3), transparent)',
                  backgroundSize: '200% 100%'
                }}
              />
              
              {/* CD data tracks */}
              <div className="absolute inset-0 rounded-full opacity-40">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 rounded-full border border-gray-400"
                    style={{
                      width: `${100 - (i + 1) * 12}%`,
                      height: `${100 - (i + 1) * 12}%`,
                      top: `${(i + 1) * 6}%`,
                      left: `${(i + 1) * 6}%`
                    }}
                  />
                ))}
              </div>

              {/* Center hole */}
              <div className="absolute inset-[42%] bg-gray-900 rounded-full shadow-inner" />
              
              {/* Album art on CD */}
              <div className="absolute inset-[45%] bg-gradient-to-br from-neon-cyan to-neon-purple rounded-full flex items-center justify-center shadow-lg">
                <span className="text-[8px] font-bold text-white text-center leading-tight">
                  {albumArt}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* LED indicator */}
      <motion.div
        animate={{ opacity: isPlaying ? 1 : 0.3 }}
        className="absolute bottom-8 right-8 w-3 h-3 bg-neon-cyan rounded-full shadow-lg shadow-neon-cyan/50"
      />
    </div>
  )
}
