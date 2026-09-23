import { GDSession, Student, TranscriptEntry, StudentAssessmentReport, GradeLevel } from '../types/gd';

export const INITIAL_STUDENTS: Student[] = [];

export function generateSlotParticipants(
  count: number = 0,
  userStudent?: { id?: string; name?: string; college?: string; course?: string }
): Student[] {
  const targetCount = Math.max(0, count);
  const result: Student[] = [];

  for (let i = 0; i < targetCount; i++) {
    const seatNum = i + 1;
    const isUser = i === 0;

    result.push({
      id: isUser && userStudent?.id ? userStudent.id : `slot-stu-${seatNum}`,
      name: isUser && userStudent?.name ? userStudent.name : `Participant ${seatNum}`,
      college: isUser && userStudent?.college ? userStudent.college : 'Engineering Institute',
      course: isUser && userStudent?.course ? userStudent.course : 'B.Tech',
      batch: '2022-2026',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=stu-${seatNum}`,
      seatNumber: seatNum,
      isUser,
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

  return result;
}

export const INITIAL_TRANSCRIPTS: TranscriptEntry[] = [];

export const INITIAL_SLOTS: GDSession[] = [
  {
    id: 'slot-genai-1',
    slotName: 'Slot 1 - Morning Batch',
    slotTiming: '10:00 AM - 10:30 AM',
    slotDate: 'Today',
    enrolledCount: 3,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
    description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
    allottedFaculty: 'Dr. Sunita Rao (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric (English, Fluency, Clarity, Confidence, Content, Collaboration, Leadership)',
    status: 'active',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation from syntax memorization to architectural thinking. The floor is open.',
    facilitatorAction: 'Monitoring participation balance and encouraging critical examples.',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-genai-2',
    slotName: 'Slot 2 - Afternoon Batch',
    slotTiming: '02:30 PM - 03:00 PM',
    slotDate: 'Today',
    enrolledCount: 4,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
    description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
    allottedFaculty: 'Dr. Sunita Rao (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to Slot 2. We will begin our discussion momentarily.',
    facilitatorAction: 'Session scheduled for afternoon batch',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-teachers-1',
    slotName: 'Slot 1 - Morning Batch',
    slotTiming: '11:30 AM - 12:00 PM',
    slotDate: 'Today',
    enrolledCount: 2,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers in Higher Education?',
    description: 'Debating cognitive personalization algorithms versus empathetic educator mentoring in higher technical education.',
    allottedFaculty: 'Prof. Rajesh Verma (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Good morning participants. Today we debate whether AI can substitute teachers in higher education. Please maintain decorum.',
    facilitatorAction: 'Waiting for room start',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-ev-1',
    slotName: 'Slot 1 - Evening Batch',
    slotTiming: '04:30 PM - 05:00 PM',
    slotDate: 'Today',
    enrolledCount: 1,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Electric Vehicles vs Hydrogen Fuel Cells: The Future of Mobility',
    description: 'Analyzing battery infrastructure, environmental life-cycle emissions, and commercial feasibility in Indian logistics.',
    allottedFaculty: 'Dr. Ananya Sen (Department)',
    durationMinutes: 25,
    difficulty: 'Advanced',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to the Future of Mobility debate. Which powertrain offers the most viable path to zero emissions?',
    facilitatorAction: 'Session scheduled for evening batch',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
];

export const INITIAL_SESSION: GDSession = INITIAL_SLOTS[0];

export function calculateGrade(score: number): GradeLevel {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Improvement';
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
  // Score formula: English (20%) + Fluency (20%) + Clarity (15%) + Confidence (15%) + Content (15%) + Collaboration (10%) + Leadership (5%)
  // Sum = 20 + 20 + 15 + 15 + 15 + 10 + 5 = 100 max
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

export function createDefaultAssessmentReport(
  student?: Partial<Student>,
  topic: string = 'Group Discussion',
  durationMinutes: number = 20
): StudentAssessmentReport {
  const name = student?.name || 'Participant';
  const turns = student?.speakingTurns ?? 0;
  const durationSec = student?.speakingDurationSeconds ?? 0;
  const interruptions = student?.interruptionCount ?? 0;
  const questionsAnswered = student?.questionsAnswered ?? 0;
  const questionsInitiated = student?.questionsInitiated ?? 0;

  const english = turns > 0 ? Math.min(20, Math.max(12, Math.round(15 + (turns % 4)))) : 15;
  const fluency = durationSec > 0 ? Math.min(20, Math.max(12, Math.round(14 + Math.min(6, durationSec / 60)))) : 15;
  const clarity = turns > 0 ? Math.min(15, Math.max(9, Math.round(11 + (questionsAnswered % 3)))) : 11;
  const confidence = turns > 0 ? Math.min(15, Math.max(10, Math.round(12 + (questionsInitiated % 3)))) : 12;
  const content = turns > 0 ? Math.min(15, Math.max(9, Math.round(11 + ((turns * 2) % 4)))) : 11;
  const collaboration = Math.min(10, Math.max(6, Math.round(8 - interruptions)));
  const leadership = Math.min(5, Math.max(2, Math.round(3 + (questionsInitiated > 0 ? 1 : 0))));

  const overall = computeOverallScore({
    english,
    fluency,
    clarity,
    confidence,
    contentQuality: content,
    collaboration,
    leadership,
  });

  return {
    id: `rep-${student?.id || 'gen'}-${Date.now()}`,
    sessionId: 'session-001',
    studentId: student?.id || 'stu-1',
    studentName: name,
    college: student?.college || 'Academic Institution',
    topic,
    durationMinutes,
    speakingTimeFormatted: `${Math.floor(durationSec / 60)} min ${durationSec % 60} sec`,
    speakingTimeSeconds: durationSec,
    speakingTurns: turns,
    interruptions,
    questionsAnswered,
    questionsInitiated,
    skills: {
      english: {
        parameter: 'Speaking in English',
        weightagePercent: 20,
        score: english,
        maxScore: 20,
        subPoints: ['Grammar usage', 'Vocabulary choice', 'Sentence structure', 'Clarity of articulation'],
        feedback: turns > 0 ? 'Clear vocabulary and grammatically sound sentence construction.' : 'No active speech recorded yet.',
      },
      fluency: {
        parameter: 'Fluency',
        weightagePercent: 20,
        score: fluency,
        maxScore: 20,
        subPoints: ['Continuous speaking', 'Pacing and flow', 'Controlled pauses', 'Natural rhythm'],
        feedback: turns > 0 ? 'Consistent cadence with appropriate breathing intervals.' : 'No active speech recorded yet.',
      },
      clarity: {
        parameter: 'Communication Clarity',
        weightagePercent: 15,
        score: clarity,
        maxScore: 15,
        subPoints: ['Core point expression', 'Logical progression', 'Intelligibility'],
        feedback: turns > 0 ? 'Arguments presented in structured order.' : 'Pending participation data.',
      },
      confidence: {
        parameter: 'Confidence',
        weightagePercent: 15,
        score: confidence,
        maxScore: 15,
        subPoints: ['Tone assertiveness', 'Poise under questioning', 'Initiative'],
        feedback: turns > 0 ? 'Engaged peer questions with steady conviction.' : 'Pending participation data.',
      },
      contentQuality: {
        parameter: 'Content Quality',
        weightagePercent: 15,
        score: content,
        maxScore: 15,
        subPoints: ['Subject relevance', 'Supporting points', 'Fact coherence'],
        feedback: turns > 0 ? 'Addressed the central theme with relevant examples.' : 'Pending participation data.',
      },
      collaboration: {
        parameter: 'Collaboration',
        weightagePercent: 10,
        score: collaboration,
        maxScore: 10,
        subPoints: ['Respectful turn-taking', 'Active listening', 'Peer acknowledgment'],
        feedback: interruptions === 0 ? 'Maintained room etiquette without unprompted interruptions.' : `Recorded ${interruptions} interruption(s).`,
      },
      leadership: {
        parameter: 'Leadership',
        weightagePercent: 5,
        score: leadership,
        maxScore: 5,
        subPoints: ['Discussion direction', 'Conflict moderation', 'Summarization'],
        feedback: questionsInitiated > 0 ? 'Prompted exploratory queries to engage the room.' : 'Contributed to peer discussion.',
      },
    },
    overallScore: overall,
    grade: calculateGrade(overall),
    strengths: turns > 0 ? [
      'Contributed constructive points aligned with the central topic',
      'Followed room turn-taking protocol and respectful dialogue',
      'Exhibited articulate delivery and active listening',
    ] : ['Ready to begin group discussion participation'],
    areasForImprovement: [
      'Expand domain-specific terminology during rebuttals',
      'Cite verifiable empirical evidence or industry benchmarks',
      'Practice seamless transitional phrases when introducing new perspectives',
    ],
    aiRecommendations: [
      'Practice framing an opening statement within 60 seconds with 2 supporting pillars',
      'Incorporate acknowledging phrases before transitioning to counter-arguments',
      'Consistently track session time to deliver concise, high-impact contributions',
    ],
    aiSummary: turns > 0
      ? `${name} engaged constructively in the discussion on "${topic}", contributing ${Math.floor(durationSec / 60)}m ${durationSec % 60}s of speaking time across ${turns} turn(s).`
      : `${name} is enrolled in the session for "${topic}". Assessment will update dynamically as participation begins.`,
    generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

export function generateStudentReport(
  student: Student,
  topic: string,
  durationMinutes: number = 20,
  baseReport?: StudentAssessmentReport
): StudentAssessmentReport {
  return createDefaultAssessmentReport(student, topic, durationMinutes);
}

export const SAMPLE_REPORT_RAHUL: StudentAssessmentReport = createDefaultAssessmentReport(
  { id: 'sample-1', name: 'Participant' },
  'Artificial Intelligence in Education',
  20
);

export const TOPIC_PRESETS = [
  {
    topic: 'Should Artificial Intelligence replace teachers?',
    category: 'Education & AI',
    difficulty: 'Intermediate',
    description: 'Debating AI personalized learning vs human mentorship, empathy, and ethical holistic education.',
    starterPrompt: 'How can AI revolutionize tutoring while preserving the foundational emotional bond between teachers and students?',
  },
  {
    topic: 'Electric Vehicles vs Hydrogen Fuel Cells: The Future of Mobility',
    category: 'Sustainability & Tech',
    difficulty: 'Advanced',
    description: 'Analyzing battery infrastructure, environmental life-cycle emissions, and commercial feasibility.',
    starterPrompt: 'Which powertrain holds the greatest promise for heavy-duty freight and urban mass transit?',
  },
  {
    topic: 'Remote Work vs In-Office: Impact on Corporate Innovation',
    category: 'Workplace & Society',
    difficulty: 'Beginner',
    description: 'Examining asynchronous productivity, serendipitous hallway innovation, and work-life harmony.',
    starterPrompt: 'Do hybrid policies strike the optimal balance or create fragmented organizational culture?',
  },
  {
    topic: 'Are Social Media Algorithms eroding Civil Discourse & Critical Thinking?',
    category: 'Media & Psychology',
    difficulty: 'Intermediate',
    description: 'Investigating echo chambers, polarization, attention spans, and regulatory frameworks.',
    starterPrompt: 'What ethical boundaries should platform architects adhere to when optimizing recommendation algorithms?',
  },
];
