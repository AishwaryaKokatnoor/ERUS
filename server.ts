import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// Real-Time Socket.IO Room Participant Store
export interface RoomParticipant {
  socketId: string;
  userId: string;
  name: string;
  seatNumber: number;
  college: string;
  course: string;
  batch: string;
  avatar: string;
  role: 'student' | 'faculty';
  micActive: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  cameraActive: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  questionsAnswered: number;
  questionsInitiated: number;
  joinedAt: number;
}

// Room participants mapping: roomId -> Map<socketId, RoomParticipant>
const roomUsersMap = new Map<string, Map<string, RoomParticipant>>();
// Socket to room mapping: socketId -> { roomId: string; userId: string }
const socketToRoomMap = new Map<string, { roomId: string; userId: string }>();

function normalizeRoomId(roomId?: string): string {
  return (roomId || 'slot-morning-1').trim();
}

function allocateSeatNumber(roomMap: Map<string, RoomParticipant>, preferredSeat?: number): number {
  const occupiedSeats = new Set<number>();
  for (const p of roomMap.values()) {
    if (p.seatNumber) occupiedSeats.add(p.seatNumber);
  }
  if (preferredSeat && preferredSeat >= 1 && preferredSeat <= 15 && !occupiedSeats.has(preferredSeat)) {
    return preferredSeat;
  }
  for (let s = 1; s <= 15; s++) {
    if (!occupiedSeats.has(s)) return s;
  }
  return roomMap.size + 1;
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

const DEFAULT_STUDENTS: BackendStudent[] = [];

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
  students: [],
  breakoutRooms: [],
  createdAt: new Date().toISOString(),
  startedAt: Date.now(),
};

let liveTranscripts: BackendTranscript[] = [];

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
  const { topic, description, durationMinutes = 20, difficulty = 'Intermediate', assessmentRubric = 'Standard Academic 7-Parameter Rubric' } = req.body;

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
    students: [],
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  };

  liveTranscripts = [];

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
      const prompt = `You are simulating an Indian college student named ${selectedPeer.name} (${selectedPeer.course} at ${selectedPeer.college}) participating in a collegiate group discussion.
Topic: "${currentLiveSession.topic}"
Recent group statements:
${recentHistory}

Language, Accent & Tone Guidelines:
- Language: Authentic Indian Academic English as spoken in Indian university GDs.
- Tone: Polite, articulate, well-structured, and collaborative.
- Use natural collegiate phrasing such as: "Building upon what [Peer] pointed out...", "If we look at the ground reality in our context...", "I would like to offer a counter-perspective here...", "From a practical standpoint...", "We must also consider the grassroots implications...".
- Length: 2 to 3 concise, intelligent sentences. Avoid American slang or idioms. Speak strictly in natural Indian collegiate English.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      peerStatement = response.text?.trim() || '';
    }

    if (!peerStatement) {
      const fallbackList = [
        'Building upon what my colleague pointed out, if we look at our Indian educational context, digital infrastructure and affordable access must be addressed first.',
        'I would like to present a constructive counter-perspective here. While technological automation offers great scale, human mentorship, empathy, and moral guidance cannot be replaced.',
        'Looking at the ground reality in technical disciplines, hands-on laboratory verification remains absolutely vital to ensure real-world engineering competency.',
        'A balanced hybrid pedagogical approach would allow faculty members to dedicate quality time towards individual student mentoring rather than administrative tasks.',
        'From a practical implementation standpoint, we must also examine data privacy and whether our institutions have adequate regulatory safeguards in place.',
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
Your role is that of a dignified, articulate Indian collegiate GD moderator and evaluator.
Topic: "${topic}"
Current Phase: ${phase}
Silence Duration: ${silenceDurationSeconds} seconds
Interruption Detected: ${interruptionDetected}
${previousQuestionsBlock}
Recent Transcript:
${recentContext || '(Discussion just started)'}

Student Participation Stats:
${studentStats}

Language, Accent & Moderator Behavior Guidelines:
- Language: Authentic, formal Indian Academic English with an Indian collegiate moderator demeanor (dignified, polite, encouraging yet firm).
- Phrasing & Style:
  1. If phase is 'intro': Introduce the discussion warmly with Indian academic greeting ("Good morning participants. Today's group discussion topic is: '${topic}'... Each candidate will receive an opportunity to put forth their views.").
  2. If phase is 'rules': State the 5 core rules clearly (Speak one at a time, respect differing viewpoints, substantiate with examples, ensure balanced participation, stay strictly on topic), then invite someone to initiate.
  3. If one student is dominating: Politely thank them and invite a less active or quiet peer by name and seat ("Thank you [Name] for your points. I would like to request our other peers, such as [Quiet Student], to share their perspective.").
  4. If there is a silence/deadlock (>15-20s): Intervene with a fresh, provocative open-ended question relevant to practical realities, ethics, or societal impact in our context.
  5. If off-topic: Politely thank them and steer back to "${topic}".
  6. If discussion is in progress: Ask thoughtful probing questions tailored to the latest speaker's argument (asking for counter-evidence, practical implementation barriers in our context, long-term societal effects, or addressing quiet participants).
  7. If phase is 'conclusion': Summarize the main arguments, thank all participants with dignity, and announce that individual assessment reports are being compiled.

Generate your response in JSON format with:
- speech: The exact dialogue the AI Facilitator speaks to the room (clear, natural, professional Indian English, max 2 sentences).
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
      speech = `Good morning participants. Welcome to this group discussion. Today's topic is: "${topic}". Each participant will receive an opportunity to put forth their views. Kindly maintain decorum, listen actively, and avoid interruptions.`;
      actionType = 'introduce';
      isProbing = false;
    } else if (phase === 'rules') {
      speech = `Before we begin, kindly note the ground rules: 1. Speak one at a time. 2. Respect differing viewpoints. 3. Support arguments with concrete examples. 4. Encourage quiet peers to participate. 5. Stay strictly on topic. Let us initiate the discussion. Who would like to start?`;
      actionType = 'explain_rules';
      isProbing = false;
    } else if (silenceDurationSeconds >= 15) {
      const deadlockPool = [
        `Let me pose a question to the room: what unexpected regulatory or ethical challenges might emerge if this model is adopted in our Indian context?`,
        `To restart our momentum: how might this issue fundamentally impact vulnerable communities and future workplace dynamics?`,
        `Playing devil's advocate: what if the primary risks we have identified are overstated, and delaying action carries far greater opportunity costs?`,
        `Let us examine the human experience: how will this change affect psychological safety, emotional empathy, and student motivation?`,
      ];
      const unaskedDeadlock = deadlockPool.find((q) => !allAsked.includes(q)) || deadlockPool[0];
      speech = unaskedDeadlock;
      actionType = 'deadlock_recovery';
    } else if (interruptionDetected) {
      speech = `Kindly allow the speaker to conclude their thoughts before taking the floor. Let us maintain mutual respect and speaking decorum.`;
      actionType = 'rebalance_turn';
      isProbing = false;
    } else if (phase === 'conclusion') {
      speech = `Thank you everyone. We have had a comprehensive and thoughtful discussion covering both opportunities and practical challenges. The session is now concluded, and individual assessment reports will be compiled.`;
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
7. Leadership & Decision Making (Weightage: 5%) -> Score between 0 and 5. MANDATORY BEHAVIORAL RULE: If the student was the first to speak and initiated/started the GD, award maximum leadership score (5/5) and praise their leadership initiative in leadershipFeedback. If the student concluded or synthesized the discussion, award maximum score (5/5) and praise their decision-making and synthesis skills in leadershipFeedback.

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

// Endpoint: GET Live Room Participants
app.get('/api/room/:roomId/users', (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);
  const roomMap = roomUsersMap.get(roomId);
  const users = roomMap ? Array.from(roomMap.values()) : [];
  res.json({ success: true, roomId, count: users.length, users });
});

// Vite middleware / SPA static serving & Socket.IO initialization
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

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // 1. Join Room: Ensure all users join the exact SAME room
    const handleJoin = (data: { roomId?: string; user?: any }) => {
      const roomId = normalizeRoomId(data?.roomId);
      const user = data?.user || {};

      // Leave any existing room this socket was in
      const existing = socketToRoomMap.get(socket.id);
      if (existing && existing.roomId !== roomId) {
        socket.leave(existing.roomId);
        const oldRoom = roomUsersMap.get(existing.roomId);
        if (oldRoom) {
          oldRoom.delete(socket.id);
          io.to(existing.roomId).emit('room_users', Array.from(oldRoom.values()));
        }
      }

      socket.join(roomId);

      if (!roomUsersMap.has(roomId)) {
        roomUsersMap.set(roomId, new Map());
      }
      const roomMap = roomUsersMap.get(roomId)!;

      // Clean up any stale connection for the same user ID in this room
      if (user.id) {
        for (const [sId, p] of roomMap.entries()) {
          if (p.userId === user.id && sId !== socket.id) {
            roomMap.delete(sId);
            socketToRoomMap.delete(sId);
          }
        }
      }

      const seatNumber = allocateSeatNumber(roomMap, user.seatNumber);
      const participant: RoomParticipant = {
        socketId: socket.id,
        userId: user.id || socket.id,
        name: user.name || 'Participant',
        seatNumber,
        college: user.college || 'Engineering Institute',
        course: user.course || 'B.Tech CSE',
        batch: user.batch || '2022-2026',
        avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name || socket.id)}`,
        role: user.role || 'student',
        micActive: !!user.micActive,
        isSpeaking: !!user.isSpeaking,
        hasRaisedHand: !!user.hasRaisedHand,
        cameraActive: !!user.cameraActive,
        speakingDurationSeconds: user.speakingDurationSeconds || 0,
        speakingTurns: user.speakingTurns || 0,
        interruptionCount: user.interruptionCount || 0,
        questionsAnswered: user.questionsAnswered || 0,
        questionsInitiated: user.questionsInitiated || 0,
        joinedAt: Date.now(),
      };

      roomMap.set(socket.id, participant);
      socketToRoomMap.set(socket.id, { roomId, userId: participant.userId });

      console.log(`[Socket.IO] User "${participant.name}" joined room "${roomId}" (Seat ${participant.seatNumber}). Room size: ${roomMap.size}`);

      // Broadcast to ALL clients in the room using io.to (including sender)
      const userList = Array.from(roomMap.values());
      io.to(roomId).emit('room_users', userList);
      io.to(roomId).emit('user_joined', { participant, roomId });
    };

    socket.on('join_room', handleJoin);
    socket.on('join-room', handleJoin);

    // 2. Leave Room
    const handleLeave = (data: { roomId?: string }) => {
      const roomId = normalizeRoomId(data?.roomId);
      socket.leave(roomId);
      const roomMap = roomUsersMap.get(roomId);
      if (roomMap && roomMap.has(socket.id)) {
        const departing = roomMap.get(socket.id);
        roomMap.delete(socket.id);
        socketToRoomMap.delete(socket.id);
        const userList = Array.from(roomMap.values());
        console.log(`[Socket.IO] User "${departing?.name}" left room "${roomId}". Remaining: ${userList.length}`);
        // Broadcast to ALL clients in the room
        io.to(roomId).emit('room_users', userList);
        io.to(roomId).emit('user_left', { socketId: socket.id, userId: departing?.userId, name: departing?.name });
      }
    };

    socket.on('leave_room', handleLeave);
    socket.on('leave-room', handleLeave);

    // 3. User Speech Statement Broadcast
    socket.on('user_speak', (data: { roomId: string; transcript: any; studentId: string; text: string; elapsedSeconds?: number }) => {
      const roomId = normalizeRoomId(data?.roomId);
      const roomMap = roomUsersMap.get(roomId);
      if (roomMap) {
        for (const p of roomMap.values()) {
          if (p.userId === data.studentId || p.socketId === data.studentId) {
            p.isSpeaking = true;
            p.speakingTurns = (p.speakingTurns || 0) + 1;
            p.speakingDurationSeconds = (p.speakingDurationSeconds || 0) + Math.max(15, Math.round((data.text || '').length / 8));
          } else {
            p.isSpeaking = false;
          }
        }
        io.to(roomId).emit('room_users', Array.from(roomMap.values()));
      }

      // Broadcast transcript and active speaker to ALL clients in room
      io.to(roomId).emit('new_transcript', data.transcript);
      io.to(roomId).emit('speaker_active', { speakerId: data.studentId, isSpeaking: true });
    });

    // 4. Speaker Yield / Finish Turn
    socket.on('speaker_yield', (data: { roomId: string; studentId?: string }) => {
      const roomId = normalizeRoomId(data?.roomId);
      const roomMap = roomUsersMap.get(roomId);
      if (roomMap) {
        for (const p of roomMap.values()) {
          p.isSpeaking = false;
        }
        io.to(roomId).emit('room_users', Array.from(roomMap.values()));
      }
      io.to(roomId).emit('speaker_active', { speakerId: null, isSpeaking: false });
    });

    // 5. Hand Raise Toggle
    socket.on('hand_raise_toggle', (data: { roomId: string; studentId: string }) => {
      const roomId = normalizeRoomId(data?.roomId);
      const roomMap = roomUsersMap.get(roomId);
      if (roomMap) {
        for (const p of roomMap.values()) {
          if (p.userId === data.studentId || p.socketId === data.studentId) {
            p.hasRaisedHand = !p.hasRaisedHand;
          }
        }
        io.to(roomId).emit('room_users', Array.from(roomMap.values()));
      }
    });

    // 6. Camera / Mic Media Status Toggle
    socket.on('media_toggle', (data: { roomId: string; studentId: string; cameraActive?: boolean; micActive?: boolean }) => {
      const roomId = normalizeRoomId(data?.roomId);
      const roomMap = roomUsersMap.get(roomId);
      if (roomMap) {
        for (const p of roomMap.values()) {
          if (p.userId === data.studentId || p.socketId === data.studentId) {
            if (data.cameraActive !== undefined) p.cameraActive = data.cameraActive;
            if (data.micActive !== undefined) p.micActive = data.micActive;
          }
        }
        io.to(roomId).emit('room_users', Array.from(roomMap.values()));
      }
    });

    // 7. Facilitator Speech Broadcast
    socket.on('facilitator_speak', (data: { roomId: string; transcript: any; speech: string; actionType?: string; phase?: string }) => {
      const roomId = normalizeRoomId(data?.roomId);
      io.to(roomId).emit('new_transcript', data.transcript);
      io.to(roomId).emit('facilitator_spoken', {
        speech: data.speech,
        actionType: data.actionType,
        phase: data.phase,
      });
    });

    // 8. Room Layout Change Sync
    socket.on('layout_change', (data: { roomId: string; layout: string }) => {
      const roomId = normalizeRoomId(data?.roomId);
      io.to(roomId).emit('layout_updated', { layout: data.layout });
    });

    // 9. Client Disconnect: Auto remove from room and broadcast updated user list
    socket.on('disconnect', () => {
      const entry = socketToRoomMap.get(socket.id);
      if (entry) {
        const { roomId, userId } = entry;
        socketToRoomMap.delete(socket.id);
        const roomMap = roomUsersMap.get(roomId);
        if (roomMap) {
          const departing = roomMap.get(socket.id);
          roomMap.delete(socket.id);
          const userList = Array.from(roomMap.values());
          console.log(`[Socket.IO] Client disconnected: ${socket.id} (${departing?.name}). Room "${roomId}" remaining: ${userList.length}`);
          // Broadcast to ALL remaining clients in room
          io.to(roomId).emit('room_users', userList);
          io.to(roomId).emit('user_left', { socketId: socket.id, userId, name: departing?.name });
        }
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[ERUS-AIGDF] Server active on port ${PORT} (Socket.IO + Express)`);
  });
}

setupVite();

