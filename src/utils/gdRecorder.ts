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
  fill?: string,
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

  // Format seconds to mm:ss
  const formattedDuration = `${Math.floor(recordingDurationSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(recordingDurationSeconds % 60).toString().padStart(2, '0')}`;

  // Helper to connect an audio stream to the mixer destination node
  const mixStreamIntoDestination = useCallback((stream: MediaStream) => {
    if (!audioContextRef.current || !destinationRef.current) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    for (const track of audioTracks) {
      if (connectedTracksRef.current.has(track.id)) continue;
      try {
        const singleStream = new MediaStream([track]);
        const source = audioContextRef.current.createMediaStreamSource(singleStream);
        source.connect(destinationRef.current);
        connectedTracksRef.current.add(track.id);

        track.onended = () => {
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

  // Video rendering loop for composite grid
  const startCanvasVideoCompositor = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const tiles = participantTilesRef.current.filter((t) => !t.id.includes('empty'));
      const activeTopic = topicTitleRef.current || 'Group Discussion';

      // 1. Canvas Background
      ctx.fillStyle = '#080d1a';
      ctx.fillRect(0, 0, width, height);

      // 2. Room Header Bar (top 64px)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, 64);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 64);
      ctx.lineTo(width, 64);
      ctx.stroke();

      // Brand badge
      drawRoundedRect(ctx, 20, 16, 175, 32, 8, '#064e3b', '#10b981', 1);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.fillText('🎙️ ERUS ACADEMY GD', 30, 36);

      // Topic Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Inter, system-ui, sans-serif';
      const truncatedTopic =
        activeTopic.length > 60 ? activeTopic.substring(0, 57) + '...' : activeTopic;
      ctx.fillText(`Topic: ${truncatedTopic}`, 215, 37);

      // Timer & Live REC Badge
      const timerSecs = durationCounterRef.current;
      const timerText = `${Math.floor(timerSecs / 60)
        .toString()
        .padStart(2, '0')}:${(timerSecs % 60).toString().padStart(2, '0')}`;

      drawRoundedRect(ctx, width - 185, 16, 165, 32, 8, '#1e293b');
      // Red pulsing dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(width - 165, 32, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`REC ${timerText}`, width - 150, 36);

      // Participant count
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(`(${tiles.length} Participants)`, width - 85, 36);

      // 3. Grid Layout calculation
      const margin = 20;
      const gap = 14;
      const headerH = 64;
      const gridW = width - margin * 2;
      const gridH = height - headerH - margin * 2;

      const N = Math.max(1, tiles.length);
      let cols = 2;
      let rows = 1;
      if (N <= 2) {
        cols = 2;
        rows = 1;
      } else if (N <= 4) {
        cols = 2;
        rows = 2;
      } else if (N <= 6) {
        cols = 3;
        rows = 2;
      } else if (N <= 8) {
        cols = 4;
        rows = 2;
      } else {
        cols = 4;
        rows = 3;
      }

      const tileW = (gridW - (cols - 1) * gap) / cols;
      const tileH = (gridH - (rows - 1) * gap) / rows;

      // 4. Render Each Participant Tile
      tiles.forEach((tile, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = margin + col * (tileW + gap);
        const y = headerH + margin + row * (tileH + gap);

        // Tile base background
        drawRoundedRect(ctx, x, y, tileW, tileH, 12, '#1e293b');

        // Resolve stream for this tile:
        const isThisUser = Boolean(
          tile.isUser ||
          tile.name === 'You' ||
          tile.id?.includes('user') ||
          tile.id === 'speaker-user' ||
          (tiles.length === 1 && !tile.id?.startsWith('peer-'))
        );

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
            // Fallback for real peer participants (not user themselves and not empty seat)
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

        // Look for an active, hardware-accelerated <video> element in the DOM
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

        // Look up or initialize pooled fallback video element if DOM video isn't found
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

        let didDrawVideo = false;
        if (isElementUsable && activeVideoElement) {
          try {
            ctx.save();
            clipRoundedRect(ctx, x, y, tileW, tileH, 12);
            const vw = activeVideoElement.videoWidth || 640;
            const vh = activeVideoElement.videoHeight || 480;
            const scale = Math.max(tileW / vw, tileH / vh);
            const sw = vw * scale;
            const sh = vh * scale;
            const sx = x + (tileW - sw) / 2;
            const sy = y + (tileH - sh) / 2;
            ctx.drawImage(activeVideoElement, sx, sy, sw, sh);
            ctx.restore();
            didDrawVideo = true;
          } catch (drawErr) {
            didDrawVideo = false;
          }
        }

        if (!didDrawVideo) {
          // Draw elegant avatar tile
          ctx.save();
          clipRoundedRect(ctx, x, y, tileW, tileH, 12);
          const grad = ctx.createLinearGradient(x, y, x + tileW, y + tileH);
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, tileW, tileH);

          // Avatar circle
          const radius = Math.min(tileW, tileH) * 0.22;
          const cx = x + tileW / 2;
          const cy = y + tileH / 2 - 12;

          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = '#334155';
          ctx.fill();
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Initials
          ctx.fillStyle = '#f1f5f9';
          ctx.font = `bold ${Math.round(radius * 0.9)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(getInitials(tile.name), cx, cy);
          ctx.restore();
        }

        // Active speaker highlight border
        if (tile.isSpeaking) {
          drawRoundedRect(ctx, x, y, tileW, tileH, 12, undefined, '#10b981', 3.5);
        } else {
          drawRoundedRect(ctx, x, y, tileW, tileH, 12, undefined, '#334155', 1);
        }

        // Bottom student details pill
        const pillH = 34;
        const pillY = y + tileH - pillH;
        ctx.save();
        clipRoundedRect(ctx, x, y, tileW, tileH, 12);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(x, pillY, tileW, pillH);

        // Student name and seat
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const displayName = `${tile.seatNumber ? `[Seat ${tile.seatNumber}] ` : ''}${tile.name}`;
        ctx.fillText(displayName, x + 10, pillY + pillH / 2);

        // Speaking badge or college tag
        if (tile.isSpeaking) {
          const badgeX = x + tileW - 90;
          drawRoundedRect(ctx, badgeX, pillY + 6, 82, 22, 6, '#065f46', '#10b981', 1);
          ctx.fillStyle = '#6ee7b7';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🎙️ Speaking', badgeX + 41, pillY + 17);
        } else if (tile.college) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'right';
          const shortCollege =
            tile.college.length > 20 ? tile.college.substring(0, 18) + '..' : tile.college;
          ctx.fillText(shortCollege, x + tileW - 10, pillY + pillH / 2);
        }
        ctx.restore();
      });
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

        // Clean up video elements pool
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
