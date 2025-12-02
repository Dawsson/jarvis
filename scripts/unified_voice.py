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
import torch
from collections import deque

print("🐍 [Python] Loading Silero VAD model...", flush=True)
# Load Silero VAD - state-of-the-art speech detection
torch.set_num_threads(1)  # Use single thread for efficiency
model_vad, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False, onnx=False)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils

print("🐍 [Python] Imports complete", flush=True)

# Parse command-line arguments
no_wake_word = "--no-wake-word" in sys.argv
always_listening = "--always-listening" in sys.argv
print(f"🐍 [Python] no_wake_word = {no_wake_word}", flush=True)
print(f"🐍 [Python] always_listening = {always_listening}", flush=True)
if no_wake_word:
    sys.argv.remove("--no-wake-word")
if always_listening:
    sys.argv.remove("--always-listening")

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
# Faster silence detection for always-listening mode
SILENCE_DURATION = 0.8 if always_listening else 1.5  # Stop after 0.8s/1.5s of silence
MAX_RECORDING_DURATION = 15.0  # Max 15s recording

# Buffers
pre_buffer_size = int(RATE * PRE_BUFFER_DURATION)
pre_buffer = deque(maxlen=pre_buffer_size)

# VAD settings
SILENCE_CHUNKS_THRESHOLD = int((SILENCE_DURATION * RATE) / CHUNK)
MIN_SPEECH_DURATION_CHUNKS = 3  # Minimum 3 chunks (~64ms) to be considered speech

# Wake word detection settings - Increased thresholds to reduce false positives
DETECTION_THRESHOLD = 0.90  # Base threshold for detection - 90% confidence required
HIGH_CONFIDENCE_THRESHOLD = 0.95  # Very high confidence triggers immediately - 95% confidence
MEDIUM_CONFIDENCE_THRESHOLD = 0.90  # Medium confidence requires consecutive detections - 90% confidence required
CONSECUTIVE_DETECTIONS_REQUIRED = 3  # Require 3 consecutive detections for medium confidence (reduced false positives)
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

# Always-listening mode state
speech_buffer = []  # Accumulate speech chunks
is_speaking = False  # Track if currently in speech
silence_counter = 0  # Count silent chunks
active_speech_chunks = 0  # Count consecutive active speech chunks (must meet minimum)

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


def is_speech_silero(audio_data):
    """
    Use Silero VAD to detect if audio contains speech.
    Silero VAD is state-of-the-art, much more accurate than WebRTC.
    Better at distinguishing speech from coughs, sniffs, keyboard, background noise.

    Returns: (is_speech, confidence, debug_info)
    """
    # Convert to numpy array if needed
    if isinstance(audio_data, list):
        audio_array = np.frombuffer(b''.join(audio_data), dtype=np.int16)
    elif isinstance(audio_data, bytes):
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
    else:
        audio_array = audio_data

    # Convert to float32 [-1, 1]
    audio_float = audio_array.astype(np.float32) / 32768.0

    # Resample to 16kHz (Silero requirement)
    if RATE != 16000:
        audio_float = librosa.resample(audio_float, orig_sr=RATE, target_sr=16000)

    # Silero requires 512 samples (32ms at 16kHz) per chunk
    chunk_size = 512
    num_chunks = len(audio_float) // chunk_size

    if num_chunks < 1:
        return False, 0.0, "too_short"

    # Process each chunk and average probabilities
    speech_probs = []
    for i in range(num_chunks):
        chunk = audio_float[i * chunk_size:(i + 1) * chunk_size]
        audio_tensor = torch.from_numpy(chunk)
        prob = model_vad(audio_tensor, 16000).item()
        speech_probs.append(prob)

    # Average probability across all chunks
    avg_speech_prob = np.mean(speech_probs)

    # Count how many chunks are speech
    speech_chunks = sum(1 for p in speech_probs if p >= 0.5)

    # Threshold: require 30% of chunks to be speech
    # This allows short utterances while filtering coughs/sniffs
    is_speech = (speech_chunks / num_chunks) >= 0.30

    debug_info = f"prob={avg_speech_prob:.2f} speech={speech_chunks}/{num_chunks}"

    return is_speech, avg_speech_prob, debug_info


def is_silent(audio_data, threshold=0.01):
    """Check if audio is too quiet"""
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    rms = np.sqrt(np.mean(audio**2))
    return rms < threshold


def has_sufficient_energy(audio_data, threshold=0.04):
    """
    Check if audio has sufficient energy to be actual speech.
    Filters out low-energy background noise that might trigger false positives.
    Threshold increased to 0.04 to ignore quiet sounds like trackpad clicks.
    """
    audio = np.array(audio_data, dtype=np.float32) / 32768.0
    rms = np.sqrt(np.mean(audio**2))
    return rms >= threshold


def has_speech_characteristics(audio_16k):
    """
    Check if audio has speech-like spectral characteristics.
    Human speech has strong energy in 300-3400 Hz range.
    Returns True if audio looks like speech, False for background noise.
    """
    # Calculate power spectral density
    stft = librosa.stft(audio_16k, n_fft=2048, hop_length=512)
    magnitude = np.abs(stft)
    freqs = librosa.fft_frequencies(sr=16000, n_fft=2048)

    # Speech fundamental frequency range (85-255 Hz for male/female voices)
    # Speech formant range (300-3400 Hz - main energy of speech)
    speech_low = 300
    speech_high = 3400

    # Calculate energy in speech frequency band
    speech_mask = (freqs >= speech_low) & (freqs <= speech_high)
    speech_energy = np.sum(magnitude[speech_mask, :])
    total_energy = np.sum(magnitude)

    if total_energy < 1e-10:
        return False

    speech_ratio = speech_energy / total_energy

    # Speech should have at least 50% of its energy in the 300-3400 Hz range
    # Background noise and random sounds (like clicks) typically have flatter spectrum
    # Stricter threshold reduces false positives from non-speech sounds
    return speech_ratio >= 0.50


def is_impulsive_sound(audio_data, verbose=False):
    """
    Detect impulsive sounds like coughs, sniffs, clicks, keyboard taps.
    These sounds have:
    - Very short duration with sudden onset
    - High peak-to-RMS ratio (sharp transients)
    - Irregular amplitude envelope (not smooth like speech)

    Returns (is_impulsive, details_dict)
    """
    audio = np.array(audio_data, dtype=np.float32) / 32768.0

    if len(audio) < 100:
        return True, {"reason": "too_short"}

    # Calculate RMS and peak
    rms = np.sqrt(np.mean(audio ** 2))
    peak = np.max(np.abs(audio))

    # Peak-to-RMS ratio (crest factor)
    # Speech: 3-6, Coughs/sniffs/clicks: 8-20+
    if rms < 1e-6:
        return False, {"reason": "silent"}

    crest_factor = peak / rms

    # Calculate zero-crossing rate (how often signal changes sign)
    # Speech: moderate, Impulsive sounds: very high or very low
    zero_crossings = np.sum(np.abs(np.diff(np.sign(audio)))) / 2
    zcr = zero_crossings / len(audio)

    # Calculate envelope smoothness
    # Split into 10ms chunks and check variance
    chunk_size = int(0.01 * 48000)  # 10ms at 48kHz
    if len(audio) < chunk_size * 3:
        return True, {"reason": "too_short_for_speech"}

    num_chunks = len(audio) // chunk_size
    chunk_energies = []
    for i in range(num_chunks):
        chunk = audio[i * chunk_size:(i + 1) * chunk_size]
        chunk_energy = np.sqrt(np.mean(chunk ** 2))
        chunk_energies.append(chunk_energy)

    if len(chunk_energies) < 3:
        return True, {"reason": "insufficient_chunks"}

    # Coefficient of variation (stddev / mean)
    # Speech: 0.3-0.8 (relatively smooth), Impulsive: 1.0+ (very spiky)
    mean_energy = np.mean(chunk_energies)
    if mean_energy < 1e-6:
        return False, {"reason": "silent"}

    cv = np.std(chunk_energies) / mean_energy

    # Decision logic
    # High crest factor = sharp transient (cough, sniff, click)
    # High CV = very irregular envelope (not smooth speech)
    is_impulsive = (
        crest_factor > 8.0 or  # Very sharp peak
        (crest_factor > 6.0 and cv > 1.2) or  # Sharp peak + irregular
        cv > 1.5  # Extremely irregular envelope
    )

    details = {
        "crest_factor": crest_factor,
        "cv": cv,
        "is_impulsive": is_impulsive
    }

    return is_impulsive, details


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

        # Always-listening mode: continuous speech detection with wake word boost
        if always_listening:
            rms = calculate_rms(data)

            # Lower threshold since WebRTC VAD will do the real filtering
            ACTIVITY_THRESHOLD = 400  # Just need to detect "something happening"

            if rms >= ACTIVITY_THRESHOLD:
                # Potential speech detected
                if not is_speaking:
                    # Starting potential speech segment
                    active_speech_chunks += 1

                    # Only mark as actual speech if minimum duration met
                    if active_speech_chunks >= MIN_SPEECH_DURATION_CHUNKS:
                        is_speaking = True
                        silence_counter = 0
                        speech_buffer = []
                        # Include pre-buffer for context
                        for chunk in pre_buffer:
                            speech_buffer.append(chunk.tobytes())
                else:
                    # Continue accumulating speech
                    speech_buffer.append(data)
                    silence_counter = 0
                    active_speech_chunks += 1
            else:
                # Silence detected
                if is_speaking:
                    silence_counter += 1
                    speech_buffer.append(data)  # Keep adding during silence period
                    active_speech_chunks = 0  # Reset active counter

                    # If silence threshold reached, check for wake word and emit
                    if silence_counter >= SILENCE_CHUNKS_THRESHOLD:
                        is_speaking = False
                        silence_counter = 0

                        # Check if this segment contains speech using WebRTC VAD
                        if len(speech_buffer) > 0:
                            # Convert to numpy array
                            speech_array = np.frombuffer(b''.join(speech_buffer), dtype=np.int16)

                            # Calculate basic stats
                            rms = int(np.sqrt(np.mean((speech_array.astype(np.float64) ** 2))))
                            duration_ms = int(len(speech_array) / RATE * 1000)

                            # Silero VAD - State-of-the-art speech detection
                            is_speech, speech_prob, vad_debug = is_speech_silero(speech_buffer)

                            wake_word_confidence = 0.0
                            rejected_reason = None

                            if not is_speech:
                                # Silero VAD says this is NOT speech
                                # (cough, sniff, keyboard, background noise, etc.)
                                rejected_reason = "non_speech"
                                debug_info = f" {vad_debug}"
                            else:
                                # Silero VAD confirms this is speech - check wake word
                                audio_16k = downsample_for_detection(speech_array)

                                # Check if it's the vibration sound
                                is_vibration = is_vibration_sound(audio_16k)
                                if is_vibration:
                                    rejected_reason = "vibration"
                                    debug_info = ""
                                else:
                                    # Run wake word detection
                                    features = extract_features(audio_16k)
                                    features = np.expand_dims(features, axis=0)
                                    wake_word_confidence = model.predict(features, verbose=0)[0][0]

                            # Concise debug output
                            if rejected_reason:
                                print(f"⊘ {rejected_reason} (rms={rms}, {duration_ms}ms{debug_info})", flush=True)
                            else:
                                print(f"✓ speech (rms={rms}, {duration_ms}ms, wake={wake_word_confidence:.2f}, {vad_debug})", flush=True)
                                # Only emit if Silero VAD confirms it's speech
                                save_recording(speech_buffer)
                                print(f"SPEECH_SEGMENT:{wake_word_confidence:.3f}", flush=True)

                            speech_buffer = []
                else:
                    # Not speaking and silence detected - reset counter
                    active_speech_chunks = 0

        # In keyboard-only mode, skip wake word detection
        if no_wake_word:
            continue

        # Decrease cooldown
        if cooldown_frames > 0:
            cooldown_frames -= 1

        # Run wake word detection every 8 frames (reduced frequency to minimize false positives)
        frame_count += 1
        if frame_count >= 8 and len(pre_buffer) >= pre_buffer_size and cooldown_frames == 0:
            frame_count = 0

            # Skip if too quiet
            if is_silent(list(pre_buffer)):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on silence
                continue

            # Skip if insufficient energy (likely background noise)
            if not has_sufficient_energy(list(pre_buffer)):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on low energy
                continue

            # Downsample for wake word detection
            audio_16k = downsample_for_detection(np.array(list(pre_buffer)))

            # Skip if this is the vibration sound playing
            if is_vibration_sound(audio_16k):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on vibration sound
                continue

            # Skip if audio doesn't have speech-like characteristics
            if not has_speech_characteristics(audio_16k):
                CONFIDENCE_SMOOTHING_WINDOW.clear()  # Reset smoothing on non-speech audio
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
