import React, { useEffect, useMemo, useState } from 'react';
import { 
  BarChart3, 
  Users, 
  Clock, 
  TrendingUp, 
  Award, 
  Download, 
  FileText, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  Play, 
  Filter, 
  Search,
  ExternalLink,
  ChevronRight,
  Bookmark,
  Calendar,
  AlertTriangle,
  Activity,
  Flame,
  ShieldAlert,
  HelpCircle,
  CheckCircle,
  SlidersHorizontal,
  ArrowUpRight,
  Volume2,
  Eye,
  Radio,
  Video,
  X
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry } from '../../types/gd';
import { INITIAL_SESSION, calculateStudentOverallScore } from '../../data/mockGDData';
import { formatSlotDate } from '../../utils/studentBooking';
import { downloadFacultyReport } from '../../utils/managementReports';
import { isFacultyAssignedToSlot, isSlotCompletedLocally } from '../../utils/authApi';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

interface FacultyDashboardViewProps {
  session: GDSession;
  transcripts: TranscriptEntry[];
  onViewStudentReport: (studentId: string) => void;
  onBackToRoom: () => void;
  onStartSession?: (slotId?: string) => void;
  onEnterGDRoom?: (slotId: string) => void;
  availableSlots?: GDSession[];
  onSelectSlot?: (slotId: string) => void;
  facultyId?: string;
  currentUser?: any;
}

export const FacultyDashboardView: React.FC<FacultyDashboardViewProps> = ({
  session,
  transcripts,
  onViewStudentReport,
  onBackToRoom,
  onStartSession,
  onEnterGDRoom,
  availableSlots,
  onSelectSlot,
  facultyId,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [persistedReports, setPersistedReports] = useState<any[]>([]);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [activeVideoSlot, setActiveVideoSlot] = useState<any | null>(null);


  const aiSummary = persistedReports.length > 0
    ? 'Reports are based on the persisted participant evaluations generated from the final session transcript.'
    : 'No persisted participant evaluations are available for this session yet.';

  // Compute student rankings and scores. Normalize every incoming array so a
  // faculty account with no assigned slots/participants can never crash the UI.
  const safeSession = session || ({ ...INITIAL_SESSION, students: [] } as any);
  const safeTranscripts = Array.isArray(transcripts) ? transcripts : [];
  const safeFacultyLiveNotes = Array.isArray(safeSession?.facultyLiveNotes) ? safeSession.facultyLiveNotes : [];
  const safeAvailableSlots = useMemo(() => {
    const base = Array.isArray(availableSlots) ? availableSlots : [];
    if (currentUser?.role === 'faculty' || facultyId) {
      const facUser = currentUser || { id: facultyId, facultyId, role: 'faculty' };
      return base.filter((sl) => isFacultyAssignedToSlot(sl, facUser));
    }
    return base;
  }, [availableSlots, currentUser, facultyId]);

  const [slotCategoryTab, setSlotCategoryTab] = useState<'all' | 'scheduled' | 'completed'>('scheduled');

  const scheduledSlots = useMemo(() => {
    return safeAvailableSlots.filter((s) => s.status !== 'completed' && !isSlotCompletedLocally(s.id));
  }, [safeAvailableSlots]);

  const completedSlots = useMemo(() => {
    return safeAvailableSlots.filter((s) => s.status === 'completed' || isSlotCompletedLocally(s.id));
  }, [safeAvailableSlots]);

  const displayedFacultySlots = useMemo(() => {
    if (slotCategoryTab === 'scheduled') return scheduledSlots;
    if (slotCategoryTab === 'completed') return completedSlots;
    return safeAvailableSlots;
  }, [slotCategoryTab, scheduledSlots, completedSlots, safeAvailableSlots]);

  useEffect(() => {
    if (!safeSession?.id) return;
    let cancelled = false;
    (async () => {
      try {
        let loadedReports: any[] = [];
        if (facultyId) {
          const res = await fetch('/api/faculty/sessions/' + encodeURIComponent(safeSession.id) + '/reports?facultyId=' + encodeURIComponent(facultyId));
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.reports) && data.reports.length > 0) {
              loadedReports = data.reports;
            }
          }
        }
        if (loadedReports.length === 0) {
          const slotRes = await fetch('/api/college/slots/' + encodeURIComponent(safeSession.id) + '/reports');
          if (slotRes.ok) {
            const slotData = await slotRes.json();
            if (Array.isArray(slotData.reports) && slotData.reports.length > 0) {
              loadedReports = slotData.reports;
            }
          }
        }
        if (loadedReports.length === 0 && safeAvailableSlots.length > 0) {
          const completedSlots = safeAvailableSlots.filter((s) => s.status === 'completed' && s.id !== safeSession.id);
          for (const cSlot of completedSlots) {
            try {
              const cRes = await fetch('/api/college/slots/' + encodeURIComponent(cSlot.id) + '/reports');
              if (cRes.ok) {
                const cData = await cRes.json();
                if (Array.isArray(cData.reports) && cData.reports.length > 0) {
                  loadedReports = cData.reports;
                  break;
                }
              }
            } catch {}
          }
        }
        if (!cancelled) setPersistedReports(loadedReports);
      } catch (e) {
        if (!cancelled) setPersistedReports([]);
        console.warn('[Faculty Reports] Could not load persisted reports:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [facultyId, safeSession?.id, session?.status, safeAvailableSlots]);

  const reportByStudent = useMemo(() => {
    const map = new Map<string, any>();
    persistedReports.forEach((r) => map.set(r.studentId, r));
    return map;
  }, [persistedReports]);

  // STRICT FILTER: Display ONLY students who actually participated in the GD session.
  // Excludes empty desks, available seats, and unassigned/unoccupied seat placeholders.
  const participatedStudents = useMemo(() => {
    const raw = Array.isArray(safeSession?.students) ? safeSession.students : [];

    // 1. Exclude empty seats, available desks, and placeholder seat IDs
    const validStudents = raw.filter((s) => {
      if (!s) return false;
      if (s.isEmptySeat) return false;
      if (s.college === 'Available Desk') return false;
      if (typeof s.id === 'string' && (s.id.endsWith('-empty') || s.id.startsWith('seat-'))) return false;
      if (/^Seat\s+\d+$/i.test(s.name?.trim() || '')) return false;
      return true;
    });

    // 2. Identify students with actual participation:
    // - has a persisted report
    // - or has speaking duration / turns > 0
    // - or appears in transcripts
    // - or questions answered / initiated > 0
    // - or is the active user participant
    const participated = validStudents.filter((s) => {
      const hasReport = reportByStudent.has(s.id) || persistedReports.some((r) => r.studentName && String(r.studentName).toLowerCase() === String(s.name).toLowerCase());
      const hasSpoken = (s.speakingDurationSeconds || 0) > 0 || (s.speakingTurns || 0) > 0;
      const inTranscript = safeTranscripts.some((t) => !t.isFacilitator && (t.speakerId === s.id || String(t.speakerName).toLowerCase() === String(s.name).toLowerCase()));
      const hasQA = (s.questionsAnswered || 0) > 0 || (s.questionsInitiated || 0) > 0;
      const isUser = !!s.isUser || !!s.isRealPeer;

      return hasReport || hasSpoken || inTranscript || hasQA || isUser;
    });

    const result = [...participated];

    // 3. Add any real students from persistedReports that weren't in safeSession.students
    persistedReports.forEach((r) => {
      const rNameTrimmed = String(r?.studentName || '').trim();
      if (!rNameTrimmed || /^Seat\s+\d+$/i.test(rNameTrimmed) || rNameTrimmed === 'Available Desk' || r.college === 'Available Desk') return;
      if (!result.some((s) => s.id === r.studentId || String(s.name).toLowerCase() === rNameTrimmed.toLowerCase())) {
        result.push({
          id: r.studentId || `stu-${r.seatNumber || 1}`,
          name: r.studentName,
          seatNumber: r.seatNumber || (result.length + 1),
          college: r.college || safeSession?.collegeCode || 'Institution',
          course: (r as any).course || 'Engineering',
          batch: (r as any).batch || '2024-2028',
          avatar: (r as any).avatar || '',
          isUser: false,
          micActive: false,
          isSpeaking: false,
          hasRaisedHand: false,
          speakingDurationSeconds: r.speakingTimeSeconds || r.speakingDurationSeconds || 0,
          speakingTurns: r.speakingTurns || 0,
          interruptionCount: r.interruptions || 0,
          questionsAnswered: r.questionsAnswered || 0,
          questionsInitiated: r.questionsInitiated || 0,
          sentiment: 'neutral',
          isEmptySeat: false,
        });
      }
    });

    if (result.length > 0) {
      return result;
    }

    // Fallback: If session is newly scheduled/waiting and no speech recorded yet, show enrolled students only
    return validStudents;
  }, [safeSession.students, reportByStudent, persistedReports, safeTranscripts, safeSession?.collegeCode]);

  const [matrixFilter, setMatrixFilter] = useState<'all' | 'red' | 'yellow' | 'green' | 'too_silent' | 'too_dominant' | 'good_speaker'>('all');

  const studentStats = participatedStudents.map((s) => {
    const persisted = reportByStudent.get(s.id) || persistedReports.find((r) => r.studentName && String(r.studentName).toLowerCase() === String(s.name).toLowerCase());
    const speakingSecs = s.speakingDurationSeconds || 0;
    const turns = s.speakingTurns || 0;
    
    let calculatedScore = typeof persisted?.overallScore === 'number' && persisted.overallScore > 0
      ? persisted.overallScore
      : (turns > 0 || speakingSecs > 0 ? calculateStudentOverallScore({ seconds: speakingSecs, turns }).overallScore : (persisted?.overallScore || 0));
    
    let calculatedGrade = calculatedScore > 0
      ? (calculatedScore >= 90 ? 'Excellent' : calculatedScore >= 75 ? 'Very Good' : calculatedScore >= 60 ? 'Good' : calculatedScore >= 40 ? 'Average' : 'Needs Improvement')
      : 'Awaiting GD';
    
    // Behavioral Diagnoses
    let behaviorType: 'too_silent' | 'too_dominant' | 'good_speaker' = 'good_speaker';
    let behaviorLabel = 'Good Speaker';
    let behaviorAction = 'Ready for Advanced Placement Challenges';

    if (calculatedScore > 0 && calculatedScore < 60 && turns <= 1) {
      behaviorType = 'too_silent';
      behaviorLabel = 'Too Silent';
      behaviorAction = 'Needs Participation Encouragement';
    } else if (speakingSecs > 250 || turns >= 6) {
      behaviorType = 'too_dominant';
      behaviorLabel = 'Too Dominant';
      behaviorAction = 'Needs Listening & Teamwork Coaching';
    } else if (speakingSecs < 60 || turns <= 1) {
      behaviorType = 'too_silent';
      behaviorLabel = 'Too Silent';
      behaviorAction = 'Needs Participation Encouragement';
    }

    // Teacher Intervention Flags (🔴 Immediate Practice, 🟡 Needs Improvement, 🟢 Good Progress)
    let flag: 'red' | 'yellow' | 'green' = 'green';
    let flagLabel = 'Good Progress';
    if (calculatedScore > 0 && calculatedScore < 55) {
      flag = 'red';
      flagLabel = 'Immediate Practice';
    } else if (calculatedScore >= 55 && calculatedScore < 72) {
      flag = 'yellow';
      flagLabel = 'Needs Improvement';
    }

    // Rubric attributes for matrix with fallback parsing from rubricJson or calculatedScore
    let rubric = persisted?.skills;
    if (!rubric && persisted?.rubricJson) {
      try {
        rubric = typeof persisted.rubricJson === 'string' ? JSON.parse(persisted.rubricJson) : persisted.rubricJson;
      } catch {}
    }

    const relevancePercent = typeof rubric?.contentQuality?.score === 'number'
      ? Math.round((rubric.contentQuality.score / 15) * 100)
      : (calculatedScore > 0 ? Math.round((calculatedScore / 100) * 85) : (turns > 0 ? 75 : 0));
    const fluencyScore = typeof rubric?.fluency?.score === 'number'
      ? rubric.fluency.score
      : (calculatedScore > 0 ? Math.round((calculatedScore / 100) * 20) : (turns > 0 ? Math.min(20, Math.max(10, Math.round(12 + turns * 1.5))) : 0));
    const confidenceScore = typeof rubric?.confidence?.score === 'number'
      ? rubric.confidence.score
      : (calculatedScore > 0 ? Math.round((calculatedScore / 100) * 15) : (turns > 0 ? Math.min(15, Math.max(8, Math.round(10 + turns))) : 0));
    const interruptions = s.interruptionCount || 0;
    const responses = s.questionsAnswered || 0;

    return {
      ...s,
      calculatedScore,
      calculatedGrade,
      speakingMins: (speakingSecs / 60).toFixed(1),
      behaviorType,
      behaviorLabel,
      behaviorAction,
      flag,
      flagLabel,
      relevancePercent,
      fluencyScore,
      confidenceScore,
      interruptions,
      responses,
    };
  });

  const scoredStudents = studentStats.filter((st) => Number(st.calculatedScore) > 0);
  const averageScore = scoredStudents.length > 0
    ? Math.round(scoredStudents.reduce((sum, st) => sum + Number(st.calculatedScore || 0), 0) / scoredStudents.length)
    : (persistedReports.length > 0
      ? Math.round(persistedReports.reduce((sum, report) => sum + Number(report.overallScore || 0), 0) / persistedReports.length)
      : 0);
  const participantBase = participatedStudents.length;
  const participationRate = participantBase > 0 ? Math.round((scoredStudents.length / participantBase) * 100) : 0;
  const classGrade = averageScore >= 90 ? 'Excellent' : averageScore >= 75 ? 'Very Good' : averageScore >= 60 ? 'Good' : averageScore >= 40 ? 'Average' : 'Needs Improvement';

  const totalStudents = participatedStudents.length;
  const completedCount = scoredStudents.length;
  const pendingCount = Math.max(0, totalStudents - completedCount);
  const classCompletionPercent = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;
  const avgSpeakingSecs = totalStudents > 0 ? Math.round(participatedStudents.reduce((acc, s) => acc + (s.speakingDurationSeconds || 0), 0) / totalStudents) : 0;
  const avgSpeakingStr = `${(avgSpeakingSecs / 60).toFixed(1)}m`;

  // Data for Speaking Time Chart
  const chartData = participatedStudents.map((s) => ({
    name: s.name.split(' ')[0],
    fullName: s.name,
    seat: `Seat ${s.seatNumber}`,
    seconds: s.speakingDurationSeconds,
    minutes: Number((s.speakingDurationSeconds / 60).toFixed(1)),
    score: studentStats.find((st) => st.id === s.id)?.calculatedScore || 0,
  }));

  // Heat map is derived from real transcript timestamps rather than fixed demo data.
  const heatMapTimeline = Array.from({ length: Math.max(1, Math.ceil((safeSession.durationMinutes || 20) / 4)) }, (_, idx) => {
    const start = idx * 4;
    const end = start + 4;
    const activeSeats = Array.from(new Set(
      safeTranscripts
        .filter((t) => !t.isFacilitator && Number(t.timestampSeconds || 0) >= start * 60 && Number(t.timestampSeconds || 0) < end * 60)
        .map((t) => t.seatNumber)
        .filter((seat): seat is number => typeof seat === 'number')
    ));
    return { minute: start + '-' + end + 'm', activeSeats };
  });

  const handleExportTranscript = () => {
    const textContent = safeTranscripts
      .map((t) => `[${t.timestamp}] ${t.speakerName} (Seat ${t.seatNumber || 'Mod'}): ${t.text}`)
      .join('\n\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERUS-GD-Transcript-${safeSession.id}.txt`;
    a.click();
  };

  const handleSelectSlotForDashboard = (slotId: string) => {
    if (onSelectSlot) {
      onSelectSlot(slotId);
    }
  };

  const redCount = studentStats.filter((s) => s.flag === 'red').length;
  const yellowCount = studentStats.filter((s) => s.flag === 'yellow').length;
  const greenCount = studentStats.filter((s) => s.flag === 'green').length;
  const silentCount = studentStats.filter((s) => s.behaviorType === 'too_silent').length;
  const dominantCount = studentStats.filter((s) => s.behaviorType === 'too_dominant').length;
  const goodCount = studentStats.filter((s) => s.behaviorType === 'good_speaker').length;

  const filteredStudents = studentStats.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.college.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (matrixFilter === 'all') return true;
    if (matrixFilter === 'red') return s.flag === 'red';
    if (matrixFilter === 'yellow') return s.flag === 'yellow';
    if (matrixFilter === 'green') return s.flag === 'green';
    if (matrixFilter === 'too_silent') return s.behaviorType === 'too_silent';
    if (matrixFilter === 'too_dominant') return s.behaviorType === 'too_dominant';
    if (matrixFilter === 'good_speaker') return s.behaviorType === 'good_speaker';
    return true;
  });

  const COLORS = ['#6366f1', '#3b82f6', '#14b8a6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981'];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Faculty Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              Faculty Administration & Assessment Suite
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold">
              Session #{safeSession.id.toUpperCase()}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
            Faculty Evaluation Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Real-time analytics, participant heatmaps, scoring leaderboards, and automated reports.
          </p>
        </div>

        <div className="flex items-center gap-2">

          {safeSession.status === 'completed' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Session Evaluated & Completed</span>
            </div>
          )}

          {(safeSession.status === 'completed' || safeSession.recordingUrl) && (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  let recUrl = safeSession.recordingUrl;
                  if (!recUrl || recUrl.startsWith('blob:')) {
                    try {
                      const res = await fetch(`/api/sessions/${encodeURIComponent(safeSession.id)}/recording`);
                      const d = await res.json();
                      if (d.success && d.recordingUrl) {
                        recUrl = d.recordingUrl;
                      }
                    } catch {}
                  }
                  setActiveVideoSlot({ ...safeSession, recordingUrl: recUrl });
                  setVideoError(false);
                  setShowVideoModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
                title="Watch recorded video of this GD session"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Watch Recording</span>
              </button>
              {safeSession.recordingUrl && !safeSession.recordingUrl.startsWith('blob:') && (
                <a
                  href={safeSession.recordingUrl}
                  download={`GD-${safeSession.id}-Recording.webm`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all shadow-xs"
                  title="Download recording (.webm)"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download Media</span>
                </a>
              )}
            </div>
          )}

          <button
            id="download-transcript-btn"
            onClick={handleExportTranscript}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Transcript</span>
          </button>

          {safeSession.status === 'completed' || isSlotCompletedLocally(safeSession.id) ? (
            <button
              onClick={() => onViewStudentReport(participatedStudents[0]?.id || persistedReports[0]?.studentId || safeSession.students?.find((s) => !s.isEmptySeat)?.id || safeSession.students?.[0]?.id || '')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md shadow-purple-600/20 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>View Assessment Reports</span>
            </button>
          ) : (
            <button
              onClick={onBackToRoom}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <span>Back to Live Room</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State when no slots are assigned to this faculty */}
      {safeAvailableSlots.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mx-auto mb-3 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
            No Discussion Slots Assigned Yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            You have not been allotted as Evaluator to any discussion slots yet. Once your College Administrator assigns you to an upcoming session, your assigned slots and discussion topics will appear here.
          </p>
        </div>
      )}

      {/* Faculty topic / slot navigator: Divided into Scheduled and Completed tabs */}
      {safeAvailableSlots.length > 0 && onSelectSlot && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Assigned GD Topics &amp; Slots
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Switch between Scheduled (upcoming/live) and Completed discussion slots
                </span>
              </div>
            </div>

            {/* Division Tabs: Scheduled vs Completed */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSlotCategoryTab('scheduled')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  slotCategoryTab === 'scheduled'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                <span>Scheduled</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  slotCategoryTab === 'scheduled' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700'
                }`}>
                  {scheduledSlots.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSlotCategoryTab('completed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  slotCategoryTab === 'completed'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                <span>Completed</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  slotCategoryTab === 'completed' ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-slate-200 dark:bg-slate-700'
                }`}>
                  {completedSlots.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSlotCategoryTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  slotCategoryTab === 'all'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>All ({safeAvailableSlots.length})</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {displayedFacultySlots.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {slotCategoryTab === 'scheduled' ? 'No scheduled GD slots pending right now.' : 'No completed GD slots yet.'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {slotCategoryTab === 'scheduled' ? 'Click "Completed" to view past evaluated sessions and reports.' : 'Click "Scheduled" to view upcoming discussion slots.'}
                </p>
              </div>
            ) : (
              Array.from(
                displayedFacultySlots.reduce((groups, sl) => {
                  const topic = sl.topic || sl.slotName || 'Group Discussion';
                  const existing = groups.get(topic) || [];
                  existing.push(sl);
                  groups.set(topic, existing);
                  return groups;
                }, new Map<string, GDSession[]>())
              ).map(([topic, slots]) => (
                <div
                  key={topic}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {topic}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {slots.length} {slotCategoryTab === 'scheduled' ? 'Scheduled' : slotCategoryTab === 'completed' ? 'Completed' : 'Total'} {slots.length === 1 ? 'Slot' : 'Slots'}
                    </span>
                  </div>

                  <div className="p-3 space-y-2">
                    {slots.map((sl) => {
                      const isSelected = sl.id === safeSession.id;
                      const isCompleted = sl.status === 'completed' || isSlotCompletedLocally(sl.id);

                      return (
                        <div
                          key={sl.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/30'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <button
                            onClick={() => handleSelectSlotForDashboard(sl.id)}
                            className="flex-1 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {sl.slotName || sl.id}
                              </span>
                              {(sl.activityType === 'presentation' || sl.roomLayout === 'classroom') ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  🎓 Presentation
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  👥 GD
                                </span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                                isCompleted
                                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                  : sl.status === 'active'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}>
                                {isCompleted ? 'Completed' : sl.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                                <Calendar className="w-3 h-3" />
                                <span>{formatSlotDate(sl.slotDate)}</span>
                              </span>
                              {sl.slotTiming && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{sl.slotTiming}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </button>

                          <div className="flex items-center gap-2 shrink-0">
                            {(isCompleted || sl.recordingUrl) && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  let targetSlot = sl;
                                  if (!targetSlot.recordingUrl) {
                                    try {
                                      const res = await fetch(`/api/sessions/${encodeURIComponent(sl.id)}/recording`);
                                      const d = await res.json();
                                      if (d.success && d.recordingUrl) {
                                        targetSlot = { ...sl, recordingUrl: d.recordingUrl };
                                      }
                                    } catch {}
                                  }
                                  setActiveVideoSlot(targetSlot);
                                  setShowVideoModal(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                title="Watch full recorded video and audio of this GD session"
                              >
                                <Video className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Recording</span>
                              </button>
                            )}

                            {isCompleted && (
                              <button
                                onClick={() => {
                                  if (onSelectSlot) onSelectSlot(sl.id);
                                  const firstStudentId = sl.students?.find((s) => !s.isEmptySeat && s.college !== 'Available Desk')?.id || sl.students?.[0]?.id || '';
                                  if (onViewStudentReport) {
                                    onViewStudentReport(firstStudentId);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                title="View candidate assessment reports for this completed slot"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Assessment Reports</span>
                              </button>
                            )}

                            {!isCompleted && sl.status === 'active' && (
                              <button
                                onClick={() => {
                                  if (onSelectSlot) onSelectSlot(sl.id);
                                  if (onEnterGDRoom) {
                                    onEnterGDRoom(sl.id);
                                  } else if (onBackToRoom) {
                                    onBackToRoom();
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                                title={(sl.activityType === 'presentation' || sl.roomLayout === 'classroom') ? "Enter live presentation room" : "Enter live discussion room"}
                              >
                                <Radio className="w-3.5 h-3.5" />
                                <span>{(sl.activityType === 'presentation' || sl.roomLayout === 'classroom') ? "Enter Presentation" : "Enter Room"}</span>
                              </button>
                            )}

                            {!isCompleted && sl.status !== 'active' && (
                              <div className="flex items-center gap-1.5">
                                {onEnterGDRoom && (
                                  <button
                                    onClick={() => {
                                      if (onSelectSlot) onSelectSlot(sl.id);
                                      onEnterGDRoom(sl.id);
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
                                    title="Enter room to prepare and view seated candidates before commencing"
                                  >
                                    <span>Enter Room</span>
                                  </button>
                                )}
                                {onStartSession && (
                                  <button
                                    onClick={() => {
                                      onStartSession(sl.id);
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                                    title={(sl.activityType === 'presentation' || sl.roomLayout === 'classroom') ? "Start this presentation slot" : "Start this assigned GD slot and commence discussion"}
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>{(sl.activityType === 'presentation' || sl.roomLayout === 'classroom') ? "Start Presentation" : "Start"}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {safeAvailableSlots.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-2xl shadow-xs text-center">
          <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Discussion Slots Scheduled Yet</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Discussion slots will appear here once scheduled by your College Administrator.
          </p>
        </div>
      )}

      {/* Action-Oriented "Today's Class GD Overview" (Specification Pages 6-7) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/60 rounded-3xl p-5 sm:p-6 text-white shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-900/50 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-bold">
                Today's Class GD Session • Live Roster
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Evaluation Window
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-extrabold text-white tracking-tight">
              {safeSession.topic || 'No Active Topic Scheduled'}
            </h3>
            <p className="text-xs text-indigo-200/80 mt-1 flex items-center gap-2 flex-wrap">
              <span>Faculty Evaluator: <strong>{safeSession.assignedFacultyName || 'Unassigned Faculty'}</strong></span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-400" />
                <span>{formatSlotDate(safeSession.slotDate)} ({safeSession.slotTiming || '--'})</span>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/15 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Class Completion</span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-xl font-mono font-bold text-emerald-400">{completedCount}</span>
                <span className="text-xs text-slate-300 font-mono">/ {totalStudents}</span>
              </div>
              <span className="text-[9px] text-emerald-300 font-semibold block">{classCompletionPercent}% Complete</span>
            </div>

            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/15 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Pending Students</span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-xl font-mono font-bold text-amber-400">{pendingCount}</span>
                <span className="text-xs text-slate-300 font-mono">Slots</span>
              </div>
              <span className="text-[9px] text-amber-300 font-semibold block">{pendingCount > 0 ? 'Follow-up needed' : 'All clear'}</span>
            </div>
          </div>
        </div>

        {/* 6 Key Operational Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-slate-300 block">Total Students</span>
            <span className="text-xl font-bold font-mono text-white mt-0.5 block">{totalStudents}</span>
            <span className="text-[10px] text-slate-400 font-mono">Enrolled Roster</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-emerald-300 block">Completed GD</span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-0.5 block">{completedCount}</span>
            <span className="text-[10px] text-emerald-300/80 font-mono">Evaluated & Scored</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-amber-300 block">Pending / Absent</span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-0.5 block">{pendingCount}</span>
            <span className="text-[10px] text-amber-300/80 font-mono">Not Yet Appeared</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-indigo-300 block">Avg Speaking Time</span>
            <span className="text-xl font-bold font-mono text-indigo-300 mt-0.5 block">{avgSpeakingStr}</span>
            <span className="text-[10px] text-indigo-200/70 font-mono">Target: 2.0 - 2.5m</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-cyan-300 block">Class Avg Score</span>
            <span className="text-xl font-bold font-mono text-cyan-300 mt-0.5 block">{averageScore > 0 ? `${averageScore}/100` : '--'}</span>
            <span className="text-[10px] text-cyan-200/80 font-semibold">{averageScore > 0 ? classGrade : 'Awaiting'}</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[11px] text-rose-300 block">Intervention Flags</span>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs font-mono font-bold">
              <span className="text-rose-400" title="Immediate practice">🔴 {redCount}</span>
              <span className="text-amber-400" title="Needs improvement">🟡 {yellowCount}</span>
              <span className="text-emerald-400" title="Good progress">🟢 {greenCount}</span>
            </div>
            <span className="text-[10px] text-slate-400">Triaged by AI</span>
          </div>
        </div>
      </div>

      {/* Analytics Visualizations: Speaking Time Graph + Participation Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Speaking Time Graph (Bar Chart) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-3 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Speaking Time Distribution (Minutes Spoken)
            </h3>
            <span className="text-xs text-slate-500 font-mono">Real-Time</span>
          </div>

          {chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
              <BarChart3 className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" />
              <span>Awaiting participant speech data in this session.</span>
            </div>
          ) : (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={200} debounce={50}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl shadow-xl text-xs">
                            <p className="font-bold text-slate-900 dark:text-white">{data.fullName} ({data.seat})</p>
                            <p className="text-indigo-600 dark:text-indigo-400">Speaking: {data.minutes} mins ({data.seconds}s)</p>
                            <p className="text-slate-600 dark:text-slate-300">Score: {data.score}/100</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Participation Heat Map (Who Spoke When) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-3 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Participation Heat Map
            </h3>
            <span className="text-xs text-slate-500 font-mono">5-min intervals</span>
          </div>

          {participatedStudents.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Clock className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" />
              <span>Awaiting participant speech timestamps in this session.</span>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1 text-xs">
              {heatMapTimeline.map((block, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-400 w-14">{block.minute}</span>
                  <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                  {participatedStudents.map((st) => {
                    const isActiveInBlock = block.activeSeats.includes(st.seatNumber);
                    return (
                      <span
                        key={st.id}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                          isActiveInBlock
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-600'
                        }`}
                        title={`Seat ${st.seatNumber}: ${st.name}`}
                      >
                        S{st.seatNumber}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          )}

          {/* Heat map legend */}
          <div className="flex items-center justify-end gap-3 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-indigo-600" />
              <span>Active Speaker</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800" />
              <span>Listening</span>
            </div>
          </div>
        </div>

      </div>

      {/* AI-Generated Session Summary & Key Debates */}
      <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 rounded-3xl p-5 shadow-xs dark:shadow-xl space-y-2 transition-colors">
        <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>AI-Generated Executive Discussion Summary</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-300 leading-relaxed">
          {aiSummary}
        </p>
      </div>

      {/* Faculty Live In-Session Observations & Bookmarks (Enhancement 4) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Faculty Live In-Session Observations & Bookmarks</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Timestamped qualitative notes and behavioral evaluations recorded during the live discussion.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 self-start sm:self-center">
            {safeFacultyLiveNotes.length} Recorded Notes
          </span>
        </div>

        {safeFacultyLiveNotes.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Bookmark className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No faculty live observation notes recorded for this slot
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Faculty observers can record real-time qualitative notes with timestamps and category tags directly from the discussion room by clicking the "Observation Notes" button or individual student seat bookmarks.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeFacultyLiveNotes.map((note) => {
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
                  className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {note.studentName}
                      </span>
                      {note.seatNumber && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          Seat {note.seatNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        ⏱ {note.timestamp}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tagConfig.badge}`}>
                        {tagConfig.label}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    "{note.note}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                    <span>Evaluator: {note.facultyName}</span>
                    <button
                      type="button"
                      onClick={() => onViewStudentReport(note.studentId)}
                      className="text-violet-600 dark:text-violet-400 font-semibold hover:underline cursor-pointer"
                    >
                      View Student Report →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Section: Live Student Participation Matrix & Behavioral Diagnoses (Specification Pages 6-8) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm dark:shadow-xl space-y-5 transition-colors">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                Action-Oriented Session Telemetry
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Student Participation Matrix & Behavioral Diagnoses</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live contributions, interruptions, relevance scoring, behavioral diagnoses, and AI teacher intervention flags.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search participant name..."
                className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full"
              />
            </div>
          </div>
        </div>

        {/* Behavioral & Intervention Triage Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Filter Matrix:
          </span>

          <button
            onClick={() => setMatrixFilter('all')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              matrixFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All Students ({studentStats.length})
          </button>

          <button
            onClick={() => setMatrixFilter('red')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
              matrixFilter === 'red'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
            }`}
          >
            <span>🔴 Immediate Practice</span>
            <span className="font-mono font-bold">({redCount})</span>
          </button>

          <button
            onClick={() => setMatrixFilter('yellow')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
              matrixFilter === 'yellow'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            <span>🟡 Needs Improvement</span>
            <span className="font-mono font-bold">({yellowCount})</span>
          </button>

          <button
            onClick={() => setMatrixFilter('green')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
              matrixFilter === 'green'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span>🟢 Good Progress</span>
            <span className="font-mono font-bold">({greenCount})</span>
          </button>

          <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

          <button
            onClick={() => setMatrixFilter('too_silent')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              matrixFilter === 'too_silent'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
            }`}
          >
            Too Silent ({silentCount})
          </button>

          <button
            onClick={() => setMatrixFilter('too_dominant')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              matrixFilter === 'too_dominant'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'
            }`}
          >
            Too Dominant ({dominantCount})
          </button>

          <button
            onClick={() => setMatrixFilter('good_speaker')}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              matrixFilter === 'good_speaker'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100'
            }`}
          >
            Good Speaker ({goodCount})
          </button>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
              <tr>
                <th className="py-3 px-3">Rank</th>
                <th className="py-3 px-3">Student Name</th>
                <th className="py-3 px-3">Seat</th>
                <th className="py-3 px-3">Speaking Time</th>
                <th className="py-3 px-3">Turns</th>
                <th className="py-3 px-3">Interruptions</th>
                <th className="py-3 px-3">Responses</th>
                <th className="py-3 px-3">Relevance</th>
                <th className="py-3 px-3">Fluency (20)</th>
                <th className="py-3 px-3">Confidence (15)</th>
                <th className="py-3 px-3">Score (100)</th>
                <th className="py-3 px-3">Behavior Diagnosis</th>
                <th className="py-3 px-3">Teacher Flag</th>
                <th className="py-3 px-3 text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <Award className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs font-semibold">No participants registered or evaluated for this slot yet.</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Students will appear once they enroll and participate in this GD session.</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, index) => (
                <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                  <td className="py-3 px-3 font-bold">
                    {index === 0 ? (
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-[10px]">1</span>
                    ) : index === 1 ? (
                      <span className="w-5 h-5 rounded-full bg-slate-300 text-slate-950 flex items-center justify-center font-bold text-[10px]">2</span>
                    ) : index === 2 ? (
                      <span className="w-5 h-5 rounded-full bg-amber-700 text-white flex items-center justify-center font-bold text-[10px]">3</span>
                    ) : (
                      <span className="text-slate-500 font-mono">{index + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <img 
                        src={st.avatar} 
                        alt={st.name} 
                        className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700" 
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <span>{st.name}</span>
                        <span className="block text-[10px] text-slate-400 font-normal">{st.college}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    S{st.seatNumber}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {st.speakingMins}m ({st.speakingDurationSeconds}s)
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 font-bold">
                    {st.speakingTurns}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                    {st.interruptions}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                    {st.responses}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{st.relevancePercent}%</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {st.fluencyScore}/20
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {st.confidenceScore}/15
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {st.calculatedScore}
                  </td>
                  <td className="py-3 px-3">
                    <span 
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border inline-block ${
                        st.behaviorType === 'too_silent'
                          ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          : st.behaviorType === 'too_dominant'
                          ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                          : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                      title={st.behaviorAction}
                    >
                      {st.behaviorLabel}
                    </span>
                    <span className="block text-[9px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                      {st.behaviorAction}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border inline-flex items-center gap-1 ${
                      st.flag === 'red'
                        ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        : st.flag === 'yellow'
                        ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    }`}>
                      <span>{st.flag === 'red' ? '🔴' : st.flag === 'yellow' ? '🟡' : '🟢'}</span>
                      <span>{st.flagLabel}</span>
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => onViewStudentReport(st.id)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-100 dark:hover:bg-indigo-600/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span>Report</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

      </div>

      {/* Section: Downloadable Faculty Management Reports (Specification Page 8) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm dark:shadow-xl space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
                Tier-3 Faculty Exports
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Downloadable Faculty Management & Classroom Reports</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate authoritative CSV reports for academic reviews, remedial coaching, and student performance records.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 self-start sm:self-center">
            4 Instant Exports
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Report 1 */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
            <div>
              <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center mb-2">
                <FileText className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Class Performance Summary</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Overall class averages, participation rates, grade distributions, and discussion duration.
              </p>
            </div>
            <button
              onClick={() => downloadFacultyReport('class_performance_summary', safeSession.id)}
              className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Report 2 */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
            <div>
              <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center mb-2">
                <Award className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Student Assessment & Feedback</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Individual scores, competencies, personalized AI recommendations, and faculty remarks.
              </p>
            </div>
            <button
              onClick={() => downloadFacultyReport('student_assessment_feedback', safeSession.id)}
              className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Report 3 */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
            <div>
              <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center mb-2">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Teacher Intervention Flags</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Color-coded triage (🔴 Immediate, 🟡 Needs Improvement, 🟢 Good Progress) for remedial practice.
              </p>
            </div>
            <button
              onClick={() => downloadFacultyReport('teacher_intervention_flags', safeSession.id)}
              className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Report 4 */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
            <div>
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-2">
                <Activity className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Student Activity & Engagement</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Speaking durations, turn counts, interruptions, and question-response engagement telemetry.
              </p>
            </div>
            <button
              onClick={() => downloadFacultyReport('student_activity_engagement', safeSession.id)}
              className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* GD Video Recording Playback Modal */}
      {showVideoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => {
            setShowVideoModal(false);
            setActiveVideoSlot(null);
          }}
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
                    Topic: {activeVideoSlot?.topic || activeVideoSlot?.slotName || safeSession?.topic || 'Group Discussion'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowVideoModal(false);
                  setActiveVideoSlot(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const targetId = activeVideoSlot?.id || safeSession?.id || '';
              const cachedUrl = null;
              const getCleanStr = (v: any): string => {
                if (typeof v === 'string') return v.trim();
                if (v && typeof v.recordingUrl === 'string') return v.recordingUrl.trim();
                if (v && typeof v.url === 'string') return v.url.trim();
                return '';
              };
              const activeVideoUrl = getCleanStr(activeVideoSlot?.recordingUrl) ||
                getCleanStr(safeSession?.recordingUrl) ||
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
                      download={`GD-Video-${activeVideoSlot?.id || safeSession?.id || 'session'}.webm`}
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
                      ? 'The recorded video stream for this session could not be loaded or is in an unsupported format. You can download the raw recording file directly.'
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
                        download={`GD-Video-${activeVideoSlot?.id || safeSession?.id || 'session'}.webm`}
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
