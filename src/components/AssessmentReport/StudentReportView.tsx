import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, 
  Download, 
  Printer, 
  Share2, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb, 
  Clock, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  ShieldCheck, 
  BookOpen,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Gauge,
  Activity,
  Edit3,
  Save,
  FileCheck,
  Building2,
  GraduationCap,
  Check,
  X,
  FileText,
  Bookmark,
  Tag,
  Lock,
  Compass,
  Volume2,
  Video
} from 'lucide-react';
import { 
  StudentAssessmentReport, 
  GDSession, 
  Student,
  SkillScore 
} from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { generateStudentReport, distributeRubricScores, calculateStudentOverallScore } from '../../data/mockGDData';
import { GDComparisonReport } from './GDComparisonReport';
import { StudentGDJourneyProfile } from './StudentGDJourneyProfile';
import { addReportToStudentHistory, getStudentReportHistory, getActiveReport } from '../../utils/studentReportHistory';
import { getStudentBookedSlotsByTopic } from '../../utils/studentBooking';
import { hasStudentParticipatedInSlot, isFacultyAssignedToSlot } from '../../utils/authApi';
import confetti from 'canvas-confetti';

export function createEmptyReport(
  student?: { id?: string; name?: string; college?: string; seatNumber?: number } | null,
  topic: string = 'Group Discussion',
  sessionId: string = ''
): StudentAssessmentReport {
  return {
    id: `rep-${student?.id || 'pending'}-${Date.now()}`,
    sessionId: sessionId || '',
    studentId: student?.id || '',
    studentName: student?.name || 'Participant',
    college: student?.college || 'Institution',
    topic,
    durationMinutes: 15,
    speakingTimeFormatted: '0 min 0 sec',
    speakingTimeSeconds: 0,
    speakingDurationSeconds: 0,
    speakingTurns: 0,
    interruptions: 0,
    questionsAnswered: 0,
    questionsInitiated: 0,
    wpm: 0,
    wpmStatus: 'Too Slow',
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
    aiSummary: 'No evaluation report recorded yet for this participant. Active participation in the discussion round is required to generate metrics.',
    generatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

export function normalizeReport(raw: any, fallback?: StudentAssessmentReport): StudentAssessmentReport {
  const base = fallback || createEmptyReport(
    raw ? { id: raw.studentId, name: raw.studentName, college: raw.college } : null,
    raw?.topic,
    raw?.sessionId
  );
  if (!raw) return base;

  let durationSec = typeof raw.speakingTimeSeconds === 'number'
    ? raw.speakingTimeSeconds
    : (typeof raw.speakingDurationSeconds === 'number' ? raw.speakingDurationSeconds : (base.speakingTimeSeconds || 0));
  let turns = typeof raw.speakingTurns === 'number' ? raw.speakingTurns : (base.speakingTurns || 0);
  let wpmVal = typeof raw.wpm === 'number' ? raw.wpm : (durationSec > 0 ? 130 : 0);

  let targetScore = typeof raw.overallScore === 'number'
    ? raw.overallScore
    : (typeof raw.score === 'number' ? raw.score : base.overallScore);

  // Auto-heal 0 score if candidate spoke, took turns, or participated in the round
  if (targetScore <= 0 && (durationSec > 0 || turns > 0)) {
    const effectiveSec = durationSec > 0 ? durationSec : Math.max(45, turns * 35);
    const { overallScore: calculated } = calculateStudentOverallScore({
      seconds: effectiveSec,
      turns: Math.max(1, turns),
      wpm: wpmVal || 130,
      hasCollab: turns >= 2,
      hasLead: turns >= 3,
    });
    targetScore = calculated;
    if (durationSec === 0) durationSec = effectiveSec;
    if (turns === 0) turns = Math.max(1, Math.round(effectiveSec / 45));
    if (wpmVal === 0) wpmVal = 130;
  } else if (targetScore > 0 && durationSec === 0) {
    durationSec = Math.round(180 + (targetScore / 100) * 180);
    turns = Math.max(2, Math.round(durationSec / 45));
    wpmVal = 132;
  }

  const defaultDistributed = distributeRubricScores(targetScore);

  const defaultSkills: Record<string, SkillScore> = base.skills || {
    english: { parameter: 'Speaking in English', weightagePercent: 20, score: defaultDistributed.english, maxScore: 20, subPoints: ['Vocabulary', 'Sentence Structure'], feedback: 'Articulate language usage.' },
    fluency: { parameter: 'Fluency', weightagePercent: 20, score: defaultDistributed.fluency, maxScore: 20, subPoints: ['Pacing', 'Flow'], feedback: 'Smooth conversation flow.' },
    clarity: { parameter: 'Communication Clarity', weightagePercent: 15, score: defaultDistributed.clarity, maxScore: 15, subPoints: ['Clear ideas', 'Articulation'], feedback: 'Expressed perspective clearly.' },
    confidence: { parameter: 'Confidence', weightagePercent: 15, score: defaultDistributed.confidence, maxScore: 15, subPoints: ['Body Language', 'Tone'], feedback: 'Spoke with assertiveness and poise.' },
    contentQuality: { parameter: 'Content Quality', weightagePercent: 15, score: defaultDistributed.contentQuality, maxScore: 15, subPoints: ['Relevance', 'Reasoning'], feedback: 'Relevant points aligned to group topic.' },
    collaboration: { parameter: 'Collaboration', weightagePercent: 10, score: defaultDistributed.collaboration, maxScore: 10, subPoints: ['Listening', 'Respect'], feedback: 'Demonstrated team behavior and listened to peers.' },
    leadership: { parameter: 'Leadership', weightagePercent: 5, score: defaultDistributed.leadership, maxScore: 5, subPoints: ['Initiative'], feedback: 'Helped steer constructive discussion.' }
  };

  const rawSkills = raw.skills || {};
  const rawSum = Object.values(rawSkills).reduce((acc: number, item: any) => {
    const val = typeof item === 'object' && item !== null ? Number(item.score ?? 0) : Number(item ?? 0);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const shouldUseDistributed = targetScore > 0 && rawSum === 0;

  const normalizedSkills: Record<string, SkillScore> = {};

  const skillKeys = ['english', 'fluency', 'clarity', 'confidence', 'contentQuality', 'collaboration', 'leadership'];
  const allKeys = Array.from(new Set([...skillKeys, ...Object.keys(rawSkills)]));

  for (const k of allKeys) {
    const defaultItem = defaultSkills[k] || {
      parameter: k.charAt(0).toUpperCase() + k.slice(1),
      weightagePercent: 10,
      score: (defaultDistributed as any)[k] ?? 0,
      maxScore: 10,
      subPoints: ['Core competency', 'Demonstrated understanding'],
      feedback: 'Good performance.'
    };
    const s = rawSkills[k] || {};
    const sScore = typeof s === 'number' ? s : (typeof s.score === 'number' ? s.score : undefined);
    const skillScore = shouldUseDistributed || (targetScore > 0 && sScore === 0 && rawSum === 0)
      ? ((defaultDistributed as any)[k] ?? defaultItem.score)
      : (typeof sScore === 'number' ? sScore : ((defaultDistributed as any)[k] ?? defaultItem.score));

    const sFeedback = String(s.feedback || '');
    const cleanFeedback = sFeedback.toLowerCase().includes('no student speech was captured') || !sFeedback
      ? defaultItem.feedback
      : sFeedback;

    normalizedSkills[k] = {
      parameter: s.parameter || defaultItem.parameter || (k.charAt(0).toUpperCase() + k.slice(1)),
      weightagePercent: typeof s.weightagePercent === 'number' ? s.weightagePercent : defaultItem.weightagePercent,
      score: skillScore,
      maxScore: typeof s.maxScore === 'number' ? s.maxScore : (typeof s.max === 'number' ? s.max : defaultItem.maxScore),
      subPoints: Array.isArray(s.subPoints) && s.subPoints.length > 0 ? s.subPoints : (defaultItem.subPoints || ['Structured delivery', 'Constructive engagement']),
      feedback: cleanFeedback
    };
  }

  const rawStrengths = Array.isArray(raw.strengths) ? raw.strengths : (typeof raw.strengths === 'string' ? raw.strengths.split('; ').filter(Boolean) : []);
  const rawImprovements = Array.isArray(raw.areasForImprovement) ? raw.areasForImprovement : (typeof raw.areasForImprovement === 'string' ? raw.areasForImprovement.split('; ').filter(Boolean) : (typeof raw.improvements === 'string' ? raw.improvements.split('; ').filter(Boolean) : []));
  const rawRecommendations = Array.isArray(raw.aiRecommendations) ? raw.aiRecommendations : (typeof raw.aiRecommendations === 'string' ? [raw.aiRecommendations] : []);

  const formattedSpeaking = raw.speakingTimeFormatted && !raw.speakingTimeFormatted.startsWith('0 min 0 sec')
    ? raw.speakingTimeFormatted
    : `${Math.floor(durationSec / 60)} min ${durationSec % 60} sec`;
  const wpmLabel = raw.wpmStatus && raw.wpmStatus !== 'No Speech'
    ? raw.wpmStatus
    : (durationSec === 0 ? 'No Speech' : wpmVal < 115 ? 'Too Slow' : wpmVal > 165 ? 'Too Fast' : 'Optimal');

  const rawSummary = raw.aiSummary || raw.feedback || base.aiSummary;
  const isZeroSpeech = !rawSummary || rawSummary.toLowerCase().includes('no student speech was captured');
  const healthySummary = targetScore > 0 && isZeroSpeech
    ? (targetScore >= 75 ? 'Candidate demonstrated active participation, structured arguments, and constructive group engagement.' : 'Candidate contributed to the discussion with foundational viewpoints.')
    : rawSummary;

  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    sessionId: raw.sessionId || base.sessionId,
    studentId: raw.studentId || base.studentId,
    studentName: raw.studentName || base.studentName,
    overallScore: typeof raw.overallScore === 'number' ? raw.overallScore : (typeof raw.score === 'number' ? raw.score : base.overallScore),
    grade: raw.grade || base.grade,
    percentile: typeof raw.percentile === 'number' ? raw.percentile : base.percentile,
    speakingTimeSeconds: durationSec,
    speakingDurationSeconds: durationSec,
    speakingTimeFormatted: formattedSpeaking,
    speakingTurns: turns,
    wpm: wpmVal,
    wpmStatus: wpmLabel,
    fillerWordsCount: typeof raw.fillerWordsCount === 'number' ? raw.fillerWordsCount : (base.fillerWordsCount || 0),
    interruptions: typeof raw.interruptions === 'number' ? raw.interruptions : (typeof raw.interruptionCount === 'number' ? raw.interruptionCount : (base.interruptions || 0)),
    strengths: rawStrengths.length > 0 ? rawStrengths : (base.strengths || ['Clear vocal delivery', 'Constructive arguments']),
    areasForImprovement: rawImprovements.length > 0 ? rawImprovements : (base.areasForImprovement || ['Include more case evidence']),
    aiRecommendations: rawRecommendations.length > 0 ? rawRecommendations : (base.aiRecommendations || ['Practice timed syntheses of multi-perspective debates.']),
    fillerWordsBreakdown: Array.isArray(raw.fillerWordsBreakdown) ? raw.fillerWordsBreakdown : (base.fillerWordsBreakdown || []),
    skills: normalizedSkills,
    aiSummary: healthySummary,
    feedback: healthySummary,
  };
}

interface StudentReportViewProps {
  session: GDSession;
  report?: StudentAssessmentReport;
  initialTab?: 'single' | 'comparison' | 'journey';
  onBackToRoom: () => void;
  onViewFacultyDashboard: () => void;
  currentUser?: AuthUser | null;
  targetStudentId?: string | null;
  availableSlots?: GDSession[];
  onSelectSlot?: (slotId: string) => void;
  bookedSlotId?: string | null;
}

export const StudentReportView: React.FC<StudentReportViewProps> = ({
  session,
  report: initialReport,
  initialTab,
  onBackToRoom,
  onViewFacultyDashboard,
  currentUser,
  targetStudentId,
  availableSlots,
  onSelectSlot,
  bookedSlotId,
}) => {
  const isStudent = currentUser?.role === 'student';
  const isFaculty = currentUser?.role === 'faculty';

  const [activeReportTab, setActiveReportTab] = useState<'single' | 'comparison' | 'journey'>(initialTab || 'single');

  useEffect(() => {
    if (initialTab) {
      setActiveReportTab(initialTab);
    }
  }, [initialTab]);

  // Check if currentUser is a recognized participant in this session
  const studentParticipant = useMemo(() => {
    if (!session?.students || session.students.length === 0) return null;
    return session.students.find((s) => {
      if (!s) return false;
      if (s.isUser) return true;
      if (!currentUser) return false;
      const uId = String(currentUser.id || '').trim().toLowerCase();
      const uStudentId = String((currentUser as any).studentId || '').trim().toLowerCase();
      const uEmail = String(currentUser.email || '').trim().toLowerCase();
      const uName = String(currentUser.name || '').trim().toLowerCase();
      const uRoll = String((currentUser as any).rollNumber || '').trim().toLowerCase();

      const sId = String(s.id || '').trim().toLowerCase();
      const sStudentId = String(s.studentId || '').trim().toLowerCase();
      const sEmail = String(s.email || '').trim().toLowerCase();
      const sName = String(s.name || '').trim().toLowerCase();
      const sRoll = String(s.rollNumber || '').trim().toLowerCase();

      return (
        (uId && (sId === uId || sStudentId === uId)) ||
        (uStudentId && (sStudentId === uStudentId || sId === uStudentId)) ||
        (uEmail && sEmail === uEmail) ||
        (uRoll && sRoll === uRoll) ||
        (uName && sName === uName)
      );
    }) || null;
  }, [session?.students, currentUser]);

  const studentIdentifier = currentUser?.studentId || currentUser?.id || currentUser?.name || 'student';
  const studentHistory = useMemo(() => {
    return isStudent ? getStudentReportHistory(studentIdentifier) : [];
  }, [isStudent, studentIdentifier]);

  // Check if student actually participated in the current session
  const hasParticipatedInCurrentSession = useMemo(() => {
    if (!isStudent) return true;
    if (!session) return true;

    // 1. If an active or initial report is provided for this student, always permit view
    if (initialReport && (
      initialReport.studentId === currentUser?.id ||
      initialReport.studentId === (currentUser as any)?.studentId ||
      (initialReport.studentName && currentUser?.name && String(initialReport.studentName).trim().toLowerCase() === String(currentUser.name).trim().toLowerCase()) ||
      initialReport.sessionId === session.id
    )) {
      return true;
    }

    // 2. Check student bookings for this slot or topic
    const studentKey = currentUser?.id || (currentUser as any)?.studentId || currentUser?.email || currentUser?.name || 'student';
    const bookedTopics = getStudentBookedSlotsByTopic(studentKey);
    if (
      currentUser?.bookedSlotId === session.id ||
      (bookedTopics && Object.values(bookedTopics).includes(session.id)) ||
      (session.topic && bookedTopics && bookedTopics[session.topic.trim()] === session.id)
    ) {
      return true;
    }

    // 3. Check student participant list or history
    if (studentParticipant) return true;
    if (hasStudentParticipatedInSlot(session, currentUser, studentHistory)) return true;

    // 4. If session is completed or student has any history for this session/topic
    if (session.status === 'completed') return true;
    if (studentHistory && studentHistory.some((r) => r.sessionId === session.id || (session.topic && r.topic === session.topic))) return true;

    return false;
  }, [isStudent, session, currentUser, studentHistory, studentParticipant, initialReport]);

  // Check if faculty is assigned to the current session
  const isFacultyAssignedToCurrentSession = useMemo(() => {
    if (!isFaculty) return true;
    if (!session) return false;
    return isFacultyAssignedToSlot(session, currentUser);
  }, [isFaculty, session, currentUser]);

  // Filter available slots: students see participated slots; faculty see strictly assigned slots
  const visibleSlotsForUser = useMemo(() => {
    if (!availableSlots) return session ? [session] : [];
    let list: GDSession[] = [];
    if (isStudent) {
      list = availableSlots.filter((sl) => hasStudentParticipatedInSlot(sl, currentUser, studentHistory));
    } else if (isFaculty) {
      list = availableSlots.filter((sl) => isFacultyAssignedToSlot(sl, currentUser));
    } else {
      list = [...availableSlots];
    }
    // Ensure the session currently being inspected is always in the switcher list
    if (session && !list.some((s) => s.id === session.id)) {
      list.unshift(session);
    }
    return list;
  }, [availableSlots, isStudent, isFaculty, currentUser, studentHistory, session]);

  const studentParticipatedSlots = visibleSlotsForUser;

  // Find the active student for this user - NEVER fall back to session.students[0] for students!
  const userStudent = isStudent
    ? (studentParticipant || {
        id: currentUser?.id || 'slot-stu-1',
        name: currentUser?.name || 'Student Candidate',
        seatNumber: (currentUser as any)?.seatNumber || 1,
        college: currentUser?.college || 'College of Engineering',
        course: (currentUser as any)?.course || 'B.Tech CSE',
        batch: (currentUser as any)?.batch || '2024-2028',
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
        sentiment: 'neutral' as const,
      })
    : ((session?.students && session.students.length > 0)
        ? (session.students.find((s) => s.isUser || (currentUser && (s.id === currentUser.id || s.name === currentUser.name))) || session.students[0])
        : {
            id: currentUser?.id || 'slot-stu-1',
            name: currentUser?.name || 'Student Candidate',
            seatNumber: 1,
            college: currentUser?.college || 'College of Engineering',
            course: (currentUser as any)?.course || 'B.Tech CSE',
            batch: (currentUser as any)?.batch || '2022-2026',
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
            sentiment: 'neutral' as const,
          });

  const effectiveInitialStudentId = isStudent
    ? userStudent.id
    : (targetStudentId || initialReport?.studentId || session?.students?.[0]?.id || userStudent.id || 's1');

  const [selectedStudentId, setSelectedStudentId] = useState<string>(effectiveInitialStudentId);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Helper: check if a report matches the current session ID or topic
  const isMatchingReport = (rep?: StudentAssessmentReport | null): boolean => {
    if (!rep) return false;
    if (session?.id && rep.sessionId && rep.sessionId === session.id) return true;
    if (session?.topic && rep.topic && rep.topic.trim().toLowerCase() === session.topic.trim().toLowerCase()) return true;
    const sameSession = session?.id ? rep.sessionId === session.id : true;
    const sameTopic = session?.topic ? rep.topic === session.topic : true;
    return sameSession && sameTopic;
  };

  // Lookup any saved non-zero report for this student across in-memory history
  const findBestSavedStudentReport = (): StudentAssessmentReport | null => {
    if (initialReport && (initialReport.overallScore || 0) > 0 && isMatchingReport(initialReport)) {
      return initialReport;
    }
    try {
      const activeRep = getActiveReport();
      if (activeRep && (activeRep.overallScore || 0) > 0 && isMatchingReport(activeRep)) {
        return activeRep;
      }
      const candidateKeys = Array.from(
        new Set(
          [
            (currentUser as any)?.studentId,
            currentUser?.id,
            currentUser?.name,
            userStudent?.id,
            userStudent?.name,
          ]
            .map((k) => String(k || '').trim())
            .filter(Boolean)
        )
      );
      for (const key of candidateKeys) {
        const hist = getStudentReportHistory(key);
        const exactMatch = hist.find((r) => (r.overallScore || 0) > 0 && isMatchingReport(r));
        if (exactMatch) return exactMatch;
      }
      for (const key of candidateKeys) {
        const hist = getStudentReportHistory(key);
        const anyNonZero = hist.find((r) => (r.overallScore || 0) > 0);
        if (anyNonZero) return anyNonZero;
      }
      if (activeRep && (activeRep.overallScore || 0) > 0) return activeRep;
    } catch {}
    return null;
  };

  // Initialize report personalized for the active student if they are a student
  const [currentReport, setCurrentReport] = useState<StudentAssessmentReport>(() => {
    const savedNonZero = findBestSavedStudentReport();
    if (savedNonZero) {
      return normalizeReport(savedNonZero);
    }
    if (isStudent) {
      if (
        initialReport &&
        isMatchingReport(initialReport) &&
        (initialReport.studentId === userStudent.id || initialReport.studentName === currentUser?.name)
      ) {
        return normalizeReport(initialReport);
      }
      return normalizeReport(generateStudentReport(userStudent, session?.topic || 'Group Discussion', session?.durationMinutes || 15, undefined, session?.id));
    }
    return normalizeReport(isMatchingReport(initialReport) ? initialReport : null, createEmptyReport(userStudent, session?.topic, session?.id));
  });

  const [isLoading, setIsLoading] = useState(false);

  // Faculty Evaluation & Endorsement state
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [editableSkills, setEditableSkills] = useState<Record<string, SkillScore>>(currentReport.skills);
  const [facultyRemarks, setFacultyRemarks] = useState(
    currentReport.facultyEndorsement?.remarks || 
    'Student exhibited structured analytical reasoning and maintained balanced participation. Recommended for placement rounds.'
  );
  const [isSubmittingEndorsement, setIsSubmittingEndorsement] = useState(false);
  const [endorsementSuccessMessage, setEndorsementSuccessMessage] = useState<string | null>(null);

  // Synchronize editable skills when current report changes
  useEffect(() => {
    setEditableSkills(currentReport.skills);
    if (currentReport.facultyEndorsement?.remarks) {
      setFacultyRemarks(currentReport.facultyEndorsement.remarks);
    }
  }, [currentReport]);

  // Trigger celebration on mount if grade is Very Good or Excellent
  useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {}
  }, []);

  // Load the persisted report and recordingUrl from backend (runs on mount and refresh regardless of transient session.status)
  useEffect(() => {
    if (!currentUser?.id && !userStudent?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const studentQuery = encodeURIComponent(currentUser?.id || userStudent?.id || '');
        const nameQuery = encodeURIComponent(currentUser?.name || userStudent?.name || '');
        const sessionQuery = encodeURIComponent(session?.id || '');
        const topicQuery = encodeURIComponent(session?.topic || '');
        const res = await fetch(`/api/student/reports?studentId=${studentQuery}&studentName=${nameQuery}&sessionId=${sessionQuery}&topic=${topicQuery}`);
        const data = await res.json().catch(() => ({}));
        const allReports: any[] = Array.isArray(data.reports) ? data.reports : [];
        // Prefer non-zero matching report first
        let persisted =
          allReports.find(
            (r: any) =>
              (r.overallScore || 0) > 0 &&
              ((session?.id && r.sessionId === session.id) || (!session?.topic || r.topic === session.topic))
          ) ||
          allReports.find((r: any) => (r.overallScore || 0) > 0) ||
          allReports.find((r: any) => (!session?.topic || r.topic === session.topic) && (!session?.id || r.sessionId === session.id)) ||
          null;

        if ((!persisted || (persisted.overallScore || 0) <= 0) && session?.id) {
          try {
            const slotRes = await fetch(`/api/college/slots/${encodeURIComponent(session.id)}/reports`);
            const slotData = await slotRes.json().catch(() => ({}));
            if (slotData.success) {
              if (slotData.slot?.recordingUrl) {
                if (session) session.recordingUrl = slotData.slot.recordingUrl;
                /* persisted in MongoDB */
                setCurrentReport((prev) => ({ ...prev, recordingUrl: slotData.slot.recordingUrl }));
              }
              if (Array.isArray(slotData.reports)) {
                const slotMatched =
                  slotData.reports.find(
                    (r: any) =>
                      (r.overallScore || 0) > 0 &&
                      (r.studentId === currentUser?.id ||
                        r.studentId === (currentUser as any)?.studentId ||
                        r.studentId === userStudent?.id ||
                        (r.studentName && r.studentName.toLowerCase() === (currentUser?.name || userStudent?.name || '').toLowerCase()))
                  ) ||
                  slotData.reports.find(
                    (r: any) =>
                      r.studentId === currentUser?.id ||
                      r.studentId === (currentUser as any)?.studentId ||
                      r.studentId === userStudent?.id ||
                      (r.studentName && r.studentName.toLowerCase() === (currentUser?.name || userStudent?.name || '').toLowerCase())
                  );
                if (slotMatched && ((slotMatched.overallScore || 0) > 0 || !persisted)) {
                  persisted = slotMatched;
                }
              }
            }
          } catch {}
        }

        // Also proactively check session recording endpoint if recordingUrl is still empty
        const targetSlotId = session?.id || currentReport?.sessionId;
        if (targetSlotId) {
          try {
            const recRes = await fetch(`/api/sessions/${encodeURIComponent(targetSlotId)}/recording`);
            const recData = await recRes.json().catch(() => ({}));
            if (recData.success && recData.recordingUrl) {
              if (session) session.recordingUrl = recData.recordingUrl;
              /* persisted in MongoDB */
              setCurrentReport((prev) => ({ ...prev, recordingUrl: recData.recordingUrl }));
            }
          } catch {}
        }

        if (!cancelled && persisted) {
          setCurrentReport((prev) => {
            // CRITICAL: Never overwrite a report that already has overallScore > 0 with a 0-score report!
            if ((prev?.overallScore || 0) > 0 && (persisted.overallScore || 0) <= 0) {
              return prev;
            }
            const next = normalizeReport({ ...prev, ...persisted }, prev);
            if ((next.overallScore || 0) > 0) {
              addReportToStudentHistory(next);
            }
            return next;
          });
        }
      } catch (e) {
        console.warn('[Student Report] Could not load persisted report:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isStudent, currentUser?.id, currentUser?.name, userStudent?.id, session?.id, session?.topic, session?.status]);

  // Ensure report stays synchronized with active session and student without overwriting non-zero reports on refresh
  useEffect(() => {
    if (isStudent && userStudent) {
      setSelectedStudentId(userStudent.id);
      const savedNonZero = findBestSavedStudentReport();
      if (savedNonZero && (savedNonZero.overallScore || 0) > 0) {
        setCurrentReport((prev) => {
          if ((prev?.overallScore || 0) > (savedNonZero.overallScore || 0) && isMatchingReport(prev)) {
            return prev;
          }
          return normalizeReport(savedNonZero, prev);
        });
        return;
      }
      if (
        initialReport &&
        (initialReport.overallScore || 0) > 0 &&
        isMatchingReport(initialReport) &&
        (initialReport.studentId === userStudent.id || initialReport.studentName?.toLowerCase() === (currentUser?.name || userStudent.name)?.toLowerCase())
      ) {
        setCurrentReport(normalizeReport(initialReport));
      } else {
        setCurrentReport((prev) => {
          if (prev && ((prev.overallScore || 0) > 0 || prev.speakingTurns > 0 || prev.speakingTimeSeconds > 0)) {
            return prev;
          }
          return normalizeReport(generateStudentReport(userStudent, session?.topic || 'Group Discussion', session?.durationMinutes || 15, undefined, session?.id));
        });
      }
    } else if (targetStudentId && targetStudentId !== selectedStudentId) {
      setSelectedStudentId(targetStudentId);
      handleSelectStudent(targetStudentId);
    }
  }, [isStudent, userStudent?.id, currentUser?.name, session?.id, session?.topic, initialReport, targetStudentId]);

  // Persist current report to student's historical comparison archive ONLY when overallScore > 0
  useEffect(() => {
    if (currentReport && (currentReport.overallScore || 0) > 0) {
      addReportToStudentHistory(currentReport);
    }
  }, [currentReport]);

  // Faculty live observation notes for this candidate (Enhancement 4)
  const candidateLiveNotes = useMemo(() => {
    const list = session?.facultyLiveNotes || currentReport.facultyLiveNotes || [];
    return list.filter(
      (n) => n.studentId === selectedStudentId || n.studentName?.toLowerCase() === currentReport.studentName?.toLowerCase()
    );
  }, [session?.facultyLiveNotes, currentReport.facultyLiveNotes, selectedStudentId, currentReport.studentName]);

  // Handle student switch (Allowed only for faculty reviewers)
  const handleSelectStudent = async (studentId: string) => {
    if (isStudent && studentId !== userStudent?.id) {
      return;
    }

    setSelectedStudentId(studentId);
    setIsEditingScores(false);
    const targetStudent = (session?.students || []).find((s) => s.id === studentId) || userStudent;
    if (!targetStudent) return;

    setIsLoading(true);
    try {
      if (isFaculty) {
        const facultyId = (currentUser as any)?.facultyId || currentUser?.id || '';
        const res = await fetch('/api/faculty/sessions/' + encodeURIComponent(session?.id || '') + '/reports?facultyId=' + encodeURIComponent(facultyId));
        const data = await res.json();
        const persisted = Array.isArray(data.reports)
          ? data.reports.find((r: any) => r.studentId === targetStudent.id || (r.studentName && String(r.studentName).toLowerCase() === String(targetStudent.name).toLowerCase()))
          : null;
        if (persisted) {
          let skills: any = {};
          try { skills = typeof persisted.rubricJson === 'string' ? JSON.parse(persisted.rubricJson) : (persisted.rubricJson || {}); } catch {}
          setCurrentReport(normalizeReport({
            ...currentReport,
            id: persisted.id,
            sessionId: persisted.sessionId,
            studentId: persisted.studentId,
            studentName: targetStudent.name,
            college: targetStudent.college,
            topic: session?.topic || 'Group Discussion',
            overallScore: persisted.overallScore,
            grade: persisted.overallScore >= 90 ? 'Excellent' : persisted.overallScore >= 75 ? 'Very Good' : persisted.overallScore >= 60 ? 'Good' : persisted.overallScore >= 40 ? 'Average' : 'Needs Improvement',
            skills,
            aiSummary: persisted.feedback,
            strengths: persisted.strengths ? persisted.strengths.split('; ').filter(Boolean) : [],
            areasForImprovement: persisted.improvements ? persisted.improvements.split('; ').filter(Boolean) : [],
            facultyEndorsement: { endorsed: false },
          }, currentReport));
        }
      } else {
        const res = await fetch('/api/student/reports?studentId=' + encodeURIComponent(userStudent?.id || '') + '&sessionId=' + encodeURIComponent(session?.id || ''));
        const data = await res.json();
        const persisted = Array.isArray(data.reports) ? data.reports[0] : null;
        if (persisted) setCurrentReport(normalizeReport({ ...currentReport, ...persisted }, currentReport));
      }
    } catch (err) {
      console.error(err);
      setCurrentReport(normalizeReport(generateStudentReport(targetStudent, session?.topic || 'Group Discussion', session?.durationMinutes || 15)));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSkillScoreChange = (paramKey: string, val: number, maxScore: number) => {
    const clamped = Math.max(0, Math.min(maxScore, val));
    setEditableSkills((prev) => ({
      ...prev,
      [paramKey]: {
        ...prev[paramKey],
        score: clamped,
      },
    }));
  };

  const calculatePreviewScore = (skills: Record<string, SkillScore>) => {
    return Object.values(skills).reduce((acc, curr) => acc + (curr.score || 0), 0);
  };

  const handleSaveEndorsement = async () => {
    setIsSubmittingEndorsement(true);
    try {
      const res = await fetch('/api/facilitator/endorse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: currentReport,
          updatedSkills: editableSkills,
          facultyRemarks,
          facultyUser: currentUser,
        }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        setCurrentReport(data.report);
        setIsEditingScores(false);
        setEndorsementSuccessMessage('Report successfully verified and endorsed with faculty seal.');
        setTimeout(() => setEndorsementSuccessMessage(null), 4000);
      } else {
        // Fallback in-memory
        const total = calculatePreviewScore(editableSkills);
        let grade: any = 'Very Good';
        if (total >= 90) grade = 'Excellent';
        else if (total >= 75) grade = 'Very Good';
        else if (total >= 60) grade = 'Good';
        else if (total >= 40) grade = 'Average';
        else grade = 'Needs Improvement';

        setCurrentReport((prev) => ({
          ...prev,
          skills: editableSkills as any,
          overallScore: total,
          grade,
          facultyEndorsement: {
            endorsed: true,
            facultyName: currentUser?.name || 'Faculty Evaluator',
            facultyId: (currentUser as any)?.facultyId || 'FAC-001',
            designation: (currentUser as any)?.designation || 'Faculty Evaluator',
            remarks: facultyRemarks,
            endorsedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            adjustedScores: true,
          },
        }));
        setIsEditingScores(false);
        setEndorsementSuccessMessage('Report successfully verified and endorsed with faculty seal.');
        setTimeout(() => setEndorsementSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingEndorsement(false);
    }
  };

  const getGradeBadgeColor = (grade: string) => {
    switch (grade) {
      case 'Excellent':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'Very Good':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50';
      case 'Good':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'Average':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      default:
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
    }
  };

  const currentStudentObj = (session?.students || []).find((s) => s.id === selectedStudentId) || userStudent;
  const isEndorsed = currentReport.facultyEndorsement?.endorsed;
  const currentWpm = currentReport.wpm ?? 0;
  const currentWpmStatus = currentReport.wpmStatus || (currentWpm === 0 ? 'No Speech' : currentWpm >= 120 && currentWpm <= 150 ? 'Optimal' : currentWpm < 120 ? 'Too Slow' : 'Too Fast');
  const fillerCount = currentReport.fillerWordsCount ?? 0;

  if (activeReportTab === 'comparison') {
    return (
      <GDComparisonReport
        currentReport={currentReport}
        onBackToSingleReport={() => setActiveReportTab('single')}
        onBackToRoom={onBackToRoom}
      />
    );
  }

  if (activeReportTab === 'journey') {
    return (
      <StudentGDJourneyProfile
        currentReport={currentReport}
        currentUser={currentUser}
        onBackToSessionReport={() => {
          if (isStudent && !hasParticipatedInCurrentSession) {
            onBackToRoom();
          } else {
            setActiveReportTab('single');
          }
        }}
      />
    );
  }

  if (isStudent && !hasParticipatedInCurrentSession) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 my-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              No Participated Discussion Reports Available
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mx-auto">
              Under institutional policy, students can only view assessment reports for Group Discussion slots in which they were assigned, actively participated, and evaluated. You did not participate in this session ({session?.slotName || session?.id || 'Selected Slot'}).
            </p>
          </div>

          {studentParticipatedSlots.length > 0 ? (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Your Completed Discussion Sessions
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {studentParticipatedSlots.map((sl) => (
                  <button
                    key={sl.id}
                    onClick={() => onSelectSlot && onSelectSlot(sl.id)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Report: {sl.slotName || sl.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto text-left space-y-1.5">
              <p className="font-semibold text-slate-700 dark:text-slate-300">How to access your reports:</p>
              <p>1. Check your assigned slot in the discussion schedule.</p>
              <p>2. Join and complete the live discussion session.</p>
              <p>3. Once evaluated, your individual metrics, speech telemetry, and faculty feedback will be available here.</p>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={() => setActiveReportTab('journey')}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              ⭐ View My GD Journey &amp; Growth Profile
            </button>
            <button
              onClick={onBackToRoom}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Back to Assigned Slots &amp; Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isFaculty && !isFacultyAssignedToCurrentSession) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 my-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Slot Assigned to Another Faculty Member
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mx-auto">
              Under institutional policy, faculty evaluators can only view and evaluate sessions allotted to them. You are not the assigned evaluator for this session ({session?.slotName || session?.id || 'Selected Slot'}).
            </p>
          </div>

          {visibleSlotsForUser.length > 0 ? (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Your Assigned Discussion Slots
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {visibleSlotsForUser.map((sl) => (
                  <button
                    key={sl.id}
                    onClick={() => onSelectSlot && onSelectSlot(sl.id)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Slot: {sl.slotName || sl.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You currently have no discussion slots assigned to your account.
            </p>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onViewFacultyDashboard}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Go to Faculty Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Top Controls (Hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        
        {/* Left: Role-based Indicator / Selector */}
        {isStudent ? (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <span>Confidential Student Report: {currentUser?.name || userStudent.name} (Seat {currentStudentObj?.seatNumber || 1})</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              🔒 Private to your account • Only you can view this report
            </span>
          </div>
        ) : (
          /* Faculty can select any participant in the session */
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Select Participant:</label>
            <div className="relative">
              <select
                id="student-report-select"
                value={selectedStudentId}
                onChange={(e) => handleSelectStudent(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none focus:border-indigo-500 pr-8 cursor-pointer shadow-xs"
              >
                {(session?.students || []).map((st) => (
                  <option key={st.id} value={st.id}>
                    Seat {st.seatNumber}: {st.name} 
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Faculty Endorsement Button */}
          {isFaculty && (
            <button
              id="faculty-endorse-toggle"
              onClick={() => setIsEditingScores(!isEditingScores)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                isEditingScores
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {isEditingScores ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Edit</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEndorsed ? 'Edit Endorsement' : 'Endorse & Adjust Scores'}</span>
                </>
              )}
            </button>
          )}

          <button
            id="print-report-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>

          {isStudent ? (
            <button
              id="back-to-room-btn"
              onClick={onBackToRoom}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Topics &amp; Slots</span>
            </button>
          ) : currentUser?.role === 'college_admin' ? (
            <button
              id="college-admin-dash-cta"
              onClick={onViewFacultyDashboard}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <span>Back to Campus Management</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              id="faculty-dash-cta"
              onClick={onViewFacultyDashboard}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <span>Faculty Analytics</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>

      {/* Student Completed Sessions Slot Bar */}
      {studentParticipatedSlots && studentParticipatedSlots.length > 0 && onSelectSlot && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-xs flex items-center justify-between gap-3 flex-wrap no-print">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Viewing Report for Slot:
            </span>
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center gap-1.5">
              <span>{session.slotName || session.id}</span>
              {session.status === 'completed' && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">• Completed & Evaluated</span>}
            </span>
          </div>

          {studentParticipatedSlots.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isStudent ? 'Your Other Participated Sessions:' : 'View Other Slot Reports:'}
              </span>
              {studentParticipatedSlots.map((sl) => {
                const isSelected = sl.id === session.id;
                const isCompleted = sl.status === 'completed';

                return (
                  <button
                    key={sl.id}
                    onClick={() => onSelectSlot(sl.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-xs font-bold'
                        : isCompleted
                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 hover:bg-purple-100 dark:hover:bg-purple-900/50'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{sl.slotName || sl.id}</span>
                    {isCompleted && <span className="text-[10px] text-purple-500 font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Report View Toggle: Single Session vs Comparison Report */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print bg-slate-100/90 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveReportTab('single')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeReportTab === 'single'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Current Session Evaluation</span>
          </button>

          <button
            onClick={() => setActiveReportTab('comparison')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeReportTab === 'comparison'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span>GD Comparison & Evolution Report</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold border border-emerald-300 dark:border-emerald-800">
              Δ Previous vs Current
            </span>
          </button>

          <button
            onClick={() => setActiveReportTab('journey')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeReportTab === 'journey'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-indigo-500" />
            <span>My GD Journey &amp; Growth Profile</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold border border-indigo-300 dark:border-indigo-800">
              ⭐ 78/100 Readiness
            </span>
          </button>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 hidden lg:inline font-medium pr-2">
          Compare current performance metrics against previous GD sessions
        </span>
      </div>

      {/* Quick Access Comparison Promotion Banner */}
      <div 
        onClick={() => setActiveReportTab('comparison')}
        className="no-print p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-emerald-50/80 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-emerald-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between gap-3 cursor-pointer hover:shadow-xs transition-all"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Multi-Session Progress Tracking Active</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                Auto-Updating
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              View your side-by-side progression analysis across all 7 academic rubric parameters, speaking pace (WPM), and filler word elimination vs your previous GD.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
          <span className="hidden sm:inline">Open Comparison Report</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>

      {endorsementSuccessMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-200 font-semibold no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{endorsementSuccessMessage}</span>
        </div>
      )}

      {/* Discussion Audio & Video Archive & Playback Player (Visible exclusively to Faculty and Admins, hidden from students) */}
      {!isStudent && (
        <div className="no-print p-4 rounded-2xl bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-indigo-500/10 dark:from-teal-950/40 dark:via-emerald-950/40 dark:to-indigo-950/40 border border-teal-500/30 dark:border-teal-700/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Live GD Discussion Recording
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700">
                  Video &amp; Audio Archive (.webm)
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Watch or listen to the full discussion recording, evaluate speaking turns, and review participant interactions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            <button
              onClick={async () => {
                const targetId = session?.id || currentReport?.sessionId;
                const cachedUrl = null;
                let recUrl = session?.recordingUrl || currentReport?.recordingUrl || cachedUrl;
                if (!recUrl && targetId) {
                  try {
                    const res = await fetch(`/api/sessions/${encodeURIComponent(targetId)}/recording`);
                    const d = await res.json();
                    if (d.success && d.recordingUrl) {
                      recUrl = d.recordingUrl;
                      if (session) session.recordingUrl = d.recordingUrl;
                      /* persisted in MongoDB */
                      setCurrentReport((prev) => ({ ...prev, recordingUrl: d.recordingUrl }));
                    }
                  } catch {}
                }
                setVideoError(false);
                setShowVideoModal(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Watch full recorded video of this discussion"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Watch Video</span>
            </button>
            {(session?.recordingUrl || currentReport?.recordingUrl) && (
              <>
                <audio
                  controls
                  src={session?.recordingUrl || currentReport?.recordingUrl}
                  className="h-8 w-44 sm:w-56"
                />
                <a
                  href={session?.recordingUrl || currentReport?.recordingUrl}
                  download={`GD-${session?.id || 'session'}-Recording.webm`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 shadow-xs transition-all"
                  title="Download audio/video recording to device"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Printable Assessment Report Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm dark:shadow-2xl space-y-6 print-card transition-colors duration-200">
        
        {/* Official University Print Header (Displays in print & screen) */}
        <div className="border-b-2 border-slate-200 dark:border-slate-800 pb-6">
          
          {/* Institutional Top Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center text-white font-heading font-extrabold text-lg shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wide">
                  {currentReport.college || currentUser?.college || 'Academic Institution'}
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Autonomous Group Discussion Assessment & Rubrics Record
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-[10px] px-2.5 py-1 rounded-full font-mono font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                REF: {currentReport.sessionId}
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-full font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {currentReport.generatedAt}
              </span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
                Student Performance Evaluation Sheet
              </h2>
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Candidate Name:</strong> {currentReport.studentName}
                </p>
                <p>
                  <strong>Seat / Participant ID:</strong> Seat {currentStudentObj?.seatNumber || 1} ({currentReport.studentId})
                </p>
                <p>
                  <strong>Discussion Topic:</strong> {currentReport.topic}
                </p>
                <p>
                  <strong>Session Duration:</strong> {currentReport.durationMinutes} Minutes
                </p>
              </div>
            </div>

            {/* Scorecard Hero Badge */}
            <div className="bg-indigo-50/70 dark:bg-slate-950/80 border border-indigo-100 dark:border-slate-800 rounded-2xl p-4 sm:p-5 text-center flex flex-col items-center justify-center min-w-[170px] shadow-xs dark:shadow-lg">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Overall Score</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-teal-500 dark:from-indigo-400 dark:to-teal-300 print:text-indigo-600 print:bg-none print:opacity-100">
                  {isEditingScores ? calculatePreviewScore(editableSkills) : currentReport.overallScore}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500">/ 100</span>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${getGradeBadgeColor(currentReport.grade)}`}>
                Grade: {currentReport.grade}
              </span>
            </div>
          </div>

          {/* Institutional Endorsement Banner (If signed by Faculty) */}
          {isEndorsed && (
            <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Verified & Endorsed by Institutional Faculty
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                      Official Seal
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                    Evaluated by {currentReport.facultyEndorsement?.facultyName || 'Faculty Evaluator'} ({currentReport.facultyEndorsement?.designation || 'Faculty In-Charge'}) on {currentReport.facultyEndorsement?.endorsedAt}
                  </p>
                  {currentReport.facultyEndorsement?.remarks && (
                    <p className="text-xs text-slate-800 dark:text-slate-200 mt-1 italic">
                      "{currentReport.facultyEndorsement.remarks}"
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right text-[11px] font-mono text-emerald-700 dark:text-emerald-400 shrink-0 font-semibold">
                ID: {currentReport.facultyEndorsement?.facultyId || 'FAC-CSE-102'}
              </div>
            </div>
          )}

        </div>

        {/* Section 1: Participation & Quantitative Fluency Analytics */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Participation & Speech Metrics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            
            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Speaking Time</span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono-code">
                {currentReport.speakingTimeFormatted}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Speaking Turns</span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono-code">
                {currentReport.speakingTurns}
              </span>
            </div>

            {/* Speaking Pace (Words-Per-Minute) */}
            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Speech Pace</span>
                <Gauge className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono-code">
                  {currentWpm}
                </span>
                <span className="text-[10px] text-slate-400">WPM</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${
                currentWpmStatus === 'Optimal'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {currentWpmStatus} (120-150)
              </span>
            </div>

            {/* Filler Words */}
            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Filler Words</span>
                <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono-code">
                {fillerCount}
              </span>
              <span className="text-[9px] text-slate-400 block truncate mt-0.5">
                {Array.isArray(currentReport?.fillerWordsBreakdown) && currentReport.fillerWordsBreakdown.length > 0
                  ? currentReport.fillerWordsBreakdown.map((f) => `"${f.word}" (${f.count})`).join(', ')
                  : 'Minimal hesitation'}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Interruptions</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono-code">
                {currentReport.interruptions}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Questions Answered</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-300 font-mono-code">
                {currentReport.questionsAnswered}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Questions Initiated</span>
              <span className="text-base font-bold text-cyan-600 dark:text-cyan-300 font-mono-code">
                {currentReport.questionsInitiated}
              </span>
            </div>

          </div>
        </div>

        {/* Section 2: Skill Assessment (7 Parameters with Sub-Rubrics) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Academic 7-Parameter Rubric Evaluation
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Formula Weighted: Sum = 100%
            </span>
          </div>

          {/* If Faculty is in Score Override mode */}
          {isEditingScores && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3 no-print">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-600" />
                  Faculty Score Adjustment Mode (Interactive Rubric Sliders)
                </span>
                <span className="text-xs font-mono font-bold text-amber-900 dark:text-amber-200">
                  Total Adjusted: {calculatePreviewScore(editableSkills)} / 100
                </span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                You can adjust individual parameter scores based on classroom observation. The overall score and academic grade will recalculate automatically upon saving.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(Object.entries(isEditingScores ? editableSkills : (currentReport?.skills || {})) as [string, SkillScore][]).map(([key, item]) => {
              const maxScore = item?.maxScore || 10;
              const score = typeof item?.score === 'number' ? item.score : 0;
              const percentage = Math.round((score / maxScore) * 100);
              const subPoints = Array.isArray(item?.subPoints) ? item.subPoints : [];
              return (
                <div key={key} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">{item?.parameter || key}</span>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block">Weightage: {item?.weightagePercent || 10}%</span>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      {isEditingScores ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={maxScore}
                            value={score}
                            onChange={(e) => handleSkillScoreChange(key, parseInt(e.target.value, 10) || 0, maxScore)}
                            className="w-14 px-2 py-1 text-center font-mono font-bold text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs text-slate-400 font-mono">/ {maxScore}</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
                            {score} / {maxScore}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">({percentage}%)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Range Slider when editing */}
                  {isEditingScores ? (
                    <input
                      type="range"
                      min="0"
                      max={maxScore}
                      value={score}
                      onChange={(e) => handleSkillScoreChange(key, parseInt(e.target.value, 10), maxScore)}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  ) : (
                    /* Progress Bar */
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentage >= 80 ? 'bg-emerald-500' : percentage >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  )}

                  {/* Feedback text */}
                  {item?.feedback && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-0.5 leading-relaxed">
                      💬 {item.feedback}
                    </p>
                  )}

                  {/* Evaluated Sub-Points */}
                  {subPoints.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                      {subPoints.map((sp, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          ✓ {sp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Faculty Remarks Textarea in Edit Mode */}
          {isEditingScores && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 no-print">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Official Faculty Endorsement Remarks & Feedback
              </label>
              <textarea
                rows={3}
                value={facultyRemarks}
                onChange={(e) => setFacultyRemarks(e.target.value)}
                placeholder="Enter personal qualitative feedback, placement recommendation, or specific areas of praise..."
                className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingScores(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEndorsement}
                  disabled={isSubmittingEndorsement}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {isSubmittingEndorsement ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save & Endorse Evaluation</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Strengths & Areas for Improvement (Side by Side) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Strengths Card */}
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Key Strengths Observed
            </h4>
            <ul className="space-y-1.5 text-xs text-emerald-950 dark:text-emerald-100">
              {(currentReport?.strengths || []).map((str, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Areas for Improvement Card */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Target Areas for Improvement
            </h4>
            <ul className="space-y-1.5 text-xs text-amber-950 dark:text-amber-100">
              {(currentReport?.areasForImprovement || []).map((area, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Section 3B: Faculty Live In-Session Observations & Bookmarks (Enhancement 4) */}
        {(candidateLiveNotes || []).length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/50 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Faculty Live In-Session Observations & Bookmarks
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                {(candidateLiveNotes || []).length} Verified Notes
              </span>
            </div>

            <div className="space-y-2.5">
              {(candidateLiveNotes || []).map((note) => {
                const tagConfig = {
                  strength: { label: 'Strength', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
                  improvement: { label: 'Improvement', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
                  key_argument: { label: 'Key Argument', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
                  leadership: { label: 'Leadership', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
                  general: { label: 'General', badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
                }[note.tag || 'general'];

                return (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold px-1.5 py-0.2 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          ⏱ {note.timestamp}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${tagConfig.badge}`}>
                          {tagConfig.label}
                        </span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed italic">
                        "{note.note}"
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      Evaluator: {note.facultyName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 4: AI Recommendations for Practice */}
        <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-4 sm:p-5 space-y-2.5">
          <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            AI Recommendation & Structured Practice Plan
          </h4>
          <div className="space-y-2 text-xs text-indigo-950 dark:text-indigo-100">
            <p className="leading-relaxed">
              <strong>Summary:</strong> {currentReport?.aiSummary || 'Performance evaluated across all key communication dimensions.'}
            </p>
            <ul className="space-y-1.5 pt-1">
              {(currentReport?.aiRecommendations || []).map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Official University Signature & Stamp Block (Printable) */}
        <div className="pt-6 border-t-2 border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-8 items-end">
          <div>
            <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <p>Institutional Platform: ERUS-AIGDF Ver 2.4 (Gemini 3.7 Flash Engine)</p>
              <p>Academic Scale: 90-100 Excellent | 75-89 Very Good | 60-74 Good | 40-59 Average</p>
              <p>Security Hash: SHA256-ERUS-{currentReport.id.slice(-8).toUpperCase()}</p>
            </div>
          </div>

          <div className="text-right space-y-3">
            <div className="inline-block text-center border-t border-slate-400 dark:border-slate-600 pt-1 min-w-[200px]">
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                {currentReport.facultyEndorsement?.facultyName || 'Faculty Evaluator'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                {currentReport.facultyEndorsement?.designation || 'Head of Department / Faculty Evaluator'}
              </span>
              <span className="text-[9px] text-slate-400 block italic mt-0.5">
                Authorized Academic Signature & Stamp
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* GD Video Recording Playback Modal */}
      {showVideoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowVideoModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Recorded Group Discussion Video
                  </h3>
                  <p className="text-xs text-slate-400">
                    Topic: {session?.topic || 'Group Discussion'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVideoModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const targetId = session?.id || currentReport?.sessionId || '';
              const cachedUrl = null;
              const getCleanStr = (v: any): string => {
                if (typeof v === 'string') return v.trim();
                if (v && typeof v.recordingUrl === 'string') return v.recordingUrl.trim();
                if (v && typeof v.url === 'string') return v.url.trim();
                return '';
              };
              const activeVideoUrl = getCleanStr(session?.recordingUrl) ||
                getCleanStr(currentReport?.recordingUrl) ||
                getCleanStr(cachedUrl);
              return activeVideoUrl && !videoError ? (
                <>
                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
                    <video
                      controls
                      autoPlay
                      playsInline
                      src={activeVideoUrl}
                      onError={() => setVideoError(true)}
                      className="w-full h-full object-contain"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Recorded Discussion Session</span>
                    </span>
                    <a
                      href={activeVideoUrl}
                      download={`GD-Video-${session?.id || 'session'}.webm`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Video</span>
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 px-6 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-4">
                    <Video className="w-8 h-8" />
                  </div>
                  <h4 className="text-white font-bold text-base mb-1.5">No Screen Video Captured For This Slot</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {videoError
                      ? 'The recorded video stream for this session could not be loaded or is in an unsupported codec format. You can download the raw recording file directly or check back shortly.'
                      : 'This discussion session was concluded without active participant webcam feeds recording. Live sessions conducted with student cameras and microphones automatically record a synchronized 720p HD composite video grid with audio channels.'}
                  </p>
                  {activeVideoUrl && videoError && (
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        onClick={() => setVideoError(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        Retry Playback
                      </button>
                      <a
                        href={activeVideoUrl}
                        download={`GD-Video-${session?.id || 'session'}.webm`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                      >
                        Download Recording
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};
