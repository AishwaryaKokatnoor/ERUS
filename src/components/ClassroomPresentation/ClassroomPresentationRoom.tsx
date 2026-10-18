import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Play, CheckCircle2, 
  HelpCircle, Sparkles, Volume2, VolumeX, LogOut, MessageSquare, 
  Share2, Shield, Eye, Award, Clock, ArrowRight, ArrowLeft, UserCheck, 
  School, Radio, Laptop, GraduationCap, Monitor, ChevronLeft, ChevronRight,
  FileText, Send, X, Users
} from 'lucide-react';
import { 
  GDSession, Student, TranscriptEntry, PresentationPhase, 
  PresentationAssessmentReport 
} from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { useWebRTCRoom } from '../../hooks/useWebRTCRoom';
import { 
  PRESENTATION_OPENING_SCRIPT, 
  getPresentationOpeningScript,
  getSerialCallScript, 
  getPeerQAInvitationScript, 
  PEER_QA_SILENCE_SCRIPT, 
  generateAIQuestionForTopic, 
  getTransitionScript, 
  PRESENTATION_CLOSING_SCRIPT,
  calculatePresentationReport,
  DEFAULT_PRESENTATION_TOPICS,
  PresentationAIQuestion
} from '../../utils/classroomPresentationEngine';
import { useUserMedia } from '../../utils/useUserMedia';
import { roomVoice } from '../../utils/speechSynthesis';
import { useGDRecorder } from '../../utils/gdRecorder';

export interface ClassroomPresentationRoomProps {
  session: GDSession;
  setSession: React.Dispatch<React.SetStateAction<GDSession>>;
  transcripts: TranscriptEntry[];
  setTranscripts: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
  onFinishSession: () => void;
  onStartSession?: (slotId?: string) => void;
  voiceMuted: boolean;
  elapsedSeconds: number;
  availableSlots?: GDSession[];
  onSelectSlot?: (slotId: string) => void;
  onResetSlots?: () => void;
  currentUser?: AuthUser | null;
  bookedSlotId?: string | null;
  onBackToDashboard?: () => void;
}

// Isolated, Memoized Video Stream Player (Prevents React re-renders from restarting/glitching webcam)
const PresentationVideoStream = React.memo<{
  stream: MediaStream | null;
  className?: string;
  muted?: boolean;
}>(({ stream, className, muted = true }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const playVideo = () => {
      if (video) {
        const p = video.play();
        if (p !== undefined) {
          p.catch(() => {});
        }
      }
    };
    playVideo();

    video.onloadedmetadata = playVideo;
    video.oncanplay = playVideo;

    const handleTrackChange = () => {
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
      }
      playVideo();
    };

    stream.addEventListener('addtrack', handleTrackChange);
    stream.addEventListener('removetrack', handleTrackChange);
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('unmute', handleTrackChange);
    });

    return () => {
      stream.removeEventListener('addtrack', handleTrackChange);
      stream.removeEventListener('removetrack', handleTrackChange);
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener('unmute', handleTrackChange);
      });
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      data-stream-id={stream?.id || ''}
      className={className || 'w-full h-full object-cover'}
    />
  );
});
PresentationVideoStream.displayName = 'PresentationVideoStream';

export const ClassroomPresentationRoom: React.FC<ClassroomPresentationRoomProps> = ({
  session,
  setSession,
  transcripts,
  setTranscripts,
  onFinishSession,
  onStartSession,
  voiceMuted,
  elapsedSeconds,
  availableSlots = [],
  onSelectSlot,
  currentUser,
  onBackToDashboard,
}) => {
  const isFaculty = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin';

  // User media (camera & mic)
  const { isCameraOn, videoStream, toggleCamera, audioStream } = useUserMedia();
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const isMicOnRef = useRef<boolean>(false);
  const [isRoomAudioMuted, setIsRoomAudioMuted] = useState<boolean>(voiceMuted);
  const [isSharingScreen, setIsSharingScreen] = useState<boolean>(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [slideMode, setSlideMode] = useState<'screen' | 'deck'>('deck');
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [presenterSeconds, setPresenterSeconds] = useState<number>(0);
  const [activeStudentIndex, setActiveStudentIndex] = useState<number>(0);

  // Real-Time Multi-User WebRTC & Socket signaling for Classroom Presentation
  const {
    connected: isSocketConnected,
    assignedSeat: rtcAssignedSeat,
    peers: rtcPeers,
    peerStreams: rtcPeerStreams,
    broadcastTranscript: rtcBroadcastTranscript,
    broadcastFacilitatorSpeech: rtcBroadcastFacilitatorSpeech,
    toggleMute: rtcToggleMute,
    setMicEnabled: rtcSetMicEnabled,
    localAudioStream: rtcLocalAudioStream,
  } = useWebRTCRoom({
    slotId: session.slotId || session.id || 'slot-presentation-1',
    currentUser,
    videoStream,
    isCameraOn,
    onRoomJoined: (roomData) => {
      if (roomData.status === 'active') {
        setSession((prev) => ({
          ...prev,
          status: 'active',
          topic: roomData.topic || prev.topic,
        }));
      }
      if (roomData.transcripts && roomData.transcripts.length > 0) {
        setTranscripts(roomData.transcripts);
      }
    },
    onSessionStarted: () => {
      setSession((prev) => ({
        ...prev,
        status: 'active',
        startedAt: prev.startedAt || Date.now(),
      }));
    },
    onNewTranscript: (entry) => {
      setTranscripts((prev) => {
        if (prev.some((t) => t.id === entry.id || (t.text === entry.text && t.speakerName === entry.speakerName))) {
          return prev;
        }
        return [...prev, entry];
      });
    },
    onFacilitatorIntervention: (intervention) => {
      if (intervention.text) {
        setAiSpeech(intervention.text);
      }
      if (intervention.targetSeatNumber) {
        setActiveStudentIndex(intervention.targetSeatNumber - 1);
      }
    },
  });

  // 6 Real Presentation Slot Participants (No fake AI audience bots - similar to GD)
  const presentationStudents: Student[] = useMemo(() => {
    const capacity = 6;
    const seatMap = new Map<number, Student>();
    const usedSeats = new Set<number>();

    // 1. Current logged in user (if student, placed at assigned seat)
    const userSeat = Number(rtcAssignedSeat) || (currentUser && 'seatNumber' in currentUser ? Number((currentUser as any).seatNumber) : 1) || 1;
    const normalizedUserSeat = userSeat >= 1 && userSeat <= capacity ? userSeat : 1;
    
    if (currentUser?.role === 'student' || (!isFaculty && currentUser)) {
      usedSeats.add(normalizedUserSeat);
      seatMap.set(normalizedUserSeat, {
        id: currentUser.id || 'speaker-user',
        name: currentUser.name || 'You',
        college: currentUser.college || session.collegeCode || 'Institution',
        course: currentUser.course || 'Computer Science & Engineering',
        batch: currentUser.batch || '2024-2028',
        avatar: currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.name || 'presenter')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
        seatNumber: normalizedUserSeat,
        isUser: true,
        isRealPeer: false,
        isEmptySeat: false,
        micActive: isMicOn,
        cameraActive: isCameraOn,
        speakingTurns: 0,
        speakingDurationSeconds: presenterSeconds,
        videoStream: videoStream,
        isSpeaking: isMicOn,
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      });
    }

    // Strict filter to eliminate any AI participants or bots from Classroom Presentation
    const isAiParticipant = (p: any): boolean => {
      if (!p) return true;
      if (p.isAiParticipant || p.isDemoAI || p.isAI) return true;
      if (p.role === 'ai' || p.role === 'bot') return true;
      const id = String(p.id || '').toLowerCase();
      if (id.startsWith('ai-') || id.startsWith('bot-') || id.startsWith('sim-') || id.includes('ai-participant')) return true;
      const name = String(p.name || '').toLowerCase();
      if (
        name.includes('ai participant') ||
        name.startsWith('ai ') ||
        name.endsWith(' (ai)') ||
        name.includes('bot') ||
        name === 'ai'
      ) return true;
      return false;
    };

    // 2. Real remote student peers connected via WebRTC (strictly human, zero AI)
    const validStudentPeers = (rtcPeers || []).filter(
      (p) => p && p.role !== 'faculty' && p.role !== 'college_admin' && p.role !== 'super_admin' && !isAiParticipant(p)
    );

    validStudentPeers.forEach((peer) => {
      let desiredSeat = Number(peer.seatNumber);
      if (!desiredSeat || isNaN(desiredSeat) || desiredSeat < 1 || desiredSeat > capacity || usedSeats.has(desiredSeat)) {
        for (let s = 1; s <= capacity; s++) {
          if (!usedSeats.has(s)) {
            desiredSeat = s;
            break;
          }
        }
      }
      if (desiredSeat > capacity) return;
      usedSeats.add(desiredSeat);

      let remoteStream = rtcPeerStreams.get(peer.socketId) || (peer.userId ? rtcPeerStreams.get(peer.userId) : null) || null;
      if (!remoteStream && rtcPeerStreams.size > 0) {
        for (const [key, stream] of rtcPeerStreams.entries()) {
          if (key === peer.socketId || (peer.userId && (key === peer.userId || key.includes(peer.userId) || peer.userId.includes(key)))) {
            remoteStream = stream;
            break;
          }
        }
      }
      if (!remoteStream && rtcPeerStreams.size > 0) {
        if (validStudentPeers.length === 1) {
          remoteStream = Array.from(rtcPeerStreams.values())[0];
        } else {
          const videoStreams = Array.from(rtcPeerStreams.values()).filter(
            (s: any): s is MediaStream => Boolean(s && typeof s.getVideoTracks === 'function' && s.getVideoTracks().some((t: any) => t.readyState === 'live' || t.enabled))
          );
          if (videoStreams.length > 0) {
            remoteStream = videoStreams[0];
          }
        }
      }
      const hasActiveRemoteVideo = Boolean(
        remoteStream &&
        remoteStream.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled)
      );

      seatMap.set(desiredSeat, {
        id: peer.userId || peer.socketId,
        socketId: peer.socketId,
        userId: peer.userId,
        seatNumber: desiredSeat,
        name: peer.name || `Student ${desiredSeat}`,
        avatar: peer.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(peer.name || String(desiredSeat))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
        college: peer.college || session.collegeCode || 'Institution',
        course: (peer as any).course || 'Computer Science & Engineering',
        batch: (peer as any).batch || '2024-2028',
        isUser: false,
        isRealPeer: true,
        isEmptySeat: false,
        isSpeaking: !!peer.isSpeaking,
        micActive: !!peer.micActive,
        cameraActive: Boolean(peer.cameraActive || hasActiveRemoteVideo),
        speakingTurns: peer.speakingTurns || 0,
        speakingDurationSeconds: peer.speakingDurationSeconds || 0,
        videoStream: remoteStream,
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      });
    });

    // 3. Keep any actual registered students from session.students who aren't already placed (strictly real registered students, never dummy/AI)
    const existingEnrolled = Array.isArray(session.students) ? session.students : [];
    existingEnrolled.forEach((st) => {
      if (
        !st ||
        st.isEmptySeat ||
        st.isUser ||
        isAiParticipant(st) ||
        st.id?.startsWith('seat-') ||
        st.id?.startsWith('slot-stu-') ||
        st.id?.startsWith('slot-student-') ||
        st.id?.startsWith('stu-pres-') ||
        st.name?.startsWith('Seat ') ||
        (st as any).role === 'faculty' ||
        (st as any).role === 'college_admin' ||
        (st as any).role === 'super_admin' ||
        (currentUser?.id && st.id === currentUser.id) ||
        (currentUser?.name && st.name === currentUser.name)
      ) {
        return;
      }
      const alreadyPlaced = Array.from(seatMap.values()).some((p) => p.id === st.id || p.name === st.name);
      if (alreadyPlaced) return;

      let targetSeat = Number(st.seatNumber);
      if (!targetSeat || isNaN(targetSeat) || targetSeat < 1 || targetSeat > capacity || usedSeats.has(targetSeat)) {
        for (let s = 1; s <= capacity; s++) {
          if (!usedSeats.has(s)) {
            targetSeat = s;
            break;
          }
        }
      }
      if (targetSeat && !usedSeats.has(targetSeat) && targetSeat <= capacity) {
        usedSeats.add(targetSeat);
        seatMap.set(targetSeat, {
          ...st,
          seatNumber: targetSeat,
          isUser: false,
          isEmptySeat: false,
          isRealPeer: false,
          avatar: st.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(st.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
        });
      }
    });

    // Return strictly real participants (only current user, live peers, and verified slot enrollee students, never AI)
    const finalRealParticipants = Array.from(seatMap.values())
      .filter((s) => !s.isEmptySeat && !isAiParticipant(s) && !s.id?.startsWith('slot-student-') && s.college !== 'Available Desk')
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    // Fallback: If empty, at least ensure currentUser is present
    if (finalRealParticipants.length === 0 && currentUser) {
      return [{
        id: currentUser.id || 'speaker-user',
        name: currentUser.name || 'You',
        college: currentUser.college || session.collegeCode || 'Institution',
        course: currentUser.course || 'Computer Science & Engineering',
        batch: currentUser.batch || '2024-2028',
        avatar: currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.name || 'presenter')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
        seatNumber: 1,
        isUser: true,
        isRealPeer: false,
        isEmptySeat: false,
        micActive: isMicOn,
        cameraActive: isCameraOn,
        speakingTurns: 0,
        speakingDurationSeconds: presenterSeconds,
        videoStream: videoStream,
        isSpeaking: isMicOn,
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      }];
    }

    return finalRealParticipants;
  }, [
    session.students,
    session.collegeCode,
    currentUser,
    isFaculty,
    isCameraOn,
    isMicOn,
    videoStream,
    presenterSeconds,
    rtcAssignedSeat,
    rtcPeers,
    rtcPeerStreams,
  ]);

  // Per-student individual assigned topics
  const studentTopics = useMemo(() => {
    const mainTopic = (session.topic || '').trim();
    return presentationStudents.map((s, idx) => {
      if (session.presentationTopics && session.presentationTopics[idx]?.trim()) {
        return session.presentationTopics[idx].trim();
      }
      if (mainTopic) {
        return presentationStudents.length <= 1 || idx === 0 
          ? mainTopic 
          : `${mainTopic} (Part ${idx + 1})`;
      }
      return DEFAULT_PRESENTATION_TOPICS[idx] || 'Technical Presentation & Research Analysis';
    });
  }, [presentationStudents, session.presentationTopics, session.topic]);


  // Activity Execution State (Serial Flow per PDF specification)
  const [phase, setPhase] = useState<PresentationPhase>('opening');
  const [aiSpeech, setAiSpeech] = useState<string>(() =>
    getPresentationOpeningScript(session.topic, presentationStudents.length)
  );
  const [aiSpeaking, setAiSpeaking] = useState<boolean>(false);
  const [peerQAQuestion, setPeerQAQuestion] = useState<string>('');
  const [currentAiQuestion, setCurrentAiQuestion] = useState<PresentationAIQuestion | null>(null);
  const [isPeerQASilenceTriggered, setIsPeerQASilenceTriggered] = useState<boolean>(false);
  const [qaTimerSeconds, setQaTimerSeconds] = useState<number>(0);


  // Presentation slides generated for currentTopic
  const topicSlides = useMemo(() => {
    const t = studentTopics[activeStudentIndex] || session.topic || 'Engineering System Architecture';
    return [
      {
        num: 1,
        title: `${t}`,
        subtitle: 'Architecture, Foundational Principles & Core Objectives',
        bullets: [
          'Problem definition and the technological rationale behind this architecture',
          'Primary functional layers and mathematical/computational foundations',
          'Scope of research, modern industrial relevance, and project boundaries'
        ],
        badge: 'Slide 1 of 4 • Topic Overview'
      },
      {
        num: 2,
        title: 'Core Methodologies & Technical Mechanisms',
        subtitle: 'Workflow Pipeline, Algorithms & Operational Protocols',
        bullets: [
          'End-to-end data processing lifecycle and algorithmic execution flow',
          'Latency reduction, concurrency management, and hardware/software interfaces',
          'Fault tolerance, reliability metrics, and performance optimizations'
        ],
        badge: 'Slide 2 of 4 • Mechanism Analysis'
      },
      {
        num: 3,
        title: 'Real-World Applications & Industry Impact',
        subtitle: 'Enterprise Deployments, Case Studies & Empirical Benchmarks',
        bullets: [
          'Production use-cases across engineering and digital infrastructure',
          'Empirical benchmark comparison against traditional baseline implementations',
          'Cost efficiency, operational scaling, and environmental sustainability trade-offs'
        ],
        badge: 'Slide 3 of 4 • Practical Industry Impact'
      },
      {
        num: 4,
        title: 'Technical Challenges, Future Scope & Summary',
        subtitle: 'Critical Limitations, Emerging Trends & Concluding Takeaways',
        bullets: [
          'Identified bottlenecks, security considerations, and open research challenges',
          'Projected technological advancements and convergence over the next 5 years',
          'Summary of technical recommendations and readiness for Q&A discussion'
        ],
        badge: 'Slide 4 of 4 • Concluding Discussion'
      }
    ];
  }, [activeStudentIndex, studentTopics, session.topic]);

  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
      }
      setScreenStream(null);
      setIsSharingScreen(false);
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
          setScreenStream(stream);
          setSlideMode('screen');
          setIsSharingScreen(true);

          const track = stream.getVideoTracks()[0];
          if (track) {
            track.onended = () => {
              setScreenStream(null);
              setIsSharingScreen(false);
            };
          }
        } else {
          setSlideMode('deck');
          setIsSharingScreen(true);
        }
      } catch (e) {
        console.warn('Display media not selected, opening slide deck viewer:', e);
        setSlideMode('deck');
        setIsSharingScreen(true);
      }
    }
  };

  // Live Speech Recognition for User
  const [liveSpeech, setLiveSpeech] = useState<string>('');
  const [typedMessage, setTypedMessage] = useState<string>('');
  const speechRecognitionRef = useRef<any>(null);
  const hasStartedOpeningRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  const currentStudentNumber = activeStudentIndex + 1;
  const currentPresenter = presentationStudents[activeStudentIndex] || presentationStudents[0];
  const isUserPodiumPresenter = Boolean(currentPresenter?.isUser);
  const currentTopic = studentTopics[activeStudentIndex] || session.topic;

  const activeSlide = topicSlides[currentSlideIndex] || topicSlides[0];

  // Automated Presentation Video/Audio Recorder (Saved to Faculty Dashboard with presentation stage layout)
  const gdRecorder = useGDRecorder({
    slotId: session.slotId || session.id || 'slot-1',
    isSessionActive: session.status === 'active',
    localStream: videoStream,
    localAudioStream: audioStream || rtcLocalAudioStream,
    peerStreams: rtcPeerStreams,
    recordVideo: true,
    enabled: true,
    topicTitle: currentTopic || session.topic || 'Classroom Presentation',
    layoutMode: 'presentation',
    screenStream: (typeof screenStream !== 'undefined' && isSharingScreen && slideMode === 'screen') ? screenStream : null,
    presentationInfo: {
      badge: activeSlide?.badge,
      title: activeSlide?.title,
      subtitle: activeSlide?.subtitle,
      bullets: activeSlide?.bullets,
      currentSlideIndex: currentSlideIndex + 1,
      totalSlides: topicSlides.length,
      slideMode: isSharingScreen && slideMode === 'screen' ? 'screen' : 'deck',
      phase,
      presenterName: currentPresenter?.name || 'Candidate',
      presenterCollege: currentPresenter?.college || session.collegeCode || 'Institution',
      aiGuidance: aiSpeech || '',
    },
    currentSpeakerId: currentPresenter?.id,
    currentSpeakerName: currentPresenter?.name,
    latestTranscriptText: liveSpeech || (transcripts.length > 0 ? transcripts[transcripts.length - 1].text : ''),
    participantTiles: presentationStudents.map((st) => ({
      id: st.id,
      socketId: st.socketId,
      userId: st.userId,
      name: st.name,
      college: st.college,
      seatNumber: st.seatNumber,
      isSpeaking: st.id === currentPresenter?.id ? (st.isUser ? isMicOn : st.isSpeaking) : st.isSpeaking,
      cameraActive: st.isUser ? isCameraOn : st.cameraActive,
      isUser: st.isUser,
      isMuted: st.isUser ? !isMicOn : !st.micActive,
      videoStream: st.isUser ? (videoStream || st.videoStream) : st.videoStream,
    })),
    autoStartOnActive: true,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__erusStopAndUploadRecording = () =>
        gdRecorder.stopAndUploadRecording(session.slotId || session.id);
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__erusStopAndUploadRecording;
      }
    };
  }, [gdRecorder, session.slotId, session.id]);

  // Append entry to live activity transcript feed
  const addTranscriptEntry = (speakerName: string, text: string, isFacilitator = false) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    const newEntry: TranscriptEntry = {
      id: `pres-trans-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: session.id,
      speakerId: isFacilitator ? 'facilitator' : (currentPresenter?.id || 'presenter'),
      speakerName,
      seatNumber: isFacilitator ? null : (currentPresenter?.seatNumber ?? 1),
      text: clean,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestampSeconds: elapsedSeconds,
      type: isFacilitator ? 'moderation' : 'statement',
      isFacilitator,
      sentiment: 'neutral',
    };
    if (rtcBroadcastTranscript && isSocketConnected) {
      rtcBroadcastTranscript(newEntry);
    }
    setTranscripts((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].text === clean && prev[prev.length - 1].isFacilitator === isFacilitator) {
        return prev;
      }
      return [...prev, newEntry];
    });
  };

  const handleSendTypedMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = typedMessage.trim();
    if (!text) return;
    addTranscriptEntry(currentUser?.name || currentPresenter?.name || 'Participant', text, false);
    setTypedMessage('');
  };

  // Seed initial welcome transcript briefing immediately so transcript is never blank
  useEffect(() => {
    if (transcripts.length === 0) {
      const topicName = session.topic || 'Engineering Presentation';
      addTranscriptEntry(
        'ERUS AI Instructor',
        `Welcome to the Classroom Seminar Hall. Today's presentation session is focused on "${topicName}". Each presenter has 6 to 8 minutes for their delivery, followed by Peer Q&A and AI evaluation.`,
        true
      );
    }
  }, []);

  // Auto-scroll transcript feed
  useEffect(() => {
    if (transcriptBottomRef.current) {
      transcriptBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts]);

  // Speak script via RoomVoiceEngine with Indian English tone and robust chunking
  const speakAI = (text: string, onEnd?: () => void) => {
    const clean = String(text || '').trim();
    setAiSpeech(clean);
    addTranscriptEntry('ERUS AI Instructor', clean, true);
    if (rtcBroadcastFacilitatorSpeech && isSocketConnected) {
      rtcBroadcastFacilitatorSpeech(clean, 'presentation_facilitator_guidance');
    }
    if (!clean || isRoomAudioMuted) {
      if (onEnd) setTimeout(onEnd, 1200);
      return;
    }

    setAiSpeaking(true);
    roomVoice.speakAsFacilitator(clean, () => {
      setAiSpeaking(false);
      if (onEnd) onEnd();
    }, true);
  };

  // Stage 2: Call specific student in serial order (Student 1 to 6)
  const callStudentToPresent = (studentNum: number) => {
    const idx = studentNum - 1;
    setActiveStudentIndex(idx);
    setPresenterSeconds(0);
    setPhase('presenting');
    setIsPeerQASilenceTriggered(false);
    setCurrentAiQuestion(null);
    setPeerQAQuestion('');

    const targetStudent = presentationStudents[idx];
    const targetTopic = studentTopics[idx];
    const script = getSerialCallScript(studentNum, targetStudent?.name, targetTopic);

    speakAI(script);
  };

  const startOpeningSequence = () => {
    if (hasStartedOpeningRef.current) return;
    hasStartedOpeningRef.current = true;
    const openingScript = getPresentationOpeningScript(session.topic, presentationStudents.length);
    speakAI(openingScript, () => {
      callStudentToPresent(1);
    });
  };

  const handleFacultyStartPresentation = () => {
    setSession((prev) => ({
      ...prev,
      status: 'active',
      startedAt: prev.startedAt || Date.now(),
    }));
    onStartSession?.(session.id);
    startOpeningSequence();
  };

  // Start Presentation Activity (Stage 1: Opening)
  useEffect(() => {
    if (session.status === 'active' && phase === 'opening' && !hasStartedOpeningRef.current) {
      startOpeningSequence();
    }
  }, [session.status, phase]);

  // Presenter Speaking Timer (tracks 6 to 8 minutes)
  useEffect(() => {
    if (phase !== 'presenting' || session.status !== 'active') return;
    const timer = setInterval(() => {
      setPresenterSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, session.status]);

  // Stage 3: Initiate Peer Q&A
  const handleCompletePresentation = () => {
    setPhase('peer_qa');
    setQaTimerSeconds(0);
    setIsPeerQASilenceTriggered(false);

    // Call next student in order to ask first question
    const nextStudentNum = currentStudentNumber < 6 ? currentStudentNumber + 1 : 1;
    const qaScript = getPeerQAInvitationScript(currentStudentNumber, nextStudentNum);
    speakAI(qaScript);
  };

  const triggerAIFallbackQuestion = () => {
    setIsPeerQASilenceTriggered(true);
    setPhase('ai_qa');

    const aiQ = generateAIQuestionForTopic(currentTopic);
    setCurrentAiQuestion(aiQ);

    const fullSilenceScript = `${PEER_QA_SILENCE_SCRIPT}\n\nMy question is: ${aiQ.question}\n\nStudent who presented the topic, please answer the question in your own words.`;
    speakAI(fullSilenceScript);
  };

  // Q&A Silence Watchdog (If no peer asks after 15 seconds, AI steps in per PDF Page 3)
  useEffect(() => {
    if (phase !== 'peer_qa' || session.status !== 'active' || isPeerQASilenceTriggered) return;
    const timer = setInterval(() => {
      setQaTimerSeconds((prev) => {
        const next = prev + 1;
        if (next >= 15 && !isPeerQASilenceTriggered) {
          triggerAIFallbackQuestion();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, session.status, isPeerQASilenceTriggered]);

  // Finalize Activity & Generate Presentation Reports
  const handleFinalizeAllPresentations = async () => {
    if (gdRecorder.isRecording) {
      try {
        const uploadResult = await gdRecorder.stopAndUploadRecording(session.slotId || session.id);
        if (uploadResult?.recordingUrl) {
          session.recordingUrl = uploadResult.recordingUrl;
        }
      } catch (err) {
        console.warn('[Classroom Presentation] Recording upload failed:', err);
      }
    }

    // Generate reports for all students based on the 6 indicators
    const finalReports: PresentationAssessmentReport[] = presentationStudents.map((stu, idx) => {
      const spokenSec = idx === activeStudentIndex ? presenterSeconds : (idx < activeStudentIndex ? 420 : 0);
      return calculatePresentationReport({
        sessionId: session.id,
        studentId: stu.id,
        studentName: stu.name,
        studentNumber: idx + 1,
        college: stu.college || 'Engineering Institute',
        presentationTopic: studentTopics[idx],
        durationMinutes: 60,
        speakingTimeSeconds: spokenSec,
        questionsAnsweredCount: idx <= activeStudentIndex ? 1 : 0,
        peerQuestionsAskedCount: idx !== activeStudentIndex ? 1 : 0,
      });
    });

    console.log('[Classroom Presentation] Finalized reports for students:', finalReports);
    onFinishSession();
  };

  // Answer Q&A and Transition to Next Student (Stage 4)
  const handleAcknowledgeAnswerAndProceed = () => {
    const clarification = currentAiQuestion?.clarification || 'Thank you for your response. Clear communication of technical concepts is essential.';
    const nextIdx = activeStudentIndex + 1;

    if (nextIdx >= presentationStudents.length) {
      // Stage 5: Closing remarks
      setPhase('closing');
      speakAI(PRESENTATION_CLOSING_SCRIPT, () => {
        setPhase('completed');
        handleFinalizeAllPresentations();
      });
    } else {
      setPhase('transition');
      const nextStudent = presentationStudents[nextIdx];
      const nextStudentNum = nextStudent?.seatNumber || (nextIdx + 1);
      const transScript = `${clarification}\n\n${getTransitionScript(currentStudentNumber, nextStudentNum)}`;
      speakAI(transScript, () => {
        callStudentToPresent(nextStudentNum);
      });
    }
  };

  // Presenter Microphone Toggle (Mute / Unmute)
  const handleToggleMic = async () => {
    const nextState = !isMicOn;
    setIsMicOn(nextState);
    isMicOnRef.current = nextState;

    // 1. Toggle WebRTC live microphone if available
    if (rtcSetMicEnabled) {
      rtcSetMicEnabled(nextState);
    }

    // 2. Toggle local audio stream tracks
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
    if (rtcLocalAudioStream) {
      rtcLocalAudioStream.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }

    // 3. Manage Speech Recognition
    if (!nextState) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
      if (liveSpeech.trim()) {
        addTranscriptEntry(currentPresenter?.name || 'Presenter', liveSpeech.trim(), false);
        setLiveSpeech('');
      }
    } else {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (e: any) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
              if (e.results[i].isFinal) {
                const finalTranscript = String(e.results[i][0]?.transcript || '').trim();
                if (finalTranscript) {
                  addTranscriptEntry(currentPresenter?.name || 'Presenter', finalTranscript, false);
                }
              } else {
                interim += e.results[i][0]?.transcript || '';
              }
            }
            setLiveSpeech(interim);
          };
          rec.onend = () => {
            if (isMicOnRef.current) {
              try { rec.start(); } catch {}
            }
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn('Speech recognition error:', e);
        }
      }
    }
  };

  const toggleSpeechRecognition = handleToggleMic;

  // Presenter Video Toggle (Camera On / Off)
  const handleToggleVideo = async () => {
    try {
      await toggleCamera();
    } catch (e) {
      console.warn('Camera toggle error:', e);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 overflow-x-hidden font-sans">
      {/* ======================================================== */}
      {/* TOP HEADER: CLASSROOM PRESENTATION SEMINAR BANNER (LIGHT THEME) */}
      {/* ======================================================== */}
      <header className="h-16 px-4 sm:px-6 bg-white/95 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 backdrop-blur-md shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-2xs"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-600" />
              <span>Back</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0">
            <School className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-wide">
                Classroom Presentation Mode
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                Seminar Stage
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-xs sm:max-w-md">
              {session.topic || 'Technical / Research / Industry-Oriented Presentations'}
            </p>
          </div>
        </div>

        {/* Stepper for enrolled real presenters */}
        <div className="hidden lg:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200">
          {presentationStudents.map((stu, idx) => {
            const num = idx + 1;
            const isCompleted = num < currentStudentNumber;
            const isCurrent = num === currentStudentNumber;
            return (
              <button
                key={stu.id}
                type="button"
                onClick={() => isFaculty && callStudentToPresent(num)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-amber-500 text-white font-bold shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
                    : isCompleted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                    : 'text-slate-500 bg-white border border-slate-200 hover:bg-slate-50'
                }`}
                title={`Presenter: ${stu.name}`}
              >
                <span>#{num}</span>
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                {isCurrent && <span className="animate-pulse">● Podium</span>}
              </button>
            );
          })}
        </div>

        {/* Global Controls & Faculty Actions */}
        <div className="flex items-center gap-2">
          {session.status !== 'active' ? (
            isFaculty ? (
              <button
                onClick={handleFacultyStartPresentation}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Presentation</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
                <Clock className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>Waiting for faculty to start...</span>
              </div>
            )
          ) : (
            isFaculty && currentStudentNumber < presentationStudents.length && (
              <button
                onClick={() => callStudentToPresent(currentStudentNumber + 1)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer"
              >
                <span>Next Speaker (#{currentStudentNumber + 1})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )
          )}

          {/* Live Recording Status Badge */}
          {gdRecorder.isRecording ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-1.5 shadow-2xs animate-pulse" title="Presentation session is being recorded and stored to ERUS server for Faculty Evaluation">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
              <span className="font-mono">🔴 REC {gdRecorder.formattedDuration}</span>
              <span className="text-[10px] text-slate-500 font-sans hidden sm:inline">(Auto-recording for Faculty)</span>
            </span>
          ) : session.recordingUrl ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1.5 shadow-2xs">
              <Video className="w-3.5 h-3.5 text-emerald-600" />
              <span>Recording Saved</span>
            </span>
          ) : null}
          {/* Presenter / User Microphone Mute & Unmute Toggle */}
          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
              isMicOn
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-emerald-600/20 ring-2 ring-emerald-400/30'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
            }`}
            title={isMicOn ? 'Click to Mute Microphone' : 'Click to Unmute Microphone'}
          >
            {isMicOn ? (
              <>
                <Mic className="w-4 h-4 text-white animate-pulse" />
                <span className="hidden sm:inline">Mic: On</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4 text-rose-600" />
                <span className="hidden sm:inline">Mic: Muted</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsRoomAudioMuted(!isRoomAudioMuted)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isRoomAudioMuted
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title={isRoomAudioMuted ? 'Unmute AI Instructor Voice' : 'Mute AI Instructor Voice'}
          >
            {isRoomAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onFinishSession}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Finish Activity</span>
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN CLASSROOM ENVIRONMENT (LIGHT THEME - SIDE BY SIDE) */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* ======================================================== */}
          {/* LEFT 7 COLS: SEMINAR STAGE, LECTERN & PODIUM CONTROLS */}
          {/* ======================================================== */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            
            {/* Whiteboard / Projector Screen Behind the Podium */}
            <div className="bg-white border-2 border-slate-200/90 rounded-2xl p-4 shadow-2xs text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
              
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 mb-3 flex-wrap">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-amber-600" />
                  <span>Classroom Seminar Screen</span>
                </span>
                
                {/* Presentation Timer */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {formatSeconds(presenterSeconds)} / 08:00 Min
                  </span>
                  {phase === 'presenting' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  )}
                </div>
              </div>

              {/* Presentation Topic Heading */}
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                "{currentTopic}"
              </h2>

              {/* AI Facilitator Guidance Banner */}
              <div className="mt-3 bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 italic font-medium text-left">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] uppercase tracking-wider mb-1 not-italic">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>AI Seminar Facilitator Guidance</span>
                </div>
                <p>
                  "{aiSpeech || (phase === 'presenting' ? 'Presenter is delivering the scheduled topic.' : 'Presenting to classroom seminar hall...')}"
                </p>
              </div>
            </div>

            {/* Lectern Structure */}
            <div className="w-full bg-gradient-to-b from-amber-50 via-white to-amber-100/50 border-2 border-amber-300 rounded-3xl p-4 sm:p-6 shadow-md flex flex-col items-center relative text-center">
              
              {/* Gooseneck Lectern Microphone attached on top */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-200/70 border border-amber-300 px-3.5 py-1 rounded-full shadow-2xs -mt-7 mb-3 z-10">
                <Mic className="w-3.5 h-3.5 text-amber-700" />
                <span>SEMINAR LECTERN • PRESENTER PODIUM</span>
              </div>

              {/* Video / Slides Display Frame */}
              <div className="w-full max-w-md h-56 sm:h-64 rounded-2xl overflow-hidden border-4 border-amber-400 shadow-md relative bg-slate-900 flex items-center justify-center">
                {isSharingScreen ? (
                  slideMode === 'screen' && screenStream ? (
                    <div className="w-full h-full bg-black relative flex items-center justify-center">
                      <PresentationVideoStream
                        stream={screenStream}
                        className="w-full h-full object-contain"
                        muted={true}
                      />
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1 shadow-sm">
                          <span>● Live Screen Sharing</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSlideMode('deck')}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/90 text-slate-800 hover:bg-white shadow-sm cursor-pointer"
                        >
                          View Slide Deck
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-white p-3 sm:p-4 flex flex-col justify-between text-left overflow-hidden">
                      <div>
                        <div className="flex items-center justify-between border-b border-amber-200 pb-1.5 mb-2">
                          <span className="text-[10px] font-extrabold uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                            {topicSlides[currentSlideIndex].badge}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleToggleScreenShare}
                              className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="Share Live Window"
                            >
                              Share Screen
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsSharingScreen(false)}
                              className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                              title="Close Slides"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                          {topicSlides[currentSlideIndex].title}
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-amber-700 font-semibold mb-2">
                          {topicSlides[currentSlideIndex].subtitle}
                        </p>

                        <ul className="space-y-1 sm:space-y-1.5 text-[10px] sm:text-[11px] text-slate-700">
                          {topicSlides[currentSlideIndex].bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Slide Navigation Buttons */}
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <button
                          type="button"
                          disabled={currentSlideIndex === 0}
                          onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3" />
                          <span>Previous</span>
                        </button>

                        <span className="text-[10px] font-bold text-slate-600 font-mono">
                          {currentSlideIndex + 1} / {topicSlides.length}
                        </span>

                        <button
                          type="button"
                          disabled={currentSlideIndex === topicSlides.length - 1}
                          onClick={() => setCurrentSlideIndex((prev) => Math.min(topicSlides.length - 1, prev + 1))}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 disabled:opacity-40 cursor-pointer"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                ) : isUserPodiumPresenter && isCameraOn && videoStream ? (
                  <PresentationVideoStream
                    stream={videoStream}
                    className="w-full h-full object-cover transform -scale-x-100"
                    muted={true}
                  />
                ) : !isUserPodiumPresenter && currentPresenter?.cameraActive && currentPresenter?.videoStream ? (
                  <PresentationVideoStream
                    stream={currentPresenter.videoStream}
                    className="w-full h-full object-cover"
                    muted={true}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-b from-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 relative">
                    <img
                      src={currentPresenter?.avatar}
                      alt={currentPresenter?.name}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-700 border-2 border-amber-400 shadow-md object-cover"
                    />
                    <span className="mt-2 text-xs font-bold text-white">
                      {currentPresenter?.name}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {currentPresenter?.cameraActive ? 'Camera Connected' : 'Camera Off • Avatar Active'}
                    </span>
                  </div>
                )}

                {/* Presenter Live Status Badge */}
                <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none">
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-900/80 text-amber-300 border border-amber-400/30 backdrop-blur-xs">
                    Seat #{currentStudentNumber} • {isUserPodiumPresenter ? 'You (Presenter)' : currentPresenter?.name}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs ${
                    (isUserPodiumPresenter ? isMicOn : currentPresenter?.micActive) ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white'
                  }`}>
                    {(isUserPodiumPresenter ? isMicOn : currentPresenter?.micActive) ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    <span>{(isUserPodiumPresenter ? isMicOn : currentPresenter?.micActive) ? 'Speaking' : 'Muted'}</span>
                  </span>
                </div>
              </div>

              {/* Presenter Name & Department */}
              <div className="mt-3 flex flex-col items-center">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{currentPresenter?.name}</span>
                  {isUserPodiumPresenter && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                      You (Presenter)
                    </span>
                  )}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
                  Department of Computer Science & Engineering • {currentPresenter?.college || session.collegeCode || 'BMSIT'}
                </p>
              </div>

              {/* Presenter Podium / Audience Controls */}
              <div className="mt-3 w-full bg-white border border-amber-200/90 rounded-2xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
                
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 1. TURN VIDEO ON / OFF */}
                  <button
                    type="button"
                    onClick={handleToggleVideo}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                      isCameraOn
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-400/40'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                    }`}
                    title={isCameraOn ? 'Click to Turn Off Video Camera' : 'Click to Turn On Video Camera'}
                  >
                    {isCameraOn ? (
                      <>
                        <Video className="w-3.5 h-3.5 text-white" />
                        <span>My Video: On</span>
                      </>
                    ) : (
                      <>
                        <VideoOff className="w-3.5 h-3.5 text-slate-500" />
                        <span>My Video: Off</span>
                      </>
                    )}
                  </button>

                  {/* 2. TURN MIC ON / OFF (MUTE / UNMUTE) */}
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                      isMicOn
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/40 shadow-emerald-600/20'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300'
                    }`}
                    title={isMicOn ? 'Click to Mute Microphone' : 'Click to Unmute Microphone'}
                  >
                    {isMicOn ? (
                      <>
                        <Mic className="w-3.5 h-3.5 text-white animate-pulse" />
                        <span>My Mic: On</span>
                      </>
                    ) : (
                      <>
                        <MicOff className="w-3.5 h-3.5 text-rose-600" />
                        <span>My Mic: Muted</span>
                      </>
                    )}
                  </button>

                  {/* 3. SHARE SLIDES / SCREEN (Only active presenter) */}
                  {isUserPodiumPresenter && (
                    <button
                      type="button"
                      onClick={handleToggleScreenShare}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs border ${
                        isSharingScreen
                          ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500 shadow-sm'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                      title={isSharingScreen ? 'Close Slides' : 'Share Presentation Slides'}
                    >
                      <Share2 className="w-3.5 h-3.5 text-amber-700" />
                      <span>{isSharingScreen ? 'Hide Slides' : 'Share Slides'}</span>
                    </button>
                  )}
                </div>

                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                  isUserPodiumPresenter
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                  {isUserPodiumPresenter ? '🎤 You are at the Podium' : `🎧 Listening to Seat #${currentStudentNumber}`}
                </span>
              </div>

              {/* Stage Flow Action Buttons */}
              <div className="mt-2.5 w-full flex items-center justify-center gap-2 flex-wrap">
                {isUserPodiumPresenter && phase === 'presenting' && (
                  <button
                    type="button"
                    onClick={handleCompletePresentation}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Conclude Speech & Start Q&A</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {(isFaculty || isUserPodiumPresenter) && (phase === 'peer_qa' || phase === 'ai_qa') && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAnswerAndProceed}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Proceed to Next Presenter (#{currentStudentNumber < presentationStudents.length ? currentStudentNumber + 1 : 'Finish'})</span>
                  </button>
                )}
              </div>

            </div>

            {/* ======================================================== */}
            {/* ALL 6 CLASSROOM PARTICIPANTS (REAL PEERS & ENROLLED STUDENTS) */}
            {/* ======================================================== */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>Seminar Participants</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {presentationStudents.length} {presentationStudents.length === 1 ? 'Participant Connected' : 'Participants Connected'}
                      </span>
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Real peers and enrolled student roster for this presentation session
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  Active Speaker: Seat #{currentStudentNumber}
                </span>
              </div>

              {/* Participant Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {presentationStudents.map((student, idx) => {
                  const isPodiumSpeaker = idx === activeStudentIndex;
                  return (
                    <div
                      key={student.id || idx}
                      onClick={() => {
                        if (isFaculty) setActiveStudentIndex(idx);
                      }}
                      className={`relative rounded-2xl border p-2 flex flex-col items-center text-center transition-all cursor-pointer ${
                        isPodiumSpeaker
                          ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 shadow-xs'
                          : student.isUser
                          ? 'bg-indigo-50/70 border-indigo-300 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Badges */}
                      <div className="w-full flex items-center justify-between text-[8px] sm:text-[9px] font-bold mb-1">
                        <span className="px-1.5 py-0.2 rounded bg-slate-200/90 text-slate-700 font-mono">
                          #{student.seatNumber || idx + 1}
                        </span>
                        {isPodiumSpeaker ? (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-extrabold flex items-center gap-0.5 animate-pulse">
                            Podium
                          </span>
                        ) : student.isUser ? (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-600 text-white font-extrabold">
                            You
                          </span>
                        ) : student.isRealPeer ? (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white font-extrabold">
                            Live
                          </span>
                        ) : null}
                      </div>

                      {/* Video / Avatar */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-slate-300 relative bg-slate-900 flex items-center justify-center mb-1">
                        {student.cameraActive && student.videoStream ? (
                          <PresentationVideoStream
                            stream={student.videoStream}
                            className={`w-full h-full object-cover ${student.isUser ? 'transform -scale-x-100' : ''}`}
                            muted={true}
                          />
                        ) : (
                          <img
                            src={student.avatar}
                            alt={student.name}
                            className="w-full h-full object-cover bg-slate-700"
                          />
                        )}
                        <div className="absolute bottom-0 right-0 p-0.5 rounded-full bg-slate-950/80 text-white">
                          {student.micActive ? (
                            <Mic className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <MicOff className="w-2.5 h-2.5 text-rose-400" />
                          )}
                        </div>
                      </div>

                      {/* Name & College */}
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-900 truncate w-full leading-tight">
                        {student.name}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-slate-500 truncate w-full">
                        {student.college || 'BMSIT'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Faculty Evaluator Status Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Faculty Observer: {session.assignedFacultyName || 'Assigned Evaluator'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Topic Mastery (25) • Organization (20) • English Fluency (20) • Q&A (20)
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
                <span>Live Assessment</span>
              </span>
            </div>

          </div>

          {/* ======================================================== */}
          {/* RIGHT 5 COLS: LIVE PRESENTATION TRANSCRIPT & INTERACTION */}
          {/* (Always visible on screen beside presenter) */}
          {/* ======================================================== */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col h-[600px] lg:h-[700px] sticky top-20">
            
            {/* Transcript Card Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Live Transcript</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Synchronous speech & dialogue log
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                {transcripts.length} Entries
              </span>
            </div>

            {/* Scrollable Transcript Feed */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-slate-300 min-h-0">
              {transcripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-slate-400" />
                  <p className="text-xs font-medium text-slate-500">
                    Classroom presentation transcript is ready.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Unmute microphone or type below to participate in live transcript.
                  </p>
                </div>
              ) : (
                transcripts.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex gap-2.5 p-3 rounded-2xl border transition-all text-left ${
                      entry.isFacilitator
                        ? 'bg-amber-50/80 border-amber-200 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                      entry.isFacilitator
                        ? 'bg-amber-200/90 text-amber-900 border border-amber-300'
                        : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}>
                      {entry.isFacilitator ? <Sparkles className="w-3.5 h-3.5" /> : entry.speakerName.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            {entry.speakerName}
                          </span>
                          {entry.isFacilitator && (
                            <span className="px-1.5 py-0.2 rounded-md text-[9px] font-extrabold uppercase bg-amber-200/70 text-amber-900 border border-amber-300">
                              AI Instructor
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {entry.timestamp}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 leading-relaxed break-words">
                        {entry.text}
                      </p>
                    </div>
                  </div>
                ))
              )}

              {/* Live Speech Recognition Pill */}
              {isMicOn && liveSpeech && (
                <div className="flex gap-2.5 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 animate-pulse text-left">
                  <div className="w-7 h-7 rounded-lg bg-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase text-emerald-800">
                      {currentPresenter?.name || 'Presenter'} (Speaking live...)
                    </span>
                    <p className="text-xs text-slate-700 italic">
                      "{liveSpeech}"
                    </p>
                  </div>
                </div>
              )}
              
              <div ref={transcriptBottomRef} />
            </div>

            {/* Interactive Transcript Input Bar */}
            <form onSubmit={handleSendTypedMessage} className="pt-3 border-t border-slate-200 flex items-center gap-2 mt-2">
              <input
                type="text"
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                placeholder="Type a presentation point, response, or question..."
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
              />
              <button
                type="submit"
                disabled={!typedMessage.trim()}
                className="p-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold cursor-pointer transition-all shrink-0 shadow-2xs"
                title="Send message to Live Transcript"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>

        </div>
      </main>
    </div>
  );
};
