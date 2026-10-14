import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Play, CheckCircle2, 
  HelpCircle, Sparkles, Volume2, VolumeX, LogOut, MessageSquare, 
  Share2, Shield, Eye, Award, Clock, ArrowRight, ArrowLeft, UserCheck, School, Radio
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
  const { isCameraOn, videoStream, toggleCamera, audioLevel } = useUserMedia();
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

  // Web Speech recognition toggle for active student
  const toggleSpeechRecognition = () => {
    if (isMicOn) {
      setIsMicOn(false);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
    } else {
      setIsMicOn(true);
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

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ======================================================== */}
      {/* TOP HEADER: CLASSROOM PRESENTATION SEMINAR BANNER */}
      {/* ======================================================== */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <School className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-wide">
                ERUS AI Student Presentation Activity
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Classroom Seminar Mode (Strict 6 Students)
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-md">
              {session.topic || 'Technical / Research / Industry-Oriented Presentations'}
            </p>
          </div>
        </div>

        {/* Serial Order Stepper (Student 1 to 6) */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800">
          {[1, 2, 3, 4, 5, 6].map((num) => {
            const isCompleted = num < currentStudentNumber;
            const isCurrent = num === currentStudentNumber;
            return (
              <div
                key={num}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20'
                    : isCompleted
                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                    : 'text-slate-500 bg-slate-900/50'
                }`}
              >
                <span>#{num}</span>
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                {isCurrent && <span className="animate-pulse">● Live</span>}
              </div>
            );
          })}
        </div>

        {/* Global Controls & Faculty Actions */}
        <div className="flex items-center gap-2">
          {session.status !== 'active' ? (
            isFaculty ? (
              <button
                onClick={handleFacultyStartPresentation}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-700/30 transition-all hover:scale-105 active:scale-95 cursor-pointer ring-2 ring-emerald-400/50"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Presentation</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-amber-300">
                <Clock className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Waiting for faculty to start...</span>
              </div>
            )
          ) : (
            isFaculty && currentStudentNumber < 6 && (
              <button
                onClick={() => callStudentToPresent(currentStudentNumber + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer"
              >
                <span>Call Next Student (#{currentStudentNumber + 1})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )
          )}

          <button
            onClick={() => setIsRoomAudioMuted(!isRoomAudioMuted)}
            className={`p-2 rounded-xl border transition-colors ${
              isRoomAudioMuted
                ? 'bg-rose-950/30 border-rose-800/50 text-rose-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title={isRoomAudioMuted ? 'Unmute AI Instructor Voice' : 'Mute AI Instructor Voice'}
          >
            {isRoomAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onFinishSession}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Finish Activity</span>
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN STAGE: PODIUM (PRESENTER) + CLASSROOM AUDIENCE DESKS */}
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* MAIN STAGE: PRESENTER IN THE MIDDLE + AUDIENCE DESKS */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 max-w-5xl w-full mx-auto overflow-hidden">
        
        {/* CENTER STAGE: THE PRESENTER IN THE MIDDLE */}
        <div className="w-full flex flex-col items-center justify-center my-auto">
          <div className="w-full max-w-xl bg-gradient-to-b from-slate-900/95 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md flex flex-col items-center text-center relative overflow-hidden">
            
            {/* Ambient Aura */}
            {aiSpeaking && (
              <div className="absolute inset-0 bg-amber-500/10 animate-pulse pointer-events-none rounded-3xl" />
            )}

            {/* Large Video / Screen / Avatar Frame in the Center */}
            <div className="relative flex flex-col items-center">
              {isSharingScreen ? (
                <div className="w-52 h-52 sm:w-60 sm:h-60 bg-slate-950 rounded-3xl border-4 border-amber-500/80 shadow-2xl flex flex-col items-center justify-center p-4 text-center">
                  <Share2 className="w-12 h-12 text-amber-400 mb-2 animate-bounce" />
                  <p className="text-sm font-bold text-white">Presentation Slides Active</p>
                  <p className="text-xs text-slate-400">Sharing technical concepts</p>
                </div>
              ) : isCameraOn && currentPresenter?.isUser && videoStream ? (
                <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-3xl overflow-hidden border-4 border-amber-500/80 shadow-2xl relative bg-slate-950">
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(video) => {
                      if (video && videoStream) video.srcObject = videoStream;
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-3xl overflow-hidden border-4 border-amber-500/80 shadow-2xl relative bg-slate-950 flex items-center justify-center">
                  <img
                    src={currentPresenter?.avatar}
                    alt={currentPresenter?.name}
                    className="w-full h-full object-cover p-2"
                  />
                </div>
              )}

              {/* Placard Badge */}
              <div className="absolute -bottom-3 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-extrabold px-3.5 py-1 rounded-full shadow-lg border border-amber-300/40 whitespace-nowrap z-20 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-slate-950 animate-pulse" />
                <span>PRESENTER • SEAT #{currentStudentNumber}</span>
              </div>
            </div>

            {/* Presenter Name & Role */}
            <div className="mt-6 flex flex-col items-center">
              <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                {currentPresenter?.name}
                {currentPresenter?.isUser && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
                    You
                  </span>
                )}
              </h2>
              
              {/* Topic Title */}
              <div className="mt-2 px-4 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs sm:text-sm font-semibold text-amber-200 max-w-md">
                📌 Topic: "{currentTopic}"
              </div>
            </div>

            {/* Live Speech Caption */}
            <div className="mt-4 w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm text-slate-200 italic font-medium min-h-[44px] flex items-center justify-center">
              <span>
                "{aiSpeech || (phase === 'presenting' ? 'Delivering presentation on assigned topic...' : 'Presenting to classroom audience...')}"
              </span>
            </div>

            {/* Presenter Stage Controls */}
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              {currentPresenter?.isUser && (
                <>
                  <button
                    onClick={toggleSpeechRecognition}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isMicOn ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span>{isMicOn ? 'Mic Active' : 'Unmute'}</span>
                  </button>

                  <button
                    onClick={toggleCamera}
                    className={`p-2 rounded-xl border transition-colors ${
                      isCameraOn ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {isCameraOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => setIsSharingScreen(!isSharingScreen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                      isSharingScreen ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{isSharingScreen ? 'Stop Sharing' : 'Share'}</span>
                  </button>
                </>
              )}

              {phase === 'presenting' && (
                <button
                  onClick={handleCompletePresentation}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg cursor-pointer"
                >
                  <span>Conclude Speech & Q&A</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {(phase === 'peer_qa' || phase === 'ai_qa') && (
                <button
                  onClick={handleAcknowledgeAnswerAndProceed}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Next Student (#{currentStudentNumber < 6 ? currentStudentNumber + 1 : 'Finish'})</span>
                </button>
              )}
            </div>

          </div>
        </div>

        {/* AUDIENCE ROW: 6 PEERS SITTING AT DESKS FACING PRESENTER */}
        <div className="w-full max-w-4xl space-y-2 mt-4">
          <div className="flex items-center justify-between px-2 text-xs text-slate-400 font-medium">
            <span className="uppercase tracking-wider font-bold text-[10px] text-amber-400 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5" />
              Classroom Audience (Facing Presenter)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              6 Participating Students
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {presentationStudents.map((s, idx) => {
              const sNum = idx + 1;
              const isPresenter = sNum === currentStudentNumber;
              return (
                <div
                  key={s.id}
                  onClick={() => callStudentToPresent(sNum)}
                  className={`flex flex-col items-center p-2 rounded-2xl border transition-all cursor-pointer ${
                    isPresenter
                      ? 'bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <img src={s.avatar} alt={s.name} className="w-12 h-12 rounded-xl bg-slate-800 object-cover" />
                  <span className="text-[10px] font-bold text-white mt-1 truncate max-w-[80px]">
                    {s.name.split(' ')[0]}
                  </span>
                  <span className="text-[9px] font-mono text-amber-400">
                    Seat #{sNum} {isPresenter ? '• Presenter' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
