import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { conversationHistory } from './memory/conversation-history';

export interface IntentDetectionResult {
  shouldRespond: boolean;
  confidence: number;
  reason?: string;
}

export class IntentDetector {
  private groqApiKey: string;
  private threshold: number;

  constructor(groqApiKey: string, threshold: number = 0.7) {
    this.groqApiKey = groqApiKey;
    this.threshold = threshold;
  }

  async shouldRespond(
    transcription: string,
    wakeWordDetected: boolean = false,
    wakeWordConfidence: number = 0.0
  ): Promise<IntentDetectionResult> {
    // If wake word was detected (traditional flow), always respond
    if (wakeWordDetected) {
      return {
        shouldRespond: true,
        confidence: 1.0,
        reason: 'wake_word_detected'
      };
    }

    // If wake word confidence is very high (>0.85), treat it like wake word was said
    if (wakeWordConfidence >= 0.85) {
      return {
        shouldRespond: true,
        confidence: wakeWordConfidence,
        reason: 'high_wake_word_confidence'
      };
    }

    // Get recent conversation context (last 4 messages = 2 exchanges)
    const recentHistory = await conversationHistory.getRecent(4);
    const hasRecentConversation = recentHistory.length > 0;
    const contextStr = hasRecentConversation
      ? recentHistory.map((msg: any) =>
          `${msg.role === 'user' ? 'User' : 'Jarvis'}: ${msg.content}`
        ).join('\n')
      : 'No recent conversation.';

    // Calculate time since last interaction
    const lastInteractionTime = recentHistory.length > 0
      ? new Date(recentHistory[recentHistory.length - 1].timestamp).getTime()
      : 0;
    const timeSinceLastInteraction = Date.now() - lastInteractionTime;
    const minutesSinceLastInteraction = Math.floor(timeSinceLastInteraction / 60000);
    const isRecentConversation = minutesSinceLastInteraction < 5; // Within 5 minutes

    // Use fast Groq model for intent detection
    try {
      const result = await generateText({
        model: groq('llama-3.1-8b-instant'),
        system: `You are an intent classifier for a voice assistant named Jarvis.
Your job is to determine if the user is addressing Jarvis or if this is background speech.

Output ONLY a JSON object with this exact format:
{"shouldRespond": true/false, "confidence": 0.0-1.0}

IMPORTANT SIGNALS:
1. Wake word similarity: ${wakeWordConfidence > 0 ? `The audio has ${(wakeWordConfidence * 100).toFixed(0)}% similarity to "Jarvis" wake word.` : 'No wake word detected.'}
2. Recent conversation: ${isRecentConversation ? `User was talking to Jarvis ${minutesSinceLastInteraction} minutes ago.` : 'No recent conversation.'}

Return shouldRespond=true if:
- Wake word similarity is medium-high (>0.6) - user likely said something close to "Jarvis"
- User just talked to Jarvis (within 5 min) AND making a follow-up statement/question
- Giving a clear command to an assistant ("set volume", "play music", "what time")
- Asking a question that expects an AI response

Return shouldRespond=false if:
- No wake word similarity AND no recent conversation AND not a clear command
- Background conversation with another person
- Talking about something unrelated to Jarvis
- TV/media playing in background
- Ambient noise or casual remarks not directed at anyone

SCORING GUIDE:
- Wake word >0.8 = very likely (0.9+ confidence)
- Wake word 0.6-0.8 + assistant-like command = likely (0.7-0.9 confidence)
- Recent conversation (within 5 min) + follow-up question = likely (0.7-0.9 confidence)
- No wake word, no context, but clear command = possible (0.6-0.8 confidence)
- Everything else = unlikely (<0.6 confidence)

Be less conservative than before if wake word similarity or recent conversation is present.`,
        prompt: `Recent conversation:
${contextStr}

Current transcription: "${transcription}"
Wake word confidence: ${(wakeWordConfidence * 100).toFixed(0)}%
Minutes since last interaction: ${minutesSinceLastInteraction}

Should Jarvis respond?`,
        maxTokens: 50,
        temperature: 0.1
      });

      // Parse response
      const responseText = result.text.trim();
      let parsed: any;

      try {
        // Try to extract JSON from response
        const jsonMatch = responseText.match(/\{.*\}/s);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: check for true/false in response
          const shouldRespond = responseText.toLowerCase().includes('true');
          parsed = { shouldRespond, confidence: 0.5 };
        }
      } catch (e) {
        // If parsing fails, be conservative
        console.error('Failed to parse intent response:', responseText);
        return {
          shouldRespond: false,
          confidence: 0.0,
          reason: 'parse_error'
        };
      }

      let shouldRespond = parsed.shouldRespond === true;
      let confidence = parsed.confidence || (shouldRespond ? 0.8 : 0.2);

      // Boost confidence based on wake word similarity
      // Even if LLM says no, wake word detection is a strong signal
      if (wakeWordConfidence >= 0.6) {
        const wakeWordBoost = wakeWordConfidence * 0.4; // Up to +0.4 boost
        confidence = Math.min(1.0, confidence + wakeWordBoost);

        // If combined confidence is high enough, override LLM decision
        if (confidence >= this.threshold) {
          shouldRespond = true;
        }
      }

      // Boost confidence if recent conversation (within 2 minutes)
      if (isRecentConversation && minutesSinceLastInteraction <= 2) {
        confidence = Math.min(1.0, confidence + 0.2); // +0.2 boost for very recent
        if (confidence >= this.threshold) {
          shouldRespond = true;
        }
      }

      // Apply threshold
      const meetsThreshold = shouldRespond && confidence >= this.threshold;

      return {
        shouldRespond: meetsThreshold,
        confidence,
        reason: meetsThreshold ? 'intent_detected' : 'below_threshold'
      };

    } catch (error: any) {
      console.error('Intent detection error:', error);
      // On error, default to not responding (conservative)
      return {
        shouldRespond: false,
        confidence: 0.0,
        reason: 'error'
      };
    }
  }
}
