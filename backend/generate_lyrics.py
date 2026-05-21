import os
import sys
import json
import argparse
import time
import ssl
import urllib3

urllib3.disable_warnings()
# Bypass corporate proxy SSL verification issues for HuggingFace model downloads
os.environ['CURL_CA_BUNDLE'] = ''
os.environ['REQUESTS_CA_BUNDLE'] = ''
ssl._create_default_https_context = ssl._create_unverified_context

# Monkey patch httpx to ignore SSL errors (since huggingface_hub uses httpx)
try:
    import httpx
    original_init = httpx.Client.__init__
    def new_init(self, *args, **kwargs):
        kwargs['verify'] = False
        original_init(self, *args, **kwargs)
    httpx.Client.__init__ = new_init
except ImportError:
    pass

def generate_dummy_lyrics(file_path):
    print(f"Generating dummy lyrics for {file_path} because AI libraries are not installed.")
    return [
        {"time": 5.0, "text": "이 가사는 AI 분석 모듈(Whisper)이 설치되지 않아 출력되는"},
        {"time": 10.0, "text": "임시 타임스탬프 가사입니다."},
        {"time": 15.0, "text": "실제 가사 추출을 원하시면 아래 명령어를 실행해주세요."},
        {"time": 20.0, "text": "pip install faster-whisper demucs"},
        {"time": 25.0, "text": "그 후 다시 AI Synthesize 버튼을 눌러주세요."}
    ]

def transcribe_audio(file_path):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[AI ERROR] 'faster-whisper' is not installed.")
        print("Please run: pip install faster-whisper")
        return generate_dummy_lyrics(file_path)

    # Optional: Demucs vocal separation
    try:
        import demucs.api
        print("[AI] Separating vocals using demucs (this may take a while)...")
        separator = demucs.api.Separator(model="htdemucs", segment=10)
        origin, separated = separator.separate_audio_file(file_path)
        vocal_path = file_path.replace(".mp3", "_vocals.wav")
        mr_path = file_path.replace(".mp3", "_mr.wav")
        import torchaudio
        torchaudio.save(vocal_path, separated["vocals"], separator.samplerate)
        torchaudio.save(mr_path, separated["no_vocals"], separator.samplerate)
        target_path = vocal_path
    except ImportError:
        print("[AI WARNING] 'demucs' is not installed. Skipping vocal separation.")
        print("For better accuracy with instrumental tracks, please run: pip install demucs")
        target_path = file_path

    print("[AI] Loading Whisper model...")
    model_size = "small" # Use small for local speed
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"[AI] Transcribing audio: {target_path}")
    segments, info = model.transcribe(target_path, beam_size=5, language="ko")

    lyrics_data = []
    print(f"[AI] Detected language '{info.language}' with probability {info.language_probability}")
    for segment in segments:
        print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
        lyrics_data.append({
            "time": segment.start,
            "text": segment.text.strip()
        })
    
    # Cleanup separated vocals if created
    if target_path != file_path and os.path.exists(target_path):
        os.remove(target_path)

    return lyrics_data

def main():
    parser = argparse.ArgumentParser(description="AI Jukebox Lyrics Extractor")
    parser.add_argument("--audio", required=True, help="Path to the audio file")
    parser.add_argument("--output", required=True, help="Path to save the generated .ifx/.json file")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found at {args.audio}")
        sys.exit(1)

    print(f"[AI] Processing {args.audio}")
    lyrics = transcribe_audio(args.audio)

    # Format lyrics to .ifx timestamp string array (like [00:15.5] Hello)
    formatted_lyrics = []
    for line in lyrics:
        mins = int(line['time'] // 60)
        secs = line['time'] % 60
        formatted_line = f"[{mins:02d}:{secs:05.2f}] {line['text']}"
        formatted_lyrics.append(formatted_line)

    # If the output file already exists, we should merge the lyrics into the existing metadata
    if os.path.exists(args.output):
        with open(args.output, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        metadata['lyrics'] = formatted_lyrics
    else:
        metadata = {
            "title": os.path.basename(args.audio).replace(".mp3", ""),
            "lyrics": formatted_lyrics
        }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"[AI] Successfully saved extracted lyrics to {args.output}")

if __name__ == "__main__":
    main()
