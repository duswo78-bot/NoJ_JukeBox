import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';

const execAsync = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Use a hash or timestamp to avoid collisions
    const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp3`;
    
    // Output directory inside public so it can be served
    const outputDir = path.join(process.cwd(), 'public', 'temp_tts');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, filename);
    const scriptPath = path.join(process.cwd(), 'backend', 'generate_tts.py');

    // Make sure to escape quotes in text for the command line
    const safeText = text.replace(/"/g, '\\"');
    const command = `python "${scriptPath}" --text "${safeText}" --output "${outputPath}"`;
    
    await execAsync(command);

    // Return the URL path to the generated TTS file
    return NextResponse.json({ success: true, url: `/temp_tts/${filename}` });
  } catch (error: any) {
    console.error("Neural TTS failed:", error);
    return NextResponse.json({ error: error.message || 'Failed to generate TTS' }, { status: 500 });
  }
}
