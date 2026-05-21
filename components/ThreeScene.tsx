'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type MediaType = 'LP' | 'CD' | 'TAPE'

interface ThreeSceneProps {
  isPlaying: boolean
  mediaType: MediaType
  audioData: Uint8Array | null
  trackIndex: number
}

const TRACK_COLORS = [
  { label: 0x7B2FFF, emissive: 0x3a1080 },
  { label: 0xFF006E, emissive: 0x80003a },
  { label: 0x00E5FF, emissive: 0x006080 },
  { label: 0xFFB020, emissive: 0x805010 },
]

export default function ThreeScene({ isPlaying, mediaType, audioData, trackIndex }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ isPlaying, mediaType, audioData, trackIndex })

  useEffect(() => {
    stateRef.current = { isPlaying, mediaType, audioData, trackIndex }
  }, [isPlaying, mediaType, audioData, trackIndex])

  useEffect(() => {
    if (!mountRef.current) return
    const el = mountRef.current
    const W = el.clientWidth
    const H = el.clientHeight

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.8
    el.appendChild(renderer.domElement)

    // ── Scene / Camera ─────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200)
    camera.position.set(0, 1.5, 9)
    camera.lookAt(0, 0, 0)

    // ── Lights ─────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x4040aa, 8))

    const violetLight = new THREE.PointLight(0x7B2FFF, 40, 30)
    violetLight.position.set(-5, 5, 8)
    scene.add(violetLight)

    const cyanLight = new THREE.PointLight(0x00E5FF, 30, 25)
    cyanLight.position.set(5, 3, 8)
    scene.add(cyanLight)

    const pinkLight = new THREE.PointLight(0xFF006E, 20, 20)
    pinkLight.position.set(0, -4, 6)
    scene.add(pinkLight)

    // Strong front fill light to show materials
    const frontLight = new THREE.DirectionalLight(0xffffff, 4)
    frontLight.position.set(0, 0, 10)
    scene.add(frontLight)

    const topSpot = new THREE.SpotLight(0xffffff, 20, 30, Math.PI / 8, 0.4)
    topSpot.position.set(0, 8, 6)
    scene.add(topSpot)

    // ── Particles background ───────────────────────────────────────
    const PARTICLE_COUNT = 3000
    const pPositions = new Float32Array(PARTICLE_COUNT * 3)
    const pColors    = new Float32Array(PARTICLE_COUNT * 3)
    const palette = [
      [0.48, 0.18, 1.0],
      [0.0,  0.9,  1.0],
      [1.0,  0.0,  0.43],
      [1.0,  0.69, 0.13],
    ]
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pPositions[i * 3]     = (Math.random() - 0.5) * 50
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 50
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 50 - 5
      const c = palette[Math.floor(Math.random() * palette.length)]
      pColors[i * 3] = c[0]; pColors[i * 3 + 1] = c[1]; pColors[i * 3 + 2] = c[2]
    }
    const pgeo = new THREE.BufferGeometry()
    pgeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    pgeo.setAttribute('color',    new THREE.BufferAttribute(pColors,    3))
    const pmat = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.55 })
    const particles = new THREE.Points(pgeo, pmat)
    scene.add(particles)

    // ── Build LP ───────────────────────────────────────────────────
    function buildLP(colorIdx: number): THREE.Group {
      const g = new THREE.Group()
      // Tilt LP so face is visible but has 3D depth
      g.rotation.x = -Math.PI / 7
      g.rotation.z = -0.08

      // disc
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 2.8, 0.08, 128),
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          roughness: 0.4,
          metalness: 0.3,
          emissive: 0x0a0518,
          emissiveIntensity: 0.8,
        })
      )
      g.add(disc)

      // grooves - visible rings
      for (let i = 1; i <= 30; i++) {
        const r = 0.6 + (i / 30) * 2.0
        const groove = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.005, 8, 256),
          new THREE.MeshStandardMaterial({
            color: 0x2a1a4a,
            roughness: 0.8,
            metalness: 0.1,
            emissive: 0x15083a,
            emissiveIntensity: 0.5,
          })
        )
        groove.rotation.x = Math.PI / 2
        g.add(groove)
      }

      // label
      const col = TRACK_COLORS[colorIdx % TRACK_COLORS.length]
      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, 0.09, 64),
        new THREE.MeshPhysicalMaterial({
          color: col.label, roughness: 0.25, metalness: 0.3,
          emissive: col.emissive, emissiveIntensity: 0.6,
        })
      )
      label.position.y = 0.02
      g.add(label)

      // center spindle
      g.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.15, 32),
        new THREE.MeshStandardMaterial({ color: 0x000000 })
      ))

      // tonearm
      const arm = new THREE.Group()
      arm.position.set(3.0, 0.3, 0)
      const armBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.018, 3.2, 12),
        new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 0.95 })
      )
      armBar.rotation.z = Math.PI / 2
      armBar.position.x = -1.6
      arm.add(armBar)
      const pivot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 16),
        new THREE.MeshPhysicalMaterial({ color: 0xbbbbbb, roughness: 0.1, metalness: 1 })
      )
      arm.add(pivot)
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.16, 0.08),
        new THREE.MeshPhysicalMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 })
      )
      head.position.x = -3.1
      arm.add(head)
      g.add(arm)
      ;(g as any).tonearm = arm

      return g
    }

    // ── Build CD ───────────────────────────────────────────────────
    function buildCD(colorIdx: number): THREE.Group {
      const g = new THREE.Group()
      // Tilt CD so iridescent surface catches light
      g.rotation.x = -Math.PI / 8
      g.rotation.z = 0.1

      // iridescent disc - make it visible with strong emissive
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 0.06, 128),
        new THREE.MeshStandardMaterial({
          color: 0x334455,
          roughness: 0.05,
          metalness: 0.9,
          emissive: 0x112233,
          emissiveIntensity: 0.6,
        })
      )
      g.add(disc)

      // data rings - colored for visibility
      for (let i = 1; i <= 18; i++) {
        const r = 0.4 + (i / 18) * 1.6
        const hue = (i / 18) * 360
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.004, 8, 256),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(`hsl(${hue}, 70%, 50%)`),
            roughness: 0.1,
            metalness: 0.5,
            emissive: new THREE.Color(`hsl(${hue}, 100%, 20%)`),
            emissiveIntensity: 0.8,
          })
        )
        ring.rotation.x = Math.PI / 2
        g.add(ring)
      }

      // center hub
      const col = TRACK_COLORS[colorIdx % TRACK_COLORS.length]
      g.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.06, 64),
        new THREE.MeshPhysicalMaterial({ color: col.label, emissive: col.emissive, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3 })
      ))
      g.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.1, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      ))

      return g
    }

    // ── Build Cassette ─────────────────────────────────────────────
    function buildCassette(colorIdx: number): THREE.Group {
      const g = new THREE.Group()
      const col = TRACK_COLORS[colorIdx % TRACK_COLORS.length]

      // body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(5, 3, 0.6),
        new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5, clearcoat: 0.5 })
      )
      g.add(body)

      // label
      const labelM = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 1.2, 0.65),
        new THREE.MeshPhysicalMaterial({ color: col.label, emissive: col.emissive, emissiveIntensity: 0.4, roughness: 0.4 })
      )
      labelM.position.set(0, -0.6, 0)
      g.add(labelM)

      // window cutout (simulated with dark panel)
      const window_ = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.1, 0.65),
        new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 })
      )
      window_.position.set(0, 0.5, 0)
      g.add(window_)

      // reels
      function buildReel(x: number) {
        const rg = new THREE.Group()
        rg.position.set(x, 0.5, 0.31)
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 0.1, 32),
          new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.8 })
        )
        hub.rotation.x = Math.PI / 2
        rg.add(hub)
        for (let s = 0; s < 5; s++) {
          const spoke = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.5, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
          )
          spoke.rotation.z = (s / 5) * Math.PI * 2
          spoke.position.y = 0.25
          spoke.rotation.x = Math.PI / 2
          rg.add(spoke)
        }
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16),
          new THREE.MeshBasicMaterial({ color: 0x000000 })
        )
        hole.rotation.x = Math.PI / 2
        rg.add(hole)
        return rg
      }
      const reel1 = buildReel(-1.1)
      const reel2 = buildReel(1.1)
      g.add(reel1); g.add(reel2)
      ;(g as any).reel1 = reel1
      ;(g as any).reel2 = reel2

      // corner screws
      ;[[-2.2, 1.2], [2.2, 1.2], [-2.2, -1.2], [2.2, -1.2]].forEach(([x, y]) => {
        const screw = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8),
          new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9 })
        )
        screw.position.set(x, y, 0)
        screw.rotation.x = Math.PI / 2
        g.add(screw)
      })

      g.rotation.x = -Math.PI / 12
      return g
    }

    // ── Floating ring decoration ───────────────────────────────────
    const ringDeco = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.012, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0x7B2FFF, transparent: true, opacity: 0.25 })
    )
    ringDeco.rotation.x = -Math.PI / 20
    scene.add(ringDeco)

    const ringDeco2 = new THREE.Mesh(
      new THREE.TorusGeometry(4.4, 0.006, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.15 })
    )
    ringDeco2.rotation.x = -Math.PI / 20
    scene.add(ringDeco2)

    // ── Active objects ─────────────────────────────────────────────
    let activeObj: THREE.Group | null = null

    function rebuildScene() {
      if (activeObj) scene.remove(activeObj)
      const { mediaType, trackIndex } = stateRef.current
      if (mediaType === 'LP')   activeObj = buildLP(trackIndex)
      else if (mediaType === 'CD')   activeObj = buildCD(trackIndex)
      else                           activeObj = buildCassette(trackIndex)
      scene.add(activeObj)
    }
    rebuildScene()

    let lastMedia = stateRef.current.mediaType
    let lastTrack = stateRef.current.trackIndex

    // ── Animation ──────────────────────────────────────────────────
    let time = 0
    let rafId: number

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      time += 0.016

      const { isPlaying, mediaType, audioData, trackIndex } = stateRef.current

      // Rebuild on change
      if (mediaType !== lastMedia || trackIndex !== lastTrack) {
        rebuildScene()
        lastMedia = mediaType
        lastTrack = trackIndex
      }

      // Audio reactivity
      let bassAvg = 0, midAvg = 0
      if (audioData && audioData.length > 0) {
        const bassSlice = audioData.slice(0, 8)
        const midSlice  = audioData.slice(8, 48)
        bassAvg = bassSlice.reduce((a, b) => a + b, 0) / bassSlice.length / 255
        midAvg  = midSlice.reduce((a, b)  => a + b, 0) / midSlice.length  / 255
      }

      // Light pulse
      violetLight.intensity = 15 + bassAvg * 25
      cyanLight.intensity   = 10 + midAvg  * 15
      pinkLight.intensity   = 8  + bassAvg * 10

      // Rotate active object
      if (activeObj) {
        if (isPlaying) {
          if (mediaType === 'LP' || mediaType === 'CD') {
            activeObj.rotation.y += mediaType === 'CD' ? 0.025 : 0.015
          }
          if (mediaType === 'TAPE') {
            const r1 = (activeObj as any).reel1
            const r2 = (activeObj as any).reel2
            if (r1) r1.rotation.z += 0.04
            if (r2) r2.rotation.z += 0.04
          }
        }

        // Tonearm for LP
        if (mediaType === 'LP') {
          const ta = (activeObj as any).tonearm
          if (ta) {
            const target = isPlaying ? -0.45 : 0.35
            ta.rotation.y += (target - ta.rotation.y) * 0.04
          }
        }

        // Gentle float
        activeObj.position.y = Math.sin(time * 0.6) * 0.08

        // Bass pulse scale
        if (isPlaying && bassAvg > 0.05) {
          const s = 1 + bassAvg * 0.04
          activeObj.scale.set(s, s, s)
        } else {
          activeObj.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1)
        }
      }

      // Particle drift
      particles.rotation.y += 0.0003
      particles.rotation.x += 0.0001

      // Ring pulse
      ringDeco.rotation.z  += 0.002
      ringDeco2.rotation.z -= 0.001
      const ringScale = 1 + bassAvg * 0.05
      ringDeco.scale.set(ringScale, ringScale, ringScale)

      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ─────────────────────────────────────────────────────
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="w-full h-full" />
}
