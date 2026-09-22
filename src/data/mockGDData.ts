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
    });
  }

  return result;
}

export const INITIAL_TRANSCRIPTS: TranscriptEntry[] = [];

export const INITIAL_SLOTS: GDSession[] = [
  {
    id: 'slot-morning-1',
    slotName: 'Slot 1 - Morning Batch',
    slotTiming: '09:30 AM - 10:00 AM',
    slotDate: 'Today',
    enrolledCount: 0,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers?',
    description: 'Exploration of generative AI in pedagogy, human emotional intelligence versus automated adaptive learning platforms.',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric (English, Fluency, Clarity, Confidence, Content, Collaboration, Leadership)',
    status: 'active',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome participants. How can institutions balance AI tools while safeguarding human mentorship? The floor is open.',
    facilitatorAction: 'Monitoring participation balance and encouraging critical examples.',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-midday-2',
    slotName: 'Slot 2 - Midday Batch',
    slotTiming: '11:30 AM - 12:00 PM',
    slotDate: 'Today',
    enrolledCount: 0,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers?',
    description: 'Debating cognitive personalization algorithms versus empathetic educator mentoring in higher technical education.',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Good morning participants of Slot 2. Today we debate whether AI can substitute teachers in higher education. Please maintain decorum and respect divergent views.',
    facilitatorAction: 'Waiting for room start',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-afternoon-3',
    slotName: 'Slot 3 - Afternoon Batch',
    slotTiming: '02:30 PM - 03:00 PM',
    slotDate: 'Today',
    enrolledCount: 0,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers?',
    description: 'Analyzing rural classroom disparities, equitable AI access, and irreplaceable laboratory mentorship.',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to Slot 3. The floor will be open shortly for initial thesis statements.',
    facilitatorAction: 'Session scheduled for afternoon batch',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-evening-4',
    slotName: 'Slot 4 - Evening Batch',
    slotTiming: '04:30 PM - 05:00 PM',
    slotDate: 'Today',
    enrolledCount: 0,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers?',
    description: 'Future perspectives on hybrid teaching models and ethical boundaries of automated grading.',
    durationMinutes: 25,
    difficulty: 'Advanced',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to Slot 4 (Evening). We will begin momentarily.',
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

export function generateStudentReport(
  student: Student,
  topic: string,
  durationMinutes: number = 20,
  baseReport?: StudentAssessmentReport
): StudentAssessmentReport {
  const base = baseReport || SAMPLE_REPORT_RAHUL;
  const turns = student.speakingTurns || 4;
  const durationSec = student.speakingDurationSeconds || 180;

  const english = Math.min(20, Math.max(14, Math.round(16 + (turns % 3))));
  const fluency = Math.min(20, Math.max(13, Math.round(15 + ((durationSec / 45) % 4))));
  const clarity = Math.min(15, Math.max(10, Math.round(12 + ((student.questionsAnswered || 2) % 3))));
  const confidence = Math.min(15, Math.max(11, Math.round(13 + ((student.questionsInitiated || 1) % 3))));
  const content = Math.min(15, Math.max(10, Math.round(12 + ((turns * 2) % 3))));
  const collaboration = Math.min(10, Math.max(7, Math.round(8 - (student.interruptionCount || 0))));
  const leadership = Math.min(5, Math.max(3, Math.round(4 + ((student.questionsInitiated || 0) > 0 ? 1 : 0))));

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
    ...base,
    id: `rep-${student.id}-${Date.now()}`,
    sessionId: 'session-001',
    studentId: student.id,
    studentName: student.name,
    college: student.college || 'Engineering Institute',
    topic,
    durationMinutes,
    speakingTimeFormatted: `${Math.floor(durationSec / 60)} min ${durationSec % 60} sec`,
    speakingTimeSeconds: durationSec,
    speakingTurns: turns,
    interruptions: student.interruptionCount || 0,
    questionsAnswered: student.questionsAnswered || 3,
    questionsInitiated: student.questionsInitiated || 1,
    skills: {
      english: { ...base.skills.english, score: english },
      fluency: { ...base.skills.fluency, score: fluency },
      clarity: { ...base.skills.clarity, score: clarity },
      confidence: { ...base.skills.confidence, score: confidence },
      contentQuality: { ...base.skills.contentQuality, score: content },
      collaboration: { ...base.skills.collaboration, score: collaboration },
      leadership: { ...base.skills.leadership, score: leadership },
    },
    overallScore: overall,
    grade: calculateGrade(overall),
    aiSummary: `${student.name} contributed actively to the group discussion on "${topic}", demonstrating constructive dialogue and structured reasoning.`,
    generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

export const SAMPLE_REPORT_RAHUL: StudentAssessmentReport = {
  id: 'rep-001',
  sessionId: 'session-001',
  studentId: 's1',
  studentName: 'Rahul Kumar',
  college: 'Delhi Institute of Technology',
  topic: 'Should Artificial Intelligence replace teachers?',
  durationMinutes: 20,
  speakingTimeFormatted: '4 min 30 sec',
  speakingTimeSeconds: 270,
  speakingTurns: 6,
  interruptions: 0,
  questionsAnswered: 4,
  questionsInitiated: 2,
  skills: {
    english: {
      parameter: 'Speaking in English',
      weightagePercent: 20,
      score: 17,
      maxScore: 20,
      subPoints: ['Use of English', 'Sentence formation', 'Grammar usage', 'Vocabulary'],
      feedback: 'Fluent and structured syntax with articulate choice of technical descriptors.',
    },
    fluency: {
      parameter: 'Fluency',
      weightagePercent: 20,
      score: 16,
      maxScore: 20,
      subPoints: ['Continuous speaking', 'Reduced hesitation', 'Reduced fillers', 'Natural flow'],
      feedback: 'Maintained steady pacing with minimal vocal pauses throughout opening and rebuttals.',
    },
    clarity: {
      parameter: 'Communication Clarity',
      weightagePercent: 15,
      score: 12,
      maxScore: 15,
      subPoints: ['Clear ideas', 'Proper explanations', 'Understandable speech'],
      feedback: 'Constructed cohesive arguments connecting AI classroom assistance to teacher burnout relief.',
    },
    confidence: {
      parameter: 'Confidence',
      weightagePercent: 15,
      score: 13,
      maxScore: 15,
      subPoints: ['Initiating discussion', 'Responding confidently', 'Handling questions'],
      feedback: 'Successfully initiated the opening premise and answered peer inquiries without hesitation.',
    },
    contentQuality: {
      parameter: 'Content Quality',
      weightagePercent: 15,
      score: 12,
      maxScore: 15,
      subPoints: ['Relevance', 'Logical reasoning', 'Examples', 'Supporting arguments'],
      feedback: 'Provided concrete case studies on automated grading algorithms and hybrid mentorship models.',
    },
    collaboration: {
      parameter: 'Collaboration',
      weightagePercent: 10,
      score: 8,
      maxScore: 10,
      subPoints: ['Respect for others', 'Listening skills', 'Encouraging others', 'Team behavior'],
      feedback: 'Active listener who acknowledged Priya and Ramesh’s arguments before transitioning.',
    },
    leadership: {
      parameter: 'Leadership',
      weightagePercent: 5,
      score: 4,
      maxScore: 5,
      subPoints: ['Guiding discussion', 'Summarizing points', 'Conflict management'],
      feedback: 'Helped steer the room when the topic began drifting towards general robotics.',
    },
  },
  overallScore: 82,
  grade: 'Very Good',
  strengths: [
    'Spoke confidently with steady vocal modulation',
    'Used relevant, real-world pedagogical examples',
    'Encouraged quiet peers to share their perspectives',
  ],
  areasForImprovement: [
    'Improve topic-specific vocabulary in academic policy',
    'Provide stronger data-backed supporting arguments',
    'Reduce pauses when formulating spontaneous rebuttals',
  ],
  aiRecommendations: [
    'Practice speaking for 2 minutes continuously without conversational fillers',
    'Giving concrete statistics and comparative examples while expressing opinions',
    'Learning topic-specific vocabulary to enrich nuanced critical points',
  ],
  aiSummary: 'Rahul demonstrated strong communicative presence, initiating the discussion effectively with 4m 30s of high-quality speaking time and exemplary etiquette.',
  generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
};

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
