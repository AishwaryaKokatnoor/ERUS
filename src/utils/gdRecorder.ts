import { useState, useEffect, useRef, useCallback } from 'react';

// Detect best supported audio MIME type
export function getBestSupportedAudioMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

// Detect best supported video MIME type for grid video recording
export function getBestSupportedVideoMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return 'video/webm';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

export interface UploadRecordingResponse {
  success: boolean;
  slotId?: string;
  recordingUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  recordedAt?: string;
  error?: string;
}

/**
 * Upload a recorded GD audio/video Blob directly to the backend storage endpoint.
 */
export async function uploadGDRecording(
  slotId: string,
  blob: Blob,
  durationSeconds: number = 0,
  recordedBy?: string
): Promise<UploadRecordingResponse> {
  if (!slotId) throw new Error('slotId is required to upload GD recording');
  if (!blob || blob.size === 0) throw new Error('Recording blob is empty');

  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'video/webm',
    'x-recording-duration': String(durationSeconds || 0),
  };
  if (recordedBy) {
    headers['x-recorded-by'] = recordedBy;
  }

  const res = await fetch(`/api/sessions/${encodeURIComponent(slotId)}/recording?duration=${durationSeconds}`, {
    method: 'POST',
    headers,
    body: blob,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to upload recording (HTTP ${res.status})`);
  }


  return data;
}

/**
 * Trigger an instant browser file download of the recorded audio/video blob.
 */
export function downloadRecordingLocally(blob: Blob, filename?: string) {
  if (typeof window === 'undefined' || !blob) return;
  const isVideo = blob.type.includes('video');
  const ext = isVideo ? 'webm' : (blob.type.includes('ogg') ? 'ogg' : (blob.type.includes('mp4') ? 'mp4' : 'webm'));
  const safeFilename = filename || `ERUS-GD-Recording-${Date.now()}.${ext}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export interface GDParticipantTile {
  id: string;
  socketId?: string;
  userId?: string;
  name: string;
  college?: string;
  seatNumber?: number;
  isSpeaking?: boolean;
  cameraActive?: boolean;
  isUser?: boolean;
  videoStream?: MediaStream | null;
  avatar?: string;
  turns?: number;
  secondsSpoken?: number;
  isMuted?: boolean;
}

export interface PresentationSlideInfo {
  badge?: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  currentSlideIndex?: number;
  totalSlides?: number;
  slideMode?: 'deck' | 'screen';
  phase?: string;
  presenterName?: string;
  presenterCollege?: string;
  aiGuidance?: string;
}

export interface UseGDRecorderOptions {
  slotId: string;
  isSessionActive: boolean;
  localStream?: MediaStream | null;
  localAudioStream?: MediaStream | null;
  peerStreams?: Map<string, MediaStream>;
  recordVideo?: boolean;
  enabled?: boolean;
  topicTitle?: string;
  currentSpeakerId?: string | null;
  currentSpeakerName?: string | null;
  latestTranscriptText?: string | null;
  layoutMode?: 'round_table' | 'grid' | 'presentation';
  screenStream?: MediaStream | null;
  presentationInfo?: PresentationSlideInfo;
  participantTiles?: GDParticipantTile[];
  autoStartOnActive?: boolean;
  onRecordingComplete?: (recordingUrl: string, blob: Blob) => void;
}

export interface UseGDRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  recordingDurationSeconds: number;
  formattedDuration: string;
  recordingUrl: string | null;
  recordingBlob: Blob | null;
  isUploading: boolean;
  uploadSuccess: boolean;
  uploadError: string | null;
  startRecording: () => Promise<boolean>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  stopAndUploadRecording: (overrideSlotId?: string) => Promise<UploadRecordingResponse | null>;
  downloadLocalCopy: (filename?: string) => void;
}

// Canvas rendering helper functions
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill?: string | CanvasGradient | CanvasPattern,
  stroke?: string,
  strokeWidth = 1
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
}

function drawCameraOffIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size = 14) {
  ctx.save();
  ctx.strokeStyle = '#f87171'; // rose-400
  ctx.lineWidth = 1.8;
  const rw = size * 0.72;
  const rh = size * 0.8;
  ctx.strokeRect(cx - rw / 2 - 1.5, cy - rh / 2, rw, rh);
  // Triangle lens
  ctx.beginPath();
  ctx.moveTo(cx + rw / 2 - 1.5, cy - rh * 0.25);
  ctx.lineTo(cx + rw / 2 + size * 0.35, cy - rh * 0.45);
  ctx.lineTo(cx + rw / 2 + size * 0.35, cy + rh * 0.45);
  ctx.lineTo(cx + rw / 2 - 1.5, cy + rh * 0.25);
  ctx.fillStyle = '#f87171';
  ctx.fill();
  // Diagonal strike-through line
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.6, cy - size * 0.6);
  ctx.lineTo(cx + size * 0.6, cy + size * 0.6);
  ctx.stroke();
  ctx.restore();
}

function drawStatusBadges(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isMicActive: boolean,
  isCameraActive: boolean
) {
  ctx.save();
  // Capsule container matching GD room pod bottom-left badges
  drawRoundedRect(ctx, x, y, 40, 18, 9, 'rgba(15, 23, 42, 0.85)');

  // Mic indicator (left)
  ctx.fillStyle = isMicActive ? '#10b981' : '#ef4444';
  ctx.beginPath();
  ctx.arc(x + 10, y + 9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (!isMicActive) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 6);
    ctx.lineTo(x + 13, y + 12);
    ctx.stroke();
  }

  // Camera indicator (right)
  ctx.fillStyle = isCameraActive ? '#10b981' : '#ef4444';
  ctx.beginPath();
  ctx.arc(x + 30, y + 9, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (!isCameraActive) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 27, y + 6);
    ctx.lineTo(x + 33, y + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function getInitials(name: string): string {
  const cleanName = String(name || '').trim();
  if (!cleanName) return 'S';
  const parts = cleanName.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Unified React hook for recording live Group Discussion video grid & mixed audio.
 * When enabled (typically ONLY on faculty portal), renders an in-browser composite
 * video grid of all students, their webcam feeds, and speaking indicators.
 */
export function useGDRecorder({
  slotId,
  isSessionActive,
  localStream,
  localAudioStream,
  peerStreams,
  recordVideo = true,
  enabled = true,
  topicTitle = 'Group Discussion',
  currentSpeakerId,
  currentSpeakerName,
  latestTranscriptText,
  layoutMode = 'round_table',
  participantTiles = [],
  autoStartOnActive = true,
  onRecordingComplete,
}: UseGDRecorderOptions): UseGDRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const connectedTracksRef = useRef<Set<string>>(new Set());
  const activeSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const avatarImagePoolRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationCounterRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>('');
  const slotIdRef = useRef<string>(slotId);
  const isCheckpointUploadingRef = useRef<boolean>(false);
  const inFlightUploadPromiseRef = useRef<Promise<UploadRecordingResponse | null> | null>(null);

  // Video compositing refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRenderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const hiddenVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const participantTilesRef = useRef<GDParticipantTile[]>(participantTiles);
  const topicTitleRef = useRef<string>(topicTitle);
  const peerStreamsRef = useRef<Map<string, MediaStream> | undefined>(peerStreams);
  const localStreamRef = useRef<MediaStream | null | undefined>(localStream);
  const localAudioStreamRef = useRef<MediaStream | null | undefined>(localAudioStream);
  const currentSpeakerIdRef = useRef<string | null | undefined>(currentSpeakerId);
  const currentSpeakerNameRef = useRef<string | null | undefined>(currentSpeakerName);
  const latestTranscriptTextRef = useRef<string | null | undefined>(latestTranscriptText);
  const layoutModeRef = useRef<'round_table' | 'grid' | 'presentation'>(layoutMode || 'round_table');
  const screenStreamRef = useRef<MediaStream | null | undefined>(screenStream);
  const presentationInfoRef = useRef<PresentationSlideInfo | undefined>(presentationInfo);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Keep refs in sync with latest props
  useEffect(() => {
    slotIdRef.current = slotId;
  }, [slotId]);

  useEffect(() => {
    participantTilesRef.current = participantTiles;
  }, [participantTiles]);

  useEffect(() => {
    topicTitleRef.current = topicTitle;
  }, [topicTitle]);

  useEffect(() => {
    peerStreamsRef.current = peerStreams;
  }, [peerStreams]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    localAudioStreamRef.current = localAudioStream;
  }, [localAudioStream]);

  useEffect(() => {
    currentSpeakerIdRef.current = currentSpeakerId;
  }, [currentSpeakerId]);

  useEffect(() => {
    currentSpeakerNameRef.current = currentSpeakerName;
  }, [currentSpeakerName]);

  useEffect(() => {
    latestTranscriptTextRef.current = latestTranscriptText;
  }, [latestTranscriptText]);

  useEffect(() => {
    layoutModeRef.current = layoutMode || 'round_table';
  }, [layoutMode]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  useEffect(() => {
    presentationInfoRef.current = presentationInfo;
  }, [presentationInfo]);

  // Format seconds to mm:ss
  const formattedDuration = `${Math.floor(recordingDurationSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(recordingDurationSeconds % 60).toString().padStart(2, '0')}`;

  // Helper to connect an audio stream to the mixer destination node with GC immunity
  const mixStreamIntoDestination = useCallback((stream: MediaStream) => {
    if (!audioContextRef.current || !destinationRef.current || !stream) return;
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    if (audioTracks.length === 0) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    for (const track of audioTracks) {
      if (connectedTracksRef.current.has(track.id)) continue;
      try {
        const trackStream = stream.getAudioTracks().length === 1 ? stream : new MediaStream([track]);
        const source = audioContextRef.current.createMediaStreamSource(trackStream);
        source.connect(destinationRef.current);

        // Store in activeSourcesRef to prevent JavaScript garbage collection from killing the stream!
        activeSourcesRef.current.set(track.id, source);
        connectedTracksRef.current.add(track.id);

        track.onended = () => {
          try {
            source.disconnect();
          } catch {}
          activeSourcesRef.current.delete(track.id);
          connectedTracksRef.current.delete(track.id);
        };
      } catch (err) {
        console.warn('[GD Recorder] Failed to connect track to mixer:', track.id, err);
      }
    }
  }, []);

  // Update mixer whenever local stream or peer streams arrive/change
  useEffect(() => {
    if (!enabled || !isRecording) return;
    if (localStream) {
      mixStreamIntoDestination(localStream);
    }
    if (localAudioStream) {
      mixStreamIntoDestination(localAudioStream);
    }
    if (peerStreams) {
      for (const peerStream of peerStreams.values()) {
        mixStreamIntoDestination(peerStream);
      }
    }
  }, [enabled, isRecording, localStream, localAudioStream, peerStreams, mixStreamIntoDestination]);

  // Active audio watchdog: continuously ensure all microphone & peer tracks remain connected throughout recording
  useEffect(() => {
    if (!enabled || !isRecording) return;
    const watchdogInterval = setInterval(() => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      if (localStreamRef.current) mixStreamIntoDestination(localStreamRef.current);
      if (localAudioStreamRef.current) mixStreamIntoDestination(localAudioStreamRef.current);
      if (peerStreamsRef.current) {
        for (const peerStream of peerStreamsRef.current.values()) {
          mixStreamIntoDestination(peerStream);
        }
      }
    }, 1500);

    return () => clearInterval(watchdogInterval);
  }, [enabled, isRecording, mixStreamIntoDestination]);

  // Video rendering loop for authentic GD Room Round Table & Conference Stage
  const startCanvasVideoCompositor = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Helper to resolve and cache the active video stream / DOM element for a tile
    const resolveTileVideo = (tile: GDParticipantTile, isThisUser: boolean) => {
      let resolvedStream = tile.videoStream;
      if (isThisUser && localStreamRef.current && localStreamRef.current.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled)) {
        resolvedStream = localStreamRef.current;
      }
      if (!resolvedStream && isThisUser && localStreamRef.current) {
        resolvedStream = localStreamRef.current;
      }

      if (!resolvedStream || resolvedStream.getVideoTracks().length === 0) {
        const peers = peerStreamsRef.current;
        if (peers && peers.size > 0) {
          if (tile.socketId && peers.has(tile.socketId)) {
            resolvedStream = peers.get(tile.socketId);
          } else if (tile.id && peers.has(tile.id)) {
            resolvedStream = peers.get(tile.id);
          } else if (tile.userId && peers.has(tile.userId)) {
            resolvedStream = peers.get(tile.userId);
          } else {
            for (const [peerKey, stream] of peers.entries()) {
              if (
                (tile.id && (peerKey.includes(tile.id) || tile.id.includes(peerKey))) ||
                (tile.socketId && (peerKey.includes(tile.socketId) || tile.socketId.includes(peerKey))) ||
                (tile.userId && (peerKey.includes(tile.userId) || tile.userId.includes(peerKey)))
              ) {
                resolvedStream = stream;
                break;
              }
            }
          }
          if (!resolvedStream && !tile.id?.includes('empty') && !isThisUser) {
            const livePeerStreams = Array.from(peers.values()).filter(
              (s: any) => s && typeof s.getVideoTracks === 'function' && s.getVideoTracks().some((t: any) => t.readyState === 'live' || t.enabled)
            );
            if (livePeerStreams.length > 0) {
              resolvedStream = livePeerStreams[0] as MediaStream;
            }
          }
        }
      }

      // Look for DOM video
      let domVideo: HTMLVideoElement | null = null;
      if (typeof document !== 'undefined') {
        const allDomVideos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
        domVideo = allDomVideos.find((v) => {
          if (v.hasAttribute('controls') || v.closest('[data-recorder-preview]') || v.closest('.fixed.inset-0')) {
            return false;
          }
          if (isThisUser && (v.getAttribute('data-is-user') === 'true' || (localStreamRef.current && v.srcObject === localStreamRef.current))) {
            return true;
          }
          if (tile.id && v.getAttribute('data-participant-id') === tile.id) {
            return true;
          }
          if (tile.seatNumber && v.getAttribute('data-seat-number') === String(tile.seatNumber)) {
            return true;
          }
          if (resolvedStream && v.srcObject) {
            if (v.srcObject === resolvedStream) return true;
            if ((v.srcObject as MediaStream).id === resolvedStream.id) return true;
            const vTrackId = (v.srcObject as MediaStream).getVideoTracks?.()[0]?.id;
            const rTrackId = resolvedStream.getVideoTracks?.()[0]?.id;
            if (vTrackId && rTrackId && vTrackId === rTrackId) return true;
          }
          return false;
        }) || null;
      }

      // Fallback pooled video element
      let videoEl = videoPoolRef.current.get(tile.id);
      const streamToPlay = resolvedStream || (isThisUser ? localStreamRef.current : null);
      const hasVideoTracks = Boolean(
        streamToPlay && streamToPlay.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled)
      );

      if (streamToPlay && hasVideoTracks && !domVideo) {
        if (!videoEl) {
          videoEl = document.createElement('video');
          videoEl.muted = true;
          videoEl.defaultMuted = true;
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          (videoEl as any).webkitPlaysInline = true;
          videoEl.setAttribute('autoplay', 'true');
          videoEl.setAttribute('playsinline', 'true');
          videoEl.setAttribute('muted', 'true');
          videoEl.width = 320;
          videoEl.height = 240;
          videoEl.style.width = '320px';
          videoEl.style.height = '240px';
          videoEl.style.position = 'fixed';
          videoEl.style.left = '0px';
          videoEl.style.top = '0px';
          videoEl.style.pointerEvents = 'none';

          if (!hiddenVideoContainerRef.current && typeof document !== 'undefined') {
            const container = document.createElement('div');
            container.id = 'erus-gd-recorder-hidden-pool';
            container.style.position = 'fixed';
            container.style.left = '0px';
            container.style.top = '0px';
            container.style.width = '1px';
            container.style.height = '1px';
            container.style.overflow = 'hidden';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '-1';
            document.body.appendChild(container);
            hiddenVideoContainerRef.current = container;
          }
          if (hiddenVideoContainerRef.current) {
            hiddenVideoContainerRef.current.appendChild(videoEl);
          }

          videoEl.srcObject = streamToPlay;
          videoEl.onloadedmetadata = () => { videoEl?.play().catch(() => {}); };
          videoEl.oncanplay = () => { videoEl?.play().catch(() => {}); };
          videoEl.play().catch(() => {});
          videoPoolRef.current.set(tile.id, videoEl);
        } else if (videoEl.srcObject !== streamToPlay) {
          videoEl.srcObject = streamToPlay;
          videoEl.onloadedmetadata = () => { videoEl?.play().catch(() => {}); };
          videoEl.oncanplay = () => { videoEl?.play().catch(() => {}); };
          videoEl.play().catch(() => {});
        } else if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      }

      const activeVideoElement = domVideo || videoEl;
      const isElementUsable = Boolean(
        activeVideoElement &&
        (activeVideoElement.readyState >= 1 || activeVideoElement.videoWidth > 0)
      );

      return { activeVideo: isElementUsable ? activeVideoElement : null };
    };

    // Helper to draw a complete realistic participant pod (matching RealisticGDRoom StudentPodCard)
    const drawParticipantPod = (
      pCtx: CanvasRenderingContext2D,
      tile: GDParticipantTile,
      px: number,
      py: number,
      w: number,
      h: number,
      isUser: boolean,
      activeVideo: HTMLVideoElement | null
    ) => {
      const isSpeaking = Boolean(tile.isSpeaking || (tile.id && tile.id === currentSpeakerIdRef.current));
      const seatNum = tile.seatNumber || 1;

      // 1. Seat Placard Pill (Centered directly above pod card)
      const placardW = isUser ? 94 : 76;
      const placardH = 20;
      const placardX = px + (w - placardW) / 2;
      const placardY = py - 24;

      pCtx.save();
      const placardGrad = pCtx.createLinearGradient(placardX, placardY, placardX + placardW, placardY + placardH);
      if (isSpeaking) {
        placardGrad.addColorStop(0, '#059669');
        placardGrad.addColorStop(1, '#047857');
      } else if (isUser) {
        placardGrad.addColorStop(0, '#6366f1');
        placardGrad.addColorStop(1, '#4f46e5');
      } else {
        placardGrad.addColorStop(0, '#475569');
        placardGrad.addColorStop(1, '#334155');
      }
      drawRoundedRect(
        pCtx,
        placardX,
        placardY,
        placardW,
        placardH,
        6,
        placardGrad,
        isSpeaking ? '#34d399' : (isUser ? '#a5b4fc' : '#64748b'),
        1
      );

      pCtx.fillStyle = '#ffffff';
      pCtx.font = 'bold 9.5px monospace';
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';
      const placardText = isSpeaking
        ? `SEAT ${seatNum} 🎙️`
        : (isUser ? `SEAT ${seatNum} YOU 🔖` : `SEAT ${seatNum}`);
      pCtx.fillText(placardText, placardX + placardW / 2, placardY + placardH / 2);
      pCtx.restore();

      // 2. Speaking Glow Aura (Outside card)
      if (isSpeaking) {
        pCtx.save();
        const auraPulse = Math.sin(Date.now() / 200) * 2;
        drawRoundedRect(
          pCtx,
          px - 5 - auraPulse,
          py - 5 - auraPulse,
          w + 10 + auraPulse * 2,
          h + 10 + auraPulse * 2,
          20,
          undefined,
          'rgba(16, 185, 129, 0.45)',
          3.5
        );
        pCtx.restore();
      }

      // 3. Pod Card Background & Video / Avatar Content
      pCtx.save();
      drawRoundedRect(pCtx, px, py, w, h, 16, '#0f172a');

      let didDrawVideo = false;
      if (activeVideo && (tile.cameraActive !== false)) {
        try {
          pCtx.save();
          clipRoundedRect(pCtx, px, py, w, h, 16);
          const vw = activeVideo.videoWidth || 640;
          const vh = activeVideo.videoHeight || 480;
          const scale = Math.max(w / vw, h / vh);
          const sw = vw * scale;
          const sh = vh * scale;
          const sx = px + (w - sw) / 2;
          const sy = py + (h - sh) / 2;

          if (isUser) {
            // Mirror selfie webcam feed horizontally
            pCtx.translate(px + w, py);
            pCtx.scale(-1, 1);
            pCtx.drawImage(activeVideo, (w - sw) / 2, sy - py, sw, sh);
          } else {
            pCtx.drawImage(activeVideo, sx, sy, sw, sh);
          }
          pCtx.restore();
          didDrawVideo = true;
        } catch {}
      }

      if (!didDrawVideo) {
        // Draw Avatar
        pCtx.save();
        clipRoundedRect(pCtx, px, py, w, h, 16);

        // Gradient slate card background
        const cardBgGrad = pCtx.createLinearGradient(px, py, px + w, py + h);
        cardBgGrad.addColorStop(0, '#64748b');
        cardBgGrad.addColorStop(1, '#475569');
        pCtx.fillStyle = cardBgGrad;
        pCtx.fillRect(px, py, w, h);

        let didDrawImg = false;
        const avatarRaw = tile.avatar || (
          tile.name
            ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tile.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
            : ''
        );
        const avatarUrl = avatarRaw.replace(/\/lorelei\//g, '/avataaars/');

        if (avatarUrl) {
          let img = avatarImagePoolRef.current.get(avatarUrl);
          if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = avatarUrl;
            avatarImagePoolRef.current.set(avatarUrl, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const scale = Math.max(w / iw, h / ih);
            const sw = iw * scale;
            const sh = ih * scale;

            // Inward-facing orientation for human avatars:
            // Table center is at (640, 362).
            // - Bottom participant (dx ≈ 0): Face directly forward/up into the table.
            // - Left participant (dx > 25): Face inward to the right into the table.
            // - Right participant (dx < -25): Face inward to the left into the table.
            const dx = 640 - (px + w / 2);
            const dy = 362 - (py + h / 2);
            const shiftX = Math.max(-10, Math.min(10, dx * 0.05));
            const shiftY = Math.max(-8, Math.min(8, dy * 0.04));

            const sx = px + (w - sw) / 2 + shiftX;
            const sy = py + (h - sh) / 2 + shiftY;
            pCtx.drawImage(img, sx, sy, sw, sh);
            didDrawImg = true;
          }
        }

        if (!didDrawImg) {
          // Initials circle
          const rad = Math.min(w, h) * 0.28;
          const cx = px + w / 2;
          const cy = py + h / 2 - 4;
          pCtx.beginPath();
          pCtx.arc(cx, cy, rad, 0, Math.PI * 2);
          pCtx.fillStyle = isUser ? '#4f46e5' : '#334155';
          pCtx.fill();
          pCtx.strokeStyle = isUser ? '#818cf8' : '#475569';
          pCtx.lineWidth = 1.5;
          pCtx.stroke();

          pCtx.fillStyle = '#ffffff';
          pCtx.font = `bold ${Math.round(rad * 0.85)}px Inter, sans-serif`;
          pCtx.textAlign = 'center';
          pCtx.textBaseline = 'middle';
          pCtx.fillText(getInitials(tile.name), cx, cy);
        }

        // Camera Off watermark indicator if camera is not active
        if (tile.cameraActive === false) {
          pCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
          pCtx.fillRect(px, py, w, h);
          drawCameraOffIcon(pCtx, px + w / 2, py + h / 2, 16);
        }

        pCtx.restore();
      }

      // Card Border: Emerald when speaking, Slate/Blue when quiet
      drawRoundedRect(
        pCtx,
        px,
        py,
        w,
        h,
        16,
        undefined,
        isSpeaking ? '#10b981' : (isUser ? '#3b82f6' : '#cbd5e1'),
        isSpeaking ? 3.5 : 2
      );

      // Status Badges (Bottom-Left Corner of Card: Mic & Cam)
      const isMicLive = Boolean(isSpeaking || (!tile.isMuted && isUser));
      const isCameraLive = Boolean(didDrawVideo || tile.cameraActive !== false);
      drawStatusBadges(pCtx, px + 6, py + h - 22, isMicLive, isCameraLive);

      // Animated Equalizer Bars at bottom-center if speaking
      if (isSpeaking) {
        const eqX = px + w / 2 - 10;
        const eqY = py + h - 8;
        const t = Date.now() / 140;
        pCtx.fillStyle = '#10b981';
        const h1 = 3 + Math.abs(Math.sin(t)) * 9;
        const h2 = 4 + Math.abs(Math.sin(t + 1)) * 12;
        const h3 = 3 + Math.abs(Math.sin(t + 2)) * 8;
        pCtx.fillRect(eqX, eqY - h1, 3.5, h1);
        pCtx.fillRect(eqX + 6, eqY - h2, 3.5, h2);
        pCtx.fillRect(eqX + 12, eqY - h3, 3.5, h3);
      }
      pCtx.restore();

      // 4. Candidate Name & Stats (Below the pod card)
      pCtx.save();
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';

      // Candidate Name
      pCtx.fillStyle = isUser ? '#4338ca' : '#0f172a';
      pCtx.font = 'bold 13px Inter, system-ui, sans-serif';
      const shortName = tile.name.split(' ')[0] || tile.name;
      pCtx.fillText(shortName, px + w / 2, py + h + 14);

      // Turns and Speaking Duration
      pCtx.fillStyle = '#64748b';
      pCtx.font = '10.5px monospace';
      const turnsCount = tile.turns ?? 0;
      const secsSpoken = tile.secondsSpoken ?? 0;
      pCtx.fillText(`${turnsCount} turns • ${secsSpoken}s`, px + w / 2, py + h + 28);
      pCtx.restore();
    };

    const renderFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const rawTiles = participantTilesRef.current.filter((t) => !t.id.includes('empty'));
      const tiles = rawTiles.length > 0 ? rawTiles : [
        {
          id: 'user',
          name: 'Candidate',
          isUser: true,
          seatNumber: 1,
          cameraActive: false,
          turns: 0,
          secondsSpoken: 0,
        }
      ];
      const activeTopic = topicTitleRef.current || 'Group Discussion';
      const N = tiles.length;

      // 1. Studio Backdrop (Modern Light Conference Studio matching GD Room)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#f8fafc');   // clean off-white
      bgGrad.addColorStop(0.5, '#f1f5f9'); // slate-100
      bgGrad.addColorStop(1, '#e2e8f0');   // slate-200
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Soft ambient radial spotlight behind the central round table
      const radialGrad = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, 390);
      radialGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      radialGrad.addColorStop(0.7, 'rgba(241, 245, 249, 0.6)');
      radialGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');
      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 390, 0, Math.PI * 2);
      ctx.fill();

      // 2. Room Header Bar (Top 52px)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, 52);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 52);
      ctx.lineTo(width, 52);
      ctx.stroke();

      // Brand badge (Left)
      const brandIconGrad = ctx.createLinearGradient(16, 10, 48, 42);
      brandIconGrad.addColorStop(0, '#3b82f6');
      brandIconGrad.addColorStop(1, '#2563eb');
      drawRoundedRect(ctx, 16, 10, 32, 32, 8, brandIconGrad);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', 32, 26);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('ERUS-AIGDF', 56, 22);

      // Role tag
      if (layoutModeRef.current === 'presentation') {
        drawRoundedRect(ctx, 160, 13, 76, 18, 5, '#fef3c7', '#fde68a', 1);
        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SEMINAR', 198, 22);
      } else {
        drawRoundedRect(ctx, 160, 13, 62, 18, 5, '#e0e7ff', '#c7d2fe', 1);
        ctx.fillStyle = '#4338ca';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STUDENT', 191, 22);
      }

      // Candidate info subtitle
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const firstUser = tiles.find((t) => t.isUser) || tiles[0];
      const candidateInfo = layoutModeRef.current === 'presentation'
        ? (firstUser ? `${firstUser.name}${firstUser.college ? ` • ${firstUser.college}` : ''}` : 'Classroom Presentation')
        : (firstUser ? `${firstUser.name}${firstUser.college ? ` • ${firstUser.college}` : ''}` : 'Group Discussion Session');
      ctx.fillText(candidateInfo, 56, 38);

      // Center navigation pill
      if (layoutModeRef.current === 'presentation') {
        drawRoundedRect(ctx, width / 2 - 110, 11, 220, 30, 15, '#d97706', '#f59e0b', 1);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('((•)) Classroom Seminar Hall', width / 2, 26);
      } else {
        drawRoundedRect(ctx, width / 2 - 80, 11, 160, 30, 15, '#059669', '#10b981', 1);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('((•)) Live GD Room', width / 2, 26);
      }

      // Right: Live REC Indicator & Slot info
      const timerSecs = durationCounterRef.current;
      const timerText = `${Math.floor(timerSecs / 60)
        .toString()
        .padStart(2, '0')}:${(timerSecs % 60).toString().padStart(2, '0')}`;

      drawRoundedRect(ctx, width - 170, 11, 154, 30, 8, '#f8fafc', '#e2e8f0', 1);
      const isBlinkOn = Math.floor(Date.now() / 600) % 2 === 0;
      ctx.fillStyle = isBlinkOn ? '#ef4444' : '#f87171';
      ctx.beginPath();
      ctx.arc(width - 152, 26, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`REC ${timerText}`, width - 140, 26);

      ctx.fillStyle = '#64748b';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`(${tiles.length} P)`, width - 58, 26);

      // Update screen video element if live screen share is provided
      const liveScreenStream = screenStreamRef.current;
      let screenVideoEl = screenVideoRef.current;
      if (liveScreenStream && liveScreenStream.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled)) {
        if (!screenVideoEl && typeof document !== 'undefined') {
          screenVideoEl = document.createElement('video');
          screenVideoEl.muted = true;
          screenVideoEl.defaultMuted = true;
          screenVideoEl.autoplay = true;
          screenVideoEl.playsInline = true;
          screenVideoEl.width = 640;
          screenVideoEl.height = 360;
          screenVideoEl.style.position = 'fixed';
          screenVideoEl.style.left = '0px';
          screenVideoEl.style.top = '0px';
          screenVideoEl.style.width = '1px';
          screenVideoEl.style.height = '1px';
          screenVideoEl.style.opacity = '0';
          screenVideoEl.style.pointerEvents = 'none';
          if (hiddenVideoContainerRef.current) hiddenVideoContainerRef.current.appendChild(screenVideoEl);
          screenVideoRef.current = screenVideoEl;
        }
        if (screenVideoEl) {
          if (screenVideoEl.srcObject !== liveScreenStream) {
            screenVideoEl.srcObject = liveScreenStream;
            screenVideoEl.play().catch(() => {});
          } else if (screenVideoEl.paused) {
            screenVideoEl.play().catch(() => {});
          }
        }
      }

      // 3. Stage Layout: Presentation Seminar Hall vs Round Table vs Grid
      if (layoutModeRef.current === 'presentation') {
        // --- 3A. CLASSROOM PRESENTATION SEMINAR HALL STAGE ---
        // (Matching ClassroomPresentationRoom layout: Projector Screen / Slides on Left, Presenter Podium on Right, Audience Desks on Bottom)
        const presInfo = presentationInfoRef.current;
        const currentPresenterName = presInfo?.presenterName || currentSpeakerNameRef.current || (firstUser?.name || 'Candidate');
        const currentPresenterCollege = presInfo?.presenterCollege || (firstUser?.college || 'Department of Computer Science & Engineering');
        const currentPhase = presInfo?.phase || 'presenting';
        const slideBadge = presInfo?.badge || `SLIDE ${presInfo?.currentSlideIndex || 1} OF ${presInfo?.totalSlides || 3}`;
        const slideTitle = presInfo?.title || activeTopic;
        const slideSubtitle = presInfo?.subtitle || 'Key research findings, implementation architecture, and analysis.';
        const slideBullets = presInfo?.bullets && presInfo.bullets.length > 0 ? presInfo.bullets : [
          'Detailed methodology, computational workflow, and core algorithmic specifications.',
          'Comprehensive performance metrics, empirical benchmarks, and validation standards.',
          'Scalability paradigms, strategic takeaways, and production readiness evaluation.'
        ];
        const aiGuidance = presInfo?.aiGuidance || 'Presenter is delivering the scheduled seminar topic. Clear articulated perspectives will be evaluated.';

        // Find active presenter tile
        const presenterTile = tiles.find((t) => t.id === currentSpeakerIdRef.current) ||
                              tiles.find((t) => t.isUser) ||
                              tiles[0];
        const isPresenterUser = Boolean(
          presenterTile && (presenterTile.isUser || presenterTile.name === 'You' || presenterTile.id?.includes('user'))
        );

        // --- SECTION 1: Whiteboard / Projector Screen (Left 730px) ---
        const sX = 24;
        const sY = 60;
        const sW = 730;
        const sH = 480;

        // Whiteboard Shadow & Box
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 4;
        drawRoundedRect(ctx, sX, sY, sW, sH, 18, '#ffffff', '#cbd5e1', 1.5);
        ctx.restore();

        // Projector Top Amber Accent Strip
        ctx.save();
        clipRoundedRect(ctx, sX, sY, sW, sH, 18);
        const accentGrad = ctx.createLinearGradient(sX, sY, sX + sW, sY);
        accentGrad.addColorStop(0, '#f59e0b');
        accentGrad.addColorStop(0.5, '#fbbf24');
        accentGrad.addColorStop(1, '#d97706');
        ctx.fillStyle = accentGrad;
        ctx.fillRect(sX, sY, sW, 5);
        ctx.restore();

        // Projector Header Row:
        // Left Badge: Classroom Seminar Screen
        drawRoundedRect(ctx, sX + 16, sY + 14, 180, 24, 12, '#fef3c7', '#fde68a', 1);
        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🖥️ Classroom Seminar Screen', sX + 16 + 90, sY + 26);

        // Center Badge: Slide badge (e.g. SLIDE 1 OF 3 • RESEARCH PROBLEM)
        const slideBadgeW = 200;
        drawRoundedRect(ctx, sX + 210, sY + 14, slideBadgeW, 24, 12, '#eff6ff', '#bfdbfe', 1);
        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(slideBadge, sX + 210 + slideBadgeW / 2, sY + 26);

        // Right Timer: 08:00 Min
        const timerPillW = 120;
        drawRoundedRect(ctx, sX + sW - 16 - timerPillW, sY + 14, timerPillW, 24, 8, '#f8fafc', '#e2e8f0', 1);
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`⏱️ ${timerText} / 08:00`, sX + sW - 16 - timerPillW / 2, sY + 26);

        // Topic Title Heading
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxTitleW = sW - 32;
        const topicWords = activeTopic.split(' ');
        let titleLine1 = '';
        let titleLine2 = '';
        for (const w of topicWords) {
          const test = titleLine1 ? `${titleLine1} ${w}` : w;
          if (ctx.measureText(test).width > maxTitleW && titleLine1) {
            titleLine2 = titleLine2 ? `${titleLine2} ${w}` : w;
          } else if (!titleLine2) {
            titleLine1 = test;
          } else {
            titleLine2 = `${titleLine2} ${w}`;
          }
        }
        if (titleLine2 && ctx.measureText(titleLine2).width > maxTitleW) {
          titleLine2 = titleLine2.substring(0, 48) + '...';
        }
        if (titleLine2) {
          ctx.fillText(`"${titleLine1}`, sX + 18, sY + 54);
          ctx.fillText(`${titleLine2}"`, sX + 18, sY + 74);
        } else {
          ctx.fillText(`"${titleLine1}"`, sX + 18, sY + 60);
        }

        // Slide Content Area: Screen Share or Slide Deck Card
        const cBoxX = sX + 16;
        const cBoxY = sY + (titleLine2 ? 96 : 84);
        const cBoxW = sW - 32;
        const cBoxH = sH - (titleLine2 ? 96 : 84) - 72;

        let drewScreenVideo = false;
        if (screenVideoEl && (screenVideoEl.readyState >= 1 || screenVideoEl.videoWidth > 0)) {
          try {
            ctx.save();
            clipRoundedRect(ctx, cBoxX, cBoxY, cBoxW, cBoxH, 14);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(cBoxX, cBoxY, cBoxW, cBoxH);

            const vW = screenVideoEl.videoWidth || 1280;
            const vH = screenVideoEl.videoHeight || 720;
            const scale = Math.min(cBoxW / vW, cBoxH / vH);
            const sw = vW * scale;
            const sh = vH * scale;
            const sx = cBoxX + (cBoxW - sw) / 2;
            const sy = cBoxY + (cBoxH - sh) / 2;
            ctx.drawImage(screenVideoEl, sx, sy, sw, sh);

            // Screen Share Badge
            drawRoundedRect(ctx, cBoxX + 12, cBoxY + 12, 130, 22, 6, '#f59e0b', undefined, 0);
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('● Live Screen Share', cBoxX + 12 + 65, cBoxY + 23);

            ctx.restore();
            drewScreenVideo = true;
          } catch {}
        }

        if (!drewScreenVideo) {
          // Slide Deck Card
          drawRoundedRect(ctx, cBoxX, cBoxY, cBoxW, cBoxH, 14, '#f8fafc', '#e2e8f0', 1);

          // Slide Title
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 16px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(slideTitle, cBoxX + 18, cBoxY + 16);

          // Slide Subtitle
          ctx.fillStyle = '#64748b';
          ctx.font = '12px Inter, sans-serif';
          ctx.fillText(slideSubtitle, cBoxX + 18, cBoxY + 40);

          // Divider
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cBoxX + 18, cBoxY + 62);
          ctx.lineTo(cBoxX + cBoxW - 18, cBoxY + 62);
          ctx.stroke();

          // Bullets
          const bulletStartY = cBoxY + 74;
          const bulletSpacing = 52;
          slideBullets.slice(0, 3).forEach((bulletText, bIdx) => {
            const bY = bulletStartY + bIdx * bulletSpacing;
            // Bullet icon badge
            drawRoundedRect(ctx, cBoxX + 18, bY, 20, 20, 6, '#fef3c7', '#fde68a', 1);
            ctx.fillStyle = '#b45309';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', cBoxX + 28, bY + 10);

            // Bullet text (wrap up to 2 lines)
            ctx.fillStyle = '#334155';
            ctx.font = '500 12.5px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const maxBulletW = cBoxW - 64;
            const bWords = bulletText.split(' ');
            let bLine1 = '';
            let bLine2 = '';
            for (const bw of bWords) {
              const testB = bLine1 ? `${bLine1} ${bw}` : bw;
              if (ctx.measureText(testB).width > maxBulletW && bLine1) {
                bLine2 = bLine2 ? `${bLine2} ${bw}` : bw;
              } else if (!bLine2) {
                bLine1 = testB;
              } else {
                bLine2 = `${bLine2} ${bw}`;
              }
            }
            if (bLine2 && ctx.measureText(bLine2).width > maxBulletW) {
              bLine2 = bLine2.substring(0, 50) + '...';
            }
            ctx.fillText(bLine1, cBoxX + 46, bY + 1);
            if (bLine2) {
              ctx.fillText(bLine2, cBoxX + 46, bY + 18);
            }
          });
        }

        // AI Guidance Banner at bottom of whiteboard
        const gBoxY = sY + sH - 56;
        drawRoundedRect(ctx, sX + 16, gBoxY, sW - 32, 44, 10, '#fffbeb', '#fde68a', 1);
        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('✨ AI Seminar Facilitator Guidance:', sX + 26, gBoxY + 7);

        ctx.fillStyle = '#78350f';
        ctx.font = 'italic 11px Inter, sans-serif';
        const cleanGuidance = aiGuidance.replace(/^[\s"']+|[\s"']+$/g, '');
        const maxGuidanceW = sW - 56;
        const truncatedGuidance = ctx.measureText(cleanGuidance).width > maxGuidanceW
          ? cleanGuidance.substring(0, 75) + '...'
          : cleanGuidance;
        ctx.fillText(`"${truncatedGuidance}"`, sX + 26, gBoxY + 23);

        // --- SECTION 2: Presenter Lectern / Podium Structure (Right 492px) ---
        const pX = 770;
        const pY = 60;
        const pW = 486;
        const pH = 480;

        // Podium Frame
        ctx.save();
        ctx.shadowColor = 'rgba(245, 158, 11, 0.12)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 4;
        const podiumGrad = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
        podiumGrad.addColorStop(0, '#fffbeb');
        podiumGrad.addColorStop(0.5, '#fef3c7');
        podiumGrad.addColorStop(1, '#fde68a');
        drawRoundedRect(ctx, pX, pY, pW, pH, 20, podiumGrad, '#fcd34d', 2);
        ctx.restore();

        // Top Lectern Microphone Placard
        const lecternW = 270;
        drawRoundedRect(ctx, pX + (pW - lecternW) / 2, pY + 12, lecternW, 26, 13, '#fef08a', '#facc15', 1);
        ctx.fillStyle = '#713f12';
        ctx.font = 'bold 10.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎙️ SEMINAR LECTERN • PRESENTER PODIUM', pX + pW / 2, pY + 25);

        // Presenter Video Box
        const vX = pX + 20;
        const vY = pY + 48;
        const vW = pW - 40;
        const vH = 266;

        drawRoundedRect(ctx, vX, vY, vW, vH, 16, '#0f172a', '#f59e0b', 3);

        const { activeVideo } = resolveTileVideo(presenterTile, isPresenterUser);
        let drewPresenterVideo = false;
        if (activeVideo && presenterTile.cameraActive !== false) {
          try {
            ctx.save();
            clipRoundedRect(ctx, vX, vY, vW, vH, 16);
            const vw = activeVideo.videoWidth || 640;
            const vh = activeVideo.videoHeight || 480;
            const scale = Math.max(vW / vw, vH / vh);
            const sw = vw * scale;
            const sh = vh * scale;
            const sx = vX + (vW - sw) / 2;
            const sy = vY + (vH - sh) / 2;

            if (isPresenterUser) {
              ctx.translate(vX + vW, vY);
              ctx.scale(-1, 1);
              ctx.drawImage(activeVideo, (vW - sw) / 2, sy - vY, sw, sh);
            } else {
              ctx.drawImage(activeVideo, sx, sy, sw, sh);
            }
            ctx.restore();
            drewPresenterVideo = true;
          } catch {}
        }

        if (!drewPresenterVideo) {
          // Draw Avatar inside Video Box
          ctx.save();
          clipRoundedRect(ctx, vX, vY, vW, vH, 16);
          const avGrad = ctx.createLinearGradient(vX, vY, vX + vW, vY + vH);
          avGrad.addColorStop(0, '#334155');
          avGrad.addColorStop(1, '#1e293b');
          ctx.fillStyle = avGrad;
          ctx.fillRect(vX, vY, vW, vH);

          const avatarUrl = presenterTile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(presenterTile.name || 'presenter')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
          let img = avatarImagePoolRef.current.get(avatarUrl);
          if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = avatarUrl;
            avatarImagePoolRef.current.set(avatarUrl, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const scale = Math.min(vW / iw, vH / ih) * 0.9;
            const sw = iw * scale;
            const sh = ih * scale;
            ctx.drawImage(img, vX + (vW - sw) / 2, vY + (vH - sh) / 2, sw, sh);
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 48px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const initials = (presenterTile.name || 'P').split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
            ctx.fillText(initials, vX + vW / 2, vY + vH / 2);
          }
          ctx.restore();
        }

        // Overlay inside bottom of video box (Name & Live Mic status)
        ctx.save();
        clipRoundedRect(ctx, vX, vY, vW, vH, 16);
        const ovGrad = ctx.createLinearGradient(vX, vY + vH - 42, vX, vY + vH);
        ovGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
        ovGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
        ctx.fillStyle = ovGrad;
        ctx.fillRect(vX, vY + vH - 42, vW, 42);

        // Presenter Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const pDispName = isPresenterUser ? `${presenterTile.name} (You)` : presenterTile.name;
        ctx.fillText(pDispName, vX + 14, vY + vH - 20);

        // Mic Status Badge (Right)
        const isPresMicOn = !presenterTile.isMuted;
        const micBadgeW = isPresMicOn ? 86 : 82;
        const micBadgeX = vX + vW - micBadgeW - 12;
        const micBadgeY = vY + vH - 31;
        drawRoundedRect(
          ctx,
          micBadgeX,
          micBadgeY,
          micBadgeW,
          22,
          11,
          isPresMicOn ? '#059669' : '#dc2626',
          isPresMicOn ? '#34d399' : '#f87171',
          1
        );
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isPresMicOn ? '🎙️ LIVE MIC' : '🔇 MUTED', micBadgeX + micBadgeW / 2, micBadgeY + 11);
        ctx.restore();

        // Presenter Details Below Video
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 17px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentPresenterName, pX + pW / 2, pY + 338);

        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(currentPresenterCollege, pX + pW / 2, pY + 360);

        // Phase Action Pill (Delivering Presentation / Q&A)
        let phaseText = '🎤 DELIVERING PRESENTATION (08:00 MIN MAX)';
        let phaseBg = '#fef3c7';
        let phaseBorder = '#f59e0b';
        let phaseColor = '#92400e';
        if (currentPhase === 'peer_qa') {
          phaseText = '❓ PEER QUESTIONS & ANSWERS SESSION';
          phaseBg = '#eff6ff';
          phaseBorder = '#3b82f6';
          phaseColor = '#1e40af';
        } else if (currentPhase === 'ai_qa') {
          phaseText = '🤖 AI INSTRUCTOR DEFENSE EVALUATION';
          phaseBg = '#f5f3ff';
          phaseBorder = '#8b5cf6';
          phaseColor = '#5b21b6';
        } else if (currentPhase === 'concluded') {
          phaseText = '✅ PRESENTATION DEFENSE CONCLUDED';
          phaseBg = '#ecfdf5';
          phaseBorder = '#10b981';
          phaseColor = '#065f46';
        }
        const phasePillW = 320;
        drawRoundedRect(ctx, pX + (pW - phasePillW) / 2, pY + 386, phasePillW, 30, 15, phaseBg, phaseBorder, 1.2);
        ctx.fillStyle = phaseColor;
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(phaseText, pX + pW / 2, pY + 401);

        // --- SECTION 3: Classroom Audience / Connected Participants Row (Bottom) ---
        const aX = 24;
        const aY = 552;
        const aW = 1232;
        const aH = 106;

        drawRoundedRect(ctx, aX, aY, aW, aH, 16, '#ffffff', '#e2e8f0', 1.5);

        // Header label
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11.5px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`👥 Seminar Participants (${tiles.length} Connected Candidates)`, aX + 16, aY + 16);

        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Classroom Desks • Real Enrolled Candidates', aX + aW - 16, aY + 16);

        // Distribute student cards
        const maxDisplayStudents = Math.min(6, tiles.length);
        const cardGap = 12;
        const cardW = Math.min(190, (aW - 32 - (maxDisplayStudents - 1) * cardGap) / maxDisplayStudents);
        const cardH = 64;
        const cardStartY = aY + 30;

        tiles.slice(0, 6).forEach((st, idx) => {
          const cX = aX + 16 + idx * (cardW + cardGap);
          const isStPresenter = st.id === presenterTile.id || idx === 0;
          const isStUser = Boolean(st.isUser || st.name === 'You');

          const cardBg = isStPresenter ? '#fffbeb' : (isStUser ? '#eff6ff' : '#f8fafc');
          const cardStroke = isStPresenter ? '#f59e0b' : (isStUser ? '#93c5fd' : '#e2e8f0');
          drawRoundedRect(ctx, cX, cardStartY, cardW, cardH, 12, cardBg, cardStroke, isStPresenter ? 2 : 1);

          // Mini Avatar Circle (x: cX + 8, y: cardStartY + 14, d: 36)
          const avD = 36;
          const avX = cX + 8;
          const avY = cardStartY + (cardH - avD) / 2;

          ctx.save();
          ctx.beginPath();
          ctx.arc(avX + avD / 2, avY + avD / 2, avD / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = '#475569';
          ctx.fillRect(avX, avY, avD, avD);

          const { activeVideo: stVideo } = resolveTileVideo(st, isStUser);
          if (stVideo && st.cameraActive !== false) {
            try {
              if (isStUser) {
                ctx.translate(avX + avD, avY);
                ctx.scale(-1, 1);
                ctx.drawImage(stVideo, 0, 0, avD, avD);
              } else {
                ctx.drawImage(stVideo, avX, avY, avD, avD);
              }
            } catch {}
          } else {
            const stAvatarUrl = st.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(st.name || String(idx + 1))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
            let sImg = avatarImagePoolRef.current.get(stAvatarUrl);
            if (!sImg) {
              sImg = new Image();
              sImg.crossOrigin = 'anonymous';
              sImg.src = stAvatarUrl;
              avatarImagePoolRef.current.set(stAvatarUrl, sImg);
            }
            if (sImg.complete && sImg.naturalWidth > 0) {
              ctx.drawImage(sImg, avX, avY, avD, avD);
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText((st.name || 'S').substring(0, 1), avX + avD / 2, avY + avD / 2);
            }
          }
          ctx.restore();

          // Small mic status dot on avatar
          const isStMicActive = !st.isMuted;
          ctx.beginPath();
          ctx.arc(avX + avD - 4, avY + avD - 4, 5, 0, Math.PI * 2);
          ctx.fillStyle = isStMicActive ? '#10b981' : '#f43f5e';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Student Details on right
          const textX = avX + avD + 8;
          const maxTextW = cardW - (avD + 18);

          // Seat number & Badge
          ctx.fillStyle = '#475569';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const seatLabel = `#${st.seatNumber || idx + 1}`;
          ctx.fillText(seatLabel, textX, cardStartY + 10);

          if (isStPresenter) {
            drawRoundedRect(ctx, textX + 22, cardStartY + 9, 44, 14, 4, '#f59e0b', undefined, 0);
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Podium', textX + 44, cardStartY + 10);
          } else if (isStUser) {
            drawRoundedRect(ctx, textX + 22, cardStartY + 9, 32, 14, 4, '#4f46e5', undefined, 0);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('You', textX + 38, cardStartY + 10);
          }

          // Student Name
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.textAlign = 'left';
          let stNameTrunc = st.name || `Student ${idx + 1}`;
          if (ctx.measureText(stNameTrunc).width > maxTextW) {
            stNameTrunc = stNameTrunc.substring(0, 12) + '...';
          }
          ctx.fillText(stNameTrunc, textX, cardStartY + 27);

          // College or status
          ctx.fillStyle = '#64748b';
          ctx.font = '9px Inter, sans-serif';
          ctx.fillText(isStMicActive ? '🎙️ Speaking' : 'Listening', textX, cardStartY + 44);
        });
      } else if (isRoundTable) {
        // --- 3B. ROUND TABLE CONFERENCE STAGE ---
        const CX = width / 2;
        const CY = 362;

        // Determine dynamic table radius and orbit
        const rOuter = N > 8 ? 160 : N > 4 ? 168 : 175;
        const rDashed = rOuter - 14;
        const rInner = rDashed - 12;

        // Outer Table Rim with drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 6;
        const tableRimGrad = ctx.createLinearGradient(CX, CY - rOuter, CX, CY + rOuter);
        tableRimGrad.addColorStop(0, '#f1f5f9');
        tableRimGrad.addColorStop(0.5, '#e2e8f0');
        tableRimGrad.addColorStop(1, '#cbd5e1');
        ctx.fillStyle = tableRimGrad;
        ctx.beginPath();
        ctx.arc(CX, CY, rOuter, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // Concentric dashed perimeter accent ring
        ctx.save();
        ctx.strokeStyle = 'rgba(165, 180, 252, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(CX, CY, rDashed, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Inner clean white conference table surface
        ctx.save();
        const tableTopGrad = ctx.createRadialGradient(CX, CY, 10, CX, CY, rInner);
        tableTopGrad.addColorStop(0, '#ffffff');
        tableTopGrad.addColorStop(0.85, '#ffffff');
        tableTopGrad.addColorStop(1, '#f8fafc');
        ctx.fillStyle = tableTopGrad;
        ctx.beginPath();
        ctx.arc(CX, CY, rInner, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Information inside Round Table Center
        // Text 1: ROUND TABLE (N PARTICIPANT(S))
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const partLabel = `ROUND TABLE (${N} ${N === 1 ? 'PARTICIPANT' : 'PARTICIPANTS'})`;
        ctx.fillText(partLabel, CX, CY - 42);

        // Text 2: Topic Title (Multi-line wrap)
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 17px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const words = activeTopic.split(' ');
        const lines: string[] = [];
        let curLine = '';
        for (const w of words) {
          const test = curLine ? `${curLine} ${w}` : w;
          if (ctx.measureText(test).width > 220 && curLine) {
            lines.push(curLine);
            curLine = w;
          } else {
            curLine = test;
          }
        }
        if (curLine) lines.push(curLine);
        const displayLines = lines.slice(0, 2);
        if (lines.length > 2) {
          displayLines[1] = displayLines[1].substring(0, 18) + '...';
        }

        if (displayLines.length === 1) {
          ctx.fillText(displayLines[0], CX, CY - 10);
        } else {
          ctx.fillText(displayLines[0], CX, CY - 18);
          ctx.fillText(displayLines[1], CX, CY + 4);
        }

        // Text 3: Floor Status Pill
        const floorPillY = CY + 36;
        const activeSpeakerTile = tiles.find((t) => t.isSpeaking || t.id === currentSpeakerIdRef.current);
        const floorText = activeSpeakerTile
          ? `Floor: ${activeSpeakerTile.name.split(' ')[0]}`
          : (currentSpeakerNameRef.current ? `Floor: ${currentSpeakerNameRef.current.split(' ')[0]}` : 'Floor: Open');
        const floorPillW = 126;
        drawRoundedRect(ctx, CX - floorPillW / 2, floorPillY - 12, floorPillW, 24, 12, '#f1f5f9', '#cbd5e1', 1);

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(CX - floorPillW / 2 + 16, floorPillY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(floorText, CX - floorPillW / 2 + 26, floorPillY);

        // --- Seating Perimeter: Radially Positioned Around Round Table ---
        const userIdx = tiles.findIndex(
          (t) => t.isUser || t.name === 'You' || t.id?.includes('user') || t.id === 'speaker-user'
        );
        const baseOffset = userIdx >= 0 ? userIdx : 0;

        let podW = 140;
        let podH = 124;
        let rOrbit = 246;

        if (N <= 2) {
          podW = 136;
          podH = 120;
          rOrbit = 240;
        } else if (N <= 4) {
          podW = 124;
          podH = 110;
          rOrbit = 226;
        } else if (N <= 8) {
          podW = 104;
          podH = 92;
          rOrbit = 220;
        } else {
          podW = 88;
          podH = 78;
          rOrbit = 215;
        }

        tiles.forEach((tile, idx) => {
          const isThisUser = Boolean(
            tile.isUser ||
            tile.name === 'You' ||
            tile.id?.includes('user') ||
            tile.id === 'speaker-user' ||
            (tiles.length === 1 && !tile.id?.startsWith('peer-'))
          );

          let angle: number;
          if (N === 1) {
            angle = Math.PI / 2; // Anchored directly at bottom center
          } else {
            const relativeIdx = (idx - baseOffset + N) % N;
            angle = Math.PI / 2 + (relativeIdx * 2 * Math.PI) / N;
          }

          const px = CX + rOrbit * Math.cos(angle) - podW / 2;
          const py = CY + rOrbit * Math.sin(angle) - podH / 2;

          const { activeVideo } = resolveTileVideo(tile, isThisUser);
          drawParticipantPod(ctx, tile, px, py, podW, podH, isThisUser, activeVideo);
        });
      } else {
        // --- 3C. BALANCED GRID STAGE FALLBACK ---
        const margin = 28;
        const gap = 16;
        const headerH = 64;
        const gridW = width - margin * 2;
        const gridH = height - headerH - margin * 2;

        let cols = 1;
        let rows = 1;
        if (N === 1) {
          cols = 1;
          rows = 1;
        } else if (N <= 2) {
          cols = 2;
          rows = 1;
        } else if (N <= 4) {
          cols = 2;
          rows = 2;
        } else if (N <= 6) {
          cols = 3;
          rows = 2;
        } else {
          cols = 4;
          rows = 2;
        }

        const tileW = Math.min(360, (gridW - (cols - 1) * gap) / cols);
        const tileH = Math.min(260, (gridH - (rows - 1) * gap) / rows);
        const totalGridW = cols * tileW + (cols - 1) * gap;
        const totalGridH = rows * tileH + (rows - 1) * gap;
        const offsetX = margin + (gridW - totalGridW) / 2;
        const offsetY = headerH + margin + (gridH - totalGridH) / 2;

        tiles.forEach((tile, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const px = offsetX + col * (tileW + gap);
          const py = offsetY + row * (tileH + gap);
          const isThisUser = Boolean(
            tile.isUser ||
            tile.name === 'You' ||
            tile.id?.includes('user') ||
            tile.id === 'speaker-user' ||
            (tiles.length === 1 && !tile.id?.startsWith('peer-'))
          );
          const { activeVideo } = resolveTileVideo(tile, isThisUser);
          drawParticipantPod(ctx, tile, px, py, tileW, tileH - 36, isThisUser, activeVideo);
        });
      }

      // 4. Live Discussion Closed Caption / Subtitle Bar (Bottom Center)
      const currentSpeaker = tiles.find(
        (t) => t.isSpeaking || (t.id && t.id === currentSpeakerIdRef.current)
      );
      const speechText =
        latestTranscriptTextRef.current ||
        (currentSpeaker ? `${currentSpeaker.name.split(' ')[0]} is speaking...` : null);

      if (speechText) {
        const capW = Math.min(840, width - 48);
        const capH = 34;
        const capX = (width - capW) / 2;
        const capY = height - 42;

        drawRoundedRect(ctx, capX, capY, capW, capH, 17, 'rgba(15, 23, 42, 0.9)', 'rgba(255, 255, 255, 0.18)', 1);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const spkTag = currentSpeaker ? `🎙️ ${currentSpeaker.name.split(' ')[0]}: ` : '🎙️ Live: ';
        ctx.fillText(spkTag, capX + 16, capY + capH / 2);

        const tagW = ctx.measureText(spkTag).width;
        ctx.fillStyle = '#f8fafc';
        ctx.font = '11px Inter, sans-serif';
        const cleanSpeech = speechText.replace(/^[\s"']+|[\s"']+$/g, '');
        const maxQuoteW = capW - tagW - 32;
        const truncatedSpeech =
          ctx.measureText(cleanSpeech).width > maxQuoteW
            ? cleanSpeech.substring(0, 95) + '...'
            : cleanSpeech;
        ctx.fillText(`"${truncatedSpeech}"`, capX + 16 + tagW, capY + capH / 2);
      }
    };

    // Render the initial frame synchronously so the canvas has valid content immediately
    renderFrame();

    // Continue running at 20 FPS (every 50ms)
    videoRenderIntervalRef.current = setInterval(renderFrame, 50);
  }, []);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    // If recording is disabled (e.g. on student portal), do not run
    if (!enabled) {
      return false;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      return true; // Already recording
    }

    try {
      chunksRef.current = [];
      durationCounterRef.current = 0;
      setRecordingDurationSeconds(0);
      setRecordingBlob(null);
      setRecordingUrl(null);
      setUploadSuccess(false);
      setUploadError(null);

      // 1. Setup AudioContext & Destination
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      audioContextRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      destinationRef.current = dest;
      connectedTracksRef.current.clear();

      // 2. Mix available streams (local user + peers)
      if (localAudioStream && localAudioStream.getAudioTracks().length > 0) {
        mixStreamIntoDestination(localAudioStream);
      } else if (localStream && localStream.getAudioTracks().length > 0) {
        mixStreamIntoDestination(localStream);
      } else {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          mixStreamIntoDestination(mic);
        } catch (micErr) {
          console.warn('[GD Recorder] Mic stream fallback skipped:', micErr);
        }
      }

      if (peerStreams) {
        for (const peerStream of peerStreams.values()) {
          mixStreamIntoDestination(peerStream);
        }
      }

      const activeScreen = screenStreamRef.current || (typeof screenStream !== 'undefined' ? screenStream : null);
      if (activeScreen && typeof activeScreen.getAudioTracks === 'function' && activeScreen.getAudioTracks().length > 0) {
        mixStreamIntoDestination(activeScreen);
      }

      // If no tracks connected yet, create an oscillator silence track so MediaRecorder doesn't error
      if (connectedTracksRef.current.size === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0; // silent
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
      }

      let recordingStream: MediaStream;
      let chosenMime = '';

      if (recordVideo && typeof document !== 'undefined') {
        // Setup 720p HD Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvasRef.current = canvas;

        startCanvasVideoCompositor(canvas);

        const canvasStream = canvas.captureStream(20);
        const videoTrack = canvasStream.getVideoTracks()[0];
        const mixedAudioTracks = dest.stream.getAudioTracks();
        mixedAudioTracks.forEach((t) => {
          t.enabled = true;
        });

        recordingStream = new MediaStream([videoTrack, ...mixedAudioTracks]);
        chosenMime = getBestSupportedVideoMimeType();
      } else {
        recordingStream = dest.stream;
        chosenMime = getBestSupportedAudioMimeType();
      }

      mimeTypeRef.current = chosenMime;
      const recorderOptions: MediaRecorderOptions = chosenMime ? { mimeType: chosenMime } : {};
      const recorder = new MediaRecorder(recordingStream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }

        if (videoRenderIntervalRef.current) {
          clearInterval(videoRenderIntervalRef.current);
          videoRenderIntervalRef.current = null;
        }

        // Clean up audio source nodes
        activeSourcesRef.current.forEach((src) => {
          try { src.disconnect(); } catch {}
        });
        activeSourcesRef.current.clear();
        connectedTracksRef.current.clear();

        // Clean up video elements pool
        videoPoolRef.current.forEach((el) => {
          try {
            el.srcObject = null;
            el.remove();
          } catch {}
        });
        videoPoolRef.current.clear();

        if (screenVideoRef.current) {
          try {
            screenVideoRef.current.srcObject = null;
            screenVideoRef.current.remove();
          } catch {}
          screenVideoRef.current = null;
        }

        if (hiddenVideoContainerRef.current) {
          try {
            hiddenVideoContainerRef.current.remove();
          } catch {}
          hiddenVideoContainerRef.current = null;
        }

        const mime = mimeTypeRef.current || (recordVideo ? 'video/webm' : 'audio/webm');
        const finalBlob = new Blob(chunksRef.current, { type: mime });
        setRecordingBlob(finalBlob);

        const localUrl = URL.createObjectURL(finalBlob);
        setRecordingUrl(localUrl);
        setIsRecording(false);
        setIsPaused(false);

        if (onRecordingComplete) {
          onRecordingComplete(localUrl, finalBlob);
        }

        // Clean up audio context
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
          destinationRef.current = null;
          connectedTracksRef.current.clear();
        }
      };

      // Collect data every 1000ms
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // Start duration timer + periodic background checkpoint upload so video is NEVER lost
      timerIntervalRef.current = setInterval(() => {
        durationCounterRef.current += 1;
        const currentSecs = durationCounterRef.current;
        setRecordingDurationSeconds(currentSecs);

        // Background checkpoint upload at 3s and every 8s thereafter
        if (
          (currentSecs === 3 || currentSecs % 8 === 0) &&
          chunksRef.current.length > 0 &&
          slotIdRef.current &&
          !isCheckpointUploadingRef.current
        ) {
          isCheckpointUploadingRef.current = true;
          const mime = mimeTypeRef.current || (recordVideo ? 'video/webm' : 'audio/webm');
          const snapshotBlob = new Blob(chunksRef.current, { type: mime });
          if (snapshotBlob.size > 0) {
            uploadGDRecording(slotIdRef.current, snapshotBlob, currentSecs)
              .then((res) => {
                if (res?.recordingUrl) {
                  setRecordingUrl(res.recordingUrl);
                }
              })
              .catch(() => {})
              .finally(() => {
                isCheckpointUploadingRef.current = false;
              });
          } else {
            isCheckpointUploadingRef.current = false;
          }
        }
      }, 1000);

      console.log(
        `[GD Recorder] Live ${recordVideo ? 'Video Grid' : 'Audio'} recording started (format: ${
          chosenMime || 'default'
        })`
      );
      return true;
    } catch (err: any) {
      console.error('[GD Recorder] Failed to start MediaRecorder:', err);
      setIsRecording(false);
      return false;
    }
  }, [
    enabled,
    localStream,
    localAudioStream,
    peerStreams,
    recordVideo,
    startCanvasVideoCompositor,
    mixStreamIntoDestination,
    onRecordingComplete,
  ]);

  // Pause
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, []);

  // Resume
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        durationCounterRef.current += 1;
        setRecordingDurationSeconds(durationCounterRef.current);
      }, 1000);
    }
  }, []);

  // Stop recording and return final Blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      const mime = mimeTypeRef.current || (recordVideo ? 'video/webm' : 'audio/webm');
      if (!rec || rec.state === 'inactive') {
        if (chunksRef.current.length > 0) {
          resolve(new Blob(chunksRef.current, { type: mime }));
        } else {
          resolve(recordingBlob);
        }
        return;
      }

      const handleStop = () => {
        rec.removeEventListener('stop', handleStop);
        const finalBlob = new Blob(chunksRef.current, { type: mime });
        resolve(finalBlob);
      };

      rec.addEventListener('stop', handleStop);
      try {
        if (rec.state === 'recording') {
          rec.requestData();
        }
        rec.stop();
      } catch {
        if (chunksRef.current.length > 0) {
          resolve(new Blob(chunksRef.current, { type: mime }));
        } else {
          resolve(null);
        }
      }
    });
  }, [recordingBlob, recordVideo]);

  // Stop and automatically upload recording to server
  const stopAndUploadRecording = useCallback(
    async (overrideSlotId?: string): Promise<UploadRecordingResponse | null> => {
      if (!enabled) return null;
      const targetSlot = overrideSlotId || slotId;
      if (!targetSlot) return null;

      if (inFlightUploadPromiseRef.current) {
        return inFlightUploadPromiseRef.current;
      }

      setIsUploading(true);
      setUploadError(null);

      const promise = (async () => {
        try {
          const finalBlob = await stopRecording();
          if (!finalBlob || finalBlob.size === 0) {
            console.warn('[GD Recorder] No audio/video chunks captured to upload');
            setIsUploading(false);
            return null;
          }

          const duration = durationCounterRef.current || recordingDurationSeconds;
          const uploadResult = await uploadGDRecording(targetSlot, finalBlob, duration);

          setIsUploading(false);
          setUploadSuccess(true);
          if (uploadResult.recordingUrl) {
            setRecordingUrl(uploadResult.recordingUrl);
          }
          return uploadResult;
        } catch (err: any) {
          console.error('[GD Recorder] Error uploading session recording:', err);
          setIsUploading(false);
          setUploadError(err.message || 'Upload failed');
          return null;
        } finally {
          inFlightUploadPromiseRef.current = null;
        }
      })();

      inFlightUploadPromiseRef.current = promise;
      return promise;
    },
    [enabled, slotId, stopRecording, recordingDurationSeconds]
  );

  // Download local copy
  const downloadLocalCopy = useCallback(
    (filename?: string) => {
      const ext = recordVideo ? 'webm' : 'webm';
      if (recordingBlob) {
        downloadRecordingLocally(recordingBlob, filename || `GD-${slotId}-${Date.now()}.${ext}`);
      } else if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
        downloadRecordingLocally(blob, filename || `GD-${slotId}-${Date.now()}.${ext}`);
      }
    },
    [recordingBlob, slotId, recordVideo]
  );

  // Auto-start recording when session becomes active (ONLY when enabled)
  useEffect(() => {
    if (enabled && autoStartOnActive && isSessionActive && !isRecording) {
      startRecording();
    }
  }, [enabled, autoStartOnActive, isSessionActive, isRecording, startRecording]);

  // Clean up on unmount — also ensure any recorded chunks are uploaded to server before disposal
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (videoRenderIntervalRef.current) {
        clearInterval(videoRenderIntervalRef.current);
      }
      videoPoolRef.current.forEach((el) => {
        try {
          el.srcObject = null;
          el.remove();
        } catch {}
      });
      videoPoolRef.current.clear();
      if (hiddenVideoContainerRef.current) {
        try {
          hiddenVideoContainerRef.current.remove();
        } catch {}
        hiddenVideoContainerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.requestData();
          }
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (chunksRef.current.length > 0 && slotIdRef.current) {
        const mime = mimeTypeRef.current || (recordVideo ? 'video/webm' : 'audio/webm');
        const finalBlob = new Blob(chunksRef.current, { type: mime });
        if (finalBlob.size > 0) {
          uploadGDRecording(slotIdRef.current, finalBlob, durationCounterRef.current || 1).catch(() => {});
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [recordVideo]);

  return {
    isRecording,
    isPaused,
    recordingDurationSeconds,
    formattedDuration,
    recordingUrl,
    recordingBlob,
    isUploading,
    uploadSuccess,
    uploadError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    stopAndUploadRecording,
    downloadLocalCopy,
  };
}
