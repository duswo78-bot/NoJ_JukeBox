import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query, currentTrackName, currentTrackArtist, mediaType, tracks } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured in .env.local' }, { status: 501 });
    }

    let tracksFormatted = "No tracks available in the playlist.";
    if (Array.isArray(tracks) && tracks.length > 0) {
      tracksFormatted = tracks.map(t => 
        `- ID: ${t.id} | Title: "${t.title}" | Artist: ${t.artist} | Genre: ${t.genre} | BPM: ${t.bpm} | Key: ${t.key} | Moods: ${Array.isArray(t.mood) ? t.mood.join(', ') : t.mood}`
      ).join('\n');
    }

    const systemPrompt = `You are an interactive AI DJ for a high-end web-based Jukebox.
Your personality is cool, confident, and slightly retro-futuristic. 
The user is currently playing "${currentTrackName}" by ${currentTrackArtist} on a ${mediaType} deck.

Here is the list of available tracks in the jukebox:
${tracksFormatted}

Your behavior:
1. Respond concisely in Korean (1-2 sentences maximum). Make it sound like a smooth, charismatic radio DJ broadcast.
2. Even if you are invoking one or more tools, you MUST write a verbal response in the text content field in Korean (1-2 sentences). Explain what you are doing or why you chose a track in your cool DJ voice (e.g. '비오는 날엔 역시 이 곡이죠. 1번 트랙 재생해 드릴게요.'). Do NOT leave the text reply empty.
3. If the user asks for a specific track, mood, genre, or speed (BPM), select the best matching track from the list above and use the "change_track" function. Specify the exact track "track_id" (number) in the arguments. This is highly preferred over recommending by name.
4. If they want to adjust sound acoustics or equalizer, use "set_eq" or "set_reverb" function.
5. If the user asks to adjust volume (e.g., mute, louder, quieter, set volume to X), use "set_volume" function.
6. If the user asks to switch modes (e.g., switch to CD, cassette, LP record), use "change_media_type" function.
7. If the user asks to go fullscreen or exit fullscreen, use "set_fullscreen" function.
8. If the user asks to create or generate a playlist (e.g., "Create a workout playlist", "신나는 곡들로 플레이리스트 만들어줘"), select appropriate track IDs from the list above and call "create_playlist" with a suitable playlist name and the matching track IDs.
9. Keep the conversation extremely cool, witty, and brief.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        max_tokens: 150,
        temperature: 0.7,
        tools: [
          {
            type: "function",
            function: {
              name: "change_track",
              description: "Change the currently playing track based on the user's mood, genre, artist, or specific request.",
              parameters: {
                type: "object",
                properties: {
                  track_id: { type: "number", description: "The exact ID of the matching track from the playlist." },
                  mood: { type: "string", description: "The requested mood, style or genre keyword as fallback." },
                  track_name: { type: "string", description: "Specific track name requested as fallback." }
                }
              }
            }
          },
          {
            type: "function",
            function: {
              name: "set_volume",
              description: "Adjust the playback volume level or set mute state.",
              parameters: {
                type: "object",
                properties: {
                  level: { type: "integer", description: "Volume level from 0 to 100.", minimum: 0, maximum: 100 },
                  mute: { type: "boolean", description: "Set to true to mute, false to unmute." }
                }
              }
            }
          },
          {
            type: "function",
            function: {
              name: "change_media_type",
              description: "Switch the physical playback deck mode (LP vinyl, Compact Disc, or Cassette Tape).",
              parameters: {
                type: "object",
                properties: {
                  media_type: { type: "string", enum: ["LP", "CD", "TAPE"], description: "The physical deck type to select." }
                },
                required: ["media_type"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "set_fullscreen",
              description: "Toggle fullscreen mode on or off.",
              parameters: {
                type: "object",
                properties: {
                  enabled: { type: "boolean", description: "Set to true to enter fullscreen mode, false to exit." }
                },
                required: ["enabled"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "set_eq",
              description: "Apply an EQ preset based on user request (e.g., bass boost, flat, rock).",
              parameters: {
                type: "object",
                properties: {
                  preset: { type: "string", enum: ["FLAT", "CLASSIC", "JAZZ", "ROCK", "POP", "K-POP", "HIP HOP", "EDM", "LO-FI", "VOCAL BOOST", "AMBIENT", "CATHEDRAL", "WARM TUBE", "DANCE BOOM"], description: "The EQ preset to apply." }
                },
                required: ["preset"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "set_reverb",
              description: "Change the reverb environment to alter spatial acoustics.",
              parameters: {
                type: "object",
                properties: {
                  environment: { type: "string", enum: ["STUDIO", "ROOM", "HALL", "CONCERT", "CATHEDRAL"] },
                  level: { type: "integer", description: "Reverb wetness level from 0 to 100", minimum: 0, maximum: 100 }
                },
                required: ["environment", "level"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "create_playlist",
              description: "Create a new custom playlist with a given name containing specific track IDs.",
              parameters: {
                type: "object",
                properties: {
                  playlist_name: { type: "string", description: "The name of the new playlist." },
                  track_ids: {
                    type: "array",
                    items: { type: "number" },
                    description: "List of track IDs to add to this playlist."
                  }
                },
                required: ["playlist_name", "track_ids"]
              }
            }
          }
        ],
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      const errMsg = errorData.error?.message || 'OpenAI API request failed';
      return NextResponse.json({ error: errMsg }, { status: response.status });
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    
    let reply = msg?.content || "";
    if (!reply && msg?.tool_calls && msg.tool_calls.length > 0) {
      // Dynamic fallback speech according to the action taken
      const toolNames = msg.tool_calls.map((t: any) => t.function.name);
      if (toolNames.includes('change_track')) {
        reply = "좋습니다, 요청하신 감성의 곡으로 전환할게요. 디스크가 돌아갑니다!";
      } else if (toolNames.includes('set_volume')) {
        reply = "볼륨 설정을 즉시 변경했습니다. 귀에 편안하게 들어보세요.";
      } else if (toolNames.includes('change_media_type')) {
        reply = "재생 데크 스타일을 교체합니다. 아날로그 감성이 물씬 풍기네요.";
      } else if (toolNames.includes('set_fullscreen')) {
        reply = "화면 모드를 전환하겠습니다. 더 넓게 즐겨보세요.";
      } else if (toolNames.includes('set_eq') || toolNames.includes('set_reverb')) {
        reply = "주파수 믹서와 에코 설정을 맞춤형으로 튜닝했습니다.";
      } else if (toolNames.includes('create_playlist')) {
        reply = "좋습니다. 요청하신 트랙들을 엄선해서 새로운 커스텀 플레이리스트를 만들어 드렸습니다. 사이드바에서 확인해보시죠!";
      } else {
        reply = "요청하신 대로 기기 설정을 변경하겠습니다.";
      }
    }

    let actions = [];
    if (msg?.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type === 'function') {
          try {
            const args = JSON.parse(tc.function.arguments);
            actions.push({ name: tc.function.name, args });
          } catch (e) {
            console.error("Failed to parse tool call args:", tc.function.arguments);
          }
        }
      }
    }

    return NextResponse.json({ reply, actions });
  } catch (error: any) {
    console.error("AI DJ Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
