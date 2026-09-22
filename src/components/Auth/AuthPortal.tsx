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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative bg-grid-pattern transition-colors duration-200">
      
      {/* Top Bar with Clean Branding & Theme Switcher */}
      <header className="px-4 sm:px-8 py-5 flex items-center justify-between max-w-6xl mx-auto w-full relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-lg tracking-tight text-slate-900 dark:text-white">
                ERUS
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
                AI Facilitator
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal hidden sm:block">
              Group Discussion & Assessment Platform
            </p>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-2xs cursor-pointer"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
              <span>Dark</span>
            </>
          )}
        </button>
      </header>

      {/* Main Login Interface */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 max-w-6xl mx-auto w-full relative z-10">
        
        {/* Role Selector Segmented Tabs */}
        <div className="mb-6 flex items-center p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'student'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Student Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'faculty'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Faculty Portal</span>
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
      <footer className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200/80 dark:border-slate-800/80 relative z-10">
        <span>ERUS Autonomous AI Group Discussion Facilitator & Individual Assessment</span>
      </footer>
    </div>
  );
};

