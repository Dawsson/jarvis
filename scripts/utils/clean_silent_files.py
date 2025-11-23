#!/usr/bin/env python3
"""
Clean up silent noise files - keep only ~20% of them
"""
import librosa
import numpy as np
import glob
import os

print("🧹 Cleaning up silent noise files...")
print("=" * 50)

noise_files = glob.glob('training_data/noise/*.wav')
silent_files = []

# Find all silent files
for f in noise_files:
    audio, _ = librosa.load(f, sr=16000)
    rms = np.sqrt(np.mean(audio**2))
    if rms < 0.001:
        silent_files.append(f)

print(f"\n📊 Found {len(silent_files)} silent files out of {len(noise_files)} total")

# Keep 20% of silent files (about 27 files)
keep_count = max(20, len(silent_files) // 5)
delete_files = silent_files[keep_count:]

print(f"   Keeping: {keep_count} silent files")
print(f"   Deleting: {len(delete_files)} silent files\n")

# Delete the excess silent files
for f in delete_files:
    os.remove(f)

print(f"✅ Cleaned up! Now you have:")
remaining_files = glob.glob('training_data/noise/*.wav')
print(f"   {len(remaining_files)} total noise samples")
print(f"   (~{keep_count} are silent, rest have actual noise)")
print("\n💡 Next: Retrain your model with 'bun run train'\n")
