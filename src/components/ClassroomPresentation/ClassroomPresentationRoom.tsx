import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Play, CheckCircle2, 
  HelpCircle, Sparkles, Volume2, VolumeX, LogOut, MessageSquare, 
  Share2, Shield, Eye, Award, Clock, ArrowRight, UserCheck, School
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

  const isFaculty = currentUser?.role === 'faculty' || currentUser?.role === 'college_admin';
  const currentStudentNumber = activeStudentIndex + 1;
  const currentPresenter = presentationStudents[activeStudentIndex];
  const currentTopic = studentTopics[activeStudentIndex] || session.topic;

  // Speak script via Browser Speech Synthesis with Indian English tone
  const speakAI = (text: string, onEnd?: () => void) => {
    setAiSpeech(text);
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || isRoomAudioMuted) {
      if (onEnd) setTimeout(onEnd, 1200);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const inVoice = voices.find((v) => /en-IN|India|Indian|Ravi|Heera|Veena/i.test(v.name || v.lang)) || voices[0];
      if (inVoice) utterance.voice = inVoice;

      setAiSpeaking(true);
      utterance.onend = () => {
        setAiSpeaking(false);
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        setAiSpeaking(false);
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      setAiSpeaking(false);
      if (onEnd) onEnd();
    }
  };

  // Start Presentation Activity (Stage 1: Opening)
  useEffect(() => {
    if (session.status === 'active' && phase === 'opening') {
      speakAI(PRESENTATION_OPENING_SCRIPT, () => {
        // Automatically transition to Student Number 1 after opening script finishes
        callStudentToPresent(1);
      });
    }
  }, [session.status]);

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

  const triggerAIFallbackQuestion = () => {
    setIsPeerQASilenceTriggered(true);
    setPhase('ai_qa');

    const aiQ = generateAIQuestionForTopic(currentTopic);
    setCurrentAiQuestion(aiQ);

    const fullSilenceScript = `${PEER_QA_SILENCE_SCRIPT}\n\nMy question is: ${aiQ.question}\n\nStudent who presented the topic, please answer the question in your own words.`;
    speakAI(fullSilenceScript);
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

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRoomAudioMuted(!isRoomAudioMuted)}
            className={`p-2.5 rounded-xl border transition-colors ${
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 p-4 overflow-hidden">
        {/* Left Column / Center Stage (3 Columns on Large Screens) */}
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden h-full">
          {/* AI INSTRUCTOR EXECUTION SCRIPT BANNER */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 shrink-0 shadow-xl backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-extrabold flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                    ERUS AI Instructor • Script Execution Flow
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded-md">
                    Phase: {phase.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm font-medium text-slate-200 leading-relaxed italic bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
              "{aiSpeech}"
            </p>
          </div>

          {/* THE PODIUM STAGE (ACTIVE PRESENTER VIEW) */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-2xl">
            {/* Stage Spotlight Header */}
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs tracking-wider uppercase">
                  Podium Stage • Student Number {currentStudentNumber}
                </span>
                <span className="text-xs text-slate-300 font-semibold truncate max-w-md">
                  Topic: {currentTopic}
                </span>
              </div>

              {/* 6 to 8 Minutes Presentation Countdown Clock */}
              <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-700">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">Timer:</span>
                <span className={`text-sm font-mono font-bold ${
                  presenterSeconds >= 480 ? 'text-rose-400 animate-pulse' : presenterSeconds >= 360 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {formatSeconds(presenterSeconds)} / 8:00
                </span>
              </div>
            </div>

            {/* Stage Center: Video / Screen / Avatar */}
            <div className="flex-1 flex items-center justify-center my-4 relative">
              {isSharingScreen ? (
                <div className="w-full h-full bg-slate-950 rounded-2xl border border-slate-700 flex flex-col items-center justify-center p-6 text-center">
                  <Share2 className="w-12 h-12 text-indigo-400 mb-2 animate-bounce" />
                  <p className="text-sm font-bold text-white">Presentation Slides Active</p>
                  <p className="text-xs text-slate-400">Showing technical diagram & research points</p>
                </div>
              ) : isCameraOn && currentPresenter?.isUser && videoStream ? (
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={(video) => {
                    if (video && videoStream) video.srcObject = videoStream;
                  }}
                  className="h-64 sm:h-72 aspect-video rounded-2xl object-cover border-2 border-amber-500 shadow-2xl"
                />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <div className="relative">
                    <img
                      src={currentPresenter?.avatar}
                      alt={currentPresenter?.name}
                      className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-amber-500/80 p-1 bg-slate-800 shadow-2xl shadow-amber-500/20"
                    />
                    <div className="absolute -bottom-2 -right-2 px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold shadow-md">
                      #{currentStudentNumber}
                    </div>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-4">{currentPresenter?.name}</h2>
                  <p className="text-xs text-slate-400">{currentPresenter?.college}</p>
                </div>
              )}
            </div>

            {/* Presenter Stage Controls */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800/80 z-10 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSpeechRecognition}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isMicOn
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span>{isMicOn ? 'Microphone Active' : 'Unmute Mic'}</span>
                </button>

                <button
                  onClick={toggleCamera}
                  className={`p-2.5 rounded-xl border transition-colors ${
                    isCameraOn ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title={isCameraOn ? 'Turn Off Video' : 'Turn On Video'}
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setIsSharingScreen(!isSharingScreen)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border ${
                    isSharingScreen
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isSharingScreen ? 'Stop Sharing' : 'Share Slides'}</span>
                </button>
              </div>

              {/* Phase Progression Actions */}
              <div className="flex items-center gap-2">
                {phase === 'presenting' && (
                  <button
                    onClick={handleCompletePresentation}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <span>Conclude Speech & Start Q&A</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {(phase === 'peer_qa' || phase === 'ai_qa') && (
                  <button
                    onClick={handleAcknowledgeAnswerAndProceed}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Next Student (#{currentStudentNumber < 6 ? currentStudentNumber + 1 : 'Finish'})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 5 Audience Desks & Q&A Interactions */}
        <div className="flex flex-col gap-4 overflow-hidden h-full">
          {/* CLASSROOM AUDIENCE ROW */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300">Audience Desks (Listening Peers)</span>
              <span className="text-[10px] text-slate-500">5 Students</span>
            </div>

            <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-64">
              {presentationStudents.map((s, idx) => {
                const sNum = idx + 1;
                const isPresenter = sNum === currentStudentNumber;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      isPresenter
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={s.avatar} alt={s.name} className="w-7 h-7 rounded-full bg-slate-800 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs text-white truncate">Student #{sNum}: {s.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{studentTopics[idx]}</p>
                      </div>
                    </div>
                    {isPresenter ? (
                      <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-bold">
                        On Stage
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Listening</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* PEER Q&A INTERACTION PANEL */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">Peer Q&A Session</span>
                </div>
                {phase === 'peer_qa' && (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-md">
                    Waiting for Peer: {15 - qaTimerSeconds}s
                  </span>
                )}
              </div>

              {phase === 'peer_qa' && (
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl mb-3">
                  <p className="text-xs text-amber-300 font-semibold mb-1">
                    Audience Question Time:
                  </p>
                  <p className="text-xs text-slate-300">
                    Students listening in the audience may ask questions regarding Student #{currentStudentNumber}'s topic.
                  </p>
                </div>
              )}

              {phase === 'ai_qa' && currentAiQuestion && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-xl mb-3">
                  <div className="flex items-center gap-1.5 mb-1 text-indigo-400 text-xs font-bold uppercase">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI-Generated {currentAiQuestion.type.replace('_', ' ')} Question:</span>
                  </div>
                  <p className="text-xs text-white font-medium italic">
                    "{currentAiQuestion.question}"
                  </p>
                </div>
              )}

              {liveSpeech && (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 mt-2">
                  <span className="text-emerald-400 font-bold block mb-1">Live Transcript:</span>
                  {liveSpeech}
                </div>
              )}
            </div>

            {/* Quick Peer Question Input */}
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask a technical or research question..."
                  value={peerQAQuestion}
                  onChange={(e) => setPeerQAQuestion(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => {
                    if (peerQAQuestion.trim()) {
                      speakAI(`Thank you. Student Number ${currentStudentNumber}, please answer this question: "${peerQAQuestion}"`);
                      setPeerQAQuestion('');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all"
                >
                  Ask
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
