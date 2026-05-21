import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');
  
  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = path.basename(filename).replace(/\.[^/.]+$/, "");
  const ifxPath = path.join(MUSIC_DIR, `${sanitizedFilename}.ifx`);

  if (!fs.existsSync(ifxPath)) {
    return NextResponse.json({ error: 'Metadata file not found' }, { status: 404 });
  }

  try {
    const data = fs.readFileSync(ifxPath, 'utf8');
    const metadata = JSON.parse(data);
    return NextResponse.json(metadata);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read metadata file' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, metadata } = body;

    if (!filename || !metadata) {
      return NextResponse.json({ error: 'Filename and metadata are required' }, { status: 400 });
    }

    const sanitizedFilename = path.basename(filename).replace(/\.[^/.]+$/, "");
    const ifxPath = path.join(MUSIC_DIR, `${sanitizedFilename}.ifx`);

    // Ensure the folder exists
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }

    fs.writeFileSync(ifxPath, JSON.stringify(metadata, null, 2), 'utf8');
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save metadata file' }, { status: 500 });
  }
}
