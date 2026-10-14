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
  private speechGenerationId: number = 0;
  private lastSpokenNormalized: string = '';
  private lastSpokenAt: number = 0;

  private splitIntoSentences(text: string): string[] {
    const safeText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!safeText) return [];
    const rawMatches = safeText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!rawMatches || rawMatches.length === 0) return [safeText];
    const rawSentences = rawMatches.map((s) => String(s || '').trim()).filter((s) => s.length > 0);
    // Group consecutive sentences into natural chunks (~180 chars) so SAPI/Chromium doesn't drop short follow-up sentences
    const grouped: string[] = [];
    let current = '';
    for (const s of rawSentences) {
      if (!current) {
        current = s;
      } else if ((current + ' ' + s).length <= 200) {
        current = `${current} ${s}`;
      } else {
        grouped.push(current);
        current = s;
      }
    }
    if (current) grouped.push(current);
    return grouped;
  }

  constructor() {
    this.initVoices();
    this.setupUserGestureUnlock();
  }

  private isAudioUnlocked: boolean = false;
  private hasUnlockedGesture: boolean = false;

  private setupUserGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
    };
    ['click', 'touchstart', 'keydown', 'pointerdown', 'mousedown'].forEach((evt) => {
      window.addEventListener(evt, unlock, { passive: true });
    });
  }

  public unlock() {
    if (typeof window === 'undefined') return;
    try {
      if (window.speechSynthesis) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        // Speak a silent instant dummy utterance on first interaction to permanently unlock speech synthesis
        if (!this.hasUnlockedGesture) {
          this.hasUnlockedGesture = true;
          try {
            const dummy = new SpeechSynthesisUtterance(' ');
            dummy.volume = 0.01;
            dummy.rate = 10;
            window.speechSynthesis.speak(dummy);
          } catch {}
        }
        this.refreshVoices();
      }

      // Resume Web Audio Context if present
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !this.isAudioUnlocked) {
        this.isAudioUnlocked = true;
        try {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        } catch {}
      }
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
  public speak(text: string, onEnd?: () => void, force?: boolean) {
    this.speakAsFacilitator(text, onEnd, force);
  }

  public speakAsFacilitator(text: string, onEnd?: () => void, force?: boolean) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis || !cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const normalized = cleanText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const now = Date.now();
    // Only skip duplicate if currently actively speaking the exact same text right now
    if (!force && this.isCurrentlySpeaking && normalized && normalized === this.lastSpokenNormalized && now - this.lastSpokenAt < 2000) {
      console.log('[AI Facilitator Voice] Skipping duplicate prompt while already speaking:', cleanText.slice(0, 40));
      if (onEnd) onEnd();
      return;
    }
    this.lastSpokenNormalized = normalized;
    this.lastSpokenAt = now;

    try {
      this.unlock();

      const genId = ++this.speechGenerationId;
      const hadActiveSpeech =
        this.isCurrentlySpeaking ||
        window.speechSynthesis.speaking ||
        window.speechSynthesis.pending;

      if (hadActiveSpeech) {
        try {
          window.speechSynthesis.cancel();
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        } catch {}
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
        if (genId !== this.speechGenerationId) {
          return;
        }
        if (!this.isCurrentlySpeaking || currentIndex >= sentences.length) {
          this.isCurrentlySpeaking = false;
          this.currentUtterance = null;
          this.activeUtterances.clear();
          if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
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
          utterance.rate = 0.96; // Dignified, clear Indian academic cadence
          utterance.pitch = 1.0;

          const voice = this.getIndianFacilitatorVoice();
          if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang || 'en-IN';
          } else {
            utterance.lang = 'en-IN';
          }

          this.activeUtterances.add(utterance);
          this.currentUtterance = utterance;
          (window as any).__activeUtterances = this.activeUtterances;

          let hasAdvanced = false;
          let didStartSpeaking = false;
          let chunkTimeout: any = null;
          let retryTimer: any = null;

          const advance = () => {
            if (hasAdvanced || genId !== this.speechGenerationId) return;
            hasAdvanced = true;
            if (chunkTimeout) {
              clearTimeout(chunkTimeout);
              chunkTimeout = null;
            }
            if (retryTimer) {
              clearTimeout(retryTimer);
              retryTimer = null;
            }
            this.activeUtterances.delete(utterance);
            if (this.currentUtterance === utterance) {
              this.currentUtterance = null;
            }
            speakNextChunk();
          };

          // Generous chunk timeout so long sentences are NEVER cut off mid-sentence
          const wordCount = sentence.split(/\s+/).length;
          const estimatedDuration = Math.max(16000, wordCount * 850 + 4000);
          chunkTimeout = setTimeout(() => {
            console.warn('[AI Facilitator Voice] Safety timeout reached, advancing:', sentence.slice(0, 40));
            advance();
          }, estimatedDuration);

          utterance.onstart = () => {
            didStartSpeaking = true;
          };

          utterance.onend = () => {
            advance();
          };

          utterance.onerror = (e: any) => {
            if (e?.error === 'canceled' || e?.error === 'interrupted') {
              if (genId !== this.speechGenerationId) return;
            }
            console.warn('[AI Facilitator Voice Notice]: chunk event:', e?.error);
            advance();
          };

          // Chromium watchdog & anti-freeze: ping pause & resume every 4s to defeat 14-second stall
          if (this.watchdogInterval) clearInterval(this.watchdogInterval);
          this.watchdogInterval = setInterval(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              if (window.speechSynthesis.speaking) {
                if (window.speechSynthesis.paused) {
                  window.speechSynthesis.resume();
                } else {
                  window.speechSynthesis.pause();
                  window.speechSynthesis.resume();
                }
              } else if (!this.isCurrentlySpeaking) {
                clearInterval(this.watchdogInterval);
                this.watchdogInterval = null;
              }
            }
          }, 4000);

          console.log(`[AI Facilitator Voice] Speaking chunk (${currentIndex}/${sentences.length}):`, sentence, '| Voice:', voice?.name || 'Default');
          window.speechSynthesis.speak(utterance);

          // Ensure unpaused and retry if Windows SAPI silently dropped the utterance
          retryTimer = setTimeout(() => {
            if (genId !== this.speechGenerationId || hasAdvanced) return;
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
              }
              if (!didStartSpeaking && !window.speechSynthesis.speaking) {
                console.log('[AI Facilitator Voice] Utterance not yet speaking, resuming...');
                try {
                  window.speechSynthesis.resume();
                } catch {}
              }
            }
          }, 550);
        } catch (innerErr) {
          console.warn('[AI Facilitator Voice] Inner speak error:', innerErr);
          speakNextChunk();
        }
      };

      // Give Windows SAPI 120ms to settle if we just cancelled prior speech, or 25ms if idle
      setTimeout(() => {
        speakNextChunk();
      }, hadActiveSpeech ? 120 : 25);
    } catch (e) {
      console.warn('Facilitator voice synthesis error:', e);
      this.isCurrentlySpeaking = false;
      if (onEnd) onEnd();
    }
  }

  // Multi-Persona Peer Student Speech in Indian English Accent
  public speakAsStudent(student: VoicePersonaStudent, text: string, onEnd?: () => void) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis || !cleanText) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.unlock();

      const genId = ++this.speechGenerationId;
      const hadActiveSpeech =
        this.isCurrentlySpeaking ||
        window.speechSynthesis.speaking ||
        window.speechSynthesis.pending;

      if (hadActiveSpeech) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }

      this.isCurrentlySpeaking = true;

      setTimeout(() => {
        if (genId !== this.speechGenerationId) return;
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
            utterance.lang = 'en-IN';
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
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('erus-ai-voice-end'));
            }
          };

          const estimatedStudentDuration = Math.max(18000, cleanText.split(/\s+/).length * 800 + 4000);
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
              if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
              }
            } else if (!this.isCurrentlySpeaking) {
              clearInterval(this.watchdogInterval);
              this.watchdogInterval = null;
            }
          }, 4000);

          window.dispatchEvent(new CustomEvent('erus-ai-voice-start'));
          window.speechSynthesis.speak(utterance);

          setTimeout(() => {
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          }, 80);
        } catch (innerErr) {
          console.warn('[AI Student Voice] Speak inner error:', innerErr);
          this.isCurrentlySpeaking = false;
          if (onEnd) onEnd();
        }
      }, hadActiveSpeech ? 140 : 40);
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
    this.speechGenerationId++;
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
