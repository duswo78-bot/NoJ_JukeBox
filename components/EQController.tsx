'use client'

import { useState } from 'react'
import { Sliders, Radio, Music } from 'lucide-react'

export default function EQController() {
  const [bass, setBass] = useState(50)
  const [mid, setMid] = useState(50)
  const [treble, setTreble] = useState(50)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const applyPreset = (preset: string) => {
    setActivePreset(preset)
    if (preset === 'vintage') {
      setBass(60)
      setMid(40)
      setTreble(30)
    } else if (preset === 'live') {
      setBass(70)
      setMid(60)
      setTreble(80)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-5 h-5 text-neon-cyan" />
        <h3 className="text-lg font-bold text-white">3-Band EQ</h3>
      </div>

      {/* EQ Sliders */}
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm text-gray-400">Bass</label>
            <span className="text-sm text-neon-cyan">{bass}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={bass}
            onChange={(e) => setBass(Number(e.target.value))}
            className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-neon-cyan"
          />
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm text-gray-400">Mid</label>
            <span className="text-sm text-neon-cyan">{mid}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={mid}
            onChange={(e) => setMid(Number(e.target.value))}
            className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-neon-purple"
          />
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm text-gray-400">Treble</label>
            <span className="text-sm text-neon-cyan">{treble}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={treble}
            onChange={(e) => setTreble(Number(e.target.value))}
            className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-neon-pink"
          />
        </div>
      </div>

      {/* Presets */}
      <div className="pt-4 border-t border-gray-700">
        <h4 className="text-sm font-semibold text-gray-400 mb-3">Presets</h4>
        <div className="space-y-2">
          <button
            onClick={() => applyPreset('vintage')}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
              activePreset === 'vintage'
                ? 'bg-neon-purple/20 border border-neon-purple'
                : 'bg-surface hover:bg-surface/80 border border-transparent'
            }`}
          >
            <Radio className="w-5 h-5 text-neon-orange" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Vintage Radio</div>
              <div className="text-xs text-gray-400">Lo-Fi City Pop</div>
            </div>
          </button>

          <button
            onClick={() => applyPreset('live')}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
              activePreset === 'live'
                ? 'bg-neon-purple/20 border border-neon-purple'
                : 'bg-surface hover:bg-surface/80 border border-transparent'
            }`}
          >
            <Music className="w-5 h-5 text-neon-cyan" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Live Concert</div>
              <div className="text-xs text-gray-400">Reverb & Space</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
