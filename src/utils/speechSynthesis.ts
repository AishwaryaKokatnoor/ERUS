// Helper for AI Facilitator Text-To-Speech with Indian/Global English voice preference

class FacilitatorVoiceEngine {
  private isMuted: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  public speak(text: string, onEnd?: () => void) {
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop prior speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;

      // Look for preferred voices (Indian English or natural English)
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.includes('en-IN') ||
          v.name.toLowerCase().includes('india') ||
          v.lang.includes('en-GB') ||
          v.lang.includes('en-US')
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        this.currentUtterance = null;
        if (onEnd) onEnd();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      if (onEnd) onEnd();
    }
  }

  public stop() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}

export const facilitatorVoice = new FacilitatorVoiceEngine();
