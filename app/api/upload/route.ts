import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const coverBlob = formData.get('coverBlob') as File;
    const originalName = file.name || 'upload.mp3';
    const filenameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    
    let title = formData.get('title') as string;
    if (!title || title === 'Uploaded Track' || title === 'Unknown') title = filenameWithoutExt;
    
    const artist = formData.get('artist') as string || 'Local Upload';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Create a safe filename
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_ ()]/g, '');
    
    const audioPath = path.join(process.cwd(), 'public', 'music', safeName);
    const ifxPath = path.join(process.cwd(), 'public', 'music', `${filenameWithoutExt}.ifx`);

    // Write the MP3 file to disk
    await fs.writeFile(audioPath, buffer);

    let coverUrl = `/api/cover?filename=${encodeURIComponent(safeName)}`;
    if (coverBlob) {
      const coverBuffer = Buffer.from(await coverBlob.arrayBuffer());
      const coverFileName = `${filenameWithoutExt}_cover.jpg`;
      const coverPath = path.join(process.cwd(), 'public', 'music', coverFileName);
      await fs.writeFile(coverPath, coverBuffer);
      coverUrl = `/music/${coverFileName}`;
    }

    // Create a default .ifx file
    const defaultMetadata = {
      title: title || filenameWithoutExt,
      artist: artist,
      genre: 'Indie',
      bpm: 100,
      key: 'C Major',
      coverUrl: coverUrl,
      lyrics: [],
      linerNotes: 'An imported offline track loaded directly into the AI Jukebox context.'
    };

    await fs.writeFile(ifxPath, JSON.stringify(defaultMetadata, null, 2));

    return NextResponse.json({ 
      success: true, 
      filename: safeName,
      metadata: defaultMetadata
    });
  } catch (error: any) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: error.message || 'Failed to upload track' }, { status: 500 });
  }
}
