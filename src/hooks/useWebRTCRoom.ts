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
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTCRoom({
  slotId,
  currentUser,
  videoStream = null,
  isCameraOn = false,
  onNewTranscript,
  onFacilitatorIntervention,
  onSessionStarted,
  onSessionEnded,
  onAiParticipantSpeech,
  onRoomJoined,
}: UseWebRTCRoomOptions) {
  const [connected, setConnected] = useState(false);
  const [assignedSeat, setAssignedSeat] = useState<number>(currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber || 1 : 1);
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [aiParticipants, setAiParticipants] = useState<any[]>([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [silenceTimerSeconds, setSilenceTimerSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [isFloorLocked, setIsFloorLocked] = useState(false);
  const [floorSpeakerName, setFloorSpeakerName] = useState<string | null>(null);
  const [floorSpeakerId, setFloorSpeakerId] = useState<string | null>(null);
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
  onNewTranscriptRef.current = onNewTranscript;
  onFacilitatorInterventionRef.current = onFacilitatorIntervention;
  onSessionStartedRef.current = onSessionStarted;
  onSessionEndedRef.current = onSessionEnded;
  onAiParticipantSpeechRef.current = onAiParticipantSpeech;
  const onRoomJoinedRef = useRef(onRoomJoined);
  onRoomJoinedRef.current = onRoomJoined;

  // 1. Play incoming peer audio stream through browser speakers via HTMLAudioElement
  const attachRemoteAudio = useCallback((peerSocketId: string, stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    // HTMLAudioElement in DOM as resilient playback engine
    let audioEl = audioElementsRef.current.get(peerSocketId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-audio-${peerSocketId}`;
      audioEl.autoplay = true;
      audioEl.volume = 1.0;
      audioEl.muted = false;
      (audioEl as any).playsInline = true;
      document.body.appendChild(audioEl);
      audioElementsRef.current.set(peerSocketId, audioEl);
    }

    const audioOnlyStream = new MediaStream(audioTracks);
    audioEl.srcObject = audioOnlyStream;
    audioEl.muted = false;
    audioEl.volume = 1.0;

    const playAudio = () => {
      if (audioEl) {
        audioEl.muted = false;
        audioEl.volume = 1.0;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            console.warn('[WebRTC Audio Playback Notice]:', e);
          });
        }
      }
    };

    playAudio();

    audioTracks.forEach((t) => {
      t.onunmute = () => {
        playAudio();
      };
    });
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
    const isFacultyUser = currentUserRef.current?.role === 'faculty';
    if (isFacultyUser) return;

    const audioTrack = localStreamRef.current ? localStreamRef.current.getAudioTracks()[0] || null : null;
    const videoTrack = (isCameraOnRef.current && videoStreamRef.current) ? videoStreamRef.current.getVideoTracks()[0] || null : null;

    const transceivers = pc.getTransceivers();
    const audioTransceivers = transceivers.filter(
      (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
    );
    const videoTransceivers = transceivers.filter(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    );

    for (const at of audioTransceivers) {
      try { at.direction = 'sendrecv'; } catch {}
      if (audioTrack) {
        try { await at.sender.replaceTrack(audioTrack); } catch {}
      }
    }

    for (const vt of videoTransceivers) {
      try { vt.direction = 'sendrecv'; } catch {}
      try { await vt.sender.replaceTrack(videoTrack); } catch {}
    }
  }, []);

  // Helper: Ensure audio & video transceivers exist BEFORE creating an SDP Offer
  const ensureTransceiversForOffer = useCallback((pc: RTCPeerConnection) => {
    const isFacultyUser = currentUserRef.current?.role === 'faculty';
    const transceivers = pc.getTransceivers();

    const hasAudio = transceivers.some(
      (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
    );
    if (!hasAudio) {
      const audioTrack = (!isFacultyUser && localStreamRef.current) ? localStreamRef.current.getAudioTracks()[0] || null : null;
      try {
        if (audioTrack) {
          pc.addTransceiver(audioTrack, { direction: 'sendrecv' });
        } else {
          pc.addTransceiver('audio', { direction: 'sendrecv' });
        }
      } catch {}
    }

    const hasVideo = transceivers.some(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    );
    if (!hasVideo) {
      const videoTrack = (!isFacultyUser && isCameraOnRef.current && videoStreamRef.current) ? videoStreamRef.current.getVideoTracks()[0] || null : null;
      try {
        if (videoTrack) {
          pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
        } else {
          pc.addTransceiver('video', { direction: 'sendrecv' });
        }
      } catch {}
    }
  }, []);

  // Helper: Renegotiate SDP offer with a specific peer when media tracks or directions change
  const renegotiatePeer = useCallback(async (peerSocketId: string, pc: RTCPeerConnection) => {
    if (!socketRef.current || pc.signalingState !== 'stable') return;
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
        socketRef.current.emit('signal-send', {
          to: peerSocketId,
          signal: { candidate: event.candidate },
        });
      }
    };

    // When remote track (audio or video) is received from peer
    pc.ontrack = (event) => {
      console.log(`[WebRTC Peer ${peerSocketId}] Received remote track:`, event.track.kind);
      const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      
      let peerStream = peerStreamsRef.current.get(peerSocketId);
      const existingTracks = peerStream ? peerStream.getTracks() : [];
      const newTracks = incomingStream.getTracks();
      
      const combinedTracks = [...existingTracks];
      newTracks.forEach((t) => {
        if (!combinedTracks.some((ct) => ct.id === t.id)) {
          combinedTracks.push(t);
        }
      });
      if (!combinedTracks.some((ct) => ct.id === event.track.id)) {
        combinedTracks.push(event.track);
      }

      // Fresh MediaStream instance guarantees React re-render
      const updatedStream = new MediaStream(combinedTracks);
      peerStreamsRef.current.set(peerSocketId, updatedStream);
      setPeerStreams(new Map(peerStreamsRef.current));

      combinedTracks.forEach((track) => {
        track.onunmute = () => {
          const refreshed = new MediaStream(peerStreamsRef.current.get(peerSocketId)?.getTracks() || combinedTracks);
          peerStreamsRef.current.set(peerSocketId, refreshed);
          setPeerStreams(new Map(peerStreamsRef.current));
          if (track.kind === 'audio') {
            attachRemoteAudio(peerSocketId, new MediaStream([track]));
          }
        };
      });

      // Stream audio track to browser speakers
      if (event.track.kind === 'audio') {
        attachRemoteAudio(peerSocketId, new MediaStream([event.track]));
      } else {
        const remoteAudioTracks = updatedStream.getAudioTracks();
        if (remoteAudioTracks.length > 0) {
          attachRemoteAudio(peerSocketId, new MediaStream(remoteAudioTracks));
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Peer ${peerSocketId}] Connection state:`, pc?.connectionState);
      if (pc?.connectionState === 'connected') {
        const audioEl = audioElementsRef.current.get(peerSocketId);
        if (audioEl && audioEl.paused) {
          audioEl.play().catch(() => {});
        }
      } else if (pc?.connectionState === 'failed') {
        try {
          console.log(`[WebRTC Peer ${peerSocketId}] Attempting ICE restart...`);
          pc.restartIce();
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

      // Start with audio tracks muted initially; participant can freely unmute via toggleMute()
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setIsMicMuted(true);

      // Attach tracks to any peer connections that were established before mic was ready
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        syncTracksToPeerConnectionRef.current(pc).then(() => {
          if (pc.signalingState === 'stable') {
            renegotiatePeerRef.current(peerSocketId, pc);
          }
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
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setLocalVolume(Math.min(100, Math.round((avg / 128) * 100)));

          // Detect speaking when volume exceeds threshold (open mics enabled)
          const isAiSpeaking = roomVoice.isSpeaking();
          const speakingNow = avg > 4 && !isMicMutedRef.current;
          if (speakingNow && isAiSpeaking) {
            roomVoice.stop();
          }
          setIsSpeakingLive(speakingNow);

          if (speakingNow) {
            if (speakingStateTimeoutRef.current) {
              clearTimeout(speakingStateTimeoutRef.current);
              speakingStateTimeoutRef.current = null;
            }
            if (socketRef.current) {
              socketRef.current.emit('peer-speaking-state', {
                slotId,
                isSpeaking: true,
                micActive: !isMicMutedRef.current,
                cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
                volumeLevel: Math.round(avg),
              });
            }
          } else {
            if (!speakingStateTimeoutRef.current && socketRef.current) {
              speakingStateTimeoutRef.current = setTimeout(() => {
                socketRef.current?.emit('peer-speaking-state', {
                  slotId,
                  isSpeaking: false,
                  micActive: !isMicMutedRef.current,
                  cameraActive: Boolean(isCameraOnRef.current && videoStreamRef.current),
                  volumeLevel: 0,
                });
                speakingStateTimeoutRef.current = null;
              }, 2500);
            }
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
        if (el.srcObject && el.paused) {
          el.play().catch(() => {});
        }
      });
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

      // Acquire microphone (only for student participants - faculty is pure listener)
      if (currentUserRef.current?.role !== 'faculty') {
        await initLocalMicrophoneRef.current();
      }

      // Join the slot room with user metadata
      socket.emit('join-gd-room', {
        slotId,
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

    // A new peer joined the room (incoming peer will send offer; do NOT pre-create unassociated transceivers)
    socket.on('peer-joined', async ({ peer }) => {
      if (!active) return;
      setPeers((prev) => {
        const filtered = prev.filter((p) => p.socketId !== peer.socketId);
        return [...filtered, peer];
      });
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
              // Polite peer rolls back local offer to accept incoming offer
              await pc.setLocalDescription({ type: 'rollback' });
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
            }
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (candErr) {}
          } else {
            const q = iceCandidateQueueRef.current.get(from) || [];
            q.push(signal.candidate);
            iceCandidateQueueRef.current.set(from, q);
          }
        }
      } catch (e) {
        console.warn('[WebRTC Signaling error]:', e);
      }
    });

    // A peer updated speaking/mic/camera state
    socket.on('peer-speaking-updated', ({ socketId: peerSockId, isSpeaking, micActive, cameraActive, volumeLevel: peerVol }) => {
      if (!active) return;
      if ((isSpeaking || micActive) && audioElementsRef.current.has(peerSockId)) {
        const audioEl = audioElementsRef.current.get(peerSockId);
        if (audioEl) {
          audioEl.muted = false;
          audioEl.volume = 1.0;
          if (audioEl.paused) {
            audioEl.play().catch(() => {});
          }
        }
      }
      setPeers((prev) =>
        prev.map((p) =>
          p.socketId === peerSockId
            ? { ...p, isSpeaking, micActive: micActive ?? p.micActive, cameraActive: cameraActive ?? p.cameraActive, volumeLevel: peerVol }
            : p
        )
      );
    });

    // A peer disconnected from the slot
    socket.on('peer-left', ({ socketId: leftSockId }) => {
      if (!active) return;
      detachRemoteAudioRef.current(leftSockId);
      const pc = peerConnectionsRef.current.get(leftSockId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(leftSockId);
      }
      setPeers((prev) => prev.filter((p) => p.socketId !== leftSockId));
    });

    // 20-Second Silence Deadlock Countdown Tick
    socket.on('silence-timer-tick', ({ silenceTimerSeconds: tickSec }) => {
      if (!active) return;
      setSilenceTimerSeconds(tickSec);
      silenceTimerCounterRef.current = tickSec;
    });

    // Synchronized Live Transcript Chunk Broadcast
    socket.on('new-transcript', ({ transcript }) => {
      if (!active) return;
      if (onNewTranscriptRef.current) {
        onNewTranscriptRef.current(transcript);
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

    socket.on('floor-state', ({ speakerId, speakerName }: any) => {
      if (!active) return;
      floorSpeakerIdRef.current = speakerId || null;
      setFloorSpeakerId(speakerId || null);
      const isOtherSpeaking = !!speakerId && speakerId !== currentUserRef.current?.id;
      setIsFloorLocked(isOtherSpeaking);
      setFloorSpeakerName(speakerName || (isOtherSpeaking ? 'Another Participant' : null));

      // Continuous open mic: do NOT forcefully mute audio tracks when someone else speaks
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach((track) => {
          track.enabled = !isMicMutedRef.current;
        });
      }

      if (speakerId && speakerId !== 'facilitator' && roomVoice.isSpeaking()) {
        roomVoice.stop();
      }
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
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        setIsMicMuted(true);
        setIsSpeakingLive(false);
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
      audioElementsRef.current.clear();

      socket.disconnect();
    };
  }, [slotId, currentUser?.id]);

  // Set explicit microphone enabled state (true = unmuted, false = muted)
  const setMicEnabled = useCallback(async (enabled: boolean) => {
    // If mic not yet acquired, initialize it now
    if (!localStreamRef.current && currentUserRef.current?.role !== 'faculty') {
      await initLocalMicrophone();
    }

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = enabled;
      }
      setIsMicMuted(!enabled);

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
    if (currentUserRef.current?.role === 'faculty') return;

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
        if (pc.signalingState === 'stable') {
          await renegotiatePeerRef.current(peerSocketId, pc);
        }
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

  // Explicitly notify room that participant has yielded the floor
  const notifySpeakingFinished = useCallback(() => {
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

  const getLocalAudioStream = useCallback(() => localStreamRef.current, []);

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
    getLocalAudioStream,
    broadcastTranscript,
    startSession,
    finishSession,
    requestAiIntervention,
    broadcastFacilitatorSpeech,
    notifySpeakingFinished,
    isFloorLocked,
    floorSpeakerName,
    floorSpeakerId,
    error,
  };
}
