# Always-Listening Debug Output Guide

## What You'll See

When always-listening mode is active, you'll see concise debug output for every sound detected:

### Rejected Sounds (Filtered Before Whisper)

```
⊘ low_energy (rms=245, 320ms)
```
- **low_energy**: Sound too quiet (RMS < threshold)
- **rms**: Root mean square (volume) - speech is usually 800-3000+
- **320ms**: Duration of the sound

```
⊘ impulsive (rms=1842, 180ms cf=12.3 cv=1.8)
```
- **impulsive**: Sharp transient detected (cough, sniff, click, keyboard)
- **cf** (crest factor): Peak/RMS ratio
  - Speech: 3-6
  - Coughs/sniffs: 8-20+
- **cv** (coefficient of variation): Envelope irregularity
  - Speech: 0.3-0.8 (smooth)
  - Impulsive: 1.0+ (spiky)

```
⊘ non_speech (rms=1523, 650ms)
```
- **non_speech**: Frequency spectrum doesn't match speech
- Less than 50% of energy in speech range (300-3400 Hz)
- Usually background noise, fans, music

```
⊘ vibration (rms=2134, 420ms)
```
- **vibration**: Detected the vibration.wav file playing
- Filtered to prevent feedback loop

### Accepted Sounds (Sent to Whisper)

```
✓ speech (rms=2341, 1840ms, wake=0.87)
```
- **✓ speech**: Passed all filters, sent to Whisper
- **wake=0.87**: Wake word confidence (87% similar to "Jarvis")
  - 0.00-0.30: Not similar to "Jarvis"
  - 0.30-0.60: Vaguely similar
  - 0.60-0.85: Moderately similar (boost applied)
  - 0.85+: Very similar (auto-respond)

## Typical Patterns

### Normal Speech
```
✓ speech (rms=2100, 1200ms, wake=0.15)  ← Regular talking
⊘ impulsive (rms=1100, 150ms cf=9.2 cv=1.4)  ← Quick cough
✓ speech (rms=2400, 1500ms, wake=0.91)  ← Said "Jarvis"
```

### Typing
```
⊘ impulsive (rms=890, 120ms cf=11.5 cv=1.9)  ← Key press
⊘ impulsive (rms=850, 110ms cf=10.8 cv=1.7)  ← Key press
⊘ impulsive (rms=920, 130ms cf=12.1 cv=2.0)  ← Key press
```

### Coughing
```
⊘ impulsive (rms=3200, 340ms cf=15.7 cv=2.3)  ← Sharp cough
⊘ impulsive (rms=1800, 220ms cf=13.2 cv=1.8)  ← Follow-up cough
```

### Sniffing
```
⊘ impulsive (rms=950, 180ms cf=9.8 cv=1.6)  ← Sniff
```

### Background Conversation
```
✓ speech (rms=1850, 980ms, wake=0.08)  ← Talking to someone else
   💬 "Hey did you see that game?"
   🔇 Ignored (intent: 18%, wake: 8%)  ← Low confidence, ignored
```

### Saying "Jarvis"
```
✓ speech (rms=2650, 1620ms, wake=0.92)  ← Clear "Jarvis"
   💬 "Jarvis what time is it"
   ✓ Responding (intent: 95%, wake: 92%)  ← High confidence, responds
```

## Understanding the Values

### RMS (Volume)
- **< 600**: Very quiet (usually filtered as low_energy)
- **600-1500**: Quiet speech or distant sounds
- **1500-3000**: Normal speech volume
- **3000+**: Loud speech or close to mic

### Duration
- **< 200ms**: Very short (clicks, taps, sniffs)
- **200-500ms**: Short burst (cough, quick sound)
- **500-1500ms**: Normal speech phrase
- **1500ms+**: Longer utterance

### Crest Factor (cf)
- **3-6**: Normal speech (smooth waveform)
- **6-8**: Borderline (plosive sounds in speech)
- **8+**: Impulsive (sharp transient)

### Coefficient of Variation (cv)
- **0.3-0.8**: Smooth envelope (speech)
- **0.8-1.2**: Somewhat irregular
- **1.2+**: Very spiky (impulsive sound)

## Tuning Tips

### Too many false positives (normal sounds being accepted)?
1. Lower the crest factor threshold in `unified_voice.py:287`
   - Change `crest_factor > 8.0` to `crest_factor > 6.0`
2. Lower the CV threshold in `unified_voice.py:289`
   - Change `cv > 1.5` to `cv > 1.2`

### Missing real speech?
1. Raise the crest factor threshold
   - Change `crest_factor > 8.0` to `crest_factor > 10.0`
2. Raise the CV threshold
   - Change `cv > 1.5` to `cv > 2.0`

### Still getting coughs/sniffs?
Look at the debug output and note the cf and cv values for your coughs. Adjust thresholds to be stricter than those values.

Example: Your coughs show `cf=11.2 cv=1.7`
- Set threshold to `crest_factor > 10.0` (catches cf=11.2)
- Keep CV threshold at `cv > 1.5` (catches cv=1.7)
