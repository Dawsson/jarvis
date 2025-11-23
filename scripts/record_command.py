#!/usr/bin/env python3
"""
Record command after wake word detection - with Voice Activity Detection
"""

import pyaudio
import wave
import numpy as np
import sys
import warnings

# Suppress warnings
warnings.filterwarnings('ignore')

RATE = 48000
CHUNK = 1024
CHANNELS = 1
OUTPUT_FILE = "command.wav"

# Voice activity detection parameters
SILENCE_THRESHOLD = 150  # RMS threshold for silence (lowered to capture quiet sounds)
SILENCE_DURATION = 1.2   # Seconds of silence before stopping
MAX_RECORDING_TIME = 10  # Maximum recording time in seconds

def get_rms(data):
    """Calculate RMS (Root Mean Square) of audio data"""
    audio_data = np.frombuffer(data, dtype=np.int16).astype(np.float32)
    rms = np.sqrt(np.mean(audio_data**2))
    return rms if not np.isnan(rms) else 0.0

# Get microphone index from command line or use default
mic_index = int(sys.argv[1]) if len(sys.argv) > 1 else None

audio = pyaudio.PyAudio()
stream_kwargs = {
    "format": pyaudio.paInt16,
    "channels": CHANNELS,
    "rate": RATE,
    "input": True,
    "frames_per_buffer": CHUNK,
}

if mic_index is not None:
    stream_kwargs["input_device_index"] = mic_index

stream = audio.open(**stream_kwargs)

from collections import deque

# Pre-buffer to capture audio before speech detection
PRE_BUFFER_DURATION = 1.0  # seconds of audio to keep before detection
pre_buffer_size = int(PRE_BUFFER_DURATION * RATE / CHUNK)
pre_buffer = deque(maxlen=pre_buffer_size)

frames = []
silent_chunks = 0
silence_chunks_needed = int(SILENCE_DURATION * RATE / CHUNK)
max_chunks = int(MAX_RECORDING_TIME * RATE / CHUNK)
chunk_count = 0

print(f"DEBUG: Recording immediately with {PRE_BUFFER_DURATION}s pre-buffer, Silence duration={SILENCE_DURATION}s", flush=True)

# Start recording immediately, add pre-buffer
frames.extend(list(pre_buffer))
recording_started = True

# Record until silence detected or max time reached
while chunk_count < max_chunks:
    data = stream.read(CHUNK, exception_on_overflow=False)
    chunk_count += 1
    frames.append(data)

    rms = get_rms(data)

    # Check for silence
    if rms > SILENCE_THRESHOLD:
        silent_chunks = 0
    else:
        silent_chunks += 1
        if silent_chunks % 5 == 0:
            print(f"DEBUG: Silence chunks={silent_chunks}/{silence_chunks_needed}, RMS={rms:.0f}", flush=True)

    # Stop if enough silence detected
    if silent_chunks >= silence_chunks_needed:
        print(f"DEBUG: Stopping - silence detected ({silent_chunks} chunks)", flush=True)
        break

if chunk_count >= max_chunks:
    print(f"DEBUG: Stopping - max time reached", flush=True)

stream.stop_stream()
stream.close()
audio.terminate()

wf = wave.open(OUTPUT_FILE, 'wb')
wf.setnchannels(CHANNELS)
wf.setsampwidth(audio.get_sample_size(pyaudio.paInt16))
wf.setframerate(RATE)
wf.writeframes(b''.join(frames))
wf.close()

print("DONE", flush=True)
