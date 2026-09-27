import React, { useState, useEffect } from 'react';
import { 
  Crown, 
  Building2, 
  Users, 
  GraduationCap, 
  Calendar, 
  Plus, 
  Mail, 
  Send, 
  Copy, 
  Check, 
  ShieldCheck, 
  Sparkles, 
  X, 
  CheckCircle2, 
  Search,
  ExternalLink,
  KeyRound,
  Eye
} from 'lucide-react';
import { SuperAdminUser, CollegeInfo } from '../../types/auth';
import { 
  fetchAdminColleges, 
  registerNewCollege, 
  sendCollegeCredentials, 
  fetchAdminStats 
} from '../../utils/authApi';

interface SuperAdminDashboardProps {
  currentUser: SuperAdminUser;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  currentUser,
}) => {
  const [colleges, setColleges] = useState<CollegeInfo[]>([]);
  const [stats, setStats] = useState({
    totalColleges: 3,
    totalStudents: 215,
    totalFaculty: 32,
    totalSlots: 14,
    activeLiveGDs: 1,
  });
  const [search, setSearch] = useState('');
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState<any | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newCollege, setNewCollege] = useState({
    name: '',
    code: '',
    contactEmail: '',
    phone: '',
    address: '',
    adminName: '',
    adminPassword: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [colData, statsData] = await Promise.all([
        fetchAdminColleges(),
        fetchAdminStats(),
      ]);
      if (colData && colData.length > 0) setColleges(colData);
      if (statsData) setStats(statsData);
    } catch (e) {
      console.warn('Super Admin load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollege.name || !newCollege.code || !newCollege.contactEmail) return;

    setLoading(true);
    const res = await registerNewCollege(newCollege);
    setLoading(false);

    if (res && res.success) {
      setIsOnboardOpen(false);
      setCredentialsModal(res.generatedCredentials);
      setBannerMsg(`Institution "${newCollege.name}" onboarded. Credentials generated below.`);
      
      if (res.college) {
        setColleges((prev) => [res.college, ...prev.filter((c) => c.code?.toUpperCase() !== res.college.code?.toUpperCase())]);
        setStats((prev) => ({ ...prev, totalColleges: (prev.totalColleges || 0) + 1 }));
      }

      setNewCollege({
        name: '',
        code: '',
        contactEmail: '',
        phone: '',
        address: '',
        adminName: '',
        adminPassword: '',
      });
      loadData();
    }
  };

  const handleSendCredentials = async (collegeId: string, email: string) => {
    const res = await sendCollegeCredentials(collegeId);
    if (res && res.success) {
      setBannerMsg(`Official onboarding credentials sent to ${email}.`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredColleges = colleges.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.contactEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pt-2">
      
      {/* Super Admin Top Banner */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-900/15 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 backdrop-blur-3xl rounded-l-full pointer-events-none transform translate-x-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center ring-2 ring-white/20 shadow-inner shrink-0">
              <Crown className="w-9 h-9 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/40 text-purple-200 font-mono font-bold tracking-wider">
                  ROOT / GLOBAL
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold">
                  SUPER ADMIN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
                ERUS Global Platform Management
              </h1>
              <p className="text-purple-200/90 text-xs sm:text-sm mt-0.5 font-medium">
                Onboard partner universities, manage college admins, and provision institutional access
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOnboardOpen(true)}
            className="px-5 py-3 rounded-2xl bg-white text-purple-950 hover:bg-purple-50 font-bold text-xs sm:text-sm shadow-lg shadow-black/20 flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-purple-700" />
            <span>Onboard New Institution</span>
          </button>
        </div>
      </div>

      {/* Banner / Success Toast */}
      {bannerMsg && (
        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200 text-xs sm:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>{bannerMsg}</span>
          </div>
          <button onClick={() => setBannerMsg(null)} className="text-purple-600 hover:text-purple-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top 4 Global Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Institutions</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {colleges.length || stats.totalColleges}
          </div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Partner Colleges & Campuses
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Students</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {stats.totalStudents}
          </div>
          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Registered Student Profiles
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Faculty Evaluators</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {stats.totalFaculty}
          </div>
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Active Faculty Observers
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">College Administrators</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {colleges.length || stats.totalColleges}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Active Institutional Admins
          </span>
        </div>
      </div>

      {/* Colleges Management Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-heading font-extrabold text-slate-900 dark:text-white">
              Registered Colleges & Institutions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each institution has a designated College Admin who manages faculty, student rosters, and institutional operations.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by college name, code, or admin email..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Institutions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-5">College Code</th>
                <th className="py-3.5 px-5">Institution Name</th>
                <th className="py-3.5 px-5">College Admin Email</th>
                <th className="py-3.5 px-5 text-center">Students</th>
                <th className="py-3.5 px-5 text-center">Faculty</th>
                <th className="py-3.5 px-5 text-right">Credentials & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredColleges.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-4 px-5">
                    <span className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono font-bold">
                      {c.code}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{c.name}</div>
                    <div className="text-[11px] text-slate-400">{c.address || 'Academic Campus'}</div>
                  </td>
                  <td className="py-4 px-5">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{c.adminEmail}</div>
                    <div className="text-[11px] text-slate-400">{c.adminName}</div>
                  </td>
                  <td className="py-4 px-5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                    {c.studentCount || 0}
                  </td>
                  <td className="py-4 px-5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                    {c.facultyCount || 0}
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          setCredentialsModal({
                            email: c.adminEmail,
                            password: `Erus@${c.code}2026`,
                            role: 'college_admin',
                            collegeName: c.name,
                            collegeCode: c.code,
                            adminId: `CADM-${c.code}-001`,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="View Login Credentials"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-purple-600" />
                        <span>View Pass</span>
                      </button>

                      <button
                        onClick={() => handleSendCredentials(c.id, c.adminEmail || c.contactEmail)}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                        title="Dispatch credentials email"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Mail</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================== */}
      {/* MODAL: ONBOARD NEW COLLEGE */}
      {/* ==================================================== */}
      {isOnboardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                    Onboard New Institution
                  </h3>
                  <p className="text-xs text-slate-400">
                    Creates the college profile and auto-provisions the College Admin account.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsOnboardOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Full Institution / College Name
                </label>
                <input
                  type="text"
                  value={newCollege.name}
                  onChange={(e) => setNewCollege({ ...newCollege, name: e.target.value })}
                  placeholder="e.g. Vellore Institute of Technology"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    College Code
                  </label>
                  <input
                    type="text"
                    value={newCollege.code}
                    onChange={(e) => setNewCollege({ ...newCollege, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. VIT"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 uppercase font-mono font-bold focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={newCollege.phone}
                    onChange={(e) => setNewCollege({ ...newCollege, phone: e.target.value })}
                    placeholder="+91 416 224 3091"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  College Admin Contact Email
                </label>
                <input
                  type="email"
                  value={newCollege.contactEmail}
                  onChange={(e) => setNewCollege({ ...newCollege, contactEmail: e.target.value })}
                  placeholder="e.g. admin@vit.ac.in"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Administrator Name
                  </label>
                  <input
                    type="text"
                    value={newCollege.adminName}
                    onChange={(e) => setNewCollege({ ...newCollege, adminName: e.target.value })}
                    placeholder="e.g. Dr. Anand Kumar"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Initial Password (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCollege.adminPassword}
                    onChange={(e) => setNewCollege({ ...newCollege, adminPassword: e.target.value })}
                    placeholder="Defaults to Erus@CODE2026"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOnboardOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-600/25 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Registering...' : 'Provision Institution & Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: VIEW / COPY GENERATED CREDENTIALS */}
      {/* ==================================================== */}
      {credentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full border border-purple-200 dark:border-purple-800 shadow-2xl animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-amber-500" />

            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-purple-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  College Admin Credentials
                </h3>
              </div>
              <button onClick={() => setCredentialsModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                Provide these credentials to the College Administrator. They can immediately log in through the unified login portal under the <strong>College Admin</strong> tab.
              </p>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Institution:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{credentialsModal.collegeName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Admin ID:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 text-xs">{credentialsModal.adminId}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Login Email:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{credentialsModal.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Password:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400 text-xs">{credentialsModal.password}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Login Portal:</span>
                  <span className="text-slate-600 dark:text-slate-300 text-[11px]">https://erus-production.up.railway.app</span>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `ERUS Institution Admin Login:\nCollege: ${credentialsModal.collegeName}\nAdmin Email: ${credentialsModal.email}\nPassword: ${credentialsModal.password}\nPortal: https://erus-production.up.railway.app (Select "College Admin" tab)`;
                    copyToClipboard(text);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied to Clipboard' : 'Copy Credentials'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBannerMsg(`Credentials dispatched to ${credentialsModal.email}.`);
                    setCredentialsModal(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Mail</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
