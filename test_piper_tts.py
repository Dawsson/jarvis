#!/usr/bin/env python3
"""
Test script for Piper TTS with Jarvis-like voice
Tests multiple voices and applies audio filters to sound more like JARVIS
"""

import sys
import subprocess
import tempfile
import os
from pathlib import Path
import numpy as np
from scipy import signal

# Test phrases that sound like Jarvis
TEST_PHRASES = [
    "Good morning, Sir. I trust you slept well.",
    "Shall I run a diagnostics check on the suit, Sir?",
    "I'm afraid the systems are currently offline, Sir.",
]

# Voices to test (British/professional sounding)
VOICES_TO_TEST = [
    "en_GB-alan-medium",  # British male - smooth and professional (BEST)
]

def apply_jarvis_filter(audio_data, sample_rate):
    """
    Professional voice changer approach:
    1. Formant shifting (deeper character)
    2. Spectral shaping (presence and air)
    3. De-essing (smooth harsh sounds)
    4. Subtle saturation (warmth and richness)
    """
    # Convert to float
    audio_float = audio_data.astype(np.float32) / 32768.0

    # 1. FORMANT SHIFTING - Change voice character without changing speed
    # This is the key to making voice sound deeper/more authoritative
    from scipy.fft import rfft, irfft

    # Perform FFT
    spectrum = rfft(audio_float)
    freqs = np.fft.rfftfreq(len(audio_float), 1/sample_rate)

    # Shift formants down by ~12% (makes voice deeper/richer)
    formant_shift = 0.88  # Lower = deeper voice character
    new_spectrum = np.zeros_like(spectrum)

    for i, freq in enumerate(freqs):
        # Find the corresponding frequency in shifted spectrum
        shifted_freq = freq / formant_shift
        # Interpolate to get the value at that frequency
        if shifted_freq < freqs[-1]:
            idx = np.searchsorted(freqs, shifted_freq)
            if idx > 0 and idx < len(freqs):
                # Linear interpolation
                alpha = (shifted_freq - freqs[idx-1]) / (freqs[idx] - freqs[idx-1])
                new_spectrum[i] = spectrum[idx-1] * (1-alpha) + spectrum[idx] * alpha

    audio_formant = irfft(new_spectrum, n=len(audio_float))
    audio_formant = np.real(audio_formant)

    # 2. SPECTRAL SHAPING - Professional broadcast sound
    nyquist = sample_rate / 2

    # Boost presence (3-5kHz) - clarity and intelligibility
    presence_center = 4000 / nyquist
    presence_width = 0.3
    b_presence, a_presence = signal.butter(2, [presence_center * (1-presence_width),
                                                presence_center * (1+presence_width)],
                                           btype='band')
    presence_component = signal.filtfilt(b_presence, a_presence, audio_formant)
    audio_shaped = audio_formant + (presence_component * 0.15)  # 15% boost

    # Add "air" (8-12kHz) - brightness and clarity
    air_freq = 9000 / nyquist
    b_air, a_air = signal.butter(1, air_freq, btype='high')
    air_component = signal.filtfilt(b_air, a_air, audio_shaped)
    audio_shaped = audio_shaped + (air_component * 0.08)  # 8% boost

    # 3. DE-ESSING - Tame harsh "S" sounds
    # Detect high-frequency energy and compress it
    sibilance_freq = 6000 / nyquist
    b_sib, a_sib = signal.butter(2, sibilance_freq, btype='high')
    sibilance = signal.filtfilt(b_sib, a_sib, audio_shaped)

    # Compress sibilance (reduce loud parts)
    sibilance_threshold = 0.3
    sibilance_compressed = np.where(
        np.abs(sibilance) > sibilance_threshold,
        np.sign(sibilance) * (sibilance_threshold + (np.abs(sibilance) - sibilance_threshold) * 0.4),
        sibilance
    )

    # Mix back
    audio_deessed = audio_shaped - sibilance + sibilance_compressed

    # 4. SUBTLE SATURATION - Warmth and richness
    # Adds harmonic overtones (like tube/tape saturation)
    drive = 1.15
    audio_saturated = np.tanh(audio_deessed * drive) / drive * 0.95

    # 5. SMOOTH FADE OUT
    fade_length = int(0.12 * sample_rate)
    fade_out = np.ones_like(audio_saturated)
    fade_out[-fade_length:] = np.linspace(1, 0, fade_length)
    audio_faded = audio_saturated * fade_out

    # Final normalization
    max_val = np.max(np.abs(audio_faded))
    if max_val > 0:
        audio_faded = audio_faded / max_val * 0.85

    # Convert back to int16
    audio_final = (audio_faded * 32767).astype(np.int16)

    return audio_final


def download_voice_if_needed(voice_name):
    """Download the specified voice if not already present"""
    voices_dir = Path.home() / ".local" / "share" / "piper" / "voices"
    voice_file = voices_dir / f"{voice_name}.onnx"

    if voice_file.exists():
        print(f"✓ Voice model already downloaded: {voice_file}")
        return str(voice_file)

    print(f"📥 Downloading {voice_name} voice model...")
    voices_dir.mkdir(parents=True, exist_ok=True)

    # Parse voice name to build URL
    # Format: language_REGION-name-quality (e.g., en_GB-alan-medium)
    parts = voice_name.split('-')
    lang_region = parts[0]  # en_GB or en_US
    name = parts[1]  # alan, northern_english_male, lessac
    quality = parts[2]  # medium

    lang = lang_region.split('_')[0]  # en
    region = lang_region.split('_')[1] if '_' in lang_region else ''  # GB, US

    # Build HuggingFace URL
    if region:
        base_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang}/{lang_region}/{name}/{quality}"
    else:
        base_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang}/{name}/{quality}"

    for ext in [".onnx", ".onnx.json"]:
        file_url = f"{base_url}/{voice_name}{ext}"
        output_file = voices_dir / f"{voice_name}{ext}"

        print(f"  Downloading {output_file.name}...")
        print(f"  URL: {file_url}")
        subprocess.run(["curl", "-L", "-o", str(output_file), file_url], check=True)

    print(f"✓ Voice model downloaded to: {voice_file}")
    return str(voice_file)


def test_piper_tts(voice_model_path, voice_name, apply_filter=True):
    """Test Piper TTS with Jarvis-like phrases"""

    print("\n" + "="*60)
    print(f"🎙️  TESTING: {voice_name}")
    print(f"    Filter: {'ENABLED (formant shift, spectral shaping, de-essing, saturation)' if apply_filter else 'DISABLED'}")
    print("="*60)

    # Import piper_tts
    try:
        from piper import PiperVoice
        print("✓ piper-tts imported successfully\n")
    except ImportError:
        print("❌ Error: piper-tts not installed")
        print("   Run: pip install piper-tts")
        sys.exit(1)

    # Load voice model
    print(f"📂 Loading voice model: {voice_model_path}")
    voice = PiperVoice.load(voice_model_path)
    print(f"✓ Voice loaded successfully\n")

    # Test each phrase
    for i, phrase in enumerate(TEST_PHRASES, 1):
        print(f"\n[{i}/{len(TEST_PHRASES)}] Testing: \"{phrase}\"")

        # Create temporary output file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            output_file = f.name

        try:
            # Synthesize speech - returns generator of audio chunks
            print("   🔊 Synthesizing audio...")
            import wave
            import time

            synthesis_start = time.time()
            first_chunk_time = None
            chunk_count = 0

            with wave.open(output_file, "wb") as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(22050)  # Piper default sample rate

                # Synthesize returns generator of AudioChunk objects
                for audio_chunk in voice.synthesize(phrase):
                    if first_chunk_time is None:
                        first_chunk_time = time.time()
                        time_to_first_audio = (first_chunk_time - synthesis_start) * 1000
                        print(f"   ⚡ First audio chunk: {time_to_first_audio:.1f}ms")

                    wav_file.writeframes(audio_chunk.audio_int16_bytes)
                    chunk_count += 1

            synthesis_end = time.time()
            total_time = (synthesis_end - synthesis_start) * 1000

            # Apply JARVIS filter if enabled
            if apply_filter:
                print("   🎚️  Applying JARVIS audio filter...")
                filter_start = time.time()

                # Read the generated audio
                import wave as wave_module
                with wave_module.open(output_file, 'rb') as wf:
                    frames = wf.readframes(wf.getnframes())
                    audio_data = np.frombuffer(frames, dtype=np.int16)

                # Apply filter
                filtered_audio = apply_jarvis_filter(audio_data, 22050)

                # Write filtered audio back
                with wave_module.open(output_file, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(22050)
                    wf.writeframes(filtered_audio.tobytes())

                filter_time = (time.time() - filter_start) * 1000
                print(f"   ✓ Filter applied in {filter_time:.1f}ms")

            # Get file size
            file_size = os.path.getsize(output_file)
            duration_seconds = file_size / (22050 * 2)  # 16-bit mono

            print(f"   ✓ Generated: {file_size} bytes, {duration_seconds:.2f}s audio")
            print(f"   ⏱️  Total synthesis time: {total_time:.1f}ms ({chunk_count} chunks)")
            print(f"   📊 Real-time factor: {duration_seconds / (total_time / 1000):.2f}x")

            # Play audio using afplay (macOS)
            print("   ▶️  Playing audio...")
            subprocess.run(["afplay", output_file], check=True)

            print("   ✓ Playback complete")

        finally:
            # Cleanup
            if os.path.exists(output_file):
                os.remove(output_file)

    print("\n" + "="*60)
    print("✓ All tests complete!")
    print("="*60)

    # Performance info
    print("\n📊 Performance Notes:")
    print("   • Piper TTS is optimized for CPU")
    print("   • Typical latency: 50-200ms for synthesis")
    print("   • Supports streaming for even lower perceived latency")
    print("   • No GPU required, runs great on M4 Pro")
    print("\n💡 Next Steps:")
    print("   • If you like this voice, we can integrate it into Jarvis")
    print("   • For true Jarvis voice, we'd need to train on Paul Bettany audio")
    print("   • Or use XTTS voice cloning with a reference clip")


def main():
    print("🚀 Piper TTS Test Script - JARVIS Voice Comparison")
    print("   Testing multiple voices with audio filters")
    print("   Filters: Deeper pitch, reverb, bass boost\n")

    # Test each voice
    for voice_name in VOICES_TO_TEST:
        print(f"\n{'='*60}")
        print(f"📥 Preparing voice: {voice_name}")
        print('='*60)

        # Download voice if needed
        voice_model_path = download_voice_if_needed(voice_name)

        # Test with filter enabled
        test_piper_tts(voice_model_path, voice_name, apply_filter=True)

        print("\n" + "="*60)
        print(f"✓ Completed testing: {voice_name}")
        print("="*60)

        # Pause between voices
        input("\nPress Enter to test next voice...")

    print("\n" + "="*60)
    print("✅ ALL VOICES TESTED")
    print("="*60)
    print("\n💡 Which voice sounded most like JARVIS?")
    print("   We can integrate your favorite into the actual Jarvis system.")


if __name__ == "__main__":
    main()
