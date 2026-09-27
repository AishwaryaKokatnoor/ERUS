import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, CheckCircle2, VolumeX, Sparkles, RefreshCw } from 'lucide-react';

interface LobbyAudioTesterProps {
  className?: string;
}

export const LobbyAudioTester: React.FC<LobbyAudioTesterProps> = ({ className = '' }) => {
  const [micVolume, setMicVolume] = useState<number>(0);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [micDetectedSpeech, setMicDetectedSpeech] = useState<boolean>(false);
  const [isPlayingChime, setIsPlayingChime] = useState<boolean>(false);
  const [speakerTested, setSpeakerTested] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Microphone Tester
  useEffect(() => {
    let active = true;

    async function startMicTest() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (active) setHasMicPermission(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        micStreamRef.current = stream;
        setHasMicPermission(true);

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const loop = () => {
            if (!analyserRef.current || !active) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 100) * 100));
            setMicVolume(normalized);

            if (normalized > 18) {
              setMicDetectedSpeech(true);
            }

            animFrameRef.current = requestAnimationFrame(loop);
          };

          loop();
        }
      } catch (err) {
        if (active) setHasMicPermission(false);
      }
    }

    startMicTest();

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Play pleasant two-tone test chime through speakers/headphones
  const playTestChime = () => {
    try {
      setIsPlayingChime(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;

      // Note 1: 523.25 Hz (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: 783.99 Hz (G5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.2);
      gain2.gain.setValueAtTime(0.25, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.65);

      setTimeout(() => {
        setIsPlayingChime(false);
        setSpeakerTested(true);
        try {
          ctx.close();
        } catch {}
      }, 700);
    } catch (e) {
      setIsPlayingChime(false);
      console.warn('Audio chime test error:', e);
    }
  };

  const isHardwareReady = (hasMicPermission && micDetectedSpeech) || speakerTested;

  return (
    <div className={`p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/50 shadow-xs ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Section Header & Status */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Pre-Session Hardware Readiness Check
              </span>
              {isHardwareReady ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Audio Ready</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Ready to test
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Verify your microphone and earphones before Faculty starts the discussion.
            </p>
          </div>
        </div>

        {/* Right: Speaker Output Test Button */}
        <button
          type="button"
          onClick={playTestChime}
          disabled={isPlayingChime}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer ${
            speakerTested
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
          }`}
          title="Play a gentle chime through your headphones/speakers"
        >
          {isPlayingChime ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : speakerTested ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          )}
          <span>{isPlayingChime ? 'Playing Chime...' : speakerTested ? 'Speakers Verified' : 'Test Speakers / Chime'}</span>
        </button>
      </div>

      {/* Real-time Microphone VU Meter Bar */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1">
          <Mic className={`w-3.5 h-3.5 shrink-0 transition-colors ${
            micVolume > 15 ? 'text-emerald-600 dark:text-emerald-400 animate-pulse' : 'text-slate-400'
          }`} />
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
            Live Mic Meter:
          </span>

          {/* 10-Segment VU Meter */}
          <div className="flex-1 max-w-xs h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700 flex items-center">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                micVolume > 50
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500'
                  : micVolume > 15
                  ? 'bg-emerald-500'
                  : 'bg-slate-300 dark:bg-slate-600'
              }`}
              style={{ width: `${Math.max(4, micVolume)}%` }}
            />
          </div>

          <span className="text-[10px] font-mono font-bold text-slate-500 w-8 text-right">
            {micVolume}%
          </span>
        </div>

        {/* Helper Hint */}
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          {hasMicPermission === false ? (
            <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
              <VolumeX className="w-3.5 h-3.5" />
              Microphone permission denied. Click "Allow" in your address bar.
            </span>
          ) : micDetectedSpeech ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Microphone working clearly!
            </span>
          ) : (
            <span className="italic">
              Say "Hello" to test your mic sensitivity.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
