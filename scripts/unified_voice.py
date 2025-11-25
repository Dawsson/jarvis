#!/usr/bin/env python3
"""
Unified voice capture: wake word detection + recording with rolling buffer
Captures 1.5 seconds BEFORE wake word for better transcription accuracy
"""

import sys
print("🐍 [Python] unified_voice.py starting...", flush=True)

import numpy as np
import librosa
import pyaudio
import json
import wave
import threading
import select
from collections import deque

print("🐍 [Python] Imports complete", flush=True)

# Parse command-line arguments
no_wake_word = "--no-wake-word" in sys.argv
print(f"🐍 [Python] no_wake_word = {no_wake_word}", flush=True)
if no_wake_word:
    sys.argv.remove("--no-wake-word")

# Load wake word model only if wake word detection is enabled
model = None
MAX_FRAMES = None
N_MFCC = None
USE_DELTAS = False

if not no_wake_word:
    import tensorflow as tf
    # Load without compiling - we don't need the loss function for inference
    model = tf.keras.models.load_model("jarvis_model/model.h5", compile=False)

    with open("jarvis_model/metadata.json", "r") as f:
        metadata = json.load(f)

    MAX_FRAMES = metadata["max_frames"]
    N_MFCC = metadata["n_mfcc"]
    USE_DELTAS = metadata.get("use_deltas", False)

# Audio configuration
RATE = 48000  # High quality for recording
CHUNK = 1024
PRE_BUFFER_DURATION = 1.5  # Capture 1.5s before wake word
SILENCE_DURATION = 1.5  # Stop after 1.5s of silence
MAX_RECORDING_DURATION = 15.0  # Max 15s recording

# Buffers
pre_buffer_size = int(RATE * PRE_BUFFER_DURATION)
pre_buffer = deque(maxlen=pre_buffer_size)

# VAD settings - Increased threshold to ignore background noise
SILENCE_THRESHOLD = 300  # Increased from 150 - background noise now counts as silence
SILENCE_CHUNKS_THRESHOLD = int((SILENCE_DURATION * RATE) / CHUNK)

# Wake word detection settings
DETECTION_THRESHOLD = 0.75  # Base threshold for detection (lowered from 0.80)
HIGH_CONFIDENCE_THRESHOLD = 0.85  # Very high confidence triggers immediately
MEDIUM_CONFIDENCE_THRESHOLD = 0.75  # Medium confidence requires consecutive detections
CONSECUTIVE_DETECTIONS_REQUIRED = 2  # Require 2 consecutive detections for medium confidence
CONFIDENCE_SMOOTHING_WINDOW = deque(maxlen=CONSECUTIVE_DETECTIONS_REQUIRED)

# Get microphone index
mic_index = int(sys.argv[1]) if len(sys.argv) > 1 else None
print(f"🐍 [Python] Requested microphone index: {mic_index}", flush=True)

# Setup audio
p = pyaudio.PyAudio()
stream_kwargs = {
    "format": pyaudio.paInt16,
    "channels": 1,
    "rate": RATE,
    "input": True,
    "frames_per_buffer": CHUNK,
}

# Try to open with specified microphone, fall back to default if it fails
stream = None
if mic_index is not None:
    try:
        print(f"🐍 [Python] Attempting to open microphone index {mic_index}", flush=True)
        stream_kwargs["input_device_index"] = mic_index
        stream = p.open(**stream_kwargs)
        print(f"🐍 [Python] Successfully opened microphone index {mic_index}", flush=True)
    except Exception as e:
        print(f"🐍 [Python] Failed to open microphone index {mic_index}: {e}", flush=True)
        print(f"🐍 [Python] Falling back to default microphone", flush=True)
        stream = None

# If no stream yet, try default microphone
if stream is None:
    try:
        # Remove input_device_index to use default
        if "input_device_index" in stream_kwargs:
            del stream_kwargs["input_device_index"]
        print(f"🐍 [Python] Opening default microphone", flush=True)
        stream = p.open(**stream_kwargs)
        print(f"🐍 [Python] Successfully opened default microphone", flush=True)
    except Exception as e:
        print(f"🐍 [Python] FATAL: Failed to open default microphone: {e}", flush=True)
        sys.exit(1)

# Flags for manual recording control
record_next = threading.Event()
stop_recording = threading.Event()

def stdin_listener():
    """Listen for commands from Node.js via stdin"""
    print("DEBUG: stdin_listener starting, checking if stdin is available", flush=True)
    print(f"DEBUG: stdin.isatty() = {sys.stdin.isatty()}", flush=True)
    print(f"DEBUG: stdin.readable() = {sys.stdin.readable()}", flush=True)

    while True:
        try:
            if select.select([sys.stdin], [], [], 0.1)[0]:
                line = sys.stdin.readline().strip()
                print(f"DEBUG: stdin received line: '{line}'", flush=True)
                if line == "RECORD_NOW":
                    print("DEBUG: Received RECORD_NOW command", flush=True)
                    record_next.set()
                    stop_recording.clear()
                elif line == "STOP_RECORDING":
                    print("DEBUG: Received STOP_RECORDING command", flush=True)
                    stop_recording.set()
        except Exception as e:
            print(f"DEBUG: stdin_listener error: {e}", flush=True)

# Start stdin listener in background thread
listener_thread = threading.Thread(target=stdin_listener, daemon=True)
listener_thread.start()

print("DEBUG: stdin listener thread started", flush=True)
print("READY", flush=True)


def downsample_for_detection(audio_48k):
    """Downsample 48kHz audio to 16kHz for wake word model"""
    audio_float = audio_48k.astype(np.float32) / 32768.0
    audio_16k = librosa.resample(audio_float, orig_sr=RATE, target_sr=16000)
    return audio_16k


def extract_features(audio_16k):
    """Extract MFCC features with deltas for wake word detection"""
    mfcc = librosa.feature.mfcc(y=audio_16k, sr=16000, n_mfcc=N_MFCC, hop_length=256)

    if USE_DELTAS:
        # Add delta and delta-delta features to match training
        delta = librosa.feature.delta(mfcc)
        delta2 = librosa.feature.delta(mfcc, order=2)
        mfcc = np.vstack([mfcc, delta, delta2])

    if mfcc.shape[1] < MAX_FRAMES:
        pad_width = MAX_FRAMES - mfcc.shape[1]
        mfcc = np.pad(mfcc, ((0, 0), (0, pad_width)), mode='constant')
    else:
        mfcc = mfcc[:, :MAX_FRAMES]

    return mfcc.T


def is_silent(audio_data, threshold=0.01):
    """Check if audio is too quiet"""
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    rms = np.sqrt(np.mean(audio**2))
    return rms < threshold


def is_vibration_sound(audio_16k):
    """
    Detect if audio matches the vibration sound pattern.
    Vibration sound is a low-frequency tone (~42Hz) with harmonics.
    Returns True if audio looks like the vibration sound.
    """
    # Calculate power spectral density
    stft = librosa.stft(audio_16k, n_fft=2048, hop_length=512)
    magnitude = np.abs(stft)
    freqs = librosa.fft_frequencies(sr=16000, n_fft=2048)
    
    # Vibration sound frequency range (40-50Hz, with harmonics at 84-100Hz, 126-150Hz)
    vibration_freq_low = 40
    vibration_freq_high = 50
    harmonic2_low = 80
    harmonic2_high = 100
    harmonic3_low = 120
    harmonic3_high = 150
    
    # Calculate energy in vibration frequency bands
    vibration_mask = (freqs >= vibration_freq_low) & (freqs <= vibration_freq_high)
    harmonic2_mask = (freqs >= harmonic2_low) & (freqs <= harmonic2_high)
    harmonic3_mask = (freqs >= harmonic3_low) & (freqs <= harmonic3_high)
    
    vibration_energy = np.sum(magnitude[vibration_mask, :])
    harmonic2_energy = np.sum(magnitude[harmonic2_mask, :])
    harmonic3_energy = np.sum(magnitude[harmonic3_mask, :])
    total_energy = np.sum(magnitude)
    
    # Calculate ratios
    if total_energy < 1e-10:
        return False
    
    vibration_ratio = vibration_energy / total_energy
    harmonic2_ratio = harmonic2_energy / total_energy
    harmonic3_ratio = harmonic3_energy / total_energy
    
    # Vibration sound has:
    # - High energy in 40-50Hz range (>30% of total energy)
    # - Significant harmonic energy (>10% in second harmonic, >5% in third)
    # - Low energy above 200Hz (most energy concentrated in low frequencies)
    high_freq_mask = freqs > 200
    high_freq_energy = np.sum(magnitude[high_freq_mask, :])
    high_freq_ratio = high_freq_energy / total_energy
    
    is_vibration = (
        vibration_ratio > 0.30 and  # Strong fundamental frequency
        harmonic2_ratio > 0.10 and  # Strong second harmonic
        harmonic3_ratio > 0.05 and  # Some third harmonic
        high_freq_ratio < 0.30  # Low energy in high frequencies (speech has more)
    )
    
    return is_vibration


def calculate_rms(audio_chunk):
    """Calculate RMS for VAD"""
    audio_array = np.frombuffer(audio_chunk, dtype=np.int16)
    if len(audio_array) == 0:
        return 0
    rms_value = np.sqrt(np.mean(audio_array.astype(np.float64)**2))
    if np.isnan(rms_value) or np.isinf(rms_value):
        return 0
    return int(rms_value)


def save_recording(frames, filename="command.wav"):
    """Save recorded audio to WAV file"""
    wf = wave.open(filename, 'wb')
    wf.setnchannels(1)
    wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
    wf.setframerate(RATE)
    wf.writeframes(b''.join(frames))
    wf.close()


def record_command():
    """Record audio after wake word until silence detected or manual stop"""
    print(f"DEBUG: record_command() started", flush=True)
    frames = []

    # Include pre-buffer (1.5s before wake word)
    for chunk in pre_buffer:
        frames.append(chunk.tobytes())

    print(f"DEBUG: Pre-buffer included ({len(pre_buffer)} chunks)", flush=True)

    silence_chunks = 0
    recording_chunks = 0
    max_chunks = int((MAX_RECORDING_DURATION * RATE) / CHUNK)

    print(f"DEBUG: Entering recording loop (max {max_chunks} chunks)", flush=True)
    while recording_chunks < max_chunks:
        # Check for manual stop command
        if stop_recording.is_set():
            print(f"DEBUG: Stopping - manual stop requested (recorded {recording_chunks} chunks)", flush=True)
            stop_recording.clear()
            break

        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)
        recording_chunks += 1

        # Voice Activity Detection
        rms = calculate_rms(data)

        if rms < SILENCE_THRESHOLD:
            silence_chunks += 1
            if silence_chunks % 5 == 0:  # Log every 5 chunks
                total_chunks = len(frames)
                print(f"DEBUG: Silence chunks={silence_chunks}/{total_chunks}, RMS={rms}", flush=True)
        else:
            silence_chunks = 0  # Reset on voice detected

        # Stop on prolonged silence
        if silence_chunks >= SILENCE_CHUNKS_THRESHOLD:
            print(f"DEBUG: Stopping - silence detected ({silence_chunks} chunks)", flush=True)
            break

    print(f"DEBUG: Recording loop ended, total {len(frames)} chunks", flush=True)
    # Save to file
    print(f"DEBUG: Saving recording to command.wav", flush=True)
    save_recording(frames)
    print(f"DEBUG: Recording saved, sending RECORDING_COMPLETE", flush=True)
    print("RECORDING_COMPLETE", flush=True)
    print(f"DEBUG: RECORDING_COMPLETE sent", flush=True)


# Main loop
frame_count = 0
cooldown_frames = 0

try:
    while True:
        # Check for immediate recording request (follow-up or manual trigger)
        if record_next.is_set():
            record_next.clear()
            print("DEBUG: Manual/follow-up recording triggered", flush=True)
            record_command()
            pre_buffer.clear()
            frame_count = 0
            continue

        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_chunk = np.frombuffer(data, dtype=np.int16)

        # Always add to pre-buffer (rolling window)
        pre_buffer.extend(audio_chunk)

        # In keyboard-only mode, skip wake word detection
        if no_wake_word:
            continue

        # Decrease cooldown
        if cooldown_frames > 0:
            cooldown_frames -= 1

        # Run wake word detection every 5 frames
        frame_count += 1
        if frame_count >= 5 and len(pre_buffer) >= pre_buffer_size and cooldown_frames == 0:
            frame_count = 0

            # Skip if too quiet
            if is_silent(list(pre_buffer)):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on silence
                continue

            # Downsample for wake word detection
            audio_16k = downsample_for_detection(np.array(list(pre_buffer)))

            # Skip if this is the vibration sound playing
            if is_vibration_sound(audio_16k):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on vibration sound
                continue

            # Extract features and run detection
            features = extract_features(audio_16k)
            features = np.expand_dims(features, axis=0)
            prediction = model.predict(features, verbose=0)[0][0]

            # Very high confidence triggers immediately (likely real "Jarvis")
            if prediction >= HIGH_CONFIDENCE_THRESHOLD:
                print(f"DETECTED:{prediction:.3f} (high confidence)", flush=True)
                cooldown_frames = 10
                record_command()
                pre_buffer.clear()
                frame_count = 0
                CONFIDENCE_SMOOTHING_WINDOW.clear()
            
            # Medium confidence requires consecutive detections (reduces false positives)
            elif prediction >= MEDIUM_CONFIDENCE_THRESHOLD:
                CONFIDENCE_SMOOTHING_WINDOW.append(prediction)
                
                if len(CONFIDENCE_SMOOTHING_WINDOW) >= CONSECUTIVE_DETECTIONS_REQUIRED:
                    avg_confidence = np.mean(list(CONFIDENCE_SMOOTHING_WINDOW))
                    
                    # Only trigger if average is still above medium threshold
                    if avg_confidence >= MEDIUM_CONFIDENCE_THRESHOLD:
                        print(f"DETECTED:{avg_confidence:.3f} (consecutive)", flush=True)
                        cooldown_frames = 10
                        record_command()
                        pre_buffer.clear()
                        frame_count = 0
                        CONFIDENCE_SMOOTHING_WINDOW.clear()
            
            # Low confidence - reset smoothing window
            else:
                CONFIDENCE_SMOOTHING_WINDOW.clear()

except KeyboardInterrupt:
    pass

stream.stop_stream()
stream.close()
p.terminate()
