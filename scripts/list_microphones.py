#!/usr/bin/env python3
"""
List available microphones
"""

import pyaudio

p = pyaudio.PyAudio()

print("🎙️  Available Microphones:")
print("=" * 50)

for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        print(f"\n[{i}] {info['name']}")
        print(f"    Sample Rate: {int(info['defaultSampleRate'])} Hz")
        print(f"    Channels: {info['maxInputChannels']}")

p.terminate()

print("\n" + "=" * 50)
print("To use a specific mic, update the Python scripts")
print("Add: input_device_index=X")
print("where X is the number in brackets")
