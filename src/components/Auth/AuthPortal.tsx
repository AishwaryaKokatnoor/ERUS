import React, { useState } from 'react';
import { 
  Sparkles, 
  GraduationCap, 
  ShieldCheck, 
  Sun, 
  Moon 
} from 'lucide-react';
import { AuthUser, UserRole } from '../../types/auth';
import { StudentLogin } from './StudentLogin';
import { FacultyLogin } from './FacultyLogin';
import { useTheme } from '../../context/ThemeContext';

interface AuthPortalProps {
  onLogin: (user: AuthUser) => void;
  defaultRole?: UserRole;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  onLogin,
  defaultRole = 'student',
}) => {
  const [activeTab, setActiveTab] = useState<UserRole>(defaultRole);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden transition-colors duration-200">
      {/* Ambient background decoration */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-teal-500/10 dark:bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar with Branding & Theme Switcher */}
      <header className="px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between max-w-7xl mx-auto w-full relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-teal-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20 shrink-0">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
                ERUS-AIGDF
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                PORTAL LOGIN
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
              AI-Powered Autonomous Group Discussion Facilitator & Individual Assessment Platform
            </p>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-600" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
      </header>

      {/* Main Login Interface */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-10 max-w-7xl mx-auto w-full relative z-10">
        
        {/* Role Selector Segmented Tabs */}
        <div className="mb-8 flex items-center p-1.5 rounded-2xl bg-slate-200/70 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'student'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Student Login</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'faculty'
                ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Faculty Login</span>
          </button>
        </div>

        {/* Dynamic Login Component */}
        <div className="w-full">
          {activeTab === 'student' ? (
            <StudentLogin
              onLogin={onLogin}
              onSwitchToFaculty={() => setActiveTab('faculty')}
            />
          ) : (
            <FacultyLogin
              onLogin={onLogin}
              onSwitchToStudent={() => setActiveTab('student')}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-4 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-800/80 relative z-10">
        <span>ERUS Autonomous AI Group Discussion Facilitator • Multi-Role Academic Portal</span>
      </footer>
    </div>
  );
};
