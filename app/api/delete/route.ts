import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const sanitizedFilename = path.basename(filename);
    const filenameWithoutExt = sanitizedFilename.replace(/\.[^/.]+$/, "");
    
    const audioPath = path.join(process.cwd(), 'public', 'music', sanitizedFilename);
    const ifxPath = path.join(process.cwd(), 'public', 'music', `${filenameWithoutExt}.ifx`);
    const coverPath = path.join(process.cwd(), 'public', 'music', `${filenameWithoutExt}_cover.jpg`);
    const vocalsPath = path.join(process.cwd(), 'public', 'music', `${filenameWithoutExt}_vocals.wav`);
    const mrPath = path.join(process.cwd(), 'public', 'music', `${filenameWithoutExt}_mr.wav`);

    // Delete associated files if they exist
    try { await fs.unlink(audioPath); } catch (e) {}
    try { await fs.unlink(ifxPath); } catch (e) {}
    try { await fs.unlink(coverPath); } catch (e) {}
    try { await fs.unlink(vocalsPath); } catch (e) {}
    try { await fs.unlink(mrPath); } catch (e) {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete track:", error);
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 });
  }
}
