#!/usr/bin/env python3
"""
Clean up bad Jarvis samples
"""
import librosa
import numpy as np
import glob
import os

print("🧹 Cleaning Jarvis samples...")
print("=" * 50)

jarvis_files = glob.glob('training_data/jarvis/*.wav')
silent_files = []
quiet_files = []

for f in jarvis_files:
    audio, _ = librosa.load(f, sr=16000)
    rms = np.sqrt(np.mean(audio**2))

    if rms < 0.001:
        silent_files.append((f, rms))
    elif rms < 0.005:
        quiet_files.append((f, rms))

print(f"\n📊 Analysis:")
print(f"   Total Jarvis samples: {len(jarvis_files)}")
print(f"   Silent (will delete): {len(silent_files)}")
print(f"   Very quiet (review): {len(quiet_files)}")

# Delete completely silent files
for f, rms in silent_files:
    print(f"   🗑️  Deleting silent: {f.split('/')[-1]} (RMS={rms:.6f})")
    os.remove(f)

# Show quiet files for review
if quiet_files:
    print(f"\n⚠️  Very quiet files (RMS < 0.005):")
    for f, rms in quiet_files[:10]:
        print(f"   {f.split('/')[-1]}: RMS={rms:.6f}")
    if len(quiet_files) > 10:
        print(f"   ... and {len(quiet_files)-10} more")
    print("\n   Consider re-recording these louder or deleting them")

remaining = len(glob.glob('training_data/jarvis/*.wav'))
print(f"\n✅ Done! Remaining Jarvis samples: {remaining}")
print("\n💡 Recommendation: Record 50+ more diverse samples")
print("   - Say 'Jarvis' and 'Hey Jarvis'")
print("   - Different volumes, speeds, tones")
print("   - Different distances from mic\n")
