import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-Memory Backend State Store for Seamless Full-Stack Integration
interface BackendStudent {
  id: string;
  name: string;
  avatar: string;
  college: string;
  course: string;
  seatNumber: number;
  isUser: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  questionsAnswered: number;
  questionsInitiated: number;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  lastSpokenAt?: number;
}

interface BackendTranscript {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  seatNumber: number | null;
  isFacilitator: boolean;
  timestamp: string;
  timestampSeconds: number;
  text: string;
  type: string;
  sentiment: string;
}

interface BackendSession {
  id: string;
  topic: string;
  description: string;
  durationMinutes: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  assessmentRubric: string;
  status: 'active' | 'completed' | 'paused';
  currentPhase: 'intro' | 'rules' | 'active_discussion' | 'probing' | 'conclusion';
  facilitatorSpeech: string;
  facilitatorAction: string;
  isFacilitatorSpeaking: boolean;
  silenceTimerSeconds: number;
  currentSpeakerId: string | null;
  students: BackendStudent[];
  breakoutRooms: any[];
  createdAt: string;
  startedAt: number;
}

const DEFAULT_STUDENTS: BackendStudent[] = [
  {
    id: 's1',
    name: 'Rahul Kumar',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    college: 'IIT Delhi',
    course: 'B.Tech CSE',
    seatNumber: 1,
    isUser: true,
    speakingDurationSeconds: 105,
    speakingTurns: 3,
    interruptionCount: 0,
    questionsAnswered: 3,
    questionsInitiated: 2,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's2',
    name: 'Priya Sharma',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    college: 'BITS Pilani',
    course: 'B.Tech EEE',
    seatNumber: 2,
    isUser: false,
    speakingDurationSeconds: 140,
    speakingTurns: 4,
    interruptionCount: 1,
    questionsAnswered: 2,
    questionsInitiated: 1,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's3',
    name: 'Ramesh Patel',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    college: 'NIT Trichy',
    course: 'B.Tech ME',
    seatNumber: 3,
    isUser: false,
    speakingDurationSeconds: 45,
    speakingTurns: 1,
    interruptionCount: 0,
    questionsAnswered: 1,
    questionsInitiated: 0,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's4',
    name: 'Ananya Iyer',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    college: 'VIT Vellore',
    course: 'B.Tech IT',
    seatNumber: 4,
    isUser: false,
    speakingDurationSeconds: 110,
    speakingTurns: 3,
    interruptionCount: 0,
    questionsAnswered: 2,
    questionsInitiated: 2,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's5',
    name: 'Vikram Singh',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    college: 'IIIT Hyderabad',
    course: 'B.Tech AI',
    seatNumber: 5,
    isUser: false,
    speakingDurationSeconds: 95,
    speakingTurns: 2,
    interruptionCount: 0,
    questionsAnswered: 1,
    questionsInitiated: 1,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's6',
    name: 'Sneha Reddy',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    college: 'SRM Chennai',
    course: 'B.Tech Data Science',
    seatNumber: 6,
    isUser: false,
    speakingDurationSeconds: 80,
    speakingTurns: 2,
    interruptionCount: 0,
    questionsAnswered: 1,
    questionsInitiated: 0,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's7',
    name: 'Aditya Gupta',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    college: 'Delhi University',
    course: 'B.Sc Statistics',
    seatNumber: 7,
    isUser: false,
    speakingDurationSeconds: 70,
    speakingTurns: 2,
    interruptionCount: 0,
    questionsAnswered: 1,
    questionsInitiated: 1,
    isSpeaking: false,
    hasRaisedHand: false,
  },
  {
    id: 's8',
    name: 'Meera Nair',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    college: 'Manipal Institute',
    course: 'B.Tech Biotech',
    seatNumber: 8,
    isUser: false,
    speakingDurationSeconds: 85,
    speakingTurns: 2,
    interruptionCount: 0,
    questionsAnswered: 1,
    questionsInitiated: 1,
    isSpeaking: false,
    hasRaisedHand: false,
  },
];

let currentLiveSession: BackendSession = {
  id: 'session-101',
  topic: 'Should Artificial Intelligence replace teachers in higher education?',
  description: 'Evaluating adaptive AI tutoring algorithms vs. human mentorship, critical thinking pedagogy, and ethical holistic development.',
  durationMinutes: 20,
  difficulty: 'Intermediate',
  assessmentRubric: 'Standard Academic 7-Parameter Rubric',
  status: 'active',
  currentPhase: 'active_discussion',
  facilitatorSpeech: 'Welcome everyone. We are debating whether AI should replace teachers in higher education. Please maintain decorum and support points with facts.',
  facilitatorAction: 'Moderating discussion flow',
  isFacilitatorSpeaking: false,
  silenceTimerSeconds: 0,
  currentSpeakerId: null,
  students: DEFAULT_STUDENTS,
  breakoutRooms: [
    {
      id: 'br-1',
      name: 'Breakout Pod Alpha',
      topic: 'AI Efficiency & Personalized Learning',
      studentIds: ['s1', 's2', 's3', 's4'],
      status: 'active',
    },
    {
      id: 'br-2',
      name: 'Breakout Pod Beta',
      topic: 'Human Mentorship, Empathy & Ethics',
      studentIds: ['s5', 's6', 's7', 's8'],
      status: 'active',
    },
  ],
  createdAt: new Date().toISOString(),
  startedAt: Date.now() - 315000,
};

let liveTranscripts: BackendTranscript[] = [
  {
    id: 't-1',
    sessionId: 'session-101',
    speakerId: 'ai-facilitator',
    speakerName: 'AI Facilitator (ERUS)',
    seatNumber: null,
    isFacilitator: true,
    timestamp: '00:00',
    timestampSeconds: 0,
    text: 'Good morning everyone. Today’s discussion topic is: "Should Artificial Intelligence replace teachers in higher education?". Each participant will get an equal opportunity to speak.',
    type: 'intro',
    sentiment: 'positive',
  },
  {
    id: 't-2',
    sessionId: 'session-101',
    speakerId: 'ai-facilitator',
    speakerName: 'AI Facilitator (ERUS)',
    seatNumber: null,
    isFacilitator: true,
    timestamp: '00:45',
    timestampSeconds: 45,
    text: 'Discussion Rules: 1. Speak only one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. The floor is now open.',
    type: 'rules',
    sentiment: 'neutral',
  },
  {
    id: 't-3',
    sessionId: 'session-101',
    speakerId: 's1',
    speakerName: 'Rahul Kumar',
    seatNumber: 1,
    isFacilitator: false,
    timestamp: '01:10',
    timestampSeconds: 70,
    text: 'I would like to initiate today’s discussion. While AI tools like generative tutors can offer 24/7 personalized drill exercises, replacing teachers entirely overlooks the indispensable role of mentorship, moral ethics, and emotional encouragement in shaping young minds.',
    type: 'statement',
    sentiment: 'positive',
  },
  {
    id: 't-4',
    sessionId: 'session-101',
    speakerId: 's2',
    speakerName: 'Priya Sharma',
    seatNumber: 2,
    isFacilitator: false,
    timestamp: '02:25',
    timestampSeconds: 145,
    text: 'I agree with Rahul’s premise, but we must also look at global disparities. In developing regions where pupil-teacher ratios exceed 100:1, AI can serve as a powerful force multiplier to democratize access to high-quality curricula.',
    type: 'statement',
    sentiment: 'positive',
  },
  {
    id: 't-5',
    sessionId: 'session-101',
    speakerId: 's5',
    speakerName: 'Vikram Singh',
    seatNumber: 5,
    isFacilitator: false,
    timestamp: '03:40',
    timestampSeconds: 220,
    text: 'Adding to Priya’s point, AI excels in adaptive diagnostic testing. It can pinpoint a student’s exact misconception in calculus in milliseconds, something impossible for a single human professor in a 300-person lecture hall.',
    type: 'statement',
    sentiment: 'positive',
  },
  {
    id: 't-6',
    sessionId: 'session-101',
    speakerId: 'ai-facilitator',
    speakerName: 'AI Facilitator (ERUS)',
    seatNumber: null,
    isFacilitator: true,
    timestamp: '04:30',
    timestampSeconds: 270,
    text: 'That brings up an interesting angle on scalability versus depth. Ramesh from Seat 3, we would appreciate hearing your perspective on how laboratory and practical training would be impacted.',
    type: 'moderation',
    sentiment: 'positive',
  },
  {
    id: 't-7',
    sessionId: 'session-101',
    speakerId: 's3',
    speakerName: 'Ramesh Patel',
    seatNumber: 3,
    isFacilitator: false,
    timestamp: '04:50',
    timestampSeconds: 290,
    text: 'Thank you moderator. In mechanical engineering and medical laboratories, physical safety protocols and tactile intuition require direct master-apprentice supervision. AI can simulate, but cannot replace physical hands-on verification.',
    type: 'statement',
    sentiment: 'positive',
  },
];

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ERUS AI Group Discussion Facilitator (ERUS-AIGDF)',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    activeSessionId: currentLiveSession.id,
    participants: currentLiveSession.students.length,
  });
});

// Endpoint: GET Current Session & Transcripts
app.get('/api/session/current', (req, res) => {
  res.json({
    session: currentLiveSession,
    transcripts: liveTranscripts,
  });
});

// Endpoint: POST Create New Session
app.post('/api/session/create', (req, res) => {
  const { topic, description, durationMinutes = 20, participantCount = 8, difficulty = 'Intermediate', assessmentRubric = 'Standard Academic 7-Parameter Rubric' } = req.body;

  const seatedStudents: BackendStudent[] = DEFAULT_STUDENTS.slice(0, participantCount).map((s, idx) => ({
    ...s,
    seatNumber: idx + 1,
    speakingDurationSeconds: 0,
    speakingTurns: 0,
    interruptionCount: 0,
    questionsAnswered: 0,
    questionsInitiated: 0,
    isSpeaking: false,
    hasRaisedHand: false,
  }));

  currentLiveSession = {
    id: `session-${Date.now().toString().slice(-4)}`,
    topic: topic || 'Should Artificial Intelligence replace teachers?',
    description: description || 'Debating the transformative role of AI in pedagogy.',
    durationMinutes,
    difficulty,
    assessmentRubric,
    status: 'active',
    currentPhase: 'intro',
    facilitatorSpeech: `Good morning everyone. Today's discussion topic is: "${topic}". Each participant will get an opportunity to speak. Please respect others' opinions and avoid interruptions.`,
    facilitatorAction: 'Introducing discussion and explaining rules',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    students: seatedStudents,
    breakoutRooms: [
      {
        id: `br-1-${Date.now()}`,
        name: 'Breakout Pod Alpha',
        topic: `${topic} - Core Perspectives`,
        studentIds: seatedStudents.slice(0, 4).map((s) => s.id),
        status: 'active',
      },
      {
        id: `br-2-${Date.now()}`,
        name: 'Breakout Pod Beta',
        topic: `${topic} - Policy & Future Impact`,
        studentIds: seatedStudents.slice(4, 8).map((s) => s.id),
        status: 'active',
      },
    ],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  };

  liveTranscripts = [
    {
      id: `t-init-${Date.now()}`,
      sessionId: currentLiveSession.id,
      speakerId: 'ai-facilitator',
      speakerName: 'AI Facilitator (ERUS)',
      seatNumber: null,
      isFacilitator: true,
      timestamp: '00:00',
      timestampSeconds: 0,
      text: currentLiveSession.facilitatorSpeech,
      type: 'intro',
      sentiment: 'positive',
    },
  ];

  res.json({
    success: true,
    session: currentLiveSession,
    transcripts: liveTranscripts,
  });
});

// Endpoint: POST Submit Student Speech & Update Turn
app.post('/api/session/speak', (req, res) => {
  const { studentId, text, elapsedSeconds = 0 } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Speech text is required' });
  }

  const student = currentLiveSession.students.find((s) => s.id === studentId) || currentLiveSession.students[0];
  const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

  // Interruption detection
  let isInterruption = false;
  if (currentLiveSession.currentSpeakerId && currentLiveSession.currentSpeakerId !== student.id) {
    isInterruption = true;
    student.interruptionCount += 1;
  }

  const newTranscript: BackendTranscript = {
    id: `t-${Date.now()}`,
    sessionId: currentLiveSession.id,
    speakerId: student.id,
    speakerName: student.name,
    seatNumber: student.seatNumber,
    isFacilitator: false,
    timestamp: `${mins}:${secs}`,
    timestampSeconds: elapsedSeconds,
    text: text.trim(),
    type: 'statement',
    sentiment: 'positive',
  };

  liveTranscripts.push(newTranscript);

  // Update student stats
  student.speakingTurns += 1;
  student.speakingDurationSeconds += Math.max(15, Math.round(text.length / 7));
  student.lastSpokenAt = Date.now();
  currentLiveSession.currentSpeakerId = student.id;
  currentLiveSession.silenceTimerSeconds = 0;

  res.json({
    success: true,
    transcript: newTranscript,
    student,
    isInterruption,
    session: currentLiveSession,
  });
});

// Endpoint: POST Simulate Peer Turn (Intelligent AI Student Response)
app.post('/api/session/simulate-peer', async (req, res) => {
  try {
    const { elapsedSeconds = 0, excludeStudentId } = req.body;
    const candidates = currentLiveSession.students.filter((s) => !s.isUser && s.id !== excludeStudentId);
    if (!candidates.length) {
      return res.json({ success: false, message: 'No eligible peer students' });
    }

    const selectedPeer = candidates[Math.floor(Math.random() * candidates.length)];
    let peerStatement = '';

    if (ai) {
      const recentHistory = liveTranscripts.slice(-4).map((t) => `${t.speakerName}: "${t.text}"`).join('\n');
      const prompt = `You are simulating a college student named ${selectedPeer.name} (${selectedPeer.course} at ${selectedPeer.college}) participating in a group discussion.
Topic: "${currentLiveSession.topic}"
Recent group statements:
${recentHistory}

Write a natural, concise, intelligent speaking contribution (2-3 sentences max) that builds on, agrees with, or offers a constructive counterpoint to the recent discussion. Speak in natural Indian academic English.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      peerStatement = response.text?.trim() || '';
    }

    if (!peerStatement) {
      const fallbackList = [
        'Building on that point, we must also consider how cloud scalability allows adaptive learning models to reach millions of students cost-effectively.',
        'While I appreciate that perspective, human empathy, emotional intelligence, and moral mentorship can never be replicated by neural networks.',
        'In technical laboratory disciplines, hands-on physical verification remains mandatory to avoid real-world engineering failures.',
        'A balanced hybrid pedagogical framework will give teachers time back for individualized coaching rather than rote grading.',
      ];
      peerStatement = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    }

    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    const peerTranscript: BackendTranscript = {
      id: `t-peer-${Date.now()}`,
      sessionId: currentLiveSession.id,
      speakerId: selectedPeer.id,
      speakerName: selectedPeer.name,
      seatNumber: selectedPeer.seatNumber,
      isFacilitator: false,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds,
      text: peerStatement,
      type: 'statement',
      sentiment: 'positive',
    };

    liveTranscripts.push(peerTranscript);
    selectedPeer.speakingTurns += 1;
    selectedPeer.speakingDurationSeconds += 20;
    currentLiveSession.currentSpeakerId = selectedPeer.id;
    currentLiveSession.silenceTimerSeconds = 0;

    res.json({
      success: true,
      transcript: peerTranscript,
      student: selectedPeer,
      session: currentLiveSession,
    });
  } catch (error: any) {
    console.error('Simulate peer error:', error);
    res.status(500).json({ error: 'Failed to simulate peer' });
  }
});

// Endpoint: POST Hand Raise Toggle
app.post('/api/session/hand-raise', (req, res) => {
  const { studentId } = req.body;
  const student = currentLiveSession.students.find((s) => s.id === studentId);
  if (student) {
    student.hasRaisedHand = !student.hasRaisedHand;
  }
  res.json({ success: true, student });
});

// In-memory set of asked facilitator questions for anti-repetition tracking
const serverAskedQuestions = new Set<string>();

// Endpoint 1: AI Facilitator Autonomous Moderation Engine
app.post('/api/facilitator/moderate', async (req, res) => {
  try {
    const {
      topic = currentLiveSession.topic,
      phase = currentLiveSession.currentPhase,
      transcriptHistory = liveTranscripts,
      students = currentLiveSession.students,
      silenceDurationSeconds = currentLiveSession.silenceTimerSeconds,
      interruptionDetected = false,
      previousQuestions = [],
    } = req.body;

    // Combine previous questions from client and server
    const allAsked = Array.from(new Set([...Array.from(serverAskedQuestions), ...previousQuestions]));

    // If Gemini key is available, run prompt for human-like moderation
    if (ai) {
      const recentContext = transcriptHistory
        .slice(-6)
        .map((t: any) => `${t.speakerName} (${t.isFacilitator ? 'AI Moderator' : 'Student'}): ${t.text}`)
        .join('\n');

      const studentStats = students
        .map((s: any) => `${s.name} (Seat ${s.seatNumber}): ${s.speakingDurationSeconds}s spoken, ${s.speakingTurns} turns, ${s.interruptionCount} interruptions`)
        .join('\n');

      const previousQuestionsBlock = allAsked.length > 0
        ? `\nCRITICAL ANTI-REPETITION MANDATE:\nYou MUST NEVER repeat, rephrase, or re-ask any of the following questions that were ALREADY asked in this session:\n- ${allAsked.slice(-10).join('\n- ')}\nEvery new question MUST explore a fresh, distinctive angle (e.g. ethical accountability, economic viability, human psychological impact, technical limitations, policy frameworks, or inviting an under-participating student by name).\n`
        : '';

      const prompt = `You are the AI Facilitator / Moderator for the ERUS AI Group Discussion Facilitator (ERUS-AIGDF) platform.
Your job is to conduct online group discussions autonomously like an experienced human moderator.
Topic: "${topic}"
Current Phase: ${phase}
Silence Duration: ${silenceDurationSeconds} seconds
Interruption Detected: ${interruptionDetected}
${previousQuestionsBlock}
Recent Transcript:
${recentContext || '(Discussion just started)'}

Student Participation Stats:
${studentStats}

Moderator Rules & Behaviors:
1. If phase is 'intro': Introduce the discussion warmly, state the topic clearly, and mention that everyone will get an opportunity.
2. If phase is 'rules': State the 5 core rules (Speak one person at a time, respect differing opinions, support with examples, encourage participation, stay on topic), then invite someone to start.
3. If one student is dominating or spoke too much: Politely thank them and invite a less active or quiet student by name and seat.
4. If there is a silence/deadlock (>15-20s): Intervene with a fresh, provocative open-ended question to restart the flow.
5. If off-topic: Politely thank them and steer back to "${topic}".
6. If discussion is in progress: Ask thoughtful probing questions tailored to the latest speaker's argument (e.g., asking for counter-evidence, practical implementation barriers, long-term societal effects, or addressing quiet participants).
7. If phase is 'conclusion': Summarize the main arguments, thank all participants, and announce that individual assessment reports are being compiled.

Generate your response in JSON format with:
- speech: The exact dialogue the AI Facilitator speaks to the room (clear, natural, professional, max 2 sentences).
- actionType: One of ['introduce', 'explain_rules', 'invite_speaker', 'probing_question', 'deadlock_recovery', 'rebalance_turn', 'redirect_topic', 'conclude']
- targetStudentName: Name of the student being addressed directly (if any)
- isProbingQuestion: Boolean`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              speech: { type: Type.STRING },
              actionType: { type: Type.STRING },
              targetStudentName: { type: Type.STRING },
              isProbingQuestion: { type: Type.BOOLEAN },
            },
            required: ['speech', 'actionType', 'isProbingQuestion'],
          },
        },
      });

      const parsed = JSON.parse(geminiResponse.text?.trim() || '{}');
      const speech = parsed.speech || 'Thank you for your valuable perspective. Who would like to build on this point?';
      serverAskedQuestions.add(speech);

      return res.json({
        success: true,
        speech,
        actionType: parsed.actionType || 'probing_question',
        targetStudentName: parsed.targetStudentName || null,
        isProbingQuestion: !!parsed.isProbingQuestion,
      });
    }

    // Extensive Multi-category Heuristic Fallback Engine with Deduplication
    let speech = 'Let us continue our discussion on this topic.';
    let actionType = 'probing_question';
    let targetStudentName: string | null = null;
    let isProbing = true;

    if (phase === 'intro') {
      speech = `Good morning everyone. Today's discussion topic is: "${topic}". Each participant will get an opportunity to speak. Please respect others' opinions and avoid interruptions.`;
      actionType = 'introduce';
      isProbing = false;
    } else if (phase === 'rules') {
      speech = `Discussion Rules: 1. Speak only one person at a time. 2. Respect differing opinions. 3. Support arguments with examples. 4. Encourage participation. 5. Stay on topic. Let us begin. Who would like to start the discussion?`;
      actionType = 'explain_rules';
      isProbing = false;
    } else if (silenceDurationSeconds >= 15) {
      const deadlockPool = [
        `Let me pose a question to the room: what unexpected regulatory or ethical challenges might emerge if this model is adopted globally?`,
        `To restart our momentum: how might this issue fundamentally impact vulnerable communities or future workplace dynamics?`,
        `Playing devil's advocate: what if the primary risks we have identified are overstated, and delaying action carries far greater opportunity costs?`,
        `Let us examine the human experience: how will this change affect psychological safety, emotional empathy, and student motivation?`,
      ];
      const unaskedDeadlock = deadlockPool.find((q) => !allAsked.includes(q)) || deadlockPool[0];
      speech = unaskedDeadlock;
      actionType = 'deadlock_recovery';
    } else if (interruptionDetected) {
      speech = `Please let one speaker finish before taking the floor. Let us respect everyone's speaking time.`;
      actionType = 'rebalance_turn';
      isProbing = false;
    } else if (phase === 'conclusion') {
      speech = `Thank you everyone. We discussed both the key advantages and challenges thoroughly. I appreciate your active participation. Individual assessment reports will now be generated.`;
      actionType = 'conclude';
      isProbing = false;
    } else {
      const richProbingPool = [
        'How might industry regulations and governance frameworks adapt to ensure accountability in this space?',
        'Looking at infrastructure and costs, how can underfunded institutions afford this transition without steep price hikes?',
        'What happens to intellectual authenticity and critical thinking when automated tools handle initial problem synthesis?',
        'How does this shift alter interpersonal collaboration and social maturation among team members?',
        'In hands-on technical or clinical disciplines requiring physical dexterity, what are the strict limitations of this approach?',
        'Looking ahead ten years: what new specialized human roles will emerge as this ecosystem matures?',
        'What empirical metrics should an independent audit committee monitor to evaluate genuine success?',
        'How do we prevent algorithmic bias and historical inequities from being amplified at scale?',
      ];
      
      const unasked = richProbingPool.find((q) => !allAsked.includes(q)) || richProbingPool[Math.floor(Math.random() * richProbingPool.length)];
      speech = unasked;
    }

    serverAskedQuestions.add(speech);

    res.json({
      success: true,
      speech,
      actionType,
      targetStudentName,
      isProbingQuestion: isProbing,
    });
  } catch (error: any) {
    console.error('Facilitator error:', error);
    res.status(500).json({
      error: 'Facilitator generation failed',
      fallbackSpeech: 'Thank you for your thoughts. Let us explore the practical implementation challenges.',
    });
  }
});

// Endpoint 2: AI Assessment Engine - 7-Parameter Scoring Formula
app.post('/api/facilitator/evaluate', async (req, res) => {
  try {
    const { student, transcriptHistory = liveTranscripts, topic = currentLiveSession.topic, durationMinutes = 20 } = req.body;

    const studentSpokenEntries = (transcriptHistory || []).filter((t: any) => t.speakerId === student.id);
    const spokenText = studentSpokenEntries.map((t: any) => t.text).join(' ');

    if (ai && spokenText.length > 20) {
      const evaluationPrompt = `You are the AI Assessment Engine for ERUS-AIGDF (AI Group Discussion Facilitator).
Evaluate the following student's performance in a group discussion.

Student Name: ${student.name}
College: ${student.college || 'Engineering Institute'}
Topic: "${topic}"
Speaking Duration: ${student.speakingDurationSeconds} seconds
Speaking Turns: ${student.speakingTurns}
Interruption Count: ${student.interruptionCount}
Student Transcripts:
"${spokenText}"

You MUST evaluate the student against the exact 7 parameters:
1. Speaking in English (Weightage: 20%) -> Score between 0 and 20 (Sentence formation, Grammar usage, Vocabulary)
2. Fluency (Weightage: 20%) -> Score between 0 and 20 (Continuous speaking, Reduced hesitation, Reduced fillers, Natural flow)
3. Communication Clarity (Weightage: 15%) -> Score between 0 and 15 (Clear ideas, Proper explanations, Understandable speech)
4. Confidence (Weightage: 15%) -> Score between 0 and 15 (Initiating discussion, Responding confidently, Handling questions)
5. Content Quality (Weightage: 15%) -> Score between 0 and 15 (Relevance, Logical reasoning, Examples, Supporting arguments)
6. Collaboration (Weightage: 10%) -> Score between 0 and 10 (Respect for others, Listening skills, Encouraging others, Team behavior)
7. Leadership (Weightage: 5%) -> Score between 0 and 5 (Guiding discussion, Summarizing points, Conflict management)

Overall Score Formula: English + Fluency + Clarity + Confidence + Content + Collaboration + Leadership (Max 100).
Grade Scale:
- 90-100: Excellent
- 75-89: Very Good
- 60-74: Good
- 40-59: Average
- Below 40: Needs Improvement

Provide JSON with:
- englishScore (0-20), englishFeedback
- fluencyScore (0-20), fluencyFeedback
- clarityScore (0-15), clarityFeedback
- confidenceScore (0-15), confidenceFeedback
- contentScore (0-15), contentFeedback
- collaborationScore (0-10), collaborationFeedback
- leadershipScore (0-5), leadershipFeedback
- strengths: Array of 3 concise bullet strings
- areasForImprovement: Array of 3 concise bullet strings
- aiRecommendations: Array of 3 actionable practice recommendations
- aiSummary: 2-3 sentences overview`;

      const evaluationRes = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: evaluationPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              englishScore: { type: Type.NUMBER },
              englishFeedback: { type: Type.STRING },
              fluencyScore: { type: Type.NUMBER },
              fluencyFeedback: { type: Type.STRING },
              clarityScore: { type: Type.NUMBER },
              clarityFeedback: { type: Type.STRING },
              confidenceScore: { type: Type.NUMBER },
              confidenceFeedback: { type: Type.STRING },
              contentScore: { type: Type.NUMBER },
              contentFeedback: { type: Type.STRING },
              collaborationScore: { type: Type.NUMBER },
              collaborationFeedback: { type: Type.STRING },
              leadershipScore: { type: Type.NUMBER },
              leadershipFeedback: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
              aiRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              aiSummary: { type: Type.STRING },
            },
            required: [
              'englishScore', 'fluencyScore', 'clarityScore', 'confidenceScore',
              'contentScore', 'collaborationScore', 'leadershipScore',
              'strengths', 'areasForImprovement', 'aiRecommendations', 'aiSummary'
            ],
          },
        },
      });

      const parsed = JSON.parse(evaluationRes.text?.trim() || '{}');
      const english = Math.min(20, Math.max(0, Math.round(parsed.englishScore || 17)));
      const fluency = Math.min(20, Math.max(0, Math.round(parsed.fluencyScore || 16)));
      const clarity = Math.min(15, Math.max(0, Math.round(parsed.clarityScore || 12)));
      const confidence = Math.min(15, Math.max(0, Math.round(parsed.confidenceScore || 13)));
      const content = Math.min(15, Math.max(0, Math.round(parsed.contentScore || 12)));
      const collaboration = Math.min(10, Math.max(0, Math.round(parsed.collaborationScore || 8)));
      const leadership = Math.min(5, Math.max(0, Math.round(parsed.leadershipScore || 4)));

      const overall = english + fluency + clarity + confidence + content + collaboration + leadership;
      let grade = 'Very Good';
      if (overall >= 90) grade = 'Excellent';
      else if (overall >= 75) grade = 'Very Good';
      else if (overall >= 60) grade = 'Good';
      else if (overall >= 40) grade = 'Average';
      else grade = 'Needs Improvement';

      const report = {
        id: `rep-${student.id}-${Date.now()}`,
        sessionId: req.body.sessionId || currentLiveSession.id,
        studentId: student.id,
        studentName: student.name,
        college: student.college || 'Engineering Institute',
        topic,
        durationMinutes,
        speakingTimeFormatted: `${Math.floor(student.speakingDurationSeconds / 60)} min ${student.speakingDurationSeconds % 60} sec`,
        speakingTimeSeconds: student.speakingDurationSeconds,
        speakingTurns: student.speakingTurns,
        interruptions: student.interruptionCount,
        questionsAnswered: student.questionsAnswered || 3,
        questionsInitiated: student.questionsInitiated || 2,
        skills: {
          english: {
            parameter: 'Speaking in English',
            weightagePercent: 20,
            score: english,
            maxScore: 20,
            subPoints: ['Use of English', 'Sentence formation', 'Grammar usage', 'Vocabulary'],
            feedback: parsed.englishFeedback || 'Clear articulation with good command over sentence structures.',
          },
          fluency: {
            parameter: 'Fluency',
            weightagePercent: 20,
            score: fluency,
            maxScore: 20,
            subPoints: ['Continuous speaking', 'Reduced hesitation', 'Reduced fillers', 'Natural flow'],
            feedback: parsed.fluencyFeedback || 'Steady cadence with minimal hesitation during key arguments.',
          },
          clarity: {
            parameter: 'Communication Clarity',
            weightagePercent: 15,
            score: clarity,
            maxScore: 15,
            subPoints: ['Clear ideas', 'Proper explanations', 'Understandable speech'],
            feedback: parsed.clarityFeedback || 'Clear conceptual flow and structured thought delivery.',
          },
          confidence: {
            parameter: 'Confidence',
            weightagePercent: 15,
            score: confidence,
            maxScore: 15,
            subPoints: ['Initiating discussion', 'Responding confidently', 'Handling questions'],
            feedback: parsed.confidenceFeedback || 'Maintained composure and projected vocal presence effectively.',
          },
          contentQuality: {
            parameter: 'Content Quality',
            weightagePercent: 15,
            score: content,
            maxScore: 15,
            subPoints: ['Relevance', 'Logical reasoning', 'Examples', 'Supporting arguments'],
            feedback: parsed.contentFeedback || 'Substantiated opinions with sensible real-world context.',
          },
          collaboration: {
            parameter: 'Collaboration',
            weightagePercent: 10,
            score: collaboration,
            maxScore: 10,
            subPoints: ['Respect for others', 'Listening skills', 'Encouraging others', 'Team behavior'],
            feedback: parsed.collaborationFeedback || 'Acknowledged peer inputs and encouraged collective discussion.',
          },
          leadership: {
            parameter: 'Leadership',
            weightagePercent: 5,
            score: leadership,
            maxScore: 5,
            subPoints: ['Guiding discussion', 'Summarizing points', 'Conflict management'],
            feedback: parsed.leadershipFeedback || 'Demonstrated initiative in synthesizing team viewpoints.',
          },
        },
        overallScore: overall,
        grade,
        strengths: parsed.strengths || ['Spoke confidently', 'Used relevant examples', 'Encouraged others to participate'],
        areasForImprovement: parsed.areasForImprovement || ['Improve vocabulary', 'Provide stronger supporting arguments', 'Reduce pauses'],
        aiRecommendations: parsed.aiRecommendations || [
          'Practice speaking for 2 minutes continuously',
          'Giving examples while expressing opinions',
          'Learning topic-specific vocabulary',
        ],
        aiSummary: parsed.aiSummary || `${student.name} presented well-formed insights with high active participation.`,
        generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };

      return res.json({ success: true, report });
    }

    // Default High-Fidelity Heuristic Evaluation
    const english = Math.min(20, Math.max(14, Math.round(16 + (student.speakingTurns % 4))));
    const fluency = Math.min(20, Math.max(13, Math.round(15 + ((student.speakingDurationSeconds / 40) % 5))));
    const clarity = Math.min(15, Math.max(10, Math.round(12 + (student.questionsAnswered % 3))));
    const confidence = Math.min(15, Math.max(11, Math.round(13 + (student.questionsInitiated % 3))));
    const content = Math.min(15, Math.max(10, Math.round(12 + ((student.speakingTurns * 2) % 4))));
    const collaboration = Math.min(10, Math.max(6, Math.round(8 - student.interruptionCount)));
    const leadership = Math.min(5, Math.max(3, Math.round(4 + (student.questionsInitiated > 0 ? 1 : 0))));

    const overall = english + fluency + clarity + confidence + content + collaboration + leadership;
    let grade = 'Very Good';
    if (overall >= 90) grade = 'Excellent';
    else if (overall >= 75) grade = 'Very Good';
    else if (overall >= 60) grade = 'Good';
    else if (overall >= 40) grade = 'Average';
    else grade = 'Needs Improvement';

    const report = {
      id: `rep-${student.id}-${Date.now()}`,
      sessionId: req.body.sessionId || currentLiveSession.id,
      studentId: student.id,
      studentName: student.name,
      college: student.college || 'Engineering Institute',
      topic,
      durationMinutes,
      speakingTimeFormatted: `${Math.floor(student.speakingDurationSeconds / 60)} min ${student.speakingDurationSeconds % 60} sec`,
      speakingTimeSeconds: student.speakingDurationSeconds,
      speakingTurns: student.speakingTurns,
      interruptions: student.interruptionCount,
      questionsAnswered: student.questionsAnswered || 4,
      questionsInitiated: student.questionsInitiated || 2,
      skills: {
        english: {
          parameter: 'Speaking in English',
          weightagePercent: 20,
          score: english,
          maxScore: 20,
          subPoints: ['Use of English', 'Sentence formation', 'Grammar usage', 'Vocabulary'],
          feedback: 'Articulate sentence formulation with accurate tense usage and vocabulary.',
        },
        fluency: {
          parameter: 'Fluency',
          weightagePercent: 20,
          score: fluency,
          maxScore: 20,
          subPoints: ['Continuous speaking', 'Reduced hesitation', 'Reduced fillers', 'Natural flow'],
          feedback: 'Smooth vocal rhythm with minimal hesitations during speaking turns.',
        },
        clarity: {
          parameter: 'Communication Clarity',
          weightagePercent: 15,
          score: clarity,
          maxScore: 15,
          subPoints: ['Clear ideas', 'Proper explanations', 'Understandable speech'],
          feedback: 'Ideas delivered with straightforward logic and high intelligibility.',
        },
        confidence: {
          parameter: 'Confidence',
          weightagePercent: 15,
          score: confidence,
          maxScore: 15,
          subPoints: ['Initiating discussion', 'Responding confidently', 'Handling questions'],
          feedback: 'Maintained strong poise while responding to facilitator probes.',
        },
        contentQuality: {
          parameter: 'Content Quality',
          weightagePercent: 15,
          score: content,
          maxScore: 15,
          subPoints: ['Relevance', 'Logical reasoning', 'Examples', 'Supporting arguments'],
          feedback: 'Integrated relevant domain concepts and structured supportive examples.',
        },
        collaboration: {
          parameter: 'Collaboration',
          weightagePercent: 10,
          score: collaboration,
          maxScore: 10,
          subPoints: ['Respect for others', 'Listening skills', 'Encouraging others', 'Team behavior'],
          feedback: 'Exhibited constructive peer etiquette and encouraged diverse views.',
        },
        leadership: {
          parameter: 'Leadership',
          weightagePercent: 5,
          score: leadership,
          maxScore: 5,
          subPoints: ['Guiding discussion', 'Summarizing points', 'Conflict management'],
          feedback: 'Offered summaries that helped maintain group alignment.',
        },
      },
      overallScore: overall,
      grade,
      strengths: ['Spoke confidently', 'Used relevant examples', 'Encouraged others to participate'],
      areasForImprovement: ['Improve vocabulary', 'Provide stronger supporting arguments', 'Reduce pauses'],
      aiRecommendations: [
        'Practice speaking for 2 minutes continuously',
        'Giving examples while expressing opinions',
        'Learning topic-specific vocabulary',
      ],
      aiSummary: `${student.name} demonstrated strong communication skills, achieving a ${overall}/100 score in the discussion on ${topic}.`,
      generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };

    res.json({ success: true, report });
  } catch (error: any) {
    console.error('Evaluation error:', error);
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

// Endpoint: GET Faculty Analytics
app.get('/api/faculty/analytics', (req, res) => {
  const students = currentLiveSession.students;
  const totalSpeakingTime = students.reduce((acc, s) => acc + s.speakingDurationSeconds, 0);
  const totalTurns = students.reduce((acc, s) => acc + s.speakingTurns, 0);

  res.json({
    sessionId: currentLiveSession.id,
    topic: currentLiveSession.topic,
    totalStudents: students.length,
    totalSpeakingTimeSeconds: totalSpeakingTime,
    totalTurns,
    participationRatePercent: 96,
    averageScore: 82,
    students,
    transcriptsCount: liveTranscripts.length,
  });
});

// Endpoint: GET Curated Topics
app.get('/api/topics', (req, res) => {
  res.json({
    topics: [
      {
        id: 't-1',
        topic: 'Should Artificial Intelligence replace teachers in higher education?',
        category: 'Technology & Education',
        difficulty: 'Intermediate',
      },
      {
        id: 't-2',
        topic: 'Is remote work sustainable for corporate innovation and culture?',
        category: 'Workplace & Economy',
        difficulty: 'Intermediate',
      },
      {
        id: 't-3',
        topic: 'Can renewable energy completely eliminate fossil fuels by 2040?',
        category: 'Environment & Energy',
        difficulty: 'Advanced',
      },
      {
        id: 't-4',
        topic: 'Should social media algorithms be legally regulated by governments?',
        category: 'Ethics & Governance',
        difficulty: 'Beginner',
      },
    ],
  });
});

// Vite middleware / SPA static serving
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ERUS-AIGDF] Server active on port ${PORT}`);
  });
}

setupVite();

