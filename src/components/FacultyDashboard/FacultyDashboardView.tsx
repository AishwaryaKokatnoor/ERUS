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
  Tag
} from 'lucide-react';
import { GDSession, Student, TranscriptEntry } from '../../types/gd';
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
  availableSlots?: GDSession[];
  onSelectSlot?: (slotId: string) => void;
  facultyId?: string;
}

export const FacultyDashboardView: React.FC<FacultyDashboardViewProps> = ({
  session,
  transcripts,
  onViewStudentReport,
  onBackToRoom,
  onStartSession,
  availableSlots,
  onSelectSlot,
  facultyId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [persistedReports, setPersistedReports] = useState<any[]>([]);


  const aiSummary = persistedReports.length > 0
    ? 'Reports are based on the persisted participant evaluations generated from the final session transcript.'
    : 'No persisted participant evaluations are available for this session yet.';

  // Compute student rankings and scores. Normalize every incoming array so a
  // faculty account with no assigned slots/participants can never crash the UI.
  const safeSession = session || ({ ...INITIAL_SESSION, students: [] } as any);
  const safeStudents = Array.isArray(safeSession?.students) ? safeSession.students : [];
  const safeTranscripts = Array.isArray(transcripts) ? transcripts : [];
  const safeFacultyLiveNotes = Array.isArray(safeSession?.facultyLiveNotes) ? safeSession.facultyLiveNotes : [];
  const safeAvailableSlots = Array.isArray(availableSlots) ? availableSlots : [];

  useEffect(() => {
    if (!facultyId || !safeSession?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/faculty/sessions/' + encodeURIComponent(safeSession.id) + '/reports?facultyId=' + encodeURIComponent(facultyId));
        const data = await res.json();
        if (!cancelled) setPersistedReports(Array.isArray(data.reports) ? data.reports : []);
      } catch (e) {
        if (!cancelled) setPersistedReports([]);
        console.warn('[Faculty Reports] Could not load persisted reports:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [facultyId, session?.id, session?.status]);

  const reportByStudent = useMemo(() => {
    const map = new Map<string, any>();
    persistedReports.forEach((r) => map.set(r.studentId, r));
    return map;
  }, [persistedReports]);

  const studentStats = safeStudents.map((s) => {
    const persisted = reportByStudent.get(s.id) || persistedReports.find((r) => r.studentName && String(r.studentName).toLowerCase() === String(s.name).toLowerCase());
    let calculatedScore = typeof persisted?.overallScore === 'number' ? persisted.overallScore : 0;
    let calculatedGrade = persisted?.overallScore >= 90 ? 'Excellent' : persisted?.overallScore >= 75 ? 'Very Good' : persisted?.overallScore >= 60 ? 'Good' : persisted?.overallScore >= 40 ? 'Average' : 'Needs Improvement';
    return {
      ...s,
      calculatedScore,
      calculatedGrade,
      speakingMins: (s.speakingDurationSeconds / 60).toFixed(1),
    };
  });

  const averageScore = persistedReports.length > 0
    ? Math.round(persistedReports.reduce((sum, report) => sum + Number(report.overallScore || 0), 0) / persistedReports.length)
    : 0;
  const participantBase = Math.max(Number(safeSession.enrolledCount || 0), safeStudents.length);
  const participationRate = participantBase > 0 ? Math.round((persistedReports.length / participantBase) * 100) : 0;
  const classGrade = averageScore >= 90 ? 'Excellent' : averageScore >= 75 ? 'Very Good' : averageScore >= 60 ? 'Good' : averageScore >= 40 ? 'Average' : 'Needs Improvement';

  // Data for Speaking Time Chart
  const chartData = safeStudents.map((s) => ({
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

  const filteredStudents = studentStats.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.college.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          {safeSession.status === 'waiting' && onStartSession && (
            <button
              onClick={() => {
                onStartSession(safeSession.id);
                onBackToRoom();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 cursor-pointer animate-pulse"
              title="Start group discussion and open floor to participants"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start GD Session</span>
            </button>
          )}

          {safeSession.status === 'completed' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Session Evaluated & Completed</span>
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

          <button
            onClick={onBackToRoom}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <span>{session.status === 'completed' ? 'Go to Active GD Room' : 'Back to Live Room'}</span>
          </button>
        </div>
      </div>

      {/* Faculty topic / slot navigator: show each assigned topic first,
          then the slots belonging to that topic underneath it. */}
      {safeAvailableSlots.length > 0 && onSelectSlot && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Assigned GD Topics & Slots
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Topics assigned to you with their available session slots
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {Array.from(
              safeAvailableSlots.reduce((groups, sl) => {
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
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {topic}
                  </span>
                </div>

                <div className="p-3 space-y-2">
                  {slots.map((sl) => {
                    const isSelected = sl.id === safeSession.id;
                    const isCompleted = sl.status === 'completed';

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
                          onClick={() => onSelectSlot(sl.id)}
                          className="flex-1 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {sl.slotName || sl.id}
                            </span>
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
                          {sl.slotTiming && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                              {sl.slotTiming}
                            </span>
                          )}
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => onSelectSlot(sl.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            View
                          </button>

                          {onStartSession && !isCompleted && sl.status !== 'active' && (
                            <button
                              onClick={() => {
                                onSelectSlot(sl.id);
                                onStartSession(sl.id);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                              title="Start this assigned GD slot"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Start</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session Summary Cards (Page 11 Display Spec) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Discussion Topic</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1" title={safeSession.topic}>
            {safeSession.topic}
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1 font-semibold">Intermediate GD</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Enrolled Students</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {safeSession.enrolledCount ?? safeStudents.length}
            </span>
            <span className="text-xs text-slate-500">/ {safeSession.maxCapacity || 15}</span>
          </div>
          <span className={`text-[10px] font-semibold block mt-1 ${
            (safeSession.enrolledCount ?? safeStudents.length) >= (session.maxCapacity || 15)
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {(session.enrolledCount ?? session.students.length) >= (session.maxCapacity || 15)
              ? 'Slot Full (100% Capacity)'
              : `${(session.maxCapacity || 15) - (session.enrolledCount ?? session.students.length)} Seats Open`}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Session Duration</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{safeSession.durationMinutes}</span>
            <span className="text-xs text-slate-500">Minutes</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block mt-1">Target 20:00</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Participation Rate</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{participationRate}%</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400/90 font-semibold block mt-1">Persisted reports / participants</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl col-span-2 sm:col-span-1 shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Average Score</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-300 font-mono">{averageScore}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-1">Class Grade: {classGrade}</span>
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

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
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

          <div className="space-y-2.5 pt-1 text-xs">
            {heatMapTimeline.map((block, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3">
                <span className="font-mono font-bold text-slate-600 dark:text-slate-400 w-14">{block.minute}</span>
                <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                  {safeStudents.map((st) => {
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-4 transition-colors">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Student-Wise Scores & Leaderboard
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{persistedReports.length} persisted participant report{persistedReports.length === 1 ? '' : 's'} loaded from the completed session.</p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search student or college..."
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                <th className="pb-3 px-3">Rank</th>
                <th className="pb-3 px-3">Student Name</th>
                <th className="pb-3 px-3">Seat</th>
                <th className="pb-3 px-3">College & Course</th>
                <th className="pb-3 px-3">Speaking Time</th>
                <th className="pb-3 px-3">Turns</th>
                <th className="pb-3 px-3">Score (100)</th>
                <th className="pb-3 px-3">Grade</th>
                <th className="pb-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredStudents.map((st, index) => (
                <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                  <td className="py-3 px-3 font-bold">
                    {index === 0 ? (
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                        1
                      </span>
                    ) : index === 1 ? (
                      <span className="w-5 h-5 rounded-full bg-slate-300 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                        2
                      </span>
                    ) : index === 2 ? (
                      <span className="w-5 h-5 rounded-full bg-amber-700 text-white flex items-center justify-center font-bold text-[10px]">
                        3
                      </span>
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
                      <span>{st.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    Seat {st.seatNumber}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                    {st.college} • <span className="text-slate-400 dark:text-slate-500">{st.course}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {st.speakingMins} mins
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {st.speakingTurns}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {st.calculatedScore}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      st.calculatedGrade === 'Excellent' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700' :
                      st.calculatedGrade === 'Very Good' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700' :
                      'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                    }`}>
                      {st.calculatedGrade}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => onViewStudentReport(st.id)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-100 dark:hover:bg-indigo-600/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-xs font-semibold inline-flex items-center gap-1 transition-all"
                    >
                      <span>Report</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
