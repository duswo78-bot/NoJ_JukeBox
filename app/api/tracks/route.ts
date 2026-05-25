import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

// Helper to determine some generic defaults if `.ifx` is missing
function getDefaultMetadata(filename: string, index: number) {
  const title = filename.replace(/\.[^/.]+$/, "");
  return {
    id: index + 1,
    title: title,
    artist: 'Unknown Artist',
    genre: 'Indie',
    mood: ['#Discovered'],
    bpm: 100,
    key: 'C Major',
    mediaPref: 'LP',
    duration: 180, // Will be updated by browser audio element later
    src: `/music/${filename}`,
    lyrics: [],
    linerNotes: 'An imported offline track loaded directly into the AI Jukebox context.',
    coverUrl: `/api/cover?file=${encodeURIComponent(filename)}`
  };
}

export async function GET() {
  try {
    const musicDir = path.join(process.cwd(), 'public', 'music');
    
    // Ensure the directory exists
    try {
      await fs.access(musicDir);
    } catch {
      await fs.mkdir(musicDir, { recursive: true });
    }

    const files = await fs.readdir(musicDir);
    const audioFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      const isAudio = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext);
      const isAiGenerated = f.endsWith('_mr.wav') || f.endsWith('_vocals.wav');
      return isAudio && !isAiGenerated;
    });

    const tracks = await Promise.all(audioFiles.map(async (filename, index) => {
      const defaultMeta = getDefaultMetadata(filename, index);
      const ifxFilename = filename.replace(/\.[^/.]+$/, "") + '.ifx';
      const ifxPath = path.join(musicDir, ifxFilename);

      try {
        const ifxContent = await fs.readFile(ifxPath, 'utf-8');
        const parsed = JSON.parse(ifxContent);
        
        let coverUrl = parsed.coverUrl;
        if (!coverUrl || coverUrl.includes('unsplash')) {
          coverUrl = `/api/cover?file=${encodeURIComponent(filename)}`;
        }

        // Merge the loaded metadata with defaults so the Track interface is satisfied
        return {
          ...defaultMeta,
          ...parsed,
          coverUrl: coverUrl,
          id: index + 1, // ensure ID is unique and strictly sequential
          src: `/music/${filename}`, // ensure src always points to the audio file correctly
        };
      } catch (err) {
        // .ifx file doesn't exist or is invalid, return default
        return defaultMeta;
      }
    }));

    return NextResponse.json(tracks);
  } catch (error: any) {
    console.error("Failed to load tracks:", error);
    return NextResponse.json({ error: error.message || 'Failed to load tracks' }, { status: 500 });
  }
}
