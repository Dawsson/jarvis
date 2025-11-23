#!/usr/bin/env python3
"""
1. Normalize all audio files to consistent volume (preserve whispers)
2. Renumber files sequentially
"""
import librosa
import soundfile as sf
import numpy as np
import glob
import os
from pathlib import Path

print("🔧 Normalizing and Renumbering Audio Files")
print("=" * 50)

def normalize_audio(audio, target_rms=0.05):
    """
    Normalize audio to target RMS while preserving dynamic range.
    This makes whispers audible without making them loud.
    """
    current_rms = np.sqrt(np.mean(audio**2))
    if current_rms > 0:
        # Scale to target RMS
        scaling_factor = target_rms / current_rms
        # Limit boost to prevent noise amplification
        scaling_factor = min(scaling_factor, 3.0)
        normalized = audio * scaling_factor
        # Prevent clipping
        max_val = np.max(np.abs(normalized))
        if max_val > 1.0:
            normalized = normalized / max_val * 0.95
        return normalized
    return audio

def process_directory(dir_path, prefix):
    """Process and renumber all files in a directory"""
    files = sorted(glob.glob(f'{dir_path}/*.wav'))

    print(f"\n📂 Processing {dir_path}/")
    print(f"   Found {len(files)} files")

    if len(files) == 0:
        return

    # Create temp directory
    temp_dir = f'{dir_path}_temp'
    os.makedirs(temp_dir, exist_ok=True)

    # Process and renumber
    for idx, old_file in enumerate(files, start=1):
        # Load audio
        audio, sr = librosa.load(old_file, sr=16000)

        # Normalize
        normalized = normalize_audio(audio)

        # Save with new sequential number
        new_filename = f'{prefix}_{idx}.wav'
        new_path = f'{temp_dir}/{new_filename}'
        sf.write(new_path, normalized, sr)

    # Remove old files and move new ones
    for f in files:
        os.remove(f)

    # Move normalized files to original directory
    for f in glob.glob(f'{temp_dir}/*.wav'):
        os.rename(f, f.replace('_temp/', '/'))

    # Remove temp directory
    os.rmdir(temp_dir)

    print(f"   ✅ Normalized and renumbered to {prefix}_1 through {prefix}_{len(files)}")

# Process both directories
process_directory('training_data/jarvis', 'jarvis')
process_directory('training_data/noise', 'noise')

print("\n✅ Complete!")
print("\n📊 Final counts:")
jarvis_count = len(glob.glob('training_data/jarvis/*.wav'))
noise_count = len(glob.glob('training_data/noise/*.wav'))
print(f"   Jarvis: {jarvis_count} samples (normalized, sequentially numbered)")
print(f"   Noise: {noise_count} samples (normalized, sequentially numbered)")
print(f"\n💡 Collection scripts will now work correctly!")
print(f"   Next Jarvis sample: jarvis_{jarvis_count + 1}.wav")
print(f"   Next noise sample: noise_{noise_count + 1}.wav\n")
