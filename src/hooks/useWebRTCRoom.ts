import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthUser } from '../types/auth';
import { GDTranscript } from '../types/gd';
import { roomVoice } from '../utils/speechSynthesis';

export interface LivePeer {
  socketId: string;
  userId: string;
  name: string;
  avatar: string;
  role: string;
  college: string;
  seatNumber: number;
  isSpeaking: boolean;
  micActive: boolean;
  cameraActive: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  volumeLevel?: number;
}

interface UseWebRTCRoomOptions {
  slotId: string;
  topic?: string;
  currentUser: AuthUser | null;
  videoStream?: MediaStream | null;
  isCameraOn?: boolean;
  onNewTranscript?: (transcript: GDTranscript) => void;
  onFacilitatorIntervention?: (intervention: {
    text: string;
    action: string;
    transcript: GDTranscript;
    targetUserId?: string;
    targetSeatNumber?: number;
  }) => void;
  onSessionStarted?: (data: any) => void;
  onSessionEnded?: (data: any) => void;
  onAiParticipantSpeech?: (data: any) => void;
  onPeerStatsUpdated?: (data: {
    socketId?: string;
    userId?: string;
    seatNumber?: number;
    speakingTurns?: number;
    speakingDurationSeconds?: number;
    interruptionCount?: number;
  }) => void;
  onPeerLeft?: (data: {
    socketId?: string;
    userId?: string;
    seatNumber?: number;
  }) => void;
  onRoomJoined?: (data: {
    assignedSeat?: number;
    transcripts?: GDTranscript[];
    status?: string;
    topic?: string;
    openingStarted?: boolean;
    silenceTimerSeconds?: number;
  }) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Google, Cloudflare & Mozilla Global STUN (ultra-fast, zero auth, high availability)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    // OpenRelay Global Free TURN (ensures reliable NAT traversal across cellular/mobile CGNAT)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTCRoom({
  slotId,
  topic,
  currentUser,
  videoStream = null,
  isCameraOn = false,
  onNewTranscript,
  onFacilitatorIntervention,
  onSessionStarted,
  onSessionEnded,
  onAiParticipantSpeech,
  onPeerStatsUpdated,
  onPeerLeft,
  onRoomJoined,
}: UseWebRTCRoomOptions) {
  const topicRef = useRef<string | undefined>(topic);
  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);
  const [connected, setConnected] = useState(false);
  const [assignedSeat, setAssignedSeat] = useState<number>(currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber || 1 : 1);
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [aiParticipants, setAiParticipants] = useState<any[]>([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [silenceTimerSeconds, setSilenceTimerSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(currentUser?.role === 'faculty');
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const isSpeakingLiveRef = useRef(false);
  isSpeakingLiveRef.current = isSpeakingLive;
  const [localVolume, setLocalVolume] = useState(0);
  const [isFloorLocked, setIsFloorLocked] = useState(false);
  const [floorSpeakerName, setFloorSpeakerName] = useState<string | null>(null);
  const [floorSpeakerId, setFloorSpeakerId] = useState<string | null>(null);
  const [isAudioAutoplayBlocked, setIsAudioAutoplayBlocked] = useState(false);
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(videoStream);
  const isCameraOnRef = useRef<boolean>(isCameraOn);
  videoStreamRef.current = videoStream;
  isCameraOnRef.current = isCameraOn;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerCounterRef = useRef<number>(0);
  const speakingStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const floorSpeakerIdRef = useRef<string | null>(null);
  const handledAiTranscriptIdsRef = useRef<Set<string>>(new Set());

  // Throttling refs to prevent 60fps render thrashing and socket spamming
  const lastSpeakingStateEmittedRef = useRef<boolean>(false);
  const lastSpeakingEmitTimestampRef = useRef<number>(0);
  const lastVolumeStateEmittedRef = useRef<number>(0);
  const lastVolumeUiUpdateRef = useRef<number>(0);

  const isMicMutedRef = useRef<boolean>(isMicMuted);
  isMicMutedRef.current = isMicMuted;

  // Keep the latest UI callbacks without recreating the Socket.IO connection on every React render.
  // The GD room receives frequent transcript/floor updates, so reconnecting on each render can
  // cause clients to miss AI participant speech events. These refs keep handlers current while
  // the socket lifecycle stays tied only to the room/user identity.
  const onNewTranscriptRef = useRef(onNewTranscript);
  const onFacilitatorInterventionRef = useRef(onFacilitatorIntervention);
  const onSessionStartedRef = useRef(onSessionStarted);
  const onSessionEndedRef = useRef(onSessionEnded);
  const onAiParticipantSpeechRef = useRef(onAiParticipantSpeech);
  const onPeerStatsUpdatedRef = useRef(onPeerStatsUpdated);
  const onPeerLeftRef = useRef(onPeerLeft);
  onNewTranscriptRef.current = onNewTranscript;
  onFacilitatorInterventionRef.current = onFacilitatorIntervention;
  onSessionStartedRef.current = onSessionStarted;
  onSessionEndedRef.current = onSessionEnded;
  onAiParticipantSpeechRef.current = onAiParticipantSpeech;
  onPeerStatsUpdatedRef.current = onPeerStatsUpdated;
  onPeerLeftRef.current = onPeerLeft;
  const onRoomJoinedRef = useRef(onRoomJoined);
  onRoomJoinedRef.current = onRoomJoined;

  // 1. Play incoming peer audio stream through browser speakers via HTMLAudioElement & Web Audio API
  const attachRemoteAudio = useCallback((peerSocketId: string, stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended');
    if (audioTracks.length === 0) return;

    // HTMLAudioElement in DOM as resilient playback engine
    let audioEl = audioElementsRef.current.get(peerSocketId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-audio-${peerSocketId}`;
      audioEl.autoplay = true;
      audioEl.volume = 1.0;
      audioEl.muted = false;
      audioEl.style.position = 'fixed';
      audioEl.style.width = '1px';
      audioEl.style.height = '1px';
      audioEl.style.opacity = '0.01';
      audioEl.style.pointerEvents = 'none';
      audioEl.style.bottom = '0px';
      audioEl.style.right = '0px';
      (audioEl as any).playsInline = true;
      document.body.appendChild(audioEl);
      audioElementsRef.current.set(peerSocketId, audioEl);
    }

    const currentStream = audioEl.srcObject as MediaStream | null;
    const currentTrack = currentStream?.getAudioTracks()[0];
    const incomingTrack = audioTracks[0];
    try { incomingTrack.enabled = true; } catch {}

    // Only assign srcObject if it is missing or the track ID changed
    if (!currentStream || !currentTrack || currentTrack.id !== incomingTrack.id) {
      audioEl.srcObject = new MediaStream([incomingTrack]);
    }
    audioEl.muted = false;
    audioEl.volume = 1.0;

    const playAudio = () => {
      if (audioEl) {
        audioEl.muted = false;
        audioEl.volume = 1.0;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            console.warn(`[WebRTC Audio Playback Notice for peer ${peerSocketId}]:`, e);
            if (e.name === 'NotAllowedError') {
              setIsAudioAutoplayBlocked(true);
            }
          });
        }
      }
    };

    playAudio();

    incomingTrack.addEventListener('unmute', () => {
      console.log(`[WebRTC Peer ${peerSocketId}] Incoming audio track unmuted - playing`);
      playAudio();
    });

    audioEl.oncanplay = () => {
      playAudio();
    };

    // Dual-channel reliability: Also ensure Web Audio API AudioContext is active
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    } catch {}
  }, []);

  // 2. Remove peer audio element & stream on disconnect
  const detachRemoteAudio = useCallback((peerSocketId: string) => {
    const audioEl = audioElementsRef.current.get(peerSocketId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      audioElementsRef.current.delete(peerSocketId);
    }
    peerStreamsRef.current.delete(peerSocketId);
    setPeerStreams(new Map(peerStreamsRef.current));
  }, []);

  // Helper: Synchronize local audio and video tracks across all transceivers on a peer connection
  const syncTracksToPeerConnection = useCallback(async (pc: RTCPeerConnection) => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
    if (isFacultyUser) {
      // Ensure transceivers exist with direction 'recvonly' so faculty/observer reliably receives remote audio and video
      const transceivers = pc.getTransceivers();
      const audioTransceiver = transceivers.find(
        (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
      );
      if (!audioTransceiver) {
        try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
      } else {
        try { audioTransceiver.direction = 'recvonly'; } catch {}
      }

      const videoTransceiver = transceivers.find(
        (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
      );
      if (!videoTransceiver) {
        try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch {}
      } else {
        try { videoTransceiver.direction = 'recvonly'; } catch {}
      }
      return;
    }

    const audioTrack = localStreamRef.current ? localStreamRef.current.getAudioTracks()[0] || null : null;
    const videoTrack = (isCameraOnRef.current && videoStreamRef.current) ? videoStreamRef.current.getVideoTracks()[0] || null : null;

    const transceivers = pc.getTransceivers();
    const audioTransceivers = transceivers.filter(
      (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
    );
    const videoTransceivers = transceivers.filter(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    );

    if (audioTransceivers.length === 0) {
      try {
        if (audioTrack) {
          pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: localStreamRef.current ? [localStreamRef.current] : [] });
        } else {
          pc.addTransceiver('audio', { direction: 'sendrecv' });
        }
      } catch {}
    } else {
      for (const at of audioTransceivers) {
        try { at.direction = 'sendrecv'; } catch {}
        if (audioTrack) {
          try { await at.sender.replaceTrack(audioTrack); } catch {}
        }
      }
    }

    if (videoTransceivers.length === 0) {
      try {
        if (videoTrack) {
          pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams: videoStreamRef.current ? [videoStreamRef.current] : [] });
        } else {
          pc.addTransceiver('video', { direction: 'sendrecv' });
        }
      } catch {}
    } else {
      for (const vt of videoTransceivers) {
        try { vt.direction = 'sendrecv'; } catch {}
        try { await vt.sender.replaceTrack(videoTrack); } catch {}
      }
    }
  }, []);

  const updatePeerStreamFromReceiversRef = useRef<(peerSocketId: string, pc: RTCPeerConnection, force?: boolean) => void>(() => {});

  // Helper: Update peerStreams directly from RTCPeerConnection receivers
  const updatePeerStreamFromReceivers = useCallback((peerSocketId: string, pc: RTCPeerConnection, force = false) => {
    try {
      const receivers = pc.getReceivers();
      const liveAudioTracks = receivers
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => Boolean(t && t.kind === 'audio' && t.readyState !== 'ended'));

      const liveVideoTracks = receivers
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => Boolean(t && t.kind === 'video' && t.readyState !== 'ended'));

      const existingStream = peerStreamsRef.current.get(peerSocketId);

      // Select exactly ONE latest live audio track
      let audioTrackToUse: MediaStreamTrack | null = null;
      if (liveAudioTracks.length > 0) {
        audioTrackToUse = liveAudioTracks[liveAudioTracks.length - 1];
      } else if (existingStream) {
        audioTrackToUse = existingStream.getAudioTracks().find((t) => t.readyState !== 'ended') || null;
      }

      // Select exactly ONE latest live video track (prefer unmuted/active if multiple)
      let videoTrackToUse: MediaStreamTrack | null = null;
      if (liveVideoTracks.length > 0) {
        const unmutedTracks = liveVideoTracks.filter((t) => !t.muted);
        videoTrackToUse = unmutedTracks.length > 0 ? unmutedTracks[unmutedTracks.length - 1] : liveVideoTracks[liveVideoTracks.length - 1];
      } else if (existingStream) {
        videoTrackToUse = existingStream.getVideoTracks().find((t) => t.readyState !== 'ended') || null;
      }

      if (!audioTrackToUse && !videoTrackToUse) return;

      // Anti-flicker track deduplication:
      // If the existing stream already contains the identical audio and video tracks (and same mute state),
      // reuse the existing stream so we don't recreate MediaStream objects or trigger re-render cascades.
      if (!force && existingStream) {
        const currentAudioTrack = existingStream.getAudioTracks()[0];
        const currentVideoTrack = existingStream.getVideoTracks()[0];
        const audioSame = (!audioTrackToUse && !currentAudioTrack) || (currentAudioTrack?.id === audioTrackToUse?.id);
        const videoSame = (!videoTrackToUse && !currentVideoTrack) || (currentVideoTrack?.id === videoTrackToUse?.id);
        const muteStateSame = currentVideoTrack?.muted === videoTrackToUse?.muted;

        if (audioSame && videoSame && muteStateSame) {
          // Stream already has the exact live tracks; do not recreate stream or trigger unnecessary re-renders
          if (audioTrackToUse) {
            attachRemoteAudio(peerSocketId, existingStream);
          }
          return;
        }
      }

      const tracksToUse: MediaStreamTrack[] = [];
      if (audioTrackToUse) {
        try { audioTrackToUse.enabled = true; } catch {}
        tracksToUse.push(audioTrackToUse);
      }
      if (videoTrackToUse) {
        try { videoTrackToUse.enabled = true; } catch {}
        tracksToUse.push(videoTrackToUse);
      }

      if (tracksToUse.length === 0) return;

      // Clean MediaStream with the selected active tracks
      const updatedStream = new MediaStream(tracksToUse);
      peerStreamsRef.current.set(peerSocketId, updatedStream);
      setPeerStreams(new Map(peerStreamsRef.current));

      if (audioTrackToUse) {
        attachRemoteAudio(peerSocketId, updatedStream);
      }
    } catch (e) {
      console.warn('[WebRTC updatePeerStreamFromReceivers warning]:', e);
    }
  }, [attachRemoteAudio]);
  updatePeerStreamFromReceiversRef.current = updatePeerStreamFromReceivers;

  // Helper: Ensure audio & video transceivers exist BEFORE creating an SDP Offer
  const ensureTransceiversForOffer = useCallback((pc: RTCPeerConnection) => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
    const transceivers = pc.getTransceivers();

    const audioTransceiver = transceivers.find(
      (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
    );
    if (!audioTransceiver) {
      const audioTrack = (!isFacultyUser && localStreamRef.current) ? localStreamRef.current.getAudioTracks()[0] || null : null;
      try {
        if (audioTrack) {
          pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: localStreamRef.current ? [localStreamRef.current] : [] });
        } else {
          pc.addTransceiver('audio', { direction: isFacultyUser ? 'recvonly' : 'sendrecv' });
        }
      } catch {}
    } else if (isFacultyUser) {
      try { audioTransceiver.direction = 'recvonly'; } catch {}
    } else {
      try { audioTransceiver.direction = 'sendrecv'; } catch {}
    }

    const videoTransceiver = transceivers.find(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    );
    if (!videoTransceiver) {
      const videoTrack = (!isFacultyUser && isCameraOnRef.current && videoStreamRef.current) ? videoStreamRef.current.getVideoTracks()[0] || null : null;
      try {
        if (videoTrack) {
          pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams: videoStreamRef.current ? [videoStreamRef.current] : [] });
        } else {
          pc.addTransceiver('video', { direction: isFacultyUser ? 'recvonly' : 'sendrecv' });
        }
      } catch {}
    } else if (isFacultyUser) {
      try { videoTransceiver.direction = 'recvonly'; } catch {}
    } else {
      try { videoTransceiver.direction = 'sendrecv'; } catch {}
    }
  }, []);

  // Helper: Renegotiate SDP offer with a specific peer when media tracks or directions change
  const renegotiatePeer = useCallback(async (peerSocketId: string, pc: RTCPeerConnection) => {
    if (!socketRef.current) return;
    if (pc.signalingState !== 'stable') {
      const handleStable = () => {
        if (pc.signalingState === 'stable') {
          pc.removeEventListener('signalingstatechange', handleStable);
          renegotiatePeer(peerSocketId, pc);
        }
      };
      pc.addEventListener('signalingstatechange', handleStable);
      return;
    }
    try {
      ensureTransceiversForOffer(pc);
      await syncTracksToPeerConnection(pc);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      socketRef.current.emit('signal-send', {
        to: peerSocketId,
        signal: { sdp: pc.localDescription },
      });
    } catch (e) {
      console.warn('[WebRTC renegotiatePeer notice]:', e);
    }
  }, [ensureTransceiversForOffer, syncTracksToPeerConnection]);

  const attachRemoteAudioRef = useRef(attachRemoteAudio);
  attachRemoteAudioRef.current = attachRemoteAudio;

  // 3. Create or get RTCPeerConnection for a specific peer
  const getOrCreatePeerConnection = useCallback((peerSocketId: string): RTCPeerConnection => {
    let pc = peerConnectionsRef.current.get(peerSocketId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(peerSocketId, pc);

    // ICE Candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        const candidatePayload =
          typeof event.candidate.toJSON === 'function'
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: (event.candidate as any).usernameFragment,
              };
        socketRef.current.emit('signal-send', {
          to: peerSocketId,
          signal: { candidate: candidatePayload },
        });
      }
    };

    // When remote track (audio or video) is received from peer
    pc.ontrack = (event) => {
      console.log(`[WebRTC Peer ${peerSocketId}] Received remote track:`, event.track.kind, event.track.id);
      const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      
      const onTrackChange = () => {
        console.log(`[WebRTC Peer ${peerSocketId}] Remote track state changed:`, event.track.kind, 'muted:', event.track.muted);
        updatePeerStreamFromReceiversRef.current(peerSocketId, pc, true);
        if (event.track.kind === 'audio') {
          attachRemoteAudioRef.current(peerSocketId, incomingStream);
        }
      };

      event.track.addEventListener('unmute', onTrackChange);
      // Do not attach 'mute' listener: WebRTC tracks frequently fire brief mute events during normal packet handling
      event.track.addEventListener('ended', onTrackChange);

      updatePeerStreamFromReceivers(peerSocketId, pc, true);
      if (event.track.kind === 'audio') {
        attachRemoteAudioRef.current(peerSocketId, incomingStream);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Peer ${peerSocketId}] Connection state:`, pc?.connectionState);
      if (pc?.connectionState === 'connected') {
        updatePeerStreamFromReceiversRef.current(peerSocketId, pc, true);
        const audioEl = audioElementsRef.current.get(peerSocketId);
        if (audioEl) {
          audioEl.muted = false;
          audioEl.volume = 1.0;
          audioEl.play().catch(() => {});
        }
      } else if (pc?.connectionState === 'failed') {
        try {
          console.log(`[WebRTC Peer ${peerSocketId}] Attempting ICE restart & renegotiation...`);
          pc.restartIce();
          renegotiatePeerRef.current(peerSocketId, pc);
        } catch (e) {
          detachRemoteAudio(peerSocketId);
          peerConnectionsRef.current.delete(peerSocketId);
        }
      } else if (pc?.connectionState === 'closed') {
        detachRemoteAudio(peerSocketId);
        peerConnectionsRef.current.delete(peerSocketId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC Peer ${peerSocketId}] ICE state:`, pc?.iceConnectionState);
    };

    return pc;
  }, [attachRemoteAudio, detachRemoteAudio]);

  const detachRemoteAudioRef = useRef(detachRemoteAudio);
  detachRemoteAudioRef.current = detachRemoteAudio;
  const getOrCreatePeerConnectionRef = useRef(getOrCreatePeerConnection);
  getOrCreatePeerConnectionRef.current = getOrCreatePeerConnection;
  const ensureTransceiversForOfferRef = useRef(ensureTransceiversForOffer);
  ensureTransceiversForOfferRef.current = ensureTransceiversForOffer;
  const syncTracksToPeerConnectionRef = useRef(syncTracksToPeerConnection);
  syncTracksToPeerConnectionRef.current = syncTracksToPeerConnection;
  const renegotiatePeerRef = useRef(renegotiatePeer);
  renegotiatePeerRef.current = renegotiatePeer;

  // 4. Initialize Local Microphone & Real-time Volume Analyzer
  const initLocalMicrophone = useCallback(async () => {
    try {
      const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
      if (isFacultyUser) {
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        return null;
      }

      if (localStreamRef.current && localStreamRef.current.getAudioTracks().some((t) => t.readyState === 'live')) {
        return localStreamRef.current;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setLocalAudioStream(stream);

      // Continuous open mic: start with audio tracks active for students (no manual unmuting needed)
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setIsMicMuted(false);

      // Attach tracks to any peer connections that were established before mic was ready
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        syncTracksToPeerConnectionRef.current(pc).then(() => {
          renegotiatePeerRef.current(peerSocketId, pc);
        });
      });

      // Setup Web Audio Analyser for speaking detection & audio visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try { audioContextRef.current.close().catch(() => {}); } catch {}
        }
        try {
          const audioCtx = new AudioCtx();
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
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          analyserRef.current = analyser;
        } catch (e) {
          console.warn('[WebRTC audio analyser init warning]:', e);
        }

        const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount || 128);

        const checkVolume = () => {
          if (!analyserRef.current) return;
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const now = Date.now();
          const normVol = isMicMutedRef.current ? 0 : Math.min(100, Math.round((avg / 128) * 100));

          // Throttle UI localVolume state updates to avoid React render thrash (max 10 fps, >=4% change)
          if (now - lastVolumeUiUpdateRef.current > 100 && Math.abs(normVol - lastVolumeStateEmittedRef.current) >= 4) {
            lastVolumeUiUpdateRef.current = now;
            lastVolumeStateEmittedRef.current = normVol;
            setLocalVolume(normVol);
          }

          // Suppress acoustic feedback when AI voice is playing over speakers
          const isAiSpeakingNow = Boolean(
            typeof window !== 'undefined' && ((window as any).__erusIsAiSpeaking || (Date.now() - ((window as any).__erusLastAiSpeechTime || 0) < 2200))
          );
          const effectiveIsSpeaking = isAiSpeakingNow ? false : isSpeakingLiveRef.current;
          const effectiveVol = isAiSpeakingNow ? 0 : normVol;

          // Broadcast volume level for UI visualizers without falsely declaring speaking turns from ambient noise
          const timeSinceEmit = now - lastSpeakingEmitTimestampRef.current;
          if (socketRef.current && (timeSinceEmit > 350 || Math.abs(normVol - lastVolumeStateEmittedRef.current) >= 12)) {
            lastSpeakingEmitTimestampRef.current = now;
            socketRef.current.emit('peer-speaking-state', {
              slotId,
              isSpeaking: effectiveIsSpeaking,
              micActive: !isMicMutedRef.current,
              cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
              volumeLevel: effectiveVol,
            });
          }

          animFrameRef.current = requestAnimationFrame(checkVolume);
        };

        checkVolume();
      }

      return stream;
    } catch (err: any) {
      console.warn('[Microphone init note]:', err.message);
      setError(err.message || 'Microphone access denied or unavailable.');
      return null;
    }
  }, [slotId]);

  const initLocalMicrophoneRef = useRef(initLocalMicrophone);
  initLocalMicrophoneRef.current = initLocalMicrophone;

  // Global user-gesture audio unlocker for browser autoplay policies
  useEffect(() => {
    const unlockAllAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      audioElementsRef.current.forEach((el) => {
        el.muted = false;
        el.volume = 1.0;
        if (el.srcObject) {
          el.play().catch(() => {});
        }
      });
      setIsAudioAutoplayBlocked(false);
    };

    window.addEventListener('click', unlockAllAudio, { passive: true });
    window.addEventListener('keydown', unlockAllAudio, { passive: true });
    window.addEventListener('touchstart', unlockAllAudio, { passive: true });

    return () => {
      window.removeEventListener('click', unlockAllAudio);
      window.removeEventListener('keydown', unlockAllAudio);
      window.removeEventListener('touchstart', unlockAllAudio);
    };
  }, []);

  // 5. Connect to Socket.IO Server & Room Signaling
  useEffect(() => {
    let active = true;

    // Connect socket (relative origin works seamlessly on both localhost and Railway)
    const socket = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 15,
    });
    socketRef.current = socket;

    socket.on('connect', async () => {
      if (!active) return;
      setConnected(true);

      // Acquire microphone (only for student participants - faculty/observer is pure listener)
      const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
      if (!isFacultyUser) {
        await initLocalMicrophoneRef.current();
      }

      // Join the slot room with user metadata and topic
      socket.emit('join-gd-room', {
        slotId,
        topic: topicRef.current,
        user: {
          id: currentUserRef.current?.id || `anon-${socket.id}`,
          name: currentUserRef.current?.name || 'Student Participant',
          avatar: currentUserRef.current?.avatar || '',
          role: currentUserRef.current?.role || 'student',
          college: currentUserRef.current?.college || 'Campus Participant',
          seatNumber: currentUserRef.current && 'seatNumber' in currentUserRef.current ? (currentUserRef.current as any).seatNumber : undefined,
          micActive: !isMicMutedRef.current,
          cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
        },
      });
    });

    // Received initial room state
    socket.on('gd-room-joined', async ({
      assignedSeat: mySeat,
      peers: existingPeers,
      silenceTimerSeconds: initialSilence,
      aiParticipants: initialAiParticipants,
      simulationMode: initialSimulationMode,
      transcripts: initialTranscripts,
      status: roomStatus,
      topic: roomTopic,
      openingStarted: isOpeningStarted,
    }: any) => {
      if (!active) return;
      setAssignedSeat(mySeat);
      setPeers(existingPeers || []);
      setAiParticipants(Array.isArray(initialAiParticipants) ? initialAiParticipants : []);
      setSimulationMode(Boolean(initialSimulationMode));
      setSilenceTimerSeconds(initialSilence || 0);

      if (onRoomJoinedRef.current) {
        onRoomJoinedRef.current({
          assignedSeat: mySeat,
          transcripts: initialTranscripts,
          status: roomStatus,
          topic: roomTopic,
          openingStarted: isOpeningStarted,
          silenceTimerSeconds: initialSilence,
        });
      }

      // Initiate WebRTC offers to all peers already in the room
      if (existingPeers && existingPeers.length > 0) {
        for (const remotePeer of existingPeers) {
          try {
            const pc = getOrCreatePeerConnectionRef.current(remotePeer.socketId);
            ensureTransceiversForOfferRef.current(pc);
            await syncTracksToPeerConnectionRef.current(pc);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(offer);
            socket.emit('signal-send', {
              to: remotePeer.socketId,
              signal: { sdp: pc.localDescription },
            });
          } catch (e) {
            console.warn('[WebRTC createOffer error]:', e);
          }
        }
      }
    });

    // A new peer joined the room (update roster & trigger self-healing mesh negotiation if connection remains unestablished)
    socket.on('peer-joined', async ({ peer }) => {
      if (!active) return;
      setPeers((prev) => {
        const filtered = prev.filter((p) => p.socketId !== peer.socketId);
        return [...filtered, peer];
      });

      // Self-healing mesh: if after 1200ms no active WebRTC connection exists, initiate offer to ensure full mesh
      setTimeout(async () => {
        if (!active || !socketRef.current) return;
        const pc = getOrCreatePeerConnectionRef.current(peer.socketId);
        if (pc.connectionState !== 'connected' && pc.connectionState !== 'connecting' && pc.signalingState === 'stable') {
          try {
            ensureTransceiversForOfferRef.current(pc);
            await syncTracksToPeerConnectionRef.current(pc);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            if (pc.signalingState !== 'stable') return;
            await pc.setLocalDescription(offer);
            socketRef.current.emit('signal-send', {
              to: peer.socketId,
              signal: { sdp: pc.localDescription },
            });
          } catch (e) {
            console.warn('[WebRTC auto-heal mesh offer notice]:', e);
          }
        }
      }, 1200);
    });

    // WebRTC Signaling Relay Received (Offer, Answer, ICE Candidate)
    socket.on('signal-receive', async ({ from, signal }) => {
      if (!active) return;
      const pc = getOrCreatePeerConnectionRef.current(from);

      try {
        if (signal.sdp) {
          if (signal.sdp.type === 'offer') {
            const isOfferCollision = pc.signalingState !== 'stable';
            const isPolite = (socket.id || '') < from;
            if (isOfferCollision) {
              if (!isPolite) {
                // Impolite peer ignores colliding offer; remote polite peer will roll back
                return;
              }
              // Polite peer rolls back local offer to accept incoming offer ONLY if in have-local-offer state
              if (pc.signalingState === 'have-local-offer') {
                try {
                  await pc.setLocalDescription({ type: 'rollback' });
                } catch (rbErr) {
                  console.warn('[WebRTC rollback non-fatal]:', rbErr);
                }
              }
            }

            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued ICE candidates received before remote description was ready
            const queued = iceCandidateQueueRef.current.get(from) || [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (err) {}
            }
            iceCandidateQueueRef.current.delete(from);

            // Attach BOTH audio and video tracks to the exact transceivers created by setRemoteDescription(offer)
            await syncTracksToPeerConnectionRef.current(pc);
            updatePeerStreamFromReceiversRef.current(from, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal-send', {
              to: from,
              signal: { sdp: pc.localDescription },
            });
          } else if (signal.sdp.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

              // Drain queued ICE candidates received before remote description was ready
              const queued = iceCandidateQueueRef.current.get(from) || [];
              for (const cand of queued) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (err) {}
              }
              iceCandidateQueueRef.current.delete(from);

              await syncTracksToPeerConnectionRef.current(pc);
              updatePeerStreamFromReceiversRef.current(from, pc);
            }
          }
        } else if (signal.candidate) {
          const rawCand = signal.candidate;
          if (rawCand && (rawCand.candidate || rawCand.sdpMid !== undefined || rawCand.sdpMLineIndex !== undefined)) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(rawCand));
              } catch (candErr) {}
            } else {
              const q = iceCandidateQueueRef.current.get(from) || [];
              q.push(rawCand);
              iceCandidateQueueRef.current.set(from, q);
            }
          }
        }
      } catch (e) {
        console.warn('[WebRTC Signaling error]:', e);
      }
    });

    // A peer updated speaking/mic/camera state
    socket.on('peer-speaking-updated', ({ socketId: peerSockId, isSpeaking, micActive, cameraActive, volumeLevel: peerVol }) => {
      if (!active) return;
      if (isSpeaking || micActive) {
        const audioEl = audioElementsRef.current.get(peerSockId);
        if (audioEl) {
          audioEl.muted = false;
          audioEl.volume = 1.0;
          audioEl.play().catch(() => {});
        } else {
          const pc = peerConnectionsRef.current.get(peerSockId);
          if (pc) {
            updatePeerStreamFromReceiversRef.current(peerSockId, pc);
          }
        }
      }
      if (cameraActive !== undefined) {
        const pc = peerConnectionsRef.current.get(peerSockId);
        if (pc) {
          updatePeerStreamFromReceiversRef.current(peerSockId, pc, true);
        }
      }
      setPeers((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          if (p.socketId !== peerSockId) return p;
          const sameSpeaking = p.isSpeaking === !!isSpeaking;
          const sameMic = micActive === undefined || p.micActive === micActive;
          const sameCam = cameraActive === undefined || p.cameraActive === cameraActive;
          const sameVol = Math.abs((p.volumeLevel || 0) - (peerVol || 0)) < 12;
          if (sameSpeaking && sameMic && sameCam && sameVol) return p;
          changed = true;
          return {
            ...p,
            isSpeaking: !!isSpeaking,
            micActive: micActive ?? p.micActive,
            cameraActive: cameraActive ?? p.cameraActive,
            volumeLevel: peerVol || 0,
          };
        });
        return changed ? next : prev;
      });
    });

    // A peer disconnected from the slot
    socket.on('peer-left', ({ socketId: leftSockId, userId: leftUserId, seatNumber: leftSeatNumber }: any) => {
      if (!active) return;
      console.log(`[WebRTC Peer Left] Socket: ${leftSockId}, User: ${leftUserId}, Seat: ${leftSeatNumber}`);

      if (leftSockId) {
        detachRemoteAudioRef.current(leftSockId);
        const pc = peerConnectionsRef.current.get(leftSockId);
        if (pc) {
          try { pc.close(); } catch {}
          peerConnectionsRef.current.delete(leftSockId);
        }
        peerStreamsRef.current.delete(leftSockId);
      }
      if (leftUserId) {
        detachRemoteAudioRef.current(leftUserId);
        peerStreamsRef.current.delete(leftUserId);
      }
      setPeerStreams(new Map(peerStreamsRef.current));

      setPeers((prev) =>
        prev.filter((p) => {
          if (leftSockId && p.socketId === leftSockId) return false;
          if (leftUserId && (p.userId === leftUserId || (p as any).id === leftUserId)) return false;
          if (leftSeatNumber !== undefined && p.seatNumber === leftSeatNumber) return false;
          return true;
        })
      );

      if (onPeerLeftRef.current) {
        onPeerLeftRef.current({ socketId: leftSockId, userId: leftUserId, seatNumber: leftSeatNumber });
      }
    });

    // 20-Second Silence Deadlock Countdown Tick
    socket.on('silence-timer-tick', ({ silenceTimerSeconds: tickSec }) => {
      if (!active) return;
      setSilenceTimerSeconds(tickSec);
      silenceTimerCounterRef.current = tickSec;
    });

    // Synchronized Live Transcript Chunk Broadcast with Peer Turn Counts
    socket.on('new-transcript', ({ transcript, studentId, seatNumber, speakingTurns, speakingDurationSeconds }: any) => {
      if (!active) return;
      const targetSpeakerId = transcript?.speakerId || studentId;
      const targetSeat = transcript?.seatNumber || seatNumber;

      if (targetSpeakerId || targetSeat) {
        setPeers((prev) =>
          prev.map((p) => {
            const isMatch = (targetSpeakerId && (p.userId === targetSpeakerId || p.socketId === targetSpeakerId)) ||
              (targetSeat && p.seatNumber === targetSeat);
            if (!isMatch) return p;
            return {
              ...p,
              speakingTurns: Math.max(p.speakingTurns || 0, speakingTurns || ((p.speakingTurns || 0) + 1)),
              speakingDurationSeconds: Math.max(p.speakingDurationSeconds || 0, speakingDurationSeconds || (p.speakingDurationSeconds || 0)),
            };
          })
        );
      }
      if (onNewTranscriptRef.current && transcript) {
        onNewTranscriptRef.current(transcript);
      }
      if (onPeerStatsUpdatedRef.current && (speakingTurns !== undefined || speakingDurationSeconds !== undefined)) {
        onPeerStatsUpdatedRef.current({
          socketId: studentId,
          userId: targetSpeakerId,
          seatNumber: targetSeat,
          speakingTurns,
          speakingDurationSeconds,
        });
      }
    });

    // Explicit Peer Stats Real-Time Synchronization Event
    socket.on('peer-stats-updated', ({ socketId: sId, userId, seatNumber, speakingTurns, speakingDurationSeconds, interruptionCount }: any) => {
      if (!active) return;
      setPeers((prev) =>
        prev.map((p) => {
          const isMatch = (sId && p.socketId === sId) ||
            (userId && p.userId === userId) ||
            (seatNumber && p.seatNumber === seatNumber);
          if (!isMatch) return p;
          return {
            ...p,
            speakingTurns: Math.max(p.speakingTurns || 0, speakingTurns || 0),
            speakingDurationSeconds: Math.max(p.speakingDurationSeconds || 0, speakingDurationSeconds || 0),
          };
        })
      );
      if (onPeerStatsUpdatedRef.current) {
        onPeerStatsUpdatedRef.current({
          socketId: sId,
          userId,
          seatNumber,
          speakingTurns,
          speakingDurationSeconds,
          interruptionCount,
        });
      }
    });

    // AI Facilitator Autonomous Intervention
    socket.on('facilitator-intervention', (intervention) => {
      if (!active) return;
      if (onFacilitatorInterventionRef.current) {
        onFacilitatorInterventionRef.current(intervention);
      }
    });

    socket.on('floor-busy', ({ message }) => {
      if (!active) return;
      if (message) {
        setError(message);
        window.setTimeout(() => setError(null), 2500);
      }
    });

    socket.on('floor-state', ({ speakerId, speakerName, isFloorLocked: serverFloorLocked }: any) => {
      if (!active) return;
      floorSpeakerIdRef.current = speakerId || null;
      setFloorSpeakerId(speakerId || null);
      // Removed single-speaker restriction: floor is open to all, only locked if explicitly requested by server
      setIsFloorLocked(Boolean(serverFloorLocked));
      setFloorSpeakerName(speakerName || null);

      // Continuous open mic: do NOT forcefully mute audio tracks when someone else speaks
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach((track) => {
          track.enabled = !isMicMutedRef.current;
        });
      }

      // Do NOT kill active roomVoice on floor-state events; AI facilitator and AI student speech should complete naturally
      if (!speakerId) {
        setError(null);
      }
    });

    // AI participant contribution broadcast. Every browser receives and vocalizes
    // the same contribution, so AI participants behave like room participants.
    socket.on('ai-participant-speech', (data) => {
      if (!active) return;
      if (data?.participant?.id) {
        setAiParticipants((prev) => {
          const found = prev.some((p) => p.id === data.participant.id);
          return found
            ? prev.map((p) => p.id === data.participant.id ? { ...p, ...data.participant } : p)
            : [...prev, data.participant];
        });
      }
      if (data?.transcript?.id) {
        handledAiTranscriptIdsRef.current.add(String(data.transcript.id));
      }
      onAiParticipantSpeechRef.current?.(data);
    });

    socket.on('ai-participants-updated', (data) => {
      if (!active) return;
      setAiParticipants(Array.isArray(data?.aiParticipants) ? data.aiParticipants : []);
      setSimulationMode(Boolean(data?.simulationMode));
    });

    // Faculty Commences Session Broadcast
    socket.on('session-started', (data) => {
      if (!active) return;
      if (data?.slotId && data.slotId !== slotId) return;
      if (data?.simulationMode) {
        setSimulationMode(true);
        setAiParticipants(Array.isArray(data.aiParticipants) ? data.aiParticipants : []);
      }
      if (onSessionStartedRef.current) {
        onSessionStartedRef.current(data);
      }
    });

    // Faculty Concludes / Finishes GD Broadcast
    socket.on('session-ended', (data) => {
      if (!active) return;
      if (data?.slotId && data.slotId !== slotId) return;
      if (onSessionEndedRef.current) {
        onSessionEndedRef.current(data);
      }
    });

    socket.on('disconnect', () => {
      if (!active) return;
      setConnected(false);
    });

    // Cleanup on unmount
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (speakingStateTimeoutRef.current) clearTimeout(speakingStateTimeoutRef.current);

      // Stop local microphone
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalAudioStream(null);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      // Close all peer connections
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();

      // Remove audio playback elements
      audioElementsRef.current.forEach((el) => {
        el.pause();
        el.srcObject = null;
        el.remove();
      });
      try {
        socket.emit('leave-gd-room', { slotId, user: currentUserRef.current });
      } catch {}

      socket.disconnect();
    };
  }, [slotId, currentUser?.id]);

  // Set explicit microphone enabled state (true = unmuted, false = muted)
  const setMicEnabled = useCallback(async (enabled: boolean) => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
    if (isFacultyUser) {
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      return;
    }

    // If mic not yet acquired, initialize it now
    if (!localStreamRef.current) {
      await initLocalMicrophone();
    }

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = enabled;
      }
      setIsMicMuted(!enabled);
      isMicMutedRef.current = !enabled;

      // Synchronize audio track across all peer connections and renegotiate if needed
      peerConnectionsRef.current.forEach(async (pc, peerSocketId) => {
        try {
          await syncTracksToPeerConnectionRef.current(pc);
          if (enabled && pc.signalingState === 'stable') {
            const needsRenegotiation = pc.getTransceivers().some(
              (t) =>
                (t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio') &&
                t.currentDirection !== 'sendrecv' &&
                t.currentDirection !== 'sendonly'
            );
            if (needsRenegotiation) {
              await renegotiatePeerRef.current(peerSocketId, pc);
            }
          }
        } catch (e) {
          console.warn('[WebRTC Mic track update error]:', e);
        }
      });

      if (socketRef.current) {
        socketRef.current.emit('peer-speaking-state', {
          slotId,
          isSpeaking: false,
          micActive: enabled,
          cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
          volumeLevel: 0,
        });
      }
    }
  }, [slotId, initLocalMicrophone]);

  // Toggle local microphone mute
  const toggleMute = useCallback(() => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
    if (isFacultyUser) return;

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        setMicEnabled(!audioTrack.enabled);
      } else {
        setMicEnabled(true);
      }
    } else {
      setMicEnabled(true);
    }
  }, [setMicEnabled]);

  // Synchronize local webcam video track & cameraActive state to all active WebRTC peer connections
  useEffect(() => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty' || currentUserRef.current?.role === 'college_admin' || currentUserRef.current?.role === 'super_admin';
    if (isFacultyUser) return;

    // Broadcast cameraActive state immediately to all room peers
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('peer-speaking-state', {
        slotId,
        isSpeaking: false,
        micActive: !isMicMutedRef.current,
        cameraActive: Boolean(isCameraOn && videoStream),
        volumeLevel: 0,
      });
    }

    peerConnectionsRef.current.forEach(async (pc, peerSocketId) => {
      try {
        await syncTracksToPeerConnectionRef.current(pc);
        await renegotiatePeerRef.current(peerSocketId, pc);
      } catch (err) {
        console.warn('[WebRTC Video Track Sync Notice]:', err);
      }
    });
  }, [isCameraOn, videoStream, slotId]);

  // Broadcast spoken transcript to all room members
  const broadcastTranscript = useCallback((text: string, elapsedSeconds: number, transcriptId?: string) => {
    const cleanText = String(text || '').trim();
    if (socketRef.current && cleanText) {
      socketRef.current.emit('peer-transcript', {
        slotId,
        text: cleanText,
        elapsedSeconds,
        transcriptId,
      });
    }
  }, [slotId]);

  // Start GD Session (emits start-session to server)
  const startSession = useCallback((topicOverride?: string) => {
    if (socketRef.current) {
      socketRef.current.emit('start-session', { slotId, topic: topicOverride });
    }
  }, [slotId]);

  // Request AI Facilitator Intervention (probing question)
  const requestAiIntervention = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('request-ai-intervention', { slotId });
    }
  }, [slotId]);

  // Broadcast Facilitator Speech (e.g. explain rules)
  const broadcastFacilitatorSpeech = useCallback((text: string, actionType?: string) => {
    const cleanText = String(text || '').trim();
    if (socketRef.current && cleanText) {
      socketRef.current.emit('broadcast-facilitator-speech', { slotId, text: cleanText, actionType });
    }
  }, [slotId]);

  // Explicitly notify room that participant has started speaking
  const notifySpeakingStarted = useCallback(() => {
    isSpeakingLiveRef.current = true;
    setIsSpeakingLive(true);
    if (socketRef.current) {
      if (speakingStateTimeoutRef.current) {
        clearTimeout(speakingStateTimeoutRef.current);
        speakingStateTimeoutRef.current = null;
      }
      lastSpeakingStateEmittedRef.current = true;
      lastSpeakingEmitTimestampRef.current = Date.now();
      socketRef.current.emit('peer-speaking-state', {
        slotId,
        isSpeaking: true,
        micActive: !isMicMutedRef.current,
        cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
        volumeLevel: 60,
      });
    }
  }, [slotId]);

  // Explicitly notify room that participant has yielded the floor
  const notifySpeakingFinished = useCallback(() => {
    isSpeakingLiveRef.current = false;
    setIsSpeakingLive(false);
    if (socketRef.current) {
      socketRef.current.emit('peer-speaking-state', {
        slotId,
        isSpeaking: false,
        micActive: false,
        cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
        volumeLevel: 0,
      });
    }
  }, [slotId]);

  // Conclude / finish the GD session across all connected clients
  const finishSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('finish-session', { slotId });
    }
  }, [slotId]);

  // Immediately notify server that AI facilitator has finished vocalizing so silence watchdog ticks right away
  const notifyFacilitatorSpeechEnded = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('facilitator-speech-ended', { slotId });
    }
  }, [slotId]);

  const getLocalAudioStream = useCallback(() => localStreamRef.current, []);

  // Explicit audio unblocker for browser autoplay policies
  const resumeAudioPlayback = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    audioElementsRef.current.forEach((el) => {
      el.muted = false;
      el.volume = 1.0;
      if (el.srcObject) {
        el.play().catch(() => {});
      }
    });
    setIsAudioAutoplayBlocked(false);
  }, []);

  return {
    connected,
    assignedSeat,
    peers,
    peerStreams,
    aiParticipants,
    simulationMode,
    silenceTimerSeconds,
    isMicMuted,
    isSpeakingLive,
    localVolume,
    toggleMute,
    setMicEnabled,
    localAudioStream,
    getLocalAudioStream,
    broadcastTranscript,
    startSession,
    finishSession,
    notifyFacilitatorSpeechEnded,
    requestAiIntervention,
    broadcastFacilitatorSpeech,
    notifySpeakingStarted,
    notifySpeakingFinished,
    isFloorLocked,
    floorSpeakerName,
    floorSpeakerId,
    isAudioAutoplayBlocked,
    resumeAudioPlayback,
    error,
  };
}
