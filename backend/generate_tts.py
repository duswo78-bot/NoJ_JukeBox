import asyncio
import edge_tts
import sys
import argparse
import os

async def generate_tts(text: str, output_file: str, voice: str = "ko-KR-SunHiNeural", rate: str = "+5%", pitch: str = "+0Hz"):
    # Adjust speech rate and pitch based on parameters
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(output_file)

def main():
    parser = argparse.ArgumentParser(description="Generate Neural TTS audio using edge-tts")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--output", required=True, help="Output MP3 file path")
    parser.add_argument("--voice", default="ko-KR-SunHiNeural", help="TTS voice name")
    parser.add_argument("--rate", default="+5%", help="Speech rate modification (e.g. +10%)")
    parser.add_argument("--pitch", default="+0Hz", help="Speech pitch modification (e.g. +5Hz)")
    args = parser.parse_args()

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    try:
        asyncio.run(generate_tts(args.text, args.output, voice=args.voice, rate=args.rate, pitch=args.pitch))
        print(f"TTS successfully saved to {args.output}")
    except Exception as e:
        print(f"Error generating TTS: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
