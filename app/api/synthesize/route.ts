import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const sanitizedFilename = path.basename(filename).replace(/\.[^/.]+$/, "");
    
    const audioPath = path.join(process.cwd(), 'public', 'music', `${sanitizedFilename}.mp3`);
    const outputPath = path.join(process.cwd(), 'public', 'music', `${sanitizedFilename}.ifx`);
    const scriptPath = path.join(process.cwd(), 'backend', 'generate_lyrics.py');

    // Run the Python script
    const command = `python "${scriptPath}" --audio "${audioPath}" --output "${outputPath}"`;
    
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
