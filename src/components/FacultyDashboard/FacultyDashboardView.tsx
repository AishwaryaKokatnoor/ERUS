import React, { useState } from 'react';
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
  ChevronRight
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
}

export const FacultyDashboardView: React.FC<FacultyDashboardViewProps> = ({
  session,
  transcripts,
  onViewStudentReport,
  onBackToRoom,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSummary, setAiSummary] = useState<string>(
    'The discussion examined both opportunities and challenges of AI in modern education. Strong consensus emerged that while AI can significantly streamline administrative grading and adaptive personal tutoring, human empathy, creative mentorship, and moral ethics remain strictly irreplaceable. Active turn balancing by the AI moderator maintained high engagement across all 8 participants.'
  );

  // Compute student rankings and scores
  const studentStats = session.students.map((s, idx) => {
    // Exact 7-parameter score approximation
    const english = Math.min(20, Math.max(14, 16 + (s.speakingTurns % 3)));
    const fluency = Math.min(20, Math.max(13, 15 + Math.round(s.speakingDurationSeconds / 80)));
    const clarity = Math.min(15, Math.max(10, 12 + (s.questionsAnswered % 3)));
    const confidence = Math.min(15, Math.max(11, 13 + (s.questionsInitiated % 3)));
    const content = Math.min(15, Math.max(10, 12 + ((s.speakingTurns * 2) % 4)));
    const collaboration = Math.min(10, Math.max(6, 8 - s.interruptionCount));
    const leadership = Math.min(5, Math.max(3, 4 + (s.questionsInitiated > 0 ? 1 : 0)));

    const score = s.isUser ? 82 : english + fluency + clarity + confidence + content + collaboration + leadership;
    let grade = 'Very Good';
    if (score >= 90) grade = 'Excellent';
    else if (score >= 75) grade = 'Very Good';
    else if (score >= 60) grade = 'Good';
    else if (score >= 40) grade = 'Average';
    else grade = 'Needs Improvement';

    return {
      ...s,
      calculatedScore: score,
      calculatedGrade: grade,
      speakingMins: (s.speakingDurationSeconds / 60).toFixed(1),
    };
  }).sort((a, b) => b.calculatedScore - a.calculatedScore);

  const averageScore = Math.round(
    studentStats.reduce((acc, curr) => acc + curr.calculatedScore, 0) / studentStats.length
  );

  // Data for Speaking Time Chart
  const chartData = session.students.map((s) => ({
    name: s.name.split(' ')[0],
    fullName: s.name,
    seat: `Seat ${s.seatNumber}`,
    seconds: s.speakingDurationSeconds,
    minutes: Number((s.speakingDurationSeconds / 60).toFixed(1)),
    score: studentStats.find((st) => st.id === s.id)?.calculatedScore || 75,
  }));

  // Heat map simulation data across minutes
  const heatMapTimeline = [
    { minute: '0-4m', activeSeats: [1, 2, 3] },
    { minute: '4-8m', activeSeats: [4, 1, 5] },
    { minute: '8-12m', activeSeats: [6, 2, 7] },
    { minute: '12-16m', activeSeats: [8, 3, 1] },
    { minute: '16-20m', activeSeats: [2, 4, 5, 8] },
  ];

  const handleExportTranscript = () => {
    const textContent = transcripts
      .map((t) => `[${t.timestamp}] ${t.speakerName} (Seat ${t.seatNumber || 'Mod'}): ${t.text}`)
      .join('\n\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERUS-GD-Transcript-${session.id}.txt`;
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
              Session #{session.id.toUpperCase()}
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20"
          >
            <span>Back to Live Room</span>
          </button>
        </div>
      </div>

      {/* Session Summary Cards (Page 11 Display Spec) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Discussion Topic</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1" title={session.topic}>
            {session.topic}
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block mt-1 font-semibold">Intermediate GD</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Enrolled Students</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{session.students.length}</span>
            <span className="text-xs text-slate-500">Students</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">100% Seated</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Session Duration</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{session.durationMinutes}</span>
            <span className="text-xs text-slate-500">Minutes</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block mt-1">Target 20:00</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Participation Rate</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">96%</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400/90 font-semibold block mt-1">High Engagement</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl col-span-2 sm:col-span-1 shadow-xs transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Average Score</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-300 font-mono">{averageScore}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-1">Class Grade: Very Good</span>
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
                  {session.students.map((st) => {
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

      {/* Student-wise Scores & Leaderboard Table (Page 11 Spec) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-4 transition-colors">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Student-Wise Scores & Leaderboard
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">All 8 participants evaluated via 7-parameter rubric.</p>
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
                      <span>{st.name} {st.isUser && '(You)'}</span>
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
