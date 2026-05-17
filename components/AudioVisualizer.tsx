'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface AudioVisualizerProps {
  isPlaying: boolean
}

export default function AudioVisualizer({ isPlaying }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width = canvas.offsetWidth * 2
    const height = canvas.height = canvas.offsetHeight * 2

    const bars = 64
    const barWidth = width / bars

    let animationId: number

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      if (isPlaying) {
        for (let i = 0; i < bars; i++) {
          const barHeight = Math.random() * height * 0.6 + height * 0.1
          const x = i * barWidth
          const y = height - barHeight

          // Create gradient for each bar
          const gradient = ctx.createLinearGradient(x, y, x, height)
          gradient.addColorStop(0, '#00F5FF')
          gradient.addColorStop(0.5, '#8B5CF6')
          gradient.addColorStop(1, '#FF006E')

          ctx.fillStyle = gradient
          ctx.fillRect(x, y, barWidth - 2, barHeight)

          // Add glow effect
          ctx.shadowColor = '#00F5FF'
          ctx.shadowBlur = 10
        }
      }

      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [isPlaying])

  return (
    <motion.canvas
      ref={canvasRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: isPlaying ? 0.3 : 0 }}
      transition={{ duration: 0.5 }}
      className="w-full h-full"
    />
  )
}
