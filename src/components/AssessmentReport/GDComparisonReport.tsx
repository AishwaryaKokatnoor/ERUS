import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Award, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Printer, 
  FileText, 
  ChevronRight, 
  Calendar, 
  Building2, 
  ShieldCheck, 
  Zap, 
  Activity, 
  BarChart3, 
  GraduationCap, 
  HelpCircle,
  Volume2,
  ThumbsUp,
  Target
} from 'lucide-react';
import { StudentAssessmentReport, SkillScore } from '../../types/gd';
import { 
  getStudentReportHistory, 
  computeComparisonDelta, 
  ReportComparisonDelta 
} from '../../utils/studentReportHistory';

interface GDComparisonReportProps {
  currentReport: StudentAssessmentReport;
  onBackToSingleReport: () => void;
  onBackToRoom: () => void;
  onSelectSlot?: () => void;
}

export const GDComparisonReport: React.FC<GDComparisonReportProps> = ({
  currentReport,
  onBackToSingleReport,
  onBackToRoom,
  onSelectSlot,
}) => {
  // Load full history for this student
  const studentKey = currentReport.studentName || currentReport.studentId || 'student';
  const history = useMemo(() => {
    return getStudentReportHistory(studentKey, currentReport);
  }, [studentKey, currentReport]);

  // Default comparison: latest session vs immediately preceding session
  const [currentId, setCurrentId] = useState<string>(history[0]?.id || currentReport.id);
  const [previousId, setPreviousId] = useState<string>(
    history.length > 1 ? history[1].id : (history[0]?.id || currentReport.id)
  );

  const selectedCurrent = history.find((r) => r.id === currentId) || currentReport;
  const selectedPrevious = history.find((r) => r.id === previousId) || history[1] || currentReport;

  // Compute live comparison delta between the two chosen sessions
  const delta: ReportComparisonDelta = useMemo(() => {
    return computeComparisonDelta(selectedCurrent, selectedPrevious);
  }, [selectedCurrent, selectedPrevious]);

  const handlePrint = () => {
    window.print();
  };

  const isGrowth = delta.overallScoreDelta >= 0;

  // 7 Rubric keys with display labels and icons
  const RUBRIC_PARAMS: {
    key: keyof typeof delta.skillDeltas;
    label: string;
    weight: string;
    maxScore: number;
    description: string;
  }[] = [
    {
      key: 'english',
      label: 'Speaking in English',
      weight: '20%',
      maxScore: 20,
      description: 'Sentence formation, vocabulary variety, grammatical accuracy',
    },
    {
      key: 'fluency',
      label: 'Fluency & Articulation',
      weight: '20%',
      maxScore: 20,
      description: 'Continuous delivery, natural conversational pacing, filler reduction',
    },
    {
      key: 'clarity',
      label: 'Communication Clarity',
      weight: '15%',
      maxScore: 15,
      description: 'Cohesive thesis, understandable explanations, structured reasoning',
    },
    {
      key: 'confidence',
      label: 'Confidence & Assertiveness',
      weight: '15%',
      maxScore: 15,
      description: 'Initiating arguments, vocal volume, answering questions without hesitation',
    },
    {
      key: 'contentQuality',
      label: 'Content Quality & Depth',
      weight: '15%',
      maxScore: 15,
      description: 'Data-grounded examples, industry relevance, logical counter-arguments',
    },
    {
      key: 'collaboration',
      label: 'Active Listening & Collaboration',
      weight: '10%',
      maxScore: 10,
      description: 'Acknowledging peer contributions, team etiquette, zero interruptions',
    },
    {
      key: 'leadership',
      label: 'Leadership & Moderation',
      weight: '5%',
      maxScore: 5,
      description: 'Guiding discussion direction, summarizing key points, consensus building',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6">
      
      {/* Top Action Bar (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToSingleReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>Single Session Report</span>
          </button>
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/80 shadow-xs flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Comparison & Progress Report</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>

          <button
            onClick={onBackToRoom}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <span>Back to GD Room</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Comparison Sheet */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors duration-200">
        
        {/* Printable University Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 p-6 sm:p-8 bg-gradient-to-r from-indigo-50/70 via-white to-teal-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/90">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0 ring-1 ring-white/20">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    {selectedCurrent.college || 'Engineering Institute'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold border border-emerald-300 dark:border-emerald-800">
                    LONGITUDINAL PROGRESS
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white tracking-tight mt-0.5">
                  AI Group Discussion Comparison & Evolution Report
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Candidate: <strong className="text-slate-800 dark:text-slate-200">{selectedCurrent.studentName}</strong> • Candidate ID: <span className="font-mono">{selectedCurrent.studentId}</span> • Total Evaluated Sessions: <strong className="text-indigo-600 dark:text-indigo-400">{history.length}</strong>
                </p>
              </div>
            </div>

            {/* Overall Growth Metric Badge */}
            <div className="flex items-center gap-3 sm:text-right bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
              <div className="text-left sm:text-right">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
                  Performance Delta
                </div>
                <div className={`text-xl font-extrabold flex items-center gap-1 ${
                  isGrowth ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {isGrowth ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  <span>{delta.overallScoreDelta >= 0 ? `+${delta.overallScoreDelta}` : delta.overallScoreDelta} pts</span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    ({delta.overallScorePercent >= 0 ? `+${delta.overallScorePercent}%` : `${delta.overallScorePercent}%`})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Session Comparison Selector Bar */}
        <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Previous Session Selector */}
            <div className="flex-1 w-full p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>PREVIOUS BASELINE SESSION</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Score: {selectedPrevious.overallScore}/100 ({selectedPrevious.grade})
                </span>
              </div>
              <select
                value={previousId}
                onChange={(e) => setPreviousId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {history.map((rep, idx) => (
                  <option key={rep.id} value={rep.id}>
                    {idx === 0 ? 'Latest: ' : idx === 1 ? 'Previous: ' : `Session #${history.length - idx}: `}
                    {rep.topic} ({rep.generatedAt || 'Recent'}) - {rep.overallScore}/100
                  </option>
                ))}
              </select>
            </div>

            {/* Comparison Arrow Icon */}
            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs">
              <ArrowRight className="w-4 h-4" />
            </div>

            {/* Current Session Selector */}
            <div className="flex-1 w-full p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-xs ring-1 ring-indigo-500/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>CURRENT EVALUATED SESSION</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  Score: {selectedCurrent.overallScore}/100 ({selectedCurrent.grade})
                </span>
              </div>
              <select
                value={currentId}
                onChange={(e) => setCurrentId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {history.map((rep, idx) => (
                  <option key={rep.id} value={rep.id}>
                    {idx === 0 ? 'Latest: ' : idx === 1 ? 'Previous: ' : `Session #${history.length - idx}: `}
                    {rep.topic} ({rep.generatedAt || 'Recent'}) - {rep.overallScore}/100
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Executive Growth KPIs (Delta Grid) */}
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span>Executive Performance Metrics Delta</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Comparing Candidate Progress
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            
            {/* 1. Overall Score */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Overall Score</span>
                <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.overallScore}
                  <span className="text-xs font-semibold text-slate-400">/100</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.overallScore}
                </div>
              </div>
              <div className={`mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 self-start ${
                delta.overallScoreDelta >= 0
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
              }`}>
                {delta.overallScoreDelta >= 0 ? '+' : ''}{delta.overallScoreDelta} pts
              </div>
            </div>

            {/* 2. Speaking Time */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Speaking Time</span>
                <div className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.speakingTimeFormatted || `${Math.floor((selectedCurrent.speakingTimeSeconds || 180)/60)}m ${(selectedCurrent.speakingTimeSeconds || 180)%60}s`}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.speakingTimeFormatted || `${Math.floor((selectedPrevious.speakingTimeSeconds || 150)/60)}m`}
                </div>
              </div>
              <div className="mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 inline-flex items-center gap-0.5 self-start">
                {delta.speakingTimeSecondsDelta >= 0 ? `+${Math.floor(delta.speakingTimeSecondsDelta / 60)}m ${delta.speakingTimeSecondsDelta % 60}s` : `${Math.floor(delta.speakingTimeSecondsDelta / 60)}m`}
              </div>
            </div>

            {/* 3. Speaking Turns */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Speaking Turns</span>
                <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.speakingTurns || 4} turns
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.speakingTurns || 3} turns
                </div>
              </div>
              <div className="mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-0.5 self-start">
                {delta.speakingTurnsDelta >= 0 ? `+${delta.speakingTurnsDelta}` : delta.speakingTurnsDelta} turns
              </div>
            </div>

            {/* 4. Speech Rate (WPM) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Speech Rate</span>
                <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.wpm || 135} <span className="text-xs font-semibold text-slate-400">WPM</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.wpm || 115} WPM
                </div>
              </div>
              <div className="mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 inline-flex items-center gap-0.5 self-start">
                {delta.wpmDelta >= 0 ? `+${delta.wpmDelta}` : delta.wpmDelta} WPM
              </div>
            </div>

            {/* 5. Filler Reduction */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Fillers Count</span>
                <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.fillerWordsCount ?? 2} fillers
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.fillerWordsCount ?? 8} fillers
                </div>
              </div>
              <div className={`mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 self-start ${
                delta.fillerWordsDelta <= 0
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
              }`}>
                {delta.fillerWordsDelta <= 0 ? `${delta.fillerWordsDelta} eliminated` : `+${delta.fillerWordsDelta}`}
              </div>
            </div>

            {/* 6. Grade Advancement */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Grade Tier</span>
                <div className="text-base font-black text-slate-900 dark:text-white mt-1">
                  {selectedCurrent.grade}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Prev: {selectedPrevious.grade}
                </div>
              </div>
              <div className="mt-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 inline-flex items-center gap-0.5 self-start">
                <Award className="w-3 h-3" />
                <span>{selectedPrevious.grade === selectedCurrent.grade ? 'Maintained' : 'Advanced'}</span>
              </div>
            </div>

          </div>
        </div>

        {/* 7-Parameter Rubric Comparative Progression */}
        <div className="p-6 sm:p-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>7-Parameter Academic Rubric Progression</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Side-by-side progression analysis across all university evaluation parameters
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-300 dark:bg-slate-600" />
                <span className="text-slate-600 dark:text-slate-400 font-medium">Previous GD</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-blue-600 to-indigo-600" />
                <span className="text-slate-800 dark:text-slate-200 font-bold">Current GD</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {RUBRIC_PARAMS.map((param) => {
              const prevSkill = selectedPrevious.skills[param.key] || { score: 0, maxScore: param.maxScore };
              const currSkill = selectedCurrent.skills[param.key] || { score: 0, maxScore: param.maxScore };
              const scoreDelta = currSkill.score - prevSkill.score;
              const prevPct = Math.round((prevSkill.score / param.maxScore) * 100);
              const currPct = Math.round((currSkill.score / param.maxScore) * 100);

              return (
                <div 
                  key={param.key}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {param.label}
                        </span>
                        <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Weight: {param.weight}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {param.description}
                      </p>
                    </div>

                    {/* Scores & Delta Badge */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 dark:text-slate-500 line-through mr-2">
                          {prevSkill.score}/{param.maxScore}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {currSkill.score}/{param.maxScore}
                        </span>
                      </div>

                      <div className={`px-2 py-0.5 rounded-full text-xs font-black flex items-center gap-0.5 ${
                        scoreDelta > 0
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : scoreDelta < 0
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                      }`}>
                        {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                      </div>
                    </div>
                  </div>

                  {/* Dual Comparison Bars */}
                  <div className="space-y-1.5 mt-3">
                    {/* Previous Bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 w-12 text-right">Prev</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full bg-slate-300 dark:bg-slate-600 rounded-full transition-all duration-500" 
                          style={{ width: `${prevPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 w-8">{prevPct}%</span>
                    </div>

                    {/* Current Bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 w-12 text-right">Curr</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-500" 
                          style={{ width: `${currPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 w-8">{currPct}%</span>
                    </div>
                  </div>

                  {/* Contextual Feedback on Current Skill */}
                  {currSkill.feedback && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                      <span>{currSkill.feedback}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Longitudinal Trajectory & Recommendations */}
        <div className="p-6 sm:p-8 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left: Top Growth Highlights */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <ThumbsUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Highest Growth Parameters
                  </h3>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Skills showing the strongest positive progression
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {delta.improvedSkills.length > 0 ? (
                  delta.improvedSkills.map((skill, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{skill}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Maintained solid stability across primary communicative dimensions.
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300">
                <strong>Key Trajectory Insight:</strong> Greatest leap observed in <span className="underline font-bold">{delta.topGainParameter}</span>, elevating overall employability rating.
              </div>
            </div>

            {/* Right: Target Focus for Next GD */}
            <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                    Target Focus for Next GD
                  </h3>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                    Highest potential leverage for upcoming discussion rounds
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-indigo-950 dark:text-indigo-200">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <span>Target parameter: <strong className="text-indigo-700 dark:text-indigo-300">{delta.topRoomForGrowth}</strong> has maximum score headroom remaining.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <span>Synthesize 2 empirical facts or regulatory examples when delivering rebuttal arguments.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  <span>Maintain current filler reduction ({selectedCurrent.fillerWordsCount ?? 2} fillers) while expanding total speaking turns to 6+.</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-indigo-200/60 dark:border-indigo-900/60 text-xs text-indigo-800 dark:text-indigo-300">
                <strong>Next Milestone:</strong> Attain 90+ Composite Score to unlock the <em>"Excellent / Campus Placement Star"</em> institutional tier.
              </div>
            </div>

          </div>
        </div>

        {/* Attended Sessions Timeline */}
        <div className="p-6 sm:p-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Candidate Discussion Archive & Timeline
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Every GD session attended automatically records to your personal progression portfolio
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {history.length} Session{history.length > 1 ? 's' : ''} Logged
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map((sessionItem, idx) => {
              const isSelectedCurr = sessionItem.id === currentId;
              const isSelectedPrev = sessionItem.id === previousId;

              return (
                <div
                  key={sessionItem.id}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    isSelectedCurr
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-xs'
                      : isSelectedPrev
                      ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {idx === 0 ? '🟢 Latest GD' : `Session #${history.length - idx}`}
                    </span>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {sessionItem.overallScore}/100
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                    {sessionItem.topic}
                  </h4>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{sessionItem.generatedAt || 'Recent'}</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{sessionItem.grade}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Institutional Sign-off Footer */}
        <div className="p-6 sm:p-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Verified by ERUS Autonomous AI Group Discussion Facilitator
            </p>
            <p className="text-[11px] mt-0.5">
              Standard 7-Parameter Academic Rubric • Endorsed for University Placement Training
            </p>
          </div>

          <div className="text-left sm:text-right font-mono text-[11px]">
            <div>Comparison Hash: {selectedCurrent.id.slice(-8)}-{selectedPrevious.id.slice(-8)}</div>
            <div>Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>

      </div>
    </div>
  );
};
