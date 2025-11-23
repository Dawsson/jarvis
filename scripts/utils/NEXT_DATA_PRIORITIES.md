# Next Data Priorities - Ranked by Impact

## Current Status
- ✅ Jarvis: 221 samples (good for single speaker)
- ✅ Noise: 257 samples (decent, but below optimal)
- ✅ Negative Speech: 426 samples (good start, but need 4-7x more)

---

## 🎯 PRIORITY 1: Hard Negatives (CRITICAL)

**What:** Similar-sounding words/phrases that could trigger "Jarvis"

**Why:** These are your #1 source of false positives. Most impactful addition.

**Target words/phrases to find in TikTok videos:**
- "jar of" / "jar it" / "jar is"
- "just is" / "just it" / "just of"
- "Jarvis" (if someone says it, but you want to ignore it)
- "Jarvis" variations (different pronunciations)
- "Jarvis" in other languages/accents
- "Jarvis" (if it's a name)

**How to find:**
- Search TikTok for: "jar of", "just is", etc.
- Look for videos where people say these phrases naturally
- Cooking videos ("jar of pickles")
- Conversation videos ("just is what it is")

**Target:** 100-200 segments with these specific phrases

**Impact:** ⭐⭐⭐⭐⭐ (Highest - directly reduces false positives)

---

## 🎯 PRIORITY 2: More Diverse Negative Speech (HIGH)

**What:** Different types of conversational speech

**Why:** You're at 426, optimal is 2000-3000. Need 4-7x more.

**Best TikTok categories:**
1. **Storytime videos** - Long-form conversational speech
2. **Educational content** - Clear, varied speech patterns
3. **Reaction videos** - Emotional, varied speech
4. **Interview-style** - Natural back-and-forth
5. **Different accents** - If you can find them
6. **Different languages** - Even if you don't understand, helps model learn what "Jarvis" is NOT

**Target:** 500-1000 more segments (aim for 1000-1500 total)

**Impact:** ⭐⭐⭐⭐ (Very High - broad coverage)

---

## 🎯 PRIORITY 3: Music with Vocals (MEDIUM-HIGH)

**What:** Songs with lyrics playing in background

**Why:** Common real-world scenario - music playing while you use Jarvis

**Best sources:**
- Pop songs with clear vocals
- Rap/hip-hop (fast speech-like patterns)
- Different genres (rock, country, etc.)
- Different languages

**Target:** 200-300 segments

**Impact:** ⭐⭐⭐⭐ (High - common background noise)

---

## 🎯 PRIORITY 4: Background Speech (MEDIUM)

**What:** Speech with music/noise overlay (realistic scenarios)

**Why:** Real-world conditions where Jarvis might be used

**Best sources:**
- Videos with background music + speech
- Multiple people talking at once
- TV/movie clips with soundtrack
- Podcasts with intro music

**Target:** 100-200 segments

**Impact:** ⭐⭐⭐ (Medium - realistic scenarios)

---

## 🎯 PRIORITY 5: Edge Cases (MEDIUM)

**What:** Unusual speaking patterns

**Why:** Covers edge cases that might trigger incorrectly

**Types:**
- Fast/rapid speech
- Whispered speech
- Shouted/excited speech
- Slurred/mumbled speech
- Children's voices (if available)

**Target:** 50-100 segments

**Impact:** ⭐⭐⭐ (Medium - covers edge cases)

---

## 📊 Recommended Collection Order

### **Week 1: Quick Wins**
1. ✅ Hard negatives (Priority 1) - 20-30 videos
2. ✅ More diverse speech (Priority 2) - 20-30 videos
3. **Expected:** ~500-800 new negative segments
4. **Impact:** Significant improvement in false positive reduction

### **Week 2: Build Foundation**
1. Continue Priority 2 - 30-50 more videos
2. Add Priority 3 (Music with vocals) - 10-15 videos
3. **Expected:** ~800-1200 more segments
4. **Impact:** Reach ~1500-2000 total negative samples (sweet spot)

### **Week 3: Polish**
1. Fill gaps based on testing
2. Add edge cases if needed
3. Fine-tune with specific problem areas

---

## 🎬 Specific TikTok Search Terms

**For Hard Negatives:**
- "jar of"
- "just is"
- "jar it"
- Cooking videos (often say "jar of")
- Conversation videos

**For Diverse Speech:**
- "storytime"
- "POV"
- "explaining"
- "reacting to"
- Educational content
- Interview videos

**For Music:**
- Popular songs
- Trending music
- Different genres
- Songs with clear vocals

---

## ⚠️ What NOT to Prioritize

- ❌ More Jarvis samples (you're the only speaker, 221 is enough)
- ❌ Pure instrumental music (less likely to cause false positives)
- ❌ Sound effects (edge case, low priority)
- ❌ Very poor quality audio (hurts more than helps)

---

## 📈 Expected Improvement Curve

**After Priority 1 (Hard Negatives):**
- False positives: Should drop significantly
- Model confidence: Better separation between Jarvis and similar words

**After Priority 2 (More Speech):**
- General robustness: Much better
- False positives: Further reduction
- Real-world performance: Noticeable improvement

**After Priorities 3-5:**
- Edge cases: Better coverage
- Real-world scenarios: More robust
- Diminishing returns: Start to plateau

---

## 💡 Pro Tips

1. **Test frequently** - Train after every 10-20 videos to see what helps
2. **Track false positives** - Add data based on what actually fails
3. **Diversity > Quantity** - 50 diverse videos > 200 similar videos
4. **Quality matters** - Skip videos with terrible audio quality
5. **Iterate** - Don't bulk collect everything at once
