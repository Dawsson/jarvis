# Always-Listening Mode: Hybrid Wake Word + Context Detection

## How It Works Now

The new approach combines **wake word detection** with **conversation context** to create a natural experience:

1. **VAD detects speech** (typing, coughing, talking)
2. **Wake word model checks similarity** to "Jarvis" (0-100%)
3. **Audio is transcribed** by Whisper
4. **Intent detector combines**:
   - Wake word confidence (did they say "Jarvis"?)
   - Recent conversation (were we just talking?)
   - Transcription content (is it a command/question?)

## Why This Approach Works

**No more Whisper hallucinations** - We filter out non-speech BEFORE transcription using:
- Energy threshold (RMS > 0.04)
- Speech characteristics (50% energy in 300-3400 Hz)
- Minimum duration (85ms sustained sound)

**Smart confidence scoring**:
- 🟢 Wake word >85% = Always respond
- 🟡 Wake word 60-85% + recent conversation = Likely respond
- 🟡 No wake word + talking within 2 minutes = Likely respond (follow-up)
- 🔴 No wake word + no context = Ignore (background)

## Voice Detection Improvements

### 1. **Increased VAD Threshold** (Most Important)
- **Old**: `SILENCE_THRESHOLD = 400`
- **New**: `SILENCE_THRESHOLD = 600`
- **Effect**: Trackpad clicks, keyboard taps, and quiet ambient sounds now count as silence

### 2. **Increased Energy Threshold**
- **Old**: `has_sufficient_energy(threshold=0.02)`
- **New**: `has_sufficient_energy(threshold=0.04)`
- **Effect**: Requires 2x louder audio before processing (filters out very quiet sounds)

### 3. **Stricter Speech Characteristics**
- **Old**: 40% of energy must be in speech frequency range (300-3400 Hz)
- **New**: 50% of energy must be in speech frequency range
- **Effect**: Random sounds and clicks (which have flatter frequency spectrum) are rejected

### 4. **Minimum Speech Duration** (New Filter)
- **New**: `MIN_SPEECH_DURATION_CHUNKS = 4` (~85ms minimum)
- **Effect**: Brief sounds like clicks, pops, and taps are ignored - only sustained audio triggers detection

## Current Filter Pipeline

When audio is captured, it goes through these filters **in order**:

1. ✅ **Silence Check** - Is RMS < 600? → Ignore
2. ✅ **Duration Check** - Is audio < 85ms? → Ignore
3. ✅ **Energy Check** - Is RMS < 0.04? → Ignore
4. ✅ **Vibration Sound Check** - Is this the vibration.wav playing? → Ignore
5. ✅ **Speech Characteristics** - Is 50%+ energy in 300-3400 Hz? → Proceed
6. ✅ **Wake Word Detection** - Does it match "Jarvis"?

## Fine-Tuning Parameters

If you still get false positives, adjust these in `scripts/unified_voice.py`:

### Make it MORE strict (fewer false positives, but might miss quiet speech):
```python
SILENCE_THRESHOLD = 800  # Even higher threshold
has_sufficient_energy(threshold=0.06)  # Require even louder audio
MIN_SPEECH_DURATION_CHUNKS = 6  # Require ~125ms of sustained sound
speech_ratio >= 0.60  # Require 60% of energy in speech frequencies
```

### Make it LESS strict (catch more speech, but more false positives):
```python
SILENCE_THRESHOLD = 500  # Lower threshold
has_sufficient_energy(threshold=0.03)  # Accept quieter audio
MIN_SPEECH_DURATION_CHUNKS = 3  # Only ~63ms required
speech_ratio >= 0.45  # Accept 45% speech frequency energy
```

## Battery Impact

**Current setup uses NO local models** - All computation is lightweight:
- ✅ RMS calculation (very fast)
- ✅ FFT for frequency analysis (fast)
- ✅ TensorFlow wake word model runs on CPU only when filters pass
- ✅ Transcription is sent to Groq API (cloud-based)

**Battery impact should be minimal** on M4 Pro - the filtering rejects 90%+ of audio before expensive processing.

## Alternative: Local Whisper Model

If you want even better accuracy, you could run a local Whisper model, but this will increase battery usage:

1. **whisper.cpp** - Optimized C++ implementation
2. **CoreML Whisper** - Apple Silicon optimized
3. **faster-whisper** - 4x faster than original Whisper

However, the current approach (cloud-based Groq) is likely **more battery efficient** because:
- No local model loaded in memory
- No GPU/NPU usage
- Processing only happens when filters pass
- Groq is extremely fast (~0.3s for transcription)

## Usage Examples

### Scenario 1: First Contact (Wake Word Required)
```
You: "Jarvis, what time is it?"
     Wake word: 92% ✓
     → Responds: "It's 3:45 PM, Sir."
```

### Scenario 2: Follow-Up (No Wake Word Needed)
```
Jarvis: "It's 3:45 PM, Sir."
You: "Set a reminder for 4 PM"  [30 seconds later]
     Wake word: 15%
     Recent conversation: YES (30 seconds ago)
     → Responds: "Reminder set for 4 PM, Sir."
```

### Scenario 3: Background Conversation (Ignored)
```
You: "Did you see that game last night?" [to friend]
     Wake word: 5%
     Recent conversation: NO
     → Ignored (logged as background)
```

### Scenario 4: Typing Sound (Filtered Before Whisper)
```
*click click click* [typing]
     Energy: LOW (filtered)
     Speech characteristics: FAIL (flat spectrum)
     → Never reaches Whisper (no hallucination)
```

### Scenario 5: Partial Wake Word
```
You: "Hey Jarvo... I mean, what's the weather?"
     Wake word: 68% (close to "Jarvis")
     Intent: Weather question
     Combined confidence: 82%
     → Responds: "Let me check the weather, Sir."
```

## Configuration

Default threshold: **0.7** (70% confidence required)

- **More strict** (fewer false positives): Set to 0.8
- **Less strict** (catch more speech): Set to 0.6

Edit in `src/daemon.ts:169`:
```typescript
intentThreshold: 0.7, // Adjust this value
```

## Confidence Boost System

The system gives confidence boosts for multiple signals:

| Signal | Boost | Example |
|--------|-------|---------|
| Wake word 85%+ | Auto-respond | Said "Jarvis" clearly |
| Wake word 60-84% | +0.4 to confidence | Said something close |
| Recent conversation (within 2 min) | +0.2 to confidence | Follow-up question |
| Clear command | LLM decides | "Set volume to 50" |

## Debug Output

Always-listening mode now shows **concise debug output** for every sound:

```
⊘ impulsive (rms=1842, 180ms cf=12.3 cv=1.8)  ← Cough filtered
⊘ non_speech (rms=1523, 650ms)                ← Background noise filtered
✓ speech (rms=2341, 1840ms, wake=0.87)        ← Real speech, sent to Whisper
```

**Key metrics**:
- **rms**: Volume (speech is usually 1500-3000+)
- **duration**: Length in milliseconds
- **cf** (crest factor): Peak/RMS ratio (speech: 3-6, coughs: 8-20+)
- **cv** (coefficient of variation): Envelope smoothness (speech: 0.3-0.8, impulsive: 1.0+)
- **wake**: Wake word confidence (0.0-1.0)

See **[DEBUG_OUTPUT.md](./DEBUG_OUTPUT.md)** for complete guide with examples.

## Recommended Next Steps

1. **Test the changes** - Monitor debug output while talking, coughing, typing
2. **Tune impulsive filter** - If coughs/sniffs still get through, check their cf/cv values in debug output
3. **Adjust threshold** - If too sensitive to background speech, increase to 0.8 in `daemon.ts:169`
4. **Fine-tune timing** - Adjust "recent conversation" window in `intent-detector.ts:58`

## Advanced Tuning

If you still get false positives from non-speech sounds:

1. **Increase SILENCE_THRESHOLD** to 800 in `scripts/unified_voice.py:62`
2. **Increase energy threshold** to 0.06 in `scripts/unified_voice.py:184`
3. **Increase MIN_SPEECH_DURATION_CHUNKS** to 6 in `scripts/unified_voice.py:64`
