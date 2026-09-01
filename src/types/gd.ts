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
  status: 'scheduled' | 'active' | 'completed';
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
}

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
  overallScore: number; // 0-100 calculated by exact formula
  grade: GradeLevel;
  strengths: string[];
  areasForImprovement: string[];
  aiRecommendations: string[];
  aiSummary: string;
  generatedAt: string;
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
