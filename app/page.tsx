'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Disc3, Music2, Plus, Edit3, X, Sparkles, Upload,
  ChevronLeft, ChevronRight, CassetteTape, Disc, Maximize2, Minimize2,
  Rewind, FastForward, RefreshCw, Trash2
} from 'lucide-react'

type MediaType = 'LP' | 'CD' | 'TAPE'

// Pure JS ID3v2 Metadata & APIC Album Cover Art Parser (Supports ID3v2.2, ID3v2.3, ID3v2.4)
function parseMp3Metadata(file: File): Promise<{ title?: string; artist?: string; coverUrl?: string; coverBlob?: Blob }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        resolve({});
        return;
      }
      
      const view = new DataView(buffer);
      if (buffer.byteLength < 10 || 
          view.getUint8(0) !== 0x49 || 
          view.getUint8(1) !== 0x44 || 
          view.getUint8(2) !== 0x33) {
        resolve({});
        return;
      }
      
      const versionMajor = view.getUint8(3);
      const totalSize = readSyncsafeInteger(view, 6);
      let offset = 10;
      
      let title: string | undefined;
      let artist: string | undefined;
      let coverUrl: string | undefined;
      let coverBlob: Blob | undefined;
      
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
            frameSize = (view.getUint8(offset + 4) << 24) |
                        (view.getUint8(offset + 5) << 16) |
                        (view.getUint8(offset + 6) << 8) |
                        view.getUint8(offset + 7);
          } else {
            frameSize = readSyncsafeInteger(view, offset + 4);
          }
          
          if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) {
            break;
          }
          
          const frameDataOffset = offset + 10;
          
          if (frameId === 'TIT2') {
            title = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'TPE1') {
            artist = decodeTextFrame(view, frameDataOffset, frameSize, textDecoder, utf16Decoder);
          } else if (frameId === 'APIC') {
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
                const blob = new Blob([imgData], { type: mimeType || 'image/jpeg' });
                coverBlob = blob;
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
                coverBlob = blob;
                coverUrl = URL.createObjectURL(blob);
              }
            } catch (err) {
              console.error("Error parsing PIC frame:", err);
            }
          }
          
          offset += 6 + frameSize;
        }
      }
      
      resolve({ title, artist, coverUrl, coverBlob });
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
  const glowColor = mode === 'CD' ? 'rgba(210, 228, 255, 0.22)' : mode === 'TAPE' ? 'rgba(255, 252, 248, 0.22)' : 'rgba(220, 163, 52, 0.22)';
  
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

  // Dynamically track and update canvas width/height when entering/exiting fullscreen
  // (solves offsetWidth = 0 bug when the metering console is hidden with display: none)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width || canvas.offsetWidth
        const height = entry.contentRect.height || canvas.offsetHeight
        
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1
          canvas.width = width * dpr
          canvas.height = height * dpr
        }
      }
    })

    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let t = 0
    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      t += 0.05

      const dpr = window.devicePixelRatio || 1
      const labelAreaWidth = 42 * dpr

      // ── DRAW Y-AXIS GRID LINES & LOG NUMERIC LABELS ──
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1 * dpr
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`
      ctx.textAlign = 'right'

      const dbValues = [0, -20, -40, -60, -80]
      dbValues.forEach(db => {
        // Map db (0 to -80) to y-coordinate (top to bottom)
        const y = ((db - 0) / -80) * (H - 12 * dpr) + 6 * dpr
        
        // Draw horizontal grid line
        ctx.beginPath()
        ctx.moveTo(labelAreaWidth, y)
        ctx.lineTo(W, y)
        ctx.stroke()
        
        // Draw numeric value
        ctx.fillText(`${db}dB`, labelAreaWidth - 6 * dpr, y + 4.5 * dpr)
      })

      // ── PLOT FREQUENCY BARS IN LOGARITHMIC DECIBEL SCALE ──
      const bars = 45
      const barsStart = labelAreaWidth + 2 * dpr
      const barsWidth = W - barsStart - 4 * dpr
      const bW = (barsWidth / bars) - (2 * dpr)

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
          
          // Web Audio API's getByteFrequencyData returns values already mapped logarithmically in decibels.
          // Therefore, rawVal / 255 is already linear in decibels, which represents the log scale height!
          const ampNormalized = rawVal / 255
          const trebleBoost = 1.0 + (i / bars) * 0.35
          amp = Math.max(0, Math.min(0.85, ampNormalized * trebleBoost))
        } else if (isPlaying) {
          // Simulation when hardware audio not connected
          const simulatedAmp = 0.05 + Math.abs(Math.sin(i * 0.2 + t)) * 0.70
          amp = Math.max(0, Math.min(0.85, simulatedAmp))
        } else {
          // Idle ambient simulation
          const simulatedAmp = 0.01 + Math.abs(Math.sin(i * 0.5)) * 0.04
          amp = Math.max(0, Math.min(0.85, simulatedAmp))
        }

        // Draw frequency bar
        const maxBarH = H - 12 * dpr
        const bH = Math.max(3 * dpr, amp * maxBarH) // Headroom capped at 85% to prevent y-axis overflow
        const x = barsStart + (i / bars) * barsWidth
        const y = H - 6 * dpr - bH

        const grad = ctx.createLinearGradient(0, y, 0, y + bH)
        grad.addColorStop(0, color)
        grad.addColorStop(0.5, `${color}cc`)
        grad.addColorStop(1, `${color}44`)
        ctx.fillStyle = grad

        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, y, bW, bH, 2 * dpr)
        else ctx.rect(x, y, bW, bH)
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

function StereoVUMeters({ isPlaying, audioData, onToggleLight, mode }: { isPlaying: boolean; audioData: Uint8Array | null; onToggleLight?: () => void; mode?: MediaType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dataRef = useRef<Uint8Array | null>(null)
  
  // Light switch state
  const [lightOn, setLightOn] = useState(true)
  const lightOnRef = useRef(lightOn)
  useEffect(() => {
    lightOnRef.current = lightOn
  }, [lightOn])

  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

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

      // Lamp color palette per media mode
      const m = modeRef.current
      const lampFace0   = m === 'CD' ? '#f5f9ff' : m === 'TAPE' ? '#fffef9' : '#fffcf5'
      const lampFace1   = m === 'CD' ? '#dae9ff' : m === 'TAPE' ? '#fdf9f0' : '#fde69d'
      const lampFace2   = m === 'CD' ? '#adc8f0' : m === 'TAPE' ? '#f5ede0' : '#f7cd6a'
      const lampFace3   = m === 'CD' ? '#6090c8' : m === 'TAPE' ? '#c8b8a0' : '#ab7c24'
      const lampBeamA   = m === 'CD' ? 'rgba(200,220,255,0.42)'  : m === 'TAPE' ? 'rgba(255,252,240,0.42)'  : 'rgba(253,230,138,0.42)'
      const lampBeamB   = m === 'CD' ? 'rgba(200,220,255,0.15)'  : m === 'TAPE' ? 'rgba(255,252,240,0.15)'  : 'rgba(253,230,138,0.15)'
      const lampRadialA = m === 'CD' ? 'rgba(220,235,255,0.50)'  : m === 'TAPE' ? 'rgba(255,255,248,0.50)'  : 'rgba(255,236,179,0.50)'
      const lampRadialB = m === 'CD' ? 'rgba(220,235,255,0.22)'  : m === 'TAPE' ? 'rgba(255,255,248,0.22)'  : 'rgba(255,236,179,0.22)'
      const lampRadialC = m === 'CD' ? 'rgba(220,235,255,0.05)'  : m === 'TAPE' ? 'rgba(255,255,248,0.05)'  : 'rgba(255,236,179,0.05)'

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
          
          targetLeft = 0.08 + Math.pow(avgL, 0.65) * 0.90 * modL
          targetRight = 0.08 + Math.pow(avgR, 0.65) * 0.90 * modR
          
          targetLeft = Math.min(1.05, targetLeft)
          targetRight = Math.min(1.05, targetRight)
        } else {
          const t = Date.now() * 0.006
          targetLeft = 0.10 + Math.abs(Math.sin(t) * Math.cos(t * 0.5)) * 0.85
          targetRight = 0.10 + Math.abs(Math.cos(t * 0.8) * Math.sin(t * 0.3)) * 0.85
        }
      } else {
        targetLeft = 0.05 + Math.sin(Date.now() * 0.005) * 0.01
        targetRight = 0.05 + Math.cos(Date.now() * 0.005) * 0.01
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
      const padding = 18
      const gap = 42
      const meterW = (W - padding * 2 - gap) / 2

      const drawSingleMeter = (xStart: number, width: number, currentVal: number, label: string) => {
        // Define centered bounding box for the recessed meter window
        const meterH = H * 0.76
        const yStart = (H - meterH) / 2
        const rx = xStart + 2
        const ry = yStart
        const rw = width - 4
        const rh = meterH

        const radius = rh * 0.86
        const cx = rx + rw / 2
        const cy = ry + rh - 6
        const startAngle = Math.PI * (13 / 12)
        const endAngle = Math.PI * (23 / 12)

        // Bezel Outer Border Gradient (Chrome & Vintage Gold blend)
        const rimGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh)
        if (currentLightOn) {
          rimGrad.addColorStop(0, '#cbd5e1')   // Chrome bright highlight
          rimGrad.addColorStop(0.25, '#dca334') // Warm gold sheen
          rimGrad.addColorStop(0.5, '#475569') // Dark steel shadow
          rimGrad.addColorStop(0.75, '#ebd48a') // Warm gold sheen
          rimGrad.addColorStop(1, '#1e293b')   // Deep steel backing
        } else {
          rimGrad.addColorStop(0, '#475569')
          rimGrad.addColorStop(0.5, '#1e293b')
          rimGrad.addColorStop(1, '#0f172a')
        }
        ctx.strokeStyle = rimGrad
        ctx.lineWidth = 3.0
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, 8)
        } else {
          ctx.rect(rx, ry, rw, rh)
        }
        ctx.stroke()

        // Bezel Inner Dark Groove Ring
        ctx.strokeStyle = currentLightOn ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.95)'
        ctx.lineWidth = 1.0
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3, 6.5)
        } else {
          ctx.rect(rx + 1.5, ry + 1.5, rw - 3, rh - 3)
        }
        ctx.stroke()

        // Clip to the recessed window
        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(rx + 2, ry + 2, rw - 4, rh - 4, 6)
        } else {
          ctx.rect(rx + 2, ry + 2, rw - 4, rh - 4)
        }
        ctx.clip()

        // Radial gradient backing for dial face (Warm glowing paper)
        const faceGrad = ctx.createRadialGradient(cx, ry, 5, cx, ry + rh / 2, radius * 1.1)
        if (currentLightOn) {
          faceGrad.addColorStop(0,    lampFace0)
          faceGrad.addColorStop(0.5,  lampFace1)
          faceGrad.addColorStop(0.85, lampFace2)
          faceGrad.addColorStop(1,    lampFace3)
        } else {
          faceGrad.addColorStop(0, '#2c2520')
          faceGrad.addColorStop(0.8, '#1b1613')
          faceGrad.addColorStop(1, '#0e0b09')
        }
        ctx.fillStyle = faceGrad
        ctx.fill()

        // Warm fan-shaped backlight beam spreading out from the pivot (cx, cy) upwards
        if (currentLightOn) {
          ctx.save()
          const conicGrad = ctx.createConicGradient(Math.PI * 1.5, cx, cy)
          conicGrad.addColorStop(0,    lampBeamA)
          conicGrad.addColorStop(0.12, lampBeamB)
          conicGrad.addColorStop(0.24, 'rgba(0,0,0,0)')
          conicGrad.addColorStop(0.76, 'rgba(0,0,0,0)')
          conicGrad.addColorStop(0.88, lampBeamB)
          conicGrad.addColorStop(1,    lampBeamA)
          
          ctx.fillStyle = conicGrad
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, radius * 1.02, startAngle, endAngle)
          ctx.closePath()
          ctx.fill()
          
          // Subtle radial overlay centered at pivot (cx, cy) to fade the beam as it goes up
          const radialBeam = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius * 0.95)
          radialBeam.addColorStop(0,   lampRadialA)
          radialBeam.addColorStop(0.2, lampRadialB)
          radialBeam.addColorStop(0.7, lampRadialC)
          radialBeam.addColorStop(1,   'rgba(0,0,0,0)')
          
          ctx.fillStyle = radialBeam
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, radius * 1.02, startAngle, endAngle)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        // Recessed inner shadow stroke
        ctx.strokeStyle = currentLightOn ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, radius * 1.05, startAngle, endAngle)
        ctx.stroke()
        ctx.save()
        ctx.translate(cx, cy)

        const divisions = 20

        ctx.font = `bold ${Math.max(8.5, radius * 0.125)}px 'Outfit', sans-serif`
        ctx.textAlign = 'center'

        for (let i = 0; i <= divisions; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / divisions)
          const pct = i / divisions
          const isRed = pct >= 0.75

          if (currentLightOn) {
            ctx.strokeStyle = isRed ? '#df2020' : 'rgba(18,12,8,0.75)'
          } else {
            ctx.strokeStyle = isRed ? '#881337' : 'rgba(255,255,255,0.18)'
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
                ctx.fillStyle = isRed ? '#df2020' : 'rgba(18,12,8,0.85)'
              } else {
                ctx.fillStyle = isRed ? '#881337' : 'rgba(255,255,255,0.15)'
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

        ctx.strokeStyle = currentLightOn ? '#df2020' : '#881337'
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
          ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
          ctx.shadowBlur = 4.5
          ctx.shadowOffsetX = 1.8
          ctx.shadowOffsetY = 2.2
          ctx.strokeStyle = '#e11d48' // High-end rose-red needle
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
          ctx.shadowBlur = 2.0
          ctx.shadowOffsetX = 0.5
          ctx.shadowOffsetY = 0.5
          ctx.strokeStyle = '#881337' // Darker rose-red needle
        }
        
        ctx.lineWidth = Math.max(1.2, radius * 0.024)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(needleAngle) * radius, cy + Math.sin(needleAngle) * radius)
        ctx.stroke()
        ctx.restore()

        // Responsive multi-layered pivot caps
        // Outer black ring
        ctx.fillStyle = currentLightOn ? '#0f172a' : '#020617'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(6, radius * 0.105), 0, Math.PI * 2)
        ctx.fill()
        
        // Middle silver gradient bezel ring
        const silverGrad = ctx.createLinearGradient(cx - 3, cy - 3, cx + 3, cy + 3)
        silverGrad.addColorStop(0, '#cbd5e1')
        silverGrad.addColorStop(0.5, '#475569')
        silverGrad.addColorStop(1, '#f1f5f9')
        ctx.fillStyle = silverGrad
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(3.5, radius * 0.055), 0, Math.PI * 2)
        ctx.fill()

        // Inner black center pin
        ctx.fillStyle = '#020617'
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1.8, radius * 0.022), 0, Math.PI * 2)
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
  const [tracks, setTracks]         = useState<Track[]>([])
  const [track, setTrack]           = useState<Track>({
    id: 1, title: 'No Songs Loaded', artist: 'Please Scan or Add Music', genre: 'None', mood: [], bpm: 100, key: 'C', mediaPref: 'CD', duration: 180, lyrics: [], src: '', linerNotes: ''
  })
  const [isPlaying, setPlaying]     = useState(false)
  const [mediaType, setMediaType]   = useState<MediaType>('CD')
  const [currentTime, setTime]      = useState(0)
  const [volume, setVolume]         = useState(0.40)
  const [muted, setMuted]           = useState(false)
  const [repeat, setRepeat]         = useState(false)
  const [shuffle, setShuffle]       = useState(false)
  const [activePlaylist, setActivePlaylist] = useState('Featured')
  const [playlists, setPlaylists] = useState<string[]>(['Featured', 'Retro Vibes', 'Eurodance Energy', 'Ambient Waves'])
  const [customPlaylists, setCustomPlaylists] = useState<Record<string, number[]>>({})
  const [ttsVoiceMode, setTtsVoiceMode] = useState<'sunhi' | 'injoon'>('sunhi')
  const [ttsEnergyMode, setTtsEnergyMode] = useState<'standard' | 'energetic'>('energetic')
  const [aiQuery, setAiQuery]       = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiTalking, setIsAiTalking] = useState(false)
  const [audioData, setAudioData]   = useState<Uint8Array | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [isDraggingSpeed, setIsDraggingSpeed] = useState(false)
  const [isMrMode, setIsMrMode] = useState(false)
  const [isAiEqEnabled, setIsAiEqEnabled] = useState(true)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      const baseWidth = 1920;
      const baseHeight = 980;
      const scaleX = window.innerWidth / baseWidth;
      const scaleY = window.innerHeight / baseHeight;
      const newScale = Math.min(scaleX, scaleY);
      setScale(Math.max(0.65, Math.min(2.5, newScale)));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const dragStartYRef = useRef<number>(0)
  const dragStartRateRef = useRef<number>(1.0)
  const knobRef = useRef<HTMLDivElement>(null)

  // Load track list dynamically from server on page load
  useEffect(() => {
    const loadDynamicTracks = async () => {
      try {
        const res = await fetch('/api/tracks');
        if (res.ok) {
          const loadedTracks = await res.json();
          if (loadedTracks.length > 0) {
            setTracks(loadedTracks);
            setTrack(loadedTracks[0]);
            setFocusedTrackId(loadedTracks[0].id);
            if (loadedTracks[0].mediaPref) {
              setMediaType(loadedTracks[0].mediaPref);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load tracks", e);
      }
    };
    loadDynamicTracks();
  }, []);

  // Dev-only hot reload helper for corporate proxy / OneDrive synced folder envs
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    let lastVersion: number | null = null;
    let isReconnecting = false;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/dev-version');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.version) {
          if (lastVersion !== null && lastVersion !== data.version && !isReconnecting) {
            isReconnecting = true;
            console.log('[AI Jukebox Dev] File changes detected. Auto-refreshing browser...');
            setTimeout(() => {
              window.location.reload();
            }, 800);
          } else {
            lastVersion = data.version;
          }
        }
      } catch (err) {
        // Ignore errors during re-compilation
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, track])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch((err) => {
        console.error("Failed to enter fullscreen:", err)
      })
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }
  
  // Custom states for gradual acceleration/deceleration CD spin removed (now using requestAnimationFrame physics)

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aiJukeboxUserPresets');
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
    } catch (e) {}
  }, [])
  const [showSavePresetModal, setShowSavePresetModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  // Sound Effects States
  const [reverbLevel, setReverbLevel]   = useState(15)      // 0-100
  const [reverbPreset, setReverbPreset] = useState<'ROOM' | 'HALL' | 'CATHEDRAL' | 'CONCERT' | 'STUDIO'>('ROOM')
  const [echoLevel, setEchoLevel]       = useState(20)      // 0-100
  const [bassBoost, setBassBoost]       = useState(20)      // 0-100
  const [vocalClarity, setVocalClarity] = useState(30)      // 0-100
  const [loudness, setLoudness]         = useState(true)

  useEffect(() => {
    const handleMrModeChange = async () => {
      if (!audioRef.current) return;
      const t = ctxRef.current?.currentTime || 0;
      
      if (isMrMode) {
        // Try to load Demucs high-quality MR first
        const mrSrc = track.src.replace('.mp3', '_mr.wav');
        try {
          const res = await fetch(mrSrc, { method: 'HEAD' });
          if (res.ok) {
            const currentTime = audioRef.current.currentTime;
            const wasPlaying = !audioRef.current.paused;
            audioRef.current.src = mrSrc;
            audioRef.current.currentTime = currentTime;
            if (wasPlaying) audioRef.current.play().catch(()=>{});
            
            // Disable WebAudio OOPS since we have native MR
            if (mrDryRef.current && mrWetRef.current) {
              mrDryRef.current.gain.setTargetAtTime(1, t, 0.1);
              mrWetRef.current.gain.setTargetAtTime(0, t, 0.1);
            }
            return;
          }
        } catch (err) {}
        
        // Fallback: Web Audio OOPS Filter (Phase Cancellation)
        if (mrDryRef.current && mrWetRef.current) {
          mrDryRef.current.gain.setTargetAtTime(0, t, 0.1);
          mrWetRef.current.gain.setTargetAtTime(1, t, 0.1);
        }
      } else {
        // Revert to original track if playing MR
        if (audioRef.current.src.includes('_mr.wav')) {
          const currentTime = audioRef.current.currentTime;
          const wasPlaying = !audioRef.current.paused;
          audioRef.current.src = track.src;
          audioRef.current.currentTime = currentTime;
          if (wasPlaying) audioRef.current.play().catch(()=>{});
        }
        
        // Disable OOPS
        if (mrDryRef.current && mrWetRef.current) {
          mrDryRef.current.gain.setTargetAtTime(1, t, 0.1);
          mrWetRef.current.gain.setTargetAtTime(0, t, 0.1);
        }
      }
    };
    handleMrModeChange();
  }, [isMrMode, track.src]);

  // Responsive UI Scaling state (Scale 1920x1080 to fit window)
  const [uiScale, setUiScale] = useState(1)
  const [isAiLabOpen, setIsAiLabOpen] = useState(true) // Always true now
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const wScale = window.innerWidth / 1920
      const hScale = window.innerHeight / 1080
      setUiScale(Math.min(wScale, hScale))
    }
    // Set initial size
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Edit Metadata Modal States
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editGenre, setEditGenre] = useState('')
  const [editBpm, setEditBpm] = useState(100)
  const [editKey, setEditKey] = useState('A Minor')
  const [editCover, setEditCover] = useState('')
  const [editLyricsText, setEditLyricsText] = useState('')
  const [isGeneratingCover, setIsGeneratingCover] = useState(false)

  // AI Lyrics Generating State
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false)
  const [isAnalyzingEq, setIsAnalyzingEq] = useState(false)
  const [generatedTracks, setGeneratedTracks] = useState<Record<number, boolean>>({})

  // AI Voice Narration State & Effect
  const [isTtsNarratorEnabled, setIsTtsNarratorEnabled] = useState(false)

  // Media Mounting State
  const [isMounting, setIsMounting] = useState(false)

  // LP Vinyl Physics Ref
  const lpAngleRef = useRef(0)
  const lpVelRef = useRef(0)
  const lpHubRef = useRef<HTMLDivElement>(null)
  const lpLabelRef = useRef<HTMLDivElement>(null)

  // CD Physics Ref
  const cdAngleRef = useRef(0)
  const cdVelRef = useRef(0)
  const cdBodyRef = useRef<HTMLDivElement>(null)

  // Tape Physics Ref
  const tapeAngleRef = useRef(0)
  const tapeVelRef = useRef(0)
  const tapeGearLeftRef = useRef<HTMLDivElement>(null)
  const tapeGearRightRef = useRef<HTMLDivElement>(null)

  // Physics loop for Media
  useEffect(() => {
    let raf: number
    const loop = () => {
      // LP
      const isLpPlaying = isPlaying && !isMounting && mediaType === 'LP'
      if (isLpPlaying) lpVelRef.current += (3.5 - lpVelRef.current) * 0.05
      else lpVelRef.current *= 0.985
      
      if (lpVelRef.current > 0.01) {
        lpAngleRef.current += lpVelRef.current
        if (lpHubRef.current) lpHubRef.current.style.transform = `translate(-50%, -50%) rotate(${lpAngleRef.current}deg)`
        if (lpLabelRef.current) lpLabelRef.current.style.transform = `translate(-50%, -50%) rotate(${lpAngleRef.current}deg)`
      }

      // CD
      const isCdPlaying = isPlaying && !isMounting && mediaType === 'CD'
      if (isCdPlaying) cdVelRef.current += (13.0 - cdVelRef.current) * 0.05
      else cdVelRef.current *= 0.97
      
      if (cdVelRef.current > 0.01) {
        cdAngleRef.current += cdVelRef.current
        if (cdBodyRef.current) cdBodyRef.current.style.transform = `rotate(${cdAngleRef.current}deg)`
      }

      // TAPE
      const isTapePlaying = isPlaying && !isMounting && mediaType === 'TAPE'
      if (isTapePlaying) tapeVelRef.current += (2.5 - tapeVelRef.current) * 0.1
      else tapeVelRef.current *= 0.95
      
      if (tapeVelRef.current > 0.01) {
        tapeAngleRef.current += tapeVelRef.current
        if (tapeGearLeftRef.current) tapeGearLeftRef.current.style.transform = `translate(-50%, -50%) rotate(${tapeAngleRef.current}deg)`
        if (tapeGearRightRef.current) tapeGearRightRef.current.style.transform = `translate(-50%, -50%) rotate(${tapeAngleRef.current}deg)`
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, isMounting, mediaType])

  // 3D Album Cover Cylinder Slot-Machine States
  const [isCylinderSpinning, setIsCylinderSpinning] = useState(false)
  const [rollingIndex, setRollingIndex] = useState(0)
  const [cylinderDeg, setCylinderDeg] = useState(0)
  // 3D Physical Media Slot-Machine Flight Loader states
  const [showMediaFlight, setShowMediaFlight] = useState(false)
  const [flightType, setFlightType] = useState<MediaType>('LP')
  const [isDeckImpact, setIsDeckImpact] = useState(false)
  const [loadingTrackId, setLoadingTrackId] = useState<number | null>(null)
  // Guard ref to prevent stale selectTrack setTimeout from overwriting the active track
  const selectSessionRef = useRef<number>(0)
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const mrDryRef       = useRef<GainNode | null>(null)
  const mrWetRef       = useRef<GainNode | null>(null)
  const makeupGainRef  = useRef<GainNode | null>(null)
  
  const rtaCanvasRef   = useRef<HTMLCanvasElement>(null)
  const leftVisRef     = useRef<HTMLCanvasElement>(null)
  const rightVisRef    = useRef<HTMLCanvasElement>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenLyricsContainerRef = useRef<HTMLDivElement>(null)
  const fsTrackRef     = useRef<HTMLDivElement>(null)
  const fsTranslateRef = useRef<number>(0)
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

    // --- Pro MR Mode (OOPS + Bass Recovery) Stage ---
    const splitter = ctx.createChannelSplitter(2)
    const merger = ctx.createChannelMerger(2)
    
    // 1. OOPS Path (L - R) to remove center vocals (mid/high frequencies)
    const inverter = ctx.createGain()
    inverter.gain.value = -1

    splitter.connect(merger, 0, 0)
    splitter.connect(inverter, 1)
    inverter.connect(merger, 0, 0)
    
    splitter.connect(merger, 0, 1)
    inverter.connect(merger, 0, 1)

    // 2. Bass Recovery Path (L + R, Lowpass filtered to keep kick/sub-bass intact)
    const bassSum = ctx.createGain()
    bassSum.gain.value = 0.6
    const bassFilter = ctx.createBiquadFilter()
    bassFilter.type = 'lowpass'
    bassFilter.frequency.value = 180
    bassFilter.Q.value = 0.5
    
    splitter.connect(bassSum, 0)
    splitter.connect(bassSum, 1)
    bassSum.connect(bassFilter)
    bassFilter.connect(merger, 0, 0)
    bassFilter.connect(merger, 0, 1)

    const mrDryNode = ctx.createGain()
    const mrWetNode = ctx.createGain()
    
    src.connect(mrDryNode)
    src.connect(splitter)
    merger.connect(mrWetNode)

    const preEqNode = ctx.createGain()
    mrDryNode.connect(preEqNode)
    mrWetNode.connect(preEqNode)

    mrDryRef.current = mrDryNode
    mrWetRef.current = mrWetNode

    mrDryNode.gain.value = isMrMode ? 0 : 1
    mrWetNode.gain.value = isMrMode ? 1 : 0

    // Series 10-Band EQ filters
    const filters: BiquadFilterNode[] = []
    let lastNode: AudioNode = preEqNode

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

    const makeupGainNode = ctx.createGain()
    makeupGainNode.gain.value = 1.0
    lastNode.connect(makeupGainNode)
    makeupGainRef.current = makeupGainNode
    lastNode = makeupGainNode

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
    an.minDecibels = -90
    an.maxDecibels = -10
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
    let sumGain = 0
    gains.forEach((val, idx) => {
      const g = sliderToGain(val)
      sumGain += g
      if (eqFiltersRef.current[idx]) {
        eqFiltersRef.current[idx].gain.setTargetAtTime(
          g,
          ctxRef.current!.currentTime,
          0.02
        )
      }
    })

    // Auto-Normalization (Makeup Gain) based on EQ changes to prevent extreme volume swings
    if (makeupGainRef.current) {
      const avgGain = sumGain / 10
      // Apply inverse makeup gain. Divisor tempers the aggressiveness.
      const makeup = Math.pow(10, -avgGain / 30) 
      makeupGainRef.current.gain.setTargetAtTime(makeup, ctxRef.current.currentTime, 0.05)
    }
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
      } else {
        // Render empty state if not playing (already clearing)
      }
      requestAnimationFrame(drawRta)
    }
    drawRta()
    return () => { active = false }
  }, [isPlaying, mediaType, isFullscreen, isAiLabOpen])

  // Dedicated Fullscreen Glow Bars rendering loop
  useEffect(() => {
    let active = true
    const drawGlow = () => {
      if (!active) return
      requestAnimationFrame(drawGlow)
      
      if (leftVisRef.current && rightVisRef.current && analyserRef.current && isPlaying) {
        const lCanvas = leftVisRef.current;
        const rCanvas = rightVisRef.current;
        const lCtx = lCanvas.getContext('2d');
        const rCtx = rCanvas.getContext('2d');
        
        if (lCtx && rCtx) {
          // Prevent infinite resize loops by only resizing when needed
          const expectedWidth = Math.floor(lCanvas.offsetWidth);
          const expectedHeight = Math.floor(lCanvas.offsetHeight);
          
          if (expectedWidth > 0 && expectedHeight > 0) {
            if (lCanvas.width !== expectedWidth) lCanvas.width = expectedWidth;
            if (lCanvas.height !== expectedHeight) lCanvas.height = expectedHeight;
            if (rCanvas.width !== expectedWidth) rCanvas.width = expectedWidth;
            if (rCanvas.height !== expectedHeight) rCanvas.height = expectedHeight;
          }
          
          const w = lCanvas.width;
          const h = lCanvas.height;
          
          if (w === 0 || h === 0) return;
          
          lCtx.clearRect(0, 0, w, h);
          rCtx.clearRect(0, 0, w, h);
          
          let dataArray: Uint8Array;
          let bufferLength = 0;
          try {
            bufferLength = analyserRef.current.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);
          } catch (e) {
            return;
          }
          
          // Use about 40 bins for the vertical visualizer (skip very high frequencies)
          const binsToUse = Math.min(40, bufferLength);
          const sliceHeight = h / (binsToUse - 1);
          
          // Theme colors (softened opacity and balanced for 3-color blending)
          let color1, color2, color3;
          if (mediaType === 'CD') {
            color1 = 'rgba(0, 210, 255, 0.65)'; // High-visibility Cyan
            color2 = 'rgba(138, 43, 226, 0.50)'; // Soft Purple
            color3 = 'rgba(255, 0, 255, 0.35)'; // Soft Magenta
          } else if (mediaType === 'TAPE') {
            color1 = 'rgba(255, 255, 255, 0.70)'; // White
            color2 = 'rgba(169, 181, 194, 0.50)'; // Silver-Grey
            color3 = 'rgba(169, 181, 194, 0.30)'; // Darker Silver-Grey
          } else {
            color1 = 'rgba(220, 163, 52, 0.65)'; // High-visibility Gold
            color2 = 'rgba(234, 88, 12, 0.50)'; // Warm Orange/Amber
            color3 = 'rgba(127, 29, 29, 0.35)'; // Soft Deep Red/Brown
          }
          
          // Left Canvas Gradient (horizontal blend from edge to transparent)
          const gradL = lCtx.createLinearGradient(0, 0, w, 0);
          gradL.addColorStop(0, color1);
          gradL.addColorStop(0.3, color2);
          gradL.addColorStop(0.7, color3);
          gradL.addColorStop(1, 'rgba(0, 0, 0, 0)');
          
          // Right Canvas Gradient (horizontal blend from edge to transparent)
          const gradR = rCtx.createLinearGradient(w, 0, 0, 0);
          gradR.addColorStop(0, color1);
          gradR.addColorStop(0.3, color2);
          gradR.addColorStop(0.7, color3);
          gradR.addColorStop(1, 'rgba(0, 0, 0, 0)');
          
          // --- Draw Left Wave ---
          lCtx.beginPath();
          lCtx.moveTo(0, 0);
          let prevX = 0;
          let prevY = 0;
          for (let i = 0; i < binsToUse; i++) {
            const v = dataArray[i] / 255.0;
            // Scale amplitude. Add base width to ensure a solid edge before the blur diffuses it.
            const x = 15 + Math.pow(v, 1.2) * w * 1.5;
            const y = i * sliceHeight;
            
            if (i === 0) {
              lCtx.lineTo(x, y);
            } else {
              const cpX = (prevX + x) / 2;
              const cpY = (prevY + y) / 2;
              lCtx.quadraticCurveTo(prevX, prevY, cpX, cpY);
            }
            prevX = x;
            prevY = y;
          }
          lCtx.lineTo(prevX, prevY);
          lCtx.lineTo(0, h);
          lCtx.closePath();
          lCtx.fillStyle = gradL;
          lCtx.fill();
          
          // --- Draw Right Wave ---
          rCtx.beginPath();
          rCtx.moveTo(w, 0);
          prevX = w;
          prevY = 0;
          for (let i = 0; i < binsToUse; i++) {
            const v = dataArray[i] / 255.0;
            const x = w - (15 + Math.pow(v, 1.2) * w * 1.5);
            const y = i * sliceHeight;
            
            if (i === 0) {
              rCtx.lineTo(x, y);
            } else {
              const cpX = (prevX + x) / 2;
              const cpY = (prevY + y) / 2;
              rCtx.quadraticCurveTo(prevX, prevY, cpX, cpY);
            }
            prevX = x;
            prevY = y;
          }
          rCtx.lineTo(prevX, prevY);
          rCtx.lineTo(w, h);
          rCtx.closePath();
          rCtx.fillStyle = gradR;
          rCtx.fill();
        }
      } else if (leftVisRef.current && rightVisRef.current) {
        // Clear canvas if paused
        const lCanvas = leftVisRef.current;
        const rCanvas = rightVisRef.current;
        const lCtx = lCanvas.getContext('2d');
        const rCtx = rCanvas.getContext('2d');
        if (lCtx) lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        if (rCtx) rCtx.clearRect(0, 0, rCanvas.width, rCanvas.height);
      }
    }
    
    drawGlow()
    
    return () => { active = false }
  }, [isPlaying, mediaType, isFullscreen])

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
    
    // Increment session ID to invalidate any pending stale selectTrack timers
    const sessionId = ++selectSessionRef.current
    if (selectTimerRef.current) {
      clearTimeout(selectTimerRef.current)
      selectTimerRef.current = null
    }
    
    // Set loading track state for high-end responsive feedback in sidebar listing
    setLoadingTrackId(t.id)
    
    // Use a ref-like mutable container so async fetch can update latestTrackObj
    // and the setTimeout closure always reads the freshest value for THIS session
    const trackBox = { value: t };
    
    // Fetch persisted metadata (.ifx) from local server in background
    const filename = t.src.split('/').pop()?.replace(/\.[^/.]+$/, "") || ""
    if (filename) {
      fetch(`/api/track-metadata?filename=${encodeURIComponent(filename)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          // Only apply if this session is still the active one
          if (selectSessionRef.current !== sessionId) return;
          if (data) {
            const merged = { ...t, ...data };
            trackBox.value = merged;
            setTracks(prev => prev.map(x => x.id === t.id ? merged : x));
            if (isAiEqEnabled) {
              if (data.eq) {
                setEqGains(data.eq);
                gainsToFilters(data.eq);
              } else {
                triggerAutoEq(t.src);
              }
            }
          } else {
            if (isAiEqEnabled) {
              triggerAutoEq(t.src);
            }
          }
        })
        .catch(err => {
          if (selectSessionRef.current !== sessionId) return;
          console.error("Error loading track metadata on select:", err);
          if (isAiEqEnabled) {
            triggerAutoEq(t.src);
          }
        });
    }
    
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
    setIsMounting(true)

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

    selectTimerRef.current = setTimeout(() => {
      // CRITICAL GUARD: Only execute if this session is still the active one.
      // Prevents stale timers from overwriting the current track with a previous selection.
      if (selectSessionRef.current !== sessionId) return;
      
      setIsCylinderSpinning(false)
      setShowMediaFlight(false)
      setLoadingTrackId(null)
      setIsMounting(false)
      selectTimerRef.current = null
      
      // Reset spin speeds on exact swap so that new media starts spinning from 0 speed
      lpVelRef.current = 0
      cdVelRef.current = 0
      tapeVelRef.current = 0

      // EXACT MOMENT OF SWAP: Now that the flight loader has aligned exactly with the deck,
      // update active track state and reset position! Player mode remains unchanged.
      setTrack(trackBox.value)
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

  const getDuration = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0 && audioRef.current.duration !== Infinity) {
      return audioRef.current.duration
    }
    return track.duration
  }

  const getVocalIntensity = () => {
    if (!audioData) return 0
    const vocalSlice = audioData.slice(15, 60)
    const sum = vocalSlice.reduce((a, b) => a + b, 0)
    return sum / (vocalSlice.length * 255)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth
    const t = r * getDuration()
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

  const handleKnobMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSpeed(true)
    dragStartYRef.current = e.clientY
    dragStartRateRef.current = playbackRate

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = dragStartYRef.current - moveEvent.clientY
      const change = (deltaY / 100) * 1.5
      const newRate = Math.max(0.5, Math.min(2.0, dragStartRateRef.current + change))
      setPlaybackRate(Math.round(newRate * 10) / 10)
    }

    const onMouseUp = () => {
      setIsDraggingSpeed(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const handleKnobTouchStart = (e: React.TouchEvent) => {
    if (!e.touches[0]) return
    setIsDraggingSpeed(true)
    dragStartYRef.current = e.touches[0].clientY
    dragStartRateRef.current = playbackRate

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!moveEvent.touches[0]) return
      const deltaY = dragStartYRef.current - moveEvent.touches[0].clientY
      const change = (deltaY / 100) * 1.5
      const newRate = Math.max(0.5, Math.min(2.0, dragStartRateRef.current + change))
      setPlaybackRate(Math.round(newRate * 10) / 10)
    }

    const onTouchEnd = () => {
      setIsDraggingSpeed(false)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove)
    document.addEventListener('touchend', onTouchEnd)
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

  // AI Speech DJ voice synthesize feedback (Text To Speech - Neural via edge-tts with fallback)
  const speakResponse = async (text: string) => {
    if (typeof window === 'undefined') return;
    
    // Stop any currently playing speech synthesis or audio TTS elements
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    // Check if we have a custom TTS audio element, stop it if playing
    let ttsAudio = document.getElementById('neural-tts-audio') as HTMLAudioElement;
    if (ttsAudio) {
      ttsAudio.onerror = null;
      ttsAudio.onended = null;
      ttsAudio.pause();
      ttsAudio.src = "";
    }

    setIsAiTalking(true);

    const voice = ttsVoiceMode === 'sunhi' ? 'ko-KR-SunHiNeural' : 'ko-KR-InJoonNeural';
    const rate = ttsEnergyMode === 'energetic' ? '+12%' : '+4%';
    const pitch = ttsEnergyMode === 'energetic' ? '+6Hz' : '+0Hz';

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text.replace(/✦/g, ''),
          voice,
          rate,
          pitch
        })
      });

      if (!res.ok) throw new Error("Neural TTS failed");
      const data = await res.json();
      
      if (data.url) {
        if (!ttsAudio) {
          ttsAudio = document.createElement('audio');
          ttsAudio.id = 'neural-tts-audio';
          document.body.appendChild(ttsAudio);
        }
        ttsAudio.src = data.url;
        ttsAudio.volume = volume;
        ttsAudio.play().catch((err: any) => {
          // Fallback if autoplay is blocked
          if (err && err.name === 'NotAllowedError') {
            localSpeakFallback(text);
          } else {
            setIsAiTalking(false);
          }
        });
        ttsAudio.onended = () => setIsAiTalking(false);
        ttsAudio.onerror = (e) => {
          // Only fallback if the src is valid and failed, not if it was cleared
          if (ttsAudio.src && ttsAudio.src !== window.location.href && !ttsAudio.src.endsWith('/')) {
            localSpeakFallback(text);
          } else {
            setIsAiTalking(false);
          }
        };
        return;
      }
    } catch (err) {
      console.warn("Neural TTS API call failed, falling back to Web Speech API:", err);
    }

    localSpeakFallback(text);
  }

  const localSpeakFallback = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsAiTalking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/✦/g, ''));
    utterance.lang = 'ko-KR';
    utterance.rate = 1.05;
    utterance.pitch = 0.98;
    
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.startsWith('ko') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Heami'))) || 
                    voices.find(v => v.lang.startsWith('ko'));
    if (koVoice) utterance.voice = koVoice;

    utterance.onstart = () => setIsAiTalking(true);
    utterance.onend = () => setIsAiTalking(false);
    utterance.onerror = () => setIsAiTalking(false);
    window.speechSynthesis.speak(utterance);
  }

  // NLP client-side query matching & Audio TTS reaction
  const submitAiQuery = async () => {
    const q = aiQuery
    if (!q.trim()) return
    
    setAiQuery('')
    setAiResponse("요청하신 내용을 수행 중입니다...")

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: q, 
          currentTrackName: track.title,
          currentTrackArtist: track.artist,
          mediaType: mediaType,
          tracks: tracks
        })
      });

      if (res.status === 501) {
        // Fallback to Rule-based if no API key
        let key = 'default'
        if (q.includes('비') || q.includes('우산') || q.includes('rain')) key = 'rainy'
        else if (q.includes('편한') || q.includes('힐링') || q.includes('chill')) key = 'chill'
        else if (q.includes('에너지') || q.includes('신나') || q.includes('클럽') || q.includes('dance')) key = 'energy'
        else if (q.includes('우주') || q.includes('몽환') || q.includes('space') || q.includes('mirage')) key = 'space'
        else if (q.includes('플레이리스트') || q.includes('리스트') || q.includes('playlist') || q.includes('믹스')) key = 'playlist'

        const resText = AI_DJ_RESPONSES[key] || AI_DJ_RESPONSES['default']
        setAiResponse(resText)
        speakResponse(resText)

        if (key === 'rainy') selectTrack(tracks[0])
        else if (key === 'chill') selectTrack(tracks[10] || tracks[1])
        else if (key === 'energy') selectTrack(tracks[1])
        else if (key === 'space') selectTrack(tracks[2])
        else if (key === 'playlist') {
          const playlistName = "AI DJ Custom Mix";
          setPlaylists(prev => prev.includes(playlistName) ? prev : [...prev, playlistName]);
          setCustomPlaylists(prev => ({
            ...prev,
            [playlistName]: [1, 2, 4, 7].filter(id => tracks.some(t => t.id === id))
          }));
          setActivePlaylist(playlistName);
        }
        return;
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "API Request Failed");
      }

      const data = await res.json();
      setAiResponse(data.reply);
      speakResponse(data.reply);

      // Execute AI actions (Function Calling)
      if (data.actions && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action.name === 'change_track') {
             const trackId = action.args.track_id;
             if (trackId !== undefined) {
               const match = tracks.find(t => t.id === Number(trackId));
               if (match) selectTrack(match);
             } else {
               const trackKeyword = action.args.track_name || action.args.mood;
               if (trackKeyword) {
                 const match = tracks.find(t => 
                   t.title.toLowerCase().includes(trackKeyword.toLowerCase()) || 
                   t.genre.toLowerCase().includes(trackKeyword.toLowerCase())
                 );
                 if (match) selectTrack(match);
               }
             }
          } else if (action.name === 'set_eq') {
             applyPreset(action.args.preset);
          } else if (action.name === 'set_reverb') {
             updateReverb(action.args.level, action.args.environment);
          } else if (action.name === 'set_volume') {
             if (action.args.level !== undefined) {
               setVolume(action.args.level / 100);
             }
             if (action.args.mute !== undefined) {
               setMuted(action.args.mute);
             }
          } else if (action.name === 'change_media_type') {
             if (action.args.media_type) {
               setMediaType(action.args.media_type);
             }
          } else if (action.name === 'set_fullscreen') {
             if (action.args.enabled !== undefined) {
               setIsFullscreen(action.args.enabled);
             }
          } else if (action.name === 'create_playlist') {
             const name = action.args.playlist_name || "Custom Mix";
             const ids = action.args.track_ids;
             if (name && Array.isArray(ids)) {
               setPlaylists(prev => prev.includes(name) ? prev : [...prev, name]);
               setCustomPlaylists(prev => ({
                 ...prev,
                 [name]: ids.map(Number)
               }));
               setActivePlaylist(name);
             }
          }
        }
      }
      
    } catch (err: any) {
      console.error(err);
      const fallbackMsg = `앗, 문제가 생겼네요: ${err.message}`;
      setAiResponse(fallbackMsg);
      speakResponse("오류가 발생했습니다.");
    }
  }

  const applyPreset = (name: string) => {
    if (isAiEqEnabled) return;
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
    
    setCustomPresets(prev => {
      const next = { ...prev, [name]: [...eqGains] };
      // Limit to 2 default + 3 custom = 5 max
      const keys = Object.keys(next);
      if (keys.length > 5) {
        const toRemove = keys.find(k => k !== 'WARM TUBE' && k !== 'DANCE BOOM' && k !== name);
        if (toRemove) delete next[toRemove];
      }
      try {
        localStorage.setItem('aiJukeboxUserPresets', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
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

    let parsedMeta: { title?: string; artist?: string; coverUrl?: string; coverBlob?: Blob } = {};
    try {
      parsedMeta = await parseMp3Metadata(file);
    } catch (err) {
      console.error("ID3 parsing error:", err);
    }

    const formData = new FormData();
    formData.append('file', file);
    if (parsedMeta.title) formData.append('title', parsedMeta.title);
    if (parsedMeta.artist) formData.append('artist', parsedMeta.artist);
    if (parsedMeta.coverBlob) formData.append('coverBlob', parsedMeta.coverBlob, 'cover.jpg');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        
        // Refetch the dynamic tracks list
        const tracksRes = await fetch('/api/tracks');
        if (tracksRes.ok) {
          const updatedTracks = await tracksRes.json();
          setTracks(updatedTracks);
          
          // Select the newly uploaded track
          const newTrack = updatedTracks.find((t: Track) => t.src.includes(data.filename)) || updatedTracks[updatedTracks.length - 1];
          if (newTrack) {
            selectTrack(newTrack);
            // Automatically analyze the uploaded track and save EQ profile to its .ifx metadata
            triggerAutoEq(newTrack.src);
          }
        }
        
        speakResponse("오디오 트랙이 성공적으로 시스템에 업로드되고 저장되었습니다. 인공지능 주파수 분석을 시작합니다.");
      } else {
        throw new Error("Upload failed");
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      speakResponse("오디오 업로드에 실패했습니다.");
    }
  }

  // AI Automatic EQ Audio Analysis (Pink Noise matching)
  const triggerAutoEq = async (audioSrc: string) => {
    const filename = audioSrc.split('/').pop() || "";
    if (!filename) return;

    setIsAnalyzingEq(true);
    try {
      const res = await fetch('/api/auto-eq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (!res.ok) throw new Error("Auto-EQ analysis failed");
      const data = await res.json();
      if (data.eq) {
        setEqGains(data.eq);
        gainsToFilters(data.eq);

        // Save new EQ profile to the track's .ifx file
        const metaName = filename.replace(/\.[^/.]+$/, "");
        // Fetch current metadata first
        let currentMeta = {};
        try {
          const checkRes = await fetch(`/api/track-metadata?filename=${encodeURIComponent(metaName)}`);
          if (checkRes.ok) currentMeta = await checkRes.json();
        } catch (e) {}

        const updatedMeta = {
          ...currentMeta,
          eq: data.eq
        };

        await fetch('/api/track-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: metaName,
            metadata: updatedMeta
          })
        });

        // Update tracks state
        setTracks(prev => prev.map(x => {
          if (x.src.includes(filename)) {
            return { ...x, eq: data.eq };
          }
          return x;
        }));
      }
    } catch (err) {
      console.error("AI Auto-EQ analysis failed:", err);
    } finally {
      setIsAnalyzingEq(false);
    }
  }

  // AI Generative Lyrics using Python Backend (Whisper + Demucs)
  const generateAiLyrics = async () => {
    setIsGeneratingLyrics(true)

    const filename = track.src.split('/').pop() || ""
    if (!filename) {
      setIsGeneratingLyrics(false)
      return
    }

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      })

      if (!res.ok) throw new Error("Synthesis failed")

      // Reload metadata from .ifx which the Python script just updated
      const metaRes = await fetch(`/api/track-metadata?filename=${encodeURIComponent(filename)}`)
      if (metaRes.ok) {
        const data = await metaRes.json()
        const updatedTrack = { ...track, ...data }
        setTrack(updatedTrack)
        setTracks(prevTracks => prevTracks.map(x => x.id === track.id ? updatedTrack : x))
      }

      setGeneratedTracks(prev => ({ ...prev, [track.id]: true }))
      speakResponse("오디오 주파수 스캔 및 AI 보컬 분석이 완료되었습니다. 추출된 타임스탬프 기반 가사가 적용됩니다.")
    } catch (err) {
      console.error(err)
      speakResponse("가사 추출 중 오류가 발생했습니다. Whisper 및 Demucs 모듈 설치 상태를 확인해주세요.")
    } finally {
      setIsGeneratingLyrics(false)
    }
  }

  // Open Edit Track Modal & Bind variables
  const openEditDialog = (t: Track) => {
    setEditingTrack(t)
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
  const saveTrackProperties = async () => {
    if (!editingTrack) return
    const updatedTrack = {
      ...editingTrack,
      title: editTitle,
      artist: editArtist,
      genre: editGenre,
      bpm: Number(editBpm),
      key: editKey,
      coverUrl: editCover,
      lyrics: editLyricsText.split('\n').filter(l => l.trim().length > 0)
    }

    // Persist to server metadata file (.ifx) inside public/music
    const filename = editingTrack.src.split('/').pop()?.replace(/\.[^/.]+$/, "") || ""
    const res = await fetch('/api/track-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        metadata: {
          title: updatedTrack.title,
          artist: updatedTrack.artist,
          genre: updatedTrack.genre,
          bpm: updatedTrack.bpm,
          key: updatedTrack.key,
          coverUrl: updatedTrack.coverUrl,
          lyrics: updatedTrack.lyrics
        }
      })
    })

    if (!res.ok) throw new Error('Save failed')
    const updated = await res.json()
    
    // Refresh track list to get the updated metadata
    const tracksRes = await fetch('/api/tracks')
    if (tracksRes.ok) {
      setTracks(await tracksRes.json())
    }
    
    setShowEditModal(false)
  }

  const generateDalleCover = async () => {
    if (!editingTrack) return
    setIsGeneratingCover(true)
    try {
      const filename = editingTrack.src.split('/').pop() || 'unknown.mp3';
      const res = await fetch('/api/dalle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: editTitle, 
          artist: editArtist, 
          genre: editGenre,
          filename: filename
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "DALL-E request failed");
      }
      const data = await res.json();
      setEditCover(data.coverUrl);
    } catch (err: any) {
      console.error(err);
      alert("커버 생성 실패: " + err.message);
    } finally {
      setIsGeneratingCover(false);
    }
  }



  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Parse lines with timestamps or distribute them smartly in the vocal range (8% to 92%)
  const parsedLyrics = useMemo(() => {
    return (track.lyrics || []).map((line, idx) => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/)
      if (match) {
        const mins = parseInt(match[1], 10)
        const secs = parseFloat(match[2])
        const time = mins * 60 + secs
        const text = match[3].trim()
        return { time, text, original: line }
      }
      const vocalStartPct = 0.08
      const vocalEndPct = 0.92
      const duration = getDuration()
      const progress = track.lyrics.length > 1 ? idx / (track.lyrics.length - 1) : 0.5
      const estimatedTime = duration * (vocalStartPct + progress * (vocalEndPct - vocalStartPct))
      return { time: estimatedTime, text: line, original: line }
    })
  }, [track.lyrics, track.duration])

  // Live Auto Scrolling Karaoke Syncer logic based on parsed times
  const activeLyricIndex = useMemo(() => {
    if (parsedLyrics.length === 0) return 0
    let foundIdx = 0
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) {
        foundIdx = i
      }
    }
    return foundIdx
  }, [parsedLyrics, currentTime])

  // Continuous smooth scrolling based on precise audio time interpolation
  useEffect(() => {
    let animationFrameId: number;
    const container = lyricsContainerRef.current;
    const fsContainer = fullscreenLyricsContainerRef.current;
    const fsTrack = fsTrackRef.current;
    if (!container || parsedLyrics.length === 0) return;

    const scrollLoop = () => {
      if (audioRef.current && isPlaying) {
        const preciseTime = audioRef.current.currentTime;
        let currentIndex = 0;
        
        for (let i = 0; i < parsedLyrics.length; i++) {
          if (preciseTime >= parsedLyrics[i].time) {
            currentIndex = i;
          }
        }
        
        const currentLyric = parsedLyrics[currentIndex];
        const nextLyric = parsedLyrics[currentIndex + 1];
        
        const lineElements = container.querySelectorAll('.lyrics-line');
        const currentEl = lineElements[currentIndex] as HTMLElement;
        
        if (currentEl) {
          let scrollTarget = currentEl.offsetTop - container.offsetHeight / 2 + currentEl.offsetHeight / 2;
          
          if (nextLyric) {
            const timeRange = nextLyric.time - currentLyric.time;
            const timeProgress = preciseTime - currentLyric.time;
            let progressRatio = timeRange > 0 ? timeProgress / timeRange : 0;
            progressRatio = Math.max(0, Math.min(1, progressRatio));
            
            // Linear progression creates a smooth slow scroll between lines
            const nextEl = lineElements[currentIndex + 1] as HTMLElement;
            if (nextEl) {
              const distanceToNext = nextEl.offsetTop - currentEl.offsetTop;
              scrollTarget += distanceToNext * progressRatio;
            }
          }
          
          // Lerp for butter-smooth visual motion without jitter
          container.scrollTop += (scrollTarget - container.scrollTop) * 0.08;
        }

        // Horizontal fullscreen lyrics scrolling (perfectly static centering, no dynamic drift crawl)
        if (fsContainer && fsTrack) {
          const fsLineElements = fsTrack.querySelectorAll('.fs-lyric-line');
          const fsCurrentEl = fsLineElements[currentIndex] as HTMLElement;
          if (fsCurrentEl) {
            const targetOffset = fsContainer.offsetWidth / 2 - (fsCurrentEl.offsetLeft + fsCurrentEl.offsetWidth / 2);
            
            // Lerp target horizontal translation
            if (fsTranslateRef.current === 0) {
              fsTranslateRef.current = targetOffset;
            } else {
              fsTranslateRef.current += (targetOffset - fsTranslateRef.current) * 0.15;
            }
            fsTrack.style.transform = `translateX(${fsTranslateRef.current}px)`;
          }
        }
      }
      animationFrameId = requestAnimationFrame(scrollLoop);
    };
    
    scrollLoop();
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [parsedLyrics, isPlaying]);

  // Snap horizontal scroll when lyric index changes instantly (like skip/seek)
  useEffect(() => {
    const fsContainer = fullscreenLyricsContainerRef.current;
    const fsTrack = fsTrackRef.current;
    if (fsContainer && fsTrack) {
      const fsLineElements = fsTrack.querySelectorAll('.fs-lyric-line');
      const fsCurrentEl = fsLineElements[activeLyricIndex] as HTMLElement;
      if (fsCurrentEl) {
        const targetOffset = fsContainer.offsetWidth / 2 - (fsCurrentEl.offsetLeft + fsCurrentEl.offsetWidth / 2);
        fsTranslateRef.current = targetOffset;
        fsTrack.style.transform = `translateX(${targetOffset}px)`;
      }
    }
  }, [activeLyricIndex]);

  // AI Voice Narration Effect to read active lyric line in real-time
  useEffect(() => {
    const activeLine = parsedLyrics[activeLyricIndex]
    if (isTtsNarratorEnabled && activeLine && activeLine.text && isPlaying) {
      const text = activeLine.text;
      if (text.startsWith('[') && text.endsWith(']')) return;
      if (text.includes('스캔하고 있습니다') || text.includes('분위기 매칭 대기 중')) return;
      
      const speakLyric = async () => {
        let ttsAudio = document.getElementById('lyric-tts-audio') as HTMLAudioElement;
        if (ttsAudio) {
          ttsAudio.onerror = null;
          ttsAudio.pause();
          ttsAudio.src = "";
        }

        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              if (!ttsAudio) {
                ttsAudio = document.createElement('audio');
                ttsAudio.id = 'lyric-tts-audio';
                document.body.appendChild(ttsAudio);
              }
              ttsAudio.src = data.url;
              ttsAudio.volume = volume;
              ttsAudio.play().catch((err: any) => {
                if (err && err.name === 'NotAllowedError') {
                  localLyricSpeak(text);
                }
              });
              ttsAudio.onerror = () => {
                if (ttsAudio.src && ttsAudio.src !== window.location.href && !ttsAudio.src.endsWith('/')) {
                  localLyricSpeak(text);
                }
              };
              return;
            }
          }
        } catch (e) {}
        localLyricSpeak(text);
      };

      const localLyricSpeak = (txt: string) => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(txt);
          utterance.rate = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const koVoice = voices.find(v => v.lang.startsWith('ko') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Heami'))) || 
                          voices.find(v => v.lang.startsWith('ko'));
          if (koVoice) utterance.voice = koVoice;
          window.speechSynthesis.speak(utterance);
        }
      };

      speakLyric();
    }
  }, [activeLyricIndex, isTtsNarratorEnabled, isPlaying, parsedLyrics]);

  const pendingTrack = tracks.find(x => x.id === loadingTrackId) || track

  // AI Dynamic Playlist Auto-Classification filter
  const filteredTracks = useMemo(() => {
    if (activePlaylist === 'Featured') return tracks
    
    if (customPlaylists[activePlaylist]) {
      return tracks.filter(t => customPlaylists[activePlaylist].includes(t.id))
    }
    
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
  }, [tracks, activePlaylist, customPlaylists])

  const progressPct = Math.min(100, (currentTime / Math.max(getDuration(), 1)) * 100)

  // Cassette tape dynamic winding reel sizes (percentage of container width)
  const leftReelSize = 11.6 + (1 - progressPct / 100) * 14.4
  const rightReelSize = 11.6 + (progressPct / 100) * 14.4

  // For CD and Tape, we use CSS animation. It only spins if playing AND not mounting.
  const isPhysicalSpinning = isPlaying && !isMounting
  const spinSpeedClass = isPhysicalSpinning ? 'spinning' : ''

  return (
    <>
    <div className="scale-wrapper" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
    <div 
      className={`app-layout ${!isAiLabOpen ? 'ai-lab-collapsed' : ''} ${isFullscreen ? 'fullscreen-mode' : ''}`} 
      data-mode={mediaType}
      style={{
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
        width: `${100 / scale}vw`,
        height: `${100 / scale}vh`,
        position: 'absolute',
        top: '50%',
        left: '50%'
      }}
    >
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="logo">
          <span className="ai-badge">AI Synthesis</span>
          <span style={{ color: 'var(--text)', fontWeight: 900 }}>NoJ_JukeBox Studio</span>
        </div>

        {/* Dynamic media selection on header for a beautiful dashboard */}
        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', maxWidth: '680px' }}>
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
          <div className="ai-dj-search-container" style={{ display: 'flex', alignItems: 'center' }}>
            <input
              className="ai-dj-search"
              placeholder="예: 비오는 밤 분위기 추천해줘"
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAiQuery()}
              style={{ flex: 1 }}
            />
            <button
              onClick={submitAiQuery}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="AI에게 물어보기"
            >
              <Sparkles size={16} style={{ color: 'var(--accent)', opacity: 0.9 }} />
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '9.5px', color: 'var(--text-dim)', fontWeight: 600 }}>Voice:</span>
              <button
                onClick={() => { setTtsVoiceMode(ttsVoiceMode === 'sunhi' ? 'injoon' : 'sunhi'); playMechanicalSound('button'); }}
                style={{
                  fontSize: '9.5px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700
                }}
                title="Change DJ voice"
              >
                {ttsVoiceMode === 'sunhi' ? 'SunHi 👩 (Clear)' : 'InJoon 👨 (Energetic)'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '9.5px', color: 'var(--text-dim)', fontWeight: 600 }}>Energy:</span>
              <button
                onClick={() => { setTtsEnergyMode(ttsEnergyMode === 'energetic' ? 'standard' : 'energetic'); playMechanicalSound('button'); }}
                style={{
                  fontSize: '9.5px', background: ttsEnergyMode === 'energetic' ? 'rgba(0, 245, 255, 0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${ttsEnergyMode === 'energetic' ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                  color: ttsEnergyMode === 'energetic' ? 'var(--accent)' : 'var(--text)',
                  padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 800
                }}
                title="Toggle energetic voice style"
              >
                {ttsEnergyMode === 'energetic' ? '⚡ Energetic' : '☕ Standard'}
              </button>
            </div>
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

        {/* Playlists */}
        <div>
          <div className="section-label">Playlists</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {playlists.map(p => (
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Tracks Directory</div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/tracks');
                  if (res.ok) {
                    const loadedTracks = await res.json();
                    if (loadedTracks.length > 0) {
                      setTracks(loadedTracks);
                      speakResponse("음악 디렉토리가 성공적으로 새로고침되었습니다.");
                    }
                  }
                } catch (e) {
                  console.error("Failed to load tracks", e);
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)',
                borderRadius: '4px', padding: '2px 6px', color: 'var(--text-dim)', fontSize: '10px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <RefreshCw size={10} /> REFRESH
            </button>
          </div>
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '4px' }}>
            {filteredTracks.map((t, index) => {
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: '11px', color: isActive ? 'var(--accent)' : 'var(--text-dim)', opacity: 0.6, width: '16px', textAlign: 'right', fontWeight: 700 }}>
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: isActive ? 800 : 600, color: isActive ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        {isCurrent ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditDialog(t) }}
                              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', opacity: 0.8, padding: '2px' }}
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`'${t.title}' 곡을 삭제하시겠습니까?`)) {
                                  const filename = t.src.split('/').pop();
                                  if (filename) {
                                    try {
                                      const res = await fetch('/api/delete', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ filename })
                                      });
                                      if (res.ok) {
                                        speakResponse("곡이 삭제되었습니다.");
                                        const tracksRes = await fetch('/api/tracks');
                                        if (tracksRes.ok) {
                                          const updatedTracks = await tracksRes.json();
                                          setTracks(updatedTracks);
                                        }
                                      }
                                    } catch (err) {
                                      console.error("Delete failed:", err);
                                    }
                                  }
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.8, padding: '2px' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.artist}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Offline Audio File Uploader - Moved below Tracks Directory */}
        <div style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
          <div className="section-label" style={{ marginBottom: '6px' }}>Drop & Upload Audio</div>
          <label className="uploader-box" style={{ display: 'block', padding: '10px' }}>
            <Upload size={16} style={{ margin: '0 auto 4px', color: 'var(--accent)' }} />
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}>Import Audio File</div>
            <div style={{ fontSize: '9.5px', color: 'var(--text-dim)', marginTop: '2px', fontWeight: 600 }}>Click to select audio</div>
            <div style={{ fontSize: '8px', color: 'var(--accent)', marginTop: '3px', letterSpacing: '0.5px' }}>SUPPORTED: MP3, WAV, FLAC, M4A</div>
            <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
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
            <div style={{ fontSize: '17px', fontWeight: 800 }}>{track.title}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--text-dim)', marginTop: '1.5px' }}>{track.artist} • <span style={{ color: 'var(--accent)' }}>{track.genre}</span></div>
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
                  <div className="flight-cd-spindle" />
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
                <div ref={lpHubRef} className="lp-spindle-hub">
                  <div className="sheen-overlay" />
                </div>

                {/* Rotating active track album art label in the record center */}
                <div ref={lpLabelRef} className="lp-center-label">
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
                  <div ref={cdBodyRef} className="cd-body">
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

                {/* Highly opaque real album art label in the center */}
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
                <div ref={tapeGearLeftRef} className="tape-gear-left">
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', color: '#ffffff', opacity: 0.9 }}>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="8" />
                    <path d="M50,8 L50,28 M50,72 L50,92 M13.6,29 L29.6,39 M70.4,61 L86.4,71 M13.6,71 L29.6,61 M70.4,39 L86.4,29" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="13" fill="#0c0805" />
                  </svg>
                </div>
                <div ref={tapeGearRightRef} className="tape-gear-right">
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

        {/* Fullscreen Horizontal Ticker */}
        {isFullscreen && parsedLyrics.length > 0 && (
          <div 
            ref={fullscreenLyricsContainerRef} 
            className="fullscreen-lyrics-ticker"
            style={{
              width: '100%',
              overflow: 'hidden',
              position: 'relative',
              height: '80px',
              display: 'flex',
              alignItems: 'center',
              margin: '10px 0',
              background: 'rgba(0, 0, 0, 0.45)',
              borderRadius: '12px',
              border: '1px solid var(--panel-border)',
              boxShadow: 'inset 0 0 15px rgba(0,0,0,0.5)',
              flexShrink: 0
            }}
          >
            <div 
              ref={fsTrackRef} 
              className="fullscreen-lyrics-track"
              style={{
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                transition: 'transform 0.15s ease-out',
                willChange: 'transform',
                paddingLeft: '50%',
                paddingRight: '50%'
              }}
            >
              {parsedLyrics.map((item, i) => {
                const isCurrentLine = i === activeLyricIndex;
                return (
                  <div
                    key={i}
                    className={`fs-lyric-line ${isCurrentLine ? 'active' : ''}`}
                    style={{
                      display: 'inline-block',
                      padding: '0 40px',
                      fontSize: isCurrentLine ? '24px' : '18px',
                      fontWeight: isCurrentLine ? 800 : 500,
                      color: isCurrentLine ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
                      textShadow: isCurrentLine ? '0 0 15px rgba(var(--accent-rgb), 0.8)' : 'none',
                      transition: 'all 0.3s ease',
                      transform: isCurrentLine ? 'scale(1.15)' : 'scale(1)'
                    }}
                  >
                    {item.text}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Master Controller panel with actual Synced Lyrics Scrolling */}
        <div className="controls-bar">
          <div className="progress-row">
            <span>{fmt(currentTime)}</span>
            <div className="progress-track" onClick={seek}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span>{fmt(getDuration())}</span>
          </div>

          <div className="transport-row" style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr auto 1fr', 
            alignItems: 'center', 
            width: '100%',
            pointerEvents: loadingTrackId !== null ? 'none' : 'auto', 
            opacity: loadingTrackId !== null ? 0.7 : 1, 
            transition: 'all 0.3s ease',
            gap: '24px'
          }}>
            {/* Left Controls: Shuffle, Repeat, Speed Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'flex-start' }}>
              <button className="btn-transport" onClick={() => setShuffle(!shuffle)}
                style={{ color: shuffle ? 'var(--accent)' : undefined }}
                title="Shuffle">
                <Shuffle size={18} />
              </button>
              
              <button className="btn-transport" onClick={() => setRepeat(!repeat)}
                style={{ color: repeat ? 'var(--accent)' : undefined }}
                title="Repeat">
                <Repeat size={18} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.5px' }}>SPEED</span>
                <input type="range" min={0.5} max={2.0} step={0.1}
                  value={playbackRate}
                  onChange={e => {
                    const rate = +e.target.value
                    setPlaybackRate(rate)
                    if (audioRef.current) {
                      audioRef.current.playbackRate = rate
                    }
                  }}
                  style={{ width: '80px', accentColor: 'var(--accent)', cursor: 'pointer', height: '4px' }}
                  title="Playback Speed Slider" />
                <span style={{ fontSize: '12.5px', color: 'var(--accent)', fontWeight: '800', minWidth: '32px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {playbackRate.toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Center Controls: Playback buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
              <button className="btn-transport" onClick={skipPrev} title="Previous Track">
                <SkipBack size={22} />
              </button>
              
              <button 
                className="btn-transport" 
                onClick={() => {
                  if (audioRef.current) {
                    const newTime = Math.max(0, audioRef.current.currentTime - 10)
                    audioRef.current.currentTime = newTime
                    setTime(newTime)
                  }
                }} 
                title="Rewind 10s"
              >
                <Rewind size={22} />
              </button>

              <button className="btn-play" onClick={toggle} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause size={26} color="#000" /> : <Play size={26} color="#000" style={{ marginLeft: 3 }} />}
              </button>

              <button 
                className="btn-transport" 
                onClick={() => {
                  if (audioRef.current) {
                    const newTime = Math.min(getDuration(), audioRef.current.currentTime + 10)
                    audioRef.current.currentTime = newTime
                    setTime(newTime)
                  }
                }} 
                title="Fast Forward 10s"
              >
                <FastForward size={22} />
              </button>

              <button className="btn-transport" onClick={skipNext} title="Next Track">
                <SkipForward size={22} />
              </button>
            </div>

            {/* Right Controls: Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
              <div className="volume-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn-transport" onClick={() => setMuted(!muted)} style={{ cursor: 'pointer' }} title={muted ? "Unmute" : "Mute"}>
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input type="range" className="vol" min={0} max={1} step={0.01}
                  value={muted ? 0 : volume}
                  onChange={e => { setVolume(+e.target.value); setMuted(false) }}
                  style={{ width: '130px', accentColor: 'var(--accent)', cursor: 'pointer', height: '4px' }} />
              </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-dim)', fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, opacity: 0.8, padding: '2px 6px 0 44px' }}>
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
              mode={mediaType}
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
      <aside className="ai-lab" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'hidden' }}>
        <div className="section-label" style={{ marginBottom: 2 }}>AI Sound Lab</div>

        {/* 10-Band EQ Graphic Faders with RTA background spectrum */}
        {!isLyricsExpanded && (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-dim)', fontWeight: 600 }}>10-Band EQ RTA</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: isAnalyzingEq ? 'var(--accent)' : 'var(--text-dim)', letterSpacing: '0.3px' }}>
                    {isAnalyzingEq ? 'Analyzing...' : 'AI EQ'}
                  </span>
                  <button
                    onClick={() => {
                      const nextVal = !isAiEqEnabled;
                      setIsAiEqEnabled(nextVal);
                      if (nextVal) {
                        triggerAutoEq(track.src);
                      }
                      playMechanicalSound('button');
                    }}
                    style={{
                      width: '28px', height: '14px', borderRadius: '10px',
                      background: isAiEqEnabled ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                      position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s',
                      flexShrink: 0
                    }}
                    title="Toggle AI Equalizer Auto Optimization"
                  >
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: '2px', left: isAiEqEnabled ? '16px' : '2px', transition: 'left 0.3s'
                    }} />
                  </button>
                </div>
                <button
                  onClick={() => setShowSavePresetModal(true)}
                  style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Save Custom
                </button>
              </div>
            </div>
            
            <div className="eq-10band-container" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', height: '100px' }}>
              {/* RTA Canvas floating behind the inputs */}
              <canvas ref={rtaCanvasRef} className="rta-canvas" />

              {isAnalyzingEq && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.7)', borderRadius: 10,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  zIndex: 10, gap: '6px'
                }}>
                  <svg width="20" height="20" viewBox="0 0 38 38" stroke="var(--accent)">
                    <g fill="none" fillRule="evenodd">
                      <g transform="translate(1 1)" strokeWidth="3">
                        <circle strokeOpacity=".25" cx="18" cy="18" r="18"/>
                        <path d="M36 18c0-9.94-8.06-18-18-18">
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from="0 18 18"
                            to="360 18 18"
                            dur="0.8s"
                            repeatCount="indefinite"
                          />
                        </path>
                      </g>
                    </g>
                  </svg>
                  <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.5px' }}>ANALYZING SPECTRUM...</span>
                </div>
              )}

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
        )}

        {/* EQ & Sound Presets combined */}
        {!isLyricsExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>EQ & Tuning Presets</span>
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
                    <div style={{ fontSize: '9.5px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
                      {cat.title === 'Standard Reference' && '🎚️ '}
                      {cat.title === 'Genre & Vibes' && '🎵 '}
                      {cat.title === 'Special & Acoustic' && '🍃 '}
                      {cat.title === 'Custom Tuned Presets' && '⚙️ '}
                      {cat.title}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }} className="no-scrollbar">
                      {cat.list.map(name => {
                        const isActive = !isAiEqEnabled && activePreset === name;
                        return (
                          <button key={name} className={`preset-btn ${isActive ? 'active' : ''}`}
                            onClick={() => applyPreset(name)}
                            disabled={isAiEqEnabled}
                            style={{
                              fontSize: '10.5px',
                              padding: '4px 8px',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              opacity: isAiEqEnabled ? 0.35 : 1,
                              cursor: isAiEqEnabled ? 'not-allowed' : 'pointer'
                            }}>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Spatial DSP Audio FX knobs */}
        {!isLyricsExpanded && (
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
                    className="premium-slider"
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
                    className="premium-slider accent2"
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
                    className="premium-slider accent2"
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
                    className="premium-slider"
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>MR MODE</span>
                    <button
                      onClick={() => {
                        setIsMrMode(!isMrMode)
                        if (!isMrMode) speakResponse("보컬 제거 MR 모드를 활성화합니다.")
                        else speakResponse("MR 모드를 해제합니다.")
                      }}
                      style={{
                        width: '32px', height: '16px', borderRadius: '10px',
                        background: isMrMode ? '#ef4444' : 'rgba(255,255,255,0.1)',
                        position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.3s',
                        flexShrink: 0
                      }}
                    >
                      <div style={{
                        width: '12px', height: '12px', borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: '2px', left: isMrMode ? '18px' : '2px', transition: 'left 0.3s'
                      }} />
                    </button>
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
          </div>
        )}

        {/* Live Karaoke Synced Scrolling Lyrics with AI Generator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: isLyricsExpanded ? '200px' : '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600 }}>Live Karaoke Synced Lyrics</span>
              <button
                onClick={() => setIsTtsNarratorEnabled(!isTtsNarratorEnabled)}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer',
                  color: isTtsNarratorEnabled ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '20px', height: '20px', borderRadius: '4px', padding: 0,
                  transition: 'all 0.2s'
                }}
                title={isTtsNarratorEnabled ? "Mute AI Lyric Narration" : "Enable AI Lyric Voice Narration"}
              >
                {isTtsNarratorEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
              </button>
              <button
                onClick={() => {
                  setIsLyricsExpanded(!isLyricsExpanded)
                  playMechanicalSound('button')
                }}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer',
                  color: isLyricsExpanded ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '20px', height: '20px', borderRadius: '4px', padding: 0,
                  transition: 'all 0.2s'
                }}
                title={isLyricsExpanded ? "Collapse Lyrics Panel" : "Expand Lyrics Panel"}
              >
                {isLyricsExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
            </div>
            <button
              onClick={generateAiLyrics}
              disabled={isGeneratingLyrics}
              style={{ fontSize: '10.5px', color: '#000', fontWeight: 800, background: 'var(--accent2)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              <Sparkles size={8} />
              <span>{isGeneratingLyrics ? 'Scanning...' : 'AI Synthesize'}</span>
            </button>
          </div>
          
          {isGeneratingLyrics ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1.5px solid var(--panel-border)',
              borderRadius: '10px',
              flex: 1,
              fontFamily: '"JetBrains Mono", monospace'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10.5px', color: 'var(--accent)', fontWeight: 800 }}>[AI AUDIO SPECTRUM ANALYSIS]</span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', animation: 'pulse 1s infinite' }}>● SCANNING</span>
              </div>
              <div style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div>&gt; CONNECTING WEB AUDIO ANALYSER... DONE</div>
                <div>&gt; FILTERING VOCAL FORMANT BAND (300Hz-3.4kHz)... ACTIVE</div>
                <div>&gt; DECODING AUDIO BUFFER & METADATA... {track.src.startsWith('data:') || track.src.startsWith('blob:') ? 'LOCAL IMPORT' : 'CLOUD STREAM'}</div>
                <div style={{ color: 'var(--accent2)', fontWeight: 700 }}>&gt; RUNNING NEURAL SPEECH-TO-TEXT DECODER...</div>
              </div>
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px', position: 'relative' }}>
                <div style={{
                  height: '100%',
                  width: '100%',
                  background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent2) 100%)',
                  animation: 'shimmer 1.8s infinite linear',
                  transformOrigin: 'left',
                }} />
              </div>
            </div>
          ) : track.lyrics && track.lyrics.length > 0 ? (
            <div ref={lyricsContainerRef} className="lyrics-scroller" style={{ flex: 1, minHeight: 0, height: 'auto', maxHeight: 'none' }}>
              {parsedLyrics.map((item, i) => {
                const activeBlockIndex = Math.floor(activeLyricIndex / 3);
                const currentBlockIndex = Math.floor(i / 3);
                const isCurrentBlock = activeBlockIndex === currentBlockIndex;
                const isCurrentLine = i === activeLyricIndex;
                
                const intensity = isCurrentLine ? getVocalIntensity() : 0;
                // Add a very subtle glow based on vocal intensity, without large scale transforms
                const textGlow = intensity * 4;
                
                return (
                  <div
                    key={i}
                    className={`lyrics-line ${isCurrentLine ? 'active' : isCurrentBlock ? 'active-block' : ''}`}
                    style={isCurrentLine ? { 
                      textShadow: `0 0 4px #fff, 0 0 ${10 + textGlow}px rgba(var(--accent-rgb), 0.95), 0 0 ${20 + textGlow * 1.5}px rgba(var(--accent-rgb), 0.5)` 
                    } : undefined}
                  >
                    <span style={{ flex: 1, textAlign: 'center' }}>{item.text}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', width: '30px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatTime(item.time)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="lyrics-scroller" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '14px', background: 'rgba(0,0,0,0.25)', border: '1px dashed var(--panel-border)', borderRadius: '12px', flex: 1, minHeight: 0, height: 'auto', maxHeight: 'none' }}>
              <Sparkles size={20} style={{ color: 'var(--accent)', marginBottom: 8, opacity: 0.6 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontWeight: 600, lineHeight: 1.5 }}>
                곡의 AI 보컬 분석 대기 중<br/>
                <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.3)', fontWeight: 500, marginTop: '4px', display: 'inline-block' }}>위 [AI Synthesize] 버튼을 누르면 오디오 스캔 및 가사 스크립트 생성이 시작됩니다.</span>
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
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
                  <button
                    onClick={generateDalleCover}
                    disabled={isGeneratingCover}
                    style={{ 
                      marginLeft: '8px', 
                      fontSize: '10px', 
                      padding: '6px 12px', 
                      cursor: isGeneratingCover ? 'wait' : 'pointer', 
                      textAlign: 'center', 
                      background: 'var(--accent)', 
                      color: '#000', 
                      border: 'none', 
                      borderRadius: '6px', 
                      fontWeight: 700 
                    }}
                  >
                    {isGeneratingCover ? '✨ Generating...' : '✨ AI Generate (DALL-E)'}
                  </button>
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
    </div>
    
    {/* Fullscreen Vertical FFT Glow Visualizers */}
    <canvas 
      ref={leftVisRef} 
      className="fullscreen-vis-left"
      style={{ 
        display: isFullscreen ? 'block' : 'none',
        filter: 'blur(65px)',
        mixBlendMode: 'screen',
        opacity: 0.85
      }}
    />
    <canvas 
      ref={rightVisRef} 
      className="fullscreen-vis-right"
      style={{ 
        display: isFullscreen ? 'block' : 'none',
        filter: 'blur(65px)',
        mixBlendMode: 'screen',
        opacity: 0.85
      }}
    />
    </>
  )
}
