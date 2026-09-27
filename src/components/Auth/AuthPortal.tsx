import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  GraduationCap, 
  ShieldCheck, 
  Building2,
  Crown,
  Sun, 
  Moon,
  ChevronDown,
  Check
} from 'lucide-react';
import { AuthUser, UserRole } from '../../types/auth';
import { StudentLogin } from './StudentLogin';
import { FacultyLogin } from './FacultyLogin';
import { CollegeAdminLogin } from './CollegeAdminLogin';
import { SuperAdminLogin } from './SuperAdminLogin';
import { useTheme } from '../../context/ThemeContext';
import { roomVoice } from '../../utils/speechSynthesis';

interface RoleConfig {
  id: UserRole;
  label: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  activeBorder: string;
  badgeColor: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'student',
    label: 'Student',
    badge: 'Participant',
    desc: 'Instant Join, live voice audio mesh & AI assessment report',
    icon: GraduationCap,
    gradient: 'from-blue-600 to-indigo-600',
    activeBorder: 'border-blue-500/80 dark:border-blue-400/80',
    badgeColor: 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
  },
  {
    id: 'faculty',
    label: 'Faculty',
    badge: 'Evaluator',
    desc: 'Live observer room, speaker notes, AI sentiment & rubrics',
    icon: ShieldCheck,
    gradient: 'from-teal-600 to-cyan-600',
    activeBorder: 'border-teal-500/80 dark:border-teal-400/80',
    badgeColor: 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
  },
  {
    id: 'college_admin',
    label: 'College Admin',
    badge: 'Campus Manager',
    desc: 'Student & faculty rosters, CSV upload & slot scheduling',
    icon: Building2,
    gradient: 'from-amber-500 to-orange-600',
    activeBorder: 'border-amber-500/80 dark:border-amber-400/80',
    badgeColor: 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  },
  {
    id: 'super_admin',
    label: 'Super Admin',
    badge: 'Platform Root',
    desc: 'Onboard institutions, issue credentials & global KPIs',
    icon: Crown,
    gradient: 'from-purple-600 to-pink-600',
    activeBorder: 'border-purple-500/80 dark:border-purple-400/80',
    badgeColor: 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
  },
];

interface AuthPortalProps {
  onLogin: (user: AuthUser) => void;
  defaultRole?: UserRole;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  onLogin,
  defaultRole = 'student',
}) => {
  const [activeTab, setActiveTab] = useState<UserRole>(defaultRole);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Ensure AI speech engine is strictly silenced when on the authentication portal
  useEffect(() => {
    roomVoice.stop();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentRole = ROLES.find((r) => r.id === activeTab) || ROLES[0];
  const CurrentIcon = currentRole.icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden transition-colors duration-200">
      {/* Ambient background decoration */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-teal-500/10 dark:bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar with Branding, Role Switcher Menu & Theme Switcher */}
      <header className="px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between max-w-7xl mx-auto w-full relative z-30">
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
                MULTI-ROLE PLATFORM
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
              AI-Powered Autonomous Group Discussion Facilitator & Individual Assessment Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 relative">
          {/* Top Role Switcher Menu Button */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer group ring-1 ring-slate-900/5 dark:ring-white/5"
              aria-expanded={isMenuOpen}
              aria-label="Switch portal role"
            >
              <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${currentRole.gradient} flex items-center justify-center text-white shadow-xs shrink-0`}>
                <CurrentIcon className="w-3.5 h-3.5" />
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 leading-none">
                  Portal Role
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span>{currentRole.label}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${currentRole.badgeColor}`}>
                    {currentRole.badge}
                  </span>
                </div>
              </div>
              <span className="sm:hidden text-xs font-bold text-slate-800 dark:text-slate-200">
                {currentRole.label}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : 'group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
            </button>

            {/* Dropdown Menu Popup (Spacious, Untruncated, & Modern) */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-3xl bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xl z-50 p-2 sm:p-2.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800/80 mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                    Switch Access Role
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    4 Roles Available
                  </span>
                </div>

                <div className="space-y-1.5">
                  {ROLES.map((role) => {
                    const Icon = role.icon;
                    const isSelected = activeTab === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(role.id);
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-start justify-between p-3 rounded-2xl text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100/90 dark:bg-slate-800/90 ring-1 ring-slate-300 dark:ring-slate-700 shadow-xs'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 pr-2">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5`}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                {role.label}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${role.badgeColor}`}>
                                {role.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                              {role.desc}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-200/80 dark:border-emerald-800/60 shrink-0 mt-1">
                            <Check className="w-3 h-3" />
                            <span>Active</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Login Interface */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 max-w-7xl mx-auto w-full relative z-10">
        
        {/* Dynamic Login Component */}
        <div className="w-full">
          {activeTab === 'student' && (
            <StudentLogin
              onLogin={onLogin}
              onSwitchToFaculty={() => setActiveTab('faculty')}
            />
          )}
          {activeTab === 'faculty' && (
            <FacultyLogin
              onLogin={onLogin}
              onSwitchToStudent={() => setActiveTab('student')}
            />
          )}
          {activeTab === 'college_admin' && (
            <CollegeAdminLogin
              onLogin={onLogin}
            />
          )}
          {activeTab === 'super_admin' && (
            <SuperAdminLogin
              onLogin={onLogin}
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
