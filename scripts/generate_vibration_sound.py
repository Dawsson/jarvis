#!/usr/bin/env python3
"""
Generate a quiet, soothing vibration sound for Jarvis listening state.
Creates a low-frequency, quiet ambient sound that loops seamlessly.
"""

import numpy as np
import wave
import sys

# Audio parameters
SAMPLE_RATE = 44100
DURATION = 3.0  # 3 seconds for smoother, longer cycle
FREQUENCY = 42  # Lower frequency for deeper, more soothing feel
VOLUME = 0.08  # Very quiet (8% volume)

# Generate a smooth sine wave with gentle variation for natural feel
t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), False)

# Base frequency with very gentle, slow modulation for organic feel
base_freq = FREQUENCY
modulation = 0.15 * np.sin(2 * np.pi * 0.2 * t)  # Very gentle, slow modulation
frequency = base_freq + modulation

# Generate smooth waveform with subtle harmonics for richness
# Primary tone (fundamental)
waveform = np.sin(2 * np.pi * frequency * t)
# Add very subtle second harmonic (octave) at low volume for warmth
waveform += 0.15 * np.sin(2 * np.pi * frequency * 2 * t)
# Add very subtle third harmonic for smoothness
waveform += 0.08 * np.sin(2 * np.pi * frequency * 3 * t)
# Normalize to prevent clipping
waveform = waveform / np.max(np.abs(waveform))

# Apply smooth, longer fade in/out for seamless looping
fade_samples = int(SAMPLE_RATE * 0.3)  # 300ms fade for ultra-smooth transition
# Use a smoother fade curve (sine-based instead of linear)
fade_in = np.sin(np.linspace(0, np.pi/2, fade_samples))
fade_out = np.sin(np.linspace(np.pi/2, 0, fade_samples))
waveform[:fade_samples] *= fade_in
waveform[-fade_samples:] *= fade_out

# Apply volume and convert to 16-bit integer
waveform = (waveform * VOLUME * 32767).astype(np.int16)

# Save as WAV file
output_file = sys.argv[1] if len(sys.argv) > 1 else "vibration.wav"
with wave.open(output_file, 'w') as wav_file:
    wav_file.setnchannels(1)  # Mono
    wav_file.setsampwidth(2)  # 16-bit
    wav_file.setframerate(SAMPLE_RATE)
    wav_file.writeframes(waveform.tobytes())

print(f"Generated vibration sound: {output_file}")
