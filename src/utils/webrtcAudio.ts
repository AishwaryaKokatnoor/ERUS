/**
 * WebRTC Audio Mesh Manager for ERUS Group Discussion
 * Enables real-time, peer-to-peer microphone voice streaming between devices.
 */

import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class WebRTCAudioManager {
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private currentUserId: string | null = null;
  private localStream: MediaStream | null = null;
  private isMicActive: boolean = false;
  private isMuted: boolean = false;

  // Remote peer connections: socketId -> RTCPeerConnection
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  // Remote audio elements: socketId -> HTMLAudioElement
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  // Tracks peers currently streaming audible audio
  private activeAudioPeers: Set<string> = new Set();
  // Mapping from studentId/userId to socketId
  private userToSocketMap: Map<string, string> = new Map();

  /**
   * Initialize WebRTC for the active discussion room
   */
  public initialize(socket: Socket, roomId: string, userId: string) {
    this.cleanup();
    this.socket = socket;
    this.roomId = roomId;
    this.currentUserId = userId;

    console.log(`[WebRTC Audio] Initializing for room "${roomId}", user "${userId}"`);

    // Listen for WebRTC signals from peers
    this.socket.off('webrtc_signal', this.handleWebRTCSignal);
    this.socket.on('webrtc_signal', this.handleWebRTCSignal);

    // Handle peer leaving
    this.socket.off('user_left', this.handleUserLeft);
    this.socket.on('user_left', this.handleUserLeft);
  }

  /**
   * Sync room participants to maintain user-to-socket mapping and establish peer mesh
   */
  public syncRoomParticipants(participants: Array<{ socketId?: string; userId?: string; id?: string }>) {
    if (!this.socket || !this.socket.id) return;
    const selfSocketId = this.socket.id;

    participants.forEach((p) => {
      const sId = p.socketId;
      const uId = p.userId || p.id;
      if (sId && uId) {
        this.userToSocketMap.set(uId, sId);
      }

      if (sId && sId !== selfSocketId && !this.peerConnections.has(sId)) {
        // Deterministic offerer: lower socketId initiates to prevent offer collision
        const shouldInitiate = selfSocketId < sId;
        this.setupPeerConnection(sId, shouldInitiate);
      }
    });
  }

  /**
   * Enable local microphone and attach tracks to all peer connections
   */
  public async enableMicrophone(): Promise<MediaStream | null> {
    try {
      if (!this.localStream) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('[WebRTC Audio] getUserMedia not supported in this browser.');
          return null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        this.localStream = stream;
      }

      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;

        // Propagate audio track to all peer connections
        this.peerConnections.forEach((pc, targetSocketId) => {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track?.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch((e) => {
              console.warn(`[WebRTC Audio] Error replacing track for ${targetSocketId}:`, e);
            });
          } else {
            try {
              pc.addTrack(audioTrack, this.localStream!);
              this.renegotiatePeer(targetSocketId);
            } catch (err) {
              console.warn(`[WebRTC Audio] Error adding track to ${targetSocketId}:`, err);
            }
          }
        });
      }

      this.isMicActive = true;
      console.log('[WebRTC Audio] Local microphone enabled and broadcast to peers.');
      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC Audio] Failed to enable microphone:', err);
      return null;
    }
  }

  /**
   * Disable local microphone track
   */
  public disableMicrophone() {
    this.isMicActive = false;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    console.log('[WebRTC Audio] Local microphone muted.');
  }

  /**
   * Toggle mute for all incoming remote audio
   */
  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.remoteAudioElements.forEach((audio) => {
      audio.muted = muted;
    });
  }

  /**
   * Check if live WebRTC audio is actively flowing from a peer
   */
  public isPeerAudioActive(studentIdOrSocketId: string): boolean {
    const socketId = this.userToSocketMap.get(studentIdOrSocketId) || studentIdOrSocketId;
    return this.activeAudioPeers.has(socketId);
  }

  /**
   * Setup a WebRTC PeerConnection for a remote participant
   */
  private setupPeerConnection(targetSocketId: string, isInitiator: boolean): RTCPeerConnection {
    if (this.peerConnections.has(targetSocketId)) {
      return this.peerConnections.get(targetSocketId)!;
    }

    console.log(`[WebRTC Audio] Creating peer connection with ${targetSocketId} (initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(targetSocketId, pc);

    // Attach local audio track if already active
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        pc.addTrack(track, this.localStream);
      }
    }

    // ICE Candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc_signal', {
          targetSocketId,
          signal: event.candidate,
          type: 'candidate',
        });
      }
    };

    // Remote audio track received
    pc.ontrack = (event) => {
      console.log(`[WebRTC Audio] Remote audio track received from ${targetSocketId}`);
      if (event.streams && event.streams[0]) {
        this.playRemoteAudio(targetSocketId, event.streams[0]);
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Audio] Peer ${targetSocketId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.activeAudioPeers.delete(targetSocketId);
      } else if (pc.connectionState === 'connected') {
        this.activeAudioPeers.add(targetSocketId);
      }
    };

    if (isInitiator) {
      this.initiateOffer(targetSocketId, pc);
    }

    return pc;
  }

  /**
   * Create and send SDP Offer to peer
   */
  private async initiateOffer(targetSocketId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      if (this.socket) {
        this.socket.emit('webrtc_signal', {
          targetSocketId,
          signal: offer,
          type: 'offer',
        });
      }
    } catch (err) {
      console.warn(`[WebRTC Audio] Error creating offer for ${targetSocketId}:`, err);
    }
  }

  /**
   * Renegotiate peer when track is added
   */
  private async renegotiatePeer(targetSocketId: string) {
    const pc = this.peerConnections.get(targetSocketId);
    if (!pc || pc.signalingState !== 'stable') return;
    this.initiateOffer(targetSocketId, pc);
  }

  /**
   * Play remote incoming audio stream
   */
  private playRemoteAudio(targetSocketId: string, stream: MediaStream) {
    try {
      let audio = this.remoteAudioElements.get(targetSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audio.muted = this.isMuted;
        audio.style.display = 'none';
        audio.setAttribute('data-peer-audio', targetSocketId);
        document.body.appendChild(audio);
        this.remoteAudioElements.set(targetSocketId, audio);
      }

      audio.srcObject = stream;
      this.activeAudioPeers.add(targetSocketId);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[WebRTC Audio] Successfully playing live audio from ${targetSocketId}`);
          })
          .catch((err) => {
            console.warn(`[WebRTC Audio] Autoplay pending interaction for ${targetSocketId}:`, err);
            const resumeAudio = () => {
              audio?.play().catch(() => {});
              window.removeEventListener('click', resumeAudio);
              window.removeEventListener('touchstart', resumeAudio);
            };
            window.addEventListener('click', resumeAudio, { once: true });
            window.addEventListener('touchstart', resumeAudio, { once: true });
          });
      }
    } catch (e) {
      console.warn(`[WebRTC Audio] playRemoteAudio error:`, e);
    }
  }

  /**
   * Incoming WebRTC signal handler
   */
  private handleWebRTCSignal = async (data: { senderSocketId: string; signal: any; type: string }) => {
    const { senderSocketId, signal, type } = data;
    if (!senderSocketId || !signal) return;

    try {
      if (type === 'offer') {
        const pc = this.setupPeerConnection(senderSocketId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.socket) {
          this.socket.emit('webrtc_signal', {
            targetSocketId: senderSocketId,
            signal: answer,
            type: 'answer',
          });
        }
      } else if (type === 'answer') {
        const pc = this.peerConnections.get(senderSocketId);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (type === 'candidate') {
        const pc = this.peerConnections.get(senderSocketId);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        }
      }
    } catch (err) {
      console.warn(`[WebRTC Audio] Error handling signal "${type}" from ${senderSocketId}:`, err);
    }
  };

  /**
   * User departure handler
   */
  private handleUserLeft = (data: { socketId: string; userId?: string }) => {
    if (data.socketId) {
      this.removePeer(data.socketId);
    }
  };

  /**
   * Remove peer connection and audio element
   */
  public removePeer(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }

    const audio = this.remoteAudioElements.get(socketId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      this.remoteAudioElements.delete(socketId);
    }

    this.activeAudioPeers.delete(socketId);
    console.log(`[WebRTC Audio] Peer ${socketId} removed.`);
  }

  /**
   * Clean up all WebRTC connections, audio elements, and local tracks
   */
  public cleanup() {
    this.disableMicrophone();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.remoteAudioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    });
    this.remoteAudioElements.clear();
    this.activeAudioPeers.clear();
    this.userToSocketMap.clear();

    if (this.socket) {
      this.socket.off('webrtc_signal', this.handleWebRTCSignal);
      this.socket.off('user_left', this.handleUserLeft);
    }
  }
}

export const webrtcAudio = new WebRTCAudioManager();
