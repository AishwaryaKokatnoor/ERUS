import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldCheck,
  CheckCircle2,
  Users,
  Calendar,
  Sparkles
} from 'lucide-react';
import { CollegeAdminUser } from '../../types/auth';
import { loginUser, fetchAdminColleges } from '../../utils/authApi';

interface CollegeAdminLoginProps {
  onLogin: (user: CollegeAdminUser) => void;
  onSwitchToStudent?: () => void;
  onSwitchToFaculty?: () => void;
}

export const CollegeAdminLogin: React.FC<CollegeAdminLoginProps> = ({
  onLogin,
}) => {
  const [colleges, setColleges] = useState<any[]>([]);
  const [selectedCollegeCode, setSelectedCollegeCode] = useState('DIT');
  const [identifier, setIdentifier] = useState('admin@dit.edu.in');
  const [password, setPassword] = useState('college123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchAdminColleges().then((list) => {
      if (list && list.length > 0) {
        setColleges(list);
      }
    });
  }, []);

  const handleSelectCollege = (col: any) => {
    setSelectedCollegeCode(col.code);
    const email = col.adminEmail || col.contactEmail || `admin@${col.code.toLowerCase()}.edu.in`;
    setIdentifier(email);
    setPassword(col.code === 'DIT' ? 'college123' : (col.adminPassword || `Erus@${col.code}2026`));
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError('Please enter your College Administrator Email or Admin ID.');
      return;
    }

    setIsLoading(true);
    const res = await loginUser('college_admin', identifier, password);
    setIsLoading(false);

    if (res.success && res.user && res.user.role === 'college_admin') {
      onLogin(res.user as CollegeAdminUser);
    } else {
      setError(res.error || `Invalid credentials. For ${selectedCollegeCode}, try password: ${selectedCollegeCode === 'DIT' ? 'college123' : `Erus@${selectedCollegeCode}2026`}`);
    }
  };

  const handleQuickFill = () => {
    setIdentifier('admin@dit.edu.in');
    setPassword('college123');
    setSelectedCollegeCode('DIT');
    setError(null);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 transition-all">
        
        {/* Card Header */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-heading font-extrabold text-slate-900 dark:text-white">
                College Admin Portal
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800/60">
                INSTITUTION
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage student & faculty rosters and schedule GD slots
            </p>
          </div>
        </div>

        {/* Dynamic Campus Picker */}
        <div className="mb-5 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                Select Campus Portal:
              </span>
            </div>
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              {colleges.length || 2} Campuses Available
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(colleges.length > 0 ? colleges : [
              { code: 'DIT', name: 'Delhi Institute of Tech', adminEmail: 'admin@dit.edu.in' },
              { code: 'IITB', name: 'IIT Bombay', adminEmail: 'admin@iitb.ac.in' },
            ]).map((c) => {
              const isSelected = selectedCollegeCode.toUpperCase() === c.code.toUpperCase();
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelectCollege(c)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/40'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-slate-700 border border-amber-200/60 dark:border-slate-700'
                  }`}
                >
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span>{c.code}</span>
                  <span className="text-[10px] opacity-75 font-normal truncate max-w-[100px] hidden sm:inline">({c.name})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Admin Email / ID
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@college.edu.in"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm shadow-md shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Access Institution Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Feature Highlights Footer */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>CSV Roster Upload</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Faculty Assignment</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>GD Slot Scheduling</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Autonomous AI Moderation</span>
          </div>
        </div>

      </div>
    </div>
  );
};
