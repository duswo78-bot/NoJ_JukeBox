# AI Jukebox 🎵

A modern, interactive web music player featuring physical media visualization (LP, CD, Cassette Tape), Web Audio API integration, and a stunning dark neon UI.

## Features

### 🎨 Physical Media Player with 3 Skins
- **LP (Vinyl) Mode**: Animated tonearm that moves to the record when playing, with a spinning vinyl disc featuring realistic groove effects
- **CD Mode**: Rotating CD with rainbow iridescence gradient effects that simulate light reflection
- **Cassette Tape Mode**: Dual spindles that rotate with tape winding animation based on playback progress

### 🎵 Integrated Media Player
- **MP3 Playback**: Physical media visualization with background audio visualizer
- **MP4 Playback**: Seamless transition to video player with ambient light effects

### 🎚️ Web Audio API DSP
- **3-Band EQ Controller**: Bass, Mid, and Treble adjustment sliders
- **Vintage Radio Preset**: Lo-Fi effect with reduced bandwidth for City Pop vibes
- **Live Concert Preset**: Reverb effect for enhanced spatial audio

### 📊 Smart Playback UI
- **Metadata Panel**: Displays BPM, genre, mood tags, and track type
- **Scrolling Lyrics**: Synchronized lyrics display
- **Audio Visualizer**: Real-time canvas-based frequency visualization

### 🎯 UI/UX Design
- **Dark Theme**: Modern showcase meets retro vinyl bar aesthetic
- **Neon Accents**: Cyan, purple, pink, and orange color scheme
- **Responsive Layout**: Three-panel design with playlist, main player, and controls
- **Smooth Animations**: Framer Motion powered transitions

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Audio**: Web Audio API, HTML5 Audio/Video
- **Visualization**: HTML5 Canvas

## Prerequisites

Before running this project, you need to have Node.js and npm installed on your system.

### Installing Node.js and npm

1. **Download Node.js**: Visit [https://nodejs.org/](https://nodejs.org/) and download the LTS (Long Term Support) version for Windows.
2. **Install**: Run the installer and follow the installation wizard.
3. **Verify Installation**: Open a new terminal/command prompt and run:
   ```bash
   node --version
   npm --version
   ```
   If you see version numbers, installation was successful.

## Installation

1. **Navigate to the project directory**:
   ```bash
   cd "c:\Users\djw7ql\OneDrive - Aptiv\Antigravity\AI Jukebox"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**: Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
AI Jukebox/
├── app/
│   ├── globals.css          # Global styles and custom CSS
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Main application page
├── components/
│   ├── VinylPlayer.tsx      # LP vinyl player component
│   ├── CDPlayer.tsx         # CD player component
│   ├── TapePlayer.tsx       # Cassette tape player component
│   ├── AudioVisualizer.tsx  # Canvas-based audio visualizer
│   ├── EQController.tsx     # 3-Band EQ with presets
│   ├── Playlist.tsx         # Track playlist component
│   └── MetadataPanel.tsx    # Track info and lyrics display
├── package.json             # Project dependencies
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── next.config.js           # Next.js configuration
└── postcss.config.js        # PostCSS configuration
```

## Usage

### Playing Music
1. Select a track from the playlist on the left sidebar
2. Click the play button in the center
3. Switch between LP, CD, and Tape modes using the toggle buttons
4. Adjust volume using the slider below the controls

### Using the EQ
1. Click the Settings icon in the top-right to open the controls panel
2. Adjust Bass, Mid, and Treble sliders
3. Click preset buttons for Vintage Radio or Live Concert effects

### Viewing Track Info
1. The right panel displays track metadata (BPM, genre, mood)
2. Lyrics are displayed in a scrollable container
3. Mood tags are shown as colorful badges

## Mock Data

The project includes two sample tracks for testing:

- **Neon Nights** by Shine On (샤인온)
  - Type: MP3
  - Genre: City Pop
  - Mood: Retro/Chill
  - BPM: 105
  - Preferred Media: LP

- **Midnight Highway** by Unknown
  - Type: MP4
  - Genre: Eurodance
  - Mood: Energetic
  - BPM: 130
  - Preferred Media: CD

## Customization

### Adding Your Own Tracks
Edit the `mockTracks` array in `app/page.tsx` to add your own music:

```typescript
{
  id: 3,
  title: "Your Song",
  artist: "Artist Name",
  type: "mp3",
  genre: "Your Genre",
  mood: "Your Mood",
  bpm: 120,
  mediaPref: "CD",
  duration: 180,
  lyrics: ["Line 1", "Line 2", ...]
}
```

### Modifying Colors
Update the color scheme in `tailwind.config.ts`:

```typescript
colors: {
  neon: {
    pink: "#FF006E",
    cyan: "#00F5FF",
    purple: "#8B5CF6",
    orange: "#FF6B35"
  }
}
```

## Building for Production

```bash
npm run build
npm start
```

## Future Enhancements

- [ ] Connect to real audio files
- [ ] Add more EQ presets
- [ ] Implement playlist shuffle/repeat
- [ ] Add keyboard shortcuts
- [ ] Support for more audio formats
- [ ] Real-time lyrics synchronization
- [ ] Save user preferences to localStorage

## License

This project is for personal use and educational purposes.

## Credits

Built with ❤️ using Next.js, Tailwind CSS, and Framer Motion.
