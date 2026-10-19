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
  Download,
  ArrowLeft
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
  onBackToDashboard?: () => void;
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
  onBackToDashboard,
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

  const isFaculty = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin' || currentUser?.role === 'super_admin';
  const isFacultyOrAdmin = isFaculty;
  const canStartSession = isFacultyOrAdmin;
  const isStudent = currentUser?.role === 'student';

  const [liveSpeechTranscript, setLiveSpeechTranscript] = useState('');
  const [typedStatement, setTypedStatement] = useState('');
  const liveTranscriptRef = useRef<string>('');
  const speechPauseTimerRef = useRef<any>(null);
  const isListeningMicRef = useRef<boolean>(!isFaculty);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const restartRecognitionTimerRef = useRef<any>(null);
  const handleSendUserStatementRef = useRef<(textToSend?: string) => Promise<void>>(() => Promise.resolve());
  const notifyFacilitatorSpeechEndedRef = useRef<() => void>(() => {});
  const [isListeningMic, setIsListeningMic] = useState(!isFaculty);
  const [interruptionWarning, setInterruptionWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  // Server-side Socket.IO is now the single source of truth for AI turns.
  // Keeping the legacy local simulator enabled can queue a second voice while
  // a real participant is speaking, so it is disabled for live GDs.
  const [autoSimulatePeers, setAutoSimulatePeers] = useState(false);
  const [invitedStudentPrompt, setInvitedStudentPrompt] = useState<{ student: Student; reason: string; promptText?: string } | null>(null);
  const [currentLayout, setCurrentLayout] = useState<GDRoomLayoutType>(() => {
    return session.roomLayout === 'speaker_center' ? 'speaker_center' : 'round_table';
  });

  const hasInitiatedOpeningRef = useRef<boolean>(false);
  const isTransitioningTurnRef = useRef<boolean>(false);
  const lastFacilitatorInterventionTimeRef = useRef<number>(0);
  const lastFacilitatorInterventionTextRef = useRef<string>('');
  const clientSilenceStageRef = useRef<number>(0);
  const isSessionActive = session.status === 'active' || Boolean(session.startedAt && session.status !== 'completed');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [hasVideoTrackModal, setHasVideoTrackModal] = useState(true);
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

  const [localRoomElapsedSeconds, setLocalRoomElapsedSeconds] = useState(elapsedSeconds || 0);
  useEffect(() => {
    if (!isSessionActive) {
      setLocalRoomElapsedSeconds(0);
      return;
    }
    const updateLocalElapsed = () => {
      if (session.startedAt) {
        setLocalRoomElapsedSeconds(Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)));
      } else {
        setLocalRoomElapsedSeconds((prev) => prev + 1);
      }
    };
    updateLocalElapsed();
    const interval = setInterval(updateLocalElapsed, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, session.startedAt]);

  const effectiveElapsed = Math.max(elapsedSeconds || 0, localRoomElapsedSeconds);

  const formatElapsedClock = (secs: number) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const remainingSecs = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${remainingSecs}`;
  };

  const handleOpenNoteModal = (studentId?: string) => {
    const targetId = studentId || noteTargetStudentId || session?.students?.[0]?.id || '';
    setNoteTargetStudentId(targetId);
    setNoteTimestamp(formatElapsedClock(effectiveElapsed));
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
      timestamp: noteTimestamp || formatElapsedClock(effectiveElapsed),
      timestampSeconds: effectiveElapsed,
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
    const desiredLayout: GDRoomLayoutType = session.roomLayout === 'speaker_center' ? 'speaker_center' : 'round_table';
    if (desiredLayout !== currentLayout) {
      setCurrentLayout(desiredLayout);
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
    const targetLayout: GDRoomLayoutType = newLayout === 'speaker_center' ? 'speaker_center' : 'round_table';
    setCurrentLayout(targetLayout);
    setSession((prev) => ({ ...prev, roomLayout: targetLayout }));
    if (onUpdateLayout) {
      onUpdateLayout(targetLayout);
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
    localAudioStream: rtcLocalAudioStream,
    getLocalAudioStream,
    broadcastTranscript: rtcBroadcastTranscript,
    startSession: rtcStartSession,
    finishSession: rtcFinishSession,
    notifyFacilitatorSpeechEnded: rtcNotifyFacilitatorSpeechEnded,
    requestAiIntervention: rtcRequestAiIntervention,
    broadcastFacilitatorSpeech: rtcBroadcastFacilitatorSpeech,
    notifySpeakingStarted: rtcNotifySpeakingStarted,
    notifySpeakingFinished: rtcNotifySpeakingFinished,
    aiParticipants: rtcAiParticipants,
    simulationMode: rtcSimulationMode,
    isFloorLocked: rtcIsFloorLocked,
    floorSpeakerName: rtcFloorSpeakerName,
    floorSpeakerId: rtcFloorSpeakerId,
    isAudioAutoplayBlocked: rtcIsAudioAutoplayBlocked,
    resumeAudioPlayback: rtcResumeAudioPlayback,
  } = useWebRTCRoom({
    slotId: session.id || session.slotId || 'slot-1',
    topic: session.topic,
    currentUser,
    videoStream,
    isCameraOn,
    onRoomJoined: (roomData) => {
      if (roomData.status === 'active') {
        setSession((prev) => ({
          ...prev,
          status: 'active',
          topic: (prev.topic && prev.topic !== 'Group Discussion' && prev.topic !== 'General Discussion') ? prev.topic : (roomData.topic || prev.topic),
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
    onPeerStatsUpdated: (stats) => {
      setSession((prev) => ({
        ...prev,
        students: prev.students.map((s) => {
          const isMatch = (stats.userId && (s.id === stats.userId || s.id === stats.socketId)) ||
            (stats.socketId && s.id === stats.socketId) ||
            (stats.seatNumber !== undefined && s.seatNumber === stats.seatNumber) ||
            (s.isUser && currentUser && (currentUser.id === stats.userId || (currentUser as any).seatNumber === stats.seatNumber));
          if (!isMatch) return s;
          return {
            ...s,
            speakingTurns: Math.max(s.speakingTurns || 0, stats.speakingTurns ?? s.speakingTurns ?? 0),
            speakingDurationSeconds: Math.max(s.speakingDurationSeconds || 0, stats.speakingDurationSeconds ?? s.speakingDurationSeconds ?? 0),
            interruptionCount: stats.interruptionCount !== undefined ? Math.max(s.interruptionCount || 0, stats.interruptionCount) : s.interruptionCount,
          };
        }),
      }));
    },
    onSessionEnded: () => {
      // Synchronized GD termination: faculty has completed the GD, so student view automatically finishes & evaluates
      if (gdRecorderRef.current?.isRecording) {
        gdRecorderRef.current.stopAndUploadRecording(session.id || session.slotId || 'slot-1').catch(() => {});
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

      const estimatedSecs = Math.max(6, Math.round(String(newTx.text || '').split(/\s+/).filter(Boolean).length / 2.1));

      // Update human speaker stats across session.students matching by ID, seat number, or candidate name
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: newTx.speakerId,
        silenceTimerSeconds: 0,
        students: prev.students.map((s) => {
          const isMatch = s.id === newTx.speakerId ||
            s.seatNumber === newTx.seatNumber ||
            (s.name && newTx.speakerName && s.name.toLowerCase() === newTx.speakerName.toLowerCase());
          return isMatch
            ? {
                ...s,
                speakingTurns: (s.speakingTurns || 0) + 1,
                speakingDurationSeconds: (s.speakingDurationSeconds || 0) + estimatedSecs,
                lastSpokeAt: Date.now(),
              }
            : s;
        }),
      }));

      // Real human peers speak with their authentic voices over WebRTC audio mesh.
      // We must NEVER run TTS (roomVoice.speakAsStudent) on transcripts from real human peers,
      // as that causes the AI synthesizer to repeat what the other person just spoke!
      // AI participant speech is handled separately by onAiParticipantSpeech.
    },
    onAiParticipantSpeech: () => {
      // In ERUS live GD & presentation modes, all participants are real human candidates. Synthetic AI bots are disabled.
      return;
    },

    onFacilitatorIntervention: (intervention) => {
      hasInitiatedOpeningRef.current = true;
      setLocalSilenceSeconds(0);
      const intText = String(intervention?.text || '').trim();
      if (!intText) return;

      // If this is an interruption warning, display the prominent warning banner only if multiple participants exist
      if (intervention.action === 'interruption_warning') {
        const activeParticipants = filledStudents.filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && !s.name?.startsWith('Seat '));
        if (activeParticipants.length <= 1) {
          // Solo participant: interruption is physically impossible
          return;
        }
        setInterruptionWarning(intText);
        setTimeout(() => setInterruptionWarning(null), 6500);
      }

      // Suppress duplicate opening welcome: never speak welcome again if client already vocalized it
      const isOpeningAction = intervention.action === 'opening' || intervention.action === 'initiate_opening_speaker';
      const isWelcomePrompt = intText.toLowerCase().includes('welcome participants') || intText.toLowerCase().includes('discussion has now officially commenced');
      if (isOpeningAction || isWelcomePrompt) {
        const hasWelcomeSpoken = transcripts.some((t) => t.isFacilitator && (t.type === 'intro' || String(t.text || '').toLowerCase().includes('welcome')));
        if (hasInitiatedOpeningRef.current || hasWelcomeSpoken) {
          console.log('[Facilitator] Opening welcome already delivered; ignoring duplicate server opening prompt.');
          return;
        }
      }

      // Deduplicate audio playback: never re-vocalize identical prompt within 25 seconds unless it's a direct interruption or silence prompt
      const now = Date.now();
      const normalizePrompt = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const normNew = normalizePrompt(intText);
      const normLast = normalizePrompt(lastFacilitatorInterventionTextRef.current || '');
      const isExemptDeduplication =
        intervention.action === 'interruption_warning' ||
        intervention.action === 'silence_instruction_1' ||
        intervention.action === 'silence_instruction_2' ||
        intervention.action === 'deadlock_intervention' ||
        intervention.action === 'targeted_question_student';

      if (!isExemptDeduplication && normNew === normLast && now - lastFacilitatorInterventionTimeRef.current < 25000) {
        console.log('[Facilitator] Suppressing duplicate vocalization of recently spoken prompt:', intText);
        return;
      }
      lastFacilitatorInterventionTimeRef.current = now;
      lastFacilitatorInterventionTextRef.current = intText;

      // Update client silence stage to match server intervention
      if (intervention.action === 'silence_instruction_1') {
        clientSilenceStageRef.current = 1;
      } else if (intervention.action === 'silence_instruction_2') {
        clientSilenceStageRef.current = 2;
      } else if (intervention.action === 'deadlock_intervention' || intervention.action === 'targeted_question_student') {
        clientSilenceStageRef.current = 3;
      }

      // Record question in sessionQuestionTracker so local fallback never repeats it
      sessionQuestionTracker.recordQuestion(intText);

      setTranscripts((prev) => {
        if (prev.some((t) => t.id === intervention?.transcript?.id || (t.isFacilitator && String(t.text || '').trim() === intText))) return prev;
        const entryToAppend = intervention?.transcript || {
          id: `t-facilitator-${Date.now()}`,
          sessionId: session?.id || '',
          speakerId: 'ai-facilitator',
          speakerName: 'AI Facilitator (ERUS)',
          seatNumber: null,
          isFacilitator: true,
          timestamp: formatElapsedClock(elapsedSeconds),
          timestampSeconds: elapsedSeconds,
          text: intText,
          type: 'intervention',
          sentiment: 'neutral',
        };
        return [...prev, entryToAppend];
      });

      const isSilenceInstruction =
        intervention.action === 'silence_instruction_1' ||
        intervention.action === 'silence_instruction_2';

      setSession((prev) => ({
        ...prev,
        silenceTimerSeconds: isSilenceInstruction ? prev.silenceTimerSeconds : 0,
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

      // Audibly speak AI intervention using roomVoice with guaranteed state cleanup
      if (!voiceMuted && !isRoomAudioMuted) {
        roomVoice.unlock();
        const estSecs = Math.max(8, Math.ceil(intervention.text.split(/\s+/).length * 0.9 + 4));
        const safetyTimeout = setTimeout(() => {
          setSession((prev) => ({
            ...prev,
            isFacilitatorSpeaking: false,
            silenceTimerSeconds: isSilenceInstruction ? prev.silenceTimerSeconds : 0,
          }));
          notifyFacilitatorSpeechEndedRef.current();
        }, estSecs * 1000);

        roomVoice.speakAsFacilitator(intervention.text, () => {
          clearTimeout(safetyTimeout);
          lastFacilitatorInterventionTimeRef.current = Date.now();
          if (!isSilenceInstruction) {
            setLocalSilenceSeconds(0);
          }
          setSession((prev) => ({
            ...prev,
            isFacilitatorSpeaking: false,
            silenceTimerSeconds: isSilenceInstruction ? prev.silenceTimerSeconds : 0,
          }));
          notifyFacilitatorSpeechEndedRef.current();
        });
      } else {
        setTimeout(() => {
          setSession((prev) => ({
            ...prev,
            isFacilitatorSpeaking: false,
            silenceTimerSeconds: isSilenceInstruction ? prev.silenceTimerSeconds : 0,
          }));
          notifyFacilitatorSpeechEndedRef.current();
        }, 1500);
      }
    },
  });
  notifyFacilitatorSpeechEndedRef.current = rtcNotifyFacilitatorSpeechEnded;
  const rtcNotifySpeakingStartedRef = useRef(rtcNotifySpeakingStarted);
  rtcNotifySpeakingStartedRef.current = rtcNotifySpeakingStarted;

  // Synchronized GD termination watch: if session status changes to 'completed', upload recording first then finish GD
  useEffect(() => {
    if (session.status === 'completed' && currentUser?.role === 'student') {
      let cancelled = false;
      const finishWithRecording = async () => {
        if (gdRecorderRef.current?.isRecording) {
          try {
            await gdRecorderRef.current.stopAndUploadRecording(session.id || session.slotId || 'slot-1');
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
  }, [session.status, currentUser?.role, onFinishSession, session.id, session.slotId]);

  // Synchronize live WebRTC floor speaker into session state so all clients immediately zoom the speaker seat
  useEffect(() => {
    if (rtcFloorSpeakerId !== undefined && rtcFloorSpeakerId !== session.currentSpeakerId) {
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: rtcFloorSpeakerId,
      }));
    }
  }, [rtcFloorSpeakerId, session.currentSpeakerId, setSession]);

  // Continuous local silence stopwatch fallback to ensure 3s triggers even during socket network lag
  const [localSilenceSeconds, setLocalSilenceSeconds] = useState(0);

  // Authoritative microphone volume level derived from active WebRTC stream
  const audioLevel = rtcLocalVolume > 0 ? rtcLocalVolume : userMediaAudioLevel;

  // Stable refs for real-time sensor updates to prevent interval teardown on every audio frame
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;
  const rtcIsSpeakingLiveRef = useRef(rtcIsSpeakingLive);
  rtcIsSpeakingLiveRef.current = rtcIsSpeakingLive;
  const rtcIsMicMutedRef = useRef(rtcIsMicMuted);
  rtcIsMicMutedRef.current = rtcIsMicMuted;
  const liveSpeechTranscriptRef = useRef(liveSpeechTranscript);
  liveSpeechTranscriptRef.current = liveSpeechTranscript;
  const rtcPeersRef = useRef(rtcPeers);
  rtcPeersRef.current = rtcPeers;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!isSessionActive) {
      setLocalSilenceSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const curTranscript = liveSpeechTranscriptRef.current;
      const curSpeakingLive = rtcIsSpeakingLiveRef.current;
      const curSession = sessionRef.current;

      // Check if AI facilitator or peer voice is playing or recently finished (acoustic buffer)
      const isAiActive = roomVoice.isSpeakingOrRecentlyFinished(2200) ||
                         Boolean(curSession.isFacilitatorSpeaking) ||
                         Boolean((window as any).__erusIsAiSpeaking) ||
                         (Date.now() - ((window as any).__erusLastAiSpeechTime || 0) < 2200);

      // Crucial: Only consider talking if recognized words are actively being uttered
      // Ambient microphone noise, fan, or breath MUST NOT reset silence!
      // AND acoustic feedback from AI voice must NEVER be considered user talking!
      const hasSpokenWords = Boolean(curTranscript && curTranscript.trim().length > 0);
      const isUserTalking =
        !rtcIsMicMutedRef.current &&
        isListeningMicRef.current &&
        !isAiActive &&
        (curSpeakingLive || hasSpokenWords);

      if (isUserTalking) {
        setLocalSilenceSeconds(0);
        clientSilenceStageRef.current = 0;
      } else if (isAiActive) {
        // AI Facilitator or Peer is actively speaking -> pause silence stopwatch, do not reset!
        return;
      } else {
        // Microphones remain open, but no candidate is uttering points -> silence ticks!
        setLocalSilenceSeconds((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive]);

  // Synchronize silenceTimerSeconds from RTC hook and local stopwatch to session state
  useEffect(() => {
    setSession((prev) => {
      const merged = Math.max(rtcSilenceTimer, localSilenceSeconds);
      if (prev.silenceTimerSeconds === merged) return prev;
      return { ...prev, silenceTimerSeconds: merged };
    });
  }, [rtcSilenceTimer, localSilenceSeconds]);

  // Active speaker visual state monitor (turns and duration update on substantive speech transcripts)
  useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(() => {
      const curTranscript = liveSpeechTranscriptRef.current;
      const curSpeakingLive = rtcIsSpeakingLiveRef.current;
      const curPeers = rtcPeersRef.current;

      const isUserSpeaking =
        !isFaculty &&
        !rtcIsMicMutedRef.current &&
        isListeningMicRef.current &&
        (curSpeakingLive || Boolean(curTranscript && curTranscript.trim().length > 1));

      setSession((prev) => {
        let hasChanges = false;
        const updated = (prev.students || []).map((s) => {
          const isThisUserSpeaking = s.isUser && isUserSpeaking;
          const matchingPeer = curPeers.find((p) => p.userId === s.id || p.socketId === s.id || p.seatNumber === s.seatNumber);
          const isRemotePeerSpeaking = Boolean(matchingPeer?.isSpeaking);
          const isAiSpeaking = Boolean(s.isDemoAI && s.isSpeaking);

          const isCurrentlySpeaking = isThisUserSpeaking || isRemotePeerSpeaking || isAiSpeaking;

          if (s.isSpeaking !== isCurrentlySpeaking) {
            hasChanges = true;
            return {
              ...s,
              isSpeaking: isCurrentlySpeaking,
              speakingDurationSeconds: isAiSpeaking ? (s.speakingDurationSeconds || 0) + 1 : s.speakingDurationSeconds,
            };
          } else if (isAiSpeaking) {
            hasChanges = true;
            return {
              ...s,
              speakingDurationSeconds: (s.speakingDurationSeconds || 0) + 1,
            };
          }
          return s;
        });
        return hasChanges ? { ...prev, students: updated } : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, isFaculty]);

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
          micActive: !isFaculty,
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
        isSpeaking: !rtcIsMicMuted && (rtcIsSpeakingLive || Boolean(liveSpeechTranscript)),
        micActive: !rtcIsMicMuted && isListeningMic,
        cameraActive: isCameraOn,
        speakingTurns: sessionUserStudent?.speakingTurns || 0,
        speakingDurationSeconds: sessionUserStudent?.speakingDurationSeconds || 0,
        videoStream: videoStream,
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
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
      let remoteStream = rtcPeerStreams.get(peer.socketId) || (peer.userId ? rtcPeerStreams.get(peer.userId) : null) || null;
      if (!remoteStream) {
        for (const [key, stream] of rtcPeerStreams.entries()) {
          if (key === peer.socketId || (peer.userId && (key === peer.userId || key.includes(peer.userId) || peer.userId.includes(key)))) {
            remoteStream = stream;
            break;
          }
        }
      }
      if (!remoteStream && rtcPeerStreams.size > 0) {
        if (validStudentPeers.length === 1 && rtcPeerStreams.size === 1) {
          remoteStream = Array.from(rtcPeerStreams.values())[0];
        } else {
          const pIndex = validStudentPeers.indexOf(peer);
          const allStreams = Array.from(rtcPeerStreams.values());
          if (pIndex >= 0 && pIndex < allStreams.length) {
            remoteStream = allStreams[pIndex];
          }
        }
      }
      const hasActiveRemoteVideo = Boolean(
        remoteStream &&
        remoteStream.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled)
      );
      const matchingSessionStudent = session.students.find(
        (s) =>
          s.id === peer.userId ||
          s.id === peer.socketId ||
          s.seatNumber === desiredSeat ||
          (s.name && peer.name && s.name.toLowerCase() === peer.name.toLowerCase())
      );
      const effectiveTurns = Math.max(peer.speakingTurns || 0, matchingSessionStudent?.speakingTurns || 0);
      const effectiveDuration = Math.max(peer.speakingDurationSeconds || 0, matchingSessionStudent?.speakingDurationSeconds || 0);

      seatMap.set(desiredSeat, {
        id: peer.userId || peer.socketId,
        socketId: peer.socketId,
        userId: peer.userId,
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
        cameraActive: Boolean(peer.cameraActive || hasActiveRemoteVideo),
        speakingTurns: effectiveTurns,
        speakingDurationSeconds: effectiveDuration,
        volumeLevel: peer.volumeLevel || 0,
        videoStream: remoteStream,
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      });
    });

    // 4. In ERUS, all discussion participants are real human candidates. No synthetic AI bots.
    const sourceAiList: any[] = [];

    sourceAiList.forEach((participant: any) => {
      if (!participant?.id) return;
      const alreadyPlaced = Array.from(seatMap.values()).some((p) => p.id === participant.id || p.name === participant.name);
      if (alreadyPlaced) return;

      let targetSeat = Number(participant.seatNumber);
      if (!targetSeat || isNaN(targetSeat) || targetSeat < 1 || targetSeat > capacity || usedSeats.has(targetSeat)) {
        targetSeat = 1;
        while (targetSeat <= capacity && usedSeats.has(targetSeat)) targetSeat++;
      }
      if (targetSeat > capacity) return;
      usedSeats.add(targetSeat);
      seatMap.set(targetSeat, {
        id: String(participant.id),
        name: String(participant.name || `Participant ${targetSeat}`),
        seatNumber: targetSeat,
        college: String(participant.college || 'Campus Participant'),
        course: 'Group Discussion',
        batch: '2024-2028',
        avatar: String(participant.avatar || ''),
        isUser: false,
        isRealPeer: false,
        isDemoAI: false,
        isEmptySeat: false,
        isSpeaking: session.currentSpeakerId === participant.id,
        micActive: false,
        cameraActive: false,
        speakingTurns: Number(participant.speakingTurns || 0),
        speakingDurationSeconds: Number(participant.speakingDurationSeconds || 0),
        hasRaisedHand: false,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      });
    });

    // 5. Also keep any persistent students from session.students who aren't already placed
    const existingEnrolled = Array.isArray(session.students) ? session.students : [];
    existingEnrolled.forEach((st) => {
      if (
        !st ||
        st.isEmptySeat ||
        st.isUser ||
        st.isDemoAI ||
        st.id?.startsWith('ai-') ||
        st.name?.toLowerCase().includes('ai participant') ||
        st.college?.toLowerCase().includes('ai participant') ||
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
      const matchingPeer = validStudentPeers.find(
        (p) => p.userId === st.id || p.socketId === st.id || (p.name && st.name && p.name.toLowerCase() === st.name.toLowerCase())
      );
      let matchingStream = matchingPeer
        ? (rtcPeerStreams.get(matchingPeer.socketId) || (matchingPeer.userId ? rtcPeerStreams.get(matchingPeer.userId) : null))
        : (rtcPeerStreams.get(st.id) || null);
      if (!matchingStream && rtcPeerStreams.size > 0) {
        if (validStudentPeers.length <= 1 && rtcPeerStreams.size === 1) {
          matchingStream = Array.from(rtcPeerStreams.values())[0];
        }
      }
      const hasActiveVideo = Boolean(matchingStream && matchingStream.getVideoTracks().some((t) => t.readyState !== 'ended'));

      if (targetSeat && !usedSeats.has(targetSeat) && targetSeat <= capacity) {
        usedSeats.add(targetSeat);
        seatMap.set(targetSeat, {
          ...st,
          seatNumber: targetSeat,
          isUser: false,
          isEmptySeat: false,
          isRealPeer: Boolean(matchingPeer),
          socketId: matchingPeer?.socketId || st.socketId,
          videoStream: matchingStream || st.videoStream || null,
          cameraActive: Boolean(matchingPeer?.cameraActive || hasActiveVideo || st.cameraActive),
          isSpeaking: Boolean(matchingPeer?.isSpeaking || (st.id === session.currentSpeakerId)),
          micActive: Boolean(matchingPeer?.micActive || st.micActive),
        });
      }
    });

    // Only return actual filled participants (never generate empty placeholder desks)
    return Array.from(seatMap.values())
      .filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && s.college !== 'Available Desk' && !s.name?.startsWith('Seat '))
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
  }, [
    session.students,
    session.maxCapacity,
    session.currentSpeakerId,
    rtcAiParticipants,
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

  // Only filled seats: strictly identical to activeDisplayStudents
  const filledStudents = activeDisplayStudents;
  const activeStudentUser = !isFaculty ? activeDisplayStudents.find((s) => s.isUser) : null;
  const isUserSpeakingLive = !isFaculty && !rtcIsMicMuted && isListeningMic && (rtcIsSpeakingLive || Boolean(liveSpeechTranscript));

  // Fixed, Deterministic Round Table Seating (Zero Flickering / No Seat Teleportation)
  const roundTablePositionedStudents = useMemo(() => {
    const students = filledStudents;
    const n = students.length;
    if (n === 0) return [];

    // Anchor user at bottom-center (angle = Math.PI / 2), with all other participants
    // distributed deterministically around the circle by their seat order.
    // Seats NEVER rotate, fly, or swap positions when people speak, preventing
    // DOM thrashing, page flickering, and unclickable buttons.
    const userIdx = students.findIndex((s) => s.isUser);
    const baseOffset = userIdx >= 0 ? userIdx : 0;

    return students.map((student, idx) => {
      const relativeIdx = (idx - baseOffset + n) % n;
      const angle = Math.PI / 2 + (relativeIdx * 2 * Math.PI) / n;
      const isSpk = Boolean(
        student.isSpeaking ||
        (student.isUser && isUserSpeakingLive) ||
        (session.currentSpeakerId && (student.id === session.currentSpeakerId || student.userId === session.currentSpeakerId || student.socketId === session.currentSpeakerId)) ||
        (rtcFloorSpeakerId && (student.id === rtcFloorSpeakerId || student.userId === rtcFloorSpeakerId || student.socketId === rtcFloorSpeakerId || (student.seatNumber !== undefined && String(student.seatNumber) === String(rtcFloorSpeakerId))))
      );
      return {
        student,
        angle,
        zoomLevel: isSpk ? ('zoomed' as const) : ('normal' as const),
      };
    });
  }, [filledStudents, session.currentSpeakerId, rtcFloorSpeakerId, isUserSpeakingLive]);

  const [isFinalizingRecording, setIsFinalizingRecording] = useState(false);

  const latestSpeakerTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);

  // Automated Live Discussion Multi-Stream Video/Audio Recorder
  // Runs on Faculty/Admin or active Student client so EVERY GD is recorded reliably
  const isRecordingClient = useMemo(() => {
    return true;
  }, []);

  const gdRecorder = useGDRecorder({
    slotId: session.id || session.slotId || 'slot-1',
    isSessionActive: Boolean(isSessionActive),
    localStream: videoStream,
    localAudioStream: rtcLocalAudioStream || (getLocalAudioStream ? getLocalAudioStream() : null) || audioStream,
    peerStreams: rtcPeerStreams,
    recordVideo: true,
    enabled: isRecordingClient,
    topicTitle: session.topic || (session as any).topicTitle || 'Group Discussion',
    participantTiles: filledStudents.map((st) => ({
      id: st.id,
      socketId: st.socketId,
      userId: st.userId,
      name: st.name,
      college: st.college,
      seatNumber: st.seatNumber,
      isSpeaking: st.isSpeaking || (st.id === session.currentSpeakerId),
      cameraActive: st.isUser ? isCameraOn : (st.cameraActive ?? true),
      isUser: st.isUser,
      videoStream: st.isUser ? (videoStream || st.videoStream) : st.videoStream,
      avatar: (st.avatar || (st.name ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(st.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf` : '')).replace(/\/lorelei\//g, '/avataaars/'),
      turns: st.speakingTurns ?? (st as any).turns ?? 0,
      secondsSpoken: st.speakingDurationSeconds ?? (st as any).secondsSpoken ?? 0,
      isMuted: st.isUser ? (rtcIsMicMuted || !isListeningMic) : (st.isMuted ?? false),
    })),
    currentSpeakerId: session.currentSpeakerId,
    currentSpeakerName: filledStudents.find((s) => s.id === session.currentSpeakerId)?.name || (session.isFacilitatorSpeaking ? 'AI Facilitator' : null),
    latestTranscriptText: latestSpeakerTranscript?.text || (transcripts[transcripts.length - 1]?.text ?? null),
    layoutMode: currentLayout === 'round_table' ? 'round_table' : 'grid',
    autoStartOnActive: true,
  });
  gdRecorderRef.current = gdRecorder;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__erusStopAndUploadRecording = () =>
        gdRecorderRef.current?.stopAndUploadRecording(session.id || session.slotId || 'slot-1');
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__erusStopAndUploadRecording;
      }
    };
  }, [session.id, session.slotId]);

  // Conclude or leave GD discussion with automatic video recording preservation
  const handleConcludeOrLeaveSession = useCallback(async () => {
    // Commit any in-flight student speech before unmounting
    const pendingSpeech = String(liveTranscriptRef.current || liveSpeechTranscript || '').trim();
    if (pendingSpeech) {
      commitLiveSpeechToRoom(pendingSpeech);
    }

    if (isFacultyOrAdmin && rtcFinishSession) {
      rtcFinishSession();
    }
    if (gdRecorder.isRecording) {
      setIsFinalizingRecording(true);
      try {
        const uploadResult = await Promise.race([
          gdRecorder.stopAndUploadRecording(session.id || session.slotId || 'slot-1'),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (uploadResult?.recordingUrl) {
          session.recordingUrl = uploadResult.recordingUrl;
          setSession((prev) => ({ ...prev, recordingUrl: uploadResult.recordingUrl }));
        }
      } catch (recErr) {
        console.warn('[GD Room] Recording upload on exit failed:', recErr);
      } finally {
        setIsFinalizingRecording(false);
      }
    }
    // Session completion and report persistence are handled by the authorized onFinishSession callback.
    onFinishSession();
  }, [gdRecorder, session.id, session.slotId, isFacultyOrAdmin, rtcFinishSession, onFinishSession, liveSpeechTranscript, setSession]);

  const currentSpeakerStudent =
    (isUserSpeakingLive ? activeStudentUser : null) ||
    (rtcFloorSpeakerId ? activeDisplayStudents.find((s) => s.id === rtcFloorSpeakerId || s.userId === rtcFloorSpeakerId || s.socketId === rtcFloorSpeakerId || String(s.seatNumber) === String(rtcFloorSpeakerId)) : null) ||
    (session.currentSpeakerId ? activeDisplayStudents.find((s) => s.id === session.currentSpeakerId || s.userId === session.currentSpeakerId || s.socketId === session.currentSpeakerId) : null) ||
    activeDisplayStudents.find((s) => s.isSpeaking) ||
    activeDisplayStudents.find((s) => s.id === latestSpeakerTranscript?.speakerId) ||
    activeStudentUser ||
    activeDisplayStudents[0];
  const isSpeakingLive = !!(session.currentSpeakerId || rtcFloorSpeakerId || isUserSpeakingLive || activeDisplayStudents.some((s) => s.isSpeaking));
  
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

      // Immediately abort recognition and clear live buffers to prevent AI voice from leaking into candidate transcript
      committedResultIndexRef.current = -1;
      liveTranscriptRef.current = '';
      setLiveSpeechTranscript('');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      // Absolute max pause timeout: safety net in case audio hangs indefinitely
      const maxTimer = setTimeout(() => {
        aiVoicePausedMicRef.current = false;
        setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      }, 25000);

      // Safety watchdog: verify when voice has finished or stopped
      const checkVoiceFinished = () => {
        if (!roomVoice.isSpeaking()) {
          clearTimeout(maxTimer);
          setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
          aiVoiceResumeTimerRef.current = null;
          setTimeout(() => {
            aiVoicePausedMicRef.current = false;
            committedResultIndexRef.current = -1;
            liveTranscriptRef.current = '';
            setLiveSpeechTranscript('');
          }, 1000);
        } else {
          aiVoiceResumeTimerRef.current = setTimeout(checkVoiceFinished, 400);
        }
      };
      aiVoiceResumeTimerRef.current = setTimeout(checkVoiceFinished, 600);
    };

    const handleAiVoiceEnd = () => {
      if (aiVoiceResumeTimerRef.current) {
        clearTimeout(aiVoiceResumeTimerRef.current);
        aiVoiceResumeTimerRef.current = null;
      }
      setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      notifyFacilitatorSpeechEndedRef.current();

      // Delay 1000ms after AI finishes speaking to prevent acoustic room echo bleed
      setTimeout(() => {
        aiVoicePausedMicRef.current = false;
        committedResultIndexRef.current = -1;
        liveTranscriptRef.current = '';
        setLiveSpeechTranscript('');
      }, 1000);
    };

    window.addEventListener('erus-ai-voice-start', handleAiVoiceStart);
    window.addEventListener('erus-ai-voice-end', handleAiVoiceEnd);
    return () => {
      window.removeEventListener('erus-ai-voice-start', handleAiVoiceStart);
      window.removeEventListener('erus-ai-voice-end', handleAiVoiceEnd);
      if (aiVoiceResumeTimerRef.current) clearTimeout(aiVoiceResumeTimerRef.current);
    };
  }, []);



  // Auto scroll transcript strictly within its own scrollable container
  useEffect(() => {
    if (transcriptEndRef.current?.parentElement) {
      transcriptEndRef.current.parentElement.scrollTop = transcriptEndRef.current.parentElement.scrollHeight;
    }
  }, [transcripts]);

  // Auto-commit helper for live speech to broadcast directly to the room
  const commitLiveSpeechToRoom = (forcedText?: string) => {
    if (speechPauseTimerRef.current) {
      clearTimeout(speechPauseTimerRef.current);
      speechPauseTimerRef.current = null;
    }

    if (!isSessionActive) {
      // The discussion has not been officially commenced by the faculty evaluator yet.
      // Candidate speech or ambient sound in the lobby must NOT auto-start the GD session!
      return;
    }

    let textToCommit = String(forcedText || liveTranscriptRef.current || liveSpeechTranscript || '').trim();
    if (!textToCommit) return;

    // Acoustic Echo Cancellation: Discard speech picked up from AI facilitator prompts or questions
    const knownAiPrompts = [
      sessionRef.current?.facilitatorSpeech,
      session.topic,
      "the floor is open for discussion",
      "please feel free to share your thoughts",
      "welcome everyone to today's group discussion",
      "if you have to challenge one goal assumption",
      "let's hear from",
    ].filter(Boolean) as string[];

    const lowerCandidate = textToCommit.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const prompt of knownAiPrompts) {
      const lowerPrompt = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!lowerPrompt || lowerPrompt.length < 8) continue;

      if (lowerCandidate.startsWith(lowerPrompt)) {
        const promptWordCount = lowerPrompt.split(' ').length;
        const candidateWords = textToCommit.split(/\s+/);
        textToCommit = candidateWords.slice(promptWordCount).join(' ').trim();
        break;
      } else if (lowerPrompt.includes(lowerCandidate) || lowerCandidate === lowerPrompt) {
        textToCommit = '';
        break;
      }
    }

    if (!textToCommit || textToCommit.length < 3) {
      liveTranscriptRef.current = '';
      setLiveSpeechTranscript('');
      committedResultIndexRef.current = -1;
      return;
    }

    // Reset live buffers
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');
    committedResultIndexRef.current = -1;

    // Broadcast directly to room transcript & peers
    if (handleSendUserStatementRef.current) {
      handleSendUserStatementRef.current(textToCommit);
    }

    if (rtcNotifySpeakingFinished) {
      rtcNotifySpeakingFinished();
    }

    // Refresh SpeechRecognition instance cleanly so resultIndex resets to 0 and Chrome buffers don't get stuck
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
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
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
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
  const stopAudioAnalyserRef = useRef(stopAudioAnalyser);
  stopAudioAnalyserRef.current = stopAudioAnalyser;
  const rtcSetMicEnabledRef = useRef(rtcSetMicEnabled);
  rtcSetMicEnabledRef.current = rtcSetMicEnabled;
  const isFacultyRef = useRef(isFaculty);
  isFacultyRef.current = isFaculty;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isFaculty) return;
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognitionStartTime = { current: Date.now() };
    const lastResultReceivedTime = { current: Date.now() };

    const startRecognitionInstance = () => {
      if (isFacultyRef.current) return;
      if (!isListeningMicRef.current) return;
      if (!SpeechRecognitionClass) {
        console.warn('SpeechRecognition API not supported in this browser; acoustic speech detection will be active.');
        return;
      }

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
        recognition.maxAlternatives = 1;
        const navLang = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
        recognition.lang = navLang.toLowerCase().startsWith('en') ? navLang : 'en-US';
        recognitionRef.current = recognition;

        committedResultIndexRef.current = -1;
        recognitionStartTime.current = Date.now();
        lastResultReceivedTime.current = Date.now();

        recognition.onstart = () => {
          isRecognitionRunningRef.current = true;
          recognitionStartTime.current = Date.now();
        };

        recognition.onresult = (event: any) => {
          lastResultReceivedTime.current = Date.now();
          lastWebSpeechTimeRef.current = Date.now();

          // If candidate microphone is muted or listening is off, never transcribe or broadcast speech
          if (rtcIsMicMutedRef.current || !isListeningMicRef.current) {
            return;
          }

          // While AI facilitator or peer voice is playing or recently finished (2.2s buffer for acoustic echo & recognition latency), discard feedback
          const isAiSpeakingNow = aiVoicePausedMicRef.current ||
                                  roomVoice.isSpeakingOrRecentlyFinished(2200) ||
                                  Boolean(sessionRef.current?.isFacilitatorSpeaking) ||
                                  Boolean((window as any).__erusIsAiSpeaking) ||
                                  (Date.now() - ((window as any).__erusLastAiSpeechTime || 0) < 2200);
          if (isAiSpeakingNow) {
            liveTranscriptRef.current = '';
            setLiveSpeechTranscript('');
            committedResultIndexRef.current = event.results.length - 1;
            return;
          }

          let interimTranscript = '';
          let finalTranscript = '';

          // Reset committed index if results list wrapped or reset
          if (committedResultIndexRef.current >= event.results.length) {
            committedResultIndexRef.current = -1;
          }
          const startIndex = Math.max(0, committedResultIndexRef.current + 1);
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

          // Instantly notify server and local room that candidate is actively speaking
          if (currentSpoken) {
            setLocalSilenceSeconds(0);
            clientSilenceStageRef.current = 0;
            if (rtcNotifySpeakingStartedRef.current) {
              rtcNotifySpeakingStartedRef.current();
            }
          }

          // Mark speaker active on floor
          if (!isFacultyRef.current) {
            const currentUserId = currentUser?.id;
            const currentUserName = currentUser?.name;
            setSession((prev) => {
              const myStudent =
                prev.students.find((s) => s.isUser) ||
                prev.students.find((s) => !s.isEmptySeat && ((currentUserId && s.id === currentUserId) || (currentUserName && s.name === currentUserName))) ||
                prev.students.find((s) => !s.isEmptySeat);
              const myId = myStudent?.id || currentUserId || 'speaker-1';
              return {
                ...prev,
                currentSpeakerId: myId,
                students: prev.students.map((s) =>
                  s.isUser || s.id === myId || (currentUserId && s.id === currentUserId) || (currentUserName && s.name === currentUserName)
                    ? { ...s, isSpeaking: true, micActive: true }
                    : s
                ),
              };
            });
          }

          // Reset silence pause timer on each spoken token
          if (speechPauseTimerRef.current) {
            clearTimeout(speechPauseTimerRef.current);
          }

          // Natural pause detection: auto-broadcast to room after 2.2s silence
          if (currentSpoken.length > 2) {
            speechPauseTimerRef.current = setTimeout(() => {
              commitLiveSpeechToRoom(currentSpoken);
            }, 2200);
          }
        };

        recognition.onerror = (event: any) => {
          isRecognitionRunningRef.current = false;

          if (event.error === 'no-speech') {
            // Natural silence pause between sentences: revive recognition fresh so user voice is captured as soon as they speak
            if (!isFacultyRef.current || isListeningMicRef.current) {
              if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
              restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 200);
            }
            return;
          }

          if (event.error === 'language-not-supported') {
            if (recognitionRef.current) {
              try { recognitionRef.current.lang = 'en-US'; } catch {}
            }
            if (isListeningMicRef.current) {
              if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
              restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 300);
            }
            return;
          }

          if (
            event.error === 'aborted' ||
            event.error === 'audio-capture' ||
            event.error === 'network'
          ) {
            // Transient events: restart recognition cleanly
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
            stopAudioAnalyserRef.current();
            stopMediaRecorderFallback();
            if (!isFacultyRef.current) {
              setSession((prev) => ({
                ...prev,
                students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
              }));
            }
          }
        };

        recognition.onend = () => {
          isRecognitionRunningRef.current = false;
          // Microphone is permanently active for candidates — revive recognition instance continuously
          if (!isFacultyRef.current || isListeningMicRef.current) {
            isListeningMicRef.current = true;
            setIsListeningMic(true);
            if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
            restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 150);
            return;
          }

          setIsListeningMic(false);
          stopAudioAnalyserRef.current();
          stopMediaRecorderFallback();
        };

        recognition.start();
      } catch (err) {
        isRecognitionRunningRef.current = false;
        if (isListeningMicRef.current) {
          if (restartRecognitionTimerRef.current) clearTimeout(restartRecognitionTimerRef.current);
          restartRecognitionTimerRef.current = setTimeout(startRecognitionInstance, 300);
        }
      }
    };

    // Watchdog Heartbeat: ensures recognition is running continuously and never goes stale
    const watchdog = setInterval(() => {
      if (!isListeningMicRef.current) return;

      const now = Date.now();
      const sessionAge = now - recognitionStartTime.current;
      const timeSinceResult = now - lastResultReceivedTime.current;

      // 1. If recognition is not marked running, revive it immediately
      if (!isRecognitionRunningRef.current) {
        startRecognitionInstance();
        return;
      }

      // 2. Prevent Chromium SpeechRecognition socket timeout:
      // Chrome silently drops recognition after 40-50s of continuous listening.
      // If idle (no uncommitted speech in progress) and session is > 35s old, cycle to a fresh instance.
      const hasUncommittedSpeech = Boolean(liveTranscriptRef.current || liveSpeechTranscriptRef.current);
      if (sessionAge > 35000 && !hasUncommittedSpeech) {
        startRecognitionInstance();
        return;
      }

      // 3. User is actively speaking into mic (audioLevel > 12) but speech recognition produced nothing for > 3.5s
      if (audioLevelRef.current > 12 && timeSinceResult > 3500 && !hasUncommittedSpeech) {
        startRecognitionInstance();
        return;
      }
    }, 1500);

    // Continuous discussion: auto-start recognition immediately for student participants
    if (isListeningMicRef.current) {
      setTimeout(startRecognitionInstance, 300);
    }

    // Save helper reference so it can be revived if needed (only for students)
    if (!isFaculty) {
      (window as any).__startErusSpeechRecognition = startRecognitionInstance;
    }

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
  }, [isFaculty]);

  const activateContinuousMicrophone = useCallback(async () => {
    if (isFaculty) return;
    aiVoicePausedMicRef.current = false;
    if (aiVoiceResumeTimerRef.current) {
      clearTimeout(aiVoiceResumeTimerRef.current);
      aiVoiceResumeTimerRef.current = null;
    }

    isListeningMicRef.current = true;
    setIsListeningMic(true);

    try {
      await rtcSetMicEnabled(true);
    } catch (e) {}

    let activeMicStream: MediaStream | null = getLocalAudioStream ? getLocalAudioStream() : null;
    if (!activeMicStream) {
      try {
        activeMicStream = await startAudioAnalyser();
      } catch (e) {
        console.warn('startAudioAnalyser error:', e);
      }
    }

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

    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.isUser ? { ...s, micActive: true } : s)),
    }));
  }, [isFaculty, rtcSetMicEnabled, getLocalAudioStream, startAudioAnalyser]);

  const toggleMicRecognition = activateContinuousMicrophone;

  // Candidate Mute / Unmute Toggle handler
  const handleToggleMic = useCallback(async () => {
    if (isFaculty) return;
    const willBeMuted = !rtcIsMicMuted;

    // Update WebRTC audio track state
    await rtcSetMicEnabled(!willBeMuted);

    // Synchronize local listening state
    setIsListeningMic(!willBeMuted);
    isListeningMicRef.current = !willBeMuted;

    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.isUser ? { ...s, micActive: !willBeMuted } : s)),
    }));

    if (willBeMuted) {
      setLiveSpeechTranscript('');
      liveTranscriptRef.current = '';
      if (speechPauseTimerRef.current) {
        clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
      }
    } else {
      // If unmuting, ensure recognition is primed and running
      if (typeof (window as any).__startErusSpeechRecognition === 'function') {
        (window as any).__startErusSpeechRecognition();
      } else if (recognitionRef.current && !isRecognitionRunningRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    }
  }, [isFaculty, rtcIsMicMuted, rtcSetMicEnabled]);

  // Auto-activate continuous open microphone for participants
  useEffect(() => {
    if (!isFaculty) {
      activateContinuousMicrophone();
    }
  }, [isFaculty, activateContinuousMicrophone]);

  // Ensure AudioContext and continuous recognition resume on first user interaction
  useEffect(() => {
    if (isFaculty) return;
    const resumeOnInteraction = () => {
      activateContinuousMicrophone();
    };
    window.addEventListener('click', resumeOnInteraction, { once: true });
    window.addEventListener('keydown', resumeOnInteraction, { once: true });
    return () => {
      window.removeEventListener('click', resumeOnInteraction);
      window.removeEventListener('keydown', resumeOnInteraction);
    };
  }, [isFaculty, activateContinuousMicrophone]);

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
  }, [liveSpeechTranscript]);

  // Trigger Facilitator speech and vocalize
  const speakFacilitator = (
    text: string, 
    actionType: string = 'probing_question', 
    phase?: GDFacilitatorPhase,
    onSpeechEnd?: () => void
  ) => {
    roomVoice.unlock();
    const isDirective = actionType === 'initiate_opening_speaker' || 
                        actionType === 'explain_rules' || 
                        actionType === 'welcome' ||
                        actionType === 'silence_instruction_1' ||
                        actionType === 'silence_instruction_2' ||
                        actionType === 'deadlock_intervention' ||
                        actionType === 'targeted_question_student' ||
                        actionType === 'interruption_arbitration' ||
                        actionType === 'test_voice' ||
                        actionType === 'topic_announcement' ||
                        actionType === 'moderation' ||
                        actionType === 'conclusion' ||
                        phase === 'intro' ||
                        phase === 'conclusion';

    // Only defer non-directive speech if a remote peer is actively speaking on the floor
    const isParticipantSpeaking = !isDirective && !!(
      rtcPeers.some((p) => p.isSpeaking && p.role === 'student')
    );
    if (isParticipantSpeaking) {
      console.log('[Facilitator] Remote participant is speaking, skipping non-directive prompt.');
      setIsAiProcessing(false);
      if (onSpeechEnd) onSpeechEnd();
      return;
    }

    const safeSpeechText = String(text || '');
    setIsAiProcessing(true);

    // Flush any live candidate transcript so AI speech is not captured by candidate mic
    liveTranscriptRef.current = '';
    setLiveSpeechTranscript('');
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } catch {}

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

    const estFacilitatorDuration = Math.max(8000, safeSpeechText.split(/\s+/).length * 900 + 4000);
    const safetyTimer = setTimeout(() => {
      setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      setIsAiProcessing(false);
      notifyFacilitatorSpeechEndedRef.current();
    }, estFacilitatorDuration);

    facilitatorVoice.speak(safeSpeechText, () => {
      clearTimeout(safetyTimer);
      setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      setIsAiProcessing(false);
      notifyFacilitatorSpeechEndedRef.current();
      setTimeout(() => {
        if (typeof (window as any).__startErusSpeechRecognition === 'function') {
          (window as any).__startErusSpeechRecognition();
        }
      }, 400);
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
    if (!isSessionActive) {
      if (!isFacultyOrAdmin) {
        return;
      }
      setSession((prev) => ({
        ...prev,
        status: 'active',
        startedAt: prev.startedAt || Date.now(),
      }));
      if (rtcStartSession) rtcStartSession(session.topic);
      if (onStartSession) onStartSession(session.id);
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

    // Interruption detection: STRICTLY suppressed if candidate is practicing solo or is the only one in the room.
    // Interruption is physically only possible if >= 2 active participants exist and another participant is ACTUALLY speaking right now.
    const activeParticipants = filledStudents.filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && !s.name?.startsWith('Seat '));
    const isSoloSession = activeParticipants.length <= 1;

    // In a live WebRTC room (isSocketConnected === true), the backend server handles real-time audio mesh overlap detection.
    // In standalone/local mode, only warn if another real or simulated peer is currently actively speaking.
    if (!isSoloSession && !isSocketConnected && session?.currentSpeakerId) {
      const isSelfSpeaking =
        session.currentSpeakerId === userStudent.id ||
        session.currentSpeakerId === currentUser?.id ||
        (session.students || []).find((s) => s.id === session.currentSpeakerId)?.name === userStudent.name;

      if (!isSelfSpeaking) {
        const interruptedStudent = activeParticipants.find(
          (s) =>
            s.id === session.currentSpeakerId &&
            s.id !== userStudent.id &&
            s.name !== userStudent.name &&
            !s.isUser &&
            s.isSpeaking
        );
        if (interruptedStudent) {
          const firstSpeakerName = interruptedStudent.name || 'the previous speaker';
          const warningMessage = `One at a time, please. Let ${firstSpeakerName} complete their thought before responding.`;
          setInterruptionWarning(warningMessage);
          speakFacilitator(warningMessage, 'interruption_arbitration', 'moderation');
          setTimeout(() => setInterruptionWarning(null), 6500);
        }
      }
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

    // Check if the statement consists of substantive points (not just noise or 1-word filler)
    const cleanWords = text.trim().split(/\s+/).filter(Boolean);
    const fillerTokens = new Set([
      'ok', 'okay', 'yes', 'yeah', 'yep', 'no', 'nope', 'sure', 'fine', 'alright',
      'right', 'agree', 'thank', 'thanks', 'you', 'done', 'finished', 'thats', 'that',
      'is', 'it', 'all', 'hmm', 'well', 'got', 'understood', 'cool', 'sir', 'maam',
      'actually', 'basically', 'so', 'like', 'hello', 'hlo', 'hi', 'hey', 'am', 'i', 'audible', 'clear'
    ]);
    const substantiveWords = cleanWords.filter((w) => !fillerTokens.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const isGoodPoint = cleanWords.length >= 3 && substantiveWords.length >= 2;
    const addedSpeakingSeconds = isGoodPoint ? Math.max(3, Math.round(cleanWords.length / 2.1)) : 0;

    // Update user stats: ONLY increment turns and seconds if transcript consists of good points!
    setSession((prev) => ({
      ...prev,
      silenceTimerSeconds: 0,
      currentSpeakerId: userStudent.id,
      students: prev.students.map((s) =>
        s.id === userStudent.id
          ? {
              ...s,
              isSpeaking: true,
              speakingTurns: isGoodPoint ? (s.speakingTurns || 0) + 1 : s.speakingTurns,
              speakingDurationSeconds: isGoodPoint
                ? (s.speakingDurationSeconds || 0) + addedSpeakingSeconds
                : s.speakingDurationSeconds,
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

  // If no one speaks initially, AI Facilitator calls upon a student or welcomes the room
  const handleInitiateOpeningSpeaker = (force: boolean = false) => {
    if (rtcSimulationMode) return;
    if (hasInitiatedOpeningRef.current) {
      return;
    }
    const hasSpokenWelcome = transcripts.some(
      (t) => t.isFacilitator && (t.type === 'intro' || String(t.text || '').toLowerCase().includes('welcome'))
    );
    if (hasSpokenWelcome) {
      hasInitiatedOpeningRef.current = true;
      return;
    }
    if (!force) {
      const hasSpoken = transcripts.some((t) => !t.isFacilitator);
      if (hasSpoken) {
        hasInitiatedOpeningRef.current = true;
        return;
      }
      if (!isSessionActive || session.isFacilitatorSpeaking || session.currentSpeakerId) return;
    }

    hasInitiatedOpeningRef.current = true;

    // Select candidate to initiate from active live peers or enrolled students
    const liveCandidates = activeDisplayStudents.filter((s) => !s.isEmptySeat);
    const rawCandidates = liveCandidates.length > 0
      ? liveCandidates
      : (session.students && session.students.length > 0 ? session.students.filter((s) => !s.isEmptySeat) : []);
    const openingCandidate = rawCandidates[0] || null;

    const initiationPrompt = openingCandidate
      ? generateInitiationPrompt(openingCandidate, session.topic)
      : `Welcome participants to today's group discussion on "${session.topic}". The discussion has now officially commenced. Each candidate will have the opportunity to present their views. Please unmute your microphone and share your opening thoughts on "${session.topic}".`;

    // Broadcast over socket so all connected peers receive the opening facilitator prompt
    if (rtcBroadcastFacilitatorSpeech && isSocketConnected) {
      rtcBroadcastFacilitatorSpeech(initiationPrompt, 'initiate_opening_speaker');
    }

    // Always vocalize locally via speakFacilitator so welcome message is loud, clear and audible
    speakFacilitator(initiationPrompt, 'initiate_opening_speaker', 'intro', () => {
      if (openingCandidate?.isUser) {
        setInvitedStudentPrompt({
          student: openingCandidate,
          reason: `AI Facilitator has invited you to initiate the discussion!`,
          promptText: initiationPrompt,
        });
      } else if (openingCandidate && autoSimulatePeers && !hasRealStudentPeers) {
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
    if (Date.now() - lastFacilitatorInterventionTimeRef.current < 3000) return;

    lastFacilitatorInterventionTimeRef.current = Date.now();

    const liveStudents = activeDisplayStudents.filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && !s.name?.startsWith('Seat '));
    const pool = liveStudents.length > 0 ? liveStudents : (session.students || []).filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && !s.name?.startsWith('Seat '));
    
    // Select the candidate who has spoken the least in the session
    const sortedPool = pool.slice().sort((a, b) =>
      (a.speakingTurns || 0) - (b.speakingTurns || 0) ||
      (a.speakingDurationSeconds || 0) - (b.speakingDurationSeconds || 0)
    );
    const targetStudent = sortedPool[0] || null;

    const latestStudentTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
    const baseQuestion = targetStudent
      ? generateTargetedQuestionForStudent(targetStudent, session.topic, latestStudentTranscript)
      : getNextUniqueFacilitatorPrompt(session.topic, transcripts, pool, 'probing', true).text;

    const cleanBase = baseQuestion.replace(/^(Nine|Three|\d+)\s+seconds\s+(of\s+)?silence\s+detected\.?\s*/i, '');
    const candidateName = targetStudent?.name || 'participants';
    const targetedQuestion = cleanBase.toLowerCase().includes(candidateName.toLowerCase())
      ? cleanBase
      : `Let us hear from ${candidateName}. ${cleanBase}`;

    // Broadcast over socket so all connected peers receive the question
    if (rtcBroadcastFacilitatorSpeech) {
      rtcBroadcastFacilitatorSpeech(targetedQuestion, 'targeted_question_student');
    }

    speakFacilitator(targetedQuestion, 'targeted_question_student', 'probing', () => {
      if (targetStudent?.isUser) {
        setInvitedStudentPrompt({
          student: targetStudent,
          reason: `AI Facilitator asked you directly: "${targetedQuestion}"`,
          promptText: targetedQuestion,
        });
      } else if (targetStudent && autoSimulatePeers) {
        setTimeout(() => {
          const ansStmt = generateStudentFollowUpStatement(targetStudent, session.topic, { name: 'Facilitator' }, targetedQuestion);
          startPeerSpeech(targetStudent, ansStmt);
        }, 1200);
      }
    });
  };

  // Silence Watchdog: triggers opening initiation (8s silence) or 3-second staged arbitration
  useEffect(() => {
    if (rtcSimulationMode) return;
    if (!isSessionActive) return;

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

    // 2. 3-Second Staged Turn Arbitration Watchdog (3s Warning 1, 6s Warning 2, 9s Targeted Candidate Callout)
    const currentSilence = Math.max(localSilenceSeconds, rtcSilenceTimer, session.silenceTimerSeconds);
    if (
      !session.isFacilitatorSpeaking &&
      !roomVoice.isSpeaking() &&
      !aiVoicePausedMicRef.current &&
      !rtcIsSpeakingLive &&
      !isTransitioningTurnRef.current &&
      !liveSpeechTranscript
    ) {
      // In standalone mode (offline without socket):
      if (!isSocketConnected) {
        if (clientSilenceStageRef.current === 0 && currentSilence >= 3) {
          clientSilenceStageRef.current = 1;
          speakFacilitator(
            'The floor is open for discussion. Please feel free to share your thoughts.',
            'silence_instruction_1',
            'moderation'
          );
        } else if (clientSilenceStageRef.current === 1 && currentSilence >= 6) {
          clientSilenceStageRef.current = 2;
          speakFacilitator(
            'The floor is open. Let us keep the momentum going—anyone who has not spoken yet, please share your perspective on this topic.',
            'silence_instruction_2',
            'moderation'
          );
        } else if (clientSilenceStageRef.current === 2 && currentSilence >= 9 && Date.now() - lastFacilitatorInterventionTimeRef.current >= 3000) {
          clientSilenceStageRef.current = 3;
          lastFacilitatorInterventionTimeRef.current = Date.now();
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

  const lastActiveSlotIdRef = useRef<string>(session.id);
  useEffect(() => {
    if (session.id && session.id !== lastActiveSlotIdRef.current) {
      lastActiveSlotIdRef.current = session.id;
      hasInitiatedOpeningRef.current = false;
      setInvitedStudentPrompt(null);
    }
  }, [session.id]);

  // Trigger opening speaker when session becomes active if not already initiated
  useEffect(() => {
    if (session.status === 'active') {
      const hasWelcomeInTranscripts = transcripts.some(
        (t) => t.isFacilitator && (t.type === 'intro' || String(t.text || '').toLowerCase().includes('welcome'))
      );
      if (!hasInitiatedOpeningRef.current && !hasWelcomeInTranscripts) {
        const timer = setTimeout(() => {
          if (!hasInitiatedOpeningRef.current) {
            handleInitiateOpeningSpeaker(true);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [session.status, session.id]);

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
    <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5 [overflow-anchor:none]">
      {/* AI Facilitator Voice Overlap Guidance Floating Banner (Non-disruptive, Zero Layout Shift) */}
      {interruptionWarning && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92vw] sm:w-full p-3.5 rounded-2xl bg-amber-500/95 dark:bg-amber-950/95 border-2 border-amber-400 text-slate-900 dark:text-amber-100 shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-400 dark:bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-sm shrink-0 shadow-md">
              ⚠️
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 dark:text-amber-300 block">
                Discussion Decorum Notice
              </span>
              <p className="text-xs sm:text-sm font-semibold truncate sm:whitespace-normal">
                {interruptionWarning}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInterruptionWarning(null)}
            className="px-2.5 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 dark:bg-amber-800/60 dark:hover:bg-amber-700 text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      
      {/* Session Title & Facilitator Broadcast Banner */}
      <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-xl relative overflow-hidden backdrop-blur-md transition-colors duration-200">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            {/* Clean Metadata: Group Discussion Set, Slot Details, and Allotted Faculty */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {onBackToDashboard && (
                <button
                  type="button"
                  onClick={onBackToDashboard}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Return to Dashboard"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Back</span>
                </button>
              )}

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

              {/* Live Discussion Session Elapsed Timer */}
              {isSessionActive && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 flex items-center gap-1.5 shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse" />
                  <span className="font-mono">Time: {formatElapsedClock(effectiveElapsed)}</span>
                </span>
              )}

              {/* Allotted Faculty Evaluator */}
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 shadow-2xs">
                <GraduationCap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Faculty: <strong>{session?.assignedFacultyName || 'Assigned Faculty Evaluator'}</strong></span>
              </span>

              {/* Live Video Recording Status Indicator (Recorded for Faculty/Admin portal) */}
              {gdRecorder.isRecording ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 shadow-2xs animate-pulse" title="GD discussion video grid is actively being recorded and stored to ERUS server for Faculty Evaluation">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                  <span className="font-mono">🔴 REC {gdRecorder.formattedDuration}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans hidden sm:inline">(Auto-recording for Faculty)</span>
                </span>
              ) : (gdRecorder.recordingUrl || session.recordingUrl) ? (
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

            {/* Open Mics & Natural Discussion Banner */}
            {isSessionActive && (
              <div className="mt-2.5 px-3 py-2 rounded-xl flex items-center justify-between gap-2 shadow-2xs border transition-colors duration-200 bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/25 text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                  <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {rtcFloorSpeakerName ? (
                      <>
                        Speaking: <span className="underline font-extrabold">{rtcFloorSpeakerName}</span>
                      </>
                    ) : (
                      'Floor is Open — Everyone can participate and speak freely'
                    )}
                  </span>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200">
                  🎙️ Open Discussion Active (AI Intervenes if Voices Overlap)
                </span>
              </div>
            )}

            {/* Audio Autoplay Blocked Banner */}
            {rtcIsAudioAutoplayBlocked && (
              <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/15 dark:bg-amber-950/50 border border-amber-500/40 flex items-center justify-between gap-3 flex-wrap shadow-md animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <VolumeX className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Peer Audio Playback Blocked
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        Browser Policy
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5">
                      Your browser blocked audio from other participants because you haven't interacted with the page yet.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => rtcResumeAudioPlayback()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  Unmute / Enable Audio
                </button>
              </div>
            )}

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
                  {(gdRecorder.recordingUrl || session.recordingUrl) && (
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
            ) : isSessionActive ? (() => {
              const displaySilenceSeconds = Math.max(localSilenceSeconds, rtcSilenceTimer, session.silenceTimerSeconds || 0);
              return (
              /* 3-Second Turn Arbitration Watchdog (3s Instruction 1, 6s Instruction 2, 9s Targeted Candidate Callout) */
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    displaySilenceSeconds >= 6
                      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 animate-bounce'
                      : displaySilenceSeconds >= 3
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">Discussion Flow & Silence Monitor</span>
                      <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                        displaySilenceSeconds >= 6
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse'
                          : displaySilenceSeconds >= 3
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {displaySilenceSeconds > 0 ? `${displaySilenceSeconds}s / 9s` : 'Active Floor'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {displaySilenceSeconds >= 6
                        ? `Silence detected — AI facilitating participant in ${Math.max(0, 9 - displaySilenceSeconds)}s`
                        : displaySilenceSeconds >= 3
                        ? 'Floor is open — share your perspective or AI facilitator will invite next speaker.'
                        : 'Floor open — participants can contribute freely.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-[200px] sm:max-w-xs ml-auto">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        displaySilenceSeconds >= 6 
                          ? 'bg-rose-500 animate-pulse' 
                          : displaySilenceSeconds >= 3 
                          ? 'bg-amber-500' 
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (displaySilenceSeconds / 9) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 font-semibold w-8 text-right">
                    {Math.max(0, 9 - displaySilenceSeconds)}s
                  </span>
                </div>
              </div>
              );
            })() : !isSessionActive && session.status !== 'completed' ? (
              <div className="mt-3 p-2.5 sm:p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-3 flex-wrap shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center animate-pulse">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                        Session Waiting • Discussion Not Started
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/90 text-amber-900 dark:text-amber-200 font-bold uppercase tracking-wider">
                        Awaiting Evaluator
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                      {canStartSession
                        ? "You are evaluating this session. When candidates are ready, click 'Start Group Discussion' below to commence."
                        : "The discussion has not begun yet. Please wait for your faculty evaluator to start the GD session."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Quick Facilitator Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isSessionActive && session.status !== 'completed' && canStartSession && (
              <button
                id="start-gd-btn"
                onClick={() => {
                  roomVoice.unlock();
                  gdRecorderRef.current?.startRecording().catch((e) => {
                    console.warn('[Start GD] Direct recorder start notice:', e);
                  });
                  setSession((prev) => ({
                    ...prev,
                    status: 'active',
                    startedAt: prev.startedAt || Date.now(),
                  }));
                  if (rtcStartSession) {
                    rtcStartSession(session.topic);
                  }
                  if (onStartSession) {
                    onStartSession(session.id);
                  }
                  handleInitiateOpeningSpeaker(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-700/30 transition-all hover:scale-105 active:scale-95 cursor-pointer animate-pulse ring-2 ring-emerald-400/50"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Group Discussion</span>
              </button>
            )}

            {!isSessionActive && session.status !== 'completed' && !canStartSession && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 shadow-sm">
                <Clock className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                <span>Waiting for Faculty In-Charge to start GD...</span>
              </div>
            )}

            {canStartSession && (
              <>
                {isSessionActive && (
                  <button
                    id="restart-gd-btn"
                    onClick={() => {
                      roomVoice.unlock();
                      gdRecorderRef.current?.startRecording().catch((e) => {
                        console.warn('[Restart GD] Direct recorder start notice:', e);
                      });
                      if (rtcStartSession) {
                        rtcStartSession(session.topic);
                      }
                      if (onStartSession) {
                        onStartSession(session.id);
                      }
                      handleInitiateOpeningSpeaker(true);
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
                  const isSolo = filledStudents.filter((s) => !s.isEmptySeat && !s.id?.includes('empty') && !s.name?.startsWith('Seat ')).length <= 1;
                  const rulesText = isSolo
                    ? "Discussion Guidelines: 1. Present your thoughts clearly and confidently. 2. Support arguments with concrete examples. 3. Maintain structured articulation. 4. Stay strictly on topic. You have the floor whenever you are ready."
                    : "Discussion Rules: 1. Speak one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us maintain balanced dialogue.";
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

              <button
                id="test-ai-voice-btn"
                onClick={() => {
                  roomVoice.unlock();
                  roomVoice.speakAsFacilitator(
                    "Welcome to ERUS. The AI facilitator and speech recognition systems are active. Please start your discussion.",
                    undefined,
                    true
                  );
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 transition-all shadow-xs active:scale-95 cursor-pointer"
                title="Click to test AI facilitator audio output and unlock browser speech"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Test AI Voice</span>
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-700/20 dark:shadow-emerald-900/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>Conclude & Generate Report</span>
                </button>
              )}
            </>
          )}
        </div>

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
                    <div className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-md flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Floor is Yours (Speak Freely)</span>
                    </div>
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

            {/* 1. ROUND TABLE LAYOUT (Dynamic Circular Table Sizing, Zero Empty Seats & Speaker-Centric Zoom) */}
            {currentLayout === 'round_table' && (() => {
              const count = filledStudents.length;
              // Compact conference table container: keeps the central table circle reasonably sized
              // so participant video pods dominate the screen clearly.
              const containerClass = 
                count <= 4 
                  ? 'w-[480px] sm:w-[540px] md:w-[600px] max-w-full' 
                  : count <= 8 
                  ? 'w-[540px] sm:w-[620px] md:w-[700px] max-w-full' 
                  : count <= 12 
                  ? 'w-[620px] sm:w-[720px] md:w-[800px] max-w-full' 
                  : 'w-[700px] sm:w-[800px] md:w-[880px] max-w-full';

              // Inner table inset: generous inset keeps the table circle small and compact
              const innerTableInset = 
                count <= 4 
                  ? 'inset-32 sm:inset-40' 
                  : count <= 8 
                  ? 'inset-36 sm:inset-48' 
                  : 'inset-40 sm:inset-56';

              return (
                <div className="relative z-10 my-2 flex-1 flex items-center justify-center overflow-x-auto overflow-y-hidden py-4 sm:py-6 px-2 sm:px-4 scrollbar-thin">
                  <div className={`relative flex items-center justify-center mx-auto aspect-square ${containerClass} max-w-full`}>
                    
                    {/* Central Compact Circular Conference Table */}
                    <div className={`absolute ${innerTableInset} rounded-full bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800/90 dark:via-slate-850 dark:to-slate-900 border-4 border-slate-300 dark:border-slate-700/80 shadow-2xl flex flex-col items-center justify-center p-3 sm:p-4 transition-all duration-300`}>
                      <div className="w-full h-full rounded-full bg-white/85 dark:bg-slate-950/70 border border-slate-300/80 dark:border-slate-700/50 flex flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden shadow-inner text-center">
                        <span className="text-[9px] sm:text-[11px] uppercase font-mono tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
                          Round Table ({filledStudents.length} {filledStudents.length === 1 ? 'Participant' : 'Participants'})
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-2 max-w-[180px] sm:max-w-xs">
                          {session.topic}
                        </p>
                        
                        {/* Live Turn & Flow Indicator */}
                        <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 shadow-xs">
                          <Radio className="w-3 h-3 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                          <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                            {session.currentSpeakerId 
                              ? `Floor: ${filledStudents.find(s => s.id === session.currentSpeakerId)?.name || 'Participant'}` 
                              : 'Floor: Open'}
                          </span>
                        </div>

                        {/* Clean decorative circular table ring */}
                        <div className="absolute inset-3 rounded-full border border-dashed border-indigo-200/60 dark:border-indigo-900/40 pointer-events-none" />
                      </div>
                    </div>

                    {/* Seating Perimeter: Deterministic Stable Seats on Circular Perimeter */}
                    {roundTablePositionedStudents.map(({ student, angle, zoomLevel }) => {
                      const R = count > 12 ? 37 : count > 8 ? 35 : 34; // Flexible circular radius % for compact circle and clear video cards
                      const leftPct = 50 + R * Math.cos(angle);
                      const topPct = 50 + R * Math.sin(angle);
                      const isSpk = Boolean(
                        student.isSpeaking ||
                        (student.isUser && isUserSpeakingLive) ||
                        zoomLevel === 'zoomed' ||
                        (session.currentSpeakerId && (student.id === session.currentSpeakerId || student.userId === session.currentSpeakerId || student.socketId === session.currentSpeakerId)) ||
                        (rtcFloorSpeakerId && (student.id === rtcFloorSpeakerId || student.userId === rtcFloorSpeakerId || student.socketId === rtcFloorSpeakerId || (student.seatNumber !== undefined && String(student.seatNumber) === String(rtcFloorSpeakerId)))) ||
                        (currentSpeakerStudent && student.id === currentSpeakerStudent.id && isSpeakingLive)
                      );

                      return (
                        <div
                          key={student.id}
                          className={`absolute pointer-events-auto transition-all duration-300 ease-out ${
                            isSpk ? 'z-50' : 'z-10'
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            transform: `translate(-50%, -50%) ${isSpk ? 'scale(1.32)' : 'scale(1)'}`,
                            transformOrigin: 'center center',
                            zIndex: isSpk ? 50 : 10,
                          }}
                        >
                          <StudentPodCard 
                            student={student} 
                            isCurrentSpeaker={isSpk}
                            position={topPct < 50 ? 'top' : 'bottom'}
                            zoomLevel={zoomLevel}
                            isUserCameraOn={isCameraOn}
                            videoStream={videoStream}
                            audioLevel={audioLevel}
                            isListeningMic={isListeningMic}
                            isFaculty={isFaculty}
                            onAddNote={handleOpenNoteModal}
                            onEnlarge={handleToggleEnlargeStudent}
                            seatAngle={angle}
                            leftPct={leftPct}
                            topPct={topPct}
                          />
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })()}

            {/* 2. SPEAKER IN MIDDLE OF ROUND TABLE LAYOUT */}
            {currentLayout === 'speaker_center' && (
              <div className="relative z-10 my-2 flex-1 flex items-center justify-start lg:justify-center overflow-x-auto overflow-y-hidden py-8 sm:py-10 px-4 sm:px-8 scrollbar-thin">
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
                          <div className="absolute -inset-2 rounded-full bg-indigo-500/25 animate-pulse pointer-events-none" />
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
                          <span>{currentSpeakerStudent?.speakingTurns || 0} turns • {currentSpeakerStudent?.speakingDurationSeconds || 0}s</span>
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

                  {/* Outer Ring Seating: TOP ROW */}
                  <div className="absolute -top-12 sm:-top-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {filledStudents.slice(0, Math.ceil(filledStudents.length / 2)).map((student) => {
                      const isSpk = student.id === currentSpeakerStudent?.id || student.isSpeaking || (student.isUser && isUserSpeakingLive);
                      return (
                        <StudentPodCard 
                          key={student.id} 
                          student={student} 
                          isCurrentSpeaker={isSpk}
                          zoomLevel={isSpk ? 'zoomed' : 'normal'}
                          position="top"
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
                          onAddNote={handleOpenNoteModal}
                          onEnlarge={handleToggleEnlargeStudent}
                        />
                      );
                    })}
                  </div>

                  {/* Outer Ring Seating: BOTTOM ROW */}
                  <div className="absolute -bottom-12 sm:-bottom-14 inset-x-3 sm:inset-x-8 flex justify-between gap-1 sm:gap-2">
                    {filledStudents.slice(Math.ceil(filledStudents.length / 2)).map((student) => {
                      const isSpk = student.id === currentSpeakerStudent?.id || student.isSpeaking || (student.isUser && isUserSpeakingLive);
                      return (
                        <StudentPodCard 
                          key={student.id} 
                          student={student} 
                          isCurrentSpeaker={isSpk}
                          zoomLevel={isSpk ? 'zoomed' : 'normal'}
                          position="bottom"
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
                          onAddNote={handleOpenNoteModal}
                          onEnlarge={handleToggleEnlargeStudent}
                        />
                      );
                    })}
                  </div>

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
                    {rtcIsAudioAutoplayBlocked && (
                      <button
                        type="button"
                        onClick={() => rtcResumeAudioPlayback()}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 animate-bounce shadow-md cursor-pointer border border-emerald-300"
                        title="Browser paused audio until first user interaction. Click here to enable candidate audio."
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Click to Unmute Candidate Audio</span>
                      </button>
                    )}
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
                  
                  {/* 1. Camera Toggle (Student only) */}
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

                  {/* 2. Microphone Mute / Unmute Toggle (Student only) */}
                  {!isFaculty && (
                    <button
                      id="mic-toggle-btn"
                      onClick={handleToggleMic}
                      className={`p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                        !rtcIsMicMuted && isListeningMic
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-4 ring-emerald-500/40'
                          : 'bg-rose-950/90 hover:bg-rose-900 text-rose-300 border-2 border-rose-600 ring-4 ring-rose-500/30'
                      }`}
                      title={!rtcIsMicMuted && isListeningMic ? 'Mute Microphone (Currently Active)' : 'Unmute Microphone (Currently Muted)'}
                    >
                      {!rtcIsMicMuted && isListeningMic ? (
                        <Mic className="w-5 h-5 text-white" />
                      ) : (
                        <MicOff className="w-5 h-5 text-rose-400" />
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

                  {/* 5.5 Start / Restart GD Call (Green Pill Button - Faculty & Admin only) */}
                  {session.status !== 'completed' && isFacultyOrAdmin && (
                    <button
                      id="dock-start-gd-btn"
                      onClick={() => {
                        roomVoice.unlock();
                        setSession((prev) => ({
                          ...prev,
                          status: 'active',
                          startedAt: prev.startedAt || Date.now(),
                        }));
                        if (rtcStartSession) {
                          rtcStartSession(session.topic);
                        }
                        if (onStartSession) {
                          onStartSession(session.id);
                        }
                        setTimeout(() => {
                          handleInitiateOpeningSpeaker(true);
                        }, 350);
                      }}
                      className={`px-4 py-2.5 rounded-full font-bold text-xs text-white shadow-lg flex items-center gap-2 cursor-pointer transition-all ml-1 sm:ml-2 ${
                        !isSessionActive
                          ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400/50 animate-pulse'
                          : 'bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/50'
                      }`}
                      title={!isSessionActive ? 'Start Group Discussion & Deliver AI Opening Speech' : 'Restart Discussion & Deliver AI Opening Speech'}
                    >
                      {!isSessionActive ? (
                        <>
                          <Play className="w-4 h-4 fill-white" />
                          <span>Start GD</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Restart GD</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Waiting badge for students when session not active */}
                  {session.status !== 'completed' && !isSessionActive && !isFacultyOrAdmin && (
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-800/90 border border-slate-700 text-[11px] text-amber-300 font-semibold shadow-sm ml-1 sm:ml-2">
                      <Clock className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span className="hidden sm:inline">Waiting for Faculty to start GD</span>
                      <span className="sm:hidden">Waiting...</span>
                    </div>
                  )}

                  {/* 6. Conclude / Finish GD Call (Red Pill Button - Faculty & Admin only) */}
                  {isFacultyOrAdmin && (
                    <button
                      id="leave-call-btn"
                      onClick={() => {
                        handleConcludeOrLeaveSession();
                      }}
                      className="px-4 py-2.5 rounded-full font-bold text-xs bg-red-600 hover:bg-red-700 text-white shadow-lg flex items-center gap-2 cursor-pointer transition-all ml-1 sm:ml-2"
                      title="Finish Observation & Review Reports"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Finish & Grade</span>
                    </button>
                  )}

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
                  <div className="w-full rounded-2xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 transition-all">
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
                          Listening to live student and AI facilitator speeches. Use Start GD below to launch the AI Facilitator opening.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {session.status !== 'completed' && (
                        <button
                          type="button"
                          id="console-start-gd-btn"
                          onClick={() => {
                            roomVoice.unlock();
                            setSession((prev) => ({
                              ...prev,
                              status: 'active',
                              startedAt: prev.startedAt || Date.now(),
                            }));
                            if (rtcStartSession) {
                              rtcStartSession(session.topic);
                            }
                            if (onStartSession) {
                              onStartSession(session.id);
                            }
                            setTimeout(() => {
                              handleInitiateOpeningSpeaker(true);
                            }, 350);
                          }}
                          className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 ${
                            !isSessionActive
                              ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400/50 animate-pulse'
                              : 'bg-emerald-700 hover:bg-emerald-600'
                          }`}
                          title={!isSessionActive ? 'Start Group Discussion & Deliver AI Opening Speech' : 'Restart Discussion & Deliver AI Opening Speech'}
                        >
                          {!isSessionActive ? (
                            <>
                              <Play className="w-3.5 h-3.5 fill-white" />
                              <span>Start GD</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Restart GD</span>
                            </>
                          )}
                        </button>
                      )}
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
                ) : !rtcIsMicMuted && isListeningMic ? (
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
                          onClick={handleToggleMic}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-rose-200 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow"
                          title="Mute your microphone"
                        >
                          <MicOff className="w-3 h-3 text-rose-400" />
                          <span>Mute</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAudioTestModal(true)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow"
                          title="Open Audio & Microphone Test"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>Test Audio</span>
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
                  <div className="w-full rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 border-2 border-rose-600/60 p-3 sm:p-3.5 shadow-lg shadow-rose-950/20 transition-all animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-400">
                          <MicOff className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                            Microphone Muted
                          </span>
                          <p className="text-[11px] text-slate-400">
                            Other participants cannot hear you. Click "Unmute Mic" when you are ready to speak.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleToggleMic}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-950/40"
                          title="Unmute your microphone to speak"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Unmute Mic</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAudioTestModal(true)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-slate-700 shadow"
                          title="Open Audio & Microphone Test"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">Test Audio</span>
                        </button>
                      </div>
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

      {/* Graceful Video Finalizing & Saving Overlay */}
      {isFinalizingRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse shadow-inner">
              <Video className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-white">Finalizing & Saving HD Video Recording...</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Compositing participant video tracks and persisting the discussion session archive to the university server. Please wait a moment.
            </p>
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

            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center shadow-inner">
              {!hasVideoTrackModal && (
                <div className="absolute inset-0 bottom-12 z-10 bg-gradient-to-b from-slate-900 via-indigo-950/70 to-slate-900 flex flex-col items-center justify-center p-6 text-center pointer-events-none select-none">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-500/10">
                    <Mic className="w-7 h-7 animate-pulse" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Live Discussion Audio Active</span>
                  </div>
                  <h4 className="text-white font-bold text-sm sm:text-base max-w-md truncate mb-1">
                    {session.topic || 'Group Discussion'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mb-3">
                    Verbal discussion audio recorded. Use the media player controls below for playback and scrubbing.
                  </p>
                  <div className="flex items-center gap-1 h-5">
                    {[40, 70, 100, 60, 85, 35, 95, 50, 80, 65, 45, 90].map((h, i) => (
                      <span
                        key={i}
                        className="w-1 bg-indigo-400 rounded-full animate-pulse"
                        style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <video
                controls
                autoPlay
                playsInline
                src={gdRecorder.recordingUrl || session.recordingUrl}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth === 0 || v.videoHeight === 0) {
                    setHasVideoTrackModal(false);
                  } else {
                    setHasVideoTrackModal(true);
                  }
                }}
                className="w-full h-full object-contain relative z-0"
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
const VideoStreamPlayer: React.FC<{
  stream: MediaStream;
  className?: string;
  muted?: boolean;
  participantId?: string;
  seatNumber?: number;
  isUser?: boolean;
}> = ({ stream, className, muted = true, participantId, seatNumber, isUser }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Isolate live video tracks into a pure video stream to prevent audio-policy restrictions from blocking autoplay
  const videoTracks = useMemo(() => {
    return stream ? stream.getVideoTracks().filter((t) => t.readyState !== 'ended') : [];
  }, [stream]);

  const pureVideoStream = useMemo(() => {
    if (!stream) return null;
    const liveTracks = stream.getVideoTracks().filter((t) => t.readyState !== 'ended');
    if (liveTracks.length === 0) return stream;
    return new MediaStream(liveTracks);
  }, [stream, videoTracks.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pureVideoStream) return;

    // Direct DOM property enforcement required for browser WebRTC autoplay compliance
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    try {
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
    } catch {}

    if (video.srcObject !== pureVideoStream) {
      video.srcObject = pureVideoStream;
    }

    const forcePlay = () => {
      if (!video) return;
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    };

    forcePlay();

    const handleUnmute = () => {
      if (!video) return;
      video.muted = true;
      if (video.srcObject !== pureVideoStream) {
        video.srcObject = pureVideoStream;
      }
      forcePlay();
    };

    videoTracks.forEach((track) => {
      track.addEventListener('unmute', handleUnmute);
    });

    const handleTrackAdded = () => {
      forcePlay();
    };
    pureVideoStream.addEventListener('addtrack', handleTrackAdded);

    return () => {
      videoTracks.forEach((track) => {
        track.removeEventListener('unmute', handleUnmute);
      });
      pureVideoStream.removeEventListener('addtrack', handleTrackAdded);
    };
  }, [pureVideoStream, videoTracks]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        v.muted = true;
        v.play().catch(() => {});
      }}
      onCanPlay={(e) => {
        const v = e.currentTarget;
        v.muted = true;
        v.play().catch(() => {});
      }}
      data-participant-id={participantId || ''}
      data-seat-number={seatNumber !== undefined ? String(seatNumber) : ''}
      data-is-user={isUser ? 'true' : 'false'}
      data-stream-id={pureVideoStream?.id || ''}
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
  position?: 'top' | 'bottom';
  seatAngle?: number;
  leftPct?: number;
  topPct?: number;
}> = ({
  student,
  isCurrentSpeaker = false,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  size = 'normal',
  isFaculty = false,
  position,
  seatAngle,
  leftPct,
  topPct,
}) => {
  const isUser = !isFaculty && !!student.isUser;
  const effectiveStream = isUser ? videoStream : student.videoStream;
  const isCameraEnabled = isUser ? isUserCameraOn : student.cameraActive === true;
  const hasRemoteVideoTrack =
    !isUser &&
    !!effectiveStream &&
    effectiveStream.getVideoTracks().some((t) => t.readyState !== 'ended');
  const isLiveWebcam =
    (isUser && isUserCameraOn && !!videoStream) ||
    (!isUser && isCameraEnabled && !!effectiveStream && hasRemoteVideoTrack);
  const isMicLive = isUser ? isListeningMic : (isCurrentSpeaker || student.isSpeaking);

  // Clear human face portrait avatar fallback (using SVG Avataaars portraits seeded by name)
  const rawAvatar = student.avatar || (
    student.name
      ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(student.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
      : ''
  );
  const resolvedAvatar = rawAvatar.replace(/\/lorelei\//g, '/avataaars/');

  // Inward-facing orientation for human avatars:
  // Around the circular round table, participants face INWARD directly toward the table center (50%, 50%):
  // - Students at the BOTTOM of the table: Face directly forward/up into the table (zero sideways rotation).
  // - Students on the LEFT of the table: Face inward to the right (toward table center).
  // - Students on the RIGHT of the table: Face inward to the left (toward table center).
  // - Students at the TOP of the table: Face directly forward/down into the table.
  const dx = (leftPct !== undefined ? 50 - leftPct : (seatAngle !== undefined ? -Math.cos(seatAngle) * 35 : 0));
  const dy = (topPct !== undefined ? 50 - topPct : (seatAngle !== undefined ? -Math.sin(seatAngle) * 35 : 0));

  // Inward rotation: dx > 0 means table is to the right (+Y rotation); dx < 0 means table is to the left (-Y rotation)
  const rotY = Math.max(-22, Math.min(22, dx * 0.7));
  // Inward tilt: dy > 0 means table is below (-X rotation); dy < 0 means table is above (+X rotation)
  const rotX = Math.max(-14, Math.min(14, -dy * 0.42));

  const faceTransform = `perspective(500px) rotateY(${rotY.toFixed(1)}deg) rotateX(${rotX.toFixed(1)}deg)`;

  return (
    <div className="relative w-full h-full rounded-inherit overflow-hidden bg-slate-900 flex items-center justify-center select-none">
      {/* 1. Camera Feed / Avatar Image / Empty Waiting Seat */}
      {student.isEmptySeat ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100/70 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500">
          <User className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-0.5" />
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">Empty</span>
        </div>
      ) : isLiveWebcam && effectiveStream ? (
        <VideoStreamPlayer 
          stream={effectiveStream} 
          muted={true}
          participantId={student.id}
          seatNumber={student.seatNumber}
          isUser={isUser}
          className={`w-full h-full object-cover ${isUser ? 'transform -scale-x-100' : ''}`} 
        />
      ) : isCameraEnabled ? (
        resolvedAvatar ? (
          <img
            src={resolvedAvatar}
            alt={student.name}
            className="w-full h-full object-cover bg-slate-800 transition-transform duration-500 ease-out"
            style={{ transform: faceTransform }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-indigo-700 to-purple-600 text-white">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold uppercase shadow-inner">
              {student.name.charAt(0)}
            </div>
          </div>
        )
      ) : (
        /* Camera Off Fallback Placeholder with Inward-Facing Animated Face */
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-300 relative">
          {resolvedAvatar ? (
            <img
              src={resolvedAvatar}
              alt={student.name}
              className="w-full h-full object-cover opacity-85 transition-transform duration-500 ease-out"
              style={{ transform: faceTransform }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 uppercase">
              {student.name.charAt(0)}
            </div>
          )}
          <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center pointer-events-none">
            <VideoOff className="w-3.5 h-3.5 text-rose-400 drop-shadow" />
          </div>
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
              <span className="w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s]" style={{ height: size === 'large' ? '14px' : '9px' }} />
              <span className="w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]" style={{ height: size === 'large' ? '18px' : '12px' }} />
              <span className="w-1 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]" style={{ height: size === 'large' ? '12px' : '8px' }} />
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
  position?: 'top' | 'bottom';
  zoomLevel?: 'zoomed' | 'neighbor' | 'dimmed' | 'normal';
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  isFaculty?: boolean;
  onAddNote?: (student: Student) => void;
  onEnlarge?: (student: Student) => void;
  seatAngle?: number;
  leftPct?: number;
  topPct?: number;
}> = ({
  student,
  isCurrentSpeaker,
  position = 'top',
  zoomLevel = 'normal',
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
  onAddNote,
  onEnlarge,
  seatAngle,
  leftPct,
  topPct,
}) => {
  const isUser = !isFaculty && !!student.isUser;
  const isZoomedSpeaker = isCurrentSpeaker || zoomLevel === 'zoomed' || student.isSpeaking;

  return (
    <div 
      onDoubleClick={() => !student.isEmptySeat && onEnlarge?.(student)}
      title={student.isEmptySeat ? 'Open Desk' : `${student.name} • Double-click to enlarge spotlight`}
      className={`flex flex-col items-center group pointer-events-auto transition-transform duration-300 ${
        student.isEmptySeat ? '' : 'cursor-pointer'
      } z-20`}
    >
      
      {/* 1. Realistic Numbered Seat Placard (Pinned cleanly at top, in natural flex flow) */}
      <div className={`mb-1 whitespace-nowrap px-2.5 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold font-mono shadow-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
        isZoomedSpeaker
          ? 'bg-emerald-600 text-white border-2 border-emerald-300 shadow-emerald-500/40 ring-2 ring-emerald-400'
          : isUser 
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
        {isZoomedSpeaker && <span className="text-[10px] bg-white/30 px-1.5 py-0.2 rounded font-black tracking-wide animate-pulse">🎙️ SPEAKER</span>}
        {isUser && !isZoomedSpeaker && <span className="text-[9px] bg-white/20 px-1 rounded">YOU</span>}
        {student.isRealPeer && !isUser && !isZoomedSpeaker && <span className="text-[9px] bg-emerald-400 text-emerald-950 px-1 rounded font-bold">LIVE</span>}
        {student.isEmptySeat && <span className="text-[9px] opacity-70">OPEN</span>}
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
            <Bookmark className="w-3 h-3 fill-current" />
          </button>
        )}
      </div>

      {/* 2. Student Video / Avatar Bubble (Stable dimensions with active speaker ring & glow) */}
      <div className="relative">
        {/* Speaking Voice Waves Aura */}
        {isZoomedSpeaker && (
          <>
            <div className="absolute -inset-3 rounded-3xl bg-emerald-500/30 animate-ping opacity-60 pointer-events-none" />
            <div className="absolute -inset-2 rounded-3xl bg-emerald-500/25 animate-pulse pointer-events-none" />
          </>
        )}

        <div className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl sm:rounded-3xl overflow-hidden border-2 transition-all duration-300 shadow-md relative bg-slate-900 ${
          isZoomedSpeaker
            ? 'border-emerald-400 dark:border-emerald-300 ring-4 ring-emerald-500/80 shadow-2xl shadow-emerald-500/50 scale-105'
            : student.isEmptySeat
            ? 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-900/60 shadow-none'
            : isUser 
            ? 'border-blue-500 dark:border-blue-500/80 ring-2 ring-blue-500/30' 
            : student.isRealPeer
            ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/30'
            : 'border-slate-300 dark:border-slate-700'
        }`}>
          <StudentVideoFrame
            student={student}
            isCurrentSpeaker={isCurrentSpeaker || isZoomedSpeaker}
            isUserCameraOn={isUserCameraOn}
            videoStream={videoStream}
            audioLevel={audioLevel}
            isListeningMic={isListeningMic}
            size="normal"
            isFaculty={isFaculty}
            position={position}
            seatAngle={seatAngle}
            leftPct={leftPct}
            topPct={topPct}
          />

          {!student.isEmptySeat && onEnlarge && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEnlarge(student);
              }}
              className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-900/85 hover:bg-indigo-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer shadow-md"
              title={`Enlarge spotlight for ${student.name} (or double-click)`}
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Student Name & Turns (Positioned cleanly below avatar with zero overlap) */}
      <div className="text-center mt-1 max-w-[100px] sm:max-w-[120px] flex flex-col items-center">
        <p className={`font-semibold truncate leading-tight ${
          isZoomedSpeaker
            ? 'text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-bold'
            : 'text-xs sm:text-sm'
        } ${
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
        <span className={`font-mono block mt-0.5 ${isZoomedSpeaker ? 'text-[10px] text-emerald-700 dark:text-emerald-400 font-bold' : 'text-[10px] text-slate-500 dark:text-slate-400'}`}>
          {student.isEmptySeat ? 'Waiting...' : `${student.speakingTurns || 0} turns • ${student.speakingDurationSeconds || 0}s`}
        </span>
        {isZoomedSpeaker && (
          <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black tracking-wider uppercase shadow-md animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping inline-block" />
            Speaking
          </span>
        )}
      </div>

    </div>
  );
};
