# TikTok Dataset Guide for Wake Word Training

## 🎯 Perfect TikTok Videos for Negative Samples

### **Tier 1: BEST (High Priority)**
These are the most valuable for reducing false positives:

1. **Conversational Speech**
   - Vlogs, storytimes, talking head videos
   - Natural, casual speech patterns
   - Different voices, accents, speaking speeds
   - **Why**: Most likely to trigger false positives

2. **Similar-Sounding Words**
   - Videos with words like "jar of", "just is", "jar it"
   - Names that sound like "Jarvis" (Jarvis, Jarvis, etc.)
   - **Why**: Hard negatives - these are the trickiest cases

3. **Background Speech**
   - Videos with music + speech overlay
   - Multiple people talking
   - **Why**: Real-world conditions where Jarvis might be used

### **Tier 2: GOOD (Medium Priority)**

4. **Music with Vocals**
   - Songs with lyrics (not instrumental)
   - Different genres, languages
   - **Why**: Common background noise

5. **Ambient Audio**
   - Lo-fi music, white noise, nature sounds
   - **Why**: Background noise scenarios

6. **Fast/Emotional Speech**
   - Excited reactions, rapid speech
   - Whispered content
   - **Why**: Edge cases for speech patterns

### **Tier 3: OK (Lower Priority)**

7. **Instrumental Music**
   - Pure music without vocals
   - **Why**: Less likely to cause false positives, but still useful

8. **Sound Effects**
   - Meme sounds, notification sounds
   - **Why**: Edge cases, but less common

## 📊 Optimal Dataset Sizes

### **Current State Analysis**
- You have ~100-500 "Jarvis" samples (augmented 2x = 300-1500 effective)
- You have ~200+ noise samples
- You have ~76 negative speech samples

### **Sweet Spot Targets**

**Minimum Viable Dataset:**
- **Jarvis**: 100-200 samples (you're probably here)
- **Negative Speech**: 500-1000 samples ⭐ **PRIORITY**
- **Noise**: 300-500 samples

**Optimal Dataset:**
- **Jarvis**: 200-300 samples (with augmentation = 600-900 effective)
- **Negative Speech**: 2000-3000 samples ⭐ **SWEET SPOT**
- **Noise**: 1000-1500 samples

**Diminishing Returns Start:**
- **Jarvis**: 500+ samples (you're the only speaker, so limited value)
- **Negative Speech**: 5000+ samples (diminishing returns)
- **Noise**: 3000+ samples (diminishing returns)

## 🎬 How Many TikTok Videos?

**Rough Math:**
- Average TikTok: 15-60 seconds
- After segmentation: ~15-60 one-second clips per video
- After filtering silent segments: ~10-40 usable clips per video

**Recommendations:**

### **Phase 1: Quick Win (Start Here)**
- **10-20 TikTok videos** (conversational speech)
- **Expected**: ~200-400 negative speech samples
- **Time**: 30-60 minutes of collection
- **Impact**: Significant improvement, especially if you have <100 negative samples now

### **Phase 2: Optimal (Target)**
- **50-100 TikTok videos** (diverse mix)
- **Expected**: 1000-2000 negative speech samples
- **Time**: 2-4 hours of collection
- **Impact**: Maximum improvement per hour invested

### **Phase 3: Diminishing Returns**
- **200+ TikTok videos**
- **Expected**: 3000+ negative speech samples
- **Time**: 8+ hours
- **Impact**: Marginal improvement, better to focus on quality/diversity

## ⚠️ When More Data Gets WORSE

### **1. Class Imbalance Issues**
- **Problem**: Too many negatives vs positives
- **Sign**: Model becomes too conservative (low recall)
- **Solution**: Your model uses balanced class weights, so this is handled ✅

### **2. Overfitting to Noise**
- **Problem**: Model memorizes specific TikTok audio patterns
- **Sign**: High training accuracy, low real-world performance
- **Solution**: Your model has dropout + early stopping ✅

### **3. Low-Quality Data**
- **Problem**: Too many similar/redundant samples
- **Sign**: Adding more data doesn't improve validation metrics
- **Solution**: Focus on diversity, not quantity

### **4. Training Time**
- **Problem**: Too slow to iterate
- **Sign**: Training takes hours instead of minutes
- **Solution**: Stop at 2000-3000 negative samples

## ✅ Signs You Have Enough Data

**Stop collecting when:**
1. ✅ Validation accuracy plateaus (stops improving)
2. ✅ Precision/recall are both >90%
3. ✅ No false positives in real-world testing
4. ✅ Adding 100 more samples doesn't improve metrics
5. ✅ Training time becomes prohibitive

## 🎯 Recommended Collection Strategy

### **Week 1: Foundation**
- Collect 20-30 diverse TikTok videos
- Focus on conversational speech
- Process and train
- Test and identify false positives

### **Week 2: Targeted**
- Collect 20-30 more videos based on false positives
- Add similar-sounding words if needed
- Add background music if needed

### **Week 3: Polish**
- Fine-tune with 10-20 specific videos
- Focus on edge cases that still fail

### **Ongoing: Maintenance**
- Add 5-10 videos when you find new false positives
- Don't bulk collect unless you see degradation

## 📈 Expected Improvement Curve

```
Samples    | Improvement | Status
-----------|-------------|----------
0-200      | 🚀🚀🚀🚀🚀  | Huge gains
200-500    | 🚀🚀🚀🚀    | Big gains
500-1000   | 🚀🚀🚀      | Good gains
1000-2000  | 🚀🚀        | Moderate gains
2000-3000  | 🚀          | Small gains
3000+      | ➡️          | Diminishing returns
```

## 🎬 Specific TikTok Categories to Target

**Best for Negative Speech:**
- Storytime videos
- POV videos with narration
- Educational content
- Reaction videos
- Interview-style content
- Podcast clips

**Best for Background Noise:**
- Lo-fi music compilations
- Ambient sound videos
- Music with vocals (various genres)
- Nature sounds with speech overlay

**Avoid:**
- Videos where someone says "Jarvis" (obviously!)
- Very poor quality audio
- Extremely long videos (harder to process)

## 💡 Pro Tips

1. **Diversity > Quantity**: 50 diverse videos > 200 similar videos
2. **Test Early**: Train after every 10-20 videos to see improvement
3. **Track Metrics**: Watch validation accuracy/precision/recall
4. **Real-World Testing**: Test with actual use cases, not just metrics
5. **Iterate**: Add data based on what fails, not randomly
