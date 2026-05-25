import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';

const execAsync = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { filename, language } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const sanitizedFilename = path.basename(filename);
    let audioPath = path.join(process.cwd(), 'public', 'music', sanitizedFilename);
    
    // Robustly resolve extension if the file is not found (e.g. if filename doesn't include extension)
    if (!fs.existsSync(audioPath)) {
      const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.MP3', '.WAV'];
      let found = false;
      for (const ext of extensions) {
        const candidatePath = audioPath + ext;
        if (fs.existsSync(candidatePath)) {
          audioPath = candidatePath;
          found = true;
          break;
        }
      }
      if (!found) {
        return NextResponse.json({ error: `Audio file not found at: ${audioPath}` }, { status: 404 });
      }
    }

    // Now derive base name without extension for the .ifx output path
    const resolvedFilename = path.basename(audioPath);
    const baseNameWithoutExt = resolvedFilename.replace(/\.[^/.]+$/, "");
    const outputPath = path.join(process.cwd(), 'public', 'music', `${baseNameWithoutExt}.ifx`);
    const scriptPath = path.join(process.cwd(), 'backend', 'generate_lyrics.py');

    // Run the Python script with optional language forcing
    let command = `python "${scriptPath}" --audio "${audioPath}" --output "${outputPath}"`;
    if (language) {
      command += ` --language "${language}"`;
    }
    
    // In a production environment, this could timeout if it takes minutes.
    // For local desktop apps, this will wait for the whisper process to finish.
    const { stdout, stderr } = await execAsync(command);
    console.log("[AI Synthesize Output]:", stdout);
    if (stderr) console.error("[AI Synthesize Error]:", stderr);

    return NextResponse.json({ success: true, message: "AI Sync complete" });
  } catch (error: any) {
    console.error("AI Synthesis failed:", error);
    return NextResponse.json({ error: error.message || 'Failed to synthesize lyrics' }, { status: 500 });
  }
}
