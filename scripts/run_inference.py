#!/usr/bin/env python3
"""
Real-time wake word detection - outputs DETECTED when Jarvis is heard
"""

import numpy as np
import librosa
import pyaudio
import json
import tensorflow as tf
from collections import deque
import sys

# Load model
model = tf.keras.models.load_model("jarvis_model/model.h5")

with open("jarvis_model/metadata.json", "r") as f:
    metadata = json.load(f)

MAX_FRAMES = metadata["max_frames"]
N_MFCC = metadata["n_mfcc"]
SAMPLE_RATE = 16000

# Audio
CHUNK = 1024
BUFFER_DURATION = 0.8  # Fast detection for quick "Jarvis"
buffer_size = int(SAMPLE_RATE * BUFFER_DURATION)
audio_buffer = deque(maxlen=buffer_size)

# Get microphone index from command line or use default
mic_index = int(sys.argv[1]) if len(sys.argv) > 1 else None

p = pyaudio.PyAudio()
stream_kwargs = {
    "format": pyaudio.paInt16,
    "channels": 1,
    "rate": SAMPLE_RATE,
    "input": True,
    "frames_per_buffer": CHUNK,
}

if mic_index is not None:
    stream_kwargs["input_device_index"] = mic_index

stream = p.open(**stream_kwargs)

print("READY", flush=True)

def is_silent(audio_data, threshold=0.01):
    """Check if audio is too quiet to be speech"""
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    rms = np.sqrt(np.mean(audio**2))
    return rms < threshold

def extract_features(audio_data):
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    mfcc = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=N_MFCC, hop_length=256)

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
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_chunk = np.frombuffer(data, dtype=np.int16)
        audio_buffer.extend(audio_chunk)

        # Decrease cooldown
        if cooldown_frames > 0:
            cooldown_frames -= 1

        frame_count += 1
        if frame_count >= 5 and len(audio_buffer) >= buffer_size and cooldown_frames == 0:
            frame_count = 0

            # Skip if audio is too quiet (silence detection)
            if is_silent(list(audio_buffer)):
                continue

            features = extract_features(list(audio_buffer))
            features = np.expand_dims(features, axis=0)

            prediction = model.predict(features, verbose=0)[0][0]

            if prediction > 0.8:
                print(f"DETECTED:{prediction:.3f}", flush=True)
                cooldown_frames = 10  # ~1 second cooldown after detection

except KeyboardInterrupt:
    pass

stream.stop_stream()
stream.close()
p.terminate()
