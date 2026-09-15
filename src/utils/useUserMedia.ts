import { useState, useEffect, useRef, useCallback } from 'react';

export interface UserMediaControls {
  isCameraOn: boolean;
  videoStream: MediaStream | null;
  toggleCamera: () => Promise<void>;
  cameraError: string | null;
  audioLevel: number;
  startAudioAnalyser: () => Promise<void>;
  stopAudioAnalyser: () => void;
}

export function useUserMedia(): UserMediaControls {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Turn off camera
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
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

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        setVideoStream(stream);
        setIsCameraOn(true);
        setCameraError(null);
      } catch (err: any) {
        console.warn('Error accessing webcam:', err);
        setCameraError(err.message || 'Camera permission denied or unavailable');
        setIsCameraOn(false);
      }
    }
  }, [isCameraOn, videoStream]);

  // Audio level analyser for microphone feedback
  const startAudioAnalyser = useCallback(async () => {
    try {
      if (audioStreamRef.current) return; // Already running

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (e) {
      console.warn('Mic audio analyser setup error:', e);
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
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Cleanup all media tracks on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
      stopAudioAnalyser();
    };
  }, [videoStream, stopAudioAnalyser]);

  return {
    isCameraOn,
    videoStream,
    toggleCamera,
    cameraError,
    audioLevel,
    startAudioAnalyser,
    stopAudioAnalyser,
  };
}
