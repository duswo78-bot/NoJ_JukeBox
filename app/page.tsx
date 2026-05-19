'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Disc3, Music2, Plus, Edit3, X, Sparkles, Upload,
  ChevronLeft, ChevronRight, CassetteTape, Disc, Maximize2, Minimize2
} from 'lucide-react'

type MediaType = 'LP' | 'CD' | 'TAPE'

// Pure JS ID3v2 Metadata & APIC Album Cover Art Parser (Supports ID3v2.2, ID3v2.3, ID3v2.4)
function parseMp3Metadata(file: File): Promise<{ title?: string; artist?: string; coverUrl?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        resolve({});
        return;
      }
      
      const view = new DataView(buffer);
      // Check if it starts with "ID3"
      if (buffer.byteLength < 10 || 
          view.getUint8(0) !== 0x49 || 
          view.getUint8(1) !== 0x44 || 
          view.getUint8(2) !== 0x33) {
        resolve({});
        return;
      }
      
      const versionMajor = view.getUint8(3);
      const totalSize = readSyncsafeInteger(view, 6);
      let offset = 10; // ID3v2 Header size
      
      let title: string | undefined;
      let artist: string | undefined;
      let coverUrl: string | undefined;
      
      const textDecoder = new TextDecoder('utf-8');
      const utf16Decoder = new TextDecoder('utf-16');

      if (versionMajor === 3 || versionMajor === 4) {
        while (offset < totalSize + 10 && offset < buffer.byteLength - 10) {
          const frameId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
          );
          
          if (!/^[A-Z0-9]{4}$/.test(frameId)) {
            break;
          }
          
          let frameSize = 0;
          if (versionMajor === 3) {
            // ID3v2.3 uses standard 32-bit big-endian integer for frame size
            frameSize = (view.getUint8(offset + 4) << 24) |
                        (view.getUint8(offset + 5) << 16) |
                        (view.getUint8(offset + 6) << 8) |
                        view.getUint8(offset + 7);
          } else {
            // ID3v2.4 uses syncsafe 32-bit integer
            frameSize = readSyncsafeInteger(view, offset + 4);
          }
          
          if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) {
            break;
          }
          
          const frameDataOffset = offset + 10;
          
          if (frameId === 'TIT2') { // Title
            title = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'TPE1') { // Artist
            artist = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'APIC') { // Picture / Attached Cover Art
            try {
              const encoding = view.getUint8(frameDataOffset);
              let mimeTypeOffset = frameDataOffset + 1;
              let mimeType = '';
              while (mimeTypeOffset < buffer.byteLength && view.getUint8(mimeTypeOffset) !== 0) {
                mimeType += String.fromCharCode(view.getUint8(mimeTypeOffset));
                mimeTypeOffset++;
              }
              const pictureType = view.getUint8(mimeTypeOffset + 1);
              let descOffset = mimeTypeOffset + 2;
              if (encoding === 1 || encoding === 2) {
                // UTF-16, skip until 0x00 0x00
                while (descOffset < buffer.byteLength - 1 && view.getUint16(descOffset) !== 0) {
                  descOffset += 2;
                }
                descOffset += 2;
              } else {
                // UTF-8 or ISO-8859-1, skip until 0x00
                while (descOffset < buffer.byteLength && view.getUint8(descOffset) !== 0) {
                  descOffset++;
                }
                descOffset++;
              }
              
              const imgDataSize = frameSize - (descOffset - frameDataOffset);
              if (imgDataSize > 0 && descOffset + imgDataSize <= buffer.byteLength) {
                const imgData = new Uint8Array(buffer, descOffset, imgDataSize);
                const blob = new Blob([imgData], { type: mimeType || 'image/jpeg' });
                coverUrl = URL.createObjectURL(blob);
              }
            } catch (err) {
              console.error("Error parsing APIC frame:", err);
            }
          }
          
          offset += 10 + frameSize;
        }
      } else if (versionMajor === 2) {
        // ID3v2.2 uses 3-character frame IDs and 3-byte standard integers for size, 6-byte header
        while (offset < totalSize + 10 && offset < buffer.byteLength - 6) {
          const frameId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2)
          );
          
          if (!/^[A-Z0-9]{3}$/.test(frameId)) {
            break;
          }
          
          const frameSize = (view.getUint8(offset + 3) << 16) |
                            (view.getUint8(offset + 4) << 8) |
                            view.getUint8(offset + 5);
                            
          if (frameSize <= 0 || offset + 6 + frameSize > buffer.byteLength) {
            break;
          }
          
          const frameDataOffset = offset + 6;
          
          if (frameId === 'TT2') { // Title
            title = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'TP1') { // Artist
            artist = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'PIC') { // Picture
            try {
              const encoding = view.getUint8(frameDataOffset);
              const format = String.fromCharCode(
                view.getUint8(frameDataOffset + 1),
                view.getUint8(frameDataOffset + 2),
                view.getUint8(frameDataOffset + 3)
              ).toLowerCase();
              const pictureType = view.getUint8(frameDataOffset + 4);
              let descOffset = frameDataOffset + 5;
              
              if (encoding === 1) {
                while (descOffset < buffer.byteLength - 1 && view.getUint16(descOffset) !== 0) {
                  descOffset += 2;
                }
                descOffset += 2;
              } else {
                while (descOffset < buffer.byteLength && view.getUint8(descOffset) !== 0) {
                  descOffset++;
                }
                descOffset++;
              }
              
              const imgDataSize = frameSize - (descOffset - frameDataOffset);
              if (imgDataSize > 0 && descOffset + imgDataSize <= buffer.byteLength) {
                const imgData = new Uint8Array(buffer, descOffset, imgDataSize);
                const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
                const blob = new Blob([imgData], { type: mimeType });
                coverUrl = URL.createObjectURL(blob);
              }
            } catch (err) {
              console.error("Error parsing PIC frame:", err);
            }
          }
          
          offset += 6 + frameSize;
        }
      }
      
      resolve({ title, artist, coverUrl });
    };
    
    reader.onerror = () => resolve({});
    // Read up to first 10MB of the file to support higher resolution cover arts
    reader.readAsArrayBuffer(file.slice(0, 10 * 1024 * 1024));
  });
}

function readSyncsafeInteger(view: DataView, offset: number): number {
  return (view.getUint8(offset) << 21) |
         (view.getUint8(offset + 1) << 14) |
         (view.getUint8(offset + 2) << 7) |
         view.getUint8(offset + 3);
}

function decodeTextFrame(view: DataView, offset: number, size: number, utf8: TextDecoder, utf16: TextDecoder): string {
  const encoding = view.getUint8(offset);
  const data = new Uint8Array(view.buffer, offset + 1, size - 1);
  if (encoding === 1 || encoding === 2) {
    return utf16.decode(data).replace(/\0/g, '').trim();
  }
  return utf8.decode(data).replace(/\0/g, '').trim();
}

interface Track {
  id: number;
  title: string;
  artist: string;
  genre: string;
  mood: string[];
  bpm: number;
  key: string;
  mediaPref: MediaType;
  duration: number;
  lyrics: string[];
  src: string;
  linerNotes: string;
  coverUrl?: string;
}

const INITIAL_TRACKS: Track[] = [
  {
    id: 1, title: 'Shine On (Remastered)', artist: 'NoJ',
    genre: 'City Pop', mood: ['#Retro', '#Dreamy', '#Chill'],
    bpm: 105, key: 'A Minor', mediaPref: 'LP', duration: 240,
    src: '/music/Shine on (Remastered).mp3',
    lyrics: ['도시의 불빛이 흐르네','네온 사인 속에 나를 찾아','밤거리를 걷는 이 느낌','추억 속의 멜로디','우리의 밤은 계속되네','빛나는 별들 아래서','끝나지 않는 밤하늘의 약속'],
    linerNotes: 'Remastered version of the signature track. Rich warm tones with a city pop arrangement reminiscent of late-night Tokyo drives. The remaster brings out subtle harmonic layers that were hidden in the original mix.',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'
  },
  {
    id: 2, title: 'Midnight Breaker', artist: 'Delight X',
    genre: 'Electronic', mood: ['#Energetic', '#Drive', '#Night'],
    bpm: 128, key: 'D Minor', mediaPref: 'CD', duration: 210,
    src: '/music/Delight X _ Midnight Breaker.mp3',
    lyrics: ['Midnight breaker, feel the rush','City lights and engine hush','Breaking through the darkened street','Heart and rhythm, bass and beat','Chase the speed under neon skies','No regrets and no goodbyes'],
    linerNotes: 'A collaboration between Delight X, blending hard-hitting electronic production with melodic sensibilities. Perfect for late-night drives with its driving bassline and euphoric synth breakdowns.',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80'
  },
  {
    id: 3, title: 'Midnight Mirage', artist: 'NoJ',
    genre: 'Ambient Pop', mood: ['#Dreamy', '#Hazy', '#Atmospheric'],
    bpm: 92, key: 'G Major', mediaPref: 'LP', duration: 220,
    src: '/music/Midnight Mirage.mp3',
    lyrics: ['Is this real or just a mirage','Midnight haze in a montage','Floating through the summer heat','Lost in rhythms, lost in beat','Whispering secrets in the dark','Igniting a beautiful acoustic spark'],
    linerNotes: 'A dreamlike journey through layered synths and gentle percussion. The mirage effect is achieved through carefully stacked reverb tails and pitch-shifted harmonics that blur the line between consciousness and dream.',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80'
  },
  {
    id: 4, title: 'Nirvana State (Mashup)', artist: 'NoJ',
    genre: 'Melodic', mood: ['#Transcendent', '#Emotional', '#Peak'],
    bpm: 118, key: 'B Minor', mediaPref: 'CD', duration: 230,
    src: '/music/Nirvana State x Nirvana State(Melodic) (Mashup).mp3',
    lyrics: ['찰나의 순간 속에','영원을 담아','우리의 목소리가','하늘을 채워','이 모든 아픔은 사라지고','새로운 새벽이 오고 있어'],
    linerNotes: 'A bold mashup combining the original Nirvana State with its melodic variant. Two distinct emotional worlds collide — raw energy meets delicate melody — creating a unique listening experience that builds to an overwhelming crescendo.',
    coverUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80'
  },
  {
    id: 5, title: 'Pain', artist: 'NoJ',
    genre: 'Emotional', mood: ['#Raw', '#Vulnerable', '#Deep'],
    bpm: 78, key: 'E Minor', mediaPref: 'TAPE', duration: 280,
    src: '/music/Pain.mp3',
    lyrics: ['고통이 파도처럼 밀려와','숨을 쉬기조차 어려워','하지만 나는 여기 있어','이 순간을 버티며','어둠 속의 한 줄기 빛으로','다시 일어설 힘을 모아'],
    linerNotes: 'A deeply personal composition exploring vulnerability and resilience. The raw emotion is conveyed through sparse instrumentation — just voice, piano, and carefully placed silence. One of the most honest pieces in the catalogue.',
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80'
  },
  {
    id: 6, title: 'Shooting Star', artist: 'NoJ',
    genre: 'Uplifting', mood: ['#Hopeful', '#Bright', '#Soaring'],
    bpm: 110, key: 'C Major', mediaPref: 'LP', duration: 215,
    src: '/music/Shooting star(v5.5).mp3',
    lyrics: ['별이 되어 날아올라','저 하늘 끝까지','빛나는 꿈을 향해','우리 함께 날자','밤하늘을 수놓는 별빛들','영원히 꺼지지 않을 약속'],
    linerNotes: 'Version 5.5 of the beloved track, refined over countless iterations. This version strikes the perfect balance between the uplifting orchestral elements and the grounded electronic production. The shooting star motif runs throughout as a recurring melodic theme.',
    coverUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&q=80'
  },
  {
    id: 7, title: 'Until the End', artist: 'NoJ',
    genre: 'Progressive', mood: ['#Determined', '#Cinematic', '#Epic'],
    bpm: 122, key: 'F# Minor', mediaPref: 'CD', duration: 260,
    src: '/music/Until the End v5.5.mp3',
    lyrics: ['끝까지 함께하자','어떤 어둠도 함께','Until the very end','We stand as one','빛을 향한 마지막 발걸음','우리의 운명을 바꿀 순간'],
    linerNotes: 'A cinematic progressive track built around the theme of perseverance. Version 5.5 adds orchestral swell elements that dramatically elevate the emotional impact of the climax. The track builds meticulously over four minutes before an explosive finale.',
    coverUrl: 'https://images.unsplash.com/photo-1446057032654-9d8885db76c6?w=300&q=80'
  },
  {
    id: 8, title: 'Vain', artist: 'NoJ',
    genre: 'Introspective', mood: ['#Melancholic', '#Reflective', '#Smooth'],
    bpm: 88, key: 'A Major', mediaPref: 'TAPE', duration: 255,
    src: '/music/Vain.mp3',
    lyrics: ['헛된 시간 속에서','무엇을 찾고 있었나','거울 앞에 서서','나를 바라보며','시간은 모래처럼 흘러가고','추억의 조각들만 남겨지네'],
    linerNotes: 'A smooth, introspective piece that questions the meaning of fleeting moments. The production uses vintage-style tape compression to give the track a warm, nostalgic quality that perfectly complements the reflective lyrical theme.',
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80'
  },
  {
    id: 9, title: '나반존자 (那畔尊者)', artist: 'NoJ',
    genre: 'Fusion', mood: ['#Spiritual', '#Traditional', '#Unique'],
    bpm: 96, key: 'D Pentatonic', mediaPref: 'LP', duration: 198,
    src: '/music/나반존자(那畔尊者).mp3',
    lyrics: ['나반존자 그 이름','저 건너편 존자님','마음의 길을 따라','깨달음을 향하여','동방의 깊은 울림 속','참된 진리를 깨달으며'],
    linerNotes: 'A bold fusion of traditional Korean musical sensibilities with contemporary electronic production. The title references the Buddhist figure Nabanjonja, and the track explores themes of enlightenment through a unique sonic journey that bridges East and West.',
    coverUrl: 'https://images.unsplash.com/photo-1535401991746-da3d9055713e?w=300&q=80'
  },
  {
    id: 10, title: '유리 정원', artist: 'NoJ',
    genre: 'Atmospheric', mood: ['#Delicate', '#Glass', '#Fragile'],
    bpm: 82, key: 'G# Minor', mediaPref: 'LP', duration: 208,
    src: '/music/유리 정원.mp3',
    lyrics: ['유리처럼 투명한','네 마음 속 정원에','조심스레 발을 들여','꽃잎 하나 건드리지 않게','부서지기 쉬운 아름다움','꿈속의 유리 조각들'],
    linerNotes: 'Glass Garden — a delicate soundscape built around crystalline synthesizer tones and gentle melodic phrases. The track evokes the fragility and beauty of a garden made of glass, where every sound must be placed with care and precision.',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&q=80'
  },
  {
    id: 11, title: '프로폴리스 (Original)', artist: 'NoJ',
    genre: 'Original', mood: ['#Natural', '#Organic', '#Healing'],
    bpm: 94, key: 'E Major', mediaPref: 'TAPE', duration: 215,
    src: '/music/프로폴리스(Original).mp3',
    lyrics: ['자연의 선물','상처를 치유하는','프로폴리스처럼','너의 음악이 나를 감싸','따스한 온기가 마음속 깊이','회복의 멜로디가 흐른다'],
    linerNotes: 'Named after propolis — the natural healing substance produced by bees — this original track embodies the concept of music as medicine. Warm, organic tones and gentle progressions create a deeply healing listening experience.',
    coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&q=80'
  }
]

const EQ_PRESETS: Record<string, number[]> = {
  FLAT:         [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  CLASSIC:      [65, 60, 55, 50, 48, 48, 52, 58, 62, 65],
  JAZZ:         [62, 58, 52, 58, 62, 65, 62, 58, 55, 52],
  ROCK:         [68, 72, 64, 52, 45, 48, 55, 62, 68, 72],
  POP:          [48, 45, 48, 54, 60, 62, 58, 52, 48, 45],
  'K-POP':      [52, 50, 52, 58, 62, 66, 64, 58, 54, 52],
  'HIP HOP':    [78, 82, 72, 55, 48, 52, 58, 62, 66, 70],
  EDM:          [75, 78, 68, 50, 56, 62, 68, 72, 70, 75],
  'LO-FI':      [55, 52, 48, 46, 50, 54, 52, 48, 44, 40],
  'VOCAL BOOST':[40, 38, 42, 54, 68, 74, 76, 72, 64, 55],
  AMBIENT:      [60, 58, 56, 54, 55, 58, 60, 62, 60, 58],
  CATHEDRAL:    [55, 58, 62, 65, 65, 62, 58, 55, 52, 50]
}

const PLAYLISTS = ['Featured', 'Retro Vibes', 'Eurodance Energy', 'Ambient Waves']

const AI_DJ_RESPONSES: Record<string, string> = {
  default: "반가워요! 주크박스에 어울리는 최상의 튠들을 가지고 대기 중입니다. 기분이나 들으실 분위기를 말씀해 주시면 멋지게 어택해 드릴게요.",
  rainy: "비 오는 깊은 밤 드라이브에는 감성을 자극하는 NoJ의 'Shine On' 리마스터 튠이 아주 일품이죠. 105 BPM 시티팝 리듬이 촉촉히 적셔줄 겁니다.",
  chill: "나른한 힐링 세션에는 역시 Lo-Fi 질감이 가득 묻어나는 '프로폴리스 오리지널'이나 '유리 정원'을 강력하게 추천해요. 편하게 감상해 보세요.",
  energy: "심장을 뛰게 하고 싶은 에너제틱한 타이밍이군요! Delight X의 'Midnight Breaker'를 준비했습니다. 128 BPM 일렉트로닉 비트로 질주해 보시죠.",
  space: "우주적인 몽환에 빠지고 싶다면 'Nirvana State 매시업'이나 'Midnight Mirage'가 최고의 선택입니다. 사운드 랩의 공간감 리버브를 켜고 빠져드세요."
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function VUMeter({ level, label, mode }: { level: number; label: string; mode: MediaType }) {
  const angle = -40 + level * 80 // -40deg to +40deg
  
  // Color theme based on mode
  const glowColor = mode === 'CD' ? 'rgba(0, 210, 255, 0.22)' : mode === 'TAPE' ? 'rgba(229, 143, 26, 0.22)' : 'rgba(220, 163, 52, 0.22)';
  
  return (
    <div className="vu-meter-hardware" style={{
      width: '130px',
      height: '75px',
      background: '#070a0e',
      border: '1.5px solid var(--panel-border)',
      borderRadius: '8px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `inset 0 0 15px rgba(0,0,0,0.9), 0 0 10px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: '4px',
      flexShrink: 0
    }}>
      {/* Backlight Glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at center bottom, ${glowColor} 0%, rgba(0,0,0,0) 80%)`,
        opacity: 0.5 + level * 0.5,
        transition: 'opacity 0.05s ease',
        pointerEvents: 'none'
      }} />

      {/* SVG Dial Face with detailed ticks */}
      <svg width="120" height="60" style={{ position: 'absolute', top: 5, zIndex: 1, pointerEvents: 'none' }}>
        {/* Curved Scale Arc */}
        <path d="M 15,50 A 45,45 0 0,1 105,50" fill="none" stroke="#253545" strokeWidth="1.2" strokeDasharray="1.5,1.5" />
        
        {/* Ticks & Text */}
        {/* -20dB */}
        <line x1="22" y1="42" x2="25" y2="44" stroke="#4a657e" strokeWidth="1.2" />
        <text x="23" y="52" fill="#4a657e" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">-20</text>
        
        {/* -10dB */}
        <line x1="34" y1="28" x2="37" y2="31" stroke="#4a657e" strokeWidth="1.2" />
        <text x="32" y="38" fill="#4a657e" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">-10</text>
        
        {/* -5dB */}
        <line x1="50" y1="18" x2="52" y2="22" stroke="#4a657e" strokeWidth="1.2" />
        <text x="47" y="27" fill="#4a657e" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">-5</text>
        
        {/* 0dB */}
        <line x1="70" y1="18" x2="68" y2="22" stroke="#ff3b30" strokeWidth="1.8" />
        <text x="73" y="27" fill="#ff3b30" fontSize="7" fontWeight="bold" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">0</text>
        
        {/* +3dB */}
        <line x1="86" y1="28" x2="83" y2="31" stroke="#ff3b30" strokeWidth="1.2" />
        <text x="88" y="38" fill="#ff3b30" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">+3</text>
        
        {/* +5dB (Warning peak) */}
        <line x1="98" y1="42" x2="94" y2="44" stroke="#ff3b30" strokeWidth="1.2" />
        <text x="97" y="52" fill="#ff3b30" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">+5</text>

        {/* Peak Indicator LED inside VU */}
        <circle cx="60" cy="10" r="2" fill={level > 0.82 ? '#ff3b30' : '#221111'} style={{
          boxShadow: level > 0.82 ? '0 0 6px #ff3b30' : 'none',
          transition: 'fill 0.05s ease'
        }} />
      </svg>
      
      {/* Pivot base cap */}
      <div style={{
        position: 'absolute',
        bottom: '-12px',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #252e3c 40%, #080a0e 80%)',
        border: '1px solid var(--panel-border)',
        zIndex: 3
      }} />

      {/* Moving needle */}
      <div className="vu-needle" style={{
        position: 'absolute',
        bottom: '2px',
        left: '50%',
        width: '1px',
        height: '52px',
        background: level > 0.82 ? '#ff3b30' : '#a0b0c5',
        transformOrigin: 'bottom center',
        transform: `translateX(-50%) rotate(${angle}deg)`,
        transition: 'transform 0.08s cubic-bezier(0.15, 0.85, 0.45, 1)',
        boxShadow: level > 0.82 ? '0 0 4px #ff3b30' : '0 0 1px rgba(0,0,0,0.5)',
        zIndex: 2
      }} />

      {/* Gloss glass reflection overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 50%, rgba(0,0,0,0) 51%, rgba(0,0,0,0.12) 100%)',
        zIndex: 4,
        pointerEvents: 'none'
      }} />

      {/* Label overlay */}
      <div style={{ 
        fontSize: '8px', 
        color: 'var(--text-dim)', 
        zIndex: 5, 
        fontWeight: 800, 
        fontFamily: "'Outfit', sans-serif",
        letterSpacing: '1px',
        background: 'rgba(5, 8, 12, 0.85)',
        padding: '1px 6px',
        borderRadius: '4px',
        border: '0.5px solid rgba(255,255,255,0.05)',
        marginBottom: '2px'
      }}>{label}</div>
    </div>
  )
}

function WaveformCanvas({ isPlaying, audioData, mode }: { isPlaying: boolean; audioData: Uint8Array | null; mode: MediaType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dataRef = useRef<Uint8Array | null>(null)
  useEffect(() => { dataRef.current = audioData }, [audioData])

  const colorLP   = '#dca334'
  const colorCD   = '#00d2ff'
  const colorTAPE = '#cbd5e1'
  const color = mode === 'CD' ? colorCD : mode === 'TAPE' ? colorTAPE : colorLP

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio

    let t = 0
    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      t += 0.05

      const bars = 50
      for (let i = 0; i < bars; i++) {
        let amp = 0
        if (dataRef.current && isPlaying) {
          const sampleRate = 44100
          const nyquist = sampleRate / 2
          const fMin = 5
          const fMax = 18000
          
          // Logarithmic frequency for this bar
          const f = fMin * Math.pow(fMax / fMin, i / (bars - 1))
          
          const binCount = dataRef.current.length
          const exactIndex = (f / nyquist) * binCount
          
          // Linear interpolation between adjacent frequency bins
          const idxL = Math.floor(exactIndex)
          const idxR = Math.min(binCount - 1, idxL + 1)
          const ratio = exactIndex - idxL
          const valL = dataRef.current[idxL] || 0
          const valR = dataRef.current[idxR] || 0
          const rawVal = valL * (1 - ratio) + valR * ratio

          const ampNormalized = rawVal / 255
          // Logarithmic compression mapping (y-axis log scaling)
          const logAmp = Math.log10(1 + 9 * ampNormalized)

          // Treble boost to keep high frequencies responsive
          const trebleBoost = 1.0 + (i / bars) * 0.55
          amp = Math.min(1.0, logAmp * trebleBoost)
        } else if (isPlaying) {
          amp = 0.05 + Math.abs(Math.sin(i * 0.2 + t)) * 0.35
          amp = Math.log10(1 + 9 * amp)
        } else {
          amp = 0.03 + Math.abs(Math.sin(i * 0.5)) * 0.02
          amp = Math.log10(1 + 9 * amp)
        }
        const bH = Math.max(3, amp * H * 0.85)
        const x = (i / bars) * W
        const bW = (W / bars) - 2

        const grad = ctx.createLinearGradient(0, H - bH, 0, H)
        grad.addColorStop(0, color)
        grad.addColorStop(0.5, `${color}bb`)
        grad.addColorStop(1, `${color}18`)
        ctx.fillStyle = grad
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, H - bH, bW, bH, 3)
        else ctx.rect(x, H - bH, bW, bH)
        ctx.fill()
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, mode, color])

  return <canvas ref={canvasRef} className="waveform-canvas" />
}

const Screw = ({ style }: { style: React.CSSProperties }) => {
  // Generate a fixed random rotation once per screw instance to look authentic
  const rotation = useMemo(() => Math.floor(Math.random() * 360), [])
  return (
    <div style={{
      position: 'absolute',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, #e2e8f0 30%, #94a3b8 75%, #475569 100%)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 4,
      ...style
    }}>
      {/* Screw slot line rotated randomly */}
      <div style={{
        width: '6.5px',
        height: '1.2px',
        backgroundColor: '#1e293b',
        opacity: 0.75,
        transform: `rotate(${rotation}deg)`
      }} />
    </div>
  )
}

function StereoVUMeters({ isPlaying, audioData, onToggleLight }: { isPlaying: boolean; audioData: Uint8Array | null; onToggleLight?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dataRef = useRef<Uint8Array | null>(null)
  
  // Light switch state
  const [lightOn, setLightOn] = useState(true)
  const lightOnRef = useRef(lightOn)
  useEffect(() => {
    lightOnRef.current = lightOn
  }, [lightOn])

  // Physics states for Left and Right needles (current position and velocity)
  const leftLevel = useRef<number>(0)
  const rightLevel = useRef<number>(0)
  const leftVel = useRef<number>(0)
  const rightVel = useRef<number>(0)

  useEffect(() => {
    dataRef.current = audioData
  }, [audioData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height

      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)

      const currentLightOn = lightOnRef.current

      // 1. Determine target levels for needles based on stereo FFT buckets
      let targetLeft = 0
      let targetRight = 0

      if (isPlaying) {
        if (dataRef.current) {
          const len = dataRef.current.length
          
          // Use highly active low-mid frequency bands
          let sumL = 0, countL = 0
          let sumR = 0, countR = 0
          
          const limitL = Math.floor(len * 0.40)
          const limitR = Math.floor(len * 0.50)
          
          for (let i = 1; i < limitL; i++) {
            sumL += dataRef.current[i] || 0
            countL++
          }
          for (let i = 4; i < limitR; i++) {
            sumR += dataRef.current[i] || 0
            countR++
          }
          
          const avgL = countL > 0 ? (sumL / countL) / 255 : 0
          const avgR = countR > 0 ? (sumR / countR) / 255 : 0
          
          const time = Date.now() * 0.003
          const modL = 0.92 + Math.sin(time) * 0.08
          const modR = 0.92 + Math.cos(time * 0.85) * 0.08
          
          const curveL = Math.pow(avgL, 0.78)
          const curveR = Math.pow(avgR, 0.78)
          
          targetLeft = Math.min(1.02, curveL * 1.48 * modL)
          targetRight = Math.min(1.02, curveR * 1.48 * modR)
          
          if (targetLeft > 0.02) targetLeft = 0.02 + targetLeft * 0.98
          if (targetRight > 0.02) targetRight = 0.02 + targetRight * 0.98
        } else {
          const t = Date.now() * 0.006
          targetLeft = 0.3 + Math.abs(Math.sin(t) * Math.cos(t * 0.5)) * 0.55
          targetRight = 0.25 + Math.abs(Math.cos(t * 0.8) * Math.sin(t * 0.3)) * 0.6
        }
      } else {
        targetLeft = 0.015 + Math.sin(Date.now() * 0.005) * 0.005
        targetRight = 0.015 + Math.cos(Date.now() * 0.005) * 0.005
      }

      // 2. Heavy-duty physical mechanical inertia system
      const spring = 0.28
      const damping = 0.58

      const forceL = (targetLeft - leftLevel.current) * spring
      leftVel.current = (leftVel.current + forceL) * damping
      leftLevel.current += leftVel.current
      leftLevel.current = Math.max(0, Math.min(1.1, leftLevel.current))

      const forceR = (targetRight - rightLevel.current) * spring
      rightVel.current = (rightVel.current + forceR) * damping
      rightLevel.current += rightVel.current
      rightLevel.current = Math.max(0, Math.min(1.1, rightLevel.current))

      // 3. Draw Dual VU meter windows
      const padding = 16
      const gap = 52
      const meterW = (W - padding * 2 - gap) / 2

      const drawSingleMeter = (xStart: number, width: number, currentVal: number, label: string) => {
        // Define centered bounding box for the recessed meter window
        const meterH = H * 0.80
        const yStart = (H - meterH) / 2
        const rx = xStart + 4
        const ry = yStart
        const rw = width - 8
        const rh = meterH

        const radius = rh * 0.86
        const cx = rx + rw / 2
        const cy = ry + rh - 6

        // Draw recessed bevel/border around the window
        const rimGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh)
        rimGrad.addColorStop(0, '#5a493a')
        rimGrad.addColorStop(0.3, '#ebd48a')
        rimGrad.addColorStop(0.5, '#2e241c')
        rimGrad.addColorStop(0.7, '#ebd48a')
        rimGrad.addColorStop(1, '#221912')
        ctx.strokeStyle = rimGrad
        ctx.lineWidth = 2.0
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, 6)
        } else {
          ctx.rect(rx, ry, rw, rh)
        }
        ctx.stroke()

        // Clip to the recessed window
        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, 6)
        } else {
          ctx.rect(rx, ry, rw, rh)
        }
        ctx.clip()

        // Radial gradient backing for dial face
        const faceGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, radius * 1.1)
        if (currentLightOn) {
          faceGrad.addColorStop(0, '#fef9e7')   // Warm soft glow center
          faceGrad.addColorStop(0.7, '#fadc80') // Vintage incandescent amber
          faceGrad.addColorStop(1, '#c2901a')   // Rich bronze edge shadow
        } else {
          faceGrad.addColorStop(0, '#36302b')   // Dark unlit warm charcoal
          faceGrad.addColorStop(0.7, '#241f1b') // Coffee brown
          faceGrad.addColorStop(1, '#14110f')   // Deep shadow edge
        }
        ctx.fillStyle = faceGrad
        ctx.fill()

        // Recessed inner shadow stroke
        ctx.strokeStyle = currentLightOn ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.6)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, radius * 1.05, Math.PI * 1.2, Math.PI * 1.8)
        ctx.stroke()

        ctx.save()
        ctx.translate(cx, cy)

        const startAngle = Math.PI * 1.22
        const endAngle = Math.PI * 1.78
        const divisions = 20

        ctx.font = `bold ${Math.max(7.5, radius * 0.11)}px 'JetBrains Mono', monospace`
        ctx.textAlign = 'center'

        for (let i = 0; i <= divisions; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / divisions)
          const pct = i / divisions
          const isRed = pct >= 0.75

          if (currentLightOn) {
            ctx.strokeStyle = isRed ? '#d32f2f' : 'rgba(18,12,8,0.75)'
          } else {
            ctx.strokeStyle = isRed ? '#702222' : 'rgba(255,255,255,0.18)'
          }
          ctx.lineWidth = i % 4 === 0 ? 1.8 : 0.8
          
          const tickLen = i % 4 === 0 ? radius * 0.10 : radius * 0.06
          const rTick = radius * 0.92
          
          const x1 = Math.cos(angle) * rTick
          const y1 = Math.sin(angle) * rTick
          const x2 = Math.cos(angle) * (rTick - tickLen)
          const y2 = Math.sin(angle) * (rTick - tickLen)

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()

          if (i % 4 === 0) {
            let dbText = ''
            if (i === 0) dbText = '-20'
            else if (i === 4) dbText = '-10'
            else if (i === 8) dbText = '-5'
            else if (i === 12) dbText = '-3'
            else if (i === 15) dbText = '0'
            else if (i === 18) dbText = '+1'
            else if (i === 20) dbText = '+3'

            if (dbText) {
              if (currentLightOn) {
                ctx.fillStyle = isRed ? '#d32f2f' : 'rgba(18,12,8,0.85)'
              } else {
                ctx.fillStyle = isRed ? '#702222' : 'rgba(255,255,255,0.15)'
              }
              const textDist = radius * 0.20
              const tx = Math.cos(angle) * (rTick - textDist)
              const ty = Math.sin(angle) * (rTick - textDist)
              ctx.fillText(dbText, tx, ty + 2.5)
            }
          }
        }

        // Highlight dial strips
        ctx.strokeStyle = currentLightOn ? 'rgba(18,12,8,0.8)' : 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, 0, radius * 0.92, startAngle, startAngle + (endAngle - startAngle) * 0.75)
        ctx.stroke()

        ctx.strokeStyle = currentLightOn ? '#d32f2f' : '#702222'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(0, 0, radius * 0.92, startAngle + (endAngle - startAngle) * 0.75, endAngle)
        ctx.stroke()

        ctx.fillStyle = currentLightOn ? 'rgba(18,12,8,0.5)' : 'rgba(255,255,255,0.12)'
        ctx.font = `bold ${Math.max(8.5, radius * 0.135)}px 'Outfit', sans-serif`
        ctx.fillText('ANALOG VU', 0, -radius * 0.44)
        
        ctx.fillStyle = currentLightOn ? 'rgba(18,12,8,0.4)' : 'rgba(255,255,255,0.1)'
        ctx.font = `800 ${Math.max(9.5, radius * 0.155)}px 'JetBrains Mono', monospace`
        ctx.fillText(label, 0, -radius * 0.24)

        ctx.restore()

        // 4. Draw pivot pointer needle
        const needleAngle = startAngle + (endAngle - startAngle) * currentVal
        
        ctx.save()
        if (currentLightOn) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
          ctx.shadowBlur = 3.5
          ctx.shadowOffsetX = 1.0
          ctx.shadowOffsetY = 1.2
          ctx.strokeStyle = '#bf1515' // Vibrant warm red needle
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
          ctx.shadowBlur = 1.5
          ctx.shadowOffsetX = 0.5
          ctx.shadowOffsetY = 0.5
          ctx.strokeStyle = '#631616' // Muted dark red needle
        }
        
        ctx.lineWidth = Math.max(1.2, radius * 0.024)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(needleAngle) * radius, cy + Math.sin(needleAngle) * radius)
        ctx.stroke()
        ctx.restore()

        // Responsive pivot caps
        ctx.fillStyle = currentLightOn ? '#282522' : '#1a1816'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(5, radius * 0.095), 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = currentLightOn ? '#827f75' : '#4d4b45'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(2, radius * 0.035), 0, Math.PI * 2)
        ctx.fill()

        ctx.restore() // Restore clipped context
      }

      drawSingleMeter(padding, meterW, leftLevel.current, 'L-CH')
      drawSingleMeter(padding + meterW + gap, meterW, rightLevel.current, 'R-CH')

      ctx.restore()
      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '115px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '2.5px solid #3d352e', // Brushed metallic frame
      background: 'radial-gradient(circle at center, #2e2621 0%, #161210 100%)', // Dark leather backing color
      boxShadow: '0 10px 30px rgba(0,0,0,0.9), inset 0 2px 4px rgba(255,255,255,0.04), inset 0 -2px 6px rgba(0,0,0,0.7)'
    }}>
      {/* Fine grain noise/leather texture overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)',
        opacity: 0.75,
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* Glass reflections overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.12) 46%, rgba(0,0,0,0.2) 100%)',
        pointerEvents: 'none',
        zIndex: 3
      }} />

      {/* Corner screws */}
      <Screw style={{ top: '6px', left: '6px' }} />
      <Screw style={{ top: '6px', right: '6px' }} />
      <Screw style={{ bottom: '6px', left: '6px' }} />
      <Screw style={{ bottom: '6px', right: '6px' }} />

      {/* Center LIGHT toggle rotary aluminum knob switch */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Red LED indicator above the knob */}
        <div style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          backgroundColor: lightOn ? '#ef4444' : '#3f0f0f',
          boxShadow: lightOn ? '0 0 6px #ef4444, 0 0 12px #ef4444' : 'none',
          border: '0.8px solid #1e293b',
          transition: 'all 0.3s ease',
          marginBottom: '4px'
        }} />

        <button
          onClick={() => {
            setLightOn(!lightOn)
            onToggleLight?.()
          }}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            // High-end brushed metal radial conic gradient
            background: 'conic-gradient(from 0deg, #f2f2f2 0deg, #cbd5e1 45deg, #94a3b8 90deg, #cbd5e1 135deg, #f1f5f9 180deg, #94a3b8 225deg, #475569 270deg, #cbd5e1 315deg, #f2f2f2 360deg)',
            border: '2px solid #3d352e', // outer bezel ring
            boxShadow: '0 4px 8px rgba(0,0,0,0.65), inset 0 1px 1px white, inset 0 -1.5px 2px rgba(0,0,0,0.45)',
            cursor: 'pointer',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.25)',
            transform: `rotate(${lightOn ? 45 : -45}deg)`,
            padding: 0,
          }}
          title="Rotate knob to toggle VU lamp"
        >
          {/* Machined indicator line */}
          <div style={{
            position: 'absolute',
            top: '2px',
            left: '50%',
            width: '2px',
            height: '8px',
            background: '#1e293b',
            transform: 'translateX(-50%)',
            borderRadius: '1px'
          }} />
        </button>

        <span style={{
          fontSize: '7.5px',
          color: 'rgba(255,255,255,0.45)',
          fontWeight: 900,
          fontFamily: "'Outfit', sans-serif",
          letterSpacing: '0.6px',
          textShadow: '0 1px 1px rgba(0,0,0,0.5)',
          marginTop: '2px'
        }}>LIGHT</span>
      </div>

      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 2, background: 'transparent' }} />
    </div>
  )
}

export default function Home() {
  const [tracks, setTracks]         = useState<Track[]>(INITIAL_TRACKS)
  const [track, setTrack]           = useState<Track>(INITIAL_TRACKS[0])
  const [isPlaying, setPlaying]     = useState(false)
  const [mediaType, setMediaType]   = useState<MediaType>(INITIAL_TRACKS[0].mediaPref)
  const [currentTime, setTime]      = useState(0)
  const [volume, setVolume]         = useState(0.85)
  const [muted, setMuted]           = useState(false)
  const [repeat, setRepeat]         = useState(false)
  const [shuffle, setShuffle]       = useState(false)
  const [activePlaylist, setActivePlaylist] = useState('Featured')
  const [aiQuery, setAiQuery]       = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiTalking, setIsAiTalking] = useState(false)
  const [audioData, setAudioData]   = useState<Uint8Array | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    const playerEl = document.querySelector('.center-player')
    if (!playerEl) return
    if (!document.fullscreenElement) {
      playerEl.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch((err) => {
        console.error("Failed to enter fullscreen:", err)
      })
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }
  
  // Custom states for gradual acceleration/deceleration CD spin
  const prevPlayingRef = useRef(isPlaying)
  const [cdSpinClass, setCdSpinClass] = useState('idle')
  
  useEffect(() => {
    if (isPlaying) {
      setCdSpinClass('spinning')
    } else if (prevPlayingRef.current && !isPlaying) {
      setCdSpinClass('stopping')
      const timer = setTimeout(() => {
        setCdSpinClass('idle')
      }, 1800) // matches our stopping animation duration
      return () => clearTimeout(timer)
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying])

  // 3D Cover Flow active focused card state
  const [focusedTrackId, setFocusedTrackId] = useState<number>(INITIAL_TRACKS[0].id)
  const [dragOffset, setDragOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  
  useEffect(() => {
    setFocusedTrackId(track.id)
  }, [track])

  // Synchronize track changes to the audio element DOM source safely,
  // preventing React from resetting the source during flight loading transitions.
  useEffect(() => {
    if (audioRef.current && track) {
      const getPath = (urlStr: string) => {
        try {
          return new URL(urlStr, window.location.href).pathname
        } catch {
          return urlStr
        }
      }
      if (getPath(audioRef.current.src) !== getPath(track.src)) {
        audioRef.current.src = track.src
      }
    }
  }, [track])

  const navigateCabinet = (direction: number) => {
    if (shuffle) {
      // Pick a random track index that is different from current
      const currentIdx = tracks.findIndex(t => t.id === focusedTrackId)
      let randIdx = currentIdx
      if (tracks.length > 1) {
        while (randIdx === currentIdx) {
          randIdx = Math.floor(Math.random() * tracks.length)
        }
      }
      const targetTrack = tracks[randIdx]
      setFocusedTrackId(targetTrack.id)
      playMechanicalSound('scroll') // rapid fanning sound "촤라라락"!
    } else {
      const currentIdx = tracks.findIndex(t => t.id === focusedTrackId)
      if (currentIdx === -1) return
      let newIdx = currentIdx + direction
      if (newIdx < 0) newIdx = tracks.length - 1
      if (newIdx >= tracks.length) newIdx = 0
      
      const targetTrack = tracks[newIdx]
      setFocusedTrackId(targetTrack.id)
      playMechanicalSound('button') // soft click sound!
    }
  }
  
  // 10-Band EQ & DSP Custom States
  const [eqGains, setEqGains]       = useState<number[]>([50, 50, 50, 50, 50, 50, 50, 50, 50, 50])
  const eqGainsRef                  = useRef<number[]>(eqGains)
  useEffect(() => {
    eqGainsRef.current = eqGains
  }, [eqGains])

  const [activePreset, setPreset]   = useState('FLAT')
  const [customPresets, setCustomPresets] = useState<Record<string, number[]>>({
    'WARM TUBE': [65, 62, 56, 50, 46, 44, 46, 52, 58, 62],
    'DANCE BOOM': [78, 82, 70, 50, 58, 65, 72, 65, 55, 48]
  })
  const [showSavePresetModal, setShowSavePresetModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  // Sound Effects States
  const [reverbLevel, setReverbLevel]   = useState(15)      // 0-100
  const [reverbPreset, setReverbPreset] = useState<'ROOM' | 'HALL' | 'CATHEDRAL' | 'CONCERT' | 'STUDIO'>('ROOM')
  const [echoLevel, setEchoLevel]       = useState(20)      // 0-100
  const [bassBoost, setBassBoost]       = useState(20)      // 0-100
  const [vocalClarity, setVocalClarity] = useState(30)      // 0-100
  const [loudness, setLoudness]         = useState(true)

  // Responsive Collapsible AI Sound Lab Sidebar state
  const [isAiLabOpen, setIsAiLabOpen] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      // Auto collapse if screen is narrow to keep the main photorealistic dashboard locked
      if (window.innerWidth < 1400) {
        setIsAiLabOpen(false)
      } else {
        setIsAiLabOpen(true)
      }
    }
    // Set initial size
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Edit Metadata Modal States
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editGenre, setEditGenre] = useState('')
  const [editBpm, setEditBpm] = useState(100)
  const [editKey, setEditKey] = useState('A Minor')
  const [editCover, setEditCover] = useState('')
  const [editLyricsText, setEditLyricsText] = useState('')

  // AI Lyrics Generating State
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false)
  const [generatedTracks, setGeneratedTracks] = useState<Record<number, boolean>>({})

  // 3D Album Cover Cylinder Slot-Machine States
  const [isCylinderSpinning, setIsCylinderSpinning] = useState(false)
  const [rollingIndex, setRollingIndex] = useState(0)
  const [cylinderDeg, setCylinderDeg] = useState(0)
  // 3D Physical Media Slot-Machine Flight Loader states
  const [showMediaFlight, setShowMediaFlight] = useState(false)
  const [flightType, setFlightType] = useState<MediaType>('LP')
  const [isDeckImpact, setIsDeckImpact] = useState(false)
  const [loadingTrackId, setLoadingTrackId] = useState<number | null>(null)
  // Audio nodes & Canvas refs
  const audioRef    = useRef<HTMLAudioElement>(null)
  const ctxRef      = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])
  const bassBoostRef   = useRef<BiquadFilterNode | null>(null)
  const vocalClarityRef = useRef<BiquadFilterNode | null>(null)
  const dryGainRef     = useRef<GainNode | null>(null)
  const wetGainRef     = useRef<GainNode | null>(null)
  const convolverRef   = useRef<ConvolverNode | null>(null)
  const echoWetGainRef = useRef<GainNode | null>(null)
  const compressorRef  = useRef<DynamicsCompressorNode | null>(null)
  
  const rtaCanvasRef   = useRef<HTMLCanvasElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const rafRef         = useRef<number>(0)

  const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  // Synthesize algorithmic reverb impulse response buffer
  const createImpulseResponse = useCallback((ctx: AudioContext, duration: number, decay: number) => {
    const sampleRate = ctx.sampleRate
    const length = sampleRate * duration
    const impulse = ctx.createBuffer(2, length, sampleRate)
    const left = impulse.getChannelData(0)
    const right = impulse.getChannelData(1)
    for (let i = 0; i < length; i++) {
      const percent = i / length
      const val = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay)
      left[i] = val
      right[i] = val * 0.9 // Stereo wide offset
    }
    return impulse
  }, [])

  // Setup master audio context
  const initAudio = useCallback(() => {
    if (ctxRef.current || !audioRef.current) return
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(audioRef.current)

    // Series 10-Band EQ filters
    const filters: BiquadFilterNode[] = []
    let lastNode: AudioNode = src

    EQ_FREQS.forEach((freq) => {
      const filter = ctx.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1.2
      filter.gain.value = 0
      
      lastNode.connect(filter)
      lastNode = filter
      filters.push(filter)
    })
    eqFiltersRef.current = filters

    // Lowshelf Bass Boost
    const bassB = ctx.createBiquadFilter()
    bassB.type = 'lowshelf'
    bassB.frequency.value = 80
    bassB.gain.value = 0
    lastNode.connect(bassB)
    bassBoostRef.current = bassB

    // Peaking Vocal Clarity
    const vocalC = ctx.createBiquadFilter()
    vocalC.type = 'peaking'
    vocalC.frequency.value = 2000
    vocalC.Q.value = 1.0
    vocalC.gain.value = 0
    bassB.connect(vocalC)
    vocalClarityRef.current = vocalC

    // Parallel Reverb Dry/Wet Matrix
    const dryGain = ctx.createGain()
    dryGain.gain.value = 1.0
    vocalC.connect(dryGain)
    dryGainRef.current = dryGain

    const wetGain = ctx.createGain()
    wetGain.gain.value = 0.15 // Default wet mix ratio
    wetGainRef.current = wetGain

    const convolver = ctx.createConvolver()
    convolver.buffer = createImpulseResponse(ctx, 1.2, 2.0)
    vocalC.connect(convolver)
    convolver.connect(wetGain)
    convolverRef.current = convolver

    // Parallel Delay / Echo Feedback Loop Matrix
    const delayNode = ctx.createDelay(1.0)
    delayNode.delayTime.value = 0.30 // Gorgeous rhythmic 300ms delay time
    
    const feedbackGain = ctx.createGain()
    feedbackGain.gain.value = 0.38 // High-fidelity feedback decay
    
    const echoWetGain = ctx.createGain()
    echoWetGain.gain.value = 0.12 // Default echo wet mix
    echoWetGainRef.current = echoWetGain

    vocalC.connect(delayNode)
    delayNode.connect(feedbackGain)
    feedbackGain.connect(delayNode) // Delay feedback loop
    delayNode.connect(echoWetGain)

    // Merge signals
    const mergeNode = ctx.createGain()
    dryGain.connect(mergeNode)
    wetGain.connect(mergeNode)
    echoWetGain.connect(mergeNode)

    // Loudness Dynamic Optimizer
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.knee.value = 30
    compressor.ratio.value = 3
    compressorRef.current = compressor
    mergeNode.connect(compressor)

    // Visual Analyser
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    compressor.connect(an)
    an.connect(ctx.destination)

    ctxRef.current = ctx
    analyserRef.current = an

    // Run initial filter values
    gainsToFilters(eqGainsRef.current)
    applyEffectsToHardware()
  }, [createImpulseResponse])

  const sliderToGain = (v: number) => ((v - 50) / 50) * 15

  const gainsToFilters = (gains: number[]) => {
    if (!ctxRef.current) return
    gains.forEach((val, idx) => {
      if (eqFiltersRef.current[idx]) {
        eqFiltersRef.current[idx].gain.setTargetAtTime(
          sliderToGain(val),
          ctxRef.current!.currentTime,
          0.02
        )
      }
    })
  }

  const applyEffectsToHardware = () => {
    if (!ctxRef.current) return
    const ctx = ctxRef.current
    if (bassBoostRef.current) {
      const db = (bassBoost / 100) * 15
      bassBoostRef.current.gain.setTargetAtTime(db, ctx.currentTime, 0.02)
    }
    if (vocalClarityRef.current) {
      const db = (vocalClarity / 100) * 15
      vocalClarityRef.current.gain.setTargetAtTime(db, ctx.currentTime, 0.02)
    }
    if (wetGainRef.current && dryGainRef.current) {
      const wetRatio = reverbLevel / 100
      wetGainRef.current.gain.setTargetAtTime(wetRatio * 0.8, ctx.currentTime, 0.05)
      dryGainRef.current.gain.setTargetAtTime(1.0 - (wetRatio * 0.3), ctx.currentTime, 0.05)
    }
    if (echoWetGainRef.current) {
      const echoRatio = echoLevel / 100
      echoWetGainRef.current.gain.setTargetAtTime(echoRatio * 0.65, ctx.currentTime, 0.05)
    }
    if (compressorRef.current) {
      compressorRef.current.threshold.setTargetAtTime(loudness ? -24 : -12, ctx.currentTime, 0.05)
      compressorRef.current.ratio.setTargetAtTime(loudness ? 6 : 3, ctx.currentTime, 0.05)
    }
  }

  const updateEQBand = (index: number, val: number) => {
    const nextGains = [...eqGains]
    nextGains[index] = val
    setEqGains(nextGains)
    setPreset('CUSTOM')

    if (eqFiltersRef.current[index] && ctxRef.current) {
      eqFiltersRef.current[index].gain.setTargetAtTime(
        sliderToGain(val),
        ctxRef.current.currentTime,
        0.02
      )
    }
  }

  // Update Reverb dynamically
  const updateReverb = (val: number, type: 'ROOM' | 'HALL' | 'CATHEDRAL' | 'CONCERT' | 'STUDIO') => {
    setReverbLevel(val)
    setReverbPreset(type)

    if (!ctxRef.current || !convolverRef.current || !wetGainRef.current || !dryGainRef.current) return
    const ctx = ctxRef.current
    let duration = 1.2, decay = 2.0
    if (type === 'HALL') { duration = 2.5; decay = 3.0 }
    else if (type === 'CATHEDRAL') { duration = 4.5; decay = 4.5 }
    else if (type === 'CONCERT') { duration = 3.5; decay = 3.5 }
    else if (type === 'STUDIO') { duration = 0.4; decay = 1.0 }

    convolverRef.current.buffer = createImpulseResponse(ctx, duration, decay)
    const wetRatio = val / 100
    wetGainRef.current.gain.setTargetAtTime(wetRatio * 0.8, ctx.currentTime, 0.05)
    dryGainRef.current.gain.setTargetAtTime(1.0 - (wetRatio * 0.3), ctx.currentTime, 0.05)
  }

  // Auto trigger dynamic changes on sliders
  useEffect(() => {
    applyEffectsToHardware()
  }, [bassBoost, vocalClarity, echoLevel, loudness])

  // Real-Time Analyzer RTA spectrum rendering behind the sliders
  useEffect(() => {
    const rtaCanvas = rtaCanvasRef.current
    if (!rtaCanvas) return
    rtaCanvas.width = rtaCanvas.offsetWidth
    rtaCanvas.height = rtaCanvas.offsetHeight
    const rtaCtx = rtaCanvas.getContext('2d')
    if (!rtaCtx) return

    let active = true
    const drawRta = () => {
      if (!active) return
      rtaCtx.clearRect(0, 0, rtaCanvas.width, rtaCanvas.height)
      
      if (analyserRef.current && isPlaying) {
        const bufferLength = analyserRef.current.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        analyserRef.current.getByteFrequencyData(dataArray)

        rtaCtx.beginPath()
        const sliceWidth = rtaCanvas.width / 10
        rtaCtx.lineWidth = 2.5
        const colorLP   = 'rgba(220, 163, 52, 0.3)'
        const colorCD   = 'rgba(0, 210, 255, 0.35)'
        const colorTAPE = 'rgba(203, 213, 225, 0.3)'
        const strokeColor = mediaType === 'CD' ? colorCD : mediaType === 'TAPE' ? colorTAPE : colorLP
        rtaCtx.strokeStyle = strokeColor

        for (let i = 0; i < 10; i++) {
          // Average energy in frequency buckets corresponding to the 10 bands
          const bucketIndex = Math.floor((i / 10) * (bufferLength / 2))
          const val = dataArray[bucketIndex] ?? 0
          
          // Logarithmic attenuation curve to balance the bass range and widen dynamic headroom
          let factor = 1.0
          if (i === 0) factor = 0.38
          else if (i === 1) factor = 0.46
          else if (i === 2) factor = 0.60
          else if (i === 3) factor = 0.72
          else if (i === 4) factor = 0.82
          else if (i === 5) factor = 0.90
          
          const percent = (val / 255) * factor
          const y = rtaCanvas.height - (percent * rtaCanvas.height * 0.8)
          const x = i * sliceWidth + sliceWidth / 2

          if (i === 0) rtaCtx.moveTo(x, y)
          else rtaCtx.lineTo(x, y)
        }
        rtaCtx.stroke()
      }
      requestAnimationFrame(drawRta)
    }
    drawRta()
    return () => { active = false }
  }, [isPlaying, mediaType])

  // Dynamic frequency analyzer for VU levels
  const [vuLevels, setVuLevels] = useState<{ l: number; r: number }>({ l: 0, r: 0 })
  useEffect(() => {
    let active = true
    const tick = () => {
      if (!active) return
      if (analyserRef.current && isPlaying) {
        const d = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(d)
        setAudioData(d)
        
        // Split low and high energy for left/right fake balance VU
        const lEnergy = d.slice(0, 10).reduce((a, b) => a + b, 0) / (10 * 255)
        const rEnergy = d.slice(10, 20).reduce((a, b) => a + b, 0) / (10 * 255)
        
        // Logarithmic power damping and 0.88 cap to provide ample headroom and prevent pegging
        const lVal = Math.pow(lEnergy, 1.25) * 0.88
        const rVal = Math.pow(rEnergy, 1.25) * 0.88
        
        setVuLevels({
          l: Math.max(0, Math.min(0.88, lVal)),
          r: Math.max(0, Math.min(0.88, rVal))
        })
      } else {
        setVuLevels(v => ({
          l: Math.max(0, v.l - 0.08),
          r: Math.max(0, v.r - 0.08)
        }))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  const playMechanicalSound = (type: 'button' | 'clunk' | 'slide' | 'needle' | 'scroll') => {
    if (!ctxRef.current) return
    const ctx = ctxRef.current
    try {
      if (type === 'button') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(550, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04)
        gain.gain.setValueAtTime(0.04, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
        osc.start()
        osc.stop(ctx.currentTime + 0.045)
      } else if (type === 'clunk') {
        const osc = ctx.createOscillator()
        const noise = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const gain = ctx.createGain()
        const bufferSize = Math.floor(ctx.sampleRate * 0.06)
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
        noise.buffer = buffer
        filter.type = 'bandpass'
        filter.frequency.value = 160
        osc.frequency.setValueAtTime(90, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.06)
        noise.connect(filter)
        filter.connect(gain)
        osc.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.18, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
        noise.start()
        osc.start()
        noise.stop(ctx.currentTime + 0.065)
        osc.stop(ctx.currentTime + 0.065)
      } else if (type === 'slide') {
        const osc1 = ctx.createOscillator()
        const osc2 = ctx.createOscillator()
        const gain = ctx.createGain()
        osc1.frequency.setValueAtTime(240, ctx.currentTime)
        osc1.frequency.linearRampToValueAtTime(320, ctx.currentTime + 0.35)
        osc2.frequency.setValueAtTime(200, ctx.currentTime)
        osc2.frequency.linearRampToValueAtTime(280, ctx.currentTime + 0.35)
        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.008, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.015, ctx.currentTime + 0.15)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38)
        osc1.start()
        osc2.start()
        osc1.stop(ctx.currentTime + 0.4)
        osc2.stop(ctx.currentTime + 0.4)
      } else if (type === 'needle') {
        const noise = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const gain = ctx.createGain()
        const bufferSize = Math.floor(ctx.sampleRate * 0.2)
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.1 + (Math.random() > 0.99 ? (Math.random() * 2 - 1) * 0.5 : 0)
        }
        noise.buffer = buffer
        filter.type = 'bandpass'
        filter.frequency.value = 900
        filter.Q.value = 0.6
        noise.connect(filter)
        filter.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.02, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        noise.start()
        noise.stop(ctx.currentTime + 0.22)
      } else if (type === 'scroll') {
        // Procedural "촤라라락" card-flipping mechanical scroll sound cascade
        const numClicks = 22
        const startTime = ctx.currentTime
        let delay = 0
        
        for (let i = 0; i < numClicks; i++) {
          const clickTime = startTime + delay
          const noise = ctx.createBufferSource()
          const filter = ctx.createBiquadFilter()
          const gain = ctx.createGain()
          
          const bufferSize = Math.floor(ctx.sampleRate * 0.015) // snappy 15ms click
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
          const data = buffer.getChannelData(0)
          for (let k = 0; k < bufferSize; k++) {
            data[k] = (Math.random() * 2 - 1)
          }
          
          noise.buffer = buffer
          filter.type = 'highpass'
          filter.frequency.value = 2400 // thin, pleasing sprocket click
          
          noise.connect(filter)
          filter.connect(gain)
          gain.connect(ctx.destination)
          
          const volume = 0.045 * (1 - (i / numClicks) * 0.3) // soft decay click cascade
          gain.gain.setValueAtTime(volume, clickTime)
          gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.012)
          
          noise.start(clickTime)
          noise.stop(clickTime + 0.015)
          
          // Exponential mechanical deceleration time curve
          delay += 0.04 + (i / numClicks) * 0.10
        }
      }
    } catch (e) {
      console.error('Failed to play mechanical audio sound:', e)
    }
  }

  const play = useCallback(() => {
    initAudio()
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
    audioRef.current?.play().catch(() => {})
    setPlaying(true)
  }, [initAudio])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  const toggle = () => isPlaying ? pause() : play()

  const selectTrack = (t: Track, forcePlay = true, isSequential = false) => {
    const shouldPlay = isPlaying || forcePlay
    
    // Set loading track state for high-end responsive feedback in sidebar listing
    setLoadingTrackId(t.id)
    
    // Synchronously change the source and start playing in muted state during user gesture
    // to unblock the browser autoplay policy for delayed playback
    if (shouldPlay && audioRef.current) {
      audioRef.current.src = t.src
      audioRef.current.muted = true
      const p = audioRef.current.play()
      if (p !== undefined) {
        p.catch(() => {})
      }
    } else if (audioRef.current) {
      audioRef.current.pause()
    }
    setPlaying(shouldPlay)

    // Trigger 3D Album Cover Flow Roll searching & clicking based on sequential adjacent vs random shuffle
    if (!isSequential) {
      triggerCoverFlowRoll(t)
    } else {
      // Immediately shift the virtual center focus smoothly to the adjacent card (0.65s CSS transition slides it)
      setFocusedTrackId(t.id)
    }

    // Trigger physical media sleeve flight animation.
    // The flying media sleeve matches the current active player mode (mediaType)!
    setFlightType(mediaType)
    setShowMediaFlight(true)

    // Synthesize early tactile mechanical sounds
    initAudio()
    const triggerTactileSounds = () => {
      // 0. Only play "촤라라락" mechanical search cascade if we are shuffling / jumping randomly
      if (!isSequential) {
        playMechanicalSound('scroll')
      } else {
        playMechanicalSound('button')
      }

      // 1. Initial solenoid push & whirring motorized slides
      playMechanicalSound('button')
      setTimeout(() => playMechanicalSound('slide'), 40)
      
      // 2. Heavy latch sound as media is halfway loaded (1.0s)
      setTimeout(() => playMechanicalSound('clunk'), 1000)
      
      // 3. Delicate stylus mechanical needle positioning whir (2.0s)
      setTimeout(() => playMechanicalSound('needle'), 2000)
    }

    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume().then(triggerTactileSounds).catch(() => {})
    } else {
      triggerTactileSounds()
    }

    setTimeout(() => {
      setIsCylinderSpinning(false)
      setShowMediaFlight(false)
      setLoadingTrackId(null)

      // EXACT MOMENT OF SWAP: Now that the flight loader has aligned exactly with the deck,
      // update active track state and reset position! Player mode remains unchanged.
      setTrack(t)
      setTime(0)
      
      if (audioRef.current) {
        // Rewind the track to 0 and unmute to play from the beginning
        audioRef.current.currentTime = 0
        audioRef.current.muted = false
        
        if (shouldPlay) {
          initAudio()
          if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
          audioRef.current.play().then(() => {
            setPlaying(true)
          }).catch(() => {})
        } else {
          audioRef.current.pause()
          setPlaying(false)
        }
      }

      // Trigger heavy mechanical physical force feedback "shudder/impact" chassis animation
      setIsDeckImpact(true)
      setTimeout(() => setIsDeckImpact(false), 400)
      
      // Final locking mechanical clunk
      playMechanicalSound('clunk')
    }, 2800)
  }

  const skipNext = () => {
    const activeList = filteredTracks.length > 0 ? filteredTracks : tracks
    const i = activeList.findIndex(t => t.id === track.id)
    const targetIdx = i === -1 ? 0 : i
    const next = shuffle ? activeList[Math.floor(Math.random() * activeList.length)] : activeList[(targetIdx + 1) % activeList.length]
    selectTrack(next, true, !shuffle)
  }

  const skipPrev = () => {
    if (currentTime > 3) { setTime(0); if (audioRef.current) audioRef.current.currentTime = 0; return }
    const activeList = filteredTracks.length > 0 ? filteredTracks : tracks
    const i = activeList.findIndex(t => t.id === track.id)
    const targetIdx = i === -1 ? 0 : i
    const prev = activeList[(targetIdx - 1 + activeList.length) % activeList.length]
    selectTrack(prev, true, !shuffle)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth
    const t = r * track.duration
    setTime(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  // Rapid rolling sequence for Cover Flow "촤라라락" searching
  const triggerCoverFlowRoll = (targetTrack: Track) => {
    setIsCylinderSpinning(true)
    playMechanicalSound('scroll')
    
    const startIdx = tracks.findIndex(t => t.id === focusedTrackId)
    const endIdx = tracks.findIndex(t => t.id === targetTrack.id)
    if (startIdx === -1 || endIdx === -1) {
      setFocusedTrackId(targetTrack.id)
      return
    }
    
    // We will schedule intermediate steps to simulate a spinning sprocket wheel
    const totalSteps = 22
    const path: number[] = []
    
    // Generate a path of indices to traverse
    for (let i = 0; i < totalSteps - 1; i++) {
      // Create a rolling cycle effect
      const progress = i / (totalSteps - 1)
      if (progress < 0.65) {
        // High speed chaotic spin (spins multiple full rotations of our 8 tracks)
        path.push((startIdx + i) % tracks.length)
      } else {
        // Linear deceleration towards endIdx
        const remainingSteps = totalSteps - 1 - i
        const stepIdx = Math.round(endIdx - (endIdx - startIdx) * (remainingSteps / (totalSteps * 0.35)))
        path.push((stepIdx + tracks.length) % tracks.length)
      }
    }
    path.push(endIdx) // Final target
    
    // Schedule the focusedTrackId updates using a custom decelerating curve
    let cumulativeDelay = 0
    path.forEach((tIdx, i) => {
      // Decelerating delay curve (starts at snappy 30ms, slows down to 180ms)
      const stepDelay = 30 + Math.pow(i / totalSteps, 2) * 150
      cumulativeDelay += stepDelay
      
      if (cumulativeDelay < 2720) {
        setTimeout(() => {
          setFocusedTrackId(tracks[tIdx].id)
          // Play a small click sound on each card change
          playMechanicalSound('button')
        }, cumulativeDelay)
      }
    })
  }

  // Interactive mouse drag & touch swipe listeners for 3D Cover Flow (Continuous high-fidelity scrolling)
  const dragStartRef = useRef<number | null>(null)
  const lastSnappedIdxRef = useRef<number>(-1)

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartRef.current = e.clientX
    setIsDragging(true)
    const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
    lastSnappedIdxRef.current = activeIdx
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartRef.current === null) return
    const diff = e.clientX - dragStartRef.current
    setDragOffset(diff)

    // Tick sound as user drags past card boundaries
    const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
    if (activeIdx !== -1) {
      const currentProgress = activeIdx - (diff / 110)
      const roundedIdx = Math.round(currentProgress)
      const wrappedIdx = (roundedIdx + tracks.length) % tracks.length
      if (wrappedIdx !== lastSnappedIdxRef.current) {
        lastSnappedIdxRef.current = wrappedIdx
        playMechanicalSound('button')
      }
    }
  }

  const handleMouseUpOrLeave = () => {
    if (!isDragging) return
    setIsDragging(false)
    dragStartRef.current = null
    
    // Calculate final index to snap to
    const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
    if (activeIdx !== -1) {
      const currentProgress = activeIdx - (dragOffset / 110)
      const closestIdx = Math.round(currentProgress)
      const finalIdx = (closestIdx + tracks.length) % tracks.length
      
      // If we snapped to a new card, play a nice locking tick sound
      if (tracks[finalIdx].id !== focusedTrackId) {
        playMechanicalSound('button')
      }
      
      setFocusedTrackId(tracks[finalIdx].id)
    }
    setDragOffset(0)
    lastSnappedIdxRef.current = -1
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      dragStartRef.current = e.touches[0].clientX
      setIsDragging(true)
      const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
      lastSnappedIdxRef.current = activeIdx
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || dragStartRef.current === null || !e.touches[0]) return
    const diff = e.touches[0].clientX - dragStartRef.current
    setDragOffset(diff)

    // Tick sound as user touches/swipes past card boundaries
    const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
    if (activeIdx !== -1) {
      const currentProgress = activeIdx - (diff / 100)
      const roundedIdx = Math.round(currentProgress)
      const wrappedIdx = (roundedIdx + tracks.length) % tracks.length
      if (wrappedIdx !== lastSnappedIdxRef.current) {
        lastSnappedIdxRef.current = wrappedIdx
        playMechanicalSound('button')
      }
    }
  }

  // Interactive mouse wheel scrolling listener for 3D Cover Flow
  const lastWheelTimeRef = useRef<number>(0)
  
  const handleWheel = (e: React.WheelEvent) => {
    // Prevent default browser scroll while hovering/scrolling Cover Flow
    e.preventDefault()
    
    const now = Date.now()
    if (now - lastWheelTimeRef.current < 160) return // Throttle mouse wheel shifts (160ms cooldown)
    lastWheelTimeRef.current = now
    
    const activeIdx = tracks.findIndex(t => t.id === focusedTrackId)
    if (activeIdx !== -1) {
      // Scroll down (positive deltaY) moves to next covers
      // Scroll up (negative deltaY) moves to previous covers
      const direction = e.deltaY > 0 ? 1 : -1
      const nextIdx = (activeIdx + direction + tracks.length) % tracks.length
      setFocusedTrackId(tracks[nextIdx].id)
      playMechanicalSound('button')
    }
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume
  }, [volume, muted])

  // AI Speech DJ voice synthesize feedback (Text To Speech)
  const speakResponse = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel() // Stop any current sound
    const utterance = new SpeechSynthesisUtterance(text.replace(/✦/g, ''))
    utterance.lang = 'ko-KR'
    utterance.rate = 1.05
    utterance.pitch = 0.95
    utterance.onstart = () => setIsAiTalking(true)
    utterance.onend = () => setIsAiTalking(false)
    utterance.onerror = () => setIsAiTalking(false)
    window.speechSynthesis.speak(utterance)
  }

  // NLP client-side query matching & Audio TTS reaction
  const handleAiQuery = (q: string) => {
    setAiQuery(q)
    let key = 'default'
    if (q.includes('비') || q.includes('우산') || q.includes('rain')) key = 'rainy'
    else if (q.includes('편한') || q.includes('힐링') || q.includes('chill')) key = 'chill'
    else if (q.includes('에너지') || q.includes('신나') || q.includes('클럽') || q.includes('dance')) key = 'energy'
    else if (q.includes('우주') || q.includes('몽환') || q.includes('space') || q.includes('mirage')) key = 'space'

    const resText = AI_DJ_RESPONSES[key]
    setAiResponse(resText)
    speakResponse(resText)

    // Auto queue matching track based on intent
    if (key === 'rainy') selectTrack(tracks[0]) // Shine On
    else if (key === 'chill') selectTrack(tracks[10]) // Propolis
    else if (key === 'energy') selectTrack(tracks[1]) // Midnight Breaker
    else if (key === 'space') selectTrack(tracks[2]) // Midnight Mirage
  }

  const applyPreset = (name: string) => {
    setPreset(name)
    const gains = EQ_PRESETS[name] || customPresets[name]
    if (gains) {
      setEqGains(gains)
      gainsToFilters(gains)
      if (name === 'CATHEDRAL') {
        updateReverb(75, 'CATHEDRAL')
      }
    }
  }

  const saveCustomPreset = () => {
    if (!newPresetName.trim()) return
    const name = newPresetName.toUpperCase()
    setCustomPresets(prev => ({
      ...prev,
      [name]: [...eqGains]
    }))
    setPreset(name)
    setNewPresetName('')
    setShowSavePresetModal(false)
  }

  // Curated 12 High-Fidelity Presets (No Scrollbar Required)
  const presetCategories = [
    { title: 'Standard Reference', list: ['FLAT', 'CLASSIC', 'JAZZ'] },
    { title: 'Genre & Vibes', list: ['ROCK', 'POP', 'K-POP', 'HIP HOP', 'EDM'] },
    { title: 'Special & Acoustic', list: ['LO-FI', 'VOCAL BOOST', 'AMBIENT', 'CATHEDRAL'] },
    { title: 'Custom Tuned Presets', list: Object.keys(customPresets) }
  ]

  // Web-based custom MP3 upload module
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    
    // Parse ID3v2 metadata (including native cover art image)
    let parsedMeta: { title?: string; artist?: string; coverUrl?: string } = {};
    try {
      parsedMeta = await parseMp3Metadata(file);
    } catch (err) {
      console.error("ID3 parsing error:", err);
    }

    const newTrack: Track = {
      id: tracks.length + 1,
      title: parsedMeta.title || file.name.replace(/\.[^/.]+$/, ""),
      artist: parsedMeta.artist || 'Local Upload',
      genre: 'Indie',
      mood: ['#Uploaded', '#MyMusic'],
      bpm: 100,
      key: 'C Major',
      mediaPref: mediaType,
      duration: 200, // placeholder, will auto calculate on load
      lyrics: ['직접 업로드한 곡입니다.', '가사 속성을 편집하여 넣어보세요.'],
      src: objectUrl,
      linerNotes: 'An imported offline track loaded directly into the AI Jukebox context.',
      coverUrl: parsedMeta.coverUrl || 'https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&q=80'
    }

    // Auto read audio duration using browser audio element
    const tempAudio = new Audio(objectUrl)
    tempAudio.addEventListener('loadedmetadata', () => {
      newTrack.duration = Math.floor(tempAudio.duration)
      const nextTracks = [...tracks, newTrack]
      setTracks(nextTracks)
      selectTrack(newTrack)
    })
  }

  // AI Generative Lyrics simulation (Streams beautiful lyrics with Sparkles vibe)
  const generateAiLyrics = () => {
    setIsGeneratingLyrics(true)
    let progressStr = 'AI 딥러닝 엔진이 곡의 주파수 분위기를 스캔하고 있습니다...'
    setTrack(prev => ({ ...prev, lyrics: [progressStr] }))

    setTimeout(() => {
      const parts = [
        "지나간 슬픔은 푸른 연기처럼 흩어지네,",
        "새로운 은하수 아래 너와 나의 깊은 떨림,",
        "사운드 랩의 공간 속에 가득 피어오르는 멜로디,",
        "이 끝없는 밤을 지나 영원을 향해 노래하리"
      ]
      setTrack(prev => ({
        ...prev,
        lyrics: parts
      }))
      setGeneratedTracks(prev => ({ ...prev, [track.id]: true }))
      setIsGeneratingLyrics(false)
      speakResponse("스캔 완료! 곡의 멜로디에 어울리는 감성적인 가사를 AI가 실시간 매칭하였습니다.")
    }, 2800)
  }

  // Open Edit Track Modal & Bind variables
  const openEditDialog = (t: Track) => {
    setEditTitle(t.title)
    setEditArtist(t.artist)
    setEditGenre(t.genre)
    setEditBpm(t.bpm)
    setEditKey(t.key)
    setEditCover(t.coverUrl || '')
    setEditLyricsText(t.lyrics.join('\n'))
    setShowEditModal(true)
  }

  // Save Track meta configurations
  const saveTrackProperties = () => {
    const updated = tracks.map(t => {
      if (t.id === track.id) {
        return {
          ...t,
          title: editTitle,
          artist: editArtist,
          genre: editGenre,
          bpm: Number(editBpm),
          key: editKey,
          coverUrl: editCover,
          lyrics: editLyricsText.split('\n').filter(l => l.trim().length > 0)
        }
      }
      return t
    })
    setTracks(updated)
    const currentUpdated = updated.find(t => t.id === track.id)
    if (currentUpdated) setTrack(currentUpdated)
    setShowEditModal(false)
  }

  // Live Auto Scrolling Karaoke Syncer logic
  const activeLyricIndex = Math.min(
    track.lyrics.length - 1,
    Math.floor((currentTime / Math.max(track.duration, 1)) * track.lyrics.length)
  )

  useEffect(() => {
    if (lyricsContainerRef.current) {
      const container = lyricsContainerRef.current
      const activeLine = container.querySelector('.active') as HTMLElement
      if (activeLine) {
        container.scrollTo({
          top: activeLine.offsetTop - container.offsetHeight / 2 + activeLine.offsetHeight / 2,
          behavior: 'smooth'
        })
      }
    }
  }, [activeLyricIndex])

  const pendingTrack = tracks.find(x => x.id === loadingTrackId) || track

  // AI Dynamic Playlist Auto-Classification filter
  const filteredTracks = useMemo(() => {
    if (activePlaylist === 'Featured') return tracks
    
    return tracks.filter(t => {
      const genre = t.genre.toLowerCase()
      const title = t.title.toLowerCase()
      const bpm = t.bpm || 100
      
      if (activePlaylist === 'Retro Vibes') {
        // Classify Synthwave, Rock, and 80s/Retro styled pop
        return genre.includes('synthwave') || genre.includes('rock') || genre.includes('retro') || title.includes('remaster')
      }
      if (activePlaylist === 'Eurodance Energy') {
        // Classify high-energy beats with BPM >= 120
        return bpm >= 120 || genre.includes('dance') || genre.includes('electronic') || genre.includes('techno') || genre.includes('house')
      }
      if (activePlaylist === 'Ambient Waves') {
        // Classify relaxing beats with BPM < 120 and chill genres
        return bpm < 120 && (genre.includes('ambient') || genre.includes('pop') || genre.includes('lofi') || genre.includes('chill'))
      }
      return true
    })
  }, [tracks, activePlaylist])

  const progressPct = (currentTime / Math.max(track.duration, 1)) * 100

  // Cassette tape dynamic winding reel sizes (percentage of container width)
  const leftReelSize = 11.6 + (1 - progressPct / 100) * 14.4
  const rightReelSize = 11.6 + (progressPct / 100) * 14.4

  // Rotation parameters for CD/Vinyl
  const spinSpeedClass = isPlaying ? 'spinning' : ''

  return (
    <div className={`app-layout ${!isAiLabOpen ? 'ai-lab-collapsed' : ''}`} data-mode={mediaType}>
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="logo">
          <span className="ai-badge">AI Synthesis</span>
          <span style={{ color: 'var(--text)', fontWeight: 900 }}>NoJ_JukeBox Studio</span>
        </div>

        {/* Dynamic media selection on header for a beautiful dashboard */}
        <div style={{ width: '680px' }}>
          <div className="deck-selector">
            {([
              {
                type: 'LP' as MediaType,
                icon: <Disc3 size={17} strokeWidth={2.5} style={{ marginRight: '4px' }} />,
                label: 'Vinyl LP'
              },
              {
                type: 'CD' as MediaType,
                icon: <Disc size={17} strokeWidth={2.5} style={{ marginRight: '4px' }} />,
                label: 'Compact Disc'
              },
              {
                type: 'TAPE' as MediaType,
                icon: <CassetteTape size={17} strokeWidth={2.5} style={{ marginRight: '4px' }} />,
                label: 'Cassette Tape'
              }
            ] as const).map(({ type, icon, label }) => (
              <button
                key={type}
                className={`deck-btn ${mediaType === type ? 'active' : ''}`}
                onClick={() => {
                  setMediaType(type)
                }}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="user-profile">
          {isAiTalking ? (
            <div style={{ display: 'flex', gap: '3px', marginRight: '6px' }}>
              <span className="w-1.5 h-3.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <span className="w-1.5 h-3.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-3.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          ) : null}
          <div className="user-avatar">Y</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800 }}>yeon-jae-park</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-dim)' }}>Premium Producer</div>
          </div>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="left-sidebar">
        <div>
          <div className="section-label">Interactive AI DJ</div>
          <div className="ai-dj-search-container">
            <input
              className="ai-dj-search"
              placeholder="예: 비오는 밤 분위기 추천해줘"
              value={aiQuery}
              onChange={e => handleAiQuery(e.target.value)}
            />
            <Sparkles size={16} style={{ position: 'absolute', right: 12, color: 'var(--accent)', opacity: 0.7 }} />
          </div>
          {aiResponse && (
            <div style={{
              fontSize: '13px',
              color: 'var(--text)',
              marginTop: '10px',
              lineHeight: 1.6,
              padding: '10px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '8px',
              border: '1.5px solid var(--panel-border)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
              position: 'relative'
            }}>
              <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>AI DJ Broadcast</div>
              {aiResponse}
            </div>
          )}
        </div>

        {/* Offline Audio File Uploader */}
        <div style={{ padding: '4px 0' }}>
          <div className="section-label">Drop & Upload MP3</div>
          <label className="uploader-box" style={{ display: 'block' }}>
            <Upload size={20} style={{ margin: '0 auto 6px', color: 'var(--accent)' }} />
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Web MP3 Import</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>Click to select audio</div>
            <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Playlists */}
        <div>
          <div className="section-label">Playlists</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PLAYLISTS.map(p => (
              <button
                key={p}
                className={`preset-btn ${activePlaylist === p ? 'active' : ''}`}
                onClick={() => setActivePlaylist(p)}
                style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px' }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Tracks List with custom edit triggers */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="section-label">Tracks Directory</div>
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 330px)', paddingRight: '4px' }}>
            {filteredTracks.map(t => {
              const isCurrent = track.id === t.id
              const isLoading = loadingTrackId === t.id
              const isActive = isCurrent || isLoading
              return (
                <div
                  key={t.id}
                  className={`playlist-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectTrack(t)}
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  {isLoading && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(220,163,52,0.06), transparent)',
                      animation: 'shimmer 1.5s infinite'
                    }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>{t.title}</div>
                    {isCurrent ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditDialog(t) }}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', opacity: 0.8 }}
                    >
                      <Edit3 size={11} />
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '2px' }}>{t.artist}</div>
              </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── CENTER PLAYER ── */}
      <main className="center-player">
        {/* Now playing bar with actual Cover details */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
          <img
            src={track.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
            alt="cover"
            style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--panel-border)' }}
          />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{track.title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '1.5px' }}>{track.artist} • <span style={{ color: 'var(--accent)' }}>{track.genre}</span></div>
          </div>
          <button
            onClick={() => openEditDialog(track)}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: 'none', padding: '7px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Edit3 size={10} />
            <span>Edit Info</span>
          </button>
          <button
            onClick={toggleFullscreen}
            style={{ marginLeft: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', padding: '7px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            <span>{isFullscreen ? "Exit Full" : "Full Screen"}</span>
          </button>
        </div>

        {/* Hyper-realistic 3D inspired Physical Media 구동 데크 */}
        <div className="media-viewport">
          {/* 3D Physical Media Slot-Machine Flight Loader overlay */}
          {showMediaFlight && (
            <div className={`media-flight-sleeve ${flightType.toLowerCase()}`}>
              {flightType === 'LP' && (
                <div className="flight-lp-record">
                  <div className="flight-lp-label">
                    <img src={pendingTrack.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'} alt="" />
                  </div>
                </div>
              )}
              {flightType === 'CD' && (
                <div className="flight-cd-disc">
                  <div className="flight-cd-label">
                    <img src={pendingTrack.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'} alt="" />
                  </div>
                </div>
              )}
              {flightType === 'TAPE' && (
                <div className="flight-tape-cassette">
                  {/* Skeuomorphic shell corner screws */}
                  <div className="cassette-screw top-left" />
                  <div className="cassette-screw top-right" />
                  <div className="cassette-screw bottom-left" />
                  <div className="cassette-screw bottom-right" />
                  
                  {/* Trapezoidal pinch roller head shield */}
                  <div className="cassette-bottom-shield" />

                  {/* Clear central tape window showing internal reels */}
                  <div className="cassette-center-window" />
                  <div className="mini-reel left" />
                  <div className="mini-reel right" />

                  {/* Wide rectangular album cover label with a center window cutout */}
                  <div className="flight-tape-label">
                    <svg viewBox="0 0 216 112" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <defs>
                        <mask id="flight-label-mask">
                          {/* 1. White background makes the image visible */}
                          <rect x="0" y="0" width="216" height="112" fill="white" />
                          
                          {/* 2. Black rectangle cuts out the center window (transparent hole)
                              Cutout parameters (in SVG 216x112 pixel coordinate space):
                              - x: 35.2 (left edge offset)
                              - y: 43.6 (top edge offset)
                              - width: 145.6 (width of window cutout)
                              - height: 40.8 (height of window cutout)
                          */}
                          <rect x="35.2" y="43.6" width="145.6" height="40.8" rx="6" fill="black" />
                        </mask>
                      </defs>
                      <image
                        href={pendingTrack.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
                        x="0"
                        y="0"
                        width="216"
                        height="112"
                        preserveAspectRatio="xMidYMid slice"
                        mask="url(#flight-label-mask)"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LEFT COLUMN: Skewomorphic Physical Media Deck Chassis with mechanical force shudder/impact feedback */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', transition: 'all 0.1s ease' }} className={isDeckImpact ? 'deck-impact' : ''}>
            {mediaType === 'LP' && (
              <div className="deck-chassis">
                {/* Photorealistic LP Turntable Chassis */}
                <img src="/images/lp_turntable.png" alt="Vinyl LP" className="photoreal-bg" />
                
                {/* Spinning Platter/Vinyl Sheen Overlay placed exactly over the platter in the image */}
                <div className={`lp-spindle-hub ${spinSpeedClass}`}>
                  <div className="sheen-overlay" />
                </div>

                {/* Rotating active track album art label in the record center */}
                <div className={`lp-center-label ${spinSpeedClass}`}>
                  <img
                    src={track.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
                    alt="label"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                </div>

                {/* Silver center spindle pin */}
                <div className="lp-spindle-pin" />

                {/* Red BPM Blinking Strobe Light */}
                <div className={`strobe-dot-blinker ${isPlaying ? 'active' : ''}`} />
              </div>
            )}

            {mediaType === 'CD' && (
              <div className="deck-chassis">
                {/* Photorealistic Compact Disc Player Base with clean empty CD tray recess */}
                <img src="/images/cd_player.png" alt="Compact Disc" className="photoreal-bg" />

                {/* Virtual CD Layer spinning with acceleration/deceleration */}
                <div className="virtual-cd">
                  <div className={`cd-body ${cdSpinClass}`}>
                    {/* Concave CD face reflections and tracks */}
                    <div className="cd-grooves" />
                    <div className="cd-sheen" />
                    <div className="cd-data-tracks" />

                    {/* Highly opaque real album art label in the center */}
                    <div className="cd-album-art">
                      <img
                        src={track.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
                        alt="CD Label"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                      />
                    </div>

                    {/* Concentric center spindle spindle-hole */}
                    <div className="cd-spindle-hole" />
                  </div>
                </div>

                {/* Bright Laser Lens Center Pickup blue aura */}
                {isPlaying && <div className="cd-laser-blue-glow" />}

                {/* Dynamic Cyan Digital Level VFD Screen overlayed exactly on the bezel display */}
                <div className="cd-vfd-screen">
                  <div>TR-{String(track.id).padStart(2, '0')}</div>
                  <div style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(currentTime)}</div>
                  <div style={{ color: isPlaying ? '#00e5ff' : '#007a99' }}>{isPlaying ? '▶ PLAY' : '■ PAUS'}</div>
                </div>

                {/* CD Integrated Digital LED Stereo Level Meter */}
                <div className="cd-integrated-led-vu">
                  <div className="cd-led-row">
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const active = vuLevels.l * 12 > idx
                      let color = '#00e5ff'
                      if (idx > 9) color = '#ff3b30'
                      else if (idx > 7) color = '#ffcc00'
                      return (
                        <div
                          key={idx}
                          className="cd-led-segment"
                          style={{
                            backgroundColor: active ? color : 'rgba(0, 229, 255, 0.04)',
                            boxShadow: active ? `0 0 6px ${color}` : 'none'
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="cd-led-row">
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const active = vuLevels.r * 12 > idx
                      let color = '#00e5ff'
                      if (idx > 9) color = '#ff3b30'
                      else if (idx > 7) color = '#ffcc00'
                      return (
                        <div
                          key={idx}
                          className="cd-led-segment"
                          style={{
                            backgroundColor: active ? color : 'rgba(0, 229, 255, 0.04)',
                            boxShadow: active ? `0 0 6px ${color}` : 'none'
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {mediaType === 'TAPE' && (
              <div className="deck-chassis">
                {/* Photorealistic Tape Deck */}
                <img src="/images/cassette_tape.png" alt="Cassette Tape" className="photoreal-bg" />

                {/* Album Cover Sticker Label with dynamic center cutout mask */}
                <div className="deck-tape-label">
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <defs>
                      <mask id="deck-label-mask">
                        <rect x="0" y="0" width="100" height="100" fill="white" />
                        {/* Rounded rectangle cutout matching the center window region */}
                        <rect x="27.4" y="51.9" width="45.2" height="50" rx="4" fill="black" />
                      </mask>
                    </defs>
                    <image
                      href={track.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
                      x="0"
                      y="0"
                      width="100"
                      height="100"
                      preserveAspectRatio="xMidYMid slice"
                      mask="url(#deck-label-mask)"
                    />
                    <line x1="0" y1="12" x2="100" y2="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" mask="url(#deck-label-mask)" />
                    <line x1="0" y1="88" x2="100" y2="88" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" mask="url(#deck-label-mask)" />
                  </svg>
                </div>

                {/* Vintage Incandescent Chamber Backlight Bulb inside the window */}
                <div className={`tape-warm-light ${isPlaying ? 'active' : ''}`} />

                {/* Left wound tape reel (Perfect center-aligned spindle) */}
                <div className="tape-film-reel" style={{
                  left: '38.71%',
                  top: '49.67%',
                  width: `${leftReelSize}%`,
                  height: `${leftReelSize * 1.5}%`
                }} />

                {/* Right wound tape reel (Perfect center-aligned spindle) */}
                <div className="tape-film-reel" style={{
                  left: '60.92%',
                  top: '49.64%',
                  width: `${rightReelSize}%`,
                  height: `${rightReelSize * 1.5}%`
                }} />

                {/* Spinning sprocket gear overlays situated on top of the spindles in cassette_tape.png */}
                <div className={`tape-gear-left ${spinSpeedClass}`}>
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', color: '#ffffff', opacity: 0.9 }}>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="8" />
                    <path d="M50,8 L50,28 M50,72 L50,92 M13.6,29 L29.6,39 M70.4,61 L86.4,71 M13.6,71 L29.6,61 M70.4,39 L86.4,29" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="13" fill="#0c0805" />
                  </svg>
                </div>
                <div className={`tape-gear-right ${spinSpeedClass}`}>
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', color: '#ffffff', opacity: 0.9 }}>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="8" />
                    <path d="M50,8 L50,28 M50,72 L50,92 M13.6,29 L29.6,39 M70.4,61 L86.4,71 M13.6,71 L29.6,61 M70.4,39 L86.4,29" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="13" fill="#0c0805" />
                  </svg>
                </div>


              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Gorgeous 3D Album Cover Flow Cabinet */}
          <div 
            className={`slot-machine-bay ${isCylinderSpinning ? 'spinning' : ''} ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUpOrLeave}
            onWheel={handleWheel}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {/* 3D Reflection Cover Flow Track */}
            <div className="cover-flow-track">
              {tracks.map((t, idx) => {
                const activeIdx = tracks.findIndex(x => x.id === focusedTrackId)
                
                // Continuous progress tracking during active drag
                const dragSensitivity = isFullscreen ? 150 : 120
                const currentProgress = activeIdx - (dragOffset / dragSensitivity)
                const cardOffset = idx - currentProgress
                const absOffset = Math.abs(cardOffset)
                
                // Dynamically calculate 3D transformations for each album card continuously
                let transformStr = ''
                let zIndex = Math.round(10 - absOffset)
                let opacity = Math.max(0.12, 1 - absOffset * 0.28)
                
                const cardWidth = isFullscreen ? 58 : 48
                const sideGap = isFullscreen ? 75 : 52
                
                let tx = cardOffset * cardWidth
                if (cardOffset < 0) {
                  tx -= sideGap
                } else if (cardOffset > 0) {
                  tx += sideGap
                }
                
                // Smooth interpolation for 3D layout parameters
                const scale = 1.15 - Math.min(1, absOffset) * (1.15 - 0.82)
                const rotateY = Math.max(-42, Math.min(42, -cardOffset * 42))
                const translateZ = 50 - Math.min(1, absOffset) * (50 - (-45))
                
                transformStr = `translateX(${tx}px) scale(${scale}) translateZ(${translateZ}px) rotateY(${rotateY}deg)`
                
                // A card is active when it is mathematically centered (closest to it)
                const isActive = Math.round(currentProgress) === idx
                
                return (
                  <div
                    key={t.id}
                    className={`cover-card ${isActive ? 'active' : ''}`}
                    style={{
                      transform: transformStr,
                      zIndex: zIndex,
                      opacity: opacity,
                      position: 'absolute'
                    }}
                    onClick={() => {
                      if (isActive) {
                        selectTrack(t)
                      } else {
                        setFocusedTrackId(t.id)
                        playMechanicalSound('button')
                      }
                    }}
                  >
                    <img
                      src={t.coverUrl}
                      alt={t.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)',
                      padding: '6px 8px',
                      textAlign: 'center',
                      borderRadius: '0 0 8px 8px'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ffffff' }}>{t.title}</div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>{t.artist}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Backplane lighting and neon framing panels */}
            <div className="slot-center-indicator" />
            <div className="slot-viewport-frame" />

            {/* Small Paginated tactual Arrow buttons on both ends */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateCabinet(-1)
              }}
              className="cabinet-nav-btn left"
              title="Previous Album"
            >
              <ChevronLeft size={16} />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateCabinet(1)
              }}
              className="cabinet-nav-btn right"
              title="Next Album"
            >
              <ChevronRight size={16} />
            </button>
            
            {/* Live slot status text overlay */}
            <div style={{
              position: 'absolute',
              bottom: '8px',
              fontSize: '12px',
              color: 'var(--accent)',
              fontWeight: 800,
              letterSpacing: '1px',
              textShadow: '0 0 5px var(--accent)',
              zIndex: 6
            }}>
              {isCylinderSpinning ? '🎲 SEARCHING...' : '📌 TUNED IN'}
            </div>
          </div>
        </div>

        {/* Master Controller panel with actual Synced Lyrics Scrolling */}
        <div className="controls-bar">
          <div className="progress-row">
            <span>{fmt(currentTime)}</span>
            <div className="progress-track" onClick={seek}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span>{fmt(track.duration)}</span>
          </div>

          <div className="transport-row" style={{ pointerEvents: loadingTrackId !== null ? 'none' : 'auto', opacity: loadingTrackId !== null ? 0.7 : 1, transition: 'all 0.3s ease' }}>
            <button className="btn-transport" onClick={() => setShuffle(!shuffle)}
              style={{ color: shuffle ? 'var(--accent)' : undefined }}>
              <Shuffle size={15} />
            </button>
            <button className="btn-transport" onClick={skipPrev}><SkipBack size={18} /></button>
            <button className="btn-play" onClick={toggle}>
              {isPlaying ? <Pause size={20} color="#000" /> : <Play size={20} color="#000" style={{ marginLeft: 2 }} />}
            </button>
            <button className="btn-transport" onClick={skipNext}><SkipForward size={18} /></button>
            <button className="btn-transport" onClick={() => setRepeat(!repeat)}
              style={{ color: repeat ? 'var(--accent)' : undefined }}>
              <Repeat size={15} />
            </button>

            {/* Volume slider */}
            <div className="volume-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn-transport" onClick={() => setMuted(!muted)} style={{ cursor: 'pointer' }}>
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input type="range" className="vol" min={0} max={1} step={0.01}
                value={muted ? 0 : volume}
                onChange={e => { setVolume(+e.target.value); setMuted(false) }}
                style={{ width: '60px', accentColor: 'var(--accent)', cursor: 'pointer', height: '3px' }} />
            </div>
          </div>
        </div>

        {/* Unified Dual Metering Console (FFT + Analog VU Needles) */}
        <div className="metering-console-grid">
          
          {/* Live Frequency Waveform Screen */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(5,5,5,0.6)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--panel-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.9), inset 0 0 15px rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700, paddingBottom: '5px', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
              <span style={{ letterSpacing: '1px', textShadow: '0 0 8px rgba(255,255,255,0.1)' }}>HIGH-RESOLUTION REAL-TIME FFT ANALYZER</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isPlaying ? 'var(--accent)' : '#ff3b30', boxShadow: isPlaying ? '0 0 8px var(--accent)' : '0 0 8px #ff3b30', display: 'inline-block' }} />
                <span style={{ color: isPlaying ? 'var(--accent)' : '#ff3b30', textTransform: 'uppercase', fontSize: '11.5px', fontWeight: 800 }}>{isPlaying ? 'RUNNING' : 'STANDBY'}</span>
              </div>
            </div>
            
            <WaveformCanvas isPlaying={isPlaying} audioData={audioData} mode={mediaType} />
            
            {/* Real Audio frequency bands */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-dim)', fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, opacity: 0.8, padding: '2px 6px 0 6px' }}>
              <span>5Hz</span>
              <span>40Hz</span>
              <span>150Hz</span>
              <span>400Hz</span>
              <span>1kHz</span>
              <span>2.5kHz</span>
              <span>6kHz</span>
              <span>12kHz</span>
              <span>18kHz</span>
            </div>
          </div>

          {/* Dynamic Dual Backlit Analog VU needle Meters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(5,5,5,0.6)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--panel-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.9), inset 0 0 15px rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700, paddingBottom: '5px', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
              <span style={{ letterSpacing: '1px', textShadow: '0 0 8px rgba(255,255,255,0.1)' }}>CLASSIC DUAL ANALOG VU METERS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isPlaying ? '#ffba00' : '#888', boxShadow: isPlaying ? '0 0 8px #ffba00' : 'none', display: 'inline-block' }} />
                <span style={{ color: isPlaying ? '#ffba00' : 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11.5px', fontWeight: 800 }}>{isPlaying ? 'ACTIVE' : 'MUTED'}</span>
              </div>
            </div>
            
            <StereoVUMeters 
              isPlaying={isPlaying} 
              audioData={audioData} 
              onToggleLight={() => playMechanicalSound('button')}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-dim)', fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, opacity: 0.8, padding: '2px 6px 0 6px' }}>
              <span>CH A (LEFT)</span>
              <span>DYNAMIC BALLISTICS</span>
              <span>CH B (RIGHT)</span>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Collapsible Panel Toggle Button */}
      <div 
        className="ai-lab-toggle-btn" 
        onClick={() => setIsAiLabOpen(!isAiLabOpen)}
        title={isAiLabOpen ? "Collapse AI Sound Lab" : "Expand AI Sound Lab"}
      >
        {isAiLabOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </div>

      {/* ── AI SOUND LAB (10-Band EQ + Spatial Sound Effects) ── */}
      <aside className="ai-lab" style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
        <div className="section-label" style={{ marginBottom: 2 }}>AI Sound Lab</div>

        {/* 10-Band EQ Graphic Faders with RTA background spectrum */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-dim)', fontWeight: 600 }}>10-Band EQ RTA</span>
            <button
              onClick={() => setShowSavePresetModal(true)}
              style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Save Custom
            </button>
          </div>
          
          <div className="eq-10band-container" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', height: '116px' }}>
            {/* RTA Canvas floating behind the inputs */}
            <canvas ref={rtaCanvasRef} className="rta-canvas" />

            {EQ_FREQS.map((freq, idx) => {
              const val = eqGains[idx] ?? 50
              const gain = sliderToGain(val)
              const displayFreq = freq >= 1000 ? `${freq/1000}k` : freq
              return (
                <div key={freq} className="eq-col-inner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', position: 'relative' }}>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-dim)', scale: '0.85', marginBottom: 2 }}>{displayFreq}</span>
                  
                  <div style={{ flex: 1, width: '3.5px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', position: 'relative', margin: '4px 0' }}>
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${val}%`,
                      background: gain > 0 ? 'var(--accent2)' : gain < 0 ? '#ff5a5a' : 'var(--accent)',
                      borderRadius: '2px', opacity: 0.8
                    }} />
                    <div style={{
                      position: 'absolute', left: '50%', bottom: `calc(${val}% - 5px)`,
                      transform: 'translateX(-50%)',
                      width: '11px', height: '11px', borderRadius: '50%',
                      background: 'conic-gradient(from 0deg, #f2f2f2 0deg, #c5c5c5 25deg, #a3a3a3 50deg, #e8e8e8 90deg, #999999 125deg, #fcfcfc 150deg, #7a7a7a 180deg, #c0c0c0 210deg, #8f8f8f 240deg, #e5e5e5 270deg, #b0b0b0 300deg, #ffffff 330deg, #f2f2f2 360deg)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.6), inset 0 0.8px 0.8px rgba(255,255,255,0.85), inset 0 -0.8px 0.8px rgba(0,0,0,0.25)',
                      border: '0.8px solid rgba(0, 0, 0, 0.35)',
                      pointerEvents: 'none'
                    }} />
                    <input
                      type="range" min={0} max={100} value={val}
                      onChange={e => updateEQBand(idx, +e.target.value)}
                      style={{
                        position: 'absolute', top: 0, bottom: 0, left: '-8px',
                        width: '20px', height: '100%', opacity: 0, cursor: 'row-resize',
                        WebkitAppearance: 'slider-vertical'
                      }}
                    />
                  </div>
                  
                  <span style={{ fontSize: '9px', color: gain > 0 ? 'var(--accent2)' : gain < 0 ? '#ff5a5a' : 'var(--text-dim)', scale: '0.85', fontWeight: 700 }}>
                    {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Spatial DSP Audio FX knobs */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 8 }}>Spatial Sound Effects</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Reverb and Echo Levels side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                  <span>Reverb Level</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{reverbLevel}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={reverbLevel}
                  onChange={e => updateReverb(+e.target.value, reverbPreset)}
                  style={{ width: '100%', accentColor: 'var(--accent)', height: '3px', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                  <span>Echo Level</span>
                  <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>{echoLevel}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={echoLevel}
                  onChange={e => setEchoLevel(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--accent2)', height: '3px', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Bass Boost and Vocal Clarity side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>Bass Boost (80Hz)</span>
                  <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>+{((bassBoost / 100) * 15).toFixed(1)}dB</span>
                </div>
                <input
                  type="range" min={0} max={100} value={bassBoost}
                  onChange={e => setBassBoost(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--accent2)', height: '3px', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>Vocal Clarity</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>+{((vocalClarity / 100) * 15).toFixed(1)}dB</span>
                </div>
                <input
                  type="range" min={0} max={100} value={vocalClarity}
                  onChange={e => setVocalClarity(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--accent)', height: '3px', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Space Preset Selection & Loudness Toggle on the same row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 6, gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>DSP SPACE:</span>
                <select
                  value={reverbPreset}
                  onChange={e => updateReverb(reverbLevel, e.target.value as any)}
                  style={{
                    background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text)', fontSize: '10.5px', padding: '2px 4px',
                    borderRadius: '4px', outline: 'none', cursor: 'pointer', fontWeight: 700
                  }}
                >
                  <option value="ROOM">ROOM</option>
                  <option value="HALL">HALL</option>
                  <option value="CATHEDRAL">CATHEDRAL</option>
                  <option value="CONCERT">CONCERT HALL</option>
                  <option value="STUDIO">STUDIO</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>3D LOUDNESS</span>
                <button
                  onClick={() => setLoudness(!loudness)}
                  style={{
                    width: '32px', height: '16px', borderRadius: '10px',
                    background: loudness ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: '2px', left: loudness ? '18px' : '2px', transition: 'left 0.3s'
                  }} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* EQ & Sound Presets combined */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>EQ & Tuning Presets (12 Profiles)</span>
            <span style={{ fontSize: '10px', color: 'var(--accent)' }}>ALL ACTIVE</span>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'rgba(0,0,0,0.25)',
            padding: '8px',
            borderRadius: '10px',
            border: '1px solid var(--panel-border)'
          }}>
            {presetCategories.map(cat => {
              if (cat.list.length === 0) return null
              return (
                <div key={cat.title} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>{cat.title}</div>
                  <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }} className="no-scrollbar">
                    {cat.list.map(name => (
                      <button key={name} className={`preset-btn ${activePreset === name ? 'active' : ''}`}
                        onClick={() => applyPreset(name)}
                        style={{
                          fontSize: '10.5px',
                          padding: '4px 8px',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live Karaoke Synced Scrolling Lyrics with AI Generator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: '160px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600 }}>Live Karaoke Synced Lyrics</span>
            <button
              onClick={generateAiLyrics}
              disabled={isGeneratingLyrics}
              style={{ fontSize: '10.5px', color: '#000', fontWeight: 800, background: 'var(--accent2)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              <Sparkles size={8} />
              <span>{isGeneratingLyrics ? 'Scanning...' : 'AI Synthesize'}</span>
            </button>
          </div>
          
          {generatedTracks[track.id] || isGeneratingLyrics ? (
            <div ref={lyricsContainerRef} className="lyrics-scroller" style={{ flex: 1, height: 'auto', maxHeight: '180px' }}>
              {track.lyrics.map((line, i) => (
                <div key={i} className={`lyrics-line ${i === activeLyricIndex ? 'active' : ''}`}>
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="lyrics-scroller" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '14px', background: 'rgba(0,0,0,0.25)', border: '1px dashed var(--panel-border)', borderRadius: '12px', flex: 1, height: 'auto', maxHeight: '180px' }}>
              <Sparkles size={20} style={{ color: 'var(--accent)', marginBottom: 8, opacity: 0.6 }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-dim)', fontWeight: 600, lineHeight: 1.5 }}>
                곡의 주파수 분위기 매칭 대기 중<br/>
                <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.3)', fontWeight: 500, marginTop: '4px', display: 'inline-block' }}>위 [AI Synthesize] 버튼을 누르시면 실시간 AI 가사가 생성됩니다.</span>
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onEnded={() => { if (repeat) { audioRef.current!.currentTime = 0; play() } else skipNext() }}
      />

      {/* ── MODAL: SAVE EQ PRESET ── */}
      {showSavePresetModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)' }}>Save Custom EQ Preset</h3>
              <button onClick={() => setShowSavePresetModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <input
              className="modal-input"
              placeholder="Preset Name (e.g. MY BASS)"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
            />
            <button
              onClick={saveCustomPreset}
              style={{ width: '100%', background: 'var(--accent)', border: 'none', padding: '10px', borderRadius: '8px', color: '#000', fontWeight: 800, cursor: 'pointer' }}
            >
              Save Preset
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT METADATA ── */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px', maxHeight: '90%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)' }}>Edit Track Properties</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Track Title</label>
              <input className="modal-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Artist Name</label>
              <input className="modal-input" value={editArtist} onChange={e => setEditArtist(e.target.value)} />
              
              <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Genre</label>
              <input className="modal-input" value={editGenre} onChange={e => setEditGenre(e.target.value)} />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>BPM</label>
                  <input type="number" className="modal-input" value={editBpm} onChange={e => setEditBpm(Number(e.target.value))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Musical Key</label>
                  <input className="modal-input" value={editKey} onChange={e => setEditKey(e.target.value)} />
                </div>
              </div>

              <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Album Cover Image</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px', marginBottom: '12px' }}>
                <img
                  src={editCover || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80'}
                  alt="Preview"
                  style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--panel-border)' }}
                />
                <div style={{ flex: 1 }}>
                  <label className="preset-btn" style={{ display: 'inline-block', fontSize: '10px', padding: '6px 12px', cursor: 'pointer', textAlign: 'center' }}>
                    <span>Choose Local Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) {
                              setEditCover(ev.target.result as string)
                            }
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                    />
                  </label>
                  <span style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: '10px' }}>or edit URL below</span>
                </div>
              </div>
              
              <input className="modal-input" placeholder="Album Cover Image URL" value={editCover} onChange={e => setEditCover(e.target.value)} />

              <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700 }}>Lyrics (Enter per line)</label>
              <textarea
                className="modal-input"
                style={{ height: '100px', resize: 'none', fontFamily: 'inherit' }}
                value={editLyricsText}
                onChange={e => setEditLyricsText(e.target.value)}
              />
            </div>

            <button
              onClick={saveTrackProperties}
              style={{ width: '100%', background: 'var(--accent)', border: 'none', padding: '10px', borderRadius: '8px', color: '#000', fontWeight: 800, cursor: 'pointer', marginTop: '10px' }}
            >
              Apply Transformations
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
