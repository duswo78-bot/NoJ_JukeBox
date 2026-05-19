'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Play, Music2, Video, Clock } from 'lucide-react'

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
  src?: string
}

interface PlaylistProps {
  tracks: Track[]
  currentTrack: Track
  onTrackSelect: (track: Track) => void
}

const GENRE_COLORS: Record<string, string> = {
  'City Pop':  'rgba(123,47,255,0.3)',
  'Eurodance': 'rgba(0,229,255,0.25)',
  'Lo-Fi':     'rgba(255,176,32,0.25)',
  'Hip-Hop':   'rgba(255,0,110,0.25)',
  'Jazz':      'rgba(0,255,136,0.25)',
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function Playlist({ tracks, currentTrack, onTrackSelect }: PlaylistProps) {
  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-4">
      <AnimatePresence>
        {tracks.map((track, idx) => {
          const active = track.id === currentTrack.id
          const genreColor = GENRE_COLORS[track.genre] || 'rgba(123,47,255,0.25)'

          return (
            <motion.button
              key={track.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.35 }}
              onClick={() => onTrackSelect(track)}
              className="w-full text-left rounded-xl p-3 transition-all duration-300 relative overflow-hidden"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(123,47,255,0.25), rgba(0,229,255,0.12))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(123,47,255,0.5)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: active ? '0 0 16px rgba(123,47,255,0.2), inset 0 0 20px rgba(123,47,255,0.05)' : 'none',
              }}
            >
              {/* Active glow line */}
              {active && (
                <motion.div
                  layoutId="activeBar"
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
                  style={{ background: 'linear-gradient(to bottom, #7B2FFF, #00E5FF)' }}
                />
              )}

              <div className="flex items-center gap-3">
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: active ? 'linear-gradient(135deg, #7B2FFF, #00E5FF)' : genreColor,
                    boxShadow: active ? '0 0 12px rgba(123,47,255,0.5)' : 'none',
                  }}
                >
                  {active
                    ? <Play className="w-4 h-4 text-white ml-0.5" />
                    : track.type === 'mp3'
                    ? <Music2 className="w-4 h-4 text-white/70" />
                    : <Video  className="w-4 h-4 text-white/70" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold text-sm truncate"
                    style={{ color: active ? '#00E5FF' : 'rgba(255,255,255,0.9)' }}
                  >
                    {track.title}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {track.artist}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: genreColor, color: 'rgba(255,255,255,0.7)' }}
                    >
                      {track.genre}
                    </span>
                    <span className="text-[10px] flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <Clock className="w-2.5 h-2.5" />
                      {fmt(track.duration)}
                    </span>
                  </div>
                </div>

                {/* Media badge */}
                <div
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {track.mediaPref}
                </div>
              </div>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
