#!/usr/bin/env python3
"""
Collect negative samples from YouTube or any audio source
This helps reduce false positives by training on diverse speech that ISN'T "Jarvis"
"""

import pyaudio
import wave
import numpy as np
import os
from datetime import datetime

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK = 1024
SEGMENT_DURATION = 1.0  # 1 second segments

# Create negative samples directory
os.makedirs("training_data/negative", exist_ok=True)

def get_next_file_number():
    """Get the next available file number"""
    files = os.listdir("training_data/negative")
    jarvis_files = [f for f in files if f.startswith("negative_") and f.endswith(".wav")]
    if not jarvis_files:
        return 1
    numbers = [int(f.split("_")[1].split(".")[0]) for f in jarvis_files]
    return max(numbers) + 1

def is_silent(audio_data, threshold=500):
    """Check if audio segment has sufficient energy"""
    return np.max(np.abs(audio_data)) < threshold

print("🎵 Negative Sample Collector")
print("=" * 50)
print("\n📝 Instructions:")
print("   1. Play a YouTube video, podcast, or music")
print("   2. This will automatically capture 1-second segments")
print("   3. Silent segments are automatically skipped")
print("   4. Press Ctrl+C when you have enough samples")
print(f"\n💾 Saving to: training_data/negative/")

# Audio setup
p = pyaudio.PyAudio()

# Use default microphone (or specify device index)
try:
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK
    )
except OSError:
    # Try device 2 if default fails
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        input_device_index=2,
        frames_per_buffer=CHUNK
    )

file_num = get_next_file_number()
frames = []
frame_count = 0
segments_saved = 0
segments_skipped = 0

print(f"\n🎙️  Recording started... (saving segments every {SEGMENT_DURATION}s)")
print("   Press Ctrl+C to stop\n")

try:
    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)
        frame_count += 1

        # Every SEGMENT_DURATION seconds, save a file
        frames_needed = int(SAMPLE_RATE / CHUNK * SEGMENT_DURATION)
        if frame_count >= frames_needed:
            # Convert to numpy array to check if silent
            audio_data = np.frombuffer(b''.join(frames), dtype=np.int16)

            if not is_silent(audio_data):
                # Save the segment
                filename = f"training_data/negative/negative_{file_num:04d}.wav"
                with wave.open(filename, 'wb') as wf:
                    wf.setnchannels(CHANNELS)
                    wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
                    wf.setframerate(SAMPLE_RATE)
                    wf.writeframes(b''.join(frames))

                segments_saved += 1
                print(f"✅ Saved segment #{file_num} (total: {segments_saved}, skipped: {segments_skipped})")
                file_num += 1
            else:
                segments_skipped += 1
                print(f"⏭️  Skipped silent segment (total saved: {segments_saved}, skipped: {segments_skipped})")

            # Reset for next segment
            frames = []
            frame_count = 0

except KeyboardInterrupt:
    print(f"\n\n✅ Collection complete!")
    print(f"   Saved: {segments_saved} segments")
    print(f"   Skipped: {segments_skipped} silent segments")
    print(f"\n💡 Next step: Run 2_train_model.py to retrain with new data")

stream.stop_stream()
stream.close()
p.terminate()
