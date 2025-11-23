#!/usr/bin/env python3
"""
Process MP4 videos and extract audio segments to training_data/noise/
Use this for background noise, music, or any non-speech audio
"""

import sys
import os
import numpy as np
import wave
import subprocess
import tempfile
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: python3 process_video_to_noise.py <video_file>")
    print("Example: python3 process_video_to_noise.py background_music.mp4")
    sys.exit(1)

input_file = sys.argv[1]

if not os.path.exists(input_file):
    print(f"❌ File not found: {input_file}")
    sys.exit(1)

print("🎵 Processing Video to Noise Dataset")
print("=" * 50)
print(f"📁 Input: {input_file}")

# Create noise samples directory
os.makedirs("training_data/noise", exist_ok=True)

# Get next file number
def get_next_file_number():
    files = os.listdir("training_data/noise")
    noise_files = [f for f in files if f.startswith("noise_") and f.endswith(".wav")]
    if not noise_files:
        return 1
    numbers = []
    for f in noise_files:
        try:
            num = int(f.split("_")[1].split(".")[0])
            numbers.append(num)
        except (ValueError, IndexError):
            continue
    return max(numbers) + 1 if numbers else 1

file_num = get_next_file_number()

# Extract audio to temp WAV using ffmpeg
print("\n🔄 Converting to WAV (16kHz mono)...")
temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
temp_wav_path = temp_wav.name
temp_wav.close()

try:
    # Use ffmpeg to convert to 16kHz mono WAV
    result = subprocess.run([
        "ffmpeg",
        "-i", input_file,
        "-ar", "16000",  # 16kHz sample rate
        "-ac", "1",      # mono
        "-y",            # overwrite
        temp_wav_path
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"❌ FFmpeg error: {result.stderr}")
        sys.exit(1)

    print("✅ Conversion complete")

    # Read the WAV file
    print("\n📊 Segmenting audio...")
    with wave.open(temp_wav_path, 'rb') as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()

        segment_frames = sample_rate * 1  # 1 second segments

        segments_saved = 0
        segments_skipped = 0

        while True:
            frames = wf.readframes(segment_frames)
            if len(frames) < segment_frames * sample_width * n_channels:
                break  # End of file

            # Convert to numpy to check energy
            audio_data = np.frombuffer(frames, dtype=np.int16)

            # Skip silent segments
            if np.max(np.abs(audio_data)) < 500:
                segments_skipped += 1
                continue

            # Save segment
            filename = f"training_data/noise/noise_{file_num}.wav"
            with wave.open(filename, 'wb') as out_wf:
                out_wf.setnchannels(n_channels)
                out_wf.setsampwidth(sample_width)
                out_wf.setframerate(sample_rate)
                out_wf.writeframes(frames)

            segments_saved += 1
            if segments_saved % 10 == 0:
                print(f"   Saved {segments_saved} segments...")

            file_num += 1

    print(f"\n✅ Extraction complete!")
    print(f"   Saved: {segments_saved} segments")
    print(f"   Skipped: {segments_skipped} silent segments")
    print(f"   Files: noise_{get_next_file_number() - segments_saved}.wav to noise_{file_num - 1}.wav")
    print(f"\n💡 Next step: Retrain the model with:")
    print(f"   uvx --with tensorflow --with librosa python3 scripts/training/2_train_model.py")

finally:
    # Clean up temp file
    if os.path.exists(temp_wav_path):
        os.unlink(temp_wav_path)
