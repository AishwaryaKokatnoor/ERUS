import React, { useState, useEffect, useRef } from 'react';
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
  GraduationCap
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry, GDFacilitatorPhase, GDRoomLayoutType } from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { roomVoice, facilitatorVoice } from '../../utils/speechSynthesis';
import { useUserMedia } from '../../utils/useUserMedia';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from '../../utils/facilitatorQuestionEngine';
import { SlotSelectionModal } from './SlotSelectionModal';
import { getSocket } from '../../utils/socket';

interface RealisticGDRoomProps {
  session: GDSession;
  setSession: React.Dispatch<React.SetStateAction<GDSession>>;
  transcripts: TranscriptEntry[];
  setTranscripts: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
  onFinishSession: () => void;
  voiceMuted: boolean;
  elapsedSeconds: number;
  availableSlots?: GDSession[];
  onSelectSlot?: (slotId: string) => void;
  onResetSlots?: () => void;
  currentUser?: AuthUser | null;
  onUpdateLayout?: (layout: GDRoomLayoutType) => void;
}

export const RealisticGDRoom: React.FC<RealisticGDRoomProps> = ({
  session,
  setSession,
  transcripts,
  setTranscripts,
  onFinishSession,
  voiceMuted,
  elapsedSeconds,
  availableSlots = [],
  onSelectSlot,
  onResetSlots,
  currentUser,
  onUpdateLayout,
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
  const [autoSimulatePeers, setAutoSimulatePeers] = useState(false);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<GDRoomLayoutType>(session.roomLayout || 'round_table');

  const isFaculty = currentUser?.role === 'faculty';

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
    const userStudent = session.students.find((s) => s.isUser);
    if (userStudent) {
      try {
        const socket = getSocket();
        socket.emit('media_toggle', {
          roomId: session.id,
          studentId: userStudent.id,
          cameraActive: isCameraOn,
        });
      } catch (e) {}
    }
    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.isUser ? { ...s, cameraActive: isCameraOn } : s)),
    }));
  }, [isCameraOn, isFaculty, setSession, session.id]);

  const handleLayoutChange = (newLayout: GDRoomLayoutType) => {
    setCurrentLayout(newLayout);
    setSession((prev) => ({ ...prev, roomLayout: newLayout }));
    if (onUpdateLayout) {
      onUpdateLayout(newLayout);
    }
    try {
      const socket = getSocket();
      socket.emit('layout_change', { roomId: session.id, layout: newLayout });
    } catch (e) {}
  };

  // Socket listener for room layout updates and facilitator broadcasts from other clients
  useEffect(() => {
    const socket = getSocket();
    const handleLayoutUpdated = (data: { layout: GDRoomLayoutType }) => {
      if (data?.layout) {
        setCurrentLayout(data.layout);
        setSession((prev) => ({ ...prev, roomLayout: data.layout }));
      }
    };
    const handleFacilitatorSpoken = (data: { speech: string; actionType?: string; phase?: any }) => {
      if (data?.speech) {
        setSession((prev) => ({
          ...prev,
          facilitatorSpeech: data.speech,
          facilitatorAction: data.actionType || prev.facilitatorAction,
          isFacilitatorSpeaking: true,
          currentPhase: data.phase || prev.currentPhase,
          silenceTimerSeconds: 0,
        }));
        facilitatorVoice.speak(data.speech, () => {
          setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
          setIsAiProcessing(false);
        });
      }
    };

    socket.on('layout_updated', handleLayoutUpdated);
    socket.on('facilitator_spoken', handleFacilitatorSpoken);

    return () => {
      socket.off('layout_updated', handleLayoutUpdated);
      socket.off('facilitator_spoken', handleFacilitatorSpoken);
    };
  }, []);

  const latestSpeakerTranscript = transcripts.slice().reverse().find((t) => !t.isFacilitator);
  const activeStudentUser = !isFaculty ? session.students.find((s) => s.isUser) : null;
  const currentSpeakerStudent = session.students.find((s) => s.id === session.currentSpeakerId) ||
    (isListeningMic && !isFaculty ? activeStudentUser : null) ||
    session.students.find((s) => s.id === latestSpeakerTranscript?.speakerId) ||
    session.students.find((s) => s.isSpeaking) ||
    activeStudentUser ||
    session.students[0];
  const isSpeakingLive = !!(session.currentSpeakerId || (isListeningMic && !isFaculty) || session.students.some((s) => s.isSpeaking));
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const studentTurnsSinceIntervention = useRef<number>(0);

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
          if (!isFaculty) {
            setSession((prev) => ({
              ...prev,
              students: prev.students.map((s) => (s.isUser ? { ...s, micActive: false } : s)),
            }));
          }
        };

        recognition.onend = () => {
          // If mic is supposed to remain on (user didn't mute), restart recognition like Google Meet
          if (isListeningMicRef.current) {
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
  }, [isFaculty, stopAudioAnalyser]);

  const toggleMicRecognition = () => {
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
  const speakFacilitator = (text: string, actionType: string = 'probing_question', phase?: GDFacilitatorPhase) => {
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

    // Broadcast facilitator prompt to all clients in room
    try {
      const socket = getSocket();
      socket.emit('facilitator_speak', {
        roomId: session.id,
        transcript: entry,
        speech: text,
        actionType,
        phase,
      });
    } catch (e) {}

    facilitatorVoice.speak(text, () => {
      setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      setIsAiProcessing(false);
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

      try {
        const socket = getSocket();
        socket.emit('facilitator_speak', {
          roomId: session.id,
          transcript: facultyEntry,
          speech: text,
          actionType: 'moderation',
        });
      } catch (e) {}

      // Vocalize faculty intervention through facilitator voice engine
      facilitatorVoice.speak(text, () => {
        setIsAiProcessing(false);
      });

      // Peer responds to faculty directive
      if (autoSimulatePeers) {
        setTimeout(() => {
          scheduleNextTurnAfterUser();
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

    // Broadcast user speech statement to the room
    try {
      const socket = getSocket();
      socket.emit('user_speak', {
        roomId: session.id,
        transcript: newEntry,
        studentId: userStudent.id,
        text,
        elapsedSeconds,
      });
    } catch (e) {}

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

      try {
        const socket = getSocket();
        socket.emit('speaker_yield', {
          roomId: session.id,
          studentId: userStudent.id,
        });
      } catch (e) {}

      // If auto simulate is enabled, trigger peer response
      if (autoSimulatePeers) {
        scheduleNextTurnAfterUser();
      }
    }, 4000);
  };

  handleSendUserStatementRef.current = handleSendUserStatement;

  // Simulate realistic peer turns to make the room alive (calls backend or uses fallback)
  const scheduleNextTurnAfterUser = async () => {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/session/simulate-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elapsedSeconds, excludeStudentId: isFaculty ? undefined : (activeStudentUser?.id || 's1') }),
        });
        const data = await res.json();

        if (data.success && data.transcript && data.student) {
          const peer = data.student;
          studentTurnsSinceIntervention.current += 1;
          setSession((prev) => ({
            ...prev,
            currentSpeakerId: peer.id,
            silenceTimerSeconds: 0,
            students: prev.students.map((s) =>
              s.id === peer.id
                ? {
                    ...s,
                    isSpeaking: true,
                    speakingTurns: s.speakingTurns + 1,
                    speakingDurationSeconds: s.speakingDurationSeconds + 20,
                  }
                : { ...s, isSpeaking: false }
            ),
          }));

          setTranscripts((prev) => [...prev, data.transcript]);

          // Audibly speak as the peer student!
          roomVoice.speakAsStudent(peer, data.transcript.text, () => {
            setSession((prev) => ({
              ...prev,
              currentSpeakerId: null,
              students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
            }));

            if (studentTurnsSinceIntervention.current >= 3) {
              requestAiIntervention('probing');
            }
          });
          return;
        }
      } catch (err) {
        console.warn('Simulate peer API fallback:', err);
      }

      // Fallback local simulation if offline
      const candidates = isFaculty ? session.students : session.students.filter((s) => !s.isUser);
      if (!candidates || candidates.length === 0) return;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      studentTurnsSinceIntervention.current += 1;
      
      const peerArguments: Record<string, string[]> = {
        'Should Artificial Intelligence replace teachers?': [
          'Building on the previous thought, AI personalized tutoring can identify learning gaps in real-time, allowing teachers to spend more quality time on one-on-one emotional mentorship.',
          'I would like to offer a counterpoint. What about the digital divide in rural schools? If we rely heavily on AI, students without high-speed access will fall further behind.',
          'Looking at the assessment aspect, AI eliminates subjective bias in grading essays and STEM assignments, making competitive evaluations fairer.',
          'However, the ability to inspire curiosity and cultivate moral ethics is uniquely human. An algorithm cannot teach empathy through life experience.',
          'From an administrative view, AI assistants can automate syllabus planning, freeing up 10+ hours a week for professors to do research.',
          'What about critical thinking in philosophy or creative writing? AI can generate prose, but cannot teach the visceral experience of original existential thought.',
        ],
        default: [
          'I agree with the previous perspective, but we must also examine the economic viability and infrastructure costs.',
          'Could we also consider how international regulatory standards might influence this implementation?',
          'In my view, a hybrid phased approach offers the safest transition without disrupting current workflows.',
          'We should also analyze user privacy and data ownership policies before deploying at national scale.',
        ],
      };

      const pool = peerArguments[session.topic] || peerArguments.default;
      const peerText = pool[Math.floor(Math.random() * pool.length)];

      const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
      const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

      // Set peer speaking
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: chosen.id,
        silenceTimerSeconds: 0,
        students: prev.students.map((s) =>
          s.id === chosen.id
            ? {
                ...s,
                isSpeaking: true,
                speakingTurns: s.speakingTurns + 1,
                speakingDurationSeconds: s.speakingDurationSeconds + 20,
              }
            : { ...s, isSpeaking: false }
        ),
      }));

      setTranscripts((prev) => [
        ...prev,
        {
          id: `t-peer-${Date.now()}`,
          sessionId: session.id,
          speakerId: chosen.id,
          speakerName: chosen.name,
          seatNumber: chosen.seatNumber,
          isFacilitator: false,
          timestamp: `${mins}:${secs}`,
          timestampSeconds: elapsedSeconds,
          text: peerText,
          type: 'statement',
          sentiment: 'positive',
        },
      ]);

      // Audibly speak as the chosen peer student!
      roomVoice.speakAsStudent(chosen, peerText, () => {
        setSession((prev) => ({
          ...prev,
          currentSpeakerId: null,
          students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
        }));

        if (studentTurnsSinceIntervention.current >= 3) {
          requestAiIntervention('probing');
        }
      });
    }, 2000);
  };

  const handleRaiseHandToggle = () => {
    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    if (userStudent) {
      try {
        const socket = getSocket();
        socket.emit('hand_raise_toggle', {
          roomId: session.id,
          studentId: userStudent.id,
        });
      } catch (e) {}
    }
    setSession((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === userStudent?.id ? { ...s, hasRaisedHand: !s.hasRaisedHand } : s
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                {session.slotName ? session.slotName : `Session #${session.id}`}
              </span>
              {session.slotTiming && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>{session.slotTiming}</span>
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Difficulty: {session.difficulty}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {session.enrolledCount ?? session.students.length} / {session.maxCapacity || 15} Students
              </span>
            </div>
            
            <h1 className="text-lg sm:text-xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
              {session.topic}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl line-clamp-1">
              {session.description}
            </p>
          </div>

          {/* Quick Facilitator Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="ai-probe-btn"
              onClick={() => requestAiIntervention('probing')}
              disabled={isAiProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask Probing Question</span>
            </button>

            <button
              id="ai-rules-btn"
              onClick={() => speakFacilitator("Discussion Rules: 1. Speak one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us maintain balanced dialogue.", 'explain_rules', 'rules')}
              disabled={isAiProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Explain Rules</span>
            </button>

            <button
              id="finish-session-btn"
              onClick={onFinishSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Conclude & Report</span>
            </button>
          </div>
        </div>

        {/* Student Slot Selector: Browse & Select Slots on the same topic */}
        {availableSlots && availableSlots.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Available Slots:</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableSlots
                  .filter((slot) => slot.topic === session.topic)
                  .map((slot) => {
                    const maxCap = slot.maxCapacity || 15;
                    const enrolled = slot.enrolledCount ?? slot.students?.length ?? 15;
                    const isFull = enrolled >= maxCap;
                    const isCurrent = slot.id === session.id;
                    const seatsLeft = Math.max(0, maxCap - enrolled);

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          if (isFull && !isCurrent) {
                            alert(`Slot "${slot.slotName || slot.id}" is full (${enrolled}/${maxCap} students). Please select an open slot.`);
                            return;
                          }
                          onSelectSlot && onSelectSlot(slot.id);
                        }}
                        disabled={isFull && !isCurrent}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-indigo-600 text-white font-medium shadow-2xs cursor-default'
                            : isFull
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 opacity-70 cursor-not-allowed'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 cursor-pointer'
                        }`}
                      >
                        <span>{slot.slotName || slot.id}</span>
                        {slot.slotTiming && (
                          <span className={`text-[10px] font-mono ${isCurrent ? 'text-indigo-100' : 'text-slate-400'}`}>
                            ({slot.slotTiming})
                          </span>
                        )}
                        <span className={`text-[10px] font-mono px-1 rounded ${
                          isCurrent 
                            ? 'bg-white/20 text-white' 
                            : isFull 
                            ? 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300' 
                            : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {enrolled}/{maxCap}
                        </span>
                      </button>
                    );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {onResetSlots && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all demo slots back to default enrollment counts?')) {
                      onResetSlots();
                    }
                  }}
                  className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Reset slots to default demo counts"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Demo Slots</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSlotModalOpen(true)}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>All Slots ({availableSlots.length})</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Interruption Warning Alert banner */}
        {interruptionWarning && (
          <div className="mt-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{interruptionWarning}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Realistic Seating Layout (Left 7-8 Cols) + Sidebar Hub (Right 4-5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* LEFT: Realistic 2.5D Virtual Conference Seating Room */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-md dark:shadow-2xl relative min-h-[580px] flex flex-col justify-between overflow-hidden transition-colors duration-200">
            
            {/* Ambient Lighting & Stage Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.04),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_45%,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />

            {/* Room Visibility & Layout Selector Toolbar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Room Layout:</span>
                </span>
                {currentUser?.role === 'faculty' && (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Faculty Control
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => handleLayoutChange('round_table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    currentLayout === 'round_table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Round Table: Circular discussion table"
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span>Round Table</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLayoutChange('speaker_center')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    currentLayout === 'speaker_center'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Speaker Spotlight: Focus spotlight on active speaker"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Speaker Spotlight</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLayoutChange('classroom')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    currentLayout === 'classroom'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Classroom: Front stage and audience desks"
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Classroom</span>
                </button>
              </div>
            </div>

            {/* Top Stage: AI Facilitator Station */}
            <div className="relative z-10 flex items-center justify-between gap-3 py-2 px-3 sm:px-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 mb-3">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  session.isFacilitatorSpeaking 
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/40 animate-speaking' 
                    : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">AI Facilitator</span>
                    {session.isFacilitatorSpeaking ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Speaking
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">Moderating</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 text-xs text-slate-600 dark:text-slate-300 italic truncate sm:overflow-visible sm:whitespace-normal">
                "{session.facilitatorSpeech}"
              </div>
            </div>

            {/* Middle Stage: The 3 Layout Visibility Types */}

            {/* 1. ROUND TABLE LAYOUT */}
            {currentLayout === 'round_table' && (
              <div className="relative z-10 my-2 flex-1 flex flex-col items-center justify-center gap-3 w-full">
                {/* Top Row of Participants */}
                <div className="w-full flex items-center justify-center gap-2 sm:gap-3 flex-wrap py-1">
                  {session.students.slice(0, Math.ceil(session.students.length / 2)).map((student) => (
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
                    />
                  ))}
                </div>

                {/* Center Table Surface */}
                <div className="w-full max-w-xl py-3 px-6 rounded-2xl bg-slate-100/90 dark:bg-slate-850/80 border border-slate-200/90 dark:border-slate-800 shadow-inner flex flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                      Conference Table • {session.students.length} Participants
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 max-w-md">
                    {session.topic}
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
                    <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                    <span>
                      {session.currentSpeakerId 
                        ? `Floor: ${session.students.find(s => s.id === session.currentSpeakerId)?.name}` 
                        : 'Floor: Open Discussion'}
                    </span>
                  </div>
                </div>

                {/* Bottom Row of Participants */}
                <div className="w-full flex items-center justify-center gap-2 sm:gap-3 flex-wrap py-1">
                  {session.students.slice(Math.ceil(session.students.length / 2)).map((student) => (
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
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 2. SPEAKER IN MIDDLE OF ROUND TABLE LAYOUT */}
            {currentLayout === 'speaker_center' && (
              <div className="relative z-10 my-2 flex-1 flex flex-col items-center justify-center gap-3 w-full">
                {/* Top Row of Participants */}
                <div className="w-full flex items-center justify-center gap-2 sm:gap-3 flex-wrap py-1">
                  {session.students.slice(0, Math.ceil(session.students.length / 2)).map((student) => (
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
                    />
                  ))}
                </div>

                {/* Spotlight Active Speaker */}
                <div className="w-full max-w-md p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3.5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-900">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {currentSpeakerStudent?.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                        Seat {currentSpeakerStudent?.seatNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <Radio className="w-3 h-3 animate-pulse" />
                        {isSpeakingLive ? 'Speaking Live' : 'Spotlight'}
                      </span>
                      <span>•</span>
                      <span>{currentSpeakerStudent?.speakingTurns || 0} turns</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 italic line-clamp-2 mt-1">
                      "{latestSpeakerTranscript?.text || (currentSpeakerStudent?.isSpeaking ? 'Addressing all participants...' : 'Leading this turn in the discussion.')}"
                    </p>
                  </div>
                </div>

                {/* Bottom Row of Participants */}
                <div className="w-full flex items-center justify-center gap-2 sm:gap-3 flex-wrap py-1">
                  {session.students.slice(Math.ceil(session.students.length / 2)).map((student) => (
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
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 3. CLASSROOM PRESENTATION LAYOUT */}
            {currentLayout === 'classroom' && (
              <div className="relative z-10 my-3 flex-1 flex flex-col items-center justify-center w-full space-y-4">
                
                {/* Front of Classroom: Presentation Board & Podium */}
                <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-lg text-white relative overflow-hidden">
                  
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
                      <span className="absolute -bottom-2 bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs border border-indigo-400/40 whitespace-nowrap z-20">
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
                      {session.students.slice(0, 5).map((student) => (
                        <ClassroomDeskCard
                          key={student.id}
                          student={student}
                          isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
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
                      {session.students.slice(5, 10).map((student) => (
                        <ClassroomDeskCard
                          key={student.id}
                          student={student}
                          isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                          isUserCameraOn={isCameraOn}
                          videoStream={videoStream}
                          audioLevel={audioLevel}
                          isListeningMic={isListeningMic}
                          isFaculty={isFaculty}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Row 3 (Back Row): Seats 11 to 15+ */}
                  {session.students.length > 10 && (
                    <div className="bg-slate-100/90 dark:bg-slate-850/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span>Row 3 • Back Row Desks</span>
                        <span>Seats 11 – {session.students.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {session.students.slice(10).map((student) => (
                          <ClassroomDeskCard
                            key={student.id}
                            student={student}
                            isCurrentSpeaker={student.id === currentSpeakerStudent?.id}
                            isUserCameraOn={isCameraOn}
                            videoStream={videoStream}
                            audioLevel={audioLevel}
                            isListeningMic={isListeningMic}
                            isFaculty={isFaculty}
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
                    className={`relative p-3 rounded-full font-semibold transition-all shadow-lg flex items-center justify-center cursor-pointer ${
                      isListeningMic
                        ? 'bg-red-600 hover:bg-red-700 text-white ring-4 ring-red-500/40 animate-pulse'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                    title={
                      isFaculty
                        ? (isListeningMic ? 'Stop Speaking (Moderator Mic Live)' : 'Push to Speak as Faculty Moderator')
                        : (isListeningMic ? 'Mute Microphone (Speaking Active)' : 'Unmute Microphone (Push to Speak)')
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
                    onClick={() => scheduleNextTurnAfterUser()}
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
                  <div className="w-full rounded-2xl bg-emerald-950/40 border border-emerald-500/40 p-3 sm:p-3.5 shadow-sm transition-all animate-fadeIn">
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
                          {isFaculty
                            ? 'Unmute microphone to speak live to the room, or click directives below.'
                            : 'Click Unmute to speak live to the room — no typing or send button needed.'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={toggleMicRecognition}
                      className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Unmute & Speak Live</span>
                    </button>
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col h-[580px] transition-colors duration-200">
            
            {/* Sidebar Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5 mb-3">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                <button
                  id="tab-transcript-sub"
                  onClick={() => setActiveTab('transcript')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'transcript'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Transcript ({transcripts.length})
                </button>
                <button
                  id="tab-rules-sub"
                  onClick={() => setActiveTab('rules')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'rules'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Rules
                </button>
                <button
                  id="tab-analytics-sub"
                  onClick={() => setActiveTab('analytics')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'analytics'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Turn Meter
                </button>
                <button
                  id="tab-breakout-sub"
                  onClick={() => setActiveTab('breakout')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    activeTab === 'breakout'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Rooms
                </button>
              </div>
            </div>

            {/* TAB 1: Live Timestamped Transcript Stream */}
            {activeTab === 'transcript' && (
              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                {transcripts.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-2.5 rounded-xl border text-xs leading-relaxed transition-all ${
                      entry.isFacilitator
                        ? 'bg-slate-50 dark:bg-slate-850/80 border-l-2 border-l-indigo-500 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                        : entry.speakerId === 's1'
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-l-2 border-l-indigo-400 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                        : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-mono-code">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${entry.isFacilitator ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {entry.speakerName}
                        </span>
                        {entry.seatNumber && (
                          <span className="px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-medium">
                            Seat {entry.seatNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 dark:text-slate-500">{entry.timestamp}</span>
                    </div>
                    <p className="font-normal text-slate-700 dark:text-slate-300">{entry.text}</p>
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

      {/* Discussion Slot Browser / Selection Modal */}
      <SlotSelectionModal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        availableSlots={availableSlots}
        currentSlotId={session.id}
        onSelectSlot={(slotId) => {
          if (onSelectSlot) {
            onSelectSlot(slotId);
          }
          setIsSlotModalOpen(false);
        }}
        onResetSlots={onResetSlots}
      />

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
      {/* 1. Camera Feed / Avatar Image */}
      {isLiveWebcam ? (
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
    </div>
  );
};

// Sub-Component: Student Pod Card with Numbered Seat Placard
const StudentPodCard: React.FC<{
  student: Student;
  isCurrentSpeaker: boolean;
  position?: 'top' | 'bottom';
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  isFaculty?: boolean;
}> = ({
  student,
  isCurrentSpeaker,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div className={`flex flex-col items-center transition-all duration-200 ${
      isCurrentSpeaker ? 'scale-105 z-10' : 'opacity-90 hover:opacity-100'
    }`}>
      {/* Student Video / Avatar Frame */}
      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border transition-all relative bg-slate-900 ${
        isCurrentSpeaker 
          ? 'border-emerald-500 ring-2 ring-emerald-500/40 shadow-sm animate-speaking' 
          : isUser 
          ? 'border-indigo-500 ring-1 ring-indigo-500/30' 
          : 'border-slate-200 dark:border-slate-700/80 shadow-2xs'
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

      {/* Student Name & Seat */}
      <div className="text-center mt-1 max-w-[70px] sm:max-w-[85px]">
        <div className="flex items-center justify-center gap-1">
          <span className={`text-[9px] font-mono px-1 rounded ${
            isUser 
              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            S{student.seatNumber}
          </span>
          <p className={`text-[11px] font-medium truncate leading-tight ${
            isUser ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
          }`}>
            {student.name.split(' ')[0]}
          </p>
        </div>
      </div>
    </div>
  );
};

// Sub-Component: Classroom Desk Card for Audience Students
const ClassroomDeskCard: React.FC<{
  student: Student;
  isCurrentSpeaker: boolean;
  isUserCameraOn?: boolean;
  videoStream?: MediaStream | null;
  audioLevel?: number;
  isListeningMic?: boolean;
  isFaculty?: boolean;
}> = ({
  student,
  isCurrentSpeaker,
  isUserCameraOn = false,
  videoStream = null,
  audioLevel = 0,
  isListeningMic = false,
  isFaculty = false,
}) => {
  const isUser = !isFaculty && !!student.isUser;

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
        isCurrentSpeaker
          ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/40 shadow-sm'
          : isUser
          ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border ${
          isCurrentSpeaker
            ? 'border-indigo-500 ring-2 ring-indigo-400'
            : isUser
            ? 'border-blue-500'
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
            isUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'
          }`}>
            {student.name.split(' ')[0]}
          </p>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          <span>{isUser ? 'You' : 'Audience'}</span>
          <span>{student.speakingTurns}t</span>
        </div>
      </div>
    </div>
  );
};

