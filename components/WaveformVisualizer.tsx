'use client'

import { useEffect, useRef, useCallback } from 'react'

interface WaveformVisualizerProps {
  isPlaying: boolean
  audioData: Uint8Array | null
}

export default function WaveformVisualizer({ isPlaying, audioData }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const dataRef   = useRef<Uint8Array | null>(null)

  useEffect(() => { dataRef.current = audioData }, [audioData])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const data = dataRef.current
    const bars = 80

    for (let i = 0; i < bars; i++) {
      let normalized = 0
      if (data && isPlaying) {
        const idx = Math.floor((i / bars) * data.length)
        normalized = (data[idx] || 0) / 255
      } else if (isPlaying) {
        // Simulated bars when no real data
        normalized = 0.05 + Math.random() * 0.25
      }

      if (!isPlaying) {
        normalized = 0.02 + Math.sin(i * 0.4) * 0.01
      }

      const barH = Math.max(2, normalized * H * 0.85)
      const x = (i / bars) * W
      const barW = (W / bars) - 1

      const grad = ctx.createLinearGradient(x, H, x, H - barH)
      grad.addColorStop(0,   'rgba(123,47,255,0.8)')
      grad.addColorStop(0.5, 'rgba(0,229,255,0.9)')
      grad.addColorStop(1,   'rgba(255,0,110,0.7)')

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x, H - barH, barW, barH, 2)
      ctx.fill()

      // glow
      if (normalized > 0.4) {
        ctx.shadowColor = '#00E5FF'
        ctx.shadowBlur = 6
        ctx.fillStyle = `rgba(0,229,255,${normalized * 0.3})`
        ctx.fillRect(x, H - barH - 2, barW, 2)
        ctx.shadowBlur = 0
      }
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [isPlaying])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      canvas.style.width  = canvas.offsetWidth  + 'px'
      canvas.style.height = canvas.offsetHeight + 'px'
    })
    ro.observe(canvas)
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  )
}
