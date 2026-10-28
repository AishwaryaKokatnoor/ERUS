import React, { useState } from 'react';
import { 
  GraduationCap, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { StudentUser } from '../../types/auth';
import { loginUser, isValidPortalPassword, PASSWORD_REQUIREMENT_MSG } from '../../utils/authApi';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface StudentLoginProps {
  onLogin: (user: StudentUser) => void;
  onSwitchToFaculty: () => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({
  onLogin,
  onSwitchToFaculty,
}) => {
  // Login Form States
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setError('Please enter your Student ID or College Email address.');
      return;
    }

    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    if (!isValidPortalPassword(password)) {
      setError(PASSWORD_REQUIREMENT_MSG);
      return;
    }

    setIsLoading(true);
    const res = await loginUser('student', identifier.trim(), password);
    setIsLoading(false);

    if (res.success && res.user && res.user.role === 'student') {
      onLogin(res.user as StudentUser);
    } else {
      setError(res.error || 'Invalid credentials. Please verify your Student ID/Email and password provided by your College Administrator.');
    }
  };

  const handlePasswordResetSuccess = (resetEmail: string, newPass: string) => {
    setIdentifier(resetEmail);
    setPassword(newPass);
    setSuccessMsg('Password updated successfully! You can now sign in.');
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl shadow-indigo-500/5 transition-all">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-4 ring-indigo-50 dark:ring-indigo-950/50 shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Student Portal
              </h2>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Participant
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Sign in to access your Group Discussion sessions & AI evaluation reports
            </p>
          </div>
        </div>
      </div>

      {/* Institutional Provisioning Notice */}
      <div className="mb-5 p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
          <span className="font-bold">Official Campus Access:</span> Student accounts and credentials are created and dispatched directly by your College Administrator. Public self-registration is closed.
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300 animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* SIGN IN FORM */}
      <form onSubmit={handleLoginSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Student ID, Roll Number, or College Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. STU-2022-041 or student@college.edu"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => setIsForgotOpen(true)}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>Forgot password?</span>
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your assigned password"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            Must be at least 8 characters with uppercase, lowercase, numbers, and special characters.
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
        >
          {isLoading ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Sign In as Student</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Faculty Portal */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Are you a faculty member, mentor, or evaluator?{' '}
          <button
            type="button"
            onClick={onSwitchToFaculty}
            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Faculty Portal</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </p>
      </div>

      {/* Forgot Password Reset Modal */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        role="student"
        defaultEmail={identifier.includes('@') ? identifier : ''}
        onSuccess={handlePasswordResetSuccess}
      />
    </div>
  );
};
