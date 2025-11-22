#!/usr/bin/env python3
"""
OpenWakeWord service for detecting 'Hey Jarvis' wake word.
Outputs 'DETECTED' to stdout when wake word is heard.
"""
import sys
import openwakeword
from openwakeword.model import Model
import pyaudio
import numpy as np

# Initialize OpenWakeWord
model = Model(wakeword_models=["hey_jarvis"])

# Audio config
CHUNK = 1280  # 80ms at 16kHz
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000

# Initialize PyAudio
audio = pyaudio.PyAudio()
stream = audio.open(
    format=FORMAT,
    channels=CHANNELS,
    rate=RATE,
    input=True,
    frames_per_buffer=CHUNK
)

print("READY", flush=True)

try:
    while True:
        # Read audio chunk
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_data = np.frombuffer(data, dtype=np.int16)

        # Predict
        prediction = model.predict(audio_data)

        # Check if wake word detected
        for mdl_name, score in prediction.items():
            if score > 0.5:  # Confidence threshold
                print("DETECTED", flush=True)

except KeyboardInterrupt:
    pass
finally:
    stream.stop_stream()
    stream.close()
    audio.terminate()
