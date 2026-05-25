import asyncio
import edge_tts
import sys
import argparse
import os

async def generate_tts(text: str, output_file: str):
    # We use a natural Korean female neural voice from Edge TTS
    voice = "ko-KR-SunHiNeural"
    
    # Adjust speech rate slightly if needed (+5% speed)
    communicate = edge_tts.Communicate(text, voice, rate="+5%")
    await communicate.save(output_file)

def main():
    parser = argparse.ArgumentParser(description="Generate Neural TTS audio using edge-tts")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--output", required=True, help="Output MP3 file path")
    args = parser.parse_args()

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    try:
        asyncio.run(generate_tts(args.text, args.output))
        print(f"TTS successfully saved to {args.output}")
    except Exception as e:
        print(f"Error generating TTS: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
