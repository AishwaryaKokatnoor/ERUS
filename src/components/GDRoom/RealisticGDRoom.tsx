import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  X
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry, GDFacilitatorPhase, GDRoomLayoutType, FacultyLiveNote } from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { roomVoice, facilitatorVoice } from '../../utils/speechSynthesis';
import { useUserMedia } from '../../utils/useUserMedia';
import { useWebRTCRoom } from '../../hooks/useWebRTCRoom';
import { 
  getNextUniqueFacilitatorPrompt, 
  sessionQuestionTracker,
  getStudentPreviousPresentation,
  generateInitiationPrompt,
  generateTargetedQuestionForStudent,
  getNextTurnSpeaker,
  generateStudentOpeningStatement,
  generateStudentFollowUpStatement
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
  const [liveSpeechTranscript, setLiveSpeechTranscript] = useState('');
  const liveTranscriptRef = useRef<string>('');
  const speechPauseTimerRef = useRef<any>(null);
  const isListeningMicRef = useRef<boolean>(false);
  const handleSendUserStatementRef = useRef<(textToSend?: string) => Promise<void>>(() => Promise.resolve());
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [interruptionWarning, setInterruptionWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  // Server-side Socket.IO is now the single source of truth for AI turns.
  // Keeping the legacy local simulator enabled can queue a second voice while
  // a real participant is speaking, so it is disabled for live GDs.
  const [autoSimulatePeers, setAutoSimulatePeers] = useState(false);
  const [invitedStudentPrompt, setInvitedStudentPrompt] = useState<{ student: Student; reason: string; promptText?: string } | null>(null);
  const [currentLayout, setCurrentLayout] = useState<GDRoomLayoutType>(session.roomLayout || 'round_table');

  const hasInitiatedOpeningRef = useRef<boolean>(false);
  const isTransitioningTurnRef = useRef<boolean>(false);
  const lastFacilitatorInterventionTimeRef = useRef<number>(0);

  const isFaculty = currentUser?.role === 'faculty';
  const canStartSession = isFaculty || currentUser?.role === 'college_admin' || currentUser?.role === 'super_admin';
  const isStudent = currentUser?.role === 'student';
  const isSessionActive = session.status === 'active';
  // Faculty Live Observation Notes State (Enhancement 4)
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [noteTargetStudentId, setNoteTargetStudentId] = useState<string>(session.students[0]?.id || '');
  const [noteTimestamp, setNoteTimestamp] = useState<string>('00:00');
  const [noteTag, setNoteTag] = useState<'strength' | 'improvement' | 'key_argument' | 'leadership' | 'general'>('general');
  const [noteContent, setNoteContent] = useState<string>('');

  // Audio & Mic Diagnostic Test Modal State
  const [showAudioTestModal, setShowAudioTestModal] = useState(false);

  const formatElapsedClock = (secs: number) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const remainingSecs = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${remainingSecs}`;
  };

  const handleOpenNoteModal = (studentId?: string) => {
    const targetId = studentId || noteTargetStudentId || session.students[0]?.id || '';
    setNoteTargetStudentId(targetId);
    setNoteTimestamp(formatElapsedClock(elapsedSeconds));
    setIsNotesModalOpen(true);
  };

  const handleSaveObservationNote = () => {
    if (!noteContent.trim()) return;
    const targetStudent = session.students.find((s) => s.id === noteTargetStudentId) || session.students[0];
    const newNote: FacultyLiveNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sessionId: session.id,
      studentId: targetStudent.id,
      studentName: targetStudent.name,
      seatNumber: targetStudent.seatNumber,
      timestamp: noteTimestamp || formatElapsedClock(elapsedSeconds),
      timestampSeconds: elapsedSeconds,
      note: noteContent.trim(),
      tag: noteTag,
      facultyName: currentUser?.name || 'Dr. Sunita Rao (Faculty Evaluator)',
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
    audioLevel,
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
    if (session.roomLayout) {
      setCurrentLayout(session.roomLayout);
    }
  }, [session.roomLayout]);

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
    setSession((prev) => ({ ...prev, roomLayout: newLayout }));
    if (onUpdateLayout) {
      onUpdateLayout(newLayout);
    }
  };

  // Real-Time Multi-User WebRTC Audio Mesh & Room Signaling (PDF Page 13 & 14)
  const {
    connected: isSocketConnected,
    assignedSeat: rtcAssignedSeat,
    peers: rtcPeers,
    silenceTimerSeconds: rtcSilenceTimer,
    isMicMuted: rtcIsMicMuted,
    isSpeakingLive: rtcIsSpeakingLive,
    localVolume: rtcLocalVolume,
    toggleMute: rtcToggleMute,
    setMicEnabled: rtcSetMicEnabled,
    broadcastTranscript: rtcBroadcastTranscript,
    startSession: rtcStartSession,
    aiParticipants: rtcAiParticipants,
    simulationMode: rtcSimulationMode,
  } = useWebRTCRoom({
    slotId: session.slotId || session.id || 'slot-dit-001',
    currentUser,
    onSessionStarted: () => {
      setSession((prev) => ({
        ...prev,
        status: 'active',
        startedAt: prev.startedAt || Date.now(),
      }));
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
    onAiParticipantSpeech: (data) => {
      const participant = data?.participant;
      const newTx = data?.transcript;
      if (!participant || !newTx) return;

      // Mirror the server's AI seat into the UI.
      setSession((prev) => {
        const exists = prev.students.some((s) => s.id === participant.id);
        if (exists) {
          return {
            ...prev,
            currentSpeakerId: participant.id,
            students: prev.students.map((s) =>
              s.id === participant.id
                ? {
                    ...s,
                    name: participant.name,
                    seatNumber: participant.seatNumber,
                    isDemoAI: true,
                    isRealPeer: false,
                    isSpeaking: true,
                    micActive: true,
                    speakingTurns: (s.speakingTurns || 0) + 1,
                    speakingDurationSeconds: (s.speakingDurationSeconds || 0) + Math.max(4, Math.round(String(data.text || '').split(/\s+/).length / 2.2)),
                    lastSpokenAt: Date.now(),
                  }
                : { ...s, isSpeaking: false }
            ),
          };
        }
        return {
          ...prev,
          currentSpeakerId: participant.id,
          students: [
            ...prev.students.map((s) => ({ ...s, isSpeaking: false })),
            {
              id: participant.id,
              name: participant.name,
              avatar: participant.avatar || '',
              college: participant.college || 'ERUS AI Participant',
              seatNumber: participant.seatNumber,
              isUser: false,
              isDemoAI: true,
              isRealPeer: false,
              isEmptySeat: false,
              isSpeaking: true,
              micActive: true,
              cameraActive: false,
              speakingTurns: 1,
              speakingDurationSeconds: Math.max(4, Math.round(String(data.text || '').split(/\s+/).length / 2.2)),
              interruptionCount: 0,
              questionsAnswered: 0,
              questionsInitiated: 0,
              lastSpokenAt: Date.now(),
            } as any,
          ],
        };
      });

      setTranscripts((prev) => prev.some((t) => t.id === newTx.id) ? prev : [...prev, newTx]);

      // All connected browsers vocalize the same AI contribution. The speech
      // utility temporarily disables Web Speech recognition + outgoing mic
      // while the AI is speaking, preventing the AI audio from becoming
      // the human participant's transcript.
      if (!voiceMuted) {
        roomVoice.speakAsStudent(participant, data.text, () => {
          setSession((prev) => ({
            ...prev,
            currentSpeakerId: null,
            students: prev.students.map((s) => s.id === participant.id ? { ...s, isSpeaking: false } : s),
          }));
        });
      } else {
        setSession((prev) => ({
          ...prev,
          currentSpeakerId: null,
          students: prev.students.map((s) => s.id === participant.id ? { ...s, isSpeaking: false } : s),
        }));
      }
    },

    onFacilitatorIntervention: (intervention) => {
      setTranscripts((prev) => {
        if (prev.some((t) => t.id === intervention.transcript.id)) return prev;
        return [...prev, intervention.transcript];
      });

      setSession((prev) => ({
        ...prev,
        silenceTimerSeconds: 0,
        facilitatorSpeech: intervention.text,
        isFacilitatorSpeaking: true,
      }));

      // If the server moderator called this exact participant, show the
      // invitation/question in their UI so they know the floor is theirs.
      if (
        intervention.targetUserId &&
        currentUser?.role === 'student' &&
        intervention.targetUserId === currentUser.id
      ) {
        const targetStudent = session.students.find((s) => s.id === currentUser.id) || session.students[0];
        if (targetStudent) {
          setInvitedStudentPrompt({
            student: targetStudent,
            reason: intervention.text,
            promptText: intervention.text,
          });
        }
      }

      // Audibly speak AI intervention using roomVoice
      if (!voiceMuted) {
        roomVoice.speakAsFacilitator(intervention.text, () => {
          setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
        });
      }
    },
  });

  // In autonomous simulation mode the server owns the entire roster and turn
  // engine. Do not let the legacy local demo roster introduce Rahul or any
  // other mock human participant.
  useEffect(() => {
    if (!rtcSimulationMode || !rtcAiParticipants.length) return;
    // The server sends the roster once, while live speaking stats arrive via
    // AI speech events. Merge the roster instead of rebuilding students from
    // the original zero-turn roster on every speaker change.
    setSession((prev) => {
      const previousById = new Map(prev.students.map((s) => [s.id, s]));
      const aiStudents: Student[] = rtcAiParticipants.map((p: any) => {
        const previous = previousById.get(p.id);
        return {
          ...(previous || {}),
          id: p.id,
          name: p.name,
          avatar: p.avatar || previous?.avatar || '',
          college: p.college || previous?.college || 'ERUS AI Participant',
          course: 'AI GD Participant',
          batch: '',
          seatNumber: p.seatNumber,
          isUser: false,
          isDemoAI: true,
          isRealPeer: false,
          isEmptySeat: false,
          isSpeaking: previous?.isSpeaking || false,
          micActive: true,
          cameraActive: false,
          speakingTurns: Math.max(previous?.speakingTurns || 0, p.speakingTurns || 0),
          speakingDurationSeconds: Math.max(previous?.speakingDurationSeconds || 0, p.speakingDurationSeconds || 0),
          interruptionCount: previous?.interruptionCount || 0,
          questionsAnswered: previous?.questionsAnswered || 0,
          questionsInitiated: previous?.questionsInitiated || 0,
        } as any;
      });
      return {
        ...prev,
        students: aiStudents,
        currentSpeakerId: prev.currentSpeakerId && aiStudents.some((s) => s.id === prev.currentSpeakerId)
          ? prev.currentSpeakerId
          : null,
      };
    });
  }, [rtcSimulationMode, rtcAiParticipants, setSession]);

  // When two or more real students are connected, the server owns turn orchestration.
  // Local auto-simulation is retained only for the single-user demo mode.
  const hasRealStudentPeers = rtcPeers.some((p) => p.role === 'student');

  // Demo participants follow the slot capacity exactly. If a slot has
  // capacity 6, the room shows 6 participants total (including the current
  // student), with AI participants filling the remaining seats.
  useEffect(() => {
    setSession((prev) => {
      const capacity = Math.max(1, prev.maxCapacity || 15);

      // Existing generated slot participants are demo participants unless they
      // are the current user or a real WebRTC peer.
      const normalizedStudents = prev.students.map((s) =>
        !s.isUser && !s.isRealPeer && !s.isEmptySeat && s.id.startsWith('slot-stu-')
          ? { ...s, isDemoAI: true }
          : s
      );

      const fixedStudents = normalizedStudents.filter((s) => !s.isDemoAI && !s.isEmptySeat);
      const existingDemo = normalizedStudents
        .filter((s) => s.isDemoAI && !s.isEmptySeat)
        .slice(0, Math.max(0, capacity - fixedStudents.length));
      const targetAiCount = Math.max(0, capacity - fixedStudents.length);

      if (existingDemo.length === targetAiCount && normalizedStudents.length === capacity) {
        return normalizedStudents === prev.students ? prev : { ...prev, students: normalizedStudents };
      }

      const usedSeats = new Set([...fixedStudents, ...existingDemo].map((s) => s.seatNumber));
      const additions: Student[] = [];
      const missingAiCount = targetAiCount - existingDemo.length;
      const demoTemplates = generateSlotParticipants(Math.max(1, targetAiCount));
      let nextSeat = 1;

      for (let i = 0; i < missingAiCount; i++) {
        while (usedSeats.has(nextSeat)) nextSeat++;
        const demo = demoTemplates[i % demoTemplates.length];
        additions.push({
          ...demo,
          id: 'demo-ai-' + Date.now() + '-' + i,
          seatNumber: nextSeat,
          isUser: false,
          isDemoAI: true,
          micActive: false,
          isSpeaking: false,
          isRealPeer: false,
          isEmptySeat: false,
          speakingTurns: 0,
          speakingDurationSeconds: 0,
          interruptionCount: 0,
          questionsAnswered: 0,
          questionsInitiated: 0,
        });
        usedSeats.add(nextSeat);
        nextSeat++;
      }

      return {
        ...prev,
        students: [...fixedStudents, ...existingDemo, ...additions].slice(0, capacity),
      };
    });
  }, [session.id, session.maxCapacity, setSession]);
  // Active display students: merge static mock participants with live connected WebRTC peers
  const activeDisplayStudents = useMemo(() => {
    const targetUserSeat = !isFaculty
      ? (rtcAssignedSeat || (currentUser && 'seatNumber' in currentUser ? (currentUser as any).seatNumber : 1) || 1)
      : null;

    // Sort students by seatNumber to guarantee seats 1..15 are in deterministic order
    const sorted = [...session.students].sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    return sorted.map((st, idx) => {
      const fixedSeatNumber = st.seatNumber || (idx + 1);
      const isThisSeatUser = targetUserSeat !== null && (fixedSeatNumber === targetUserSeat || (!rtcAssignedSeat && st.isUser));

      // Check if current user is sitting in this seat
      if (isThisSeatUser) {
        return {
          ...st,
          id: currentUser?.id || st.id,
          isUser: true,
          seatNumber: fixedSeatNumber,
          name: currentUser?.name || st.name,
          avatar: currentUser?.avatar || st.avatar,
          college: currentUser?.college || st.college,
          isSpeaking: isListeningMic || rtcIsSpeakingLive,
          micActive: isListeningMic || !rtcIsMicMuted,
          cameraActive: isCameraOn,
        };
      }

      // Check if another real peer is connected in this seat
      const realPeer = rtcPeers.find((p) => p.seatNumber === fixedSeatNumber);
      if (realPeer) {
        return {
          ...st,
          id: realPeer.userId,
          seatNumber: fixedSeatNumber,
          name: realPeer.name,
          avatar: realPeer.avatar || st.avatar,
          college: realPeer.college || st.college,
          isSpeaking: realPeer.isSpeaking,
          micActive: realPeer.micActive,
          cameraActive: realPeer.cameraActive,
          speakingTurns: realPeer.speakingTurns || st.speakingTurns,
          speakingDurationSeconds: realPeer.speakingDurationSeconds || st.speakingDurationSeconds,
          isRealPeer: true,
          volumeLevel: realPeer.volumeLevel,
        };
      }

      // If seat has no assigned student, display as open waiting desk
      if (!st.name || st.name.startsWith('Seat ') || st.isEmptySeat) {
        return {
          ...st,
          id: `seat-${fixedSeatNumber}-empty`,
          seatNumber: fixedSeatNumber,
          name: `Seat ${fixedSeatNumber}`,
          college: 'Open Candidate Seat',
          avatar: '',
          isUser: false,
          isRealPeer: false,
          isEmptySeat: true,
          isSpeaking: false,
          micActive: false,
          cameraActive: false,
          speakingTurns: 0,
          speakingDurationSeconds: 0,
        };
      }

      return {
        ...st,
        seatNumber: fixedSeatNumber,
        isUser: false,
      };
    });
  }, [session.students, rtcPeers, rtcAssignedSeat, currentUser, isFaculty, isListeningMic, rtcIsSpeakingLive, rtcIsMicMuted, isCameraOn, autoSimulatePeers]);

  const latestSpeakerTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
  const activeStudentUser = !isFaculty ? activeDisplayStudents.find((s) => s.isUser) : null;
  const currentSpeakerStudent = activeDisplayStudents.find((s) => s.id === session.currentSpeakerId) ||
    (isListeningMic && !isFaculty ? activeStudentUser : null) ||
    activeDisplayStudents.find((s) => s.id === latestSpeakerTranscript?.speakerId) ||
    activeDisplayStudents.find((s) => s.isSpeaking) ||
    activeStudentUser ||
    activeDisplayStudents[0];
  const isSpeakingLive = !!(session.currentSpeakerId || (isListeningMic && !isFaculty) || activeDisplayStudents.some((s) => s.isSpeaking));
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const studentTurnsSinceIntervention = useRef<number>(0);
  const aiVoicePausedMicRef = useRef(false);
  const aiVoiceResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI voices are played through the user's speakers. Web Speech Recognition can
  // still hear that speaker output even when WebRTC echo cancellation is enabled.
  // Temporarily stop recognition and the outgoing mic track while AI is speaking,
  // then resume the user's mic automatically after a short acoustic settle time.
  useEffect(() => {
    const handleAiVoiceStart = () => {
      if (!isListeningMicRef.current) return;
      aiVoicePausedMicRef.current = true;
      if (speechPauseTimerRef.current) {
        clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
      }
      if (aiVoiceResumeTimerRef.current) {
        clearTimeout(aiVoiceResumeTimerRef.current);
        aiVoiceResumeTimerRef.current = null;
      }
      try {
        recognitionRef.current?.stop();
      } catch {}
      rtcSetMicEnabled(false);
    };

    const handleAiVoiceEnd = () => {
      if (!aiVoicePausedMicRef.current) return;
      aiVoiceResumeTimerRef.current = setTimeout(() => {
        aiVoiceResumeTimerRef.current = null;
        if (!isListeningMicRef.current) {
          aiVoicePausedMicRef.current = false;
          return;
        }
        aiVoicePausedMicRef.current = false;
        try {
          recognitionRef.current?.start();
        } catch {}
        rtcSetMicEnabled(true);
      }, 500);
    };

    window.addEventListener('erus-ai-voice-start', handleAiVoiceStart);
    window.addEventListener('erus-ai-voice-end', handleAiVoiceEnd);
    return () => {
      window.removeEventListener('erus-ai-voice-start', handleAiVoiceStart);
      window.removeEventListener('erus-ai-voice-end', handleAiVoiceEnd);
      if (aiVoiceResumeTimerRef.current) clearTimeout(aiVoiceResumeTimerRef.current);
    };
  }, [rtcSetMicEnabled]);

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

    const textToCommit = (forcedText || liveTranscriptRef.current || liveSpeechTranscript).trim();
    if (!textToCommit) return;

    // Reset live buffers
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');

    // Broadcast directly to room transcript & peers
    if (handleSendUserStatementRef.current) {
      handleSendUserStatementRef.current(textToCommit);
    }
  };

  // Speech Recognition Setup (Web Speech API)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; // Indian English support

        recognition.onresult = (event: any) => {
          if (aiVoicePausedMicRef.current) return;

          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalTranscript += piece;
            } else {
              interimTranscript += piece;
            }
          }

          if (finalTranscript) {
            liveTranscriptRef.current = (liveTranscriptRef.current + ' ' + finalTranscript).trim();
          }
          const currentSpoken = (liveTranscriptRef.current + ' ' + interimTranscript).trim();
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

          // Natural pause detection: auto-broadcast to room after 1.8s silence
          if (currentSpoken.length > 3) {
            speechPauseTimerRef.current = setTimeout(() => {
              commitLiveSpeechToRoom(currentSpoken);
            }, 1800);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'no-speech') {
            return;
          }
          setIsListeningMic(false);
          isListeningMicRef.current = false;
          stopAudioAnalyser();
          rtcSetMicEnabled(false);
          if (!isFaculty) {
            setSession((prev) => ({
              ...prev,
              students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
            }));
          }
        };

        recognition.onend = () => {
          // If mic is supposed to remain on (user didn't mute), restart recognition like Google Meet
          if (isListeningMicRef.current && !aiVoicePausedMicRef.current) {
            try {
              recognition.start();
              return;
            } catch {
              // ignore
            }
          }
          setIsListeningMic(false);
          isListeningMicRef.current = false;
          stopAudioAnalyser();
          rtcSetMicEnabled(false);
          if (!isFaculty) {
            setSession((prev) => ({
              ...prev,
              students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
            }));
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [isFaculty, stopAudioAnalyser, rtcSetMicEnabled]);

  const toggleMicRecognition = () => {
    if (!isSessionActive && !isFaculty) {
      alert('The session is currently waiting for Faculty In-Charge to commence. Microphones are muted.');
      return;
    }

    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. You can click Quick Speaking Points to speak directly.');
      return;
    }

    if (isListeningMic) {
      // User muting: auto-commit any pending speech immediately so words are not lost
      if (speechPauseTimerRef.current) {
        clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
      }
      const pendingSpeech = (liveTranscriptRef.current || liveSpeechTranscript).trim();
      if (pendingSpeech) {
        commitLiveSpeechToRoom(pendingSpeech);
      }

      isListeningMicRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Recognition stop error:', e);
      }
      setIsListeningMic(false);
      stopAudioAnalyser();
      rtcSetMicEnabled(false);
      if (!isFaculty) {
        setSession((prev) => ({
          ...prev,
          students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
        }));
      }
    } else {
      try {
        liveTranscriptRef.current = '';
        setLiveSpeechTranscript('');
        isListeningMicRef.current = true;
        recognitionRef.current.start();
        setIsListeningMic(true);
        startAudioAnalyser();
        rtcSetMicEnabled(true);
        if (!isFaculty) {
          setSession((prev) => ({
            ...prev,
            students: prev.students.map((s) => (s.isUser ? { ...s, micActive: true } : s)),
          }));
        }
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    }
  };

  // Trigger Facilitator speech and vocalize
  const speakFacilitator = (
    text: string, 
    actionType: string = 'probing_question', 
    phase?: GDFacilitatorPhase,
    onSpeechEnd?: () => void
  ) => {
    setIsAiProcessing(true);
    setSession((prev) => ({
      ...prev,
      facilitatorSpeech: text,
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
      text,
      type: phase === 'intro' ? 'intro' : phase === 'conclusion' ? 'conclusion' : 'moderation',
      sentiment: 'positive',
    };

    setTranscripts((prev) => [...prev, entry]);

    facilitatorVoice.speak(text, () => {
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
    if (!isSessionActive && !isFaculty) return;
    const text = (textToSend || liveSpeechTranscript).trim();
    if (!text) return;

    // Reset live buffers
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');

    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    // If Faculty is observing and intervenes or broadcasts guidance
    if (isFaculty) {
      const facultyName = currentUser?.name || 'Dr. Sunita Rao';
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

    const userStudent = session.students.find((s) => s.isUser) || session.students[0];

    // Check if another speaker was currently active (interruption detection)
    if (session.currentSpeakerId && session.currentSpeakerId !== userStudent.id) {
      const interruptedStudent = session.students.find((s) => s.id === session.currentSpeakerId);
      setInterruptionWarning(`Interruption detected: ${userStudent.name} spoke while ${interruptedStudent?.name || 'peer'} was presenting.`);
      setTimeout(() => setInterruptionWarning(null), 5000);
    }

    const newEntry: TranscriptEntry = {
      id: `t-user-${Date.now()}`,
      sessionId: session.id,
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

    // If triggered without live mic (e.g. Quick Speaking Point clicked), vocalize in authentic Indian English so it is audible to everyone in the room
    if (!isListeningMic && !isFaculty) {
      roomVoice.speakAsStudent(userStudent, text);
    }

    // Update user stats in state
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
              speakingDurationSeconds: s.speakingDurationSeconds + Math.max(15, Math.round(text.length / 8)),
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

    // Auto-yield speech after a short delay to simulate presentation completion
    setTimeout(() => {
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: null,
        students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
      }));

      // If auto simulate is enabled, automatically shift to the person who didn't speak yet!
      if (autoSimulatePeers) {
        executeNextTurn(userStudent.id);
      }
    }, 4000);
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

  // If no one speaks initially, AI Facilitator calls upon a student referencing their previous presentation
  const handleInitiateOpeningSpeaker = () => {
    if (rtcSimulationMode) return;
    if (!isSessionActive || hasRealStudentPeers || hasInitiatedOpeningRef.current || session.isFacilitatorSpeaking || session.currentSpeakerId) return;

    const studentTranscripts = transcripts.filter((t) => !t.isFacilitator);
    if (studentTranscripts.length > 0) {
      hasInitiatedOpeningRef.current = true;
      return;
    }

    hasInitiatedOpeningRef.current = true;

    // Select candidate to initiate (Seat 1 or first available student)
    const openingCandidate = session.students.find((s) => !s.isEmptySeat) || session.students[0];
    if (!openingCandidate) return;

    const initiationPrompt = generateInitiationPrompt(openingCandidate, session.topic);

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
    if (!isSessionActive || hasRealStudentPeers || session.isFacilitatorSpeaking || session.currentSpeakerId || isTransitioningTurnRef.current) return;
    if (Date.now() - lastFacilitatorInterventionTimeRef.current < 12000) return;

    lastFacilitatorInterventionTimeRef.current = Date.now();

    // Prioritize student who hasn't spoken yet, or lowest turn count
    const targetStudent = getNextTurnSpeaker(session.students, null) || session.students[0];
    if (!targetStudent) return;

    const latestStudentTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
    const targetedQuestion = generateTargetedQuestionForStudent(targetStudent, session.topic, latestStudentTranscript);

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

  // Silence Watchdog: triggers opening initiation (8s silence) or targeted question mentioning name (10s mid-discussion silence)
  useEffect(() => {
    if (rtcSimulationMode) return;
    if (!isSessionActive) return;

    const studentTranscripts = transcripts.filter((t) => !t.isFacilitator);

    // 1. Opening silence (if no one speaks within 8 seconds of commencing)
    if (studentTranscripts.length === 0 && !hasInitiatedOpeningRef.current) {
      if (session.silenceTimerSeconds >= 8 || elapsedSeconds >= 8) {
        handleInitiateOpeningSpeaker();
        return;
      }
    }

    // 2. Mid-discussion silence (if floor is silent for 10 seconds, ask question mentioning student by name)
    if (studentTranscripts.length > 0 && !session.currentSpeakerId && !session.isFacilitatorSpeaking && !isTransitioningTurnRef.current) {
      if (session.silenceTimerSeconds >= 10) {
        handleFacilitatorTargetedProbe();
        return;
      }
    }
  }, [
    isSessionActive,
    session.silenceTimerSeconds,
    elapsedSeconds,
    session.currentSpeakerId,
    session.isFacilitatorSpeaking,
    transcripts.length,
    rtcSimulationMode,
  ]);

  // Reset initiation flag when a session is freshly started or restarted
  useEffect(() => {
    if (session.status === 'active') {
      const studentTranscripts = transcripts.filter((t) => !t.isFacilitator);
      if (studentTranscripts.length === 0) {
        hasInitiatedOpeningRef.current = false;
      }
    } else {
      hasInitiatedOpeningRef.current = false;
      setInvitedStudentPrompt(null);
    }
  }, [session.status, session.startedAt]);

  const handleRaiseHandToggle = () => {
    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
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
                <span>Faculty: <strong>{session?.assignedFacultyName || 'Dr. Sunita Rao'}</strong></span>
              </span>
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

                <div className="flex items-center gap-2">
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
                    rtcSilenceTimer >= 15
                      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 animate-bounce'
                      : rtcSilenceTimer >= 10
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">20s Silence Deadlock Watchdog</span>
                      <span className={`font-mono text-xs font-bold px-1.5 py-0.2 rounded ${
                        rtcSilenceTimer >= 15
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {rtcSilenceTimer > 0 ? `${rtcSilenceTimer}s / 20s` : '0s / 20s (Floor Active)'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {rtcSilenceTimer >= 15
                        ? '⚠️ Floor silent! AI Facilitator will interrupt in ' + (20 - rtcSilenceTimer) + 's to ask a probing question.'
                        : 'AI Facilitator autonomously interrupts if no participant speaks for 20 seconds.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-[200px] sm:max-w-xs ml-auto">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        rtcSilenceTimer >= 15 
                          ? 'bg-rose-500 animate-pulse' 
                          : rtcSilenceTimer >= 10 
                          ? 'bg-amber-500' 
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (rtcSilenceTimer / 20) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 font-semibold w-8 text-right">
                    {20 - rtcSilenceTimer}s
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Quick Facilitator Action Bar (Visible only to Faculty Evaluators & Admins) */}
          {canStartSession && (
            <div className="flex items-center gap-2 flex-wrap">
              {session.status === 'waiting' && (
                <button
                  id="start-gd-btn"
                  onClick={() => {
                    if (onStartSession) {
                      onStartSession(session.id);
                    }
                    rtcStartSession();
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
                onClick={() => requestAiIntervention('probing')}
                disabled={!isSessionActive || isAiProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 transition-all shadow-xs active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>AI Probing Question</span>
              </button>

              <button
                id="ai-rules-btn"
                onClick={() => speakFacilitator("Discussion Rules: 1. Speak one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us maintain balanced dialogue.", 'explain_rules', 'rules')}
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
                  onClick={onFinishSession}
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
                        Round Table Conference ({session.students.length} Participants)
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-2 max-w-md">
                        {session.topic}
                      </p>
                      
                      {/* Live Turn & Flow indicator */}
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
                        <Radio className="w-3 h-3 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                        <span>
                          {session.currentSpeakerId 
                            ? `Floor: ${session.students.find(s => s.id === session.currentSpeakerId)?.name}` 
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
                    <div className="relative z-20 flex flex-col items-center max-w-md text-center p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 border-2 border-indigo-500/60 dark:border-indigo-400/60 shadow-2xl backdrop-blur-md transition-all duration-300">
                      
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
                      />
                    ))}
                  </div>

                </div>
              </div>
            )}

            {/* 3. CLASSROOM PRESENTATION LAYOUT */}
            {currentLayout === 'classroom' && (
              <div className="relative z-10 my-3 flex-1 flex flex-col items-center justify-center w-full space-y-4">
                
                {/* Front of Classroom: Presentation Board & Podium */}
                <div className="w-full max-w-4xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-2xl p-3 sm:p-4 shadow-xl text-white relative overflow-hidden">
                  
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                  {/* Presentation Header Bar */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-indigo-600/30 text-indigo-400">
                        <Presentation className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 font-bold">
                          Classroom Presentation Stage • Front of Class
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-md sm:max-w-xl">
                          {session.topic}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                        <GraduationCap className="w-3 h-3 text-indigo-400" />
                        {session.students.length} Students Attending
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live Presentation
                      </span>
                    </div>
                  </div>

                  {/* Presenter at the Podium */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 backdrop-blur-sm">
                    
                    {/* Presenter Avatar & Badge */}
                    <div className="relative flex flex-col items-center flex-shrink-0">
                      {isSpeakingLive && (
                        <div className="absolute -inset-2 rounded-2xl bg-indigo-500/30 animate-pulse pointer-events-none" />
                      )}
                      <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl overflow-hidden border-2 border-indigo-400 ring-4 ring-indigo-500/20 shadow-lg relative bg-slate-900">
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
                      <span className="absolute -bottom-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow border border-indigo-300/40 whitespace-nowrap z-20">
                        🎙️ PRESENTER AT PODIUM
                      </span>
                    </div>

                    {/* Presenter Info & Live Speech */}
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-white">
                          {currentSpeakerStudent?.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30 font-semibold">
                          Seat {currentSpeakerStudent?.seatNumber} • {currentSpeakerStudent?.isUser && !isFaculty ? 'You (Speaking)' : 'Presenter'}
                        </span>
                        <span className="text-xs text-slate-400">
                          ({currentSpeakerStudent?.speakingTurns || 0} speaking turns)
                        </span>
                      </div>

                      <div className="mt-2 bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 max-w-2xl">
                        <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-mono font-semibold mb-1">
                          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                          <span>PRESENTER ADDRESSING CLASSROOM:</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200 font-medium italic">
                          "{latestSpeakerTranscript?.text || (currentSpeakerStudent?.isSpeaking ? 'Delivering presentation points to the classroom...' : 'Presenting to the audience and taking questions.')}"
                        </p>
                      </div>
                    </div>

                  </div>

                </div>

                {/* Audience Tiered Desk Rows */}
                <div className="w-full max-w-4xl space-y-3">
                  
                  <div className="flex items-center justify-between px-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="uppercase tracking-wider font-bold text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Classroom Audience (Facing Presenter)
                    </span>
                    <span className="text-[11px] font-mono">
                      Tiered Seating • 3 Desk Rows
                    </span>
                  </div>

                  {/* Row 1 (Front Row): Seats 1 to 5 */}
                  <div className="bg-slate-100/90 dark:bg-slate-850/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span>Row 1 • Front Row Desks</span>
                      <span>Seats 1 – 5</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {activeDisplayStudents.slice(0, 5).map((student) => (
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
                      {activeDisplayStudents.slice(5, 10).map((student) => (
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
                      Faculty Observer: {currentUser?.name || 'Dr. Sunita Rao'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] border border-emerald-500/20 flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Observer & Evaluation Mode
                    </span>
                    <span className="hidden sm:inline-block text-[11px] font-mono text-slate-500">
                      • {session.students.length} Student Participants
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={autoSimulatePeers} 
                        onChange={(e) => setAutoSimulatePeers(e.target.checked)}
                        className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0"
                      />
                      <span>Auto-Simulate Student Turns</span>
                    </label>
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
                      
                      <div className="flex items-center gap-3">
                        <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={autoSimulatePeers} 
                            onChange={(e) => setAutoSimulatePeers(e.target.checked)}
                            className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0"
                          />
                          <span>Auto-Simulate Peer Replies</span>
                        </label>
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
                  
                  {/* 1. Microphone Toggle */}
                  <button
                    id="mic-speak-btn"
                    onClick={toggleMicRecognition}
                    disabled={!isSessionActive && !isFaculty}
                    className={`relative p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center ${
                      !isSessionActive && !isFaculty
                        ? 'bg-slate-800/60 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                        : isListeningMic
                        ? 'bg-red-600 hover:bg-red-700 text-white ring-4 ring-red-500/40 animate-pulse cursor-pointer'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer'
                    }`}
                    title={
                      !isSessionActive && !isFaculty
                        ? 'Microphone locked. Waiting for Faculty In-Charge to commence session.'
                        : isFaculty
                        ? (isListeningMic ? 'Stop Speaking (Moderator Mic Live)' : 'Push to Speak as Faculty Moderator')
                        : (isListeningMic ? 'Mute Microphone (Speaking Active)' : 'Unmute Microphone (Push to Speak)')
                    }
                  >
                    {!isSessionActive && !isFaculty ? (
                      <Lock className="w-5 h-5 text-amber-400" />
                    ) : isListeningMic ? (
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
                          if (onStartSession) {
                            onStartSession(session.id);
                          }
                          rtcStartSession();
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
                    onClick={onFinishSession}
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

              {/* Live Voice Broadcast Console (No Send Option - Direct Voice Broadcast) */}
              <div className="w-full">
                {isListeningMic ? (
                  <div className="w-full rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-2 border-emerald-500/80 p-3 sm:p-3.5 shadow-lg shadow-emerald-950/40 transition-all animate-fadeIn">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                          {isFaculty ? 'Faculty Moderator Mic Live' : 'Live Floor Mic • Audible to Everyone'}
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
                    <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl px-3.5 py-2 min-h-[40px] flex items-center">
                      {liveSpeechTranscript ? (
                        <div className="w-full flex items-center justify-between">
                          <p className="text-xs sm:text-sm text-emerald-100 font-medium leading-relaxed">
                            <span className="text-emerald-400 font-semibold mr-1.5">Speaking:</span>
                            "{liveSpeechTranscript}"
                          </p>
                          <span className="text-[10px] text-emerald-400/80 font-mono hidden md:inline ml-2 whitespace-nowrap">
                            (Auto-broadcasting on pause...)
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic flex items-center gap-2">
                          <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          <span>Speak into your microphone — your voice is broadcast live to all participants. Natural pause auto-commits.</span>
                        </p>
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
                          {!isSessionActive && !isFaculty
                            ? `Waiting for Faculty In-Charge ${session.assignedFacultyName ? `(${session.assignedFacultyName}) ` : ''}to start the session. Microphones are muted.`
                            : isFaculty
                            ? 'Unmute microphone to speak live to the room, or click directives below.'
                            : 'Click Unmute to speak live to the room — no typing or send button needed.'}
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

                      {!isSessionActive && !isFaculty ? (
                        <button
                          disabled
                          className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed border border-slate-300 dark:border-slate-700"
                        >
                          <Lock className="w-3.5 h-3.5 text-amber-500" />
                          <span>Muted in Lobby</span>
                        </button>
                      ) : (
                        <button
                          onClick={toggleMicRecognition}
                          className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Unmute & Speak Live</span>
                        </button>
                      )}
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
                  Transcript ({transcripts.length})
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
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {transcripts.map((entry) => (
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
                    <span className="font-mono text-amber-600 dark:text-amber-400">20 Seconds Silence</span>
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

            <LobbyAudioTester />

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
                    {session.students.filter((s) => !s.isEmptySeat).map((st) => (
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
                    disabled={!noteContent.trim()}
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

    </div>
  );
};

// Sub-Component: HTML5 Video Stream Player for Live Webcam Feed
const VideoStreamPlayer: React.FC<{ stream: MediaStream; className?: string }> = ({ stream, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className || "w-full h-full object-cover transform -scale-x-100"}
    />
  );
};

// Sub-Component: Student Video / Camera Frame with Google Meet Badges & Live Webcam Streaming
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
  const isLiveWebcam = isUser && isUserCameraOn && !!videoStream;
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
      ) : isLiveWebcam ? (
        <VideoStreamPlayer stream={videoStream!} className="w-full h-full object-cover transform -scale-x-100" />
      ) : isCameraEnabled ? (
        <img
          src={student.avatar}
          alt={student.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
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
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div className={`flex flex-col items-center group transition-all duration-300 ${
      isCurrentSpeaker ? 'scale-110 z-20' : 'z-10'
    }`}>
      
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
  onAddNote?: (student: Student) => void;
}> = ({
  student,
  isCurrentSpeaker,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
  onAddNote,
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
        student.isEmptySeat
          ? 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
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
            isCurrentSpeaker={isCurrentSpeaker}
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
          {student.isRealPeer && !isUser && (
            <span className="text-[8px] bg-emerald-500 text-white font-bold px-1 rounded">LIVE</span>
          )}
          {student.isEmptySeat && (
            <span className="text-[8px] text-slate-400 font-mono">OPEN</span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          <span>{student.isEmptySeat ? 'Open Desk' : isUser ? 'You' : student.isRealPeer ? 'Peer' : 'Audience'}</span>
          <span>{student.isEmptySeat ? '--' : `${student.speakingTurns}t`}</span>
        </div>
      </div>

      {!student.isEmptySeat && onAddNote && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddNote(student);
          }}
          className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-amber-500 hover:text-amber-600 transition-colors cursor-pointer shrink-0"
          title={`Record live observation note for ${student.name}`}
        >
          <Bookmark className="w-3 h-3 fill-current" />
        </button>
      )}
    </div>
  );
};
