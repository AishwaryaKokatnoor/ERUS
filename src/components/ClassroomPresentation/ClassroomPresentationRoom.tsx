import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Play, CheckCircle2, 
  HelpCircle, Sparkles, Volume2, VolumeX, LogOut, MessageSquare, 
  Share2, Shield, Eye, Award, Clock, ArrowRight, ArrowLeft, UserCheck, 
  School, Radio, Laptop, GraduationCap, Monitor
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
  // Enforce exactly 6 presentation students (Student 1 to 6)
  const presentationStudents: Student[] = useMemo(() => {
    const raw = (session.students || []).filter((s) => !s.isEmptySeat);
    const result: Student[] = [];
    const collegeName = currentUser?.college || session.collegeCode || 'Engineering Institute';

    for (let i = 1; i <= 6; i++) {
      const existing = raw.find((s) => s.seatNumber === i) || raw[i - 1];
      if (existing) {
        result.push({
          ...existing,
          seatNumber: i,
          name: existing.isUser && currentUser?.name ? currentUser.name : (existing.name || `Student Number ${i}`),
        });
      } else {
        result.push({
          id: `stu-pres-${i}`,
          name: `Student Number ${i}`,
          seatNumber: i,
          college: collegeName,
          course: 'Engineering',
          batch: '2024-2028',
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=student-${i}`,
          isUser: currentUser?.role === 'student' && i === 1,
          micActive: false,
          isSpeaking: false,
          hasRaisedHand: false,
          speakingDurationSeconds: 0,
          speakingTurns: 0,
          interruptionCount: 0,
          questionsAnswered: 0,
          questionsInitiated: 0,
          sentiment: 'neutral',
        });
      }
    }
    return result;
  }, [session.students, currentUser, session.collegeCode]);

  // Per-student individual assigned topics
  const studentTopics = useMemo(() => {
    return presentationStudents.map((s, idx) => {
      if (session.presentationTopics && session.presentationTopics[idx]) {
        return session.presentationTopics[idx];
      }
      return DEFAULT_PRESENTATION_TOPICS[idx] || `Research & Applications in ${session.topic || 'Engineering'}`;
    });
  }, [presentationStudents, session.presentationTopics, session.topic]);

  // Activity Execution State (Serial Flow per PDF specification)
  const [phase, setPhase] = useState<PresentationPhase>('opening');
  const [activeStudentIndex, setActiveStudentIndex] = useState<number>(0); // 0 to 5 (Student 1 to 6)
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

  // Live Speech Recognition for User
  const [liveSpeech, setLiveSpeech] = useState<string>('');
  const speechRecognitionRef = useRef<any>(null);
  const hasStartedOpeningRef = useRef<boolean>(false);

  const isFaculty = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin';
  const currentStudentNumber = activeStudentIndex + 1;
  const currentPresenter = presentationStudents[activeStudentIndex];
  const currentTopic = studentTopics[activeStudentIndex] || session.topic;

  // Speak script via RoomVoiceEngine with Indian English tone and robust chunking
  const speakAI = (text: string, onEnd?: () => void) => {
    const clean = String(text || '').trim();
    setAiSpeech(clean);
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

    if (nextNum > 6) {
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
                Seminar Hall (6 Students)
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-xs sm:max-w-md">
              {session.topic || 'Technical / Research / Industry-Oriented Presentations'}
            </p>
          </div>
        </div>

        {/* Serial Order Stepper (Student 1 to 6) */}
        <div className="hidden lg:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200">
          {[1, 2, 3, 4, 5, 6].map((num) => {
            const isCompleted = num < currentStudentNumber;
            const isCurrent = num === currentStudentNumber;
            return (
              <button
                key={num}
                type="button"
                onClick={() => isFaculty && callStudentToPresent(num)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-amber-500 text-white font-bold shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
                    : isCompleted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                    : 'text-slate-500 bg-white border border-slate-200 hover:bg-slate-50'
                }`}
                title={`Student #${num}`}
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
            isFaculty && currentStudentNumber < 6 && (
              <button
                onClick={() => callStudentToPresent(currentStudentNumber + 1)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer"
              >
                <span>Call Next Student (#{currentStudentNumber + 1})</span>
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
          {/* Subtle Stage Floor Highlight */}
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
                "{aiSpeech || (phase === 'presenting' ? 'Presenter is delivering the scheduled topic. Audience is taking notes.' : 'Presenting to classroom audience...')}"
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

              {/* Video / Screen Display Frame */}
              <div className="w-64 h-48 sm:w-80 sm:h-56 rounded-2xl overflow-hidden border-4 border-amber-400 shadow-md relative bg-slate-900 flex items-center justify-center">
                {isSharingScreen ? (
                  <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
                    <Share2 className="w-12 h-12 text-amber-400 mb-2 animate-bounce" />
                    <p className="text-sm font-bold text-white">Presentation Slides Active</p>
                    <p className="text-xs text-slate-400">Sharing technical concepts</p>
                  </div>
                ) : isCameraOn && videoStream ? (
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(video) => {
                      if (video && videoStream) video.srcObject = videoStream;
                    }}
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
                  Department of Computer Science & Engineering • {currentPresenter?.college || session.collegeCode || 'Engineering Institute'}
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
                  onClick={() => setIsSharingScreen(!isSharingScreen)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs border ${
                    isSharingScreen
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title={isSharingScreen ? 'Stop Sharing Slides' : 'Share Presentation Slides'}
                >
                  <Share2 className="w-4 h-4 text-amber-700" />
                  <span>{isSharingScreen ? 'Stop Slides' : 'Share Slides'}</span>
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
                    <span>Proceed to Next Student (#{currentStudentNumber < 6 ? currentStudentNumber + 1 : 'Finish'})</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* CLASSROOM AUDIENCE (STUDENTS SEATED AT DESKS FACING PRESENTER) */}
        {/* ======================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                <School className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Classroom Audience Desks
                </h3>
                <p className="text-xs text-slate-500">
                  Participating students seated in audience rows facing the lectern and presenter
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              5 Peers in Audience
            </span>
          </div>

          {/* Desks Grid: 5 Other Students Sitting at Desks Facing Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {presentationStudents
              .filter((s) => s.seatNumber !== currentStudentNumber)
              .map((student) => {
                const sNum = student.seatNumber;
                const isInvitedForQA = phase === 'peer_qa' && (currentStudentNumber < 6 ? sNum === currentStudentNumber + 1 : sNum === 1);
                const hasAlreadyPresented = sNum < currentStudentNumber;

                return (
                  <div
                    key={student.id}
                    onClick={() => isFaculty && callStudentToPresent(sNum)}
                    className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition-all flex flex-col justify-between cursor-pointer hover:shadow-md ${
                      isInvitedForQA
                        ? 'border-amber-400 ring-2 ring-amber-400/40'
                        : 'border-slate-200 hover:border-amber-300'
                    }`}
                    title={isFaculty ? `Click to call Student #${sNum} to the lectern` : student.name}
                  >
                    {/* Desk Top Rim (Wooden classroom desk surface) */}
                    <div className="bg-gradient-to-r from-amber-100 via-amber-200/80 to-amber-100 border-b border-amber-300/80 px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-amber-900">
                      <span className="flex items-center gap-1">
                        <Laptop className="w-3.5 h-3.5 text-amber-800" />
                        <span>Desk #{sNum}</span>
                      </span>
                      {isInvitedForQA ? (
                        <span className="text-[10px] text-amber-800 bg-amber-300/80 px-1.5 py-0.5 rounded-md font-extrabold animate-pulse">
                          Q&A Floor
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono">
                          Facing Stage
                        </span>
                      )}
                    </div>

                    {/* Desk Seated Student */}
                    <div className="p-3 flex flex-col items-center text-center">
                      <div className="relative">
                        <img
                          src={student.avatar}
                          alt={student.name}
                          className="w-14 h-14 rounded-2xl bg-slate-100 object-cover border-2 border-slate-200 shadow-2xs"
                        />
                        {isInvitedForQA && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold animate-bounce">
                            !
                          </span>
                        )}
                      </div>

                      <h4 className="mt-2 text-xs font-bold text-slate-800 truncate max-w-[120px]">
                        {student.name}
                        {student.isUser && ' (You)'}
                      </h4>
                      <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                        {student.course} • Batch {student.batch || '2024'}
                      </p>

                      {/* Status Tag */}
                      <div className="mt-2.5">
                        {isInvitedForQA ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 animate-pulse">
                            <span>🙋 Asking Question</span>
                          </span>
                        ) : hasAlreadyPresented ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Speech Finished</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Attending Audience
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Faculty Evaluator Observer Desk */}
          <div className="mt-4 bg-amber-50/60 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Faculty Evaluator Desk: {session.assignedFacultyName || 'Assigned Faculty Evaluator'}
                </p>
                <p className="text-[11px] text-slate-600">
                  Monitoring technical delivery, presentation composure, and Q&A responsiveness
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
                <span>Live Observation Active</span>
              </span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};
