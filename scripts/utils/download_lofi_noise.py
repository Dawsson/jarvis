#!/usr/bin/env python3
"""
Download a 2-minute lo-fi music video and extract audio segments to training_data/noise/
Uses the same extraction logic as extract_negative_from_file.py
"""

import os
import sys
import numpy as np
import wave
import subprocess
import tempfile
from pathlib import Path

# YouTube URL for lo-fi music (using regular videos, not live streams)
# Try multiple URLs - first one that works will be used
LOFI_URLS = [
    "https://www.youtube.com/watch?v=lP26UCnoH9s",  # Lo-fi hip hop mix (regular video)
    "https://www.youtube.com/watch?v=0xs-oaSZd2E",  # Lo-fi beats compilation
    "https://www.youtube.com/watch?v=5qap5aO4i9A",  # Lo-fi hip hop radio (fallback)
]
DOWNLOAD_DURATION = 120  # 2 minutes

def get_next_file_number():
    """Get the next available file number"""
    noise_dir = Path("training_data/noise")
    if not noise_dir.exists():
        noise_dir.mkdir(parents=True, exist_ok=True)
        return 1
    
    files = list(noise_dir.glob("noise_*.wav"))
    if not files:
        return 1
    
    numbers = []
    for f in files:
        try:
            num = int(f.stem.split("_")[1])
            numbers.append(num)
        except (ValueError, IndexError):
            continue
    
    return max(numbers) + 1 if numbers else 1

def main():
    print("🎵 Downloading Lo-Fi Music for Noise Dataset")
    print("=" * 50)
    
    # Get starting file number
    file_num = get_next_file_number()
    print(f"📁 Starting from noise_{file_num}.wav")
    
    # Create temp directory for download
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_video = os.path.join(temp_dir, "lofi_video.mp4")
        temp_audio = os.path.join(temp_dir, "lofi_audio.wav")
        
        # Download 2 minutes of video using yt-dlp
        print(f"\n⬇️  Downloading 2 minutes from YouTube...")
        
        try:
            # Try multiple URLs until one works
            download_success = False
            for i, url in enumerate(LOFI_URLS):
                print(f"\n   Trying URL {i+1}/{len(LOFI_URLS)}: {url}")
                # Download audio directly and convert to WAV in one step (faster)
                print("🔄 Downloading and converting audio (16kHz mono)...")
                result = subprocess.run([
                    "yt-dlp",
                    "-x",  # Extract audio only
                    "--audio-format", "wav",
                    "--postprocessor-args", f"ffmpeg:-ar 16000 -ac 1 -t {DOWNLOAD_DURATION}",
                    "-o", temp_audio,
                    url
                ], capture_output=True, text=True, timeout=180)
                
                # Check if file was created (sometimes yt-dlp returns non-zero but still creates file)
                if result.returncode == 0 or os.path.exists(temp_audio) or any(f.endswith('.wav') for f in os.listdir(temp_dir)):
                    download_success = True
                    print(f"✅ Successfully downloaded from URL {i+1}")
                    break
                else:
                    error_msg = result.stderr[:300] if result.stderr else result.stdout[:300]
                    print(f"⚠️  Failed: {error_msg}")
                    continue
            
            if not download_success:
                print(f"❌ All download attempts failed")
                sys.exit(1)
            
            print("✅ Download and conversion complete")
            
            # If yt-dlp saved with a different extension, find the actual file
            if not os.path.exists(temp_audio):
                # yt-dlp might add extension based on format
                possible_files = [f for f in os.listdir(temp_dir) if f.startswith("lofi_audio")]
                if possible_files:
                    temp_audio = os.path.join(temp_dir, possible_files[0])
                else:
                    # Try to find any wav file
                    wav_files = [f for f in os.listdir(temp_dir) if f.endswith(".wav")]
                    if wav_files:
                        temp_audio = os.path.join(temp_dir, wav_files[0])
                    else:
                        print("❌ Could not find downloaded audio file")
                        sys.exit(1)
            
            # Ensure it's exactly 2 minutes and correct format
            print("🔄 Ensuring correct format...")
            temp_audio_final = os.path.join(temp_dir, "lofi_audio_final.wav")
            result2 = subprocess.run([
                "ffmpeg",
                "-i", temp_audio,
                "-ar", "16000",  # 16kHz sample rate
                "-ac", "1",      # mono
                "-t", str(DOWNLOAD_DURATION),  # Ensure exactly 2 minutes
                "-y",
                temp_audio_final
            ], capture_output=True, text=True)
            
            if result2.returncode != 0:
                print(f"⚠️  FFmpeg format check warning: {result2.stderr}")
                # Continue anyway, might already be correct format
            else:
                temp_audio = temp_audio_final
            
            print("✅ Conversion complete")
            
            # Segment audio - same logic as extract_negative_from_file.py
            print("\n📊 Segmenting audio...")
            noise_dir = Path("training_data/noise")
            noise_dir.mkdir(parents=True, exist_ok=True)
            
            segments_saved = 0
            segments_skipped = 0
            
            with wave.open(temp_audio, 'rb') as wf:
                sample_rate = wf.getframerate()
                n_channels = wf.getnchannels()
                sample_width = wf.getsampwidth()
                
                segment_frames = sample_rate * 1  # 1 second segments
                
                while True:
                    frames = wf.readframes(segment_frames)
                    if len(frames) < segment_frames * sample_width * n_channels:
                        break  # End of file
                    
                    # Convert to numpy to check energy
                    audio_data = np.frombuffer(frames, dtype=np.int16)
                    
                    # Skip silent segments
                    if np.max(np.abs(audio_data)) < 500:
                        segments_skipped += 1
                        continue
                    
                    # Save segment
                    filename = noise_dir / f"noise_{file_num}.wav"
                    with wave.open(str(filename), 'wb') as out_wf:
                        out_wf.setnchannels(n_channels)
                        out_wf.setsampwidth(sample_width)
                        out_wf.setframerate(sample_rate)
                        out_wf.writeframes(frames)
                    
                    segments_saved += 1
                    if segments_saved % 10 == 0:
                        print(f"   Saved {segments_saved} segments...")
                    
                    file_num += 1
            
            print(f"\n✅ Extraction complete!")
            print(f"   Saved: {segments_saved} segments")
            print(f"   Skipped: {segments_skipped} silent segments")
            print(f"\n💡 Next step: Retrain the model with:")
            print(f"   uvx --with tensorflow --with librosa python3 scripts/training/2_train_model.py")
            
        except subprocess.TimeoutExpired:
            print("❌ Download timed out")
            sys.exit(1)
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == "__main__":
    main()
