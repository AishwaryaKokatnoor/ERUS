import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Hand, 
  Sparkles, 
  Volume2, 
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
  Play
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry, GDFacilitatorPhase } from '../../types/gd';
import { facilitatorVoice } from '../../utils/speechSynthesis';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from '../../utils/facilitatorQuestionEngine';

interface RealisticGDRoomProps {
  session: GDSession;
  setSession: React.Dispatch<React.SetStateAction<GDSession>>;
  transcripts: TranscriptEntry[];
  setTranscripts: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
  onFinishSession: () => void;
  voiceMuted: boolean;
  elapsedSeconds: number;
}

export const RealisticGDRoom: React.FC<RealisticGDRoomProps> = ({
  session,
  setSession,
  transcripts,
  setTranscripts,
  onFinishSession,
  voiceMuted,
  elapsedSeconds,
}) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'rules' | 'analytics' | 'breakout'>('transcript');
  const [userSpeechInput, setUserSpeechInput] = useState('');
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [interruptionWarning, setInterruptionWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [autoSimulatePeers, setAutoSimulatePeers] = useState(true);
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const studentTurnsSinceIntervention = useRef<number>(0);

  // Auto scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

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
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setUserSpeechInput(currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          setIsListeningMic(false);
        };

        recognition.onend = () => {
          setIsListeningMic(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleMicRecognition = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. You can type or use quick speech presets below.');
      return;
    }

    if (isListeningMic) {
      recognitionRef.current.stop();
      setIsListeningMic(false);
      // Auto-submit if there was speech
      if (userSpeechInput.trim()) {
        handleSendUserStatement(userSpeechInput);
      }
    } else {
      try {
        recognitionRef.current.start();
        setIsListeningMic(true);
      } catch (e) {
        console.error(e);
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

  // User submits a spoken statement
  const handleSendUserStatement = async (textToSend?: string) => {
    const text = (textToSend || userSpeechInput).trim();
    if (!text) return;

    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    // Check if another speaker was currently active (interruption detection)
    if (session.currentSpeakerId && session.currentSpeakerId !== userStudent.id) {
      const interruptedStudent = session.students.find((s) => s.id === session.currentSpeakerId);
      setInterruptionWarning(`Interruption detected: Rahul Kumar spoke while ${interruptedStudent?.name || 'peer'} was presenting.`);
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
    setUserSpeechInput('');
    studentTurnsSinceIntervention.current += 1;

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

      // If auto simulate is enabled, trigger peer response
      if (autoSimulatePeers) {
        scheduleNextTurnAfterUser();
      }
    }, 4000);
  };

  // Simulate realistic peer turns to make the room alive (calls backend or uses fallback)
  const scheduleNextTurnAfterUser = async () => {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/session/simulate-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elapsedSeconds, excludeStudentId: 's1' }),
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

          setTimeout(() => {
            setSession((prev) => ({
              ...prev,
              currentSpeakerId: null,
              students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
            }));

            // Only intervene after at least 3-4 natural participant exchanges to prevent question spamming
            if (studentTurnsSinceIntervention.current >= 3) {
              requestAiIntervention('probing');
            }
          }, 5000);
          return;
        }
      } catch (err) {
        console.warn('Simulate peer API fallback:', err);
      }

      // Fallback local simulation if offline
      const candidates = session.students.filter((s) => !s.isUser);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      studentTurnsSinceIntervention.current += 1;
      
      const peerArguments: Record<string, string[]> = {
        'Should Artificial Intelligence replace teachers?': [
          'Building on Rahul’s thought, AI personalized tutoring can identify learning gaps in real-time, allowing teachers to spend more quality time on one-on-one emotional mentorship.',
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

      setTimeout(() => {
        setSession((prev) => ({
          ...prev,
          currentSpeakerId: null,
          students: prev.students.map((s) => ({ ...s, isSpeaking: false })),
        }));

        // Only interject after 3-4 natural turns to avoid repetitive question spamming
        if (studentTurnsSinceIntervention.current >= 3) {
          requestAiIntervention('probing');
        }
      }, 5000);
    }, 2000);
  };

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
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                LIVE GD SESSION #{session.id.toUpperCase()}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Difficulty: {session.difficulty}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                8 Seats Allotted
              </span>
            </div>
            
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
              Topic: {session.topic}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
              {session.description}
            </p>
          </div>

          {/* Quick Facilitator Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="ai-probe-btn"
              onClick={() => requestAiIntervention('probing')}
              disabled={isAiProcessing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 transition-all shadow-xs active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>AI Probing Question</span>
            </button>

            <button
              id="ai-rules-btn"
              onClick={() => speakFacilitator("Discussion Rules: 1. Speak one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us maintain balanced dialogue.", 'explain_rules', 'rules')}
              disabled={isAiProcessing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Explain Rules</span>
            </button>

            <button
              id="finish-session-btn"
              onClick={onFinishSession}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-700/20 dark:shadow-emerald-900/30 transition-all active:scale-95"
            >
              <Award className="w-4 h-4" />
              <span>Conclude & Generate Report</span>
            </button>
          </div>
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

                <span className="absolute -bottom-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-600/70 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                  AI MODERATOR
                </span>
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

            {/* Middle Stage: The Conference Table Layout with 8 Numbered Seats */}
            <div className="relative z-10 my-4 flex-1 flex items-center justify-center">
              
              {/* Virtual Oval Conference Table */}
              <div className="w-full max-w-2xl h-64 sm:h-72 rounded-[48px] sm:rounded-[64px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-800/90 dark:via-slate-850 dark:to-slate-900 border-4 border-slate-300 dark:border-slate-700/80 shadow-lg dark:shadow-2xl relative flex items-center justify-center p-4">
                
                {/* Table Surface Inset with Wood/Modern Slate Tone */}
                <div className="w-full h-full rounded-[36px] sm:rounded-[52px] bg-white/80 dark:bg-slate-950/60 border border-slate-300/80 dark:border-slate-700/50 flex flex-col items-center justify-center p-3 relative overflow-hidden shadow-inner">
                  
                  {/* Center Topic on Table */}
                  <div className="text-center p-2">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
                      ERUS-AIGDF Conference Room
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-2 max-w-xs">
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

                  {/* Numbered Desk Badges reflect on the table surface */}
                  <div className="absolute inset-x-6 top-3 flex justify-between text-[10px] font-mono font-bold text-indigo-600/70 dark:text-indigo-400/70">
                    <span>• SEAT 1 •</span>
                    <span>• SEAT 2 •</span>
                    <span>• SEAT 3 •</span>
                    <span>• SEAT 4 •</span>
                  </div>
                  <div className="absolute inset-x-6 bottom-3 flex justify-between text-[10px] font-mono font-bold text-indigo-600/70 dark:text-indigo-400/70">
                    <span>• SEAT 5 •</span>
                    <span>• SEAT 6 •</span>
                    <span>• SEAT 7 •</span>
                    <span>• SEAT 8 •</span>
                  </div>
                </div>

                {/* Seating Pods: 8 Students positioned precisely around the Table */}
                
                {/* TOP ROW (Seats 1, 2, 3, 4) */}
                <div className="absolute -top-10 inset-x-2 sm:inset-x-6 flex justify-between">
                  {session.students.slice(0, 4).map((student) => (
                    <StudentPodCard 
                      key={student.id} 
                      student={student} 
                      isCurrentSpeaker={session.currentSpeakerId === student.id}
                      position="top"
                    />
                  ))}
                </div>

                {/* BOTTOM ROW (Seats 5, 6, 7, 8) */}
                <div className="absolute -bottom-10 inset-x-2 sm:inset-x-6 flex justify-between">
                  {session.students.slice(4, 8).map((student) => (
                    <StudentPodCard 
                      key={student.id} 
                      student={student} 
                      isCurrentSpeaker={session.currentSpeakerId === student.id}
                      position="bottom"
                    />
                  ))}
                </div>

              </div>
            </div>

            {/* Bottom Controls: User Speech Bar & Quick Presets */}
            <div className="relative z-10 pt-4 mt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">You are: Rahul Kumar (Seat 1)</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] border border-indigo-200 dark:border-indigo-800">
                    {formatSecs(session.students[0]?.speakingDurationSeconds || 0)} spoken
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    id="raise-hand-btn"
                    onClick={handleRaiseHandToggle}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      session.students[0]?.hasRaisedHand
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    <span>{session.students[0]?.hasRaisedHand ? 'Hand Raised' : 'Raise Hand'}</span>
                  </button>

                  <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoSimulatePeers} 
                      onChange={(e) => setAutoSimulatePeers(e.target.checked)}
                      className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Simulate Peer Responses</span>
                  </label>
                </div>
              </div>

              {/* Main Input & Mic Action Bar */}
              <div className="flex items-center gap-2">
                <button
                  id="mic-speak-btn"
                  onClick={toggleMicRecognition}
                  className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all shadow-md ${
                    isListeningMic
                      ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title={isListeningMic ? 'Click to stop speaking' : 'Click to speak using microphone'}
                >
                  {isListeningMic ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
                  <span className="whitespace-nowrap">{isListeningMic ? 'Listening...' : 'Push to Speak'}</span>
                </button>

                <div className="flex-1 relative">
                  <input
                    id="user-statement-input"
                    type="text"
                    value={userSpeechInput}
                    onChange={(e) => setUserSpeechInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendUserStatement()}
                    placeholder={isListeningMic ? 'Listening to your microphone...' : 'Type your contribution or speak aloud...'}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {userSpeechInput && (
                    <button
                      id="send-statement-btn"
                      onClick={() => handleSendUserStatement()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Speech Presets for instant high-score dialogue */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold whitespace-nowrap">Quick Points:</span>
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendUserStatement(prompt)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap transition-all truncate max-w-[220px]"
                    title={prompt}
                  >
                    "{prompt.substring(0, 30)}..."
                  </button>
                ))}
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
                            <span className={st.isUser ? 'text-indigo-600 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                              Seat {st.seatNumber}: {st.name} {st.isUser && '(You)'}
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">{formatSecs(st.speakingDurationSeconds)} ({st.speakingTurns}t)</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                st.isUser ? 'bg-indigo-600' : 'bg-blue-600'
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

    </div>
  );
};

// Sub-Component: Student Pod Card with Numbered Seat Placard
const StudentPodCard: React.FC<{
  student: Student;
  isCurrentSpeaker: boolean;
  position: 'top' | 'bottom';
}> = ({ student, isCurrentSpeaker, position }) => {
  return (
    <div className={`flex flex-col items-center group transition-all duration-300 ${
      isCurrentSpeaker ? 'scale-110 z-20' : 'z-10'
    }`}>
      
      {/* Student Video / Avatar Bubble */}
      <div className="relative">
        {/* Speaking Voice Waves */}
        {isCurrentSpeaker && (
          <div className="absolute -inset-1.5 rounded-2xl bg-indigo-500/40 animate-pulse pointer-events-none" />
        )}

        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 transition-all shadow-md relative bg-slate-200 dark:bg-slate-800 ${
          isCurrentSpeaker 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/50 shadow-indigo-500/30' 
            : student.isUser 
            ? 'border-blue-500 dark:border-blue-500/80' 
            : 'border-slate-300 dark:border-slate-700'
        }`}>
          <img 
            src={student.avatar} 
            alt={student.name} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />

          {/* Speaking Wave Overlay */}
          {isCurrentSpeaker && (
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 backdrop-blur-xs py-0.5 flex justify-center items-center gap-0.5">
              <span className="w-1 bg-indigo-400 rounded-full wave-bar" />
              <span className="w-1 bg-indigo-400 rounded-full wave-bar" />
              <span className="w-1 bg-indigo-400 rounded-full wave-bar" />
            </div>
          )}

          {/* Hand Raised badge */}
          {student.hasRaisedHand && (
            <div className="absolute top-1 right-1 bg-amber-500 text-slate-950 p-0.5 rounded-md shadow">
              <Hand className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Realistic Numbered Seat Placard on Table before the student */}
        <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-md text-[9px] font-bold shadow-md uppercase tracking-wider ${
          position === 'top' ? 'top-full mt-1' : 'bottom-full mb-1'
        } ${
          student.isUser 
            ? 'bg-indigo-600 text-white border border-indigo-400' 
            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
        }`}>
          Seat {student.seatNumber}
        </div>
      </div>

      {/* Student Name & Turns */}
      <div className={`text-center mt-3 sm:mt-3.5 max-w-[80px] sm:max-w-[100px] ${position === 'top' ? 'mt-4' : 'mt-1'}`}>
        <p className={`text-[10px] sm:text-xs font-semibold truncate ${
          student.isUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-300'
        }`}>
          {student.name.split(' ')[0]}
        </p>
        <span className="text-[9px] text-slate-500 dark:text-slate-500 font-mono">
          {student.speakingTurns} turns
        </span>
      </div>

    </div>
  );
};
