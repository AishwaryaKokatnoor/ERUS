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
  Moon,
  LogOut,
  GraduationCap,
  ShieldCheck,
  BookOpen
} from 'lucide-react';
import { GDSession } from '../types/gd';
import { AuthUser } from '../types/auth';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  currentTab: 'topics' | 'room' | 'report' | 'faculty' | 'manager';
  setCurrentTab: (tab: 'topics' | 'room' | 'report' | 'faculty' | 'manager') => void;
  session: GDSession;
  voiceMuted: boolean;
  setVoiceMuted: (muted: boolean) => void;
  elapsedSeconds: number;
  onOpenCreateSession: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  session,
  voiceMuted,
  setVoiceMuted,
  elapsedSeconds,
  onOpenCreateSession,
  currentUser,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isStudent = currentUser?.role === 'student';
  const isFaculty = currentUser?.role === 'faculty';

  return (
    <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-40 px-4 sm:px-6 py-2.5 transition-colors duration-200 no-print">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Left: Brand Identity & Mobile Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-xs shrink-0 text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-base tracking-tight text-slate-900 dark:text-white">ERUS-AIGDF</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                  {isStudent ? 'STUDENT' : isFaculty ? 'FACULTY' : 'MODERATOR'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate max-w-[200px] sm:max-w-[260px]">
                {currentUser ? `${currentUser.name} • ${currentUser.college}` : 'AI Group Discussion Facilitator'}
              </p>
            </div>
          </div>

          {/* Quick controls on mobile screens */}
          <div className="flex md:hidden items-center gap-1.5">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Clock className="w-3 h-3 text-amber-500" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
            <button
              id="theme-toggle-btn-sm"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
            </button>
            {currentUser && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Clean Segmented Navigation */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 w-full md:w-auto overflow-x-auto justify-start sm:justify-center">
          
          {/* Student Tab 1: Topics & Slots */}
          {isStudent && (
            <button
              id="tab-topics-btn"
              onClick={() => setCurrentTab('topics')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'topics'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Topics &amp; Slots</span>
            </button>
          )}

          {/* Faculty Primary Tab: Faculty Analytics */}
          {isFaculty && (
            <button
              id="tab-faculty-btn"
              onClick={() => setCurrentTab('faculty')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'faculty'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Faculty Analytics</span>
            </button>
          )}

          {/* Student Tab 2 / Evaluation Tab */}
          {isStudent ? (
            <button
              id="tab-report-btn"
              onClick={() => setCurrentTab('report')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'report'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>My Assessment Report</span>
            </button>
          ) : (
            <button
              id="tab-report-btn"
              onClick={() => setCurrentTab('report')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'report'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Evaluations</span>
            </button>
          )}

          {/* GD Conference Room Tab (Visible if in room, or for faculty) */}
          <button
            id="tab-room-btn"
            onClick={() => setCurrentTab('room')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'room'
                ? isStudent
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span>{isFaculty ? 'Conference Room (Observer)' : 'Discussion Room'}</span>
          </button>

          {/* New Session (Faculty / Admin Only) */}
          {isFaculty && (
            <button
              id="tab-manager-btn"
              onClick={onOpenCreateSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-slate-900 transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Session</span>
            </button>
          )}
        </div>

        {/* Right: Controls & User Profile */}
        <div className="hidden md:flex items-center gap-2">
          {/* Active Slot Badge */}
          {session.slotName && (
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-medium">
              <span>{session.slotName}</span>
              {session.slotTiming && (
                <span className="font-mono text-[10px] text-slate-500">({session.slotTiming})</span>
              )}
            </div>
          )}

          {/* Active Timer Pill */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs font-mono text-slate-700 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-medium">{formatTime(elapsedSeconds)}</span>
            <span className="text-slate-400 dark:text-slate-500">/ {session.durationMinutes}:00</span>
          </div>

          {/* Voice Engine Toggle */}
          <button
            id="voice-mute-toggle"
            onClick={() => setVoiceMuted(!voiceMuted)}
            className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              voiceMuted
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            }`}
            title={voiceMuted ? 'Unmute AI Moderator Voice' : 'Mute AI Moderator Voice'}
          >
            {voiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>

          {/* User Profile Badge & Logout */}
          {currentUser && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 p-1 pr-2 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-md object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="text-left hidden lg:block">
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[100px]">
                      {currentUser.name.split(' ')[0]}
                    </span>
                    {isStudent && (
                      <span className="text-[9px] font-mono px-1 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Seat 1
                      </span>
                    )}
                  </div>
                  {isStudent && currentUser.course && (
                    <span className="text-[9px] text-slate-400 block leading-tight mt-0.5 font-medium truncate max-w-[100px]">
                      {currentUser.course.split(' ')[0]}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900 transition-all cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
