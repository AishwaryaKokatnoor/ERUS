import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Play, CheckCircle2, 
  HelpCircle, Sparkles, Volume2, VolumeX, LogOut, MessageSquare, 
  Share2, Shield, Eye, Award, Clock, ArrowRight, ArrowLeft, UserCheck, 
  School, Radio, Laptop, GraduationCap, Monitor, ChevronLeft, ChevronRight,
  FileText, Send, X
} from 'lucide-react';
import { 
  GDSession, Student, TranscriptEntry, PresentationPhase, 
  PresentationAssessmentReport 
} from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { 
  PRESENTATION_OPENING_SCRIPT, 
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
  // Only real enrolled students in this session (No fake AI audience)
  const presentationStudents: Student[] = useMemo(() => {
    const raw = (session.students || []).filter((s) => !s.isEmptySeat && !s.id?.startsWith('ai-') && !s.id?.startsWith('stu-pres-'));
    if (raw.length > 0) {
      return raw.map((s, idx) => ({
        ...s,
        seatNumber: s.seatNumber || (idx + 1),
        name: s.isUser && currentUser?.name ? currentUser.name : (s.name || `Student ${idx + 1}`),
      }));
    }
    // Default to the logged-in student user as the sole presenter
    const collegeName = currentUser?.college || session.collegeCode || 'BMSIT';
    return [
      {
        id: currentUser?.id || 'stu-presenter-1',
        name: currentUser?.name || 'Vikram',
        seatNumber: 1,
        college: collegeName,
        course: 'Computer Science & Engineering',
        batch: '2024-2028',
        avatar: currentUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=presenter`,
        isUser: true,
        micActive: false,
        isSpeaking: false,
        hasRaisedHand: false,
        speakingDurationSeconds: 0,
        speakingTurns: 0,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      },
    ];
  }, [session.students, currentUser, session.collegeCode]);

  // Per-student individual assigned topics
  const studentTopics = useMemo(() => {
    return presentationStudents.map((s, idx) => {
      if (session.presentationTopics && session.presentationTopics[idx]) {
        return session.presentationTopics[idx];
      }
      return DEFAULT_PRESENTATION_TOPICS[idx] || session.topic || `Research & Applications in Engineering`;
    });
  }, [presentationStudents, session.presentationTopics, session.topic]);

  // Activity Execution State (Serial Flow per PDF specification)
  const [phase, setPhase] = useState<PresentationPhase>('opening');
  const [activeStudentIndex, setActiveStudentIndex] = useState<number>(0);
  const [presenterSeconds, setPresenterSeconds] = useState<number>(0);
  const [aiSpeech, setAiSpeech] = useState<string>(PRESENTATION_OPENING_SCRIPT);
  const [aiSpeaking, setAiSpeaking] = useState<boolean>(false);
  const [peerQAQuestion, setPeerQAQuestion] = useState<string>('');
  const [currentAiQuestion, setCurrentAiQuestion] = useState<PresentationAIQuestion | null>(null);
  const [isPeerQASilenceTriggered, setIsPeerQASilenceTriggered] = useState<boolean>(false);
  const [qaTimerSeconds, setQaTimerSeconds] = useState<number>(0);

  // User media (camera & mic)
  const { isCameraOn, videoStream, toggleCamera, audioLevel, startAudioAnalyser, stopAudioAnalyser } = useUserMedia();
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const [isRoomAudioMuted, setIsRoomAudioMuted] = useState<boolean>(voiceMuted);
  const [isSharingScreen, setIsSharingScreen] = useState<boolean>(false);

  // Persistent video ref for presenter webcam (eliminates 1s re-render flicker/glitch)
  const presenterVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (presenterVideoRef.current && videoStream && isCameraOn) {
      if (presenterVideoRef.current.srcObject !== videoStream) {
        presenterVideoRef.current.srcObject = videoStream;
        presenterVideoRef.current.play().catch(() => {});
      }
    }
  }, [videoStream, isCameraOn]);

  // Real Screen Sharing & Topic Slide Deck
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [slideMode, setSlideMode] = useState<'screen' | 'deck'>('deck');

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

  useEffect(() => {
    if (screenVideoRef.current && screenStream && isSharingScreen && slideMode === 'screen') {
      if (screenVideoRef.current.srcObject !== screenStream) {
        screenVideoRef.current.srcObject = screenStream;
        screenVideoRef.current.play().catch(() => {});
      }
    }
  }, [screenStream, isSharingScreen, slideMode]);

  // Live Speech Recognition for User
  const [liveSpeech, setLiveSpeech] = useState<string>('');
  const speechRecognitionRef = useRef<any>(null);
  const hasStartedOpeningRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  const isFaculty = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin';
  const currentStudentNumber = activeStudentIndex + 1;
  const currentPresenter = presentationStudents[activeStudentIndex] || presentationStudents[0];
  const currentTopic = studentTopics[activeStudentIndex] || session.topic;

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
    setTranscripts((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].text === clean && prev[prev.length - 1].isFacilitator === isFacilitator) {
        return prev;
      }
      return [...prev, newEntry];
    });
  };

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
    speakAI(PRESENTATION_OPENING_SCRIPT, () => {
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
  const handleFinalizeAllPresentations = () => {
    // Generate reports for all 6 students based on the 6 indicators
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

    console.log('[Classroom Presentation] Finalized reports for 6 students:', finalReports);
    onFinishSession();
  };

  // Answer Q&A and Transition to Next Student (Stage 4)
  const handleAcknowledgeAnswerAndProceed = () => {
    const clarification = currentAiQuestion?.clarification || 'Thank you for your response. Clear communication of technical concepts is essential.';
    const nextNum = currentStudentNumber + 1;

    if (nextNum > presentationStudents.length) {
      // Stage 5: Closing remarks
      setPhase('closing');
      speakAI(PRESENTATION_CLOSING_SCRIPT, () => {
        setPhase('completed');
        handleFinalizeAllPresentations();
      });
    } else {
      setPhase('transition');
      const transScript = `${clarification}\n\n${getTransitionScript(currentStudentNumber, nextNum)}`;
      speakAI(transScript, () => {
        callStudentToPresent(nextNum);
      });
    }
  };

  // Presenter Microphone Toggle (Mute / Unmute)
  const handleToggleMic = async () => {
    if (isMicOn) {
      setIsMicOn(false);
      try { stopAudioAnalyser(); } catch {}
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
      if (liveSpeech.trim()) {
        addTranscriptEntry(currentPresenter?.name || 'Presenter', liveSpeech.trim(), false);
        setLiveSpeech('');
      }
    } else {
      setIsMicOn(true);
      try { await startAudioAnalyser(); } catch {}
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (e: any) => {
            const transcript = Array.from(e.results)
              .map((r: any) => r[0]?.transcript)
              .join(' ');
            setLiveSpeech(transcript);
          };
          rec.onend = () => {
            if (liveSpeech.trim()) {
              addTranscriptEntry(currentPresenter?.name || 'Presenter', liveSpeech.trim(), false);
              setLiveSpeech('');
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
      {/* MAIN CLASSROOM ENVIRONMENT (LIGHT THEME) */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-5">
        
        {/* ======================================================== */}
        {/* STAGE & PODIUM (PRESENTER CENTERED ON LECTERN) */}
        {/* ======================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
          
          {/* Whiteboard / Projector Screen Behind the Podium */}
          <div className="max-w-3xl mx-auto bg-slate-50 border-2 border-slate-200/90 rounded-2xl p-4 shadow-2xs mb-5 text-center relative">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 mb-3 flex-wrap">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-amber-600" />
                <span>Classroom Seminar Screen</span>
              </span>
              
              {/* Presentation Timer */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
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
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              "{currentTopic}"
            </h2>

            {/* AI Facilitator Instruction / Speech Banner */}
            <div className="mt-3 bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 italic font-medium">
              <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px] uppercase tracking-wider mb-1 not-italic">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>AI Seminar Facilitator Guidance</span>
              </div>
              <p>
                "{aiSpeech || (phase === 'presenting' ? 'Presenter is delivering the scheduled topic.' : 'Presenting to classroom seminar hall...')}"
              </p>
            </div>
          </div>

          {/* ======================================================== */}
          {/* THE PODIUM / LECTERN (PRESENTER STANDING IN THE CENTER) */}
          {/* ======================================================== */}
          <div className="max-w-xl mx-auto flex flex-col items-center">
            
            {/* Lectern Structure */}
            <div className="w-full bg-gradient-to-b from-amber-50 via-white to-amber-100/50 border-2 border-amber-300 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col items-center relative text-center">
              
              {/* Gooseneck Lectern Microphone attached on top */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-200/70 border border-amber-300 px-3.5 py-1 rounded-full shadow-2xs -mt-8 mb-3 z-10">
                <Mic className="w-3.5 h-3.5 text-amber-700" />
                <span>SEMINAR LECTERN • PRESENTER PODIUM</span>
              </div>

              {/* Video / Slides Display Frame */}
              <div className="w-72 h-52 sm:w-96 sm:h-64 rounded-2xl overflow-hidden border-4 border-amber-400 shadow-md relative bg-slate-900 flex items-center justify-center">
                {isSharingScreen ? (
                  slideMode === 'screen' && screenStream ? (
                    <div className="w-full h-full bg-black relative flex items-center justify-center">
                      <video
                        ref={screenVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
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
                ) : isCameraOn && videoStream ? (
                  <video
                    ref={presenterVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-b from-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 relative">
                    <img
                      src={currentPresenter?.avatar}
                      alt={currentPresenter?.name}
                      className="w-24 h-24 rounded-full bg-slate-700 border-2 border-amber-400 shadow-md object-cover"
                    />
                    <span className="mt-2 text-xs font-bold text-white">
                      {currentPresenter?.name}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      Camera Off • Avatar Active
                    </span>
                  </div>
                )}

                {/* Presenter Live Status Badge */}
                <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none">
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-900/80 text-amber-300 border border-amber-400/30 backdrop-blur-xs">
                    Seat #{currentStudentNumber}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs ${
                    isMicOn ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white'
                  }`}>
                    {isMicOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    <span>{isMicOn ? 'Speaking' : 'Muted'}</span>
                  </span>
                </div>
              </div>

              {/* Presenter Name & Department */}
              <div className="mt-4 flex flex-col items-center">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{currentPresenter?.name}</span>
                  {currentPresenter?.isUser && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                      You
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  Department of Computer Science & Engineering • {currentPresenter?.college || session.collegeCode || 'BMSIT'}
                </p>
              </div>

              {/* ======================================================== */}
              {/* PRESENTER PODIUM CONTROLS (MIC UNMUTE/MUTE & VIDEO ON/OFF) */}
              {/* ======================================================== */}
              <div className="mt-4 w-full bg-white border border-amber-200/90 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-center gap-2.5">
                
                {/* 1. MUTE / UNMUTE MICROPHONE */}
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                    isMicOn
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/40'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  }`}
                  title={isMicOn ? 'Click to Mute Microphone' : 'Click to Unmute Microphone'}
                >
                  {isMicOn ? (
                    <>
                      <Mic className="w-4 h-4 animate-pulse text-white" />
                      <span>Mic: Unmuted (Active)</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4 text-rose-500" />
                      <span>Mic: Muted</span>
                    </>
                  )}
                </button>

                {/* 2. TURN VIDEO ON / OFF */}
                <button
                  type="button"
                  onClick={handleToggleVideo}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                    isCameraOn
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-400/40'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  }`}
                  title={isCameraOn ? 'Click to Turn Off Video Camera' : 'Click to Turn On Video Camera'}
                >
                  {isCameraOn ? (
                    <>
                      <Video className="w-4 h-4 text-white" />
                      <span>Video: On</span>
                    </>
                  ) : (
                    <>
                      <VideoOff className="w-4 h-4 text-slate-500" />
                      <span>Video: Off</span>
                    </>
                  )}
                </button>

                {/* 3. SHARE SLIDES / SCREEN */}
                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs border ${
                    isSharingScreen
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500 shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                  title={isSharingScreen ? 'Close Slides' : 'Share Presentation Slides'}
                >
                  <Share2 className="w-4 h-4 text-amber-700" />
                  <span>{isSharingScreen ? 'Hide Slides' : 'Share Slides'}</span>
                </button>
              </div>

              {/* Stage Flow Action Buttons */}
              <div className="mt-3 w-full flex items-center justify-center gap-2 flex-wrap">
                {phase === 'presenting' && (
                  <button
                    type="button"
                    onClick={handleCompletePresentation}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Conclude Speech & Start Q&A</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {(phase === 'peer_qa' || phase === 'ai_qa') && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAnswerAndProceed}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Proceed to Next Presenter (#{currentStudentNumber < presentationStudents.length ? currentStudentNumber + 1 : 'Finish'})</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* LIVE ACTIVITY TRANSCRIPT & FACULTY OBSERVATION (LIGHT THEME) */}
        {/* (All AI Audience Desks Removed as Requested) */}
        {/* ======================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Live Presentation Activity Transcript
                </h3>
                <p className="text-xs text-slate-500">
                  Synchronous speech log of the presenter delivery, peer dialogue, and AI Facilitator arbitration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                {transcripts.length} Entries
              </span>
            </div>
          </div>

          {/* Transcript Scroll Area */}
          <div className="h-64 sm:h-80 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-300">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-medium text-slate-500">
                  Activity speech and instructor prompts will stream live in this transcript feed.
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Click "Start Presentation" or speak through your microphone to see live transcript logs.
                </p>
              </div>
            ) : (
              transcripts.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex gap-3 p-3 rounded-2xl border transition-all ${
                    entry.isFacilitator
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                    entry.isFacilitator
                      ? 'bg-amber-200/80 text-amber-900 border border-amber-300'
                      : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  }`}>
                    {entry.isFacilitator ? <Sparkles className="w-4 h-4" /> : entry.speakerName.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {entry.speakerName}
                        </span>
                        {entry.isFacilitator && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-200/60 text-amber-900 border border-amber-300">
                            AI Instructor
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {entry.timestamp}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed break-words">
                      {entry.text}
                    </p>
                  </div>
                </div>
              ))
            )}
            
            {/* Live Typing / Speech Preview when mic is active */}
            {isMicOn && liveSpeech && (
              <div className="flex gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 animate-pulse">
                <div className="w-8 h-8 rounded-xl bg-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
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

          {/* Faculty Evaluator Observer Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Faculty Evaluation Panel: {session.assignedFacultyName || 'Assigned Faculty Evaluator'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Assessing topic depth, delivery fluency, and technical Q&A across the official 100-mark rubric
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
                <span>Live Assessment Active</span>
              </span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};
