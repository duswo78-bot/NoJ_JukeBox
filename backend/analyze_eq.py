import os
import sys
import json
import argparse
import numpy as np

def analyze_audio_eq(file_path):
    print(f"[AI EQ] Loading audio file: {file_path}")
    try:
        from faster_whisper.audio import decode_audio
        # decode_audio returns a 1D numpy array of mono audio at the requested sampling rate.
        # We use 32000 Hz to capture frequencies up to 16kHz for our 10 bands.
        sample_rate = 32000
        waveform = decode_audio(file_path, sampling_rate=sample_rate)
    except Exception as e:
        print(f"Error loading audio via faster_whisper: {e}")
        return [50] * 10
        
    print(f"[AI EQ] Analyzing frequency spectrum...")
    
    # Calculate magnitude spectrum using numpy FFT
    # We don't need a full short-time fourier transform, just the average spectrum over the whole file.
    # To avoid memory issues with huge FFTs, we process in chunks.
    chunk_size = 4096
    
    # Pad waveform to multiple of chunk_size
    pad_len = chunk_size - (len(waveform) % chunk_size)
    if pad_len != chunk_size:
        waveform = np.pad(waveform, (0, pad_len))
        
    num_chunks = len(waveform) // chunk_size
    chunks = waveform.reshape(num_chunks, chunk_size)
    
    # Apply Hann window to each chunk
    window = np.hanning(chunk_size)
    chunks = chunks * window
    
    # Compute FFT
    fft_result = np.fft.rfft(chunks, axis=1)
    
    # Average magnitude spectrum across all chunks
    mag_spec = np.mean(np.abs(fft_result), axis=0)
    
    # Target EQ frequencies (10 bands)
    eq_freqs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    freq_bins = np.linspace(0, sample_rate / 2, len(mag_spec))
    
    band_energies = []
    
    # Calculate energy in each octave band
    for freq in eq_freqs:
        # Bandwidth is roughly 1 octave (freq/sqrt(2) to freq*sqrt(2))
        lower_bound = freq / 1.414
        upper_bound = freq * 1.414
        
        # Find bin indices
        idx_lower = np.argmin(np.abs(freq_bins - lower_bound))
        idx_upper = np.argmin(np.abs(freq_bins - upper_bound))
        
        if idx_upper <= idx_lower:
            idx_upper = idx_lower + 1
            
        # Sum energy in band
        energy = np.sum(mag_spec[idx_lower:idx_upper])
        # Convert to dB (log scale)
        energy_db = 10 * np.log10(energy + 1e-10)
        band_energies.append(energy_db)
        
    # Spectral Matching to Pink Noise target
    # Normalize measured energies to 0 mean
    mean_energy = sum(band_energies) / 10
    normalized_measured = [e - mean_energy for e in band_energies]
    
    # Target pink noise curve
    # Physics correction: Pink noise density falls off at -3dB/octave, BUT our bands are 1 octave wide.
    # Since the bandwidth doubles each octave (+3dB), the total energy inside each octave band for pink noise is CONSTANT (Flat).
    target_curve = [0.0] * 10
        
    # Calculate required EQ adjustment (Target - Measured)
    raw_adjustments = [target_curve[i] - normalized_measured[i] for i in range(10)]
    
    # Smooth the adjustments slightly to avoid extreme neighbor differences
    smoothed_adjustments = []
    for i in range(10):
        if i == 0:
            val = (raw_adjustments[0] * 2 + raw_adjustments[1]) / 3
        elif i == 9:
            val = (raw_adjustments[8] + raw_adjustments[9] * 2) / 3
        else:
            val = (raw_adjustments[i-1] + raw_adjustments[i] * 2 + raw_adjustments[i+1]) / 4
        smoothed_adjustments.append(val)
    
    # Scale adjustments (0-100 scale for UI)
    # UI: 50 is 0dB, 0 is -12dB, 100 is +12dB.
    # Max allowed adjustment is ±6dB.
    
    # Exaggeration multiplier: Modern mastered music is already very close to flat/pink noise.
    # To make the AI's effect distinctly audible and varied per track, we exaggerate the found differences.
    exaggeration = 2.8 
    
    final_ui_values = []
    for adj in smoothed_adjustments:
        adj_exaggerated = adj * exaggeration
        ui_val = 50 + (adj_exaggerated * (50.0 / 12.0))
        # Clamp to 25~75 (±6dB)
        ui_val = max(25, min(75, ui_val))
        final_ui_values.append(int(round(ui_val)))
        
    print(f"[AI EQ] Optimal 10-Band EQ calculated: {final_ui_values}")
    return final_ui_values

def main():
    parser = argparse.ArgumentParser(description="AI Auto EQ Analyzer")
    parser.add_argument("--audio", required=True, help="Path to the audio file")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"Audio file not found at {args.audio}"}))
        sys.exit(1)

    eq_values = analyze_audio_eq(args.audio)

    # Print JSON output exactly on the last line for easy parsing
    print(json.dumps({"eq": eq_values}))

if __name__ == "__main__":
    main()
