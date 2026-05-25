import os
import sys
import json
import argparse
import time
import ssl
import urllib3

# Try to find and inject static ffmpeg binary from imageio_ffmpeg
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if ffmpeg_exe and os.path.exists(ffmpeg_exe):
        ffmpeg_dir = os.path.dirname(ffmpeg_exe)
        # Add to PATH
        os.environ['PATH'] = ffmpeg_dir + os.path.pathsep + os.environ.get('PATH', '')
        expected_ffmpeg = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        if not os.path.exists(expected_ffmpeg):
            import shutil
            try:
                shutil.copy2(ffmpeg_exe, expected_ffmpeg)
                print(f"[AI] Created ffmpeg.exe shim at {expected_ffmpeg}")
            except Exception as se:
                print(f"[AI WARNING] Failed to create ffmpeg.exe shim: {se}")
except ImportError:
    print("[AI WARNING] imageio_ffmpeg is not installed, ffmpeg may not be found.")


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
        {"time": 20.0, "text": "pip install git+https://github.com/m-bain/whisperX.git"}
    ]

def transcribe_audio(file_path, forced_language=None):
    # Common Hallucination Patterns & Credit check
    HALLUCINATION_PATTERNS = [
        "시청해주셔서 감사합니다", "시청해 주셔서 감사합니다", "구독과 좋아요", "구독, 좋아요",
        "다음 영상에서", "다음 영상 구독", "채널 구독", "구독 버튼", 
        "thanks for watching", "thank you for watching", "please subscribe", 
        "subscribe to", "subscribe for more", "don't forget to subscribe",
        "bye bye", "bye-bye", "goodbye",
        "translated by", "subtitles by", "subtitled by",
        "감사합니다", "고맙습니다",
    ]
    import re
    CREDIT_REGEX = re.compile(
        r'(한글자막|자막제작|자막 제공|번역제작|영상번역)\s*(:|by|제작|제공)',
        re.IGNORECASE
    )

    def is_hallucination(text: str) -> bool:
        # Strip out word tags if any (e.g. <00:12.30>)
        clean_t = re.sub(r'<[^>]+>', '', text).strip()
        t = clean_t.lower()
        if not t:
            return True
        for pat in HALLUCINATION_PATTERNS:
            if pat.lower() in t:
                return True
        if CREDIT_REGEX.search(clean_t):
            return True
        if re.fullmatch(r'[\s\.\,\!\?\…\~\-\—\–\'\"\(\)\[\]♪♫🎵🎶\*\#]+', t):
            return True
        return False

    # ──── stable faster-whisper segment-level transcription ────
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
    except Exception as de:
        print(f"[AI WARNING] Demucs vocal separation skipped/failed: {de}")
        print("For better accuracy with instrumental tracks, please run: pip install demucs")
        target_path = file_path

    # Robust model loading with fallback
    model = None
    # Prioritize smaller, faster models on CPU to avoid massive downloads and API timeouts
    for size in ["base", "small", "tiny", "medium", "turbo", "large-v3"]:
        try:
            print(f"[AI] Loading Whisper model: {size}")
            model = WhisperModel(size, device="cpu", compute_type="int8")
            break
        except Exception as e:
            print(f"[AI WARNING] Failed to load Whisper model '{size}': {e}")
    
    if not model:
        print("[AI ERROR] Could not load any Whisper model.")
        return generate_dummy_lyrics(file_path)

    print(f"[AI] Transcribing audio: {target_path} (Language option: {forced_language})")
    try:
        segments, info = model.transcribe(
            target_path, 
            beam_size=5,
            language=forced_language if forced_language else None,
            no_speech_threshold=0.85,
            vad_filter=False,
            condition_on_previous_text=False
        )

        lyrics_data = []
        prev_text = ""
        print(f"[AI] Detected language '{info.language}' with probability {info.language_probability}")
        for segment in segments:
            text = segment.text.strip()
            
            # Skip empty
            if not text:
                continue
            
            # Skip hallucination patterns
            if is_hallucination(text):
                print(f"  [FILTERED - hallucination] {text}")
                continue
            
            # Skip exact duplicate of previous line (Whisper repetition bug)
            if text == prev_text:
                print(f"  [FILTERED - duplicate] {text}")
                continue

            print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {text}")
            lyrics_data.append({
                "time": segment.start,
                "text": text
            })
            prev_text = text
        
        # Cleanup separated vocals if created
        if target_path != file_path and os.path.exists(target_path):
            try:
                os.remove(target_path)
            except:
                pass

        return lyrics_data
    except Exception as e:
        print(f"[AI ERROR] Error during transcription execution: {e}")
        return generate_dummy_lyrics(file_path)

def main():
    parser = argparse.ArgumentParser(description="AI Jukebox Lyrics Extractor")
    parser.add_argument("--audio", required=True, help="Path to the audio file")
    parser.add_argument("--output", required=True, help="Path to save the generated .ifx/.json file")
    parser.add_argument("--language", default=None, help="Force a specific language code (e.g. ko, en)")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found at {args.audio}")
        sys.exit(1)

    print(f"[AI] Processing {args.audio}")
    lyrics = transcribe_audio(args.audio, forced_language=args.language)

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
