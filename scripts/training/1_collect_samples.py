#!/usr/bin/env python3
"""
Step 1: Collect Training Samples - Interactive Version
Press Enter to record each sample, Ctrl+C to finish
"""

import pyaudio
import wave
import os

CHUNK = 1024
RECORD_SECONDS = 1

# Create directories
os.makedirs("training_data/jarvis", exist_ok=True)
os.makedirs("training_data/noise", exist_ok=True)

# Auto-detect microphone, excluding iPhone
def get_microphone_index():
    """Find the best microphone, excluding iPhone devices"""
    p = pyaudio.PyAudio()
    default_index = p.get_default_input_device_info()['index']

    # Check if default is not iPhone
    default_info = p.get_device_info_by_index(default_index)
    if 'iphone' not in default_info['name'].lower():
        p.terminate()
        return default_index

    # Find first non-iPhone microphone
    for i in range(p.get_device_count()):
        info = p.get_device_info_by_index(i)
        if info['maxInputChannels'] > 0 and 'iphone' not in info['name'].lower():
            p.terminate()
            return i

    p.terminate()
    return default_index  # Fallback to default

MIC_DEVICE_INDEX = get_microphone_index()

def get_next_number(directory):
    """Find the next available number for this type"""
    existing = [f for f in os.listdir(directory) if f.endswith('.wav')]
    if not existing:
        return 1
    numbers = []
    for f in existing:
        try:
            num = int(f.split('_')[1].split('.')[0])
            numbers.append(num)
        except:
            pass
    return max(numbers) + 1 if numbers else 1

# Get microphone capabilities and configure
p = pyaudio.PyAudio()
mic_info = p.get_device_info_by_index(MIC_DEVICE_INDEX)
mic_name = mic_info['name']

# Use the mic's native sample rate and channels
RATE = int(mic_info['defaultSampleRate'])
CHANNELS = min(1, int(mic_info['maxInputChannels']))  # Prefer mono, but use what's available

p.terminate()

print("🎙️  Training Data Collection - Interactive Mode")
print("=" * 50)
print(f"\n🎤 Microphone: {mic_name} (device {MIC_DEVICE_INDEX})")
print(f"📊 Settings: {RATE} Hz, {CHANNELS} channel(s)")
print("\nPress Enter to record, Ctrl+C when done")
print("Each recording is 1 second\n")

def record_sample(filename, prompt):
    print(f"{prompt} - 🔴 RECORDING!", end=" ", flush=True)

    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        input_device_index=MIC_DEVICE_INDEX,
        frames_per_buffer=CHUNK
    )

    frames = []
    for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
        data = stream.read(CHUNK)
        frames.append(data)

    stream.stop_stream()
    stream.close()
    audio.terminate()

    # Save
    wf = wave.open(filename, 'wb')
    wf.setnchannels(CHANNELS)
    wf.setsampwidth(audio.get_sample_size(pyaudio.paInt16))
    wf.setframerate(RATE)
    wf.writeframes(b''.join(frames))
    wf.close()

    print("✅")

# Mode selection
print("=" * 50)
print("What do you want to record?")
print("  1) Jarvis samples")
print("  2) Noise/other words")
print("=" * 50)

mode = input("\nEnter 1 or 2: ").strip()

if mode == "1":
    directory = "training_data/jarvis"
    prefix = "jarvis"
    prompt_text = "Say 'Jarvis' or 'Hey Jarvis'"
else:
    directory = "training_data/noise"
    prefix = "noise"
    prompt_text = "Noise / silence / other words"

# Ask how many samples
count_input = input(f"\nHow many samples? (default: 10): ").strip()
sample_count = int(count_input) if count_input else 10

print(f"\n🎙️  Recording {sample_count} {prefix} samples")
print("Get ready! Recording starts in 2 seconds...\n")

import time
time.sleep(2)

try:
    for i in range(sample_count):
        num = get_next_number(directory)
        filename = f"{directory}/{prefix}_{num}.wav"
        record_sample(filename, f"[{i+1}/{sample_count}]")
        time.sleep(0.3)  # Brief pause between recordings

    total = get_next_number(directory) - 1
    print(f"\n\n✅ Done! Recorded {sample_count} samples")
    print(f"Total {prefix} samples: {total}")
    print("\nNext: Train the model")
    print("  bun run train\n")
except KeyboardInterrupt:
    total = get_next_number(directory) - 1
    print(f"\n\n✅ Stopped early. Total {prefix} samples: {total}")
    print("\nNext: Train the model")
    print("  bun run train\n")
