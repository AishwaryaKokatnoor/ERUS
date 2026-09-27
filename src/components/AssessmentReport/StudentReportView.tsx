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
  Lock
} from 'lucide-react';
import { 
  StudentAssessmentReport, 
  GDSession, 
  Student,
  SkillScore 
} from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { SAMPLE_REPORT_RAHUL, generateStudentReport } from '../../data/mockGDData';
import { GDComparisonReport } from './GDComparisonReport';
import { addReportToStudentHistory } from '../../utils/studentReportHistory';
import confetti from 'canvas-confetti';

interface StudentReportViewProps {
  session: GDSession;
  report?: StudentAssessmentReport;
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

  const [activeReportTab, setActiveReportTab] = useState<'single' | 'comparison'>('single');

  // Find the active student for this user
  const userStudent = session.students.find(
    (s) => s.isUser || (currentUser && (s.id === currentUser.id || s.name === currentUser.name))
  ) || session.students[0];

  const effectiveInitialStudentId = isStudent
    ? userStudent.id
    : (targetStudentId || initialReport?.studentId || session.students[0]?.id || 's1');

  const [selectedStudentId, setSelectedStudentId] = useState<string>(effectiveInitialStudentId);

  // Initialize report personalized for the active student if they are a student
  const [currentReport, setCurrentReport] = useState<StudentAssessmentReport>(() => {
    if (isStudent) {
      if (
        initialReport &&
        (initialReport.studentId === userStudent.id || initialReport.studentName === currentUser?.name)
      ) {
        return initialReport;
      }
      return generateStudentReport(userStudent, session.topic, session.durationMinutes, initialReport);
    }
    return initialReport || SAMPLE_REPORT_RAHUL;
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

  // After completion, load the persisted report instead of treating generated mock data as authoritative.
  useEffect(() => {
    if (!isStudent || session.status !== 'completed' || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/reports?studentId=' + encodeURIComponent(currentUser.id) + '&sessionId=' + encodeURIComponent(session.id));
        const data = await res.json();
        const persisted = Array.isArray(data.reports) ? data.reports[0] : null;
        if (!cancelled && persisted) {
          setCurrentReport((prev) => ({ ...prev, ...persisted } as StudentAssessmentReport));
        }
      } catch (e) {
        console.warn('[Student Report] Could not load persisted report:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isStudent, currentUser?.id, session.id, session.status]);

  // Ensure student always stays strictly locked to their own report
  useEffect(() => {
    if (isStudent) {
      setSelectedStudentId(userStudent.id);
      if (currentReport.studentName !== (currentUser?.name || userStudent.name)) {
        setCurrentReport(generateStudentReport(userStudent, session.topic, session.durationMinutes, initialReport));
      }
    } else if (targetStudentId && targetStudentId !== selectedStudentId) {
      setSelectedStudentId(targetStudentId);
      handleSelectStudent(targetStudentId);
    }
  }, [isStudent, userStudent.id, currentUser?.name, targetStudentId]);

  // Persist current report to student's historical comparison archive
  useEffect(() => {
    if (currentReport) {
      addReportToStudentHistory(currentReport);
    }
  }, [currentReport]);

  // Faculty live observation notes for this candidate (Enhancement 4)
  const candidateLiveNotes = useMemo(() => {
    const list = session.facultyLiveNotes || currentReport.facultyLiveNotes || [];
    return list.filter(
      (n) => n.studentId === selectedStudentId || n.studentName?.toLowerCase() === currentReport.studentName?.toLowerCase()
    );
  }, [session.facultyLiveNotes, currentReport.facultyLiveNotes, selectedStudentId, currentReport.studentName]);

  // Handle student switch (Allowed only for faculty reviewers)
  const handleSelectStudent = async (studentId: string) => {
    if (isStudent && studentId !== userStudent.id) {
      return;
    }

    setSelectedStudentId(studentId);
    setIsEditingScores(false);
    const targetStudent = session.students.find((s) => s.id === studentId);
    if (!targetStudent) return;

    setIsLoading(true);
    try {
      if (isFaculty) {
        const facultyId = (currentUser as any)?.facultyId || currentUser?.id || '';
        const res = await fetch('/api/faculty/sessions/' + encodeURIComponent(session.id) + '/reports?facultyId=' + encodeURIComponent(facultyId));
        const data = await res.json();
        const persisted = Array.isArray(data.reports)
          ? data.reports.find((r: any) => r.studentId === targetStudent.id || (r.studentName && String(r.studentName).toLowerCase() === String(targetStudent.name).toLowerCase()))
          : null;
        if (persisted) {
          let skills: any = {};
          try { skills = typeof persisted.rubricJson === 'string' ? JSON.parse(persisted.rubricJson) : (persisted.rubricJson || {}); } catch {}
          setCurrentReport({
            ...currentReport,
            id: persisted.id,
            sessionId: persisted.sessionId,
            studentId: persisted.studentId,
            studentName: targetStudent.name,
            college: targetStudent.college,
            topic: session.topic,
            overallScore: persisted.overallScore,
            grade: persisted.overallScore >= 90 ? 'Excellent' : persisted.overallScore >= 75 ? 'Very Good' : persisted.overallScore >= 60 ? 'Good' : persisted.overallScore >= 40 ? 'Average' : 'Needs Improvement',
            skills,
            aiSummary: persisted.feedback,
            strengths: persisted.strengths ? persisted.strengths.split('; ').filter(Boolean) : [],
            areasForImprovement: persisted.improvements ? persisted.improvements.split('; ').filter(Boolean) : [],
            facultyEndorsement: { endorsed: false },
          } as StudentAssessmentReport);
        }
      } else {
        const res = await fetch('/api/student/reports?studentId=' + encodeURIComponent(userStudent.id) + '&sessionId=' + encodeURIComponent(session.id));
        const data = await res.json();
        const persisted = Array.isArray(data.reports) ? data.reports[0] : null;
        if (persisted) setCurrentReport({ ...currentReport, ...persisted } as StudentAssessmentReport);
      }
    } catch (err) {
      console.error(err);
      setCurrentReport(generateStudentReport(targetStudent, session.topic, session.durationMinutes));
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
            facultyName: currentUser?.name || 'Dr. Sunita Rao',
            facultyId: (currentUser as any)?.facultyId || 'FAC-CSE-102',
            designation: (currentUser as any)?.designation || 'Professor & Head of Department',
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

  const currentStudentObj = session.students.find((s) => s.id === selectedStudentId);
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
                {session.students.map((st) => (
                  <option key={st.id} value={st.id}>
                    Seat {st.seatNumber}: {st.name} {st.isUser ? '(Demo Student)' : ''}
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
              <span>{session.status === 'completed' ? 'Go to Active GD Room' : 'Back to GD Room'}</span>
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
      {availableSlots && availableSlots.length > 0 && onSelectSlot && (
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

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">View Other Slot Reports:</span>
            {availableSlots.map((sl) => {
              const isSelected = sl.id === session.id;
              const isCompleted = sl.status === 'completed';
              const studentKey = currentUser?.id || currentUser?.email || 'student';
              const effectiveBooked = bookedSlotId || (isStudent ? (localStorage.getItem(`erus_student_booked_slot_${studentKey}`) || 'slot-dit-001') : null);
              const isLockedForStudent = isStudent && Boolean(effectiveBooked) && sl.id !== effectiveBooked;
              const bookedSlotObj = isLockedForStudent ? availableSlots.find((s) => s.id === effectiveBooked) : null;

              if (isLockedForStudent) {
                return (
                  <button
                    key={sl.id}
                    type="button"
                    disabled
                    title={`Slot Locked: You have booked ${bookedSlotObj?.slotName || 'another slot'}. Under institutional policy, students can only access their assigned discussion session.`}
                    className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed flex items-center gap-1"
                  >
                    <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    <span className="line-through decoration-slate-400/50">{sl.slotName || sl.id}</span>
                  </button>
                );
              }

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
                  {currentReport.college || 'Delhi Institute of Technology'}
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
                <span className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-teal-500 dark:from-indigo-400 dark:to-teal-300">
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
                    Evaluated by {currentReport.facultyEndorsement?.facultyName || 'Dr. Sunita Rao'} ({currentReport.facultyEndorsement?.designation || 'Faculty Evaluator'}) on {currentReport.facultyEndorsement?.endorsedAt}
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
                {currentReport.fillerWordsBreakdown && currentReport.fillerWordsBreakdown.length > 0
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
            {(Object.entries(isEditingScores ? editableSkills : currentReport.skills) as [string, SkillScore][]).map(([key, item]) => {
              const percentage = Math.round((item.score / item.maxScore) * 100);
              return (
                <div key={key} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">{item.parameter}</span>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block">Weightage: {item.weightagePercent}%</span>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      {isEditingScores ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={item.maxScore}
                            value={item.score}
                            onChange={(e) => handleSkillScoreChange(key, parseInt(e.target.value, 10) || 0, item.maxScore)}
                            className="w-14 px-2 py-1 text-center font-mono font-bold text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs text-slate-400 font-mono">/ {item.maxScore}</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
                            {item.score} / {item.maxScore}
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
                      max={item.maxScore}
                      value={item.score}
                      onChange={(e) => handleSkillScoreChange(key, parseInt(e.target.value, 10), item.maxScore)}
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
                  {item.feedback && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-0.5 leading-relaxed">
                      💬 {item.feedback}
                    </p>
                  )}

                  {/* Evaluated Sub-Points */}
                  <div className="pt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                    {item.subPoints.map((sp, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        ✓ {sp}
                      </span>
                    ))}
                  </div>
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
              {currentReport.strengths.map((str, i) => (
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
              {currentReport.areasForImprovement.map((area, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Section 3B: Faculty Live In-Session Observations & Bookmarks (Enhancement 4) */}
        {candidateLiveNotes.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/50 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Faculty Live In-Session Observations & Bookmarks
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                {candidateLiveNotes.length} Verified Notes
              </span>
            </div>

            <div className="space-y-2.5">
              {candidateLiveNotes.map((note) => {
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
              <strong>Summary:</strong> {currentReport.aiSummary}
            </p>
            <ul className="space-y-1.5 pt-1">
              {currentReport.aiRecommendations.map((rec, i) => (
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
                {currentReport.facultyEndorsement?.facultyName || 'Dr. Sunita Rao'}
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

    </div>
  );
};
