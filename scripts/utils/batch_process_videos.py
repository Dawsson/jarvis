#!/usr/bin/env python3
"""
Batch process videos from scripts/training/videos/
Automatically processes all videos - you can specify which are noise vs speech
"""

import sys
import os
from pathlib import Path
import subprocess

VIDEOS_DIR = Path("scripts/training/videos")

def process_video(video_path, output_type="negative"):
    """Process a single video"""
    if output_type == "noise":
        script = "scripts/utils/process_video_to_noise.py"
    else:
        script = "scripts/utils/extract_negative_from_file.py"
    
    print(f"\n{'='*60}")
    print(f"Processing: {video_path.name}")
    print(f"Type: {output_type}")
    print(f"{'='*60}")
    
    result = subprocess.run(
        ["python3", script, str(video_path)],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("✅ Success")
        # Extract number of segments from output
        for line in result.stdout.split('\n'):
            if 'Saved:' in line:
                print(f"   {line.strip()}")
        return True
    else:
        print(f"❌ Error: {result.stderr[:200]}")
        return False

def main():
    if not VIDEOS_DIR.exists():
        print(f"❌ Videos directory not found: {VIDEOS_DIR}")
        sys.exit(1)
    
    video_files = list(VIDEOS_DIR.glob("*.mp4"))
    
    if not video_files:
        print(f"❌ No MP4 files found in {VIDEOS_DIR}")
        sys.exit(1)
    
    print(f"📁 Found {len(video_files)} video(s) in {VIDEOS_DIR}")
    print("\nVideos found:")
    for i, vf in enumerate(video_files, 1):
        print(f"  {i}. {vf.name}")
    
    # Check if user specified which are noise
    noise_videos = []
    if len(sys.argv) > 1:
        # User provided list of noise video names/indices
        for arg in sys.argv[1:]:
            if arg.isdigit():
                idx = int(arg) - 1
                if 0 <= idx < len(video_files):
                    noise_videos.append(video_files[idx].name)
            else:
                noise_videos.append(arg)
    
    print("\n🎬 Processing videos...")
    print("(Videos not specified as noise will be processed as negative speech samples)\n")
    
    success_count = 0
    for video_file in video_files:
        output_type = "noise" if video_file.name in noise_videos else "negative"
        if process_video(video_file, output_type):
            success_count += 1
    
    print(f"\n{'='*60}")
    print(f"✅ Processing complete!")
    print(f"   Successfully processed: {success_count}/{len(video_files)} videos")
    print(f"\n💡 Next step: Retrain the model with:")
    print(f"   uvx --with tensorflow --with librosa python3 scripts/training/2_train_model.py")

if __name__ == "__main__":
    main()
