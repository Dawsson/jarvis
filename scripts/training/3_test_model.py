#!/usr/bin/env python3
"""
Step 3: Test the Model in Real-Time
"""

import numpy as np
import librosa
import pyaudio
import json
import tensorflow as tf
from collections import deque

print("🧪 Testing Jarvis Wake Word Model")
print("=" * 50)

# Load model and metadata
print("\n📦 Loading model...")
model = tf.keras.models.load_model("jarvis_model/model.h5")

with open("jarvis_model/metadata.json", "r") as f:
    metadata = json.load(f)

MAX_FRAMES = metadata["max_frames"]
N_MFCC = metadata["n_mfcc"]
SAMPLE_RATE = metadata["sample_rate"]

print(f"✅ Model loaded")
print(f"   Accuracy: {metadata['val_accuracy']:.1%}")
print(f"\n🎙️  Say 'Jarvis' to test detection...\n")

# Audio parameters
CHUNK = 1024
CHANNELS = 1
BUFFER_DURATION = 0.8  # seconds - fast detection for quick "Jarvis"
buffer_size = int(SAMPLE_RATE * BUFFER_DURATION)

# Audio buffer
audio_buffer = deque(maxlen=buffer_size)

# PyAudio
p = pyaudio.PyAudio()

# Try to use default microphone
try:
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK
    )
except OSError:
    # If default fails, try device 2 (MacBook Pro Microphone)
    stream = p.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        input_device_index=2,
        frames_per_buffer=CHUNK
    )

print("Press Ctrl+C to stop\n")

def is_silent(audio_data, threshold=0.01):
    """Check if audio is too quiet to be speech"""
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    rms = np.sqrt(np.mean(audio**2))
    return rms < threshold

def extract_features(audio_data):
    """Extract MFCC from audio buffer"""
    # Convert to float32
    audio = np.array(audio_data, dtype=np.float32) / 32768.0

    # Extract MFCC
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=SAMPLE_RATE,
        n_mfcc=N_MFCC,
        hop_length=256
    )

    # Pad or truncate
    if mfcc.shape[1] < MAX_FRAMES:
        pad_width = MAX_FRAMES - mfcc.shape[1]
        mfcc = np.pad(mfcc, ((0, 0), (0, pad_width)), mode='constant')
    else:
        mfcc = mfcc[:, :MAX_FRAMES]

    return mfcc.T

frame_count = 0
cooldown_frames = 0  # Cooldown to prevent duplicate detections

try:
    while True:
        # Read audio
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_chunk = np.frombuffer(data, dtype=np.int16)

        # Add to buffer
        audio_buffer.extend(audio_chunk)

        # Decrease cooldown
        if cooldown_frames > 0:
            cooldown_frames -= 1

        # Check every 5 frames (~0.1 seconds) for faster response
        frame_count += 1
        if frame_count >= 5 and len(audio_buffer) >= buffer_size and cooldown_frames == 0:
            frame_count = 0

            # Skip if audio is too quiet (silence detection)
            if is_silent(list(audio_buffer)):
                continue

            # Extract features
            features = extract_features(list(audio_buffer))
            features = np.expand_dims(features, axis=0)

            # Predict
            prediction = model.predict(features, verbose=0)[0][0]

            if prediction > 0.8:
                print(f"🎯 JARVIS DETECTED! (confidence: {prediction*100:.1f}%)")
                cooldown_frames = 10  # ~1 second cooldown after detection
            elif prediction > 0.7:
                print(f"   Maybe... (confidence: {prediction*100:.1f}%)")

except KeyboardInterrupt:
    print("\n\n👋 Stopping...")

stream.stop_stream()
stream.close()
p.terminate()
