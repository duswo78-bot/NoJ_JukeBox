import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const execAsync = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { text, voice, rate, pitch } = await req.json();
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
    
    // Sanitize parameters
    const safeVoice = String(voice || 'ko-KR-SunHiNeural').replace(/[^a-zA-Z0-9-]/g, '');
    const safeRate = String(rate || '+5%').replace(/[^a-zA-Z0-9%+-]/g, '');
    const safePitch = String(pitch || '+0Hz').replace(/[^a-zA-Z0-9%+-]/g, '');

    const command = `python "${scriptPath}" --text "${safeText}" --output "${outputPath}" --voice "${safeVoice}" --rate "${safeRate}" --pitch "${safePitch}"`;
    
    await execAsync(command);

    // Return the URL path to the generated TTS file
    return NextResponse.json({ success: true, url: `/temp_tts/${filename}` });
  } catch (error: any) {
    console.error("Neural TTS failed:", error);
    return NextResponse.json({ error: error.message || 'Failed to generate TTS' }, { status: 500 });
  }
}
