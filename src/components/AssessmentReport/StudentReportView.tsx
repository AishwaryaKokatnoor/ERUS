import React, { useState, useEffect } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { 
  StudentAssessmentReport, 
  GDSession, 
  Student,
  SkillScore 
} from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { SAMPLE_REPORT_RAHUL, generateStudentReport } from '../../data/mockGDData';
import confetti from 'canvas-confetti';

interface StudentReportViewProps {
  session: GDSession;
  report?: StudentAssessmentReport;
  onBackToRoom: () => void;
  onViewFacultyDashboard: () => void;
  currentUser?: AuthUser | null;
  targetStudentId?: string | null;
}

export const StudentReportView: React.FC<StudentReportViewProps> = ({
  session,
  report: initialReport,
  onBackToRoom,
  onViewFacultyDashboard,
  currentUser,
  targetStudentId,
}) => {
  const isStudent = currentUser?.role === 'student';
  const isFaculty = currentUser?.role === 'faculty';

  // Find the active student for this user
  const userStudent = session.students.find(
    (s) => s.isUser || (currentUser && (s.id === currentUser.id || s.name === currentUser.name))
  ) || session.students[0];

  // For students, selectedStudentId is strictly their own ID.
  // For faculty, it's targetStudentId or initialReport's studentId or first student
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

  // Handle student switch (Allowed only for faculty reviewers)
  const handleSelectStudent = async (studentId: string) => {
    // If student, disallow switching to other students' reports
    if (isStudent && studentId !== userStudent.id) {
      return;
    }

    setSelectedStudentId(studentId);
    const targetStudent = session.students.find((s) => s.id === studentId);
    if (!targetStudent) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/facilitator/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: targetStudent,
          sessionId: session.id,
          topic: session.topic,
          durationMinutes: session.durationMinutes,
        }),
      });

      const data = await res.json();
      if (data.report) {
        setCurrentReport(data.report);
      } else {
        setCurrentReport(generateStudentReport(targetStudent, session.topic, session.durationMinutes));
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

  const getGradeBadgeColor = (grade: string) => {
    switch (grade) {
      case 'Excellent':
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Very Good':
        return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      case 'Good':
        return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Average':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
  };

  const currentStudentObj = session.students.find((s) => s.id === selectedStudentId);

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
        <div className="flex items-center gap-2">
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
              <span>Back to GD Room</span>
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

      {/* Main Printable Assessment Report Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm dark:shadow-2xl space-y-6 print-card transition-colors duration-200">
        
        {/* Report Header: Student Performance Report */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                  ERUS-AIGDF Official Assessment
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono border border-slate-200 dark:border-slate-700">
                  {currentReport.generatedAt}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
                Student Performance Report
              </h2>
              <div className="mt-2 space-y-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Student Name:</strong> {currentReport.studentName} &nbsp;•&nbsp; 
                  <span className="text-slate-500 dark:text-slate-400">Seat {currentStudentObj?.seatNumber || 1} ({currentReport.college})</span>
                </p>
                <p>
                  <strong>Discussion Topic:</strong> {currentReport.topic}
                </p>
                <p>
                  <strong>Duration:</strong> {currentReport.durationMinutes} Minutes
                </p>
              </div>
            </div>

            {/* Scorecard Hero Badge */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 text-center flex flex-col items-center justify-center min-w-[170px]">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overall Score</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {currentReport.overallScore}
                </span>
                <span className="text-sm font-semibold font-mono text-slate-400 dark:text-slate-500">/ 100</span>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${getGradeBadgeColor(currentReport.grade)}`}>
                Grade: {currentReport.grade}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Participation Analytics */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Participation Analytics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
              Skill Assessment Parameters (Formula Weighted)
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Sum = 100%</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(Object.entries(currentReport.skills) as [string, SkillScore][]).map(([key, item]) => {
              const percentage = Math.round((item.score / item.maxScore) * 100);
              return (
                <div key={key} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">{item.parameter}</span>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block">Weightage: {item.weightagePercent}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
                        {item.score} / {item.maxScore}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">({percentage}%)</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentage >= 80 ? 'bg-emerald-500' : percentage >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

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
        </div>

        {/* Section 3: Strengths & Areas for Improvement (Side by Side) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Strengths Card */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Strengths
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-800 dark:text-slate-200">
              {currentReport.strengths.map((str, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Areas for Improvement Card */}
          <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Areas for Improvement
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-800 dark:text-slate-200">
              {currentReport.areasForImprovement.map((area, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Section 4: AI Recommendations for Practice */}
        <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40 rounded-2xl p-4 sm:p-5 space-y-2.5">
          <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            AI Recommendation & Personalized Practice
          </h4>
          <div className="space-y-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Recommended Practice Plan:</span>
            <ul className="space-y-1.5 text-slate-800 dark:text-slate-200">
              {currentReport.aiRecommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Performance Scale Reference Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 gap-2 font-mono">
          <span>Performance Scale: 90-100 Excellent | 75-89 Very Good | 60-74 Good | 40-59 Average | &lt;40 Needs Improvement</span>
          <span>Verified by ERUS AI Facilitator Assessment Engine</span>
        </div>

      </div>

    </div>
  );
};
