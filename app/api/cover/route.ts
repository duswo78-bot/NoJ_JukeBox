import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');

    if (!filename) {
      return new NextResponse('Filename is required', { status: 400 });
    }

    // First check if a dedicated _cover.jpg exists
    const sanitizedFilename = path.basename(filename).replace(/\.[^/.]+$/, "");
    const coverPath = path.join(process.cwd(), 'public', 'music', `${sanitizedFilename}_cover.jpg`);
    try {
      const coverBuffer = await fs.readFile(coverPath);
      return new NextResponse(coverBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (e) {
      // _cover.jpg not found, proceed to parse MP3 ID3
    }

    const audioPath = path.join(process.cwd(), 'public', 'music', filename);
    
    // Read the first 500KB of the file to find the ID3 tag
    let fileHandle;
    try {
      fileHandle = await fs.open(audioPath, 'r');
    } catch (e) {
      return new NextResponse('File not found', { status: 404 });
    }

    const buffer = Buffer.alloc(500 * 1024);
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
    await fileHandle.close();

    if (bytesRead < 10 || buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) {
      // No ID3v2 tag
      return NextResponse.redirect('https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&q=80');
    }

    const versionMajor = buffer[3];
    const totalSize = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
    
    let offset = 10;
    let foundPic = false;
    let mimeType = 'image/jpeg';
    let imgData: Buffer | null = null;

    if (versionMajor === 3 || versionMajor === 4) {
      while (offset < totalSize + 10 && offset < bytesRead - 10) {
        const frameId = buffer.toString('ascii', offset, offset + 4);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        let frameSize = 0;
        if (versionMajor === 3) {
          frameSize = (buffer[offset + 4] << 24) | (buffer[offset + 5] << 16) | (buffer[offset + 6] << 8) | buffer[offset + 7];
        } else {
          frameSize = (buffer[offset + 4] << 21) | (buffer[offset + 5] << 14) | (buffer[offset + 6] << 7) | buffer[offset + 7];
        }

        if (frameId === 'APIC') {
          const frameDataOffset = offset + 10;
          const encoding = buffer[frameDataOffset];
          let mimeOffset = frameDataOffset + 1;
          let mimeEnd = mimeOffset;
          while (mimeEnd < bytesRead && buffer[mimeEnd] !== 0) mimeEnd++;
          
          mimeType = buffer.toString('ascii', mimeOffset, mimeEnd);
          
          // Skip picture type
          let descOffset = mimeEnd + 2;
          
          // Skip description
          if (encoding === 1 || encoding === 2) {
            while (descOffset < bytesRead - 1 && (buffer[descOffset] !== 0 || buffer[descOffset+1] !== 0)) descOffset += 2;
            descOffset += 2;
          } else {
            while (descOffset < bytesRead && buffer[descOffset] !== 0) descOffset++;
            descOffset++;
          }
          
          const imgDataSize = frameSize - (descOffset - frameDataOffset);
          if (imgDataSize > 0 && descOffset + imgDataSize <= bytesRead) {
            imgData = buffer.subarray(descOffset, descOffset + imgDataSize);
            foundPic = true;
          }
          break;
        }
        offset += 10 + frameSize;
      }
    } else if (versionMajor === 2) {
      while (offset < totalSize + 10 && offset < bytesRead - 6) {
        const frameId = buffer.toString('ascii', offset, offset + 3);
        if (!/^[A-Z0-9]{3}$/.test(frameId)) break;
        
        const frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
        
        if (frameId === 'PIC') {
          const frameDataOffset = offset + 6;
          const encoding = buffer[frameDataOffset];
          const format = buffer.toString('ascii', frameDataOffset + 1, frameDataOffset + 4);
          mimeType = format.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
          
          let descOffset = frameDataOffset + 5;
          if (encoding === 1) {
            while (descOffset < bytesRead - 1 && (buffer[descOffset] !== 0 || buffer[descOffset+1] !== 0)) descOffset += 2;
            descOffset += 2;
          } else {
            while (descOffset < bytesRead && buffer[descOffset] !== 0) descOffset++;
            descOffset++;
          }
          
          const imgDataSize = frameSize - (descOffset - frameDataOffset);
          if (imgDataSize > 0 && descOffset + imgDataSize <= bytesRead) {
            imgData = buffer.subarray(descOffset, descOffset + imgDataSize);
            foundPic = true;
          }
          break;
        }
        offset += 6 + frameSize;
      }
    }

    if (foundPic && imgData) {
      return new NextResponse(imgData, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Default if no APIC/PIC frame found
    return NextResponse.redirect('https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&q=80');

  } catch (error) {
    console.error("Cover extraction error:", error);
    return NextResponse.redirect('https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&q=80');
  }
}
