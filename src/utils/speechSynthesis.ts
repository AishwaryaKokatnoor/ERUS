// Helper for AI Facilitator and Multi-Persona Peer Speech Synthesis (Web Speech API)
// Configured with First-Class Indian English (en-IN) Accent & Cadence, Full Chromium Resilience & Audio Unlocking

export interface VoicePersonaStudent {
  id: string;
  name: string;
  seatNumber?: number;
  gender?: 'female' | 'male';
}

class RoomVoiceEngine {
  private isMuted: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private watchdogInterval: any = null;
  private isCurrentlySpeaking: boolean = false;

  private splitIntoSentences(text: string): string[] {
    const safeText = String(text || '');
    const rawMatches = safeText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!rawMatches || rawMatches.length === 0) return [safeText.trim()];
    return rawMatches.map((s) => String(s || '').trim()).filter((s) => s.length > 0);
  }

  constructor() {
    this.initVoices();
    this.setupUserGestureUnlock();
  }

  private setupUserGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public unlock() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      this.refreshVoices();
    } catch {}
  }

  private initVoices() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.refreshVoices();
      if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      }
    }
  }

  public refreshVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length > 0) {
        this.cachedVoices = voices;
      }
      return voices;
    } catch {
      return [];
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.cachedVoices.length > 0) return this.cachedVoices;
    return this.refreshVoices();
  }

  // Detect whether a voice is an authentic Indian English voice
  public isIndianVoice(voice: SpeechSynthesisVoice): boolean {
    const lang = (voice.lang || '').toLowerCase().replace('_', '-');
    const name = (voice.name || '').toLowerCase();
    
    return (
      lang === 'en-in' ||
      lang.startsWith('en-in') ||
      lang === 'hi-in' ||
      lang.startsWith('hi-in') ||
      name.includes('india') ||
      name.includes('indian') ||
      name.includes('(india)') ||
      name.includes('heera') ||
      name.includes('ravi') ||
      name.includes('neerja') ||
      name.includes('prabhat') ||
      name.includes('veena') ||
      name.includes('hemant') ||
      name.includes('swara') ||
      name.includes('madhur') ||
      name.includes('kalpana') ||
      name.includes('rishi') ||
      name.includes('sangeeta') ||
      name.includes('lekha')
    );
  }

  public getAvailableIndianVoices(): SpeechSynthesisVoice[] {
    return this.getVoices().filter((v) => this.isIndianVoice(v));
  }

  // Find the most authentic Indian English female voice
  public getIndianFemaleVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.getVoices();
    const indianVoices = voices.filter((v) => this.isIndianVoice(v));

    // 1. Specific named Indian female voices (Windows/Edge/Chrome/Apple)
    const namedFemale = indianVoices.find((v) => {
      const name = v.name.toLowerCase();
      return (
        name.includes('heera') ||
        name.includes('neerja') ||
        name.includes('veena') ||
        name.includes('swara') ||
        name.includes('kalpana') ||
        name.includes('sangeeta') ||
        name.includes('lekha') ||
        name.includes('female')
      );
    });
    if (namedFemale) return namedFemale;

    // 2. Any Indian voice
    if (indianVoices.length > 0) return indianVoices[0];

    // 3. Fallback: Commonwealth / Neutral female voice
    return (
      voices.find((v) => {
        const lang = (v.lang || '').toLowerCase();
        const name = v.name.toLowerCase();
        return (
          (lang.includes('en-gb') || lang.includes('en-au') || lang.startsWith('en')) &&
          (name.includes('female') || name.includes('natural') || name.includes('online') || name.includes('zira'))
        );
      }) ||
      voices.find((v) => (v.lang || '').toLowerCase().startsWith('en')) ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  }

  // Find the most authentic Indian English male voice
  public getIndianMaleVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.getVoices();
    const indianVoices = voices.filter((v) => this.isIndianVoice(v));

    // 1. Specific named Indian male voices (Windows/Edge/Chrome/Apple)
    const namedMale = indianVoices.find((v) => {
      const name = v.name.toLowerCase();
      return (
        name.includes('ravi') ||
        name.includes('prabhat') ||
        name.includes('hemant') ||
        name.includes('madhur') ||
        name.includes('rishi') ||
        name.includes('male')
      );
    });
    if (namedMale) return namedMale;

    // 2. Any Indian voice that isn't explicitly female
    const nonFemale = indianVoices.find((v) => {
      const name = v.name.toLowerCase();
      return (
        !name.includes('heera') &&
        !name.includes('neerja') &&
        !name.includes('veena') &&
        !name.includes('kalpana')
      );
    });
    if (nonFemale) return nonFemale;
    if (indianVoices.length > 0) return indianVoices[0];

    // 3. Fallback: Commonwealth / Neutral male voice
    return (
      voices.find((v) => {
        const lang = (v.lang || '').toLowerCase();
        const name = v.name.toLowerCase();
        return (
          (lang.includes('en-gb') || lang.includes('en-au') || lang.startsWith('en')) &&
          (name.includes('male') || name.includes('david') || name.includes('natural') || name.includes('online'))
        );
      }) ||
      voices.find((v) => (v.lang || '').toLowerCase().startsWith('en')) ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  }

  // Find the most authentic Indian English facilitator voice
  public getIndianFacilitatorVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.getVoices();
    const indianVoices = voices.filter((v) => this.isIndianVoice(v));

    // Priority: Neerja, Heera, Ravi, Prabhat, Google English (India)
    const primary = indianVoices.find((v) => {
      const name = v.name.toLowerCase();
      return (
        name.includes('neerja') ||
        name.includes('heera') ||
        name.includes('prabhat') ||
        name.includes('ravi') ||
        name.includes('google')
      );
    });
    if (primary) return primary;

    if (indianVoices.length > 0) return indianVoices[0];

    // Fallback: Commonwealth / Neutral English voice or OS default voice
    return (
      voices.find((v) => (v.lang || '').toLowerCase().includes('en-gb')) ||
      voices.find((v) => (v.lang || '').toLowerCase().startsWith('en')) ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.activeUtterances.clear();
      this.currentUtterance = null;
    }
  }

  public isRoomAudioMuted(): boolean {
    return this.isMuted;
  }

  // AI Facilitator Speech in Indian English Accent
  public speak(text: string, onEnd?: () => void) {
    this.speakAsFacilitator(text, onEnd);
  }

  public speakAsFacilitator(text: string, onEnd?: () => void) {
    const cleanText = String(text || '').trim();
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis || !cleanText) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.unlock();

      // Cancel prior queued speeches cleanly with short timeout
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }

      const sentences = this.splitIntoSentences(cleanText);
      if (sentences.length === 0) {
        if (onEnd) onEnd();
        return;
      }

      this.isCurrentlySpeaking = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erus-ai-voice-start'));
      }

      let currentIndex = 0;

      const speakNextChunk = () => {
        if (!this.isCurrentlySpeaking || currentIndex >= sentences.length) {
          this.isCurrentlySpeaking = false;
          this.currentUtterance = null;
          this.activeUtterances.clear();
          if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
          }
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            try {
              window.speechSynthesis.cancel();
            } catch {}
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erus-ai-voice-end'));
          }
          if (onEnd) onEnd();
          return;
        }

        const sentence = sentences[currentIndex++];
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          const utterance = new SpeechSynthesisUtterance(sentence);
          utterance.volume = 1.0;
          utterance.rate = 0.95; // Dignified, clear Indian academic cadence
          utterance.pitch = 1.0;

          const voice = this.getIndianFacilitatorVoice();
          if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang || 'en-IN';
          } else {
            utterance.lang = 'en-US';
          }

          this.activeUtterances.add(utterance);
          this.currentUtterance = utterance;
          (window as any).__activeUtterance = utterance;

          let hasAdvanced = false;
          let chunkTimeout: any = null;

          const advance = () => {
            if (hasAdvanced) return;
            hasAdvanced = true;
            if (chunkTimeout) {
              clearTimeout(chunkTimeout);
              chunkTimeout = null;
            }
            this.activeUtterances.delete(utterance);
            if (this.currentUtterance === utterance) {
              this.currentUtterance = null;
            }
            speakNextChunk();
          };

          // Guard: sentence chunk timeout prevents Chromium from getting stuck permanently
          const estimatedDuration = Math.min(9000, Math.max(3500, sentence.split(/\s+/).length * 550));
          chunkTimeout = setTimeout(() => {
            console.warn('[AI Facilitator Voice] Chunk timeout reached, advancing safely:', sentence.slice(0, 30));
            advance();
          }, estimatedDuration);

          utterance.onend = () => {
            advance();
          };

          utterance.onerror = (e) => {
            console.warn('[AI Facilitator Voice Notice]: chunk event:', e.error);
            advance();
          };

          // Chromium watchdog to prevent 14-second freeze
          if (this.watchdogInterval) clearInterval(this.watchdogInterval);
          this.watchdogInterval = setInterval(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
              window.speechSynthesis.resume();
            } else {
              clearInterval(this.watchdogInterval);
              this.watchdogInterval = null;
            }
          }, 3000);

          console.log(`[AI Facilitator Voice] Speaking chunk (${currentIndex}/${sentences.length}):`, sentence, '| Voice:', voice?.name || 'Default');
          window.speechSynthesis.speak(utterance);

          setTimeout(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          }, 50);
        } catch (innerErr) {
          console.warn('[AI Facilitator Voice] Inner speak error:', innerErr);
          speakNextChunk();
        }
      };

      setTimeout(() => {
        speakNextChunk();
      }, 50);
    } catch (e) {
      console.warn('Facilitator voice synthesis error:', e);
      this.isCurrentlySpeaking = false;
      if (onEnd) onEnd();
    }
  }

  // Multi-Persona Peer Student Speech in Indian English Accent
  public speakAsStudent(student: VoicePersonaStudent, text: string, onEnd?: () => void) {
    const cleanText = String(text || '').trim();
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis || !cleanText) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.unlock();

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }

      this.isCurrentlySpeaking = true;

      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.volume = 1.0;

          const femaleNames = [
            'priya', 'sneha', 'ananya', 'divya', 'ritu', 'pooja',
            'kavya', 'neha', 'riya', 'tanvi', 'shreya', 'sanjana', 'ishita', 'diya', 'meera'
          ];
          const firstName = (student.name || '').split(' ')[0].toLowerCase();
          const isFemale = student.gender === 'female' || femaleNames.includes(firstName);
          const seatNum = student.seatNumber || (parseInt(student.id.replace(/\D/g, ''), 10) || 1);

          const indianVoices = this.getAvailableIndianVoices().filter((v) =>
            (v.lang || '').toLowerCase().startsWith('en-in') ||
            (v.lang || '').toLowerCase().startsWith('en')
          );
          const allEnglishVoices = this.getVoices().filter((v) =>
            (v.lang || '').toLowerCase().startsWith('en')
          );
          const voicePool = indianVoices.length >= 2 ? indianVoices : allEnglishVoices;
          
          let selectedVoice: SpeechSynthesisVoice | undefined;
          if (voicePool.length > 0) {
            selectedVoice = voicePool[(seatNum - 1) % voicePool.length];
          } else if (isFemale) {
            selectedVoice = this.getIndianFemaleVoice();
          } else {
            selectedVoice = this.getIndianMaleVoice();
          }

          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang || 'en-IN';
          } else {
            utterance.lang = 'en-US';
          }

          if (isFemale) {
            utterance.pitch = 1.02 + ((seatNum % 4) * 0.08);
            utterance.rate = 0.93 + ((seatNum % 3) * 0.025);
          } else {
            utterance.pitch = 0.84 + ((seatNum % 4) * 0.07);
            utterance.rate = 0.92 + ((seatNum % 3) * 0.025);
          }

          this.activeUtterances.add(utterance);
          this.currentUtterance = utterance;
          (window as any).__activeUtterance = utterance;

          let hasCleanedUp = false;
          let safetyTimeout: any = null;

          const cleanup = () => {
            if (hasCleanedUp) return;
            hasCleanedUp = true;
            if (safetyTimeout) {
              clearTimeout(safetyTimeout);
              safetyTimeout = null;
            }
            this.isCurrentlySpeaking = false;
            this.activeUtterances.delete(utterance);
            if (this.currentUtterance === utterance) {
              this.currentUtterance = null;
            }
            this.activeUtterances.clear();
            if (this.watchdogInterval) {
              clearInterval(this.watchdogInterval);
              this.watchdogInterval = null;
            }
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              try {
                window.speechSynthesis.cancel();
              } catch {}
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('erus-ai-voice-end'));
            }
          };

          const estimatedStudentDuration = Math.min(18000, Math.max(4000, text.split(/\s+/).length * 550));
          safetyTimeout = setTimeout(() => {
            console.warn('[AI Student Voice] Safety timeout reached, clearing speech state');
            cleanup();
            if (onEnd) onEnd();
          }, estimatedStudentDuration);

          utterance.onend = () => {
            cleanup();
            if (onEnd) onEnd();
          };

          utterance.onerror = (e) => {
            console.warn('[AI Student Voice Notice]: utterance event:', e.error);
            cleanup();
            if (onEnd) onEnd();
          };

          if (this.watchdogInterval) clearInterval(this.watchdogInterval);
          this.watchdogInterval = setInterval(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
              window.speechSynthesis.resume();
            } else {
              clearInterval(this.watchdogInterval);
              this.watchdogInterval = null;
            }
          }, 10000);

          window.dispatchEvent(new CustomEvent('erus-ai-voice-start'));
          window.speechSynthesis.speak(utterance);

          setTimeout(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          }, 60);
        } catch (innerErr) {
          console.warn('[AI Student Voice] Speak inner error:', innerErr);
          this.isCurrentlySpeaking = false;
          if (onEnd) onEnd();
        }
      }, 60);
    } catch (e) {
      console.warn('Student voice synthesis error:', e);
      this.isCurrentlySpeaking = false;
      if (onEnd) onEnd();
    }
  }

  public isSpeaking(): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    // Chromium bug: window.speechSynthesis.speaking often stays stuck at true.
    // Accurately verify if RoomVoiceEngine has an active utterance in flight.
    return this.isCurrentlySpeaking && (this.currentUtterance !== null || this.activeUtterances.size > 0);
  }

  public stop() {
    this.isCurrentlySpeaking = false;
    this.currentUtterance = null;
    this.activeUtterances.clear();
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      window.dispatchEvent(new CustomEvent('erus-ai-voice-end'));
    }
  }
}

export const roomVoice = new RoomVoiceEngine();
export const facilitatorVoice = roomVoice; // Backward compatibility
