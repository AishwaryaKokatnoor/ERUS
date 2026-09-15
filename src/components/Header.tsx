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
  ShieldCheck
} from 'lucide-react';
import { GDSession } from '../types/gd';
import { AuthUser } from '../types/auth';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  currentTab: 'room' | 'report' | 'faculty' | 'manager';
  setCurrentTab: (tab: 'room' | 'report' | 'faculty' | 'manager') => void;
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
                  {isStudent ? 'STUDENT' : isFaculty ? 'FACULTY' : 'AI MODERATOR'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] sm:max-w-[280px]">
                {currentUser ? `${currentUser.name} • ${currentUser.college}` : 'AI Group Discussion Facilitator & Assessment'}
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
            {currentUser && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Role-Tailored Main Navigation */}
        <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-950/70 p-1 rounded-xl border border-slate-200 dark:border-slate-800 w-full md:w-auto overflow-x-auto justify-start sm:justify-center shadow-inner dark:shadow-none scrollbar-none">
          
          {/* Faculty Primary Tab: Faculty Analytics */}
          {isFaculty && (
            <button
              id="tab-faculty-btn"
              onClick={() => setCurrentTab('faculty')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'faculty'
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Faculty Analytics</span>
            </button>
          )}

          {/* GD Conference Room Tab */}
          <button
            id="tab-room-btn"
            onClick={() => setCurrentTab('room')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'room'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
            <span>{isFaculty ? 'GD Room (Observer)' : 'GD Conference Room'}</span>
          </button>

          {/* Student Assessment Reports Tab */}
          <button
            id="tab-report-btn"
            onClick={() => setCurrentTab('report')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'report'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>{isStudent ? 'My Assessment Report' : 'Student Reports'}</span>
          </button>

          {/* New Session (Faculty / Admin Only) */}
          {isFaculty && (
            <button
              id="tab-manager-btn"
              onClick={onOpenCreateSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-white bg-teal-50/80 hover:bg-teal-100/90 dark:bg-teal-950/40 dark:hover:bg-teal-900/50 transition-all border border-dashed border-teal-300 dark:border-teal-700/60 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>New Session</span>
            </button>
          )}
        </div>

        {/* Right: User Profile, Session Timer & Controls */}
        <div className="hidden md:flex items-center gap-2">
          {/* Active Slot Badge */}
          {session.slotName && (
            <div className="hidden lg:flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
              <span className="font-bold">{session.slotName}</span>
              {session.slotTiming && (
                <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">({session.slotTiming})</span>
              )}
            </div>
          )}

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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-2xs cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
            )}
          </button>

          {/* Voice Engine Toggle */}
          <button
            id="voice-mute-toggle"
            onClick={() => setVoiceMuted(!voiceMuted)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              voiceMuted
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
            }`}
            title={voiceMuted ? 'Unmute AI Moderator Voice' : 'Mute AI Moderator Voice'}
          >
            {voiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />}
            <span className="hidden xl:inline">{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
          </button>

          {/* User Profile Badge & Logout Button */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-300 dark:ring-slate-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="text-left hidden lg:block">
                  <div className="flex items-center gap-1.5 leading-none mb-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[110px]">
                      {currentUser.name}
                    </span>
                    {isStudent && 'seatNumber' in currentUser && (
                      <span className="text-[9px] font-mono px-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        Seat {currentUser.seatNumber}
                      </span>
                    )}
                    {isFaculty && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                        Faculty
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 leading-none block truncate max-w-[120px]">
                    {isStudent && 'course' in currentUser ? currentUser.course : isFaculty && 'department' in currentUser ? currentUser.department : currentUser.role}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                title="Sign Out / Switch User"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
