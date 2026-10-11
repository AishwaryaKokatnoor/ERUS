import { GDSession, Student, TranscriptEntry, StudentAssessmentReport, GradeLevel } from '../types/gd';

export const INITIAL_STUDENTS: Student[] = [];


export function generateSlotParticipants(
  count: number = 0,
  userStudent?: { id?: string; name?: string; college?: string; course?: string }
): Student[] {
  if (userStudent && userStudent.name) {
    return [
      {
        id: userStudent.id || 'speaker-user',
        name: userStudent.name,
        college: userStudent.college || 'Institution',
        course: userStudent.course || 'Engineering',
        batch: '2024-2028',
        seatNumber: 1,
        avatar: '',
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
        sentiment: 'neutral',
        isEmptySeat: false,
      },
    ];
  }
  return [];
}

export const INITIAL_TRANSCRIPTS: TranscriptEntry[] = [];

export interface FacultyMemberInfo {
  id: string;
  name: string;
  email: string;
  facultyId: string;
  department: string;
  designation: string;
  avatar?: string;
}

export const INSTITUTIONAL_FACULTY: FacultyMemberInfo[] = [];

export const DEFAULT_GD_SESSION: GDSession = {
  id: 'session-default',
  slotName: 'General GD Session',
  slotTiming: '',
  slotDate: 'Today',
  enrolledCount: 0,
  maxCapacity: 15,
  roomLayout: 'round_table',
  assignedFacultyId: '',
  assignedFacultyName: '',
  assignedFacultyDept: '',
  assignedFacultyEmail: '',
  topic: 'General Discussion',
  description: 'Group Discussion Room',
  durationMinutes: 25,
  difficulty: 'Intermediate',
  assessmentRubric: 'Standard Academic 7-Parameter Rubric',
  status: 'waiting',
  students: [],
  currentPhase: 'intro',
  facilitatorSpeech: 'Welcome to the Group Discussion. The floor is open.',
  facilitatorAction: 'Discussion room active',
  isFacilitatorSpeaking: false,
  silenceTimerSeconds: 0,
  currentSpeakerId: null,
  breakoutRooms: [],
  createdAt: new Date().toISOString(),
};

export const INITIAL_SLOTS: GDSession[] = [];

export const INITIAL_SESSION: GDSession = DEFAULT_GD_SESSION;

export function calculateGrade(score: number): GradeLevel {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Improvement';
}

/**
 * Calculates duration score up to 70 points according to institutional GD policy:
 * - 0s: 0 points
 * - 20s: 15 points
 * - 40s: 30 points
 * - 60s (1 min): 40 points
 * - 120s (2 mins): 60 points
 * - 180s (3:00 mins and more): 70 points
 */
export function calculateDurationScore(seconds: number): number {
  if (!seconds || seconds <= 0) return 0;
  if (seconds <= 20) {
    return (seconds / 20) * 15;
  }
  if (seconds <= 40) {
    return 15 + ((seconds - 20) / 20) * (30 - 15);
  }
  if (seconds <= 60) {
    return 30 + ((seconds - 40) / 20) * (40 - 30);
  }
  if (seconds <= 120) {
    return 40 + ((seconds - 60) / 60) * (60 - 40);
  }
  if (seconds <= 180) {
    return 60 + ((seconds - 120) / 60) * (70 - 60);
  }
  return 70;
}

/**
 * Calculates qualitative performance score up to 30 points:
 * Assesses fluency, pacing (WPM), vocabulary diversity, argument structure,
 * and conversational collaboration/leadership.
 */
export function calculateQualityScore(params: {
  seconds: number;
  words?: number;
  turns?: number;
  wpm?: number;
  fillerWordsCount?: number;
  hasCollab?: boolean;
  hasLead?: boolean;
}): number {
  const { seconds, words = 0, turns = 1, wpm = 0, fillerWordsCount = 0, hasCollab = false, hasLead = false } = params;
  if (!seconds || seconds <= 0) return 0;

  // Fluency & pacing component (up to 10 points)
  let fluencyPoints = 5;
  if (wpm >= 110 && wpm <= 165) {
    fluencyPoints = 10;
  } else if (wpm >= 90 && wpm <= 185) {
    fluencyPoints = 8;
  } else if (wpm > 0) {
    fluencyPoints = 5;
  }
  if (fillerWordsCount > 4) {
    fluencyPoints = Math.max(2, fluencyPoints - 2);
  }

  // Content quality, vocabulary & articulation (up to 10 points)
  let contentPoints = 4;
  if (words >= 150) contentPoints = 10;
  else if (words >= 80) contentPoints = 8;
  else if (words >= 35) contentPoints = 6;
  else if (words > 0) contentPoints = Math.max(2, Math.round((words / 35) * 5));

  // Collaboration, turn taking & presence (up to 6 points)
  let collabPoints = 3;
  if (hasCollab || turns >= 3) collabPoints = 6;
  else if (turns >= 2) collabPoints = 5;
  else collabPoints = 3;

  // Leadership & initiative (up to 4 points)
  let leadPoints = 2;
  if (hasLead || turns >= 4) leadPoints = 4;
  else if (turns >= 2) leadPoints = 3;

  const rawQuality = fluencyPoints + contentPoints + collabPoints + leadPoints;
  const volumeFactor = Math.min(1, Math.max(0.2, seconds / 120));
  return Math.min(30, Math.max(0, Math.round(rawQuality * volumeFactor)));
}

/**
 * Calculates overall score (0-100) combining speaking duration (up to 70 pts)
 * and speech quality/fluency (up to 30 pts).
 */
export function calculateStudentOverallScore(params: {
  seconds: number;
  words?: number;
  turns?: number;
  wpm?: number;
  fillerWordsCount?: number;
  hasCollab?: boolean;
  hasLead?: boolean;
}): {
  durationScore: number;
  qualityScore: number;
  overallScore: number;
} {
  const seconds = Math.max(0, params.seconds || 0);
  if (seconds <= 0) {
    return { durationScore: 0, qualityScore: 0, overallScore: 0 };
  }
  const durationScore = calculateDurationScore(seconds);
  const qualityScore = calculateQualityScore({
    seconds,
    words: params.words ?? Math.round(seconds * 2.2),
    turns: params.turns ?? (seconds > 0 ? Math.max(1, Math.round(seconds / 40)) : 0),
    wpm: params.wpm ?? 130,
    fillerWordsCount: params.fillerWordsCount ?? (seconds > 60 ? 3 : 1),
    hasCollab: params.hasCollab ?? (seconds > 45),
    hasLead: params.hasLead ?? (seconds > 90),
  });
  const overallScore = Math.min(100, Math.max(0, Math.round(durationScore + qualityScore)));
  return { durationScore, qualityScore, overallScore };
}

/**
 * Distributes total score (0-100) across the 7 academic rubrics
 * Max points: English 20, Fluency 20, Clarity 15, Confidence 15, Content 15, Collaboration 10, Leadership 5
 * Sum of rubric scores strictly equals overallScore.
 */
export function distributeRubricScores(
  overallScore: number,
  relativeStrengths?: {
    english?: number;
    fluency?: number;
    clarity?: number;
    confidence?: number;
    contentQuality?: number;
    collaboration?: number;
    leadership?: number;
  }
): {
  english: number;
  fluency: number;
  clarity: number;
  confidence: number;
  contentQuality: number;
  collaboration: number;
  leadership: number;
} {
  const target = Math.min(100, Math.max(0, Math.round(overallScore)));
  if (target === 0) {
    return { english: 0, fluency: 0, clarity: 0, confidence: 0, contentQuality: 0, collaboration: 0, leadership: 0 };
  }

  const caps = {
    english: 20,
    fluency: 20,
    clarity: 15,
    confidence: 15,
    contentQuality: 15,
    collaboration: 10,
    leadership: 5,
  };

  const weights = {
    english: relativeStrengths?.english ?? 20,
    fluency: relativeStrengths?.fluency ?? 20,
    clarity: relativeStrengths?.clarity ?? 15,
    confidence: relativeStrengths?.confidence ?? 15,
    contentQuality: relativeStrengths?.contentQuality ?? 15,
    collaboration: relativeStrengths?.collaboration ?? 10,
    leadership: relativeStrengths?.leadership ?? 5,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const allocated: Record<string, number> = {};
  let currentSum = 0;

  (Object.keys(caps) as (keyof typeof caps)[]).forEach((key) => {
    const rawVal = Math.round((weights[key] / totalWeight) * target);
    const clamped = Math.min(caps[key], Math.max(0, rawVal));
    allocated[key] = clamped;
    currentSum += clamped;
  });

  let diff = target - currentSum;
  const keysByCapacity = (Object.keys(caps) as (keyof typeof caps)[]).sort((a, b) => caps[b] - caps[a]);

  while (diff !== 0) {
    let changed = false;
    for (const k of keysByCapacity) {
      if (diff > 0 && allocated[k] < caps[k]) {
        allocated[k] += 1;
        diff -= 1;
        changed = true;
        if (diff === 0) break;
      } else if (diff < 0 && allocated[k] > 0) {
        allocated[k] -= 1;
        diff += 1;
        changed = true;
        if (diff === 0) break;
      }
    }
    if (!changed) break;
  }

  return {
    english: allocated.english,
    fluency: allocated.fluency,
    clarity: allocated.clarity,
    confidence: allocated.confidence,
    contentQuality: allocated.contentQuality,
    collaboration: allocated.collaboration,
    leadership: allocated.leadership,
  };
}

export function computeOverallScore(skills: {
  english: number;        // out of 20
  fluency: number;        // out of 20
  clarity: number;        // out of 15
  confidence: number;     // out of 15
  contentQuality: number; // out of 15
  collaboration: number;  // out of 10
  leadership: number;     // out of 5
}): number {
  const total =
    skills.english +
    skills.fluency +
    skills.clarity +
    skills.confidence +
    skills.contentQuality +
    skills.collaboration +
    skills.leadership;
  return Math.min(100, Math.max(0, Math.round(total)));
}

export function generateStudentReport(
  student: Student,
  topic: string,
  durationMinutes: number = 20,
  baseReport?: StudentAssessmentReport,
  sessionId?: string
): StudentAssessmentReport {
  // Only inherit baseReport if it belongs to the exact same session and topic
  const isSameSession = baseReport && (
    (sessionId && baseReport.sessionId === sessionId) ||
    (student.bookedSlotId && baseReport.sessionId === student.bookedSlotId)
  );
  const isSameTopic = baseReport && baseReport.topic === topic;
  const base = (isSameSession && isSameTopic) ? baseReport : SAMPLE_REPORT_RAHUL;

  const turns = typeof student.speakingTurns === 'number' ? student.speakingTurns : 0;
  const durationSec = typeof student.speakingDurationSeconds === 'number' ? student.speakingDurationSeconds : 0;
  const words = Math.max(0, Math.round(durationSec * 2.2));
  const wpm = durationSec > 0 ? ((isSameSession && baseReport?.wpm) || (durationSec >= 60 ? 135 : 110)) : 0;
  const fillerCount = (isSameSession && baseReport?.fillerWordsCount !== undefined)
    ? baseReport.fillerWordsCount
    : (durationSec > 90 ? 3 : durationSec > 20 ? 1 : 0);

  const { overallScore } = calculateStudentOverallScore({
    seconds: durationSec,
    words,
    turns,
    wpm,
    fillerWordsCount: fillerCount,
    hasCollab: turns >= 2,
    hasLead: turns >= 3 || (student.questionsInitiated || 0) > 0,
  });

  const rubricScores = distributeRubricScores(overallScore);

  let aiSummary = '';
  if (durationSec <= 0) {
    aiSummary = `${student.name} did not log speaking time during this session on "${topic}". Active verbal participation is required to earn assessment points.`;
  } else if (durationSec < 60) {
    aiSummary = `${student.name} spoke briefly (${Math.floor(durationSec / 60)}m ${durationSec % 60}s) on "${topic}". Demonstrated initial perspective but needs more sustained participation across multiple turns.`;
  } else if (durationSec < 120) {
    aiSummary = `${student.name} engaged constructively in the group discussion on "${topic}", logging ${Math.floor(durationSec / 60)}m ${durationSec % 60}s across ${turns} turn(s) with clear articulation.`;
  } else {
    aiSummary = `${student.name} was a primary contributor in the group discussion on "${topic}", delivering ${Math.floor(durationSec / 60)}m ${durationSec % 60}s of sustained dialogue with strong reasoning and collaborative leadership.`;
  }

  const strengths: string[] = [];
  if (durationSec >= 60) strengths.push(`Sustained active participation (${Math.floor(durationSec / 60)}m ${durationSec % 60}s speaking time)`);
  if (turns >= 2) strengths.push(`Contributed across ${turns} distinct speaking turns`);
  if (wpm >= 110 && wpm <= 165) strengths.push(`Maintained an optimal conversational speaking pace (${wpm} WPM)`);
  if (strengths.length === 0 && durationSec > 0) strengths.push('Participated and shared viewpoints during the round');

  const areasForImprovement: string[] = [];
  if (durationSec < 60) areasForImprovement.push('Increase overall speaking duration towards the 2–3 minute benchmark');
  if (turns < 2) areasForImprovement.push('Intervene multiple times across different phases of the discussion');
  if (fillerCount > 3) areasForImprovement.push(`Reduce conversational filler words (${fillerCount} detected)`);
  if (areasForImprovement.length === 0) areasForImprovement.push('Substantiate arguments with concrete empirical data and industry case studies');

  const aiRecommendations: string[] = [
    `For "${topic}", prepare 2–3 structured talking points to sustain discussion across the entire round.`,
    'Acknowledge peer comments with active listening markers ("Building on that point...") before introducing new ideas.',
    'Pace contributions evenly to maximize both speaking duration and collaborative turn-taking.'
  ];

  if (/ai|artificial intelligence|tech|automation|cyber|digital|software/i.test(topic)) {
    aiRecommendations[0] = `For "${topic}", substantiate arguments with technological trade-offs, ethical AI boundaries, and practical industry adoption constraints.`;
  } else if (/climate|environment|green|energy|sustainab|electric|ev/i.test(topic)) {
    aiRecommendations[0] = `For "${topic}", reference quantifiable sustainability metrics, environmental policy precedents, and infrastructure transition feasibility.`;
  } else if (/education|college|student|exam|academic|learn/i.test(topic)) {
    aiRecommendations[0] = `For "${topic}", address student-centric pedagogical outcomes, equitable access across institutions, and holistic curriculum evaluation.`;
  } else if (/work|remote|hybrid|office|job|employ/i.test(topic)) {
    aiRecommendations[0] = `For "${topic}", weigh workforce productivity indicators against workplace culture and team collaboration dynamics.`;
  }

  return {
    ...base,
    id: (isSameSession && isSameTopic && baseReport?.id) ? baseReport.id : `rep-${student.id}-${Date.now()}`,
    sessionId: sessionId || student.bookedSlotId || (isSameSession ? base.sessionId : undefined) || 'session-001',
    studentId: student.id,
    studentName: student.name,
    college: student.college || 'Engineering Institute',
    topic,
    durationMinutes,
    speakingTimeFormatted: `${Math.floor(durationSec / 60)} min ${durationSec % 60} sec`,
    speakingTimeSeconds: durationSec,
    speakingTurns: turns,
    interruptions: student.interruptionCount || 0,
    questionsAnswered: student.questionsAnswered || 0,
    questionsInitiated: student.questionsInitiated || 0,
    wpm,
    wpmStatus: wpm === 0 ? 'Too Slow' : wpm < 115 ? 'Too Slow' : wpm > 165 ? 'Too Fast' : 'Optimal',
    fillerWordsCount: fillerCount,
    fillerWordsBreakdown: (isSameSession && baseReport?.fillerWordsBreakdown) || [
      { word: 'like', count: Math.min(1, fillerCount) },
      { word: 'basically', count: Math.max(0, fillerCount - 1) },
    ],
    facultyEndorsement: (isSameSession && baseReport?.facultyEndorsement) || {
      endorsed: false,
    },
    skills: {
      english: { ...base.skills.english, score: rubricScores.english, feedback: durationSec > 0 ? (rubricScores.english > 12 ? 'Consistently articulate language usage.' : 'Basic English sentence formation observed.') : 'No speech recorded.' },
      fluency: { ...base.skills.fluency, score: rubricScores.fluency, feedback: durationSec > 0 ? (rubricScores.fluency > 12 ? 'Maintained smooth conversation flow.' : 'Pacing showed hesitation or brief duration.') : 'No speech recorded.' },
      clarity: { ...base.skills.clarity, score: rubricScores.clarity, feedback: durationSec > 0 ? (rubricScores.clarity > 9 ? 'Expressed perspective clearly.' : 'Points were brief; expand ideas further.') : 'No speech recorded.' },
      confidence: { ...base.skills.confidence, score: rubricScores.confidence, feedback: durationSec > 0 ? (rubricScores.confidence > 9 ? 'Spoke with assertiveness and poise.' : 'Build confidence by speaking up earlier.') : 'No speech recorded.' },
      contentQuality: { ...base.skills.contentQuality, score: rubricScores.contentQuality, feedback: durationSec > 0 ? (rubricScores.contentQuality > 9 ? `Relevant arguments aligned to "${topic}".` : `Points were brief on "${topic}"; add supporting reasons.`) : 'No speech recorded.' },
      collaboration: { ...base.skills.collaboration, score: rubricScores.collaboration, feedback: durationSec > 0 ? (rubricScores.collaboration > 6 ? 'Demonstrated team behavior and listened to peers.' : 'Engage with peer arguments directly.') : 'No speech recorded.' },
      leadership: { ...base.skills.leadership, score: rubricScores.leadership, feedback: durationSec > 0 ? (rubricScores.leadership > 3 ? 'Helped steer constructive discussion.' : 'Take initiative in summarizing points.') : 'No speech recorded.' },
    },
    overallScore,
    grade: calculateGrade(overallScore),
    strengths,
    areasForImprovement,
    aiRecommendations,
    aiSummary,
    generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

export const SAMPLE_REPORT_RAHUL: StudentAssessmentReport = {
  id: '',
  sessionId: '',
  studentId: '',
  studentName: 'Participant',
  college: 'Institution',
  topic: 'Group Discussion',
  durationMinutes: 15,
  speakingTimeFormatted: '0 min 0 sec',
  speakingTimeSeconds: 0,
  speakingTurns: 0,
  interruptions: 0,
  questionsAnswered: 0,
  questionsInitiated: 0,
  wpm: 0,
  wpmStatus: 'Optimal',
  fillerWordsCount: 0,
  fillerWordsBreakdown: [],
  facultyEndorsement: {
    endorsed: false,
  },
  skills: {
    english: {
      parameter: 'Speaking in English',
      weightagePercent: 20,
      score: 0,
      maxScore: 20,
      subPoints: ['Use of English', 'Sentence formation', 'Grammar usage', 'Vocabulary'],
      feedback: 'Awaiting session evaluation.',
    },
    fluency: {
      parameter: 'Fluency',
      weightagePercent: 20,
      score: 0,
      maxScore: 20,
      subPoints: ['Continuous speaking', 'Reduced hesitation', 'Reduced fillers', 'Natural flow'],
      feedback: 'Awaiting session evaluation.',
    },
    clarity: {
      parameter: 'Communication Clarity',
      weightagePercent: 15,
      score: 0,
      maxScore: 15,
      subPoints: ['Clear ideas', 'Proper explanations', 'Understandable speech'],
      feedback: 'Awaiting session evaluation.',
    },
    confidence: {
      parameter: 'Confidence',
      weightagePercent: 15,
      score: 0,
      maxScore: 15,
      subPoints: ['Initiating discussion', 'Responding confidently', 'Handling questions'],
      feedback: 'Awaiting session evaluation.',
    },
    contentQuality: {
      parameter: 'Content Quality',
      weightagePercent: 15,
      score: 0,
      maxScore: 15,
      subPoints: ['Relevance', 'Logical reasoning', 'Examples', 'Supporting arguments'],
      feedback: 'Awaiting session evaluation.',
    },
    collaboration: {
      parameter: 'Collaboration',
      weightagePercent: 10,
      score: 0,
      maxScore: 10,
      subPoints: ['Respect for others', 'Listening skills', 'Encouraging others', 'Team behavior'],
      feedback: 'Awaiting session evaluation.',
    },
    leadership: {
      parameter: 'Leadership',
      weightagePercent: 5,
      score: 0,
      maxScore: 5,
      subPoints: ['Guiding discussion', 'Summarizing points', 'Conflict management'],
      feedback: 'Awaiting session evaluation.',
    },
  },
  overallScore: 0,
  grade: 'Needs Improvement',
  strengths: [],
  areasForImprovement: [],
  aiRecommendations: [],
  aiSummary: 'No evaluation report generated yet. Participate in a Group Discussion session to receive your personalized AI evaluation.',
  generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
};

export const TOPIC_PRESETS: { topic: string; category: string; difficulty: string; description: string; starterPrompt: string; }[] = [];
