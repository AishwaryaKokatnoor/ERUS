import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthUser } from '../types/auth';
import { GDTranscript } from '../types/gd';

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
  onNewTranscript?: (transcript: GDTranscript) => void;
  onFacilitatorIntervention?: (intervention: {
    text: string;
    action: string;
    transcript: GDTranscript;
    targetUserId?: string;
    targetSeatNumber?: number;
  }) => void;
  onSessionStarted?: (data: any) => void;
  onAiParticipantSpeech?: (data: any) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Google & Cloudflare Global STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // OpenRelay Public TURN (UDP) for Symmetric NAT & strict proxies
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelay',
      credential: 'openrelay',
    },
    // OpenRelay Public TURN (TCP - port 443 HTTPS bypass for UDP-blocking firewalls)
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTCRoom({
  slotId,
  currentUser,
  onNewTranscript,
  onFacilitatorIntervention,
  onSessionStarted,
  onAiParticipantSpeech,
}: UseWebRTCRoomOptions) {
  const [connected, setConnected] = useState(false);
  const [assignedSeat, setAssignedSeat] = useState<number>(currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber || 1 : 1);
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [aiParticipants, setAiParticipants] = useState<any[]>([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [silenceTimerSeconds, setSilenceTimerSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerCounterRef = useRef<number>(0);
  const speakingStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Server-authoritative floor owner. A participant may only enable their
  // outgoing microphone when the floor is free or belongs to them.
  const floorSpeakerIdRef = useRef<string | null>(null);
  const handledAiTranscriptIdsRef = useRef<Set<string>>(new Set());

  // Keep the latest UI callbacks without recreating the Socket.IO connection on every React render.
  // The GD room receives frequent transcript/floor updates, so reconnecting on each render can
  // cause clients to miss AI participant speech events. These refs keep handlers current while
  // the socket lifecycle stays tied only to the room/user identity.
  const onNewTranscriptRef = useRef(onNewTranscript);
  const onFacilitatorInterventionRef = useRef(onFacilitatorIntervention);
  const onSessionStartedRef = useRef(onSessionStarted);
  const onAiParticipantSpeechRef = useRef(onAiParticipantSpeech);
  onNewTranscriptRef.current = onNewTranscript;
  onFacilitatorInterventionRef.current = onFacilitatorIntervention;
  onSessionStartedRef.current = onSessionStarted;
  onAiParticipantSpeechRef.current = onAiParticipantSpeech;

  // 1. Play incoming peer audio stream through browser speakers
  const attachRemoteAudio = useCallback((peerSocketId: string, stream: MediaStream) => {
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
    audioEl.srcObject = stream;
    audioEl.play().catch((e) => {
      console.warn('[WebRTC Audio Playback Notice]:', e);
      // If browser blocked autoplay, unlock audio on user's first click anywhere on screen
      const unlockAudio = () => {
        audioEl?.play().catch(() => {});
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);
    });
  }, []);

  // 2. Remove peer audio element on disconnect
  const detachRemoteAudio = useCallback((peerSocketId: string) => {
    const audioEl = audioElementsRef.current.get(peerSocketId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      audioElementsRef.current.delete(peerSocketId);
    }
  }, []);

  // 3. Create or get RTCPeerConnection for a specific peer
  const getOrCreatePeerConnection = useCallback((peerSocketId: string): RTCPeerConnection => {
    let pc = peerConnectionsRef.current.get(peerSocketId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(peerSocketId, pc);

    // Add local microphone audio track to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc?.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE Candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal-send', {
          to: peerSocketId,
          signal: { candidate: event.candidate },
        });
      }
    };

    // When remote audio track is received from peer, stream it to speakers
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        attachRemoteAudio(peerSocketId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
        detachRemoteAudio(peerSocketId);
        peerConnectionsRef.current.delete(peerSocketId);
      }
    };

    return pc;
  }, [attachRemoteAudio, detachRemoteAudio]);

  // 4. Initialize Local Microphone & Real-time Volume Analyzer
  const initLocalMicrophone = useCallback(async () => {
    try {
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

      // Start with audio tracks muted by default until user explicitly activates mic
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setIsMicMuted(true);

      // Attach tracks to any peer connections that were established before mic was ready
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          const hasTrack = senders.some((s) => s.track === track);
          if (!hasTrack) {
            pc.addTrack(track, stream);
          }
        });
      });

      // Setup Web Audio Analyser for speaking detection & audio visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setLocalVolume(Math.min(100, Math.round((avg / 128) * 100)));

          // Detect speaking when volume exceeds threshold (value > 12)
          const speakingNow = avg > 12 && !isMicMuted;
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
                micActive: !isMicMuted,
                volumeLevel: Math.round(avg),
              });
            }
          } else {
            if (!speakingStateTimeoutRef.current && socketRef.current) {
              speakingStateTimeoutRef.current = setTimeout(() => {
                socketRef.current?.emit('peer-speaking-state', {
                  slotId,
                  isSpeaking: false,
                  micActive: !isMicMuted,
                  volumeLevel: 0,
                });
                speakingStateTimeoutRef.current = null;
              }, 1800);
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
  }, [slotId, isMicMuted]);

  // 5. Connect to Socket.IO Server & Room Signaling
  useEffect(() => {
    let active = true;

    // Connect socket (relative origin works seamlessly on both localhost and Railway)
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', async () => {
      if (!active) return;
      setConnected(true);

      // Acquire microphone
      await initLocalMicrophone();

      // Join the slot room with user metadata
      socket.emit('join-gd-room', {
        slotId,
        user: {
          id: currentUser?.id || `anon-${socket.id}`,
          name: currentUser?.name || 'Student Participant',
          avatar: currentUser?.avatar || '',
          role: currentUser?.role || 'student',
          college: currentUser?.college || 'Campus Participant',
          seatNumber: currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber : undefined,
        },
      });
    });

    // Received initial room state
    socket.on('gd-room-joined', async ({ assignedSeat: mySeat, peers: existingPeers, silenceTimerSeconds: initialSilence, aiParticipants: initialAiParticipants, simulationMode: initialSimulationMode }) => {
      if (!active) return;
      setAssignedSeat(mySeat);
      setPeers(existingPeers || []);
      setAiParticipants(Array.isArray(initialAiParticipants) ? initialAiParticipants : []);
      setSimulationMode(Boolean(initialSimulationMode));
      setSilenceTimerSeconds(initialSilence || 0);

      // Initiate WebRTC offers to all peers already in the room
      if (existingPeers && existingPeers.length > 0) {
        for (const remotePeer of existingPeers) {
          try {
            const pc = getOrCreatePeerConnection(remotePeer.socketId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal-send', {
              to: remotePeer.socketId,
              signal: { sdp: offer },
            });
          } catch (e) {
            console.warn('[WebRTC createOffer error]:', e);
          }
        }
      }
    });

    // A new peer joined the room
    socket.on('peer-joined', ({ peer }) => {
      if (!active) return;
      setPeers((prev) => {
        const filtered = prev.filter((p) => p.socketId !== peer.socketId);
        return [...filtered, peer];
      });
      // Prepare peer connection for incoming offer from newly joined peer
      getOrCreatePeerConnection(peer.socketId);
    });

    // WebRTC Signaling Relay Received (Offer, Answer, ICE Candidate)
    socket.on('signal-receive', async ({ from, signal }) => {
      if (!active) return;
      const pc = getOrCreatePeerConnection(from);

      try {
        if (signal.sdp) {
          if (signal.sdp.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued ICE candidates received before remote description was ready
            const queued = iceCandidateQueueRef.current.get(from) || [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (err) {}
            }
            iceCandidateQueueRef.current.delete(from);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal-send', {
              to: from,
              signal: { sdp: answer },
            });
          } else if (signal.sdp.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued ICE candidates received before remote description was ready
            const queued = iceCandidateQueueRef.current.get(from) || [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (err) {}
            }
            iceCandidateQueueRef.current.delete(from);
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
      detachRemoteAudio(leftSockId);
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

      // In autonomous AI simulation mode, use the transcript as a reliable
      // fallback trigger for AI speech if the companion Socket.IO event was
      // missed by the browser.
      const speakerId = String(transcript?.speakerId || '');
      if (speakerId.startsWith('ai-') && transcript?.id) {
        if (!handledAiTranscriptIdsRef.current.has(String(transcript.id))) {
          handledAiTranscriptIdsRef.current.add(String(transcript.id));
          onAiParticipantSpeechRef.current?.({
            participant: {
              id: speakerId,
              name: transcript.speakerName,
              seatNumber: transcript.seatNumber,
              avatar: '',
              role: 'student',
              college: 'ERUS AI Participant',
            },
            transcript,
            text: transcript.text,
            simulationMode: true,
          });
        }
      }

      if (onNewTranscriptRef.current) {
        onNewTranscriptRef.current(transcript);
      }
    });

    // AI Facilitator Autonomous Intervention (Deadlock question or dominance nudge)
    socket.on('facilitator-intervention', (intervention) => {
      if (!active) return;
      if (onFacilitatorInterventionRef.current) {
        onFacilitatorInterventionRef.current(intervention);
      }
    });

    // Autonomous AI simulation mode: connected humans are observers and
    // their microphones must remain disabled for the duration of the simulation.
    socket.on('simulation-mode', () => {
      if (!active) return;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setIsMicMuted(true);
      setIsSpeakingLive(false);
    });

    // Server-enforced single-speaker floor. If another participant owns
    // the floor, immediately stop this client's outgoing microphone track.
    socket.on('floor-busy', ({ message }) => {
      if (!active) return;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setIsMicMuted(true);
      setIsSpeakingLive(false);
      // Do not leave a stale error banner after the speaker finishes.
      if (message) {
        setError(message);
        window.setTimeout(() => setError(null), 2500);
      }
    });

    socket.on('floor-state', ({ speakerId }) => {
      if (!active) return;
      floorSpeakerIdRef.current = speakerId || null;

      // The server owns the floor. If another participant owns it, hard-mute
      // this client's outgoing WebRTC track immediately. MediaStreamTrack.enabled
      // sends silence while disabled, so the remote peer cannot hear overlap.
      const isAnotherSpeaker = !!speakerId && speakerId !== currentUser?.id;
      if (isAnotherSpeaker && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        setIsMicMuted(true);
        setIsSpeakingLive(false);
      }

      // Never automatically unmute when the floor opens. The participant must
      // explicitly enable the microphone again, preventing accidental overlap.
      if (!speakerId) {
        setError(null);
      }
    });

    // AI participant contribution broadcast. Every browser receives and vocalizes
    // the same contribution, so AI participants behave like room participants.
    socket.on('ai-participant-speech', (data) => {
      if (!active) return;
      // Keep the server-authoritative AI roster in sync with every turn so
      // the seat cards immediately show 1, 2, 3... speaking turns instead of
      // being reset to zero by the roster effect.
      if (data?.participant?.id) {
        setAiParticipants((prev) => prev.map((p) =>
          p.id === data.participant.id ? { ...p, ...data.participant } : p
        ));
      }
      if (data?.transcript?.id) {
        handledAiTranscriptIdsRef.current.add(String(data.transcript.id));
      }
      onAiParticipantSpeechRef.current?.(data);
    });

    // Faculty Commences Session Broadcast
    socket.on('session-started', (data) => {
      if (!active) return;
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
  }, [slotId, currentUser, initLocalMicrophone, getOrCreatePeerConnection, detachRemoteAudio]);

  // Toggle local microphone mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextMuted = audioTrack.enabled; // If enabled, toggles to muted (disabled)
        audioTrack.enabled = !nextMuted;
        setIsMicMuted(!nextMuted);

        if (socketRef.current) {
          socketRef.current.emit('peer-speaking-state', {
            slotId,
            isSpeaking: false,
            micActive: !nextMuted,
            volumeLevel: 0,
          });
        }
      }
    }
  }, [slotId]);

  // Set explicit microphone enabled state (true = unmuted, false = muted)
  const setMicEnabled = useCallback((enabled: boolean) => {
    if (enabled && floorSpeakerIdRef.current && floorSpeakerIdRef.current !== currentUser?.id) {
      setIsMicMuted(true);
      setIsSpeakingLive(false);
      setError('Another participant is speaking. Please wait for the floor to open.');
      window.setTimeout(() => setError(null), 2500);
      return;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setIsMicMuted(!enabled);

      if (socketRef.current) {
        // Enabling the microphone must NOT claim the speaking floor. The audio
        // VAD below claims it only after actual speech is detected.
        socketRef.current.emit('peer-speaking-state', {
          slotId,
          isSpeaking: false,
          micActive: enabled,
          volumeLevel: 0,
        });
      }
    }
  }, [slotId, currentUser?.id]);

  // Broadcast spoken transcript to all room members
  const broadcastTranscript = useCallback((text: string, elapsedSeconds: number, transcriptId?: string) => {
    if (socketRef.current && text.trim()) {
      socketRef.current.emit('peer-transcript', {
        slotId,
        text: text.trim(),
        elapsedSeconds,
        transcriptId,
      });
    }
  }, [slotId]);

  // Start GD Session (emits start-session to server)
  const startSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('start-session', { slotId });
    }
  }, [slotId]);

  return {
    connected,
    assignedSeat,
    peers,
    aiParticipants,
    simulationMode,
    silenceTimerSeconds,
    isMicMuted,
    isSpeakingLive,
    localVolume,
    toggleMute,
    setMicEnabled,
    broadcastTranscript,
    startSession,
    error,
  };
}
