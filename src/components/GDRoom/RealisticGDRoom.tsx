import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Hand, 
  Sparkles, 
  Volume2, 
  VolumeX,
  Video,
  VideoOff,
  PhoneOff,
  Radio, 
  Send, 
  AlertCircle, 
  Users, 
  CheckCircle2, 
  MessageSquare, 
  TrendingUp, 
  Layers, 
  Award, 
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  FastForward,
  Play,
  Calendar,
  ArrowRight,
  Clock,
  CircleDot,
  Target,
  Presentation,
  Eye,
  GraduationCap,
  Wifi,
  WifiOff,
  User,
  Lock,
  FileText,
  BarChart3,
  Bookmark,
  Trash2,
  Plus,
  Tag,
  Maximize2,
  Minimize2,
  X,
  Download
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry, GDFacilitatorPhase, GDRoomLayoutType, FacultyLiveNote } from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { roomVoice, facilitatorVoice } from '../../utils/speechSynthesis';
import { useUserMedia } from '../../utils/useUserMedia';
import { useWebRTCRoom } from '../../hooks/useWebRTCRoom';
import { useGDRecorder } from '../../utils/gdRecorder';
import { 
  getNextUniqueFacilitatorPrompt, 
  sessionQuestionTracker,
  getStudentPreviousPresentation,
  generateInitiationPrompt,
  generateTargetedQuestionForStudent,
  getNextTurnSpeaker,
  generateStudentOpeningStatement,
  generateStudentFollowUpStatement,
  CLASSROOM_INSTRUCTOR_SCRIPTS,
  getClassroomAssignedTopics,
  generateClassroomStudentPresentation,
  generateClassroomPeerQuestion,
  generateClassroomStudentAnswer,
  ClassroomAssignedTopic
} from '../../utils/facilitatorQuestionEngine';
import { LobbyAudioTester } from './LobbyAudioTester';
import { generateSlotParticipants } from '../../data/mockGDData';

interface RealisticGDRoomProps {
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
  onUpdateLayout?: (layout: GDRoomLayoutType) => void;
  bookedSlotId?: string | null;
}

export const RealisticGDRoom: React.FC<RealisticGDRoomProps> = ({
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
  onResetSlots,
  currentUser,
  onUpdateLayout,
  bookedSlotId,
}) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'rules' | 'analytics' | 'breakout'>('transcript');
  const deduplicatedTranscripts = useMemo(() => {
    return transcripts.filter((entry, idx, arr) => {
      if (entry?.isFacilitator) {
        const entryText = String(entry?.text || '').trim();
        const firstIdx = arr.findIndex((t) => t?.isFacilitator && String(t?.text || '').trim() === entryText);
        return firstIdx === idx;
      }
      return true;
    });
  }, [transcripts]);
  const [liveSpeechTranscript, setLiveSpeechTranscript] = useState('');
  const [typedStatement, setTypedStatement] = useState('');
  const liveTranscriptRef = useRef<string>('');
  const speechPauseTimerRef = useRef<any>(null);
  const isListeningMicRef = useRef<boolean>(false);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const restartRecognitionTimerRef = useRef<any>(null);
  const handleSendUserStatementRef = useRef<(textToSend?: string) => Promise<void>>(() => Promise.resolve());
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [interruptionWarning, setInterruptionWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  // Server-side Socket.IO is now the single source of truth for AI turns.
  // Keeping the legacy local simulator enabled can queue a second voice while
  // a real participant is speaking, so it is disabled for live GDs.
  const [autoSimulatePeers, setAutoSimulatePeers] = useState(false);
  const [invitedStudentPrompt, setInvitedStudentPrompt] = useState<{ student: Student; reason: string; promptText?: string } | null>(null);
  const [currentLayout, setCurrentLayout] = useState<GDRoomLayoutType>(() => {
    try {
      const saved = localStorage.getItem('erus_gd_room_layout');
      if (saved && ['round_table', 'speaker_middle', 'classroom'].includes(saved)) {
        return saved as GDRoomLayoutType;
      }
    } catch {}
    return session.roomLayout || 'round_table';
  });

  const hasInitiatedOpeningRef = useRef<boolean>(false);
  const isTransitioningTurnRef = useRef<boolean>(false);
  const lastFacilitatorInterventionTimeRef = useRef<number>(0);

  const isFaculty = currentUser?.role === 'faculty';
  const isFacultyOrAdmin = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin' || currentUser?.role === 'super_admin';
  const canStartSession = isFacultyOrAdmin;
  const isStudent = currentUser?.role === 'student';
  const isSessionActive = session.status === 'active';
  const [showVideoModal, setShowVideoModal] = useState(false);
  // Faculty Live Observation Notes State (Enhancement 4)
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [noteTargetStudentId, setNoteTargetStudentId] = useState<string>(session?.students?.[0]?.id || '');
  const [noteTimestamp, setNoteTimestamp] = useState<string>('00:00');
  const [noteTag, setNoteTag] = useState<'strength' | 'improvement' | 'key_argument' | 'leadership' | 'general'>('general');
  const [noteContent, setNoteContent] = useState<string>('');

  // Audio & Mic Diagnostic Test Modal State
  const [showAudioTestModal, setShowAudioTestModal] = useState(false);

  // Participant Spotlight / Enlarged HD View State
  const [enlargedStudent, setEnlargedStudent] = useState<Student | null>(null);

  const handleToggleEnlargeStudent = (student: Student) => {
    if (student.isEmptySeat) return;
    setEnlargedStudent((prev) => (prev?.id === student.id ? null : student));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedStudent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatElapsedClock = (secs: number) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const remainingSecs = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${remainingSecs}`;
  };

  const handleOpenNoteModal = (studentId?: string) => {
    const targetId = studentId || noteTargetStudentId || session?.students?.[0]?.id || '';
    setNoteTargetStudentId(targetId);
    setNoteTimestamp(formatElapsedClock(elapsedSeconds));
    setIsNotesModalOpen(true);
  };

  const handleSaveObservationNote = () => {
    const cleanNote = String(noteContent || '').trim();
    if (!cleanNote) return;
    const targetStudent = activeDisplayStudents.find((s) => s.id === noteTargetStudentId) || (session?.students || []).find((s) => s.id === noteTargetStudentId) || activeDisplayStudents.find((s) => !s.isEmptySeat) || session?.students?.[0];
    if (!targetStudent) return;
    const newNote: FacultyLiveNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sessionId: session?.id || '',
      studentId: targetStudent.id,
      studentName: targetStudent.name,
      seatNumber: targetStudent.seatNumber,
      timestamp: noteTimestamp || formatElapsedClock(elapsedSeconds),
      timestampSeconds: elapsedSeconds,
      note: cleanNote,
      tag: noteTag,
      facultyName: currentUser?.name || session.assignedFacultyName || 'Faculty Evaluator',
      createdAt: Date.now(),
    };

    setSession((prev) => ({
      ...prev,
      facultyLiveNotes: [...(prev.facultyLiveNotes || []), newNote],
    }));

    setNoteContent('');
  };

  const handleDeleteObservationNote = (noteId: string) => {
    setSession((prev) => ({
      ...prev,
      facultyLiveNotes: (prev.facultyLiveNotes || []).filter((n) => n.id !== noteId),
    }));
  };

  // Real-time media (webcam video stream & live audio level analyser)
  const {
    isCameraOn,
    videoStream,
    toggleCamera,
    cameraError,
    audioLevel: userMediaAudioLevel,
    audioStream,
    startAudioAnalyser,
    stopAudioAnalyser,
  } = useUserMedia();

  const [isRoomAudioMuted, setIsRoomAudioMuted] = useState(false);

  const toggleRoomAudio = () => {
    const next = !isRoomAudioMuted;
    setIsRoomAudioMuted(next);
    roomVoice.setMuted(next);
  };

  useEffect(() => {
    if (session.roomLayout && session.roomLayout !== currentLayout) {
      try {
        const saved = localStorage.getItem('erus_gd_room_layout');
        if (saved && saved !== session.roomLayout) {
          return;
        }
      } catch {}
      setCurrentLayout(session.roomLayout);
    }
  }, [session.roomLayout, currentLayout]);

  // Synchronize webcam live state to user's student state (only when currentUser is a student participant)
  useEffect(() => {
    if (isFaculty) return;
    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.isUser ? { ...s, cameraActive: isCameraOn } : s)),
    }));
  }, [isCameraOn, isFaculty, setSession]);

  const handleLayoutChange = (newLayout: GDRoomLayoutType) => {
    setCurrentLayout(newLayout);
    try {
      localStorage.setItem('erus_gd_room_layout', newLayout);
    } catch {}
    setSession((prev) => ({ ...prev, roomLayout: newLayout }));
    if (onUpdateLayout) {
      onUpdateLayout(newLayout);
    }
  };

  // Ref to hold live GD recorder for seamless event triggers
  const gdRecorderRef = useRef<any>(null);

  // Real-Time Multi-User WebRTC Audio/Video Mesh & Room Signaling
  const {
    connected: isSocketConnected,
    assignedSeat: rtcAssignedSeat,
    peers: rtcPeers,
    peerStreams: rtcPeerStreams,
    silenceTimerSeconds: rtcSilenceTimer,
    isMicMuted: rtcIsMicMuted,
    isSpeakingLive: rtcIsSpeakingLive,
    localVolume: rtcLocalVolume,
    toggleMute: rtcToggleMute,
    setMicEnabled: rtcSetMicEnabled,
    broadcastTranscript: rtcBroadcastTranscript,
    startSession: rtcStartSession,
    finishSession: rtcFinishSession,
    requestAiIntervention: rtcRequestAiIntervention,
    broadcastFacilitatorSpeech: rtcBroadcastFacilitatorSpeech,
    notifySpeakingFinished: rtcNotifySpeakingFinished,
    aiParticipants: rtcAiParticipants,
    simulationMode: rtcSimulationMode,
  } = useWebRTCRoom({
    slotId: session.slotId || session.id || 'slot-1',
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
      if (roomData.openingStarted || (roomData.transcripts && roomData.transcripts.some((t: any) => t.isFacilitator))) {
        hasInitiatedOpeningRef.current = true;
      }
    },
    onSessionStarted: () => {
      setSession((prev) => ({
        ...prev,
        status: 'active',
        startedAt: prev.startedAt || Date.now(),
      }));
    },
    onSessionEnded: () => {
      // Synchronized GD termination: faculty has completed the GD, so student view automatically finishes & evaluates
      if (gdRecorderRef.current?.isRecording) {
        gdRecorderRef.current.stopAndUploadRecording(session.slotId || session.id).catch(() => {});
      }
      onFinishSession();
    },
    onNewTranscript: (newTx) => {
      setTranscripts((prev) => {
        if (prev.some((t) => t.id === newTx.id)) return prev;
        return [...prev, newTx];
      });

      // AI turns are already counted authoritatively by onAiParticipantSpeech.
      // Counting them here as well would make every AI contribution appear twice.
      if (String(newTx.speakerId || '').startsWith('ai-')) return;

      // Update human speaker stats.
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: newTx.speakerId,
        silenceTimerSeconds: 0,
        students: prev.students.map((s) =>
          s.id === newTx.speakerId || s.seatNumber === newTx.seatNumber
            ? { ...s, speakingTurns: s.speakingTurns + 1, lastSpokeAt: Date.now() }
            : s
        ),
      }));
    },
    onAiParticipantSpeech: () => {
      // AI simulated participants are disabled; real human students only.
    },

    onFacilitatorIntervention: (intervention) => {
      hasInitiatedOpeningRef.current = true;
      lastFacilitatorInterventionTimeRef.current = Date.now();
      setLocalSilenceSeconds(0);
      const intText = String(intervention?.text || '').trim();
      if (!intText) return;

      // Record question in usedProbeQuestionsRef so local fallback never repeats it
      usedProbeQuestionsRef.current.add(intText);

      setTranscripts((prev) => {
        if (prev.some((t) => t.id === intervention?.transcript?.id || (t.isFacilitator && String(t.text || '').trim() === intText))) return prev;
        return intervention?.transcript ? [...prev, intervention.transcript] : prev;
      });

      // Suppress AI facilitator ONLY if a human participant is actively speaking live right now (and not a deadlock intervention)
      const isHumanSpeakingLive = rtcIsSpeakingLive && intervention.action !== 'deadlock_intervention';
      if (isHumanSpeakingLive) {
        console.log('[Facilitator] Participant is actively speaking on floor. Suppressing AI voice synthesis.');
        return;
      }

      setSession((prev) => ({
        ...prev,
        silenceTimerSeconds: 0,
        currentSpeakerId: null,
        facilitatorSpeech: intervention.text,
        isFacilitatorSpeaking: true,
      }));

      // If the server moderator called this participant (by userId or by seatNumber)
      const isTargetStudent =
        currentUser?.role === 'student' &&
        (intervention.targetUserId === currentUser.id ||
          (intervention.targetSeatNumber !== undefined && intervention.targetSeatNumber === rtcAssignedSeat));

      if (isTargetStudent) {
        const targetStudent =
          session.students.find((s) => s.isUser || s.id === currentUser.id || s.seatNumber === rtcAssignedSeat) ||
          session.students[0];
        if (targetStudent) {
          setInvitedStudentPrompt({
            student: targetStudent,
            reason: intervention.text,
            promptText: intervention.text,
          });
        }
      }

      // Audibly speak AI intervention using roomVoice
      if (!voiceMuted && !isRoomAudioMuted) {
        roomVoice.speakAsFacilitator(intervention.text, () => {
          lastFacilitatorInterventionTimeRef.current = Date.now();
          setLocalSilenceSeconds(0);
          setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false, silenceTimerSeconds: 0 }));
        });
      }
    },
  });

  // Synchronized GD termination watch: if session status changes to 'completed', upload recording first then finish GD
  useEffect(() => {
    if (session.status === 'completed' && currentUser?.role === 'student') {
      let cancelled = false;
      const finishWithRecording = async () => {
        if (gdRecorderRef.current?.isRecording) {
          try {
            await gdRecorderRef.current.stopAndUploadRecording(session.slotId || session.id);
          } catch (err) {
            console.warn('[GD Room] Student recording upload on completion notice:', err);
          }
        }
        if (!cancelled) {
          onFinishSession();
        }
      };
      finishWithRecording();
      return () => {
        cancelled = true;
      };
    }
  }, [session.status, currentUser?.role, onFinishSession, session.slotId, session.id]);

  // Continuous local silence stopwatch fallback to ensure 15s triggers even during socket network lag
  const [localSilenceSeconds, setLocalSilenceSeconds] = useState(0);

  // Authoritative microphone volume level derived from active WebRTC stream
  const audioLevel = rtcLocalVolume > 0 ? rtcLocalVolume : userMediaAudioLevel;

  useEffect(() => {
    if (!isSessionActive) {
      setLocalSilenceSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const isAnyActive =
        session.isFacilitatorSpeaking ||
        roomVoice.isSpeaking() ||
        aiVoicePausedMicRef.current ||
        rtcIsSpeakingLive ||
        (isListeningMicRef.current && (audioLevel > 8 || !!liveSpeechTranscript)) ||
        session.students.some((s) => s.isSpeaking);

      if (isAnyActive) {
        setLocalSilenceSeconds(0);
      } else {
        setLocalSilenceSeconds((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, session.isFacilitatorSpeaking, rtcIsSpeakingLive, audioLevel, liveSpeechTranscript, session.students]);

  // Synchronize silenceTimerSeconds from RTC hook and local stopwatch to session state
  useEffect(() => {
    setSession((prev) => {
      const merged = Math.max(rtcSilenceTimer, localSilenceSeconds);
      if (prev.silenceTimerSeconds === merged) return prev;
      return { ...prev, silenceTimerSeconds: merged };
    });
  }, [rtcSilenceTimer, localSilenceSeconds]);

  // Continuous real-time speaking time tracker: increments participant speaking seconds live while speaking
  useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(() => {
      const isUserSpeaking = isListeningMicRef.current && (rtcIsSpeakingLive || audioLevel > 8 || !!liveSpeechTranscript);
      if (isUserSpeaking && !isFaculty) {
        setSession((prev) => ({
          ...prev,
          students: prev.students.map((s) =>
            s.isUser
              ? {
                  ...s,
                  speakingDurationSeconds: (s.speakingDurationSeconds || 0) + 1,
                  lastSpokeAt: Date.now(),
                }
              : s
          ),
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, rtcIsSpeakingLive, audioLevel, isFaculty, liveSpeechTranscript]);

  // When two or more real students are connected, the server owns turn orchestration.
  // Local auto-simulation is retained only for the single-user demo mode.
  const hasRealStudentPeers = rtcPeers.some((p) => p.role === 'student' && p.role !== 'faculty' && p.role !== 'college_admin');

  // Clean GD room seating: deterministic seat mapping (1..capacity).
  // Assigns current student user to their assigned seat, keeps unique enrolled peers,
  // and fills remaining slots with available empty desks.
  useEffect(() => {
    setSession((prev) => {
      const capacity = Math.max(2, Math.min(50, prev.maxCapacity || 8));
      const seatMap = new Map<number, Student>();
      const usedSeats = new Set<number>();

      // 1. If logged-in student, place current user at their assigned seat first
      const isStudentUser = !isFaculty && currentUser?.role === 'student';
      let userSeatNum = 1;
      if (isStudentUser) {
        userSeatNum = rtcAssignedSeat || (currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber : 1) || 1;
        if (userSeatNum < 1 || userSeatNum > capacity) userSeatNum = 1;
        usedSeats.add(userSeatNum);

        const prevUser = prev.students?.find((s) => s.isUser || s.id === currentUser?.id);
        seatMap.set(userSeatNum, {
          id: currentUser?.id || 'speaker-user',
          name: currentUser?.name || 'Candidate',
          seatNumber: userSeatNum,
          college: currentUser?.college || 'Institution',
          course: (currentUser as any)?.course || 'Engineering',
          batch: (currentUser as any)?.batch || '2024-2028',
          avatar: currentUser?.avatar || '',
          isUser: true,
          micActive: false,
          isSpeaking: false,
          hasRaisedHand: false,
          cameraActive: false,
          speakingDurationSeconds: prevUser?.speakingDurationSeconds || 0,
          speakingTurns: prevUser?.speakingTurns || 0,
          interruptionCount: prevUser?.interruptionCount || 0,
          questionsAnswered: prevUser?.questionsAnswered || 0,
          questionsInitiated: prevUser?.questionsInitiated || 0,
          sentiment: 'neutral',
          isEmptySeat: false,
          isRealPeer: false,
          isDemoAI: false,
        });
      }

      // 2. Keep other unique enrolled students from session.students
      const existingStudents = Array.isArray(prev.students) ? prev.students : [];
      const seenStudentIds = new Set<string>();
      if (isStudentUser && currentUser?.id) {
        seenStudentIds.add(currentUser.id);
      }

      for (const st of existingStudents) {
        // Skip placeholders, empty seats, demo mocks, faculty, admins, or current user
        if (
          !st ||
          st.isEmptySeat ||
          st.isUser ||
          st.id?.startsWith('seat-') ||
          st.id?.startsWith('slot-stu-') ||
          st.name?.startsWith('Seat ') ||
          (st as any).role === 'faculty' ||
          (st as any).role === 'college_admin' ||
          (currentUser?.id && st.id === currentUser.id) ||
          (currentUser?.name && st.name === currentUser.name)
        ) {
          continue;
        }

        // Deduplicate other students by ID or name
        const dedupKey = st.id || st.name;
        if (seenStudentIds.has(dedupKey)) continue;
        seenStudentIds.add(dedupKey);

        // Find an open seat for this student
        let targetSeat = st.seatNumber;
        if (!targetSeat || targetSeat > capacity || usedSeats.has(targetSeat)) {
          targetSeat = undefined;
          for (let sn = 1; sn <= capacity; sn++) {
            if (!usedSeats.has(sn)) {
              targetSeat = sn;
              break;
            }
          }
        }

        if (targetSeat && targetSeat <= capacity) {
          usedSeats.add(targetSeat);
          seatMap.set(targetSeat, {
            ...st,
            seatNumber: targetSeat,
            isUser: false,
            isEmptySeat: false,
            isRealPeer: false,
          });
        }
      }

      // Deterministic array ordered by seatNumber containing real participants only
      const finalSeats: Student[] = Array.from(seatMap.values())
        .filter((s) => !s.isEmptySeat && s.college !== 'Available Desk' && !s.id?.endsWith('-empty'))
        .sort((a, b) => a.seatNumber - b.seatNumber);

      const isSame =
        prev.students &&
        prev.students.length === finalSeats.length &&
        prev.students.every(
          (s, i) =>
            s.id === finalSeats[i].id &&
            s.seatNumber === finalSeats[i].seatNumber &&
            s.name === finalSeats[i].name &&
            s.isUser === finalSeats[i].isUser
        );
      if (isSame) return prev;

      return { ...prev, students: finalSeats };
    });
  }, [session.id, session.maxCapacity, setSession, isFaculty, currentUser?.id, currentUser?.name, currentUser?.role, rtcAssignedSeat]);

  // Active display students: merge connected user with live connected WebRTC peers & available desks
  // Active display students: merge connected user with live connected WebRTC peers & available desks
  const activeDisplayStudents = useMemo(() => {
    const isStudentUser = !isFaculty && currentUser?.role !== 'faculty' && currentUser?.role !== 'college_admin' && currentUser?.role !== 'super_admin';
    const targetUserSeat = isStudentUser
      ? (rtcAssignedSeat || (currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber : 1) || 1)
      : null;

    const capacity = Math.max(2, Math.min(50, session.maxCapacity || 8));
    const seatMap = new Map<number, Student>();
    const usedSeats = new Set<number>();

    // 1. If local user is a student participant, place them at targetUserSeat
    if (isStudentUser && targetUserSeat !== null) {
      const fixedUserSeat = Math.max(1, Math.min(capacity, targetUserSeat));
      usedSeats.add(fixedUserSeat);
      const sessionUserStudent = session.students?.find((s) => s.isUser || s.id === currentUser?.id);
      seatMap.set(fixedUserSeat, {
        id: currentUser?.id || 'speaker-user',
        seatNumber: fixedUserSeat,
        name: currentUser?.name || 'You',
        avatar: currentUser?.avatar || '',
        college: currentUser?.college || 'Institution',
        course: (currentUser as any)?.course || 'Engineering',
        batch: (currentUser as any)?.batch || '2024-2028',
        isUser: true,
        isRealPeer: false,
        isEmptySeat: false,
        isSpeaking: isListeningMic || rtcIsSpeakingLive,
        micActive: isListeningMic || !rtcIsMicMuted,
        cameraActive: isCameraOn,
        speakingTurns: sessionUserStudent?.speakingTurns || 0,
        speakingDurationSeconds: sessionUserStudent?.speakingDurationSeconds || 0,
        videoStream: videoStream,
      });
    }

    // 2. Filter valid student peers from rtcPeers (strictly students; ignore faculty/admin observers)
    const validStudentPeers = (rtcPeers || []).filter(
      (p) =>
        p &&
        p.role !== 'faculty' &&
        p.role !== 'college_admin' &&
        p.role !== 'super_admin'
    );

    // 3. Place each live student peer at their assigned seatNumber (or first available free seat)
    validStudentPeers.forEach((peer) => {
      let desiredSeat = Number(peer.seatNumber);
      if (!desiredSeat || isNaN(desiredSeat) || desiredSeat < 1 || desiredSeat > capacity || usedSeats.has(desiredSeat)) {
        desiredSeat = 1;
        for (let s = 1; s <= capacity; s++) {
          if (!usedSeats.has(s)) {
            desiredSeat = s;
            break;
          }
        }
      }

      usedSeats.add(desiredSeat);
      const remoteStream = rtcPeerStreams.get(peer.socketId) || null;
      seatMap.set(desiredSeat, {
        id: peer.userId || peer.socketId,
        seatNumber: desiredSeat,
        name: peer.name || `Student ${desiredSeat}`,
        avatar: peer.avatar || '',
        college: peer.college || 'Campus Participant',
        course: (peer as any).course || 'Engineering',
        batch: (peer as any).batch || '2024-2028',
        isUser: false,
        isRealPeer: true,
        isEmptySeat: false,
        isSpeaking: !!peer.isSpeaking,
        micActive: !!peer.micActive,
        cameraActive: !!peer.cameraActive,
        speakingTurns: peer.speakingTurns || 0,
        speakingDurationSeconds: peer.speakingDurationSeconds || 0,
        volumeLevel: peer.volumeLevel || 0,
        videoStream: remoteStream,
      });
    });

    // 4. Also keep any persistent students from session.students who aren't already placed
    const existingEnrolled = Array.isArray(session.students) ? session.students : [];
    existingEnrolled.forEach((st) => {
      if (
        !st ||
        st.isEmptySeat ||
        st.isUser ||
        st.id?.startsWith('seat-') ||
        st.name?.startsWith('Seat ') ||
        (st as any).role === 'faculty' ||
        (st as any).role === 'college_admin'
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
        });
      }
    });

    // 5. Fill remaining seats up to capacity as open/available desks
    for (let sn = 1; sn <= capacity; sn++) {
      if (!seatMap.has(sn)) {
        seatMap.set(sn, {
          id: `seat-${sn}-empty`,
          seatNumber: sn,
          name: `Seat ${sn}`,
          college: 'Available Desk',
          course: '',
          batch: '',
          avatar: '',
          isUser: false,
          isRealPeer: false,
          isEmptySeat: true,
          isSpeaking: false,
          micActive: false,
          cameraActive: false,
          speakingTurns: 0,
          speakingDurationSeconds: 0,
          videoStream: null,
        });
      }
    }

    return Array.from(seatMap.values()).sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
  }, [
    session.students,
    session.maxCapacity,
    rtcPeers,
    rtcPeerStreams,
    rtcAssignedSeat,
    currentUser?.id,
    currentUser?.name,
    currentUser?.avatar,
    currentUser?.college,
    currentUser?.role,
    isFaculty,
    isListeningMic,
    rtcIsSpeakingLive,
    rtcIsMicMuted,
    isCameraOn,
    videoStream,
  ]);

  // Automated Live Discussion Multi-Stream Video/Audio Recorder
  // Runs on Faculty/Admin or active Student client so EVERY GD is recorded reliably
  const isRecordingClient = useMemo(() => {
    if (isFacultyOrAdmin) return true;
    const hasFacultyInRoom = Array.from(rtcPeerStreams?.keys() || []).some((k) => k.toLowerCase().includes('faculty'));
    if (hasFacultyInRoom) return false;
    return true;
  }, [isFacultyOrAdmin, rtcPeerStreams]);

  const gdRecorder = useGDRecorder({
    slotId: session.slotId || session.id || 'slot-1',
    isSessionActive: session.status === 'active',
    localStream: videoStream,
    localAudioStream: audioStream,
    peerStreams: rtcPeerStreams,
    recordVideo: true,
    enabled: isRecordingClient,
    topicTitle: session.topic || (session as any).topicTitle || 'Group Discussion',
    participantTiles: activeDisplayStudents.map((st) => ({
      id: st.id,
      name: st.name,
      college: st.college,
      seatNumber: st.seatNumber,
      isSpeaking: st.isSpeaking,
      cameraActive: st.cameraActive,
      videoStream: st.videoStream,
    })),
    autoStartOnActive: true,
  });
  gdRecorderRef.current = gdRecorder;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__erusStopAndUploadRecording = () =>
        gdRecorderRef.current?.stopAndUploadRecording(session.slotId || session.id);
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__erusStopAndUploadRecording;
      }
    };
  }, [session.slotId, session.id]);

  // Conclude or leave GD discussion with automatic video recording preservation
  const handleConcludeOrLeaveSession = useCallback(async () => {
    if (gdRecorder.isRecording) {
      try {
        await gdRecorder.stopAndUploadRecording(session.slotId || session.id);
      } catch (recErr) {
        console.warn('[GD Room] Recording upload on exit failed:', recErr);
      }
    }
    if (isFaculty) {
      rtcFinishSession();
    }
    onFinishSession();
  }, [gdRecorder, session.slotId, session.id, isFaculty, rtcFinishSession, onFinishSession]);

  const latestSpeakerTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
  const activeStudentUser = !isFaculty ? activeDisplayStudents.find((s) => s.isUser) : null;
  const currentSpeakerStudent = activeDisplayStudents.find((s) => s.id === session.currentSpeakerId) ||
    (isListeningMic && !isFaculty ? activeStudentUser : null) ||
    activeDisplayStudents.find((s) => s.id === latestSpeakerTranscript?.speakerId) ||
    activeDisplayStudents.find((s) => s.isSpeaking) ||
    activeStudentUser ||
    activeDisplayStudents[0];
  const isSpeakingLive = !!(session.currentSpeakerId || (isListeningMic && !isFaculty) || activeDisplayStudents.some((s) => s.isSpeaking));
  
  const liveEnlargedStudent = useMemo(() => {
    if (!enlargedStudent) return null;
    const matched = activeDisplayStudents.find(
      (s) => s.id === enlargedStudent.id || (s.seatNumber && s.seatNumber === enlargedStudent.seatNumber)
    );
    if (!matched) return enlargedStudent;
    if (!matched.videoStream && !matched.isUser && rtcPeerStreams.size > 0) {
      const peer = rtcPeers.find((p) => p.seatNumber === matched.seatNumber || p.userId === matched.id);
      const stream = peer ? rtcPeerStreams.get(peer.socketId) : Array.from(rtcPeerStreams.values())[0];
      if (stream) {
        return { ...matched, videoStream: stream };
      }
    }
    return matched;
  }, [enlargedStudent, activeDisplayStudents, rtcPeerStreams, rtcPeers]);

  // ============================================================================
  // ERUS AI INSTRUCTOR – CLASSROOM PRESENTATION STATE (7-PAGE EXECUTION SCRIPT)
  // ============================================================================
  const [classroomPhase, setClassroomPhase] = useState<
    | 'not_started'
    | 'opening'
    | 'calling_presenter'
    | 'presenting'
    | 'peer_qa_invite'
    | 'peer_qa_active'
    | 'silence_watchdog'
    | 'ai_answering'
    | 'takeaway_feedback'
    | 'closing'
    | 'completed'
  >('not_started');

  const [currentPresenterIndex, setCurrentPresenterIndex] = useState<number>(0);
  const [presentationSeconds, setPresentationSeconds] = useState<number>(0);
  const [invitedPeerStudentId, setInvitedPeerStudentId] = useState<string | null>(null);
  const [classroomCurrentQuestion, setClassroomCurrentQuestion] = useState<string>('');
  const [classroomCurrentAnswer, setClassroomCurrentAnswer] = useState<string>('');
  const [classroomCurrentTakeaway, setClassroomCurrentTakeaway] = useState<string>('');
  const [isClassroomAutoRunning, setIsClassroomAutoRunning] = useState<boolean>(true);
  const [classroomWatchdogCountdown, setClassroomWatchdogCountdown] = useState<number>(8);
  const classroomWatchdogTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 6 Assigned Sub-Topics for Classroom Presentation Mode
  const classroomAssignedTopics = useMemo<ClassroomAssignedTopic[]>(() => {
    return getClassroomAssignedTopics(session.topic);
  }, [session.topic]);

  const currentPresenterStudent = useMemo<Student>(() => {
    return activeDisplayStudents[currentPresenterIndex] || session.students[currentPresenterIndex] || activeDisplayStudents[0] || session.students[0];
  }, [activeDisplayStudents, session.students, currentPresenterIndex]);

  const currentPresenterAssignedTopic = useMemo<ClassroomAssignedTopic>(() => {
    return classroomAssignedTopics[currentPresenterIndex] || classroomAssignedTopics[0];
  }, [classroomAssignedTopics, currentPresenterIndex]);

  // Presentation stopwatch: counts seconds spent at the podium
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (currentLayout === 'classroom' && isSessionActive && classroomPhase === 'presenting') {
      timer = setInterval(() => {
        setPresentationSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentLayout, isSessionActive, classroomPhase]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const committedResultIndexRef = useRef<number>(-1);
  const studentTurnsSinceIntervention = useRef<number>(0);
  const aiVoicePausedMicRef = useRef(false);
  const aiVoiceResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executeNextTurnRef = useRef<((completedStudentId?: string | null, questionAsked?: string) => Promise<void>) | null>(null);
  const yieldFloorAndNotifyRef = useRef<() => void>(() => {});

  // Cleanly yields speaking floor and notifies WebRTC room when candidate concludes their turn
  const yieldFloorAndNotify = useCallback(() => {
    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    setSession((prev) => ({
      ...prev,
      currentSpeakerId: null,
      students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
    }));
    setInvitedStudentPrompt(null);
    rtcNotifySpeakingFinished();
    if (!isSocketConnected && autoSimulatePeers && userStudent) {
      if (executeNextTurnRef.current) {
        executeNextTurnRef.current(userStudent.id);
      }
    }
  }, [session.students, rtcNotifySpeakingFinished, isSocketConnected, autoSimulatePeers]);

  yieldFloorAndNotifyRef.current = yieldFloorAndNotify;

  // AI voices are played through the user's speakers. While AI speaks,
  // ignore speech recognition results to prevent speaker audio feedback,
  // then resume capturing user speech after AI completes.
  useEffect(() => {
    const handleAiVoiceStart = () => {
      aiVoicePausedMicRef.current = true;
      if (speechPauseTimerRef.current) {
        clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
      }
      if (aiVoiceResumeTimerRef.current) {
        clearTimeout(aiVoiceResumeTimerRef.current);
        aiVoiceResumeTimerRef.current = null;
      }
      // Safety watchdog: verify when voice has finished or stopped
      const checkVoiceFinished = () => {
        if (!roomVoice.isSpeaking()) {
          aiVoicePausedMicRef.current = false;
          aiVoiceResumeTimerRef.current = null;
        } else {
          aiVoiceResumeTimerRef.current = setTimeout(checkVoiceFinished, 500);
        }
      };
      aiVoiceResumeTimerRef.current = setTimeout(checkVoiceFinished, 800);
    };

    const handleAiVoiceEnd = () => {
      if (aiVoiceResumeTimerRef.current) {
        clearTimeout(aiVoiceResumeTimerRef.current);
        aiVoiceResumeTimerRef.current = null;
      }
      aiVoicePausedMicRef.current = false;
    };

    window.addEventListener('erus-ai-voice-start', handleAiVoiceStart);
    window.addEventListener('erus-ai-voice-end', handleAiVoiceEnd);
    return () => {
      window.removeEventListener('erus-ai-voice-start', handleAiVoiceStart);
      window.removeEventListener('erus-ai-voice-end', handleAiVoiceEnd);
      if (aiVoiceResumeTimerRef.current) clearTimeout(aiVoiceResumeTimerRef.current);
    };
  }, []);



  // Auto scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Auto-commit helper for live speech to broadcast directly to the room
  const commitLiveSpeechToRoom = (forcedText?: string) => {
    if (speechPauseTimerRef.current) {
      clearTimeout(speechPauseTimerRef.current);
      speechPauseTimerRef.current = null;
    }

    const textToCommit = String(forcedText || liveTranscriptRef.current || liveSpeechTranscript || '').trim();
    if (!textToCommit) return;

    // Reset live buffers
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');

    // Broadcast directly to room transcript & peers
    if (handleSendUserStatementRef.current) {
      handleSendUserStatementRef.current(textToCommit);
    }
  };

  // MediaRecorder Fallback & AI Speech-To-Text pipeline
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastWebSpeechTimeRef = useRef<number>(Date.now());
  const isTranscribingAudioRef = useRef<boolean>(false);
  const mediaRecorderIntervalRef = useRef<any>(null);

  const startMediaRecorderFallback = (stream: MediaStream) => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !stream) return;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (aiVoicePausedMicRef.current || roomVoice.isSpeaking()) return;
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        if (aiVoicePausedMicRef.current || roomVoice.isSpeaking()) {
          audioChunksRef.current = [];
          return;
        }
        if (audioChunksRef.current.length === 0) return;
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        audioChunksRef.current = [];

        // If Web Speech API hasn't delivered text in the last 2 seconds and chunk has sound (>2KB)
        const timeSinceWebSpeech = Date.now() - lastWebSpeechTimeRef.current;
        if (timeSinceWebSpeech > 2000 && audioBlob.size > 2000 && !isTranscribingAudioRef.current) {
          isTranscribingAudioRef.current = true;
          try {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64Audio = reader.result as string;
              if (base64Audio) {
                try {
                  const res = await fetch('/api/session/transcribe-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ audioBase64: base64Audio, mimeType: mime }),
                  });
                  const d = await res.json();
                  const cleanText = String(d?.text || '').trim();
                  if (d.success && cleanText) {
                    commitLiveSpeechToRoom(cleanText);
                  }
                } catch (err) {
                  console.warn('Fallback transcription fetch notice:', err);
                } finally {
                  isTranscribingAudioRef.current = false;
                }
              } else {
                isTranscribingAudioRef.current = false;
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch {
            isTranscribingAudioRef.current = false;
          }
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;

      if (mediaRecorderIntervalRef.current) clearInterval(mediaRecorderIntervalRef.current);
      mediaRecorderIntervalRef.current = setInterval(() => {
        if (isListeningMicRef.current && mr.state === 'recording') {
          try {
            mr.stop();
            mr.start();
          } catch {}
        }
      }, 3500);
    } catch (e) {
      console.warn('MediaRecorder fallback init notice:', e);
    }
  };

  const stopMediaRecorderFallback = () => {
    if (mediaRecorderIntervalRef.current) {
      clearInterval(mediaRecorderIntervalRef.current);
      mediaRecorderIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  // Speech Recognition Setup (Web Speech API) with robust auto-recovery and continuous watchdog
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API not supported in this browser; MediaRecorder fallback will be active.');
      return;
    }

    const startRecognitionInstance = () => {
      if (!isListeningMicRef.current) return;

      // Clean up previous instance if any
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        const navLang = typeof navigator !== 'undefined' ? (navigator.language || 'en-IN') : 'en-IN';
        recognition.lang = (navLang && navLang.toLowerCase().includes('in')) ? 'en-IN' : (navLang.startsWith('en') ? navLang : 'en-IN');
        recognitionRef.current = recognition;

        committedResultIndexRef.current = -1;

        recognition.onstart = () => {
          isRecognitionRunningRef.current = true;
        };

        recognition.onresult = (event: any) => {
          // CRITICAL: Ignore microphone input while AI Facilitator voice is playing through speakers
          // so speaker echo does NOT cut off the AI Facilitator mid-sentence or transcribe AI speech as student speech!
          if (aiVoicePausedMicRef.current || roomVoice.isSpeaking()) {
            committedResultIndexRef.current = event.results.length - 1;
            return;
          }
          lastWebSpeechTimeRef.current = Date.now();

          let interimTranscript = '';
          let finalTranscript = '';

          const startIndex = Math.max(event.resultIndex, committedResultIndexRef.current + 1);
          for (let i = startIndex; i < event.results.length; i++) {
            const piece = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalTranscript += piece;
              committedResultIndexRef.current = i;
            } else {
              interimTranscript += piece;
            }
          }

          if (finalTranscript) {
            liveTranscriptRef.current = String((liveTranscriptRef.current || '') + ' ' + finalTranscript).trim();
          }
          const currentSpoken = String((liveTranscriptRef.current || '') + ' ' + interimTranscript).trim();
          setLiveSpeechTranscript(currentSpoken);

          // Mark speaker active on floor
          if (!isFaculty) {
            setSession((prev) => ({
              ...prev,
              currentSpeakerId: prev.students.find((s) => s.isUser)?.id || 's1',
              students: prev.students.map((s) =>
                s.isUser ? { ...s, isSpeaking: true, micActive: true } : s
              ),
            }));
          }

          // Reset silence pause timer on each spoken token
          if (speechPauseTimerRef.current) {
            clearTimeout(speechPauseTimerRef.current);
          }

          // Natural pause detection: auto-broadcast to room after 2.8s silence
          if (currentSpoken.length > 3) {
            speechPauseTimerRef.current = setTimeout(() => {
              commitLiveSpeechToRoom(currentSpoken);
            }, 2800);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('[Speech recognition event]:', event.error);
          isRecognitionRunningRef.current = false;

          if (event.error === 'no-speech') {
            // Natural silence pause between sentences: do NOT destroy the session!
            return;
          }

          if (
            event.error === 'aborted' ||
            event.error === 'audio-capture' ||
            event.error === 'network'
          ) {
            // Transient silence/network events: restart recognition cleanly
            if (isListeningMicRef.current) {
              if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
              restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 300);
            }
            return;
          }

          // Fatal permission blocks
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setIsListeningMic(false);
            isListeningMicRef.current = false;
            isRecognitionRunningRef.current = false;
            stopAudioAnalyser();
            stopMediaRecorderFallback();
            rtcSetMicEnabled(false);
            if (!isFaculty) {
              setSession((prev) => ({
                ...prev,
                students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
              }));
            }
          }
        };

        recognition.onend = () => {
          isRecognitionRunningRef.current = false;
          // If mic is supposed to remain on (user didn't mute), revive with fresh instance
          if (isListeningMicRef.current) {
            if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
            restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 200);
            return;
          }

          setIsListeningMic(false);
          stopAudioAnalyser();
          stopMediaRecorderFallback();
          rtcSetMicEnabled(false);
          if (!isFaculty) {
            setSession((prev) => ({
              ...prev,
              students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
            }));
          }
        };

        recognition.start();
      } catch (err) {
        console.warn('SpeechRecognition start error:', err);
        isRecognitionRunningRef.current = false;
        if (isListeningMicRef.current) {
          if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
          restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 350);
        }
      }
    };

    // Watchdog Heartbeat: ensures recognition is running if mic is active
    const watchdog = setInterval(() => {
      if (isListeningMicRef.current && !isRecognitionRunningRef.current) {
        startRecognitionInstance();
      }
    }, 2000);

    // Save helper reference so toggleMicRecognition can invoke it directly
    (window as any).__startErusSpeechRecognition = startRecognitionInstance;

    return () => {
      clearInterval(watchdog);
      delete (window as any).__startErusSpeechRecognition;
      if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isFaculty, stopAudioAnalyser, rtcSetMicEnabled]);

  const toggleMicRecognition = async () => {
    if (isListeningMic) {
      // User muting: auto-commit any pending speech immediately so words are not lost
      if (speechPauseTimerRef.current) {
        clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
      }
      const pendingSpeech = String(liveTranscriptRef.current || liveSpeechTranscript || '').trim();
      if (pendingSpeech) {
        commitLiveSpeechToRoom(pendingSpeech);
      }

      isListeningMicRef.current = false;
      aiVoicePausedMicRef.current = false;
      isRecognitionRunningRef.current = false;
      if (restartRecognitionTimerRef.current) {
        clearTimeout(restartRecognitionTimerRef.current);
        restartRecognitionTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch (e) {
          console.warn('Recognition abort error:', e);
        }
        recognitionRef.current = null;
      }
      setIsListeningMic(false);
      stopMediaRecorderFallback();
      stopAudioAnalyser();
      await rtcSetMicEnabled(false);
      yieldFloorAndNotifyRef.current();
      if (!isFaculty) {
        setSession((prev) => ({
          ...prev,
          students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
        }));
      }
    } else {
      if (roomVoice.isSpeaking() || session.isFacilitatorSpeaking) {
        roomVoice.stop();
        setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      }
      liveTranscriptRef.current = '';
      setLiveSpeechTranscript('');
      aiVoicePausedMicRef.current = false;
      if (aiVoiceResumeTimerRef.current) {
        clearTimeout(aiVoiceResumeTimerRef.current);
        aiVoiceResumeTimerRef.current = null;
      }

      isListeningMicRef.current = true;
      setIsListeningMic(true);

      // Acquire and verify microphone stream & live VU analyser
      let activeMicStream: MediaStream | null = null;
      try {
        activeMicStream = await startAudioAnalyser();
      } catch (e) {
        console.warn('startAudioAnalyser error:', e);
      }

      await rtcSetMicEnabled(true);

      // Start MediaRecorder fallback using the verified stream
      if (activeMicStream) {
        startMediaRecorderFallback(activeMicStream);
      }

      if (typeof (window as any).__startErusSpeechRecognition === 'function') {
        (window as any).__startErusSpeechRecognition();
      } else if (recognitionRef.current && !isRecognitionRunningRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          setTimeout(() => {
            if (isListeningMicRef.current && !isRecognitionRunningRef.current && recognitionRef.current) {
              try { recognitionRef.current.start(); } catch {}
            }
          }, 150);
        }
      }
      if (!isFaculty) {
        setSession((prev) => ({
          ...prev,
          students: prev.students.map((s) => (s.isUser ? { ...s, micActive: true } : s)),
        }));
      }
    }
  };

  // Helper for candidate to explicitly finish speaking and pass floor to other participants/facilitator
  const handlePassFloor = useCallback(async () => {
    if (speechPauseTimerRef.current) {
      clearTimeout(speechPauseTimerRef.current);
      speechPauseTimerRef.current = null;
    }
    const pendingSpeech = String(liveTranscriptRef.current || liveSpeechTranscript || '').trim();
    if (pendingSpeech) {
      commitLiveSpeechToRoom(pendingSpeech);
    }
    yieldFloorAndNotifyRef.current();
    if (isListeningMicRef.current) {
      await toggleMicRecognition();
    }
  }, [liveSpeechTranscript]);

  // Trigger Facilitator speech and vocalize
  const speakFacilitator = (
    text: string, 
    actionType: string = 'probing_question', 
    phase?: GDFacilitatorPhase,
    onSpeechEnd?: () => void
  ) => {
    // Participant priority: never speak over a speaking participant
    const isParticipantSpeaking = !!(
      isListeningMicRef.current ||
      rtcIsSpeakingLive ||
      (rtcLocalVolume > 6 || userMediaAudioLevel > 6) ||
      session.currentSpeakerId ||
      rtcPeers.some((p) => p.isSpeaking && p.role === 'student')
    );
    if (isParticipantSpeaking) {
      console.log('[Facilitator] Participant is speaking, cannot vocalize AI speech.');
      setIsAiProcessing(false);
      return;
    }

    const safeSpeechText = String(text || '');
    setIsAiProcessing(true);
    setSession((prev) => ({
      ...prev,
      facilitatorSpeech: safeSpeechText,
      facilitatorAction: actionType,
      isFacilitatorSpeaking: true,
      currentPhase: phase || prev.currentPhase,
      silenceTimerSeconds: 0,
    }));

    // Add entry to transcript
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    
    const entry: TranscriptEntry = {
      id: `t-${Date.now()}`,
      sessionId: session.id,
      speakerId: 'ai-facilitator',
      speakerName: 'AI Facilitator (ERUS)',
      seatNumber: null,
      isFacilitator: true,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds,
      text: safeSpeechText,
      type: phase === 'intro' ? 'intro' : phase === 'conclusion' ? 'conclusion' : 'moderation',
      sentiment: 'positive',
    };

    const trimmedSpeechText = safeSpeechText.trim();
    setTranscripts((prev) => {
      if (prev.some((t) => t.isFacilitator && String(t.text || '').trim() === trimmedSpeechText)) {
        return prev;
      }
      return [...prev, entry];
    });

    facilitatorVoice.speak(safeSpeechText, () => {
      setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      setIsAiProcessing(false);
      if (onSpeechEnd) {
        onSpeechEnd();
      }
    });
  };

  // Call Server for AI Facilitation Intervention with Anti-Repetition Tracking
  const requestAiIntervention = async (specificPhase?: GDFacilitatorPhase) => {
    try {
      setIsAiProcessing(true);
      const askedList = sessionQuestionTracker.getAskedQuestionsList();

      const res = await fetch('/api/facilitator/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: session.topic,
          phase: specificPhase || session.currentPhase,
          transcriptHistory: transcripts,
          students: session.students,
          silenceDurationSeconds: session.silenceTimerSeconds,
          previousQuestions: askedList,
        }),
      });

      const data = await res.json();
      if (data.speech) {
        sessionQuestionTracker.recordQuestion(data.speech);
        speakFacilitator(data.speech, data.actionType, specificPhase);
        studentTurnsSinceIntervention.current = 0;
        return;
      }
    } catch (err) {
      console.warn('Facilitator API fallback triggered:', err);
    } finally {
      setIsAiProcessing(false);
    }

    // Dynamic, non-repeating contextual fallback
    const dynamicPrompt = getNextUniqueFacilitatorPrompt(
      session.topic,
      transcripts,
      session.students,
      specificPhase || session.currentPhase,
      false
    );

    speakFacilitator(dynamicPrompt.text, dynamicPrompt.actionType as any, specificPhase);
    studentTurnsSinceIntervention.current = 0;
  };

  // User or Faculty submits a spoken statement / guidance
  const handleSendUserStatement = async (textToSend?: string) => {
    // If not active, auto-activate session so student speech is never discarded
    if (!isSessionActive && !isFaculty) {
      setSession((prev) => ({
        ...prev,
        status: 'active',
        startedAt: prev.startedAt || Date.now(),
      }));
    }
    const text = String(textToSend || liveSpeechTranscript || '').trim();
    if (!text) return;

    // Reset live buffers
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');
    setInvitedStudentPrompt(null);

    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    // If Faculty is observing and intervenes or broadcasts guidance
    if (isFaculty) {
      const facultyName = currentUser?.name || session.assignedFacultyName || 'Faculty Observer';
      const facultyEntry: TranscriptEntry = {
        id: `t-faculty-${Date.now()}`,
        sessionId: session.id,
        speakerId: currentUser?.id || 'faculty-observer',
        speakerName: `${facultyName} (Faculty Observer)`,
        seatNumber: null,
        isFacilitator: true,
        timestamp: `${mins}:${secs}`,
        timestampSeconds: elapsedSeconds,
        text,
        type: 'moderation',
        sentiment: 'positive',
      };

      setTranscripts((prev) => [...prev, facultyEntry]);
      setIsAiProcessing(true);

      // Vocalize faculty intervention through facilitator voice engine
      facilitatorVoice.speak(text, () => {
        setIsAiProcessing(false);
      });

      // Peer responds to faculty directive
      if (autoSimulatePeers) {
        setTimeout(() => {
          executeNextTurn();
        }, 1200);
      }
      return;
    }

    const userStudent = (session?.students || []).find((s) => s.isUser) ||
      (session?.students || []).find((s) => !s.isEmptySeat && (s.id === currentUser?.id || s.name === currentUser?.name)) ||
      (session?.students || []).find((s) => !s.isEmptySeat) || {
      id: currentUser?.id || 'speaker-1',
      name: currentUser?.name || 'Candidate',
      seatNumber: 1,
      college: currentUser?.college || 'Institution',
      course: (currentUser as any)?.course || 'Engineering',
      batch: (currentUser as any)?.batch || '2024-2028',
      avatar: currentUser?.avatar || '',
      isUser: true,
      micActive: false,
      isSpeaking: false,
      hasRaisedHand: false,
      cameraActive: false,
      speakingDurationSeconds: 0,
      speakingTurns: 0,
      interruptionCount: 0,
      questionsAnswered: 0,
      questionsInitiated: 0,
      sentiment: 'neutral' as const,
    };

    // Check if another speaker was currently active (interruption detection)
    if (session?.currentSpeakerId && session.currentSpeakerId !== userStudent.id) {
      const interruptedStudent = (session?.students || []).find((s) => s.id === session.currentSpeakerId);
      setInterruptionWarning(`Interruption detected: ${userStudent.name} spoke while ${interruptedStudent?.name || 'peer'} was presenting.`);
      setTimeout(() => setInterruptionWarning(null), 5000);
    }

    const newEntry: TranscriptEntry = {
      id: `t-user-${Date.now()}`,
      sessionId: session?.id || '',
      speakerId: userStudent.id,
      speakerName: userStudent.name,
      seatNumber: userStudent.seatNumber,
      isFacilitator: false,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds,
      text,
      type: 'statement',
      sentiment: 'positive',
    };

    setTranscripts((prev) => [...prev, newEntry]);
    studentTurnsSinceIntervention.current += 1;

    // Broadcast live to all connected peers in the room via WebRTC Socket.IO (PDF Page 5, FR-1)
    rtcBroadcastTranscript(text, elapsedSeconds, newEntry.id);

    // Update user stats and mark speaking while delivering statement
    setSession((prev) => ({
      ...prev,
      silenceTimerSeconds: 0,
      currentSpeakerId: userStudent.id,
      students: prev.students.map((s) =>
        s.id === userStudent.id
          ? {
              ...s,
              isSpeaking: true,
              speakingTurns: s.speakingTurns + 1,
              speakingDurationSeconds: Math.max(
                s.speakingDurationSeconds + 1,
                s.speakingDurationSeconds + Math.max(8, Math.round(text.split(/\s+/).filter(Boolean).length / 2.1))
              ),
              lastSpokenAt: Date.now(),
            }
          : { ...s, isSpeaking: false }
      ),
    }));

    // Send to backend API
    try {
      fetch('/api/session/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: userStudent.id,
          text,
          elapsedSeconds,
        }),
      }).catch((e) => console.warn('Speak API sync:', e));
    } catch (e) {
      console.warn(e);
    }

    // If triggered without live mic (e.g. Quick Speaking Point clicked or typed), vocalize in authentic Indian English so it is audible to everyone
    if (!isListeningMic && !isFaculty) {
      roomVoice.speakAsStudent(userStudent, text, () => {
        yieldFloorAndNotifyRef.current();
      });
    } else {
      // With live microphone active: candidate retains full ownership of the floor!
      // They can speak multiple continuous points or pause to think.
      // Floor will only be yielded when candidate mutes the mic or clicks 'Done / Pass Floor'.
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: userStudent.id,
        students: prev.students.map((s) =>
          s.id === userStudent.id
            ? { ...s, isSpeaking: true, micActive: true }
            : s
        ),
      }));
    }
  };

  handleSendUserStatementRef.current = handleSendUserStatement;

  // Vocalize and activate speech for simulated peers with Indian English voice
  const startPeerSpeech = (peer: Student, statementText: string) => {
    if (!isSessionActive) return;

    studentTurnsSinceIntervention.current += 1;
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    setSession((prev) => ({
      ...prev,
      currentSpeakerId: peer.id,
      silenceTimerSeconds: 0,
      students: prev.students.map((s) =>
        s.id === peer.id
          ? {
              ...s,
              isSpeaking: true,
              speakingTurns: (s.speakingTurns || 0) + 1,
              speakingDurationSeconds: (s.speakingDurationSeconds || 0) + 20,
              lastSpokenAt: Date.now(),
            }
          : { ...s, isSpeaking: false }
      ),
    }));

    const peerTx: TranscriptEntry = {
      id: `t-peer-${Date.now()}`,
      sessionId: session.id,
      speakerId: peer.id,
      speakerName: peer.name,
      seatNumber: peer.seatNumber,
      isFacilitator: false,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds,
      text: statementText,
      type: 'statement',
      sentiment: 'positive',
    };

    setTranscripts((prev) => [...prev, peerTx]);

    // Audibly speak as the peer student in authentic Indian English!
    roomVoice.speakAsStudent(peer, statementText, () => {
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: null,
        students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
      }));

      // When peer finishes speaking, automatically shift to the candidate who hasn't spoken yet!
      setTimeout(() => {
        executeNextTurn(peer.id);
      }, 1500);
    });
  };

  // Turn orchestration engine: shifts to candidate who hasn't spoken yet (speakingTurns === 0),
  // or to the next person in sequence with lowest turn count
  const executeNextTurn = async (completedStudentId?: string | null, questionAsked?: string) => {
    if (!isSessionActive) return;
    if (isSocketConnected) return; // Server orchestrates turns over WebRTC
    if (hasRealStudentPeers) return;
    if (isTransitioningTurnRef.current) return;
    isTransitioningTurnRef.current = true;

    setSession((prev) => ({
      ...prev,
      currentSpeakerId: null,
      students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
    }));

    // Find next speaker using turn-taking logic
    const nextSpeaker = getNextTurnSpeaker(session.students, completedStudentId);
    if (!nextSpeaker) {
      isTransitioningTurnRef.current = false;
      return;
    }

    // If next speaker is the active human user
    if (nextSpeaker.isUser) {
      isTransitioningTurnRef.current = false;
      const isFirstTurn = (nextSpeaker.speakingTurns || 0) === 0;
      setInvitedStudentPrompt({
        student: nextSpeaker,
        reason: isFirstTurn
          ? `Floor has shifted to you! You have not spoken yet. Share your opening perspective on "${session.topic}".`
          : `Floor has shifted back to you. Continue your argument or respond to the previous speaker.`,
        promptText: questionAsked || undefined,
      });
      return;
    }

    // If next speaker is an autonomous peer
    if (!autoSimulatePeers) {
      isTransitioningTurnRef.current = false;
      return;
    }

    setTimeout(async () => {
      isTransitioningTurnRef.current = false;
      if (!isSessionActive) return;

      const latestStudentTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
      const prevSpeakerInfo = latestStudentTranscript
        ? { name: latestStudentTranscript.speakerName, text: latestStudentTranscript.text }
        : undefined;

      let peerStatement = '';
      try {
        const res = await fetch('/api/session/simulate-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elapsedSeconds,
            targetStudentId: nextSpeaker.id,
            questionAsked,
            mode: questionAsked ? 'targeted_answer' : ((nextSpeaker.speakingTurns || 0) === 0 ? 'initiation' : 'follow_up'),
          }),
        });
        const data = await res.json();
        if (data.success && data.transcript && data.transcript.text) {
          peerStatement = data.transcript.text;
        }
      } catch (err) {
        console.warn('Backend peer simulation fallback:', err);
      }

      if (!peerStatement) {
        if ((nextSpeaker.speakingTurns || 0) === 0 && !questionAsked) {
          peerStatement = generateStudentOpeningStatement(nextSpeaker, session.topic);
        } else {
          peerStatement = generateStudentFollowUpStatement(nextSpeaker, session.topic, prevSpeakerInfo, questionAsked);
        }
      }

      startPeerSpeech(nextSpeaker, peerStatement);
    }, 1800);
  };
  executeNextTurnRef.current = executeNextTurn;

  // If no one speaks initially, AI Facilitator calls upon a student referencing their previous presentation
  const handleInitiateOpeningSpeaker = (force: boolean = false) => {
    if (rtcSimulationMode) return;
    if (isSocketConnected) return; // Central server coordinates authoritative welcome and opening
    if (hasInitiatedOpeningRef.current) return;
    const hasFacilitatorSpoken = transcripts.some((t) => t.isFacilitator);
    if (hasFacilitatorSpoken) {
      hasInitiatedOpeningRef.current = true;
      return;
    }
    if (!force) {
      if (!isSessionActive || session.isFacilitatorSpeaking || session.currentSpeakerId) return;
    }

    const studentTranscripts = transcripts.filter((t) => !t.isFacilitator);
    if (!force && studentTranscripts.length > 0) {
      hasInitiatedOpeningRef.current = true;
      return;
    }

    hasInitiatedOpeningRef.current = true;

    // Select candidate to initiate (Seat 1 or first available student)
    const rawCandidates = (session.students && session.students.length > 0) ? session.students : generateSlotParticipants(8);
    const openingCandidate = rawCandidates.find((s) => !s.isEmptySeat) || rawCandidates[0];
    if (!openingCandidate) return;

    const initiationPrompt = generateInitiationPrompt(openingCandidate, session.topic);

    // Broadcast over socket so all connected peers receive the opening facilitator prompt
    if (rtcBroadcastFacilitatorSpeech) {
      rtcBroadcastFacilitatorSpeech(initiationPrompt, 'initiate_opening_speaker');
    }

    speakFacilitator(initiationPrompt, 'initiate_opening_speaker', 'intro', () => {
      if (openingCandidate.isUser) {
        setInvitedStudentPrompt({
          student: openingCandidate,
          reason: `AI Facilitator has invited you to initiate the discussion based on your previous presentation!`,
          promptText: initiationPrompt,
        });
      } else if (autoSimulatePeers && !hasRealStudentPeers) {
        setTimeout(() => {
          const openingStmt = generateStudentOpeningStatement(openingCandidate, session.topic);
          startPeerSpeech(openingCandidate, openingStmt);
        }, 1200);
      }
    });
  };

  // If silence occurs during discussion, AI Facilitator asks a targeted question explicitly mentioning the candidate by name
  const handleFacilitatorTargetedProbe = () => {
    if (rtcSimulationMode) return;
    if (!isSessionActive || session.isFacilitatorSpeaking || rtcIsSpeakingLive || isTransitioningTurnRef.current) return;
    if (Date.now() - lastFacilitatorInterventionTimeRef.current < 6000) return;

    lastFacilitatorInterventionTimeRef.current = Date.now();

    // Prioritize student who hasn't spoken yet, or lowest turn count
    const targetStudent = getNextTurnSpeaker(session.students, null) || session.students.find(s => !s.isEmptySeat) || session.students[0];
    if (!targetStudent) return;

    const latestStudentTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
    const targetedQuestion = generateTargetedQuestionForStudent(targetStudent, session.topic, latestStudentTranscript);

    // Broadcast over socket so all connected peers receive the question
    if (rtcBroadcastFacilitatorSpeech) {
      rtcBroadcastFacilitatorSpeech(targetedQuestion, 'targeted_question_student');
    }

    speakFacilitator(targetedQuestion, 'targeted_question_student', 'probing', () => {
      if (targetStudent.isUser) {
        setInvitedStudentPrompt({
          student: targetStudent,
          reason: `AI Facilitator asked you directly: "${targetedQuestion}"`,
          promptText: targetedQuestion,
        });
      } else if (autoSimulatePeers) {
        setTimeout(() => {
          const ansStmt = generateStudentFollowUpStatement(targetStudent, session.topic, { name: 'Facilitator' }, targetedQuestion);
          startPeerSpeech(targetStudent, ansStmt);
        }, 1200);
      }
    });
  };

  // Silence Watchdog: triggers opening initiation (8s silence) or targeted question mentioning name (15s mid-discussion silence)
  useEffect(() => {
    if (rtcSimulationMode) return;
    if (!isSessionActive || currentLayout === 'classroom') return;

    const studentTranscripts = transcripts.filter((t) => !t.isFacilitator);

    // 1. Opening silence (if no one speaks within 8 seconds of commencing and facilitator has not already spoken)
    const hasAnyFacilitatorSpeech = transcripts.some((t) => t.isFacilitator);
    if (studentTranscripts.length === 0 && !hasInitiatedOpeningRef.current && !hasAnyFacilitatorSpeech) {
      if (rtcSilenceTimer >= 8 || session.silenceTimerSeconds >= 8 || elapsedSeconds >= 8) {
        if (!isSocketConnected) {
          handleInitiateOpeningSpeaker();
          return;
        }
      }
    }

    // 2. Mid-discussion silence (if floor is silent for 15 seconds, request intervention or probe)
    const currentSilence = Math.max(rtcSilenceTimer, session.silenceTimerSeconds, localSilenceSeconds);
    if (
      currentSilence >= 15 &&
      !session.isFacilitatorSpeaking &&
      !roomVoice.isSpeaking() &&
      !aiVoicePausedMicRef.current &&
      !rtcIsSpeakingLive &&
      !isTransitioningTurnRef.current
    ) {
      if (Date.now() - lastFacilitatorInterventionTimeRef.current >= 16000) {
        const requestTimestamp = Date.now();
        lastFacilitatorInterventionTimeRef.current = requestTimestamp;
        setLocalSilenceSeconds(0);
        if (isSocketConnected && rtcRequestAiIntervention) {
          console.log('[Silence Watchdog] Floor silent for 15s; requesting AI facilitator intervention.');
          rtcRequestAiIntervention();
          // Fallback probe ONLY if server did not send any intervention within 6.5 seconds
          setTimeout(() => {
            if (
              lastFacilitatorInterventionTimeRef.current <= requestTimestamp &&
              !session.isFacilitatorSpeaking &&
              !roomVoice.isSpeaking() &&
              !rtcIsSpeakingLive
            ) {
              console.log('[Silence Watchdog] Server response delay; falling back to local targeted probe.');
              handleFacilitatorTargetedProbe();
            }
          }, 6500);
        } else {
          console.log('[Silence Watchdog] Floor silent for 15s; local targeted probe.');
          handleFacilitatorTargetedProbe();
        }
      }
    }
  }, [
    isSessionActive,
    isSocketConnected,
    currentLayout,
    session.silenceTimerSeconds,
    rtcSilenceTimer,
    localSilenceSeconds,
    elapsedSeconds,
    session.currentSpeakerId,
    session.isFacilitatorSpeaking,
    rtcIsSpeakingLive,
    transcripts.length,
    rtcSimulationMode,
    rtcRequestAiIntervention,
  ]);

  // Reset initiation flag and trigger opening speaker when session becomes active (only in round-table / speaker layouts)
  useEffect(() => {
    if (session.status === 'active' && currentLayout !== 'classroom') {
      if (isSocketConnected) {
        // When connected via WebRTC socket, central server controls opening welcome and turns
        return;
      }
      const timer = setTimeout(() => {
        if (!hasInitiatedOpeningRef.current && transcripts.filter((t) => t.isFacilitator).length === 0) {
          handleInitiateOpeningSpeaker(true);
        }
      }, 800);
      return () => clearTimeout(timer);
    } else {
      hasInitiatedOpeningRef.current = false;
      setInvitedStudentPrompt(null);
    }
  }, [session.status, session.id, currentLayout, isSocketConnected]);

  // ============================================================================
  // ERUS AI INSTRUCTOR – CLASSROOM PRESENTATION EXECUTION CONTROLLER
  // Implementing the official 7-Page Presentation Activity Script verbatim
  // ============================================================================

  // 1. Seminar Opening
  const handleStartClassroomOpening = useCallback(() => {
    setClassroomPhase('opening');
    setClassroomCurrentQuestion('');
    setClassroomCurrentAnswer('');
    setClassroomCurrentTakeaway('');
    speakFacilitator(CLASSROOM_INSTRUCTOR_SCRIPTS.OPENING, 'classroom_opening', 'intro', () => {
      if (isClassroomAutoRunning) {
        setTimeout(() => {
          handleClassroomCallPresenter(0);
        }, 1200);
      }
    });
  }, [isClassroomAutoRunning]);

  // 2. Calling Students in Serial Order (1 to 6)
  const handleClassroomCallPresenter = useCallback((index: number) => {
    if (index >= 6) {
      handleClassroomDeliverClosing();
      return;
    }
    setCurrentPresenterIndex(index);
    setClassroomPhase('calling_presenter');
    setPresentationSeconds(0);
    setClassroomCurrentQuestion('');
    setClassroomCurrentAnswer('');
    setClassroomCurrentTakeaway('');
    setInvitedPeerStudentId(null);

    const callScript = CLASSROOM_INSTRUCTOR_SCRIPTS.CALLING[index] || CLASSROOM_INSTRUCTOR_SCRIPTS.CALLING[0];
    speakFacilitator(callScript, 'classroom_call_presenter', 'discussion', () => {
      handleClassroomStartPresenting(index);
    });
  }, [classroomAssignedTopics]);

  // 3. Presentation Delivery at Podium
  const handleClassroomStartPresenting = useCallback((index: number) => {
    setClassroomPhase('presenting');
    setPresentationSeconds(0);
    const presenter = activeDisplayStudents[index] || session.students[index] || activeDisplayStudents[0] || session.students[0];
    const assigned = classroomAssignedTopics[index] || classroomAssignedTopics[0];

    setSession((prev) => ({
      ...prev,
      currentSpeakerId: presenter.id,
      students: prev.students.map((s) => ({
        ...s,
        isSpeaking: s.id === presenter.id,
      })),
    }));

    if (!presenter.isUser) {
      const speechText = generateClassroomStudentPresentation(presenter, session.topic, assigned);
      const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
      const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
      const pEntry: TranscriptEntry = {
        id: `t-pres-${Date.now()}`,
        sessionId: session.id,
        speakerId: presenter.id,
        speakerName: presenter.name,
        seatNumber: presenter.seatNumber,
        isFacilitator: false,
        timestamp: `${mins}:${secs}`,
        timestampSeconds: elapsedSeconds,
        text: speechText,
        type: 'statement',
        sentiment: 'positive',
      };
      setTranscripts((prev) => [...prev, pEntry]);

      roomVoice.speakAsStudent(presenter, speechText, () => {
        setSession((prev) => ({
          ...prev,
          currentSpeakerId: null,
          students: prev.students.map((s) =>
            s.id === presenter.id
              ? { ...s, isSpeaking: false, speakingTurns: (s.speakingTurns || 0) + 1, speakingDurationSeconds: (s.speakingDurationSeconds || 0) + 40 }
              : s
          ),
        }));
        if (isClassroomAutoRunning) {
          setTimeout(() => {
            handleClassroomInitiatePeerQA(index);
          }, 1500);
        }
      });
    } else {
      // User is presenting at the podium
      setInvitedStudentPrompt({
        student: presenter,
        reason: `You are at the podium! Deliver your presentation on "${assigned.subTopicTitle}". Click 'Conclude Presentation' when ready for Q&A.`,
        promptText: `Assigned Sub-Topic: ${assigned.subTopicTitle}\nFocus Area: ${assigned.focusArea}\nRecommended: 6–8 minutes`,
      });
    }
  }, [activeDisplayStudents, session.students, session.topic, classroomAssignedTopics, elapsedSeconds, isClassroomAutoRunning]);

  // User concludes their presentation
  const handleClassroomConcludeUserSpeech = useCallback(() => {
    setInvitedStudentPrompt(null);
    setSession((prev) => ({
      ...prev,
      currentSpeakerId: null,
      students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
    }));
    handleClassroomInitiatePeerQA(currentPresenterIndex);
  }, [currentPresenterIndex]);

  // 4. Initiate Peer Questioning (Page 3)
  const handleClassroomInitiatePeerQA = useCallback((presenterIndex: number) => {
    setClassroomPhase('peer_qa_invite');
    setClassroomWatchdogCountdown(8);

    const candidatePeers = session.students.filter((_, idx) => idx !== presenterIndex);
    const peerCandidate = candidatePeers[presenterIndex % candidatePeers.length] || candidatePeers[0] || session.students[1];
    setInvitedPeerStudentId(peerCandidate.id);

    const peerNum = peerCandidate.seatNumber || (session.students.indexOf(peerCandidate) + 1);
    const inviteScript = CLASSROOM_INSTRUCTOR_SCRIPTS.PEER_QUESTION_INVITE(peerNum);

    speakFacilitator(inviteScript, 'classroom_qa_invite', 'probing', () => {
      setClassroomPhase('peer_qa_active');
      setClassroomWatchdogCountdown(8);

      if (classroomWatchdogTimerRef.current) clearInterval(classroomWatchdogTimerRef.current);
      let timeLeft = 8;
      classroomWatchdogTimerRef.current = setInterval(() => {
        timeLeft -= 1;
        setClassroomWatchdogCountdown(timeLeft);
        if (timeLeft <= 0) {
          if (classroomWatchdogTimerRef.current) clearInterval(classroomWatchdogTimerRef.current);
          handleClassroomTriggerSilenceWatchdog(presenterIndex);
        }
      }, 1000);
    });
  }, [session.students]);

  // 5. Silence Watchdog (AI Instructor asks topic-specific question - Pages 3 & 4)
  const handleClassroomTriggerSilenceWatchdog = useCallback((presenterIndex: number) => {
    if (classroomWatchdogTimerRef.current) clearInterval(classroomWatchdogTimerRef.current);
    setClassroomPhase('silence_watchdog');

    const presenter = activeDisplayStudents[presenterIndex] || session.students[presenterIndex] || activeDisplayStudents[0] || session.students[0];
    const assigned = classroomAssignedTopics[presenterIndex] || classroomAssignedTopics[0];
    const aiQuestion = assigned.suggestedQuestion;
    setClassroomCurrentQuestion(aiQuestion);

    const combinedSpeech = `${CLASSROOM_INSTRUCTOR_SCRIPTS.WHEN_SILENT} ${CLASSROOM_INSTRUCTOR_SCRIPTS.AI_QUESTION_PROMPT(aiQuestion)}`;
    speakFacilitator(combinedSpeech, 'classroom_ai_question', 'probing', () => {
      setClassroomPhase('ai_answering');

      if (!presenter.isUser) {
        const answerText = generateClassroomStudentAnswer(presenter, aiQuestion, assigned);
        setClassroomCurrentAnswer(answerText);
        const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
        const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
        const aEntry: TranscriptEntry = {
          id: `t-ans-${Date.now()}`,
          sessionId: session.id,
          speakerId: presenter.id,
          speakerName: presenter.name,
          seatNumber: presenter.seatNumber,
          isFacilitator: false,
          timestamp: `${mins}:${secs}`,
          timestampSeconds: elapsedSeconds,
          text: answerText,
          type: 'statement',
          sentiment: 'positive',
        };
        setTranscripts((prev) => [...prev, aEntry]);

        setSession((prev) => ({
          ...prev,
          currentSpeakerId: presenter.id,
          students: prev.students.map((s) => ({ ...s, isSpeaking: s.id === presenter.id })),
        }));

        roomVoice.speakAsStudent(presenter, answerText, () => {
          setSession((prev) => ({
            ...prev,
            currentSpeakerId: null,
            students: prev.students.map((s) => ({ ...s, isSpeaking: false, questionsAnswered: (s.questionsAnswered || 0) + 1 })),
          }));

          if (isClassroomAutoRunning) {
            setTimeout(() => {
              handleClassroomTakeawayAndTransition(presenterIndex);
            }, 1200);
          }
        });
      } else {
        setInvitedStudentPrompt({
          student: presenter,
          reason: `AI Instructor Question: "${aiQuestion}". Answer in your own words.`,
          promptText: aiQuestion,
        });
      }
    });
  }, [activeDisplayStudents, session.students, classroomAssignedTopics, elapsedSeconds, isClassroomAutoRunning]);

  // 6. Peer Student Asks Question (Pages 3 & 4)
  const handleClassroomPeerAsksQuestion = useCallback((presenterIndex: number, peerStudentId?: string, customQuestion?: string) => {
    if (classroomWatchdogTimerRef.current) clearInterval(classroomWatchdogTimerRef.current);
    const presenter = activeDisplayStudents[presenterIndex] || session.students[presenterIndex] || activeDisplayStudents[0] || session.students[0];
    const peer = session.students.find((s) => s.id === (peerStudentId || invitedPeerStudentId)) || session.students.find((s) => s.id !== presenter.id) || session.students[0];
    const assigned = classroomAssignedTopics[presenterIndex] || classroomAssignedTopics[0];

    const qText = customQuestion || generateClassroomPeerQuestion(peer, presenter, assigned);
    setClassroomCurrentQuestion(qText);

    speakFacilitator(CLASSROOM_INSTRUCTOR_SCRIPTS.PROMPT_ASK_QUESTION_CLEARLY, 'classroom_qa_clear', 'probing', () => {
      const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
      const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
      const qEntry: TranscriptEntry = {
        id: `t-peer-q-${Date.now()}`,
        sessionId: session.id,
        speakerId: peer.id,
        speakerName: peer.name,
        seatNumber: peer.seatNumber,
        isFacilitator: false,
        timestamp: `${mins}:${secs}`,
        timestampSeconds: elapsedSeconds,
        text: qText,
        type: 'question',
        sentiment: 'positive',
      };
      setTranscripts((prev) => [...prev, qEntry]);

      roomVoice.speakAsStudent(peer, qText, () => {
        speakFacilitator(CLASSROOM_INSTRUCTOR_SCRIPTS.PROMPT_PRESENTER_ANSWER, 'classroom_presenter_ans_prompt', 'probing', () => {
          setClassroomPhase('ai_answering');

          if (!presenter.isUser) {
            const answerText = generateClassroomStudentAnswer(presenter, qText, assigned);
            setClassroomCurrentAnswer(answerText);
            const aEntry: TranscriptEntry = {
              id: `t-ans-${Date.now()}`,
              sessionId: session.id,
              speakerId: presenter.id,
              speakerName: presenter.name,
              seatNumber: presenter.seatNumber,
              isFacilitator: false,
              timestamp: `${mins}:${secs}`,
              timestampSeconds: elapsedSeconds,
              text: answerText,
              type: 'statement',
              sentiment: 'positive',
            };
            setTranscripts((prev) => [...prev, aEntry]);

            roomVoice.speakAsStudent(presenter, answerText, () => {
              speakFacilitator(CLASSROOM_INSTRUCTOR_SCRIPTS.AFTER_PEER_ANSWER, 'classroom_after_peer', 'probing', () => {
                if (isClassroomAutoRunning) {
                  setTimeout(() => {
                    handleClassroomTakeawayAndTransition(presenterIndex);
                  }, 1200);
                }
              });
            });
          } else {
            setInvitedStudentPrompt({
              student: presenter,
              reason: `Peer question from ${peer.name}: "${qText}". Please provide your response.`,
              promptText: qText,
            });
          }
        });
      });
    });
  }, [activeDisplayStudents, session.students, invitedPeerStudentId, classroomAssignedTopics, elapsedSeconds, isClassroomAutoRunning]);

  // 7. Takeaway Feedback and Transition (Page 4)
  const handleClassroomTakeawayAndTransition = useCallback((presenterIndex: number) => {
    setClassroomPhase('takeaway_feedback');
    const assigned = classroomAssignedTopics[presenterIndex] || classroomAssignedTopics[0];
    setClassroomCurrentTakeaway(assigned.keyTakeaway);

    const speech = `${CLASSROOM_INSTRUCTOR_SCRIPTS.TAKEAWAY_FEEDBACK(assigned.keyTakeaway)} ${CLASSROOM_INSTRUCTOR_SCRIPTS.TRANSITION}`;
    speakFacilitator(speech, 'classroom_transition', 'discussion', () => {
      if (presenterIndex < 5) {
        if (isClassroomAutoRunning) {
          setTimeout(() => {
            handleClassroomCallPresenter(presenterIndex + 1);
          }, 1500);
        }
      } else {
        if (isClassroomAutoRunning) {
          setTimeout(() => {
            handleClassroomDeliverClosing();
          }, 1500);
        }
      }
    });
  }, [classroomAssignedTopics, isClassroomAutoRunning]);

  // 8. Closing Remarks (Page 5: 5 Lessons & 3 Reflections)
  const handleClassroomDeliverClosing = useCallback(() => {
    setClassroomPhase('closing');
    speakFacilitator(CLASSROOM_INSTRUCTOR_SCRIPTS.CLOSING, 'classroom_closing', 'conclusion', () => {
      setClassroomPhase('completed');
    });
  }, []);

  const handleResetClassroomActivity = useCallback(() => {
    if (classroomWatchdogTimerRef.current) clearInterval(classroomWatchdogTimerRef.current);
    setClassroomPhase('not_started');
    setCurrentPresenterIndex(0);
    setPresentationSeconds(0);
    setClassroomCurrentQuestion('');
    setClassroomCurrentAnswer('');
    setClassroomCurrentTakeaway('');
    setInvitedPeerStudentId(null);
  }, []);

  // Proactive auto-trigger for classroom mode when session starts
  useEffect(() => {
    if (currentLayout === 'classroom' && isSessionActive && classroomPhase === 'not_started' && isClassroomAutoRunning) {
      const timer = setTimeout(() => {
        handleStartClassroomOpening();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentLayout, isSessionActive, classroomPhase, isClassroomAutoRunning, handleStartClassroomOpening]);

  const handleRaiseHandToggle = () => {
    const userStudent = (session?.students || []).find((s) => s.isUser) || session?.students?.[0];
    if (!userStudent) return;
    setSession((prev) => ({
      ...prev,
      students: (prev.students || []).map((s) =>
        s.id === userStudent.id ? { ...s, hasRaisedHand: !s.hasRaisedHand } : s
      ),
    }));
  };

  const formatSecs = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  // Quick discussion starter prompts
  const quickPrompts = [
    'I believe AI can empower teachers with adaptive learning tools, but cannot replace human empathy.',
    'Regarding rural accessibility, specialized AI tutors can bridge regional teacher shortages.',
    'In technical and laboratory fields, hands-on physical guidance remains strictly essential.',
    'Could we explore how hybrid pedagogy allows teachers to focus purely on creative mentorship?',
  ];

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5">
      
      {/* Session Title & Facilitator Broadcast Banner */}
      <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl relative overflow-hidden backdrop-blur-md transition-colors duration-200">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            {/* Clean Metadata: Group Discussion Set, Slot Details, and Allotted Faculty */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {/* Group Discussion Set */}
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 shadow-2xs">
                <Radio className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                <span>GD Set: {session?.slotName || (session?.id ? `Set ${String(session.id).toUpperCase()}` : 'GD Set')}</span>
              </span>

              {/* Slot Details */}
              {session?.slotTiming && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Slot Details: {session.slotTiming}</span>
                </span>
              )}

              {/* Allotted Faculty Evaluator */}
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 shadow-2xs">
                <GraduationCap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Faculty: <strong>{session?.assignedFacultyName || 'Assigned Faculty Evaluator'}</strong></span>
              </span>

              {/* Live Video Recording Status Indicator (Recorded strictly for Faculty/Admin portal) */}
              {isFacultyOrAdmin && gdRecorder.isRecording ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 shadow-2xs animate-pulse" title="GD discussion video grid is actively being recorded and stored to ERUS server">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                  <span className="font-mono">REC {gdRecorder.formattedDuration} (Video Grid)</span>
                </span>
              ) : isFacultyOrAdmin && (gdRecorder.recordingUrl || session.recordingUrl) ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shadow-2xs">
                  <Video className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Discussion Video Saved</span>
                  <button
                    onClick={() => setShowVideoModal(true)}
                    className="underline text-[10px] ml-1 text-emerald-800 dark:text-emerald-200 hover:text-emerald-950 cursor-pointer font-bold"
                  >
                    Watch
                  </button>
                </span>
              ) : null}
            </div>
            
            {/* Topic */}
            <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">Topic:</span>
              <span>{session?.topic || 'Group Discussion'}</span>
            </h1>

            {/* Session Completed Banner OR Waiting Lobby Banner OR 20-Second Silence Watchdog */}
            {session.status === 'completed' ? (
              <div className="mt-3 p-3.5 rounded-2xl bg-purple-500/10 dark:bg-purple-950/40 border border-purple-500/30 dark:border-purple-700/40 flex items-center justify-between gap-3 flex-wrap shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                        Session Concluded & Evaluated
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                        Evaluated by AI Facilitator
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-800 dark:text-purple-300/80 mt-0.5">
                      This group discussion session is completed. All participation metrics have been recorded.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isFacultyOrAdmin && (gdRecorder.recordingUrl || session.recordingUrl) && (
                    <div className="flex items-center gap-1.5 bg-white/80 dark:bg-slate-900/80 p-1.5 rounded-xl border border-purple-200 dark:border-purple-800 shadow-2xs">
                      <button
                        onClick={() => setShowVideoModal(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        title="Watch full recorded video of this GD session"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Watch GD Video</span>
                      </button>
                      <a
                        href={gdRecorder.recordingUrl || session.recordingUrl}
                        download={`GD-Video-${session.id}.webm`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 text-purple-700 dark:text-purple-300 transition-colors"
                        title="Download GD Video (.webm)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  <button
                    onClick={() => onSelectSlot && onSelectSlot(session.id)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                  >
                    {currentUser?.role === 'student' ? (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>View My Assessment Report</span>
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>View Overall Analytics</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : isSessionActive ? (
              /* 20-Second Silence Deadlock Watchdog (PDF Page 4, Section F) */
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    rtcSilenceTimer >= 12
                      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 animate-bounce'
                      : rtcSilenceTimer >= 8
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">15s Silence Deadlock Watchdog</span>
                      <span className={`font-mono text-xs font-bold px-1.5 py-0.2 rounded ${
                        rtcSilenceTimer >= 12
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {rtcSilenceTimer > 0 ? `${rtcSilenceTimer}s / 15s` : '0s / 15s (Floor Active)'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {rtcSilenceTimer >= 12
                        ? '⚠️ Floor silent! AI Facilitator will prompt in ' + Math.max(0, 15 - rtcSilenceTimer) + 's to ask a probing question.'
                        : 'AI Facilitator autonomously prompts if no participant speaks for 15 seconds.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-[200px] sm:max-w-xs ml-auto">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        rtcSilenceTimer >= 12 
                          ? 'bg-rose-500 animate-pulse' 
                          : rtcSilenceTimer >= 8 
                          ? 'bg-amber-500' 
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (rtcSilenceTimer / 15) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 font-semibold w-8 text-right">
                    {Math.max(0, 15 - rtcSilenceTimer)}s
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Quick Facilitator Action Bar (Visible only to Faculty Evaluators & Admins) */}
          {canStartSession && (
            <div className="flex items-center gap-2 flex-wrap">
              {!isSessionActive && session.status !== 'completed' && (
                <button
                  id="start-gd-btn"
                  onClick={() => {
                    setSession((prev) => ({
                      ...prev,
                      status: 'active',
                      startedAt: prev.startedAt || Date.now(),
                    }));
                    if (onStartSession) {
                      onStartSession(session.id);
                    }
                    rtcStartSession();
                    setTimeout(() => {
                      handleInitiateOpeningSpeaker(true);
                    }, 400);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-700/30 transition-all hover:scale-105 active:scale-95 cursor-pointer animate-pulse ring-2 ring-emerald-400/50"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Group Discussion</span>
                </button>
              )}

              {isSessionActive && (
                <button
                  id="restart-gd-btn"
                  onClick={() => {
                    if (onStartSession) {
                      onStartSession(session.id);
                    }
                    rtcStartSession();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow-md transition-all active:scale-95 cursor-pointer border border-emerald-500/50"
                  title="Restart discussion from beginning and deliver opening speech"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Restart Discussion</span>
                </button>
              )}

              <button
                id="ai-probe-btn"
                onClick={() => {
                  if (rtcRequestAiIntervention) {
                    rtcRequestAiIntervention();
                  } else {
                    requestAiIntervention('probing');
                  }
                }}
                disabled={!isSessionActive || isAiProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 transition-all shadow-xs active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>AI Probing Question</span>
              </button>

              <button
                id="ai-rules-btn"
                onClick={() => {
                  const rulesText = "Discussion Rules: 1. Speak one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us maintain balanced dialogue.";
                  if (rtcBroadcastFacilitatorSpeech) {
                    rtcBroadcastFacilitatorSpeech(rulesText, 'explain_rules');
                  } else {
                    speakFacilitator(rulesText, 'explain_rules', 'rules');
                  }
                }}
                disabled={!isSessionActive || isAiProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Explain Rules</span>
              </button>

              {/* Enhancement 4: Faculty Live Observation Notes Button */}
              <button
                id="faculty-notes-btn"
                onClick={() => handleOpenNoteModal()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/70 dark:hover:bg-violet-900/70 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 transition-all shadow-xs active:scale-95 cursor-pointer"
                title={canStartSession ? "Open Live Observation Notes & Bookmarks (Faculty Evaluator)" : "Open Live Observation Notes & Bookmarks (Evaluator Log)"}
              >
                <Bookmark className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 fill-violet-600/30" />
                <span>Observation Notes</span>
                {(session.facultyLiveNotes?.length || 0) > 0 ? (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-violet-600 text-white font-mono">
                    {session.facultyLiveNotes?.length}
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-violet-200/60 dark:bg-violet-900/60 text-violet-800 dark:text-violet-200 font-semibold">
                    Faculty
                  </span>
                )}
              </button>

              {session.status === 'completed' ? (
                <button
                  id="view-completed-report-btn"
                  onClick={() => onSelectSlot && onSelectSlot(session.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-700/20 transition-all active:scale-95 cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>View Overall Analytics</span>
                </button>
              ) : (
                <button
                  id="finish-session-btn"
                  onClick={() => {
                    handleConcludeOrLeaveSession();
                  }}
                  disabled={!isSessionActive}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-700/20 dark:shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Award className="w-4 h-4" />
                  <span>Conclude & Generate Report</span>
                </button>
              )}
            </div>
          )}

          {/* Student Status Badge (Students are evaluated participants; they don't administer or evaluate the room) */}
          {isStudent && isSessionActive && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Discussion Live</span>
              </span>
            </div>
          )}
        </div>

        {/* Interruption Warning Alert banner */}
        {interruptionWarning && (
          <div className="mt-3.5 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-600/60 text-amber-800 dark:text-amber-200 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2.5 animate-bounce">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="font-medium">{interruptionWarning}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Realistic Seating Layout (Left 7-8 Cols) + Sidebar Hub (Right 4-5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* LEFT: Realistic 2.5D Virtual Conference Seating Room */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-md dark:shadow-2xl relative min-h-[580px] flex flex-col justify-between overflow-hidden transition-colors duration-200">
            
            {/* Ambient Lighting & Stage Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.05),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-indigo-100/30 dark:from-indigo-950/20 to-transparent pointer-events-none" />

            {/* Room Visibility & Layout Selector Toolbar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/80 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Room Visibility:</span>
                </div>
                {currentUser?.role === 'faculty' && (
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Faculty Control
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleLayoutChange('round_table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentLayout === 'round_table'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="1. Round Table: Circular conference table with all participants seated around"
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">1. Round Table</span>
                  <span className="sm:hidden">Round</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLayoutChange('speaker_center')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentLayout === 'speaker_center'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="2. Speaker in Middle: The person speaking is in the middle of the round table"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">2. Speaker in Middle</span>
                  <span className="sm:hidden">Speaker Center</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLayoutChange('classroom')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentLayout === 'classroom'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="3. Classroom Presentation: The person speaking is at the front like a classroom presentation"
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">3. Classroom Presentation</span>
                  <span className="sm:hidden">Classroom</span>
                </button>
              </div>
            </div>

            {/* Top Stage: AI Facilitator Station (At the head of the discussion table) */}
            <div className="relative z-10 flex flex-col items-center justify-center pt-1 mb-2">
              <div className="relative flex items-center justify-center">
                {session.isFacilitatorSpeaking && (
                  <div className="absolute w-24 h-24 rounded-full bg-indigo-500/30 animate-pulse-ring pointer-events-none" />
                )}
                <div className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center shadow-md dark:shadow-xl transition-all duration-300 ${
                  session.isFacilitatorSpeaking 
                    ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 ring-4 ring-indigo-400/50 shadow-indigo-500/40 scale-105' 
                    : 'bg-slate-100 dark:bg-slate-800 border-2 border-indigo-300 dark:border-indigo-500/40 shadow-slate-200 dark:shadow-slate-950'
                }`}>
                  <Sparkles className={`w-8 h-8 ${session.isFacilitatorSpeaking ? 'text-white animate-spin' : 'text-indigo-600 dark:text-indigo-400'}`} />
                </div>
              </div>

              {/* AI Facilitator Speech Bubble */}
              <div className="mt-3.5 max-w-xl text-center bg-indigo-50/90 dark:bg-slate-950/80 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl px-4 py-2.5 shadow-sm dark:shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-semibold mb-1">
                  {session.isFacilitatorSpeaking ? (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Speaking Live</span>
                    </div>
                  ) : (
                    <span>Facilitator Status: Observing & Managing Turns</span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed italic">
                  "{session.facilitatorSpeech}"
                </p>
              </div>
            </div>

            {/* Autonomous Turn Invitation / Targeted Question Callout Banner */}
            {invitedStudentPrompt && (
              <div className="my-3 max-w-2xl w-full mx-auto p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-purple-500/15 border-2 border-indigo-400 dark:border-indigo-500/80 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in relative z-20 backdrop-blur-md">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md shrink-0 ring-2 ring-indigo-300">
                    Seat {invitedStudentPrompt.student.seatNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                        <Radio className="w-3 h-3 text-amber-500 animate-pulse" />
                        {invitedStudentPrompt.student.isUser ? "🌟 Floor Shifted to You!" : `🎙️ Floor Shifted to: ${invitedStudentPrompt.student.name}`}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                        {invitedStudentPrompt.student.speakingTurns === 0 ? 'First Speaker Turn' : 'Active Discussion Turn'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                      {invitedStudentPrompt.reason}
                    </p>
                    {invitedStudentPrompt.promptText && (
                      <p className="text-xs italic text-indigo-800 dark:text-indigo-200/90 mt-1 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-indigo-200/50 dark:border-indigo-800/40">
                        "{invitedStudentPrompt.promptText}"
                      </p>
                    )}
                  </div>
                </div>
                {invitedStudentPrompt.student.isUser && (
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => {
                        if (!isListeningMic) {
                          toggleMicRecognition();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{isListeningMic ? 'Mic Active (Speaking...)' : 'Unmute & Speak'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setInvitedStudentPrompt(null);
                        executeNextTurn(invitedStudentPrompt.student.id);
                      }}
                      className="px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 cursor-pointer transition-all"
                      title="Yield your turn to the next participant who hasn't spoken yet"
                    >
                      Pass Turn
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Middle Stage: The 3 Layout Visibility Types */}

            {/* 1. ROUND TABLE LAYOUT */}
            {currentLayout === 'round_table' && (
              <div className="relative z-10 my-4 flex-1 flex items-center justify-start lg:justify-center overflow-x-auto py-16 sm:py-20 px-4 sm:px-8 scrollbar-thin scroll-smooth">
                <div className={`h-64 sm:h-72 rounded-[48px] sm:rounded-[64px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800/90 dark:via-slate-850 dark:to-slate-900 border-4 border-slate-300 dark:border-slate-700/80 shadow-lg dark:shadow-2xl relative flex items-center justify-center p-4 transition-all duration-300 mx-auto ${
                  session.students.length > 8
                    ? 'w-full min-w-[700px] max-w-5xl'
                    : 'w-full max-w-2xl'
                }`}>
                  
                  {/* Table Surface Inset */}
                  <div className="w-full h-full rounded-[36px] sm:rounded-[52px] bg-white/80 dark:bg-slate-950/60 border border-slate-300/80 dark:border-slate-700/50 flex flex-col items-center justify-center p-3 relative overflow-hidden shadow-inner">
                    
                    {/* Center Topic on Table */}
                    <div className="text-center p-2 z-10">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
                        Round Table Conference ({activeDisplayStudents.filter(s => !s.isEmptySeat).length} Participants)
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-2 max-w-md">
                        {session.topic}
                      </p>
                      
                      {/* Live Turn & Flow indicator */}
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
                        <Radio className="w-3 h-3 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                        <span>
                          {session.currentSpeakerId 
                            ? `Floor: ${activeDisplayStudents.find(s => s.id === session.currentSpeakerId)?.name || session.students.find(s => s.id === session.currentSpeakerId)?.name || 'Participant'}` 
                            : 'Floor: Open Discussion'}
                        </span>
                      </div>
                    </div>

                    {/* Clean decorative table ring without overlapping text collisions */}
                    <div className="absolute inset-8 rounded-full border border-indigo-200/50 dark:border-indigo-900/40 pointer-events-none" />
                  </div>

                  {/* Seating Pods: TOP ROW (Seats 1 to 8) */}
                  <div className="absolute -top-12 sm:-top-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {activeDisplayStudents.slice(0, Math.ceil(activeDisplayStudents.length / 2)).map((student) => (
                      <StudentPodCard 
                        key={student.id} 
                        student={student} 
                        isCurrentSpeaker={session.currentSpeakerId === student.id}
                        position="top"
                        isUserCameraOn={isCameraOn}
                        videoStream={videoStream}
                        audioLevel={audioLevel}
                        isListeningMic={isListeningMic}
                        isFaculty={isFaculty}
                        onAddNote={handleOpenNoteModal}
                        onEnlarge={handleToggleEnlargeStudent}
                      />
                    ))}
                  </div>

                  {/* Seating Pods: BOTTOM ROW (Seats 9 to 15) */}
                  <div className="absolute -bottom-12 sm:-bottom-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {activeDisplayStudents.slice(Math.ceil(activeDisplayStudents.length / 2)).map((student) => (
                      <StudentPodCard 
                        key={student.id} 
                        student={student} 
                        isCurrentSpeaker={session.currentSpeakerId === student.id}
                        position="bottom"
                        isUserCameraOn={isCameraOn}
                        videoStream={videoStream}
                        audioLevel={audioLevel}
                        isListeningMic={isListeningMic}
                        isFaculty={isFaculty}
                        onAddNote={handleOpenNoteModal}
                        onEnlarge={handleToggleEnlargeStudent}
                      />
                    ))}
                  </div>

                </div>
              </div>
            )}

            {/* 2. SPEAKER IN MIDDLE OF ROUND TABLE LAYOUT */}
            {currentLayout === 'speaker_center' && (
              <div className="relative z-10 my-4 flex-1 flex items-center justify-start lg:justify-center overflow-x-auto py-16 sm:py-20 px-4 sm:px-8 scrollbar-thin scroll-smooth">
                <div className={`min-h-[320px] sm:min-h-[360px] rounded-[56px] sm:rounded-[72px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800/90 dark:via-slate-850 dark:to-slate-900 border-4 border-slate-300 dark:border-slate-700/80 shadow-xl dark:shadow-2xl relative flex items-center justify-center p-4 transition-all duration-300 mx-auto ${
                  session.students.length > 8 ? 'w-full min-w-[720px] max-w-5xl' : 'w-full max-w-2xl'
                }`}>
                  
                  {/* Table Surface with Inset Ambient Ring */}
                  <div className="w-full h-full rounded-[44px] sm:rounded-[60px] bg-white/85 dark:bg-slate-950/70 border border-slate-300/80 dark:border-slate-700/50 flex flex-col items-center justify-center p-4 relative overflow-hidden shadow-inner py-8">
                    
                    {/* Concentric round table perimeter accent */}
                    <div className="absolute inset-4 rounded-full border border-dashed border-indigo-300/40 dark:border-indigo-600/30 pointer-events-none" />

                    {/* CENTER STAGE: The Person Speaking in Middle of Round Table */}
                    <div 
                      onDoubleClick={() => currentSpeakerStudent && handleToggleEnlargeStudent(currentSpeakerStudent)}
                      title={currentSpeakerStudent ? `${currentSpeakerStudent.name} • Double-click to enlarge spotlight` : undefined}
                      className="relative z-20 flex flex-col items-center max-w-md text-center p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 border-2 border-indigo-500/60 dark:border-indigo-400/60 shadow-2xl backdrop-blur-md transition-all duration-300 cursor-pointer"
                    >
                      
                      {/* Animated Soundwave Aura for Active Speaker */}
                      <div className="relative">
                        {isSpeakingLive && (
                          <div className="absolute -inset-3 rounded-full bg-indigo-500/25 animate-ping pointer-events-none" />
                        )}
                        <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl overflow-hidden border-3 border-indigo-500 dark:border-indigo-400 ring-4 ring-indigo-500/30 shadow-xl relative bg-slate-900">
                          <StudentVideoFrame
                            student={currentSpeakerStudent || session.students[0]}
                            isCurrentSpeaker={isSpeakingLive}
                            isUserCameraOn={isCameraOn}
                            videoStream={videoStream}
                            audioLevel={audioLevel}
                            isListeningMic={isListeningMic}
                            size="large"
                            isFaculty={isFaculty}
                          />
                        </div>

                        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md border border-indigo-300/40 z-20">
                          🎙️ IN CENTER • SPEAKING
                        </span>
                      </div>

                      {/* Speaker Details */}
                      <div className="mt-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                            {currentSpeakerStudent?.name}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold">
                            Seat {currentSpeakerStudent?.seatNumber}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <Radio className="w-3 h-3 animate-pulse" />
                            {isSpeakingLive ? 'Actively Addressing Group' : 'Floor Spotlight'}
                          </span>
                          <span>•</span>
                          <span>{currentSpeakerStudent?.speakingTurns || 0} turns</span>
                        </div>

                        {/* Speech Quote from the center */}
                        <div className="mt-2 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 max-w-sm">
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium italic line-clamp-2">
                            "{latestSpeakerTranscript?.text || (currentSpeakerStudent?.isSpeaking ? 'Addressing all peers around the round table...' : 'Leading this turn in the center of the discussion.')}"
                          </p>
                        </div>
                      </div>

                    </div>

                  </div>

                  {/* Outer Ring Seating: TOP ROW (Seats 1 to 8) */}
                  <div className="absolute -top-12 sm:-top-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {activeDisplayStudents.slice(0, Math.ceil(activeDisplayStudents.length / 2)).map((student) => (
                      <StudentPodCard 
                        key={student.id} 
                        student={student} 
                        isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                        position="top"
                        isUserCameraOn={isCameraOn}
                        videoStream={videoStream}
                        audioLevel={audioLevel}
                        isListeningMic={isListeningMic}
                        isFaculty={isFaculty}
                        onAddNote={handleOpenNoteModal}
                        onEnlarge={handleToggleEnlargeStudent}
                      />
                    ))}
                  </div>

                  {/* Outer Ring Seating: BOTTOM ROW (Seats 9 to 15) */}
                  <div className="absolute -bottom-12 sm:-bottom-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {activeDisplayStudents.slice(Math.ceil(activeDisplayStudents.length / 2)).map((student) => (
                      <StudentPodCard 
                        key={student.id} 
                        student={student} 
                        isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                        position="bottom"
                        isUserCameraOn={isCameraOn}
                        videoStream={videoStream}
                        audioLevel={audioLevel}
                        isListeningMic={isListeningMic}
                        isFaculty={isFaculty}
                        onAddNote={handleOpenNoteModal}
                        onEnlarge={handleToggleEnlargeStudent}
                      />
                    ))}
                  </div>

                </div>
              </div>
            )}

            {/* 3. CLASSROOM PRESENTATION LAYOUT */}
            {currentLayout === 'classroom' && (
              <div className="relative z-10 my-3 flex-1 flex flex-col items-center justify-center w-full space-y-4">
                
                {/* Stage Activity Control Bar */}
                <div className="w-full max-w-4xl bg-slate-900/95 border-2 border-indigo-500/50 rounded-2xl p-3 sm:p-4 shadow-2xl text-white">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md">
                        <Presentation className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-mono tracking-widest text-indigo-400 font-bold">
                            ERUS AI INSTRUCTOR • Student Presentation Activity
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                            60–75 Mins Total
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-md sm:max-w-xl">
                          {session.topic}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Live Presentation Stopwatch */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {Math.floor(presentationSeconds / 60).toString().padStart(2, '0')}:{(presentationSeconds % 60).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-slate-400">(6-8m target)</span>
                      </div>

                      {/* Auto-Progress Toggle */}
                      <button
                        type="button"
                        onClick={() => setIsClassroomAutoRunning((prev) => !prev)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isClassroomAutoRunning
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        }`}
                        title="Toggle automated speech and progression"
                      >
                        <FastForward className="w-3.5 h-3.5" />
                        <span>{isClassroomAutoRunning ? 'Auto: ON' : 'Auto: OFF'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Stage Status & Quick Actions Bar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 font-medium">Activity Stage:</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        classroomPhase === 'not_started'
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : classroomPhase === 'opening'
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse'
                          : classroomPhase === 'calling_presenter'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : classroomPhase === 'presenting'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : classroomPhase === 'peer_qa_invite' || classroomPhase === 'peer_qa_active'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : classroomPhase === 'silence_watchdog' || classroomPhase === 'ai_answering'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : classroomPhase === 'takeaway_feedback'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-indigo-600 text-white border-indigo-400'
                      }`}>
                        <CircleDot className="w-3 h-3" />
                        {classroomPhase === 'not_started' && '1. Waiting to Start'}
                        {classroomPhase === 'opening' && '1. Seminar Opening Script'}
                        {classroomPhase === 'calling_presenter' && `2. Calling Student #${currentPresenterIndex + 1}`}
                        {classroomPhase === 'presenting' && `3. Presenting: Student #${currentPresenterIndex + 1} (${currentPresenterStudent.name.split(' ')[0]})`}
                        {classroomPhase === 'peer_qa_invite' && '4. Inviting Peer Questions'}
                        {classroomPhase === 'peer_qa_active' && `4. Peer Q&A (${classroomWatchdogCountdown}s Watchdog)`}
                        {classroomPhase === 'silence_watchdog' && '4. Watchdog: AI Instructor Question'}
                        {classroomPhase === 'ai_answering' && '4. Presenter Answering Question'}
                        {classroomPhase === 'takeaway_feedback' && '5. Key Takeaway & Transition'}
                        {classroomPhase === 'closing' && '6. Seminar Closing Remarks'}
                        {classroomPhase === 'completed' && 'Completed!'}
                      </span>
                    </div>

                    {/* Stage Interactive Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {classroomPhase === 'not_started' && (
                        <button
                          type="button"
                          onClick={handleStartClassroomOpening}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Start Seminar Opening
                        </button>
                      )}

                      {classroomPhase === 'opening' && (
                        <button
                          type="button"
                          onClick={() => handleClassroomCallPresenter(0)}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Call Student 1
                        </button>
                      )}

                      {classroomPhase === 'calling_presenter' && (
                        <button
                          type="button"
                          onClick={() => handleClassroomStartPresenting(currentPresenterIndex)}
                          className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Begin Presentation
                        </button>
                      )}

                      {classroomPhase === 'presenting' && (
                        <button
                          type="button"
                          onClick={() => handleClassroomInitiatePeerQA(currentPresenterIndex)}
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Conclude Speech & Open Q&A
                        </button>
                      )}

                      {(classroomPhase === 'peer_qa_invite' || classroomPhase === 'peer_qa_active') && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleClassroomPeerAsksQuestion(currentPresenterIndex)}
                            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                          >
                            <Users className="w-3.5 h-3.5" />
                            Peer Asks Question
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClassroomTriggerSilenceWatchdog(currentPresenterIndex)}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Silence Watchdog (AI Question)
                          </button>
                        </>
                      )}

                      {classroomPhase === 'ai_answering' && (
                        <button
                          type="button"
                          onClick={() => handleClassroomTakeawayAndTransition(currentPresenterIndex)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Deliver Takeaway & Transition
                        </button>
                      )}

                      {classroomPhase === 'takeaway_feedback' && (
                        <button
                          type="button"
                          onClick={() => currentPresenterIndex < 5 ? handleClassroomCallPresenter(currentPresenterIndex + 1) : handleClassroomDeliverClosing()}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          {currentPresenterIndex < 5 ? `Call Next Student (#${currentPresenterIndex + 2})` : 'Deliver Closing Remarks'}
                        </button>
                      )}

                      {(classroomPhase === 'closing' || classroomPhase === 'completed') && (
                        <button
                          type="button"
                          onClick={handleResetClassroomActivity}
                          className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Restart Activity
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Closing Remarks Card (Page 5: 5 Lessons & 3 Reflections) */}
                {(classroomPhase === 'closing' || classroomPhase === 'completed') && (
                  <div className="w-full max-w-4xl bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 border-2 border-indigo-400 rounded-2xl p-5 shadow-2xl text-white space-y-4">
                    <div className="flex items-center justify-between border-b border-indigo-800/60 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-lg">
                          <Award className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                            ERUS AI INSTRUCTOR • CLOSING REMARKS & LEARNING OUTCOMES
                          </span>
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            Congratulations to all Six Students!
                          </h3>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                        Activity Complete
                      </span>
                    </div>

                    {/* 5 Important Lessons */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Five Important Lessons from Today's Activity:
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-0.5">1. TECHNICAL KNOWLEDGE</span>
                          <p className="text-xs text-slate-200">Understand the topic beyond memorizing facts. Explain the concepts in your own words.</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-0.5">2. COMMUNICATION SKILLS</span>
                          <p className="text-xs text-slate-200">Speak clearly, organize your ideas, and use simple, professional language.</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-0.5">3. PRESENTATION SKILLS</span>
                          <p className="text-xs text-slate-200">Introduce your topic, explain points logically, provide examples, conclude effectively.</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-0.5">4. CRITICAL THINKING</span>
                          <p className="text-xs text-slate-200">Listen carefully, ask meaningful questions, and evaluate different perspectives.</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 sm:col-span-2 lg:col-span-1">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-0.5">5. CONFIDENCE</span>
                          <p className="text-xs text-slate-200">Do not be afraid of making mistakes. Every presentation and question helps you improve.</p>
                        </div>
                      </div>
                    </div>

                    {/* 3 Reflection Questions */}
                    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3">
                      <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-amber-400" />
                        Three Student Reflection Questions:
                      </h4>
                      <ol className="text-xs text-slate-200 space-y-1 list-decimal list-inside font-medium">
                        <li>What did I learn from today's presentations?</li>
                        <li>What is one skill I need to improve?</li>
                        <li>What will I do differently in my next presentation?</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Front of Classroom: Presentation Board & Podium */}
                {classroomPhase !== 'closing' && classroomPhase !== 'completed' && (
                  <div className="w-full max-w-4xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-2xl p-3 sm:p-4 shadow-xl text-white relative overflow-hidden">
                    
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                    {/* Presentation Sub-Topic Banner */}
                    <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border border-indigo-500/30 rounded-xl p-3 mb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600/40 text-indigo-300 font-bold border border-indigo-500/40">
                              Presenter {currentPresenterIndex + 1} of 6 • Seat #{currentPresenterStudent.seatNumber}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                              Focus: {currentPresenterAssignedTopic.focusArea}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                              Rubric: {currentPresenterAssignedTopic.questionType}
                            </span>
                          </div>
                          <h4 className="text-sm sm:text-base font-bold text-white">
                            📌 Assigned Sub-Topic: "{currentPresenterAssignedTopic.subTopicTitle}"
                          </h4>
                        </div>

                        {currentPresenterStudent.isUser && classroomPhase === 'presenting' && (
                          <button
                            type="button"
                            onClick={handleClassroomConcludeUserSpeech}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Finish Presentation
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Presenter at the Podium Spotlight */}
                    <div 
                      onDoubleClick={() => handleToggleEnlargeStudent(currentPresenterStudent)}
                      title={`${currentPresenterStudent.name} • Double-click to enlarge spotlight`}
                      className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-slate-800/70 border border-slate-700/70 rounded-xl p-3 backdrop-blur-sm cursor-pointer"
                    >
                      {/* Presenter Avatar & Badge */}
                      <div className="relative flex flex-col items-center flex-shrink-0">
                        {isSpeakingLive && (
                          <div className="absolute -inset-2 rounded-2xl bg-indigo-500/30 animate-pulse pointer-events-none" />
                        )}
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-indigo-400 ring-4 ring-indigo-500/20 shadow-lg relative bg-slate-900">
                          <StudentVideoFrame
                            student={currentPresenterStudent}
                            isCurrentSpeaker={isSpeakingLive || currentPresenterStudent.isSpeaking}
                            isUserCameraOn={isCameraOn}
                            videoStream={videoStream}
                            audioLevel={audioLevel}
                            isListeningMic={isListeningMic}
                            size="large"
                            isFaculty={isFaculty}
                          />
                        </div>
                        <span className="absolute -bottom-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow border border-indigo-300/40 whitespace-nowrap z-20">
                          🎙️ PRESENTER AT PODIUM
                        </span>
                      </div>

                      {/* Presenter Info & Live Q&A Stream */}
                      <div className="flex-1 text-center sm:text-left min-w-0">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white truncate">
                            {currentPresenterStudent.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30 font-semibold">
                            Seat {currentPresenterStudent.seatNumber} • {currentPresenterStudent.isUser && !isFaculty ? 'You (Speaking)' : 'Presenter'}
                          </span>
                          <span className="text-xs text-slate-400">
                            ({currentPresenterStudent.speakingTurns || 0} speaking turns)
                          </span>
                        </div>

                        {/* Interactive Speech & Q&A Box */}
                        <div className="mt-2 bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 max-w-2xl space-y-2">
                          {classroomPhase === 'presenting' && (
                            <div>
                              <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-mono font-semibold mb-1">
                                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                                <span>PRESENTER ADDRESSING CLASSROOM:</span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-200 font-medium italic">
                                "{latestSpeakerTranscript?.text || (currentPresenterStudent.isSpeaking ? 'Delivering presentation points on assigned topic...' : 'Presenting to the audience and taking questions.')}"
                              </p>
                            </div>
                          )}

                          {(classroomPhase === 'peer_qa_invite' || classroomPhase === 'peer_qa_active') && (
                            <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2">
                              <div className="flex items-center justify-between text-[10px] text-amber-300 font-mono font-semibold mb-1">
                                <span>❓ PEER QUESTIONING SESSION:</span>
                                <span>Watchdog: {classroomWatchdogCountdown}s</span>
                              </div>
                              <p className="text-xs text-slate-200 font-medium">
                                {classroomCurrentQuestion || 'AI Instructor invited Student Number ' + (session.students.find((s) => s.id === invitedPeerStudentId)?.seatNumber || 2) + ' to ask a question. Waiting for peer question...'}
                              </p>
                            </div>
                          )}

                          {(classroomPhase === 'silence_watchdog' || classroomPhase === 'ai_answering') && (
                            <div className="space-y-1.5">
                              <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-2">
                                <div className="text-[10px] text-rose-300 font-mono font-semibold mb-0.5">
                                  🤖 AI INSTRUCTOR QUESTION ({currentPresenterAssignedTopic.questionType}):
                                </div>
                                <p className="text-xs text-slate-200 font-medium italic">
                                  "{classroomCurrentQuestion || currentPresenterAssignedTopic.suggestedQuestion}"
                                </p>
                              </div>
                              {classroomCurrentAnswer && (
                                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
                                  <div className="text-[10px] text-emerald-300 font-mono font-semibold mb-0.5">
                                    💬 PRESENTER'S ANSWER:
                                  </div>
                                  <p className="text-xs text-slate-200 font-medium italic">
                                    "{classroomCurrentAnswer}"
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {classroomPhase === 'takeaway_feedback' && (
                            <div className="bg-indigo-950/50 border border-indigo-400/40 rounded-lg p-2">
                              <div className="text-[10px] text-indigo-300 font-mono font-semibold mb-0.5">
                                💡 KEY POINT TO REMEMBER:
                              </div>
                              <p className="text-xs text-slate-100 font-medium">
                                "{classroomCurrentTakeaway || currentPresenterAssignedTopic.keyTakeaway}"
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {/* Audience Tiered Desk Rows */}
                <div className="w-full max-w-4xl space-y-3">
                  
                  <div className="flex items-center justify-between px-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="uppercase tracking-wider font-bold text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Classroom Audience (Facing Presenter)
                    </span>
                    <span className="text-[11px] font-mono">
                      Tiered Seating • 6 Participating Students
                    </span>
                  </div>

                  {/* Row 1 (Front Row): Seats 1 to 5 */}
                  <div className="bg-slate-100/90 dark:bg-slate-850/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span>Row 1 • Front Row Desks</span>
                      <span>Seats 1 – 5</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {activeDisplayStudents.slice(0, 5).map((student, idx) => (
                        <ClassroomDeskCard
                          key={student.id}
                          student={student}
                          isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
                          assignedTopic={classroomAssignedTopics[idx]}
                          isPresenterAtPodium={student.id === currentPresenterStudent.id}
                          isInvitedPeer={student.id === invitedPeerStudentId}
                          onInvitePeer={(s) => handleClassroomPeerAsksQuestion(currentPresenterIndex, s.id)}
                          onAddNote={handleOpenNoteModal}
                          onEnlarge={handleToggleEnlargeStudent}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Row 2 (Middle Row): Seats 6 to 10 */}
                  <div className="bg-slate-100/90 dark:bg-slate-850/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span>Row 2 • Middle Row Desks</span>
                      <span>Seats 6 – 10</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {activeDisplayStudents.slice(5, 10).map((student, idx) => (
                        <ClassroomDeskCard
                          key={student.id}
                          student={student}
                          isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
                          assignedTopic={classroomAssignedTopics[5 + idx]}
                          isPresenterAtPodium={student.id === currentPresenterStudent.id}
                          isInvitedPeer={student.id === invitedPeerStudentId}
                          onInvitePeer={(s) => handleClassroomPeerAsksQuestion(currentPresenterIndex, s.id)}
                          onAddNote={handleOpenNoteModal}
                          onEnlarge={handleToggleEnlargeStudent}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Row 3 (Back Row): Seats 11 to 15+ */}
                  {activeDisplayStudents.length > 10 && (
                    <div className="bg-slate-100/90 dark:bg-slate-850/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span>Row 3 • Back Row Desks</span>
                        <span>Seats 11 – {activeDisplayStudents.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {activeDisplayStudents.slice(10).map((student) => (
                          <ClassroomDeskCard
                            key={student.id}
                            student={student}
                            isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                            isUserCameraOn={isCameraOn}
                            videoStream={videoStream}
                            audioLevel={audioLevel}
                            isListeningMic={isListeningMic}
                            isFaculty={isFaculty}
                            onAddNote={handleOpenNoteModal}
                            onEnlarge={handleToggleEnlargeStudent}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* Google Meet Bottom Floating Dock & Speech Controls */}
            <div className="relative z-10 pt-4 mt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              
              {/* Identity & Role Status Banner */}
              {isFaculty ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 shadow-xs">
                      <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Faculty: {currentUser?.name || 'Evaluator'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      • {activeDisplayStudents.filter(s => !s.isEmptySeat).length} Enrolled Candidates
                    </span>
                  </div>
                </div>
              ) : (
                (() => {
                  const activeStudent = session.students.find((s) => s.isUser) || session.students[0];
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          You: {activeStudent?.name || 'Student Participant'} (Seat {activeStudent?.seatNumber || 1})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] border border-indigo-200 dark:border-indigo-800">
                          {formatSecs(activeStudent?.speakingDurationSeconds || 0)} spoken
                        </span>
                        {isCameraOn && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] border border-emerald-500/20 flex items-center gap-1">
                            <Video className="w-3 h-3" /> Camera Streaming
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Camera Error Alert if student denied webcam */}
              {!isFaculty && cameraError && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Google Meet Floating Control Dock */}
              <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-white">
                
                {/* Center Control Action Buttons */}
                <div className="flex items-center gap-2 sm:gap-3 mx-auto sm:mx-0">
                  
                  {/* 1. Microphone Toggle (Student participants only - faculty is strictly a listener) */}
                  {!isFaculty && (
                    <button
                      id="mic-speak-btn"
                      onClick={toggleMicRecognition}
                      className={`relative p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                        isListeningMic
                          ? 'bg-red-600 hover:bg-red-700 text-white ring-4 ring-red-500/40 animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                      title={
                        isListeningMic 
                          ? 'Mute Microphone (Speaking Active)' 
                          : 'Unmute Microphone (Push to Speak)'
                      }
                    >
                      {isListeningMic ? (
                        <Mic className="w-5 h-5 text-white animate-bounce" />
                      ) : (
                        <MicOff className="w-5 h-5 text-rose-400" />
                      )}
                      {isListeningMic && audioLevel > 0 && (
                        <span 
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-ping"
                        />
                      )}
                    </button>
                  )}

                  {/* 2. Camera Toggle (Student only) */}
                  {!isFaculty && (
                    <button
                      id="camera-toggle-btn"
                      onClick={toggleCamera}
                      className={`p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                        isCameraOn
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-4 ring-emerald-500/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                      title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera (Live Webcam)'}
                    >
                      {isCameraOn ? (
                        <Video className="w-5 h-5 text-white" />
                      ) : (
                        <VideoOff className="w-5 h-5 text-rose-400" />
                      )}
                    </button>
                  )}

                  {/* 3. Raise Hand Button (Student only) */}
                  {!isFaculty && (
                    <button
                      id="raise-hand-btn"
                      onClick={handleRaiseHandToggle}
                      className={`p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                        session.students.find((s) => s.isUser)?.hasRaisedHand
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 ring-4 ring-amber-400/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                      title={session.students.find((s) => s.isUser)?.hasRaisedHand ? 'Lower Hand' : 'Raise Hand to Speak'}
                    >
                      <Hand className="w-5 h-5" />
                    </button>
                  )}

                  {/* 4. Room Audio Volume Toggle (Mute/Unmute Audible Peers / Students) */}
                  <button
                    id="room-audio-btn"
                    onClick={toggleRoomAudio}
                    className={`p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                      isRoomAudioMuted
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80 hover:bg-rose-900/80'
                        : 'bg-indigo-600/80 hover:bg-indigo-600 text-indigo-100 border border-indigo-500/40'
                    }`}
                    title={isRoomAudioMuted ? 'Unmute Room Audio (Students Muted)' : 'Mute Room Audio (Students Audible)'}
                  >
                    {isRoomAudioMuted ? (
                      <VolumeX className="w-5 h-5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-indigo-200" />
                    )}
                  </button>

                  {/* 5. Trigger Next Student / Peer Turn */}
                  <button
                    id="next-peer-turn-btn"
                    onClick={() => executeNextTurn()}
                    className="p-3 rounded-full font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-lg flex items-center justify-center cursor-pointer"
                    title={isFaculty ? 'Advance Discussion to Next Student Turn' : 'Advance to Next Peer Turn'}
                  >
                    <FastForward className="w-5 h-5 text-indigo-300" />
                  </button>

                  {/* Faculty Action: Prompt Facilitator Question */}
                  {isFaculty && (
                    <button
                      id="faculty-probe-btn"
                      onClick={() => requestAiIntervention('probing')}
                      className="px-3.5 py-2.5 rounded-full font-semibold text-xs bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-lg flex items-center gap-1.5 cursor-pointer transition-all border border-indigo-400/40"
                      title="Direct AI Facilitator to Ask Probing Question to Room"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                      <span className="hidden sm:inline">Prompt Question</span>
                    </button>
                  )}

                  {/* Faculty Start / Restart Action in Dock */}
                  {canStartSession && (
                    !isSessionActive ? (
                      <button
                        id="dock-start-gd-btn"
                        onClick={() => {
                          setSession((prev) => ({
                            ...prev,
                            status: 'active',
                            startedAt: prev.startedAt || Date.now(),
                          }));
                          if (onStartSession) {
                            onStartSession(session.id);
                          }
                          rtcStartSession();
                          setTimeout(() => {
                            handleInitiateOpeningSpeaker(true);
                          }, 400);
                        }}
                        className="px-4 py-2.5 rounded-full font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 flex items-center gap-1.5 cursor-pointer transition-all animate-pulse"
                        title="Start Group Discussion round"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Start Session</span>
                      </button>
                    ) : (
                      <button
                        id="dock-restart-gd-btn"
                        onClick={() => {
                          if (onStartSession) {
                            onStartSession(session.id);
                          }
                          rtcStartSession();
                        }}
                        className="px-3.5 py-2.5 rounded-full font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-600/50 shadow-lg flex items-center gap-1.5 cursor-pointer transition-all"
                        title="Restart Group Discussion"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Restart</span>
                      </button>
                    )
                  )}

                  {/* 6. Leave / Finish GD Call (Red Pill Button) */}
                  <button
                    id="leave-call-btn"
                    onClick={() => {
                      handleConcludeOrLeaveSession();
                    }}
                    className="px-4 py-2.5 rounded-full font-bold text-xs bg-red-600 hover:bg-red-700 text-white shadow-lg flex items-center gap-2 cursor-pointer transition-all ml-1 sm:ml-2"
                    title={isFaculty ? 'Finish Observation & Review Reports' : 'Leave Group Discussion & View Assessment Report'}
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span className="hidden sm:inline">{isFaculty ? 'Finish & Grade' : 'Finish GD'}</span>
                  </button>

                </div>

                {/* Status indicator on right */}
                <div className="hidden md:flex items-center gap-3 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Radio className={`w-3.5 h-3.5 ${isSpeakingLive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                    <span className="text-[11px] font-mono">
                      {isSpeakingLive ? 'Floor Audio Live' : 'Waiting for Speaker'}
                    </span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {isRoomAudioMuted ? '🔇 Audio Muted' : '🔊 Indian English Voice (en-IN)'}
                  </span>
                </div>

              </div>

              {/* Live Voice Broadcast Console for Student OR Evaluator Audio Listening Console for Faculty */}
              <div className="w-full">
                {isFaculty ? (
                  <div className="w-full rounded-2xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-2.5 sm:p-3 flex items-center justify-between transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <Volume2 className="w-4 h-4 animate-pulse" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>Faculty Listening & Observation Mode</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-mono font-medium">
                            Live Stream Audible
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Listening to live student and AI participant speeches. You can record timestamped observation notes and prompt facilitator questions.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAudioTestModal(true)}
                        className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        title="Test speaker output and sound chime"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Test Audio Output</span>
                      </button>
                    </div>
                  </div>
                ) : isListeningMic ? (
                  <div className="w-full rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-2 border-emerald-500/80 p-3 sm:p-3.5 shadow-lg shadow-emerald-950/40 transition-all animate-fadeIn">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                          Live Floor Mic • Audible to Everyone
                        </span>
                        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-[10px] text-emerald-300 font-mono">
                          <span>Broadcasting Live</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Audio visualizer wave bars */}
                        <div className="flex items-center gap-0.5 h-4">
                          <span className="w-1 bg-emerald-400 rounded-full animate-[bounce_0.8s_infinite_100ms] h-2"></span>
                          <span className="w-1 bg-emerald-400 rounded-full animate-[bounce_0.8s_infinite_300ms] h-4"></span>
                          <span className="w-1 bg-emerald-400 rounded-full animate-[bounce_0.8s_infinite_200ms] h-3"></span>
                          <span className="w-1 bg-emerald-400 rounded-full animate-[bounce_0.8s_infinite_400ms] h-2"></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAudioTestModal(true)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow"
                          title="Open Audio & Microphone Test"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>Test Audio</span>
                        </button>
                        <button
                          onClick={toggleMicRecognition}
                          className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow"
                          title="Mute microphone and finish speaking"
                        >
                          <MicOff className="w-3 h-3" />
                          <span>Mute / Finish</span>
                        </button>
                      </div>
                    </div>

                    {/* Real-time Streaming Caption Preview */}
                    <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl px-3.5 py-2 min-h-[40px] flex items-center justify-between gap-2">
                      {liveSpeechTranscript ? (
                        <div className="w-full flex items-center justify-between gap-3">
                          <p className="text-xs sm:text-sm text-emerald-100 font-medium leading-relaxed flex-1">
                            <span className="text-emerald-400 font-semibold mr-1.5">Speaking:</span>
                            "{liveSpeechTranscript}"
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-emerald-400/80 font-mono hidden md:inline whitespace-nowrap">
                              (Auto-posts on pause)
                            </span>
                            <button
                              type="button"
                              onClick={() => commitLiveSpeechToRoom()}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow transition-all cursor-pointer flex items-center gap-1"
                              title="Post this point and keep floor to speak more"
                            >
                              <Send className="w-3 h-3" />
                              <span>Post Point</span>
                            </button>
                            <button
                              type="button"
                              onClick={handlePassFloor}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shadow transition-all cursor-pointer flex items-center gap-1"
                              title="Finish speaking and pass the floor to other participants"
                            >
                              <ArrowRight className="w-3 h-3" />
                              <span>Done / Pass Floor</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-300 italic flex items-center gap-2">
                            <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            <span>Floor is yours — speak continuously. Points auto-post as you pause. Click "Done / Pass Floor" when finished.</span>
                          </p>
                          <button
                            type="button"
                            onClick={handlePassFloor}
                            className="px-2.5 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                            title="Finish speaking and pass the floor to other participants"
                          >
                            <ArrowRight className="w-3 h-3" />
                            <span>Done Speaking</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-full rounded-2xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-2.5 sm:p-3 flex items-center justify-between transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                        <MicOff className="w-4 h-4 text-rose-500" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>Microphone is Muted</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-normal">
                            Direct Voice Broadcast
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Click Unmute to speak live to the room — your voice is broadcast live to all participants.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAudioTestModal(true)}
                        className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        title="Test your microphone VU meter and speaker chime"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Test Audio & Mic</span>
                      </button>

                      <button
                        onClick={toggleMicRecognition}
                        className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Unmute & Speak Live</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Directives for Faculty OR Speech Presets for Student */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold whitespace-nowrap">
                  {isFaculty ? 'Faculty Directives:' : '💡 Quick Points (Click to speak instantly):'}
                </span>
                {isFaculty ? (
                  <>
                    <button
                      onClick={() => requestAiIntervention('probing')}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap transition-all cursor-pointer font-medium"
                    >
                      💡 Trigger Probing Question
                    </button>
                    <button
                      onClick={() => speakFacilitator('Let us ensure all participants contribute. I would like to invite our peers who have not yet spoken to share their perspectives.')}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap transition-all cursor-pointer font-medium"
                    >
                      👥 Prompt Silent Students
                    </button>
                    <button
                      onClick={() => speakFacilitator('Could the group provide specific quantitative data or concrete industry examples to support this argument?')}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap transition-all cursor-pointer font-medium"
                    >
                      📊 Request Real-World Data
                    </button>
                    <button
                      onClick={() => speakFacilitator('We have limited time remaining. Let us begin synthesizing our main arguments into a concrete group conclusion.', 'moderation', 'conclusion')}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap transition-all cursor-pointer font-medium"
                    >
                      🎯 Direct Group to Conclude
                    </button>
                  </>
                ) : !isSessionActive ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium py-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Speaking points locked until Faculty In-Charge commences session</span>
                  </div>
                ) : (
                  quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendUserStatement(prompt)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap transition-all truncate max-w-[220px] cursor-pointer"
                      title={prompt}
                    >
                      "{prompt.substring(0, 30)}..."
                    </button>
                  ))
                )}
              </div>

            </div>

          </div>
        </div>

        {/* RIGHT: Live Discussion Stream & Multi-Tab Hub (Right 4-5 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-md dark:shadow-2xl flex flex-col h-[580px] transition-colors duration-200">
            
            {/* Sidebar Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-1">
                <button
                  id="tab-transcript-sub"
                  onClick={() => setActiveTab('transcript')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'transcript'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Transcript ({deduplicatedTranscripts.length})
                </button>
                <button
                  id="tab-rules-sub"
                  onClick={() => setActiveTab('rules')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'rules'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Rules
                </button>
                <button
                  id="tab-analytics-sub"
                  onClick={() => setActiveTab('analytics')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'analytics'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Turn Meter
                </button>
                <button
                  id="tab-breakout-sub"
                  onClick={() => setActiveTab('breakout')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'breakout'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Rooms
                </button>
              </div>
            </div>

            {/* TAB 1: Live Timestamped Transcript Stream */}
            {activeTab === 'transcript' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                  {deduplicatedTranscripts.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-xl border text-xs leading-relaxed transition-all ${
                        entry.isFacilitator
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/50 text-indigo-950 dark:text-indigo-100'
                          : entry.speakerId === 's1'
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50 text-blue-950 dark:text-slate-100'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-mono-code">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${entry.isFacilitator ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {entry.speakerName}
                          </span>
                          {entry.seatNumber && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-semibold">
                              Seat {entry.seatNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 dark:text-slate-500">{entry.timestamp}</span>
                      </div>
                      <p className="font-normal">{entry.text}</p>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleanTyped = String(typedStatement || '').trim();
                    if (!cleanTyped) return;
                    handleSendUserStatement(cleanTyped);
                    setTypedStatement('');
                  }}
                  className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={typedStatement}
                    onChange={(e) => setTypedStatement(e.target.value)}
                    placeholder="Type argument or speaking point..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!String(typedStatement || '').trim()}
                    className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs disabled:opacity-40 cursor-pointer transition-all flex items-center gap-1 shadow-xs"
                    title="Send statement"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: GD Ground Rules */}
            {activeTab === 'rules' && (
              <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Official Discussion Protocol
                  </h4>
                  <ul className="space-y-2 text-slate-700 dark:text-slate-300 text-xs">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">1.</span>
                      <span><strong>Speak one person at a time:</strong> Avoid cross-talk and overlapping interruptions.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">2.</span>
                      <span><strong>Respect differing opinions:</strong> Acknowledge counter-views constructively.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">3.</span>
                      <span><strong>Support arguments with examples:</strong> Provide real-world case studies & facts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">4.</span>
                      <span><strong>Encourage participation:</strong> Invite quiet colleagues (e.g. Ramesh) to contribute.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">5.</span>
                      <span><strong>Stay strictly on topic:</strong> Avoid drifting into unrelated domains.</span>
                    </li>
                  </ul>
                </div>

                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/40 text-indigo-950 dark:text-indigo-200">
                  <span className="font-bold block mb-1">AI Moderator Scoring Weightage:</span>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300/90 leading-relaxed">
                    English (20%) + Fluency (20%) + Clarity (15%) + Confidence (15%) + Content (15%) + Collaboration (10%) + Leadership (5%) = 100 Total.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: Real-Time Participation Balance Meter */}
            {activeTab === 'analytics' && (
              <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Speaking Time Distribution</span>
                    <span className="text-[10px] text-slate-500 font-mono">Live Sync</span>
                  </div>
                  <div className="space-y-2">
                    {session.students.map((st) => {
                      const percent = Math.min(100, Math.round((st.speakingDurationSeconds / 300) * 100));
                      return (
                        <div key={st.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={st.isUser && !isFaculty ? 'text-indigo-600 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                              Seat {st.seatNumber}: {st.name} {st.isUser && !isFaculty && '(You)'}
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">{formatSecs(st.speakingDurationSeconds)} ({st.speakingTurns}t)</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                st.isUser && !isFaculty ? 'bg-indigo-600' : 'bg-blue-600'
                              }`} 
                              style={{ width: `${Math.max(5, percent)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Deadlock Threshold:</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">15 Seconds Silence</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dominance Threshold:</span>
                    <span className="font-mono text-cyan-600 dark:text-cyan-400">&gt; 5 min continuous</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Breakout Rooms Manager */}
            {activeTab === 'breakout' && (
              <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Breakout Pods (Automated Allocation)
                  </h4>
                  <div className="space-y-3">
                    {session.breakoutRooms.map((br) => (
                      <div key={br.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">{br.name}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-semibold border border-emerald-200 dark:border-emerald-800">
                            Active
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">{br.topic}</p>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {br.studentIds.map((sid) => {
                            const studentObj = session.students.find((s) => s.id === sid);
                            return (
                              <span key={sid} className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                                Seat {studentObj?.seatNumber}: {studentObj?.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Audio & Microphone Live Diagnostic Test Modal (Accessible Anytime) */}
      {showAudioTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Audio & Microphone Diagnostic Test</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      Hardware Check
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Test live microphone input levels and speaker sound before or during the GD
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAudioTestModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <LobbyAudioTester speakerOnly={isFaculty} />

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAudioTestModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-all cursor-pointer active:scale-95"
              >
                Done & Return to Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Live Observation Notes & Bookmarks Modal (Enhancement 4) */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Bookmark className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Faculty Observation Notes & Bookmarks</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Record live timestamped notes during the active discussion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Note Creation Form */}
            <div className="py-3 space-y-3 border-b border-slate-200 dark:border-slate-800">
              {/* Row 1: Student selector + Timestamp */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Participant:
                  </label>
                  <select
                    value={noteTargetStudentId}
                    onChange={(e) => setNoteTargetStudentId(e.target.value)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                  >
                    {activeDisplayStudents.filter((s) => !s.isEmptySeat).map((st) => (
                      <option key={st.id} value={st.id}>
                        Seat {st.seatNumber}: {st.name} {st.isRealPeer ? '(Live Peer)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Timestamp:
                    </label>
                    <button
                      type="button"
                      onClick={() => setNoteTimestamp(formatElapsedClock(elapsedSeconds))}
                      className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline font-mono"
                    >
                      Now ({formatElapsedClock(elapsedSeconds)})
                    </button>
                  </div>
                  <input
                    type="text"
                    value={noteTimestamp}
                    onChange={(e) => setNoteTimestamp(e.target.value)}
                    placeholder="mm:ss"
                    className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Row 2: Tag Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tag Classification:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'strength', label: 'Strength', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
                      { id: 'improvement', label: 'Improvement', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
                      { id: 'key_argument', label: 'Key Argument', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
                      { id: 'leadership', label: 'Leadership', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
                      { id: 'general', label: 'General', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNoteTag(t.id)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                        noteTag === t.id
                          ? `${t.color} font-bold ring-2 ring-violet-500/50 shadow-xs scale-105`
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Quick Remarks Chips */}
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                  Quick Remark Presets (Click to insert):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap max-h-20 overflow-y-auto">
                  {[
                    'Strong opening argument with data',
                    'Constructively synthesised opposing points',
                    'Interrupted peer without waiting',
                    'Needs more quantitative evidence',
                    'Active listening and balanced turn-taking',
                    'Excellent rebuttal and counter-example',
                    'Encouraged quieter peers to participate',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNoteContent((prev) => (prev ? `${prev}. ${preset}` : preset))}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 hover:text-violet-700 dark:hover:text-violet-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Note Text + Add Button */}
              <div className="space-y-2">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Type specific qualitative observation, behavior feedback, or argument assessment..."
                  rows={2}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveObservationNote}
                    disabled={!String(noteContent || '').trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Observation</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recorded Notes Feed */}
            <div className="flex-1 overflow-y-auto pt-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-violet-500" />
                  <span>Recorded Notes for this Session</span>
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-bold">
                  {(session.facultyLiveNotes?.length || 0)} Total
                </span>
              </div>

              {(!session.facultyLiveNotes || session.facultyLiveNotes.length === 0) ? (
                <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-40 text-violet-400" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">No observation notes recorded yet</p>
                  <p className="text-[11px] mt-0.5">Use the form above to record timestamped bookmarks for any participant.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {session.facultyLiveNotes.map((note) => {
                    const tagStyles = {
                      strength: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
                      improvement: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                      key_argument: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700',
                      leadership: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700',
                      general: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                    }[note.tag || 'general'];

                    return (
                      <div
                        key={note.id}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2.5 text-xs hover:border-violet-300 dark:hover:border-violet-800 transition-colors"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {note.studentName}
                            </span>
                            {note.seatNumber && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold">
                                Seat {note.seatNumber}
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold border border-indigo-200 dark:border-indigo-800">
                              ⏱ {note.timestamp}
                            </span>
                            {note.tag && (
                              <span className={`text-[10px] px-2 py-0.2 rounded-full border font-semibold capitalize ${tagStyles}`}>
                                {note.tag.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                            {note.note}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteObservationNote(note.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Saved notes appear on the Faculty Dashboard and Student Evaluation Reports.</span>
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ENLARGED PARTICIPANT SPOTLIGHT MODAL (TRIGGERED ON DOUBLE-CLICK) */}
      {liveEnlargedStudent && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setEnlargedStudent(null)}
        >
          <div 
            className="relative w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-indigo-600 text-white shadow-xs">
                  Seat {liveEnlargedStudent.seatNumber}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{liveEnlargedStudent.name}</span>
                    {liveEnlargedStudent.isUser && !isFaculty && (
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 px-1.5 py-0.2 rounded font-mono">YOU</span>
                    )}
                    {liveEnlargedStudent.isRealPeer && !liveEnlargedStudent.isUser && (
                      <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.2 rounded font-mono font-bold">LIVE PEER</span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">{liveEnlargedStudent.college || 'Campus Participant'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isFaculty && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenNoteModal(liveEnlargedStudent.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-400/40 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5 fill-current" />
                    <span>Observation Note</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEnlargedStudent(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Video Stage Container */}
            <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
              {liveEnlargedStudent.isEmptySeat ? (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <User className="w-16 h-16 opacity-30 mb-2" />
                  <p className="text-sm">Empty Desk • Awaiting Candidate</p>
                </div>
              ) : (() => {
                  const effectiveStream = liveEnlargedStudent.isUser 
                    ? (isCameraOn ? videoStream : null)
                    : (liveEnlargedStudent.videoStream || (rtcPeerStreams.size > 0 ? Array.from(rtcPeerStreams.values())[0] : null));
                  
                  const hasActiveStream = !!(effectiveStream && (effectiveStream.getVideoTracks().length > 0 || (effectiveStream as any).active));
                  const isCameraActive = liveEnlargedStudent.isUser 
                    ? isCameraOn 
                    : (liveEnlargedStudent.cameraActive !== false);

                  if (effectiveStream && (hasActiveStream || isCameraActive)) {
                    return (
                      <VideoStreamPlayer 
                        stream={effectiveStream}
                        muted={liveEnlargedStudent.isUser}
                        className={`w-full h-full object-cover ${liveEnlargedStudent.isUser ? 'transform -scale-x-100' : ''}`}
                      />
                    );
                  }

                  return (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                      <div className="w-24 h-24 rounded-full bg-indigo-600/90 flex items-center justify-center text-3xl font-extrabold text-white uppercase shadow-xl mb-3">
                        {liveEnlargedStudent.name.charAt(0)}
                      </div>
                      <p className="text-sm font-semibold text-slate-200">{liveEnlargedStudent.name}</p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                        <span>Camera is currently off</span>
                      </p>
                    </div>
                  );
                })()}

              {/* Live Speaker Animation Aura */}
              {liveEnlargedStudent.isSpeaking && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/90 text-white text-xs font-bold shadow-lg backdrop-blur-xs">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>Speaking Now</span>
                </div>
              )}

              {/* Status Badges Overlay (Bottom-Left) */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md ${
                  liveEnlargedStudent.micActive ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/80 text-rose-400 border border-rose-500/30'
                }`}>
                  {liveEnlargedStudent.micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>{liveEnlargedStudent.micActive ? 'Mic Active' : 'Mic Muted'}</span>
                </span>

                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md ${
                  (liveEnlargedStudent.isUser ? isCameraOn : liveEnlargedStudent.cameraActive !== false)
                    ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40'
                    : 'bg-slate-900/80 text-slate-400 border border-slate-700/50'
                }`}>
                  {(liveEnlargedStudent.isUser ? isCameraOn : liveEnlargedStudent.cameraActive !== false) ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  <span>{(liveEnlargedStudent.isUser ? isCameraOn : liveEnlargedStudent.cameraActive !== false) ? 'Camera On' : 'Camera Off'}</span>
                </span>
              </div>
            </div>

            {/* Modal Bottom Stats */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span>Speaking Turns: <strong className="text-white font-mono">{liveEnlargedStudent.speakingTurns}</strong></span>
                <span>Time Spoken: <strong className="text-white font-mono">{Math.floor(liveEnlargedStudent.speakingDurationSeconds / 60)}m {liveEnlargedStudent.speakingDurationSeconds % 60}s</strong></span>
              </div>
              <span className="text-[11px] text-slate-500">Double-click any seat to enlarge • Press Esc to minimize</span>
            </div>
          </div>
        </div>
      )}

      {/* GD Video Recording Playback Modal */}
      {showVideoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowVideoModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Recorded Group Discussion Video
                  </h3>
                  <p className="text-xs text-slate-400">
                    Topic: {session?.topic || 'Group Discussion'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVideoModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
              <video
                controls
                autoPlay
                src={gdRecorder.recordingUrl || session.recordingUrl}
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>
            </div>

            <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Single Master Video • Recorded by Faculty Portal</span>
              </span>
              <a
                href={gdRecorder.recordingUrl || session.recordingUrl}
                download={`GD-Video-${session.id}.webm`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Video</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Sub-Component: HTML5 Video Stream Player for Live Webcam Feed
const VideoStreamPlayer: React.FC<{ stream: MediaStream; className?: string; muted?: boolean }> = ({ stream, className, muted = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => {});

      const handlePlay = () => {
        video.play().catch(() => {});
      };

      stream.addEventListener('addtrack', handlePlay);
      stream.addEventListener('removetrack', handlePlay);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('unmute', handlePlay);
      });

      return () => {
        stream.removeEventListener('addtrack', handlePlay);
        stream.removeEventListener('removetrack', handlePlay);
        stream.getVideoTracks().forEach((track) => {
          track.removeEventListener('unmute', handlePlay);
        });
      };
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={className || "w-full h-full object-cover"}
    />
  );
};

// Sub-Component: Student Video / Camera Frame with Google Meet Badges & Live Webcam Streaming
export const StudentVideoFrame: React.FC<{
  student: Student;
  isCurrentSpeaker?: boolean;
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  size?: 'small' | 'normal' | 'large';
  isFaculty?: boolean;
}> = ({
  student,
  isCurrentSpeaker = false,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  size = 'normal',
  isFaculty = false,
}) => {
  const isUser = !isFaculty && !!student.isUser;
  const effectiveStream = isUser ? videoStream : student.videoStream;
  const isLiveWebcam = (isUser && isUserCameraOn && !!videoStream) || (!isUser && !!student.videoStream && student.cameraActive !== false);
  const isCameraEnabled = isUser ? isUserCameraOn : (student.cameraActive !== false);
  const isMicLive = isUser ? isListeningMic : (isCurrentSpeaker || student.isSpeaking);

  return (
    <div className="relative w-full h-full rounded-inherit overflow-hidden bg-slate-900 flex items-center justify-center select-none">
      {/* 1. Camera Feed / Avatar Image / Empty Waiting Seat */}
      {student.isEmptySeat ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100/70 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500">
          <User className="w-5 h-5 text-slate-300 dark:text-slate-600 mb-0.5" />
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">Empty</span>
        </div>
      ) : isLiveWebcam && effectiveStream ? (
        <VideoStreamPlayer 
          stream={effectiveStream} 
          muted={true}
          className={`w-full h-full object-cover ${isUser ? 'transform -scale-x-100' : ''}`} 
        />
      ) : isCameraEnabled ? (
        student.avatar ? (
          <img
            src={student.avatar}
            alt={student.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
              {student.name.charAt(0)}
            </div>
          </div>
        )
      ) : (
        /* Camera Off Fallback Placeholder */
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700/90 flex items-center justify-center text-[10px] sm:text-xs font-bold text-slate-200 uppercase">
            {student.name.charAt(0)}
          </div>
          <VideoOff className="w-2.5 h-2.5 text-rose-400 mt-0.5" />
        </div>
      )}

      {/* 2. Live Audio Level Bar / Speaking Animation Overlay */}
      {isMicLive && (
        <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 backdrop-blur-xs py-0.5 px-1 flex justify-center items-center gap-0.5 z-10">
          {isUser && audioLevel > 0 ? (
            <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden flex items-center">
              <div 
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(15, audioLevel * 2.2))}%` }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-0.5">
              <span className="w-0.5 sm:w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s]" style={{ height: size === 'large' ? '14px' : '7px' }} />
              <span className="w-0.5 sm:w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]" style={{ height: size === 'large' ? '18px' : '10px' }} />
              <span className="w-0.5 sm:w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]" style={{ height: size === 'large' ? '12px' : '6px' }} />
            </div>
          )}
        </div>
      )}

      {/* 3. Meet Badges: Hand Raise (Top-Right) */}
      {student.hasRaisedHand && (
        <div className="absolute top-1 right-1 bg-amber-500 text-slate-950 p-0.5 rounded-md shadow flex items-center justify-center z-10" title="Hand Raised">
          <Hand className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
        </div>
      )}

      {/* 4. Meet Badges: Mic & Camera Status (Bottom-Left) */}
      <div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 z-10 pointer-events-none">
        {/* Mic Badge */}
        {isMicLive ? (
          <div className="bg-emerald-600 text-white p-0.5 rounded-full shadow flex items-center justify-center" title="Mic On">
            <Mic className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </div>
        ) : (
          <div className="bg-slate-950/80 text-rose-400 p-0.5 rounded-full shadow flex items-center justify-center" title="Mic Muted">
            <MicOff className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </div>
        )}

        {/* Camera Badge */}
        {isCameraEnabled ? (
          <div className="bg-slate-950/80 text-emerald-400 p-0.5 rounded-full shadow flex items-center justify-center" title="Camera Active">
            <Video className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </div>
        ) : (
          <div className="bg-slate-950/80 text-rose-400 p-0.5 rounded-full shadow flex items-center justify-center" title="Camera Off">
            <VideoOff className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </div>
        )}
      </div>

      {/* YOU Tag (Student participant mode only) */}
      {isUser && size === 'large' && (
        <div className="absolute top-1 left-1 bg-indigo-600/90 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold font-mono tracking-wider shadow z-10">
          YOU
        </div>
      )}

      {/* 4. Faculty Pin/Observation Indicator (Top-Left) */}
      {isFaculty && (
        <div className="absolute top-1 left-1 bg-indigo-600/90 text-white p-0.5 rounded-md shadow flex items-center justify-center z-10">
          <GraduationCap className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
        </div>
      )}
    </div>
  );
};

// Realistic Pod Seat Component with Numbered Desk Placard
export const StudentPodCard: React.FC<{
  student: Student;
  isCurrentSpeaker: boolean;
  position: 'top' | 'bottom';
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  isFaculty?: boolean;
  onAddNote?: (student: Student) => void;
  onEnlarge?: (student: Student) => void;
}> = ({
  student,
  isCurrentSpeaker,
  position,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
  onAddNote,
  onEnlarge,
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div 
      onDoubleClick={() => !student.isEmptySeat && onEnlarge?.(student)}
      title={student.isEmptySeat ? 'Open Desk' : `${student.name} • Double-click to enlarge spotlight`}
      className={`flex flex-col items-center group transition-all duration-300 ${
        student.isEmptySeat ? '' : 'cursor-pointer'
      } ${
        isCurrentSpeaker ? 'scale-110 z-20' : 'z-10'
      }`}
    >
      
      {/* 1. Realistic Numbered Seat Placard (Pinned cleanly at top, in natural flex flow) */}
      <div className={`mb-1 whitespace-nowrap px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] font-bold font-mono shadow-xs uppercase tracking-wider transition-colors flex items-center gap-1 ${
        isUser 
          ? 'bg-indigo-600 text-white border border-indigo-400 shadow-indigo-500/20 ring-1 ring-indigo-400' 
          : student.isRealPeer
          ? 'bg-emerald-600 text-white border border-emerald-400 shadow-emerald-500/20 ring-1 ring-emerald-400'
          : student.isEmptySeat
          ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-700'
          : isCurrentSpeaker
          ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
      }`}>
        <span>Seat {student.seatNumber}</span>
        {isUser && <span className="text-[8px] bg-white/20 px-1 rounded">YOU</span>}
        {student.isRealPeer && !isUser && <span className="text-[8px] bg-emerald-400 text-emerald-950 px-1 rounded font-bold">LIVE</span>}
        {student.isEmptySeat && <span className="text-[8px] opacity-70">OPEN</span>}
        {!student.isEmptySeat && onAddNote && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddNote(student);
            }}
            className="ml-0.5 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-500 hover:text-amber-600 transition-colors cursor-pointer"
            title={`Record live observation note for ${student.name}`}
          >
            <Bookmark className="w-2.5 h-2.5 fill-current" />
          </button>
        )}
      </div>

      {/* 2. Student Video / Avatar Bubble */}
      <div className="relative">
        {/* Speaking Voice Waves Aura */}
        {isCurrentSpeaker && (
          <div className="absolute -inset-1.5 rounded-2xl bg-indigo-500/40 animate-pulse pointer-events-none" />
        )}

        <div className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl overflow-hidden border-2 transition-all shadow-md relative bg-slate-900 ${
          student.isEmptySeat
            ? 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-900/60 shadow-none'
            : isCurrentSpeaker 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/50 shadow-indigo-500/30' 
            : isUser 
            ? 'border-blue-500 dark:border-blue-500/80 ring-2 ring-blue-500/30' 
            : student.isRealPeer
            ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/30'
            : 'border-slate-300 dark:border-slate-700'
        }`}>
          <StudentVideoFrame
            student={student}
            isCurrentSpeaker={isCurrentSpeaker}
            isUserCameraOn={isUserCameraOn}
            videoStream={videoStream}
            audioLevel={audioLevel}
            isListeningMic={isListeningMic}
            size="normal"
            isFaculty={isFaculty}
          />

          {!student.isEmptySeat && onEnlarge && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEnlarge(student);
              }}
              className="absolute top-1 right-1 p-1 rounded-md bg-slate-900/85 hover:bg-indigo-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer shadow-md"
              title={`Enlarge spotlight for ${student.name} (or double-click)`}
            >
              <Maximize2 className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Student Name & Turns (Positioned cleanly below avatar with zero overlap) */}
      <div className="text-center mt-1.5 max-w-[68px] sm:max-w-[85px]">
        <p className={`text-[11px] sm:text-xs font-semibold truncate leading-tight ${
          student.isEmptySeat
            ? 'text-slate-400 dark:text-slate-500 font-normal italic'
            : isUser 
            ? 'text-indigo-700 dark:text-indigo-300 font-bold' 
            : student.isRealPeer 
            ? 'text-emerald-700 dark:text-emerald-300 font-bold' 
            : 'text-slate-800 dark:text-slate-200'
        }`}>
          {student.isEmptySeat ? 'Available' : student.name.split(' ')[0]}
        </p>
        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono block mt-0.5">
          {student.isEmptySeat ? 'Waiting...' : `${student.speakingTurns} turns`}
        </span>
      </div>

    </div>
  );
};

// Realistic Classroom Desk Card with Numbered Seat Tag
export const ClassroomDeskCard: React.FC<{
  student: Student;
  isCurrentSpeaker: boolean;
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  isFaculty?: boolean;
  assignedTopic?: ClassroomAssignedTopic;
  isInvitedPeer?: boolean;
  isPresenterAtPodium?: boolean;
  onInvitePeer?: (student: Student) => void;
  onAddNote?: (student: Student) => void;
  onEnlarge?: (student: Student) => void;
}> = ({
  student,
  isCurrentSpeaker,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
  assignedTopic,
  isInvitedPeer = false,
  isPresenterAtPodium = false,
  onInvitePeer,
  onAddNote,
  onEnlarge,
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div
      onDoubleClick={() => !student.isEmptySeat && onEnlarge?.(student)}
      onClick={() => {
        if (!student.isEmptySeat && onInvitePeer) {
          onInvitePeer(student);
        }
      }}
      title={student.isEmptySeat ? 'Open Desk' : `${student.name}${assignedTopic ? ` • Sub-Topic: ${assignedTopic.subTopicTitle}` : ''} • Double-click to enlarge spotlight`}
      className={`relative flex items-center gap-2 p-2 rounded-xl border transition-all ${
        student.isEmptySeat ? '' : 'cursor-pointer'
      } ${
        student.isEmptySeat
          ? 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
          : isPresenterAtPodium
          ? 'bg-purple-50 dark:bg-purple-950/70 border-purple-400 dark:border-purple-600 ring-2 ring-purple-500/40 shadow-sm'
          : isInvitedPeer
          ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/50 shadow-md animate-pulse'
          : isCurrentSpeaker
          ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/40 shadow-sm'
          : isUser
          ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700'
          : student.isRealPeer
          ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border ${
          student.isEmptySeat
            ? 'border-dashed border-slate-300 dark:border-slate-700'
            : isPresenterAtPodium
            ? 'border-purple-500 ring-2 ring-purple-400'
            : isInvitedPeer
            ? 'border-amber-500 ring-2 ring-amber-400'
            : isCurrentSpeaker
            ? 'border-indigo-500 ring-2 ring-indigo-400'
            : isUser
            ? 'border-blue-500'
            : student.isRealPeer
            ? 'border-emerald-500'
            : 'border-slate-300 dark:border-slate-700'
        }`}>
          <StudentVideoFrame
            student={student}
            isCurrentSpeaker={isCurrentSpeaker || isPresenterAtPodium}
            isUserCameraOn={isUserCameraOn}
            videoStream={videoStream}
            audioLevel={audioLevel}
            isListeningMic={isListeningMic}
            size="small"
            isFaculty={isFaculty}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono font-bold px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            #{student.seatNumber}
          </span>
          <p className={`text-xs font-semibold truncate ${
            student.isEmptySeat
              ? 'text-slate-400 dark:text-slate-500 italic'
              : isUser ? 'text-indigo-700 dark:text-indigo-300' : student.isRealPeer ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-800 dark:text-slate-200'
          }`}>
            {student.isEmptySeat ? 'Available' : student.name.split(' ')[0]}
          </p>
          {isPresenterAtPodium && (
            <span className="text-[8px] bg-purple-600 text-white font-bold px-1 rounded shadow-xs">PODIUM</span>
          )}
          {isInvitedPeer && !isPresenterAtPodium && (
            <span className="text-[8px] bg-amber-500 text-white font-bold px-1 rounded shadow-xs animate-bounce">Q&A</span>
          )}
          {student.isRealPeer && !isUser && !isPresenterAtPodium && (
            <span className="text-[8px] bg-emerald-500 text-white font-bold px-1 rounded">LIVE</span>
          )}
          {student.isEmptySeat && (
            <span className="text-[8px] text-slate-400 font-mono">OPEN</span>
          )}
        </div>
        
        {assignedTopic ? (
          <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-medium truncate mt-0.5" title={assignedTopic.subTopicTitle}>
            {assignedTopic.focusArea}
          </p>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span>{student.isEmptySeat ? 'Open Desk' : isUser ? 'You' : student.isRealPeer ? 'Peer' : 'Audience'}</span>
            <span>{student.isEmptySeat ? '--' : `${student.speakingTurns}t`}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!student.isEmptySeat && onEnlarge && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnlarge(student);
            }}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
            title={`Enlarge spotlight for ${student.name}`}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}

        {!student.isEmptySeat && onAddNote && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddNote(student);
            }}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-amber-500 hover:text-amber-600 transition-colors cursor-pointer"
            title={`Record live observation note for ${student.name}`}
          >
            <Bookmark className="w-3 h-3 fill-current" />
          </button>
        )}
      </div>
    </div>
  );
};
