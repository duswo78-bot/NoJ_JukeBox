import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export const dynamic = 'force-dynamic';

function generateSvgCover(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  const s = 60 + Math.abs(hash % 40);
  const l = 30 + Math.abs((hash * 3) % 40);
  
  const c1 = `hsl(${h1}, ${s}%, ${l}%)`;
  const c2 = `hsl(${h2}, ${s}%, ${Math.max(10, l - 20)}%)`;
  const c3 = `hsl(${(h1 + 45) % 360}, 80%, 70%)`;
  const c4 = `hsl(${(h1 + 90) % 360}, 70%, 60%)`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c1}" />
          <stop offset="100%" stop-color="${c2}" />
        </linearGradient>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.12 0" />
        </filter>
      </defs>
      <rect width="400" height="400" fill="url(#bg)" />
      
      <!-- Algorithmic abstract shapes -->
      <circle cx="200" cy="200" r="140" fill="none" stroke="${c3}" stroke-width="1.5" opacity="0.4" />
      <circle cx="200" cy="200" r="100" fill="none" stroke="${c4}" stroke-width="3" opacity="0.5" stroke-dasharray="10 5" />
      <path d="M 0 200 Q 100 ${100 + (hash%200)} 200 200 T 400 200" fill="none" stroke="${c3}" stroke-width="4" opacity="0.6" />
      <path d="M 200 0 L 200 400" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.1" />
      
      <rect width="400" height="400" style="pointer-events:none;" filter="url(#noise)" opacity="0.6" />
      
      <!-- Text -->
      <text x="200" y="195" font-family="sans-serif" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" opacity="0.95" letter-spacing="1.5">
        ${title.substring(0, 18)}${title.length > 18 ? '...' : ''}
      </text>
      <text x="200" y="235" font-family="sans-serif" font-size="12" font-weight="500" fill="#ffffff" text-anchor="middle" opacity="0.6" letter-spacing="4">
        AI SYNTHESIS
      </text>
    </svg>
  `.trim();
}

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
      // No ID3v2 tag, generate algorithmic SVG cover instead
      const sanitizedFilenameForSvg = path.basename(filename).replace(/\.[^/.]+$/, "");
      const svgStr = generateSvgCover(sanitizedFilenameForSvg);
      return new NextResponse(svgStr, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        }
      });
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
      return new NextResponse(new Uint8Array(imgData), {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }



    // Default if no APIC/PIC frame found -> Auto generate algorithmic SVG cover
    const sanitizedFilenameForSvg = path.basename(filename).replace(/\.[^/.]+$/, "");
    const svgStr = generateSvgCover(sanitizedFilenameForSvg);
    return new NextResponse(svgStr, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      }
    });

  } catch (error) {
    console.error("Cover extraction error:", error);
    const svgStr = generateSvgCover("Unknown Track");
    return new NextResponse(svgStr, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }
}

