# AI Jukebox 🎵

A premium, interactive web music player combining high-fidelity Web Audio DSP, vintage physical media skins (LP, CD, Cassette Tape), and advanced AI features (AI EQ, AI Lyrics, Neural TTS, and DALL-E Cover Art).

---

## 🎨 Major Features

### 1. Retro-Modern Media Skins (LP, CD, Cassette)
* **LP (Vinyl) Mode**: Features an animated tonearm that slides to the vinyl platter on play, a spinning disc with realistic groove reflection, and analog dust crackle controls.
* **CD Mode**: Rotating CD disc with dynamic iridescent gradient effects that simulate laser light reflections.
* **Cassette Tape Mode**: Premium Silver-Gray metal deck styling. Dual rotating spindles and tape winding reels dynamically scale their rotation speed based on playback position.

### 2. AI Sound Lab & 10-Band EQ DSP
* **10-Band EQ Graphic Fader**: Adjust bands from 31Hz to 16kHz with an embedded Real-Time Analyzer (RTA) spectrum canvas rendering behind the sliders.
* **AI Automatic EQ (Auto Optimization)**: Analyzes track audio using a Pink Noise frequency matching algorithm. Shows a modern, overlay spinner reading **"ANALYZING SPECTRUM..."** in the UI during analysis before auto-applying the optimized EQ profile.
* **Spatial Audio Presets**: Instantly shape the audio space using Reverb/Convolver nodes (Normal, Studio, Stage, Concert, Hall, Cathedral).
* **EQ Tuning Presets**: Quick fader configurations (Classic Rock, Dance Electronic, Jazz Lounge, Vocal Clear, Bass Boost, Custom).

### 3. AI Coprocessor Features
* **AI Generative Lyrics**: Triggers Demucs vocal separation and Whisper audio transcription on the Python backend to auto-generate and time-sync scrolling lyrics.
* **AI Voice Narration (TTS)**: Uses a natural Korean Neural voice (Edge TTS) to automatically narrate track summaries, mood analysis, and genre intros when a track loads.
* **AI Cover Art Generator (DALL-E)**: Generates vintage-style album covers based on track title, artist, and genre.

### 4. High-Resolution Audio Visualizer
* A high-fidelity, real-time FFT spectrum visualizer floating behind the tape/record player deck for maximum visual engagement.

### 5. Premium Layout & Scaling
* Responsive design that supports standard layout and fully-immersive **Fullscreen Mode** which auto-scales player elements using dynamic CSS bounds to fit any high-res monitor.

---

## ⚙️ Tech Stack

* **Frontend**: Next.js 14 (App Router), TypeScript, Vanilla CSS (Premium styling, Glassmorphism, animations).
* **DSP / Audio**: Web Audio API (BiquadFilterNode chain, GainNode, ConvolverNode), HTML5 Audio.
* **Backend Bridge**: Next.js API Routes (`/api/auto-eq`, `/api/synthesize`, `/api/tts`, `/api/cover`) executing localized Python script processes.
* **Python AI Helpers**:
  * `faster-whisper`: High-performance local transcription.
  * `numpy`: Fast mathematical frequency analysis.
  * `edge-tts`: Neural Text-to-Speech synthesis.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: Version 18.x or 20.x
* **Python**: Version 3.10+ (required for AI helper scripts)
* **FFmpeg**: Must be installed and available in the system path (used by PyTorch/Whisper/Demucs for audio decoding).

### Python Setup
Create a virtual environment or install the required libraries globally:
```bash
pip install numpy faster-whisper edge-tts imageio-ffmpeg
```

### Installation & Execution
1. **Clone or Navigate to the directory**:
   ```bash
   cd "c:\Users\...\AI Jukebox"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in Development Mode**:
   ```bash
   npm run dev
   ```
   *The server will boot up (normally on port `http://localhost:3000` or `http://localhost:3001` if 3000 is occupied).*

---

## 📂 Project Structure

```
AI Jukebox/
├── app/
│   ├── api/
│   │   ├── ai/              # AI prompt routing
│   │   ├── auto-eq/         # Pink Noise EQ analysis endpoint
│   │   ├── cover/           # DALL-E image generation
│   │   ├── synthesize/      # Whisper/Demucs lyrics transcription
│   │   ├── tts/             # Edge TTS voice generation
│   │   ├── track-metadata/  # Saving .ifx metadata files
│   │   └── tracks/          # Listing local tracks
│   ├── globals.css          # Premium neon/dark styling rules
│   ├── layout.tsx           # Main application shell
│   └── page.tsx             # Main application page
├── backend/
│   ├── analyze_eq.py        # Pink Noise EQ optimizer (Python)
│   ├── generate_lyrics.py   # AI Lyrics generation script (Python)
│   └── generate_tts.py      # Neural TTS generator (Python)
├── public/
│   └── music/               # Track files (.mp3, .mp4, and matching .ifx metadata)
└── package.json             # NPM dependencies
```

---

## 🎵 Dynamic Metadata (.ifx)
Tracks store metadata (BPM, genre, tags, custom lyrics, and auto-generated AI EQ profile gains) inside JSON-formatted `.ifx` files located alongside the audio files in `/public/music/`. The Jukebox reads/writes to these files automatically.
