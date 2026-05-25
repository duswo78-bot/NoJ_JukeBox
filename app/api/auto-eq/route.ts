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

    const sanitizedFilename = path.basename(filename);
    
    // We assume the audio is in the public/music folder.
    const audioPath = path.join(process.cwd(), 'public', 'music', sanitizedFilename);
    const scriptPath = path.join(process.cwd(), 'backend', 'analyze_eq.py');

    const command = `python "${scriptPath}" --audio "${audioPath}"`;
    
    const { stdout, stderr } = await execAsync(command);
    if (stderr) console.error("[AI Auto EQ Error]:", stderr);

    // Parse the JSON output from the Python script
    const lines = stdout.trim().split('\n');
    let parsedResult = null;
    
    // The python script might print other debug lines. We look for the JSON object in the last line.
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        parsedResult = JSON.parse(lines[i]);
        if (parsedResult.eq) break;
      } catch (e) {
        // Not a JSON line
      }
    }

    if (!parsedResult || !parsedResult.eq) {
      throw new Error("Failed to parse EQ analysis results");
    }

    return NextResponse.json({ success: true, eq: parsedResult.eq });
  } catch (error: any) {
    console.error("AI Auto EQ failed:", error);
    return NextResponse.json({ error: error.message || 'Failed to analyze EQ' }, { status: 500 });
  }
}
