import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function POST(req: NextRequest) {
  try {
    const { title, artist, genre, filename } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured in .env.local' }, { status: 501 });
    }

    if (!title || !filename) {
      return NextResponse.json({ error: 'Title and filename are required' }, { status: 400 });
    }

    // Prepare a safe filename
    const safeName = filename.replace(/[^a-zA-Z0-9.\-_ ()]/g, '');
    const filenameWithoutExt = safeName.replace(/\.[^/.]+$/, "");
    const coverFileName = `${filenameWithoutExt}_cover.jpg`;
    const coverPath = path.join(process.cwd(), 'public', 'music', coverFileName);

    // Prompt for DALL-E 3
    const prompt = `A highly aesthetic, minimalist, and premium album cover art for a track titled "${title}" by ${artist || 'Unknown Artist'}. The genre is ${genre || 'electronic / indie'}. It should look like a professional, modern, and stylized vinyl record sleeve artwork. No text or words should be written on the image. High quality, stunning visual.`;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: prompt,
        n: 1,
        size: '1024x1024'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("DALL-E API error:", errorData);
      return NextResponse.json({ error: errorData.error?.message || 'DALL-E API request failed' }, { status: response.status });
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL returned from OpenAI' }, { status: 500 });
    }

    // Download the image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error("Failed to download generated image");
    
    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save locally
    await fs.writeFile(coverPath, buffer);

    return NextResponse.json({ 
      success: true, 
      coverUrl: `/music/${coverFileName}?t=${Date.now()}` 
    });

  } catch (error: any) {
    console.error("DALL-E Generation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
