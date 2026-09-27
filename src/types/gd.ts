export interface Student {
  id: string;
  name: string;
  seatNumber: number;
  college: string;
  course: string;
  batch: string;
  avatar: string;
  isUser: boolean;
  micActive: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  questionsAnswered: number;
  questionsInitiated: number;
  sentiment: 'positive' | 'neutral' | 'critical' | 'enthusiastic';
  lastSpokenAt?: number;
  cameraActive?: boolean;
  gender?: 'female' | 'male';
  isRealPeer?: boolean;
  isDemoAI?: boolean;
  isEmptySeat?: boolean;
  volumeLevel?: number;
  bookedSlotId?: string;
}

export interface BreakoutRoom {
  id: string;
  name: string;
  topic: string;
  studentIds: string[];
  status: 'active' | 'completed';
}

export type GDFacilitatorPhase =
  | 'intro'
  | 'rules'
  | 'discussion'
  | 'probing'
  | 'deadlock'
  | 'conclusion';

export interface GDSession {
  id: string;
  topic: string;
  description: string;
  durationMinutes: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  assessmentRubric: string;
  status: 'scheduled' | 'waiting' | 'active' | 'completed';
  students: Student[];
  currentPhase: GDFacilitatorPhase;
  facilitatorSpeech: string;
  facilitatorAction: string;
  isFacilitatorSpeaking: boolean;
  silenceTimerSeconds: number;
  currentSpeakerId: string | null;
  breakoutRooms: BreakoutRoom[];
  createdAt: string;
  startedAt?: number;
  endedAt?: number;
  slotName?: string;
  slotTiming?: string;
  slotDate?: string;
  enrolledCount?: number;
  maxCapacity?: number;
  roomLayout?: GDRoomLayoutType;
  assignedFacultyId?: string;
  assignedFacultyName?: string;
  assignedFacultyEmail?: string;
  assignedFacultyDept?: string;
  facultyLiveNotes?: FacultyLiveNote[];
}

export interface FacultyLiveNote {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  seatNumber?: number;
  timestamp: string; // e.g. '03:42'
  timestampSeconds: number;
  note: string;
  tag?: 'strength' | 'improvement' | 'key_argument' | 'leadership' | 'general';
  facultyName: string;
  createdAt: number;
}

export type GDRoomLayoutType = 'round_table' | 'speaker_center' | 'classroom';

export interface TranscriptEntry {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  seatNumber: number | null;
  isFacilitator: boolean;
  timestamp: string; // e.g. '04:31'
  timestampSeconds: number;
  text: string;
  type: 'statement' | 'question' | 'rebuttal' | 'moderation' | 'probing' | 'warning' | 'intro' | 'conclusion';
  sentiment: 'positive' | 'neutral' | 'constructive';
  detectedParameters?: {
    englishScore?: number;
    fluencyScore?: number;
    clarityScore?: number;
    confidenceScore?: number;
    contentScore?: number;
    collaborationScore?: number;
    leadershipScore?: number;
  };
}

export type GDTranscript = TranscriptEntry;

export interface SkillScore {
  parameter: string;
  weightagePercent: number;
  score: number;
  maxScore: number;
  subPoints: string[];
  feedback: string;
}

export type GradeLevel = 'Excellent' | 'Very Good' | 'Good' | 'Average' | 'Needs Improvement';

export interface StudentAssessmentReport {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  college: string;
  topic: string;
  durationMinutes: number;
  speakingTimeFormatted: string;
  speakingTimeSeconds: number;
  speakingTurns: number;
  interruptions: number;
  questionsAnswered: number;
  questionsInitiated: number;
  skills: {
    english: SkillScore;        // 20%
    fluency: SkillScore;        // 20%
    clarity: SkillScore;        // 15%
    confidence: SkillScore;     // 15%
    contentQuality: SkillScore; // 15%
    collaboration: SkillScore;  // 10%
    leadership: SkillScore;     // 5%
  };
  // Data-grounded Fluency & Speed metrics
  wpm?: number;
  wpmStatus?: 'Optimal' | 'Too Slow' | 'Too Fast';
  fillerWordsCount?: number;
  fillerWordsBreakdown?: { word: string; count: number }[];

  // Faculty verification & institutional sign-off
  facultyEndorsement?: {
    endorsed: boolean;
    facultyName?: string;
    facultyId?: string;
    designation?: string;
    remarks?: string;
    endorsedAt?: string;
    adjustedScores?: boolean;
  };

  overallScore: number; // 0-100 calculated by exact formula
  grade: GradeLevel;
  strengths: string[];
  areasForImprovement: string[];
  aiRecommendations: string[];
  aiSummary: string;
  generatedAt: string;
  facultyLiveNotes?: FacultyLiveNote[];
}

export interface FacultySessionAnalytics {
  sessionId: string;
  topic: string;
  studentCount: number;
  durationMinutes: number;
  participationPercentage: number;
  averageScore: number;
  studentReports: StudentAssessmentReport[];
  heatMapData: {
    minute: number;
    speakerDistributions: { studentId: string; studentName: string; secondsSpoken: number }[];
  }[];
  speakingTimeComparison: {
    studentName: string;
    seatNumber: number;
    seconds: number;
    turns: number;
    score: number;
  }[];
  aiSummary: string;
  debateKeyInsights: {
    pros: string[];
    cons: string[];
    consensus: string;
  };
}
