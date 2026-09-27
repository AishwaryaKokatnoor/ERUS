import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  UserPlus,
  Building,
  Briefcase,
  Hash,
  CheckCircle2
} from 'lucide-react';
import { FacultyUser } from '../../types/auth';
import { loginUser, registerUser, fetchAdminColleges, fetchCollegeFaculty } from '../../utils/authApi';

interface FacultyLoginProps {
  onLogin: (user: FacultyUser) => void;
  onSwitchToStudent: () => void;
}

export const FacultyLogin: React.FC<FacultyLoginProps> = ({
  onLogin,
  onSwitchToStudent,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [availableColleges, setAvailableColleges] = useState<any[]>([]);
  const [demoFaculty, setDemoFaculty] = useState<any[]>([]);

  React.useEffect(() => {
    fetchAdminColleges().then(async (list) => {
      if (list && list.length > 0) setAvailableColleges(list);
      const codes = Array.from(new Set(['DIT', ...(list || []).map((c: any) => String(c.code || '').toUpperCase()).filter(Boolean)]));
      const rosters = await Promise.all(codes.map((code) => fetchCollegeFaculty(code)));
      const merged = rosters.flat();
      const byId = new Map<string, any>();
      merged.forEach((fac: any) => {
        const key = fac.facultyId || fac.email;
        if (key) byId.set(key, fac);
      });
      setDemoFaculty(Array.from(byId.values()));
    });
  }, []);

  // Login Form States
  const [identifier, setIdentifier] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regFacultyId, setRegFacultyId] = useState('');
  const [regCollege, setRegCollege] = useState('');
  const [regDepartment, setRegDepartment] = useState('Department of Computer Science & Engineering');
  const [regDesignation, setRegDesignation] = useState('Assistant Professor');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setError('Please enter your Faculty ID or Institutional Email.');
      return;
    }

    setIsLoading(true);
    const res = await loginUser('faculty', identifier, password);
    setIsLoading(false);

    if (res.success && res.user && res.user.role === 'faculty') {
      onLogin(res.user as FacultyUser);
    } else {
      setError(res.error || 'Invalid Faculty credentials. Please check your Faculty ID or Email and password.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!regName.trim() || !regEmail.trim() || !regCollege.trim() || !regDepartment.trim()) {
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
    const res = await registerUser({
      name: regName.trim(),
      email: regEmail.trim(),
      role: 'faculty',
      facultyId: regFacultyId.trim() || `FAC-${Date.now().toString().slice(-4)}`,
      college: regCollege.trim(),
      department: regDepartment.trim(),
      designation: regDesignation.trim() || 'Faculty Evaluator',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
      password: regPassword,
    });
    setIsLoading(false);

    if (res.success && res.user && res.user.role === 'faculty') {
      setSuccessMsg('Faculty account registered successfully! Logging in to Faculty Analytics...');
      setTimeout(() => {
        onLogin(res.user as FacultyUser);
      }, 700);
    } else {
      setError(res.error || 'Registration failed. Please check your information and try again.');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl shadow-teal-500/5 transition-all">
      
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20 ring-4 ring-teal-50 dark:ring-teal-950/50 shrink-0">
            {isRegistering ? <UserPlus className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isRegistering ? 'Faculty Registration' : 'Faculty Portal'}
              </h2>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                Evaluator / Admin
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isRegistering
                ? 'Register your faculty account to provision discussion slots and assess cohorts'
                : 'Access batch analytics, session governance, and student evaluation scorecards'}
            </p>
          </div>
        </div>
      </div>

      {/* Mode Toggle Pills (Sign In vs Register) */}
      <div className="flex p-1 mb-6 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setIsRegistering(false);
            setError(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            !isRegistering
              ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-300 shadow-xs'
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
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            isRegistering
              ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-300 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Register New Faculty
        </button>
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

      {/* 1. SIGN IN FORM */}
      {!isRegistering ? (
        <>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Faculty ID or Institutional Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. sunita.rao@dit.edu.in or FAC-CSE-102"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Department / Academic Unit
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Department of Computer Science"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <span className="text-[11px] text-slate-400 hover:text-teal-600 cursor-pointer">
                  Reset credentials?
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter faculty password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
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

            {/* Demo faculty created by the College Admin */}
          {demoFaculty.length > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-extrabold text-slate-800 dark:text-white">Demo Faculty</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Faculty added by the College Admin • click a name to fill the login
                  </p>
                </div>
                <span className="text-[9px] px-2 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold">
                  {demoFaculty.length} faculty
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                {demoFaculty.map((fac: any) => (
                  <button
                    key={fac.facultyId || fac.email}
                    type="button"
                    onClick={() => {
                      setIdentifier(fac.facultyId || fac.email || '');
                      setPassword('faculty123');
                      setDepartment(fac.department || '');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-400 hover:bg-teal-50/60 dark:hover:bg-teal-950/30 transition-all text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{fac.name || 'Faculty'}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {fac.facultyId || fac.email} • {fac.department || 'Faculty'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[9px] font-bold text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 rounded-lg px-2 py-1">
                      Use Demo
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white font-semibold text-xs sm:text-sm shadow-md shadow-teal-600/20 hover:shadow-lg hover:shadow-teal-600/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {isLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In as Faculty Evaluator</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Demo faculty access — kept below the real login so production
              faculty accounts still use normal authentication. */}
          <div className="mt-5 rounded-2xl border border-teal-200/70 dark:border-teal-800/60 bg-teal-50/70 dark:bg-teal-950/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  Demo Faculty
                </p>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                  Use this for presentations without creating a faculty account.
                </p>
                <p className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Dr. Sunita Rao · FAC-CSE-102
                </p>
              </div>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setError(null);
                  setSuccessMsg('Opening Demo Faculty Portal...');
                  onLogin({
                    id: 'demo-faculty-sunita',
                    name: 'Dr. Sunita Rao',
                    email: 'sunita.rao@demo.erus',
                    role: 'faculty',
                    facultyId: 'FAC-CSE-102',
                    college: 'Delhi Institute of Technology',
                    collegeCode: 'DIT',
                    department: 'Computer Science & Engineering',
                    designation: 'Professor & Head of Department',
                    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
                  } as FacultyUser);
                }}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-colors"
              >
                Use Demo
              </button>
            </div>
          </div>
        </>
      ) : (
        /* 2. FACULTY REGISTRATION FORM */
        <form onSubmit={handleRegisterSubmit} className="space-y-3.5 animate-in fade-in slide-in-from-bottom-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name (with title) *
            </label>
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Dr. Kavita Deshmukh"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
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
                  placeholder="e.g. IIT Bombay"
                  list="faculty-college-suggestions"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  required
                />
                <datalist id="faculty-college-suggestions">
                  {(availableColleges.length > 0 ? availableColleges : [
                    { code: 'DIT', name: 'Delhi Institute of Technology' },
                    { code: 'IITB', name: 'Indian Institute of Technology Bombay' }
                  ]).map((col) => (
                    <option key={col.code} value={col.name}>
                      {col.code} - {col.name}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Department *
              </label>
              <div className="relative">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  placeholder="e.g. Computer Science & Engg."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Designation *
              </label>
              <input
                type="text"
                value={regDesignation}
                onChange={(e) => setRegDesignation(e.target.value)}
                placeholder="e.g. Associate Professor / HOD"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Faculty / Employee ID
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regFacultyId}
                  onChange={(e) => setRegFacultyId(e.target.value)}
                  placeholder="e.g. FAC-CSE-304"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Institutional Email *
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="faculty.name@institution.ac.in"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                required
              />
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
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
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
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white font-semibold text-xs sm:text-sm shadow-md shadow-teal-600/20 hover:shadow-lg hover:shadow-teal-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Complete Faculty Registration</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Switch to Student Portal */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Are you a student participant?{' '}
          <button
            type="button"
            onClick={onSwitchToStudent}
            className="text-teal-600 dark:text-cyan-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Student Portal</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </p>
      </div>
    </div>
  );
};
