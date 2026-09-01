import React from 'react';
import { 
  Users, 
  FileText, 
  BarChart3, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Clock, 
  PlusCircle,
  Radio,
  Sun,
  Moon
} from 'lucide-react';
import { GDSession } from '../types/gd';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  currentTab: 'room' | 'report' | 'faculty' | 'manager';
  setCurrentTab: (tab: 'room' | 'report' | 'faculty' | 'manager') => void;
  session: GDSession;
  voiceMuted: boolean;
  setVoiceMuted: (muted: boolean) => void;
  elapsedSeconds: number;
  onOpenCreateSession: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  session,
  voiceMuted,
  setVoiceMuted,
  elapsedSeconds,
  onOpenCreateSession,
}) => {
  const { theme, toggleTheme } = useTheme();

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 transition-colors duration-200 no-print shadow-xs dark:shadow-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5 sm:gap-3">
        
        {/* Left: Brand Identity & Mobile Quick Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-teal-400 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-white/20 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">ERUS-AIGDF</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-700/50">
                  AI MODERATOR
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] sm:max-w-[280px]">
                AI Group Discussion Facilitator & Assessment
              </p>
            </div>
          </div>

          {/* Quick controls on mobile screens */}
          <div className="flex md:hidden items-center gap-1.5">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
              <Clock className="w-3 h-3 text-amber-500" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
            <button
              id="theme-toggle-btn-sm"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          </div>
        </div>

        {/* Center: Main View Navigation (Optimized for Mobile scroll & Desktop tabs) */}
        <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-950/70 p-1 rounded-xl border border-slate-200 dark:border-slate-800 w-full md:w-auto overflow-x-auto justify-start sm:justify-center shadow-inner dark:shadow-none scrollbar-none">
          <button
            id="tab-room-btn"
            onClick={() => setCurrentTab('room')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              currentTab === 'room'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
            <span>GD Conference Room</span>
          </button>

          <button
            id="tab-report-btn"
            onClick={() => setCurrentTab('report')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              currentTab === 'report'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>Student Assessment</span>
          </button>

          <button
            id="tab-faculty-btn"
            onClick={() => setCurrentTab('faculty')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              currentTab === 'faculty'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-teal-600 dark:text-cyan-400" />
            <span>Faculty Analytics</span>
          </button>

          <button
            id="tab-manager-btn"
            onClick={onOpenCreateSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap text-indigo-700 dark:text-slate-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50/70 hover:bg-indigo-100/80 dark:bg-transparent dark:hover:bg-indigo-600/20 transition-all border border-dashed border-indigo-300 dark:border-indigo-500/40"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>New Session</span>
          </button>
        </div>

        {/* Right: Controls & Desktop Theme Switcher */}
        <div className="hidden md:flex items-center gap-2">
          {/* Active Timer Pill */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="font-semibold">{formatTime(elapsedSeconds)}</span>
            <span className="text-slate-400 dark:text-slate-500">/ {session.durationMinutes}:00</span>
          </div>

          {/* Theme Toggle (Light / Dark) */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-2xs"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden lg:inline">Dark</span>
              </>
            )}
          </button>

          {/* Voice Engine Toggle */}
          <button
            id="voice-mute-toggle"
            onClick={() => setVoiceMuted(!voiceMuted)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
              voiceMuted
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
            }`}
            title={voiceMuted ? 'Unmute AI Moderator Voice' : 'Mute AI Moderator Voice'}
          >
            {voiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />}
            <span className="hidden lg:inline">{voiceMuted ? 'Voice Off' : 'AI Voice Active'}</span>
          </button>
        </div>

      </div>
    </header>
  );
};


