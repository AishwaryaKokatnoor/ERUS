import React, { useState } from 'react';
import { 
  GraduationCap, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  UserPlus,
  Building,
  BookOpen,
  Hash,
  CheckCircle2
} from 'lucide-react';
import { StudentUser } from '../../types/auth';
import { authenticateUser, registerNewUser } from '../../data/mockAuthData';

interface StudentLoginProps {
  onLogin: (user: StudentUser) => void;
  onSwitchToFaculty: () => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({
  onLogin,
  onSwitchToFaculty,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);

  // Login Form States
  const [identifier, setIdentifier] = useState('rahul.kumar@dit.edu.in');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);

  // Registration Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regStudentId, setRegStudentId] = useState('');
  const [regCollege, setRegCollege] = useState('');
  const [regCourse, setRegCourse] = useState('B.Tech CSE');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setError('Please enter your Student ID or Email address.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const user = authenticateUser('student', identifier, password);
      if (user && user.role === 'student') {
        onLogin(user);
      } else {
        setError('Invalid Student credentials. Try entering rahul.kumar@dit.edu.in with password123, use 1-click login below, or register as a new student.');
      }
      setIsLoading(false);
    }, 300);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!regName.trim() || !regEmail.trim() || !regCollege.trim()) {
      setError('Please fill out all required fields.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const newStudent: StudentUser = {
        id: `s-reg-${Date.now().toString().slice(-4)}`,
        name: regName.trim(),
        email: regEmail.trim(),
        role: 'student',
        studentId: regStudentId.trim() || `STU-${Date.now().toString().slice(-4)}`,
        college: regCollege.trim(),
        course: regCourse.trim() || 'General Engineering',
        batch: '2024-2028',
        seatNumber: 1, // assigned to room
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80',
      };

      registerNewUser(newStudent, regPassword);
      setSuccessMsg('Account created successfully! Logging you into the GD Conference Room...');
      
      setTimeout(() => {
        onLogin(newStudent);
      }, 700);
      setIsLoading(false);
    }, 400);
  };


  return (
    <div className="w-full max-w-lg mx-auto bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 rounded-2xl shadow-sm dark:shadow-xl transition-all">
      
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center shrink-0">
            {isRegistering ? <UserPlus className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isRegistering ? 'Student Registration' : 'Student Sign In'}
              </h2>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Participant
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isRegistering
                ? 'Register to join group discussion slots and receive feedback'
                : 'Join the active group discussion room and view your scorecard'}
            </p>
          </div>
        </div>
      </div>

      {/* Mode Toggle Pills (Sign In vs Register) */}
      <div className="flex p-1 mb-5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setIsRegistering(false);
            setError(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            !isRegistering
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setIsRegistering(true);
            setError(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            isRegistering
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Register New Student
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. SIGN IN FORM */}
      {!isRegistering ? (
        <>
          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Student ID or Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. rahul.kumar@dit.edu.in"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <span className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 group cursor-pointer"
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


        </>
      ) : (
        /* 2. REGISTRATION FORM */
        <form onSubmit={handleRegisterSubmit} className="space-y-3.5 animate-in fade-in slide-in-from-bottom-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Kavita Sharma"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                College / Institution *
              </label>
              <div className="relative">
                <Building className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regCollege}
                  onChange={(e) => setRegCollege(e.target.value)}
                  placeholder="e.g. IIT Delhi"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Course / Branch *
              </label>
              <div className="relative">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regCourse}
                  onChange={(e) => setRegCourse(e.target.value)}
                  placeholder="e.g. B.Tech Computer Science"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Student Roll / ID
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regStudentId}
                  onChange={(e) => setRegStudentId(e.target.value)}
                  placeholder="e.g. STU-2024-512"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@college.edu"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Create Password *
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Complete Student Registration</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

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
    </div>
  );
};
