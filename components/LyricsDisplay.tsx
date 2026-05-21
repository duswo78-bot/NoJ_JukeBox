'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef } from 'react'

interface LyricsDisplayProps {
  lyrics: string[]
  currentTime: number
  duration: number
  isPlaying: boolean
}

export default function LyricsDisplay({ lyrics, currentTime, duration, isPlaying }: LyricsDisplayProps) {
  const activeIdx = Math.min(
    Math.floor((currentTime / Math.max(duration, 1)) * lyrics.length),
    lyrics.length - 1
  )
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const active = el.querySelector(`[data-lyric="${activeIdx}"]`) as HTMLElement
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto space-y-1 px-1 pb-4"
      style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)' }}
    >
      {lyrics.map((line, i) => {
        const isActive = i === activeIdx
        const isPast   = i < activeIdx

        return (
          <motion.div
            key={i}
            data-lyric={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="py-2 px-3 rounded-lg transition-all duration-500 text-center"
            style={{
              fontSize:   isActive ? '15px' : '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive
                ? '#00E5FF'
                : isPast
                ? 'rgba(255,255,255,0.25)'
                : 'rgba(255,255,255,0.5)',
              background: isActive ? 'rgba(0,229,255,0.08)' : 'transparent',
              textShadow: isActive ? '0 0 20px rgba(0,229,255,0.6)' : 'none',
              borderLeft: isActive ? '2px solid #00E5FF' : '2px solid transparent',
              transform: isActive ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            {line}
          </motion.div>
        )
      })}

      {lyrics.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 gap-3">
          <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px' }}>♪</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>No lyrics available</p>
        </div>
      )}
    </div>
  )
}
