import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ disabled: true });
  }

  try {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const cssPath = path.join(process.cwd(), 'app', 'globals.css');
    
    const pageStats = fs.statSync(pagePath);
    const cssStats = fs.statSync(cssPath);
    
    // Combine modified timestamps of both files
    const version = pageStats.mtimeMs + cssStats.mtimeMs;
    
    return NextResponse.json({ version });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read file stats' }, { status: 500 });
  }
}
