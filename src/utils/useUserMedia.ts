import { useState, useEffect, useRef, useCallback } from 'react';

export interface UserMediaControls {
  isCameraOn: boolean;
  videoStream: MediaStream | null;
  toggleCamera: () => Promise<void>;
  cameraError: string | null;
  audioLevel: number;
  audioStream: MediaStream | null;
  startAudioAnalyser: () => Promise<MediaStream | null>;
  stopAudioAnalyser: () => void;
}

export function useUserMedia(): UserMediaControls {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Toggle Camera cleanly without interrupting audio analyzer or microphone
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Turn off camera
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }
      setVideoStream(null);
      setIsCameraOn(false);
      setCameraError(null);
    } else {
      // Turn on camera
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Webcam access not supported in this browser.');
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 320, max: 480 },
              height: { ideal: 240, max: 360 },
              frameRate: { ideal: 15, max: 18 },
              facingMode: 'user',
            },
            audio: false,
          });
        } catch (constraintErr) {
          console.warn('Retrying getUserMedia with basic video constraints for laptop camera compatibility:', constraintErr);
          // Fallback for laptops and USB webcams that reject facingMode or ideal dimensions
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        // Guarantee all tracks are enabled
        stream.getVideoTracks().forEach((t) => {
          t.enabled = true;
        });

        videoStreamRef.current = stream;
        setVideoStream(stream);
        setIsCameraOn(true);
        setCameraError(null);
      } catch (err: any) {
        console.warn('Error accessing webcam:', err);
        setCameraError(err.message || 'Camera permission denied or unavailable');
        setIsCameraOn(false);
      }
    }
  }, [isCameraOn]);

  // Audio level analyser for microphone feedback
  const startAudioAnalyser = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (audioStreamRef.current && audioStreamRef.current.getAudioTracks().some((t) => t.readyState === 'live')) {
        return audioStreamRef.current; // Already running
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;
      setAudioStream(stream);

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close().catch(() => {}); } catch {}
      }
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      audioCtx.onstatechange = () => {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      };

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVolumeUpdate = 0;

      const updateVolume = () => {
        if (!analyserRef.current) return;
        const now = performance.now();
        if (now - lastVolumeUpdate > 100) {
          lastVolumeUpdate = now;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalized = Math.min(100, Math.round((average / 128) * 100));
          setAudioLevel((prev) => (Math.abs(prev - normalized) >= 3 ? normalized : prev));
        }

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
      return stream;
    } catch (e) {
      console.warn('Mic audio analyser setup error:', e);
      return null;
    }
  }, []);

  const stopAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setAudioStream(null);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Cleanup all media tracks STRICTLY on unmount (does NOT stop mic when camera is toggled)
  useEffect(() => {
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }
      stopAudioAnalyser();
    };
  }, [stopAudioAnalyser]);

  return {
    isCameraOn,
    videoStream,
    toggleCamera,
    cameraError,
    audioLevel,
    audioStream,
    startAudioAnalyser,
    stopAudioAnalyser,
  };
}
