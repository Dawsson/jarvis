# Video Collection Guide for Training Data

## Overview
Since you're the only speaker for "Jarvis", we need diverse **negative samples** to improve the model's ability to distinguish "Jarvis" from everything else.

## Two Types of Negative Data

### 1. **Speech (Non-Jarvis)** → `training_data/negative/`
Use `extract_negative_from_file.py` for these:

**Best sources:**
- **Podcasts** - Natural conversational speech
- **YouTube videos** with people talking (interviews, vlogs, tutorials)
- **Audiobooks** - Clear, varied speech
- **TV shows/movies** - Diverse voices and speaking styles
- **Phone calls/conversations** - Real-world speech patterns

**What to avoid:**
- Videos where someone says "Jarvis" (obviously!)
- Very quiet or poor quality audio

### 2. **Background Noise/Music** → `training_data/noise/`
Use `process_video_to_noise.py` for these:

**Best sources:**
- **Lo-fi music** - Background music that might play while you use Jarvis
- **Ambient sounds** - White noise, nature sounds, city sounds
- **TV/movie soundtracks** - Background audio without speech
- **Instrumental music** - Any music without vocals
- **Environmental audio** - Fan noise, air conditioning, traffic

## How to Process Videos

### For Speech (Negative Samples):
```bash
python3 scripts/utils/extract_negative_from_file.py your_video.mp4
```
This extracts 1-second segments of speech to `training_data/negative/`

### For Background Noise:
```bash
python3 scripts/utils/process_video_to_noise.py your_video.mp4
```
This extracts 1-second segments to `training_data/noise/`

## Recommended Collection Strategy

1. **Start with 5-10 diverse videos** (mix of speech and noise)
2. **Process them** using the scripts above
3. **Retrain the model** to see improvement
4. **Test** and identify any false positives
5. **Add more data** based on what triggers incorrectly

## What Makes Good Training Data?

✅ **Diverse**: Different voices, accents, speaking speeds  
✅ **Realistic**: Audio quality similar to your actual use case  
✅ **Varied**: Different background noise levels  
✅ **Balanced**: Roughly equal amounts of speech and noise  

## Current Status

- ✅ Training script now uses BOTH `noise/` and `negative/` directories
- ✅ Scripts ready to process MP4 files
- ⏳ Waiting for your video files!
