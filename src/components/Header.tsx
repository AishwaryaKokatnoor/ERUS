import React from 'react';
import { 
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
  Building2,
  Crown,
  BookOpen
} from 'lucide-react';
import { GDSession } from '../types/gd';
import { AuthUser } from '../types/auth';
import { useTheme } from '../context/ThemeContext';

export type NavTabType = 'topics' | 'room' | 'report' | 'faculty' | 'manager' | 'college_admin' | 'super_admin';

interface HeaderProps {
  currentTab: NavTabType;
  setCurrentTab: (tab: NavTabType) => void;
  session: GDSession;
  voiceMuted: boolean;
  setVoiceMuted: (muted: boolean) => void;
  elapsedSeconds: number;
  onOpenCreateSession: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  bookedSlotId?: string | null;
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
  bookedSlotId,
}) => {
  const { theme, toggleTheme } = useTheme();

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isStudent = currentUser?.role === 'student';
  const isFaculty = currentUser?.role === 'faculty';
  const isCollegeAdmin = currentUser?.role === 'college_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isSessionActive = session.status === 'active';

  return (
    <header className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-3 sm:px-4 lg:px-6 py-2 transition-colors duration-200 no-print shadow-xs dark:shadow-none w-full">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 w-full">
        
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-teal-400 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-white/20 shrink-0">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                ERUS-AIGDF
              </span>
              <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border whitespace-nowrap ${
                isStudent
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                  : isFaculty
                  ? 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
                  : isCollegeAdmin
                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
              }`}>
                {isStudent ? 'STUDENT' : isFaculty ? 'FACULTY' : isCollegeAdmin ? 'COLLEGE ADMIN' : 'SUPER ADMIN'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px] md:max-w-[200px] xl:max-w-[260px] hidden md:block">
              {currentUser ? `${currentUser.name} • ${currentUser.college}` : 'AI Group Discussion Facilitator & Assessment'}
            </p>
          </div>
        </div>

        {/* Center: Role-Tailored Main Navigation */}
        <nav 
          aria-label="Platform navigation"
          className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-950/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0"
        >
          {/* SUPER ADMIN TAB */}
          {isSuperAdmin && (
            <button
              onClick={() => setCurrentTab('super_admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'super_admin'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Institutions & Platform</span>
            </button>
          )}

          {/* COLLEGE ADMIN TAB */}
          {isCollegeAdmin && (
            <button
              onClick={() => setCurrentTab('college_admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'college_admin'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Campus Management</span>
            </button>
          )}

          {/* Faculty Primary Tab: Faculty Analytics */}
          {isFaculty && (
            <button
              id="tab-faculty-btn"
              onClick={() => setCurrentTab('faculty')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'faculty'
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Faculty Analytics</span>
            </button>
          )}

          {/* Student Primary Tab: Topics & Slot Booking */}
          {isStudent && (
            <button
              id="tab-topics-btn"
              onClick={() => setCurrentTab('topics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'topics'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className={`w-3.5 h-3.5 shrink-0 ${currentTab === 'topics' ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`} />
              <span>Topics & Slots</span>
            </button>
          )}

          {/* GD Room Tab (Faculty & College Admin Observers Only; Students enter via Booked Slot) */}
          {!isSuperAdmin && !isStudent && (
            <button
              id="tab-room-btn"
              onClick={() => setCurrentTab('room')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'room'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-pulse shrink-0" />
              <span>GD Room (Observer)</span>
            </button>
          )}

          {/* Student Assessment Reports Tab */}
          {(isStudent || isFaculty || isCollegeAdmin) && (
            <button
              id="tab-report-btn"
              onClick={() => setCurrentTab('report')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentTab === 'report'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span>{isStudent ? 'My Assessment Report' : 'Student Reports'}</span>
            </button>
          )}

          {/* New Session (College Admin Only) */}
          {isCollegeAdmin && (
            <button
              id="tab-manager-btn"
              onClick={onOpenCreateSession}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white bg-amber-50/80 hover:bg-amber-100/90 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 transition-all border border-dashed border-amber-300 dark:border-amber-700/60 cursor-pointer shrink-0 shadow-xs"
              title="Create New Discussion Session & Schedule Slots"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="hidden sm:inline">New Session</span>
            </button>
          )}
        </nav>

        {/* Right: User Profile, Session Timer & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Unified GD Slot & Timer Pill (Active ONLY in live GD room) */}
          {!isSuperAdmin && currentTab === 'room' && (
            <div 
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 h-9"
              title={session.slotTiming ? `${session.slotName || 'GD Session'} (${session.slotTiming})` : (session.slotName || 'GD Session')}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              {session.slotName && (
                <>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 max-w-[70px] sm:max-w-[110px] truncate">
                    {session.slotName.split(' - ')[0] || session.slotName}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 font-bold">•</span>
                </>
              )}
              {isSessionActive ? (
                <>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatTime(elapsedSeconds)}
                  </span>
                  <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px] hidden sm:inline">
                    / {session.durationMinutes}:00
                  </span>
                </>
              ) : (
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  Lobby
                </span>
              )}
            </div>
          )}

          {/* Voice Engine Toggle (Active ONLY in live GD room) */}
          {!isSuperAdmin && currentTab === 'room' && (
            <button
              id="voice-mute-toggle"
              onClick={() => setVoiceMuted(!voiceMuted)}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                voiceMuted
                  ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
              }`}
              title={voiceMuted ? 'Unmute AI Voice Facilitator' : 'Mute AI Voice Facilitator'}
              aria-label={voiceMuted ? 'Unmute AI Voice Facilitator' : 'Mute AI Voice Facilitator'}
            >
              {voiceMuted ? (
                <VolumeX className="w-4 h-4 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse shrink-0" />
              )}
            </button>
          )}

          {/* Theme Toggle (Light / Dark) */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-all cursor-pointer shrink-0 shadow-2xs"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
            )}
          </button>

          {/* User Profile Badge & Logout Button */}
          {currentUser && (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 shrink-0">
              <div 
                className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 h-9"
                title={`${currentUser.name} • ${currentUser.college || currentUser.role}`}
              >
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-lg object-cover ring-1 ring-slate-300 dark:ring-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="text-left hidden lg:block leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[90px] xl:max-w-[120px]">
                      {currentUser.name}
                    </span>
                    {isStudent && 'seatNumber' in currentUser && (
                      <span className="text-[9px] font-mono px-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                        Seat {currentUser.seatNumber}
                      </span>
                    )}
                    {isFaculty && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 whitespace-nowrap">
                        Faculty
                      </span>
                    )}
                    {isCollegeAdmin && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        Admin
                      </span>
                    )}
                    {isSuperAdmin && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 whitespace-nowrap">
                        Root
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate max-w-[110px] xl:max-w-[140px]">
                    {isStudent && 'course' in currentUser
                      ? currentUser.course
                      : isFaculty && 'department' in currentUser
                      ? currentUser.department
                      : isCollegeAdmin && 'department' in currentUser
                      ? currentUser.department
                      : currentUser.role}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer flex items-center justify-center shrink-0"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4 shrink-0" />
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
