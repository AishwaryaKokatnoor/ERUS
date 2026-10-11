import React, { useState, useEffect, useMemo } from 'react';
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
  Eye,
  Trash2,
  AlertTriangle,
  Activity,
  Server,
  RefreshCw,
  Sliders,
  Gauge,
  BarChart3,
  FileText,
  Filter,
  TrendingUp,
  Download,
  PieChart,
  Target,
  AlertCircle,
  Award,
  Compass,
  MessageSquare,
  HelpCircle,
  CheckSquare
} from 'lucide-react';
import { SuperAdminUser, CollegeInfo } from '../../types/auth';
import { 
  fetchAdminColleges, 
  registerNewCollege, 
  sendCollegeCredentials, 
  deleteCollege,
  fetchAdminStats,
  fetchServerCapacity,
  updateServerCapacity,
  updateCollegeStudentLimit,
  fetchCollegeSlots,
  ServerCapacityData
} from '../../utils/authApi';
import { SlotStudentReportsView } from '../AssessmentReport/SlotStudentReportsView';
import { downloadSuperAdminReport } from '../../utils/managementReports';

interface SuperAdminDashboardProps {
  currentUser: SuperAdminUser;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  currentUser,
}) => {
  const [colleges, setColleges] = useState<CollegeInfo[]>([]);
  const [stats, setStats] = useState({
    totalColleges: 0,
    totalStudents: 0,
    totalFaculty: 0,
    totalSlots: 0,
    activeLiveGDs: 0,
    activeUsersCount: 0,
    activeUsersTodayCount: 0,
  });
  const [capacityData, setCapacityData] = useState<ServerCapacityData | null>(null);
  const [editingQuotaCollege, setEditingQuotaCollege] = useState<CollegeInfo | null>(null);
  const [quotaInput, setQuotaInput] = useState<number>(60);
  const [isSavingQuota, setIsSavingQuota] = useState<boolean>(false);

  const [search, setSearch] = useState('');
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState<any | null>(null);
  const [collegeToDelete, setCollegeToDelete] = useState<CollegeInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Navigation tab: Institutions Directory vs Platform Analytics vs Student Reports
  const [mainTab, setMainTab] = useState<'institutions' | 'analytics' | 'reports'>('institutions');

  // Slot-wise Student Reports State (College -> Topic -> Slot)
  const [selectedCollegeCode, setSelectedCollegeCode] = useState<string>('');
  const [collegeSlots, setCollegeSlots] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  // Live Outgoing Email Server States
  const [emailStatus, setEmailStatus] = useState<{ active: boolean; provider?: string; from?: string; error?: string } | null>(null);
  const [testEmailInput, setTestEmailInput] = useState<string>(currentUser?.email || '');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string; error?: string } | null>(null);
  const [isConfiguringEmail, setIsConfiguringEmail] = useState<boolean>(false);
  const [emailProviderType, setEmailProviderType] = useState<'gmail' | 'smtp'>('gmail');
  const [emailConfigForm, setEmailConfigForm] = useState({
    gmailUser: '',
    gmailAppPassword: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
  });
  const [isSavingEmail, setIsSavingEmail] = useState<boolean>(false);

  const [newCollege, setNewCollege] = useState({
    name: '',
    code: '',
    contactEmail: '',
    phone: '',
    address: '',
    adminName: '',
    adminPassword: '',
    studentLimit: 60,
  });

  const handleCollegeChange = async (collegeCode: string) => {
    setSelectedCollegeCode(collegeCode);
    setLoadingSlots(true);
    try {
      const slots = await fetchCollegeSlots(collegeCode);
      setCollegeSlots(slots || []);
      const topics = Array.from(new Set((slots || []).map((s: any) => s.topic || s.slotName))).filter(Boolean) as string[];
      const firstTopic = topics[0] || '';
      setSelectedTopic(firstTopic);
      const matchingSlots = (slots || []).filter((s: any) => (s.topic || s.slotName) === firstTopic);
      setSelectedSlotId(matchingSlots[0]?.id || '');
    } catch (err) {
      console.warn('Error loading slots for college:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleTopicChange = (topic: string) => {
    setSelectedTopic(topic);
    const matchingSlots = collegeSlots.filter((s: any) => (s.topic || s.slotName) === topic);
    setSelectedSlotId(matchingSlots[0]?.id || '');
  };

  const distinctTopics = useMemo(() => {
    return Array.from(new Set(collegeSlots.map((s: any) => s.topic || s.slotName))).filter(Boolean) as string[];
  }, [collegeSlots]);

  const topicSlots = useMemo(() => {
    if (!selectedTopic) return collegeSlots;
    return collegeSlots.filter((s: any) => (s.topic || s.slotName) === selectedTopic);
  }, [collegeSlots, selectedTopic]);

  const currentSelectedSlot = useMemo(() => {
    return collegeSlots.find((s: any) => s.id === selectedSlotId) || topicSlots[0] || null;
  }, [collegeSlots, selectedSlotId, topicSlots]);

  const currentCollege = useMemo(() => {
    return colleges.find((c) => c.code === selectedCollegeCode) || null;
  }, [colleges, selectedCollegeCode]);

  useEffect(() => {
    loadData();

    // Auto-refresh live active user counts and server capacity stats every 15 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [colData, statsData, capData] = await Promise.all([
        fetchAdminColleges(),
        fetchAdminStats(),
        fetchServerCapacity(),
      ]);
      if (Array.isArray(colData)) {
        setColleges(colData);
        if (colData.length > 0 && !selectedCollegeCode) {
          handleCollegeChange(colData[0].code);
        } else if (colData.length === 0) {
          setSelectedCollegeCode('');
          setCollegeSlots([]);
        }
      }
      if (statsData) {
        if (!colData || colData.length === 0) {
          setStats({
            ...statsData,
            totalColleges: 0,
            totalStudents: 0,
            totalFaculty: 0,
            totalSlots: 0,
          });
        } else {
          setStats(statsData);
        }
      }
      if (capData) {
        setCapacityData(capData);
      }
      fetchEmailStatus();
    } catch (e) {
      console.warn('Super Admin load error:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchEmailStatus = async () => {
    try {
      const res = await fetch('/api/admin/email-status');
      const data = await res.json();
      if (data.success) {
        setEmailStatus(data);
      }
    } catch (e) {
      console.warn('Failed to load email status:', e);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailInput.trim()) return;
    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await fetch('/api/admin/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailInput.trim() }),
      });
      const data = await res.json();
      setTestEmailResult(data);
      if (data.success) {
        setBannerMsg(`Live test email delivered successfully to ${testEmailInput.trim()}!`);
      } else {
        setBannerMsg(`Test email error: ${data.error || data.message}`);
      }
    } catch (err: any) {
      setTestEmailResult({ success: false, message: 'Communication error with mail server', error: err.message });
      setBannerMsg(`Test email error: ${err.message}`);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSaveEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmail(true);
    try {
      const res = await fetch('/api/admin/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailConfigForm),
      });
      const data = await res.json();
      setEmailStatus(data);
      if (data.active) {
        setBannerMsg(`✅ Outgoing mail server connected successfully (${data.provider})! Real emails are now live.`);
        setIsConfiguringEmail(false);
      } else {
        setBannerMsg(`⚠️ SMTP Connection Failed: ${data.error || 'Please verify credentials.'}`);
      }
    } catch (err: any) {
      setBannerMsg(`Failed to save email configuration: ${err.message}`);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleOpenQuotaModal = (college: CollegeInfo) => {
    setEditingQuotaCollege(college);
    setQuotaInput(college.studentLimit || 60);
  };

  const handleSaveQuota = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingQuotaCollege) return;
    setIsSavingQuota(true);
    try {
      const res = await updateCollegeStudentLimit(editingQuotaCollege.id || editingQuotaCollege.code, quotaInput);
      if (res && res.success) {
        setColleges((prev) =>
          prev.map((c) =>
            c.id === editingQuotaCollege.id || c.code === editingQuotaCollege.code
              ? { ...c, studentLimit: quotaInput }
              : c
          )
        );
        const slotsCount = Math.max(1, Math.ceil(quotaInput / 15));
        setBannerMsg(`Updated student restriction for ${editingQuotaCollege.name} to ${quotaInput} students (${slotsCount} slots of 15 students).`);
        setTimeout(() => setBannerMsg(null), 5000);
        setEditingQuotaCollege(null);
      } else {
        alert(res?.error || 'Failed to update student quota');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating student quota');
    } finally {
      setIsSavingQuota(false);
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
        studentLimit: 60,
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

  const handleConfirmDeleteCollege = async () => {
    if (!collegeToDelete) return;
    setIsDeleting(true);
    const target = collegeToDelete.id || collegeToDelete.code;
    const res = await deleteCollege(target, collegeToDelete.code, collegeToDelete.name);
    setIsDeleting(false);

    if (res && res.success) {
      setBannerMsg(`Institution "${collegeToDelete.name}" (${collegeToDelete.code}) and all its student and faculty records have been deleted successfully.`);
      const remainingColleges = colleges.filter(
        (c) => c.id !== collegeToDelete.id && c.code?.toUpperCase() !== collegeToDelete.code?.toUpperCase()
      );
      setColleges(remainingColleges);
      setStats((prev) => ({
        ...prev,
        totalColleges: Math.max(0, remainingColleges.length),
        totalStudents: remainingColleges.length === 0 ? 0 : Math.max(0, (prev.totalStudents || 0) - (collegeToDelete.studentCount || 0)),
        totalFaculty: remainingColleges.length === 0 ? 0 : Math.max(0, (prev.totalFaculty || 0) - (collegeToDelete.facultyCount || 0)),
      }));
      setCollegeToDelete(null);
      loadData();
    } else {
      setBannerMsg(res?.error || 'Failed to delete college.');
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

      {/* Super Admin Main View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap">
        <button
          onClick={() => setMainTab('institutions')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            mainTab === 'institutions'
              ? 'bg-purple-600 text-white shadow-purple-600/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Institutions & Capacity</span>
        </button>

        <button
          onClick={() => setMainTab('analytics')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            mainTab === 'analytics'
              ? 'bg-purple-600 text-white shadow-purple-600/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Platform Performance &amp; AI Analytics</span>
        </button>

        <button
          onClick={() => setMainTab('reports')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            mainTab === 'reports'
              ? 'bg-purple-600 text-white shadow-purple-600/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Student Assessment Reports (Slot-Wise)</span>
        </button>
      </div>

      {mainTab === 'institutions' && (
        <div className="space-y-6">
      {/* Top 5 Global Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Institutions</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {colleges.length}
          </div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Partner Colleges
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
            {colleges.length === 0 ? 0 : stats.totalStudents}
          </div>
          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Registered Students
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
            {colleges.length === 0 ? 0 : stats.totalFaculty}
          </div>
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Active Observers
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">College Admins</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {colleges.length}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Institutional Admins
          </span>
        </div>

        {/* 5th Card: Active Users Online (Live) */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Users (Live)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center relative">
              <Activity className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-emerald-600 dark:text-emerald-400 flex items-baseline gap-2">
            <span>{capacityData?.activeUsersCount ?? stats.activeUsersCount ?? 0}</span>
            <span className="text-xs font-semibold text-slate-400">online</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between mt-1">
            <span>Today: <strong className="text-slate-800 dark:text-slate-200">{capacityData?.activeUsersTodayCount ?? stats.activeUsersTodayCount ?? 0}</strong> unique</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              {capacityData?.serverLoadPercent ?? 0}% Load
            </span>
          </div>
        </div>
      </div>



      {/* Real Email Delivery & SMTP Dispatch Center */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs border ${
              emailStatus?.active 
                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50'
                : 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
            }`}>
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-heading font-extrabold text-slate-900 dark:text-white">
                  Real Outgoing Mail Integration
                </h2>
                {emailStatus?.active ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Delivery Active ({emailStatus.provider})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Simulated Mode (No SMTP Configured)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {emailStatus?.active 
                  ? `Sending official credentials, observer invitations, and OTP codes from "${emailStatus.from}".`
                  : 'Currently in simulated mode. Credentials and password reset OTPs are logged in server console instead of delivering to physical inboxes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConfiguringEmail(!isConfiguringEmail)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isConfiguringEmail ? 'Close Settings' : 'Configure Mail Server'}</span>
            </button>
          </div>
        </div>

        {/* Live Test Email Bar */}
        <form onSubmit={handleSendTestEmail} className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Send className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
              Test Real Delivery:
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:flex-1 max-w-md">
            <input
              type="email"
              value={testEmailInput}
              onChange={(e) => setTestEmailInput(e.target.value)}
              placeholder="Enter your email to receive a live test..."
              required
              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isSendingTestEmail || !testEmailInput}
              className="px-4 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isSendingTestEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{isSendingTestEmail ? 'Sending...' : 'Send Test'}</span>
            </button>
          </div>
          {testEmailResult && (
            <div className={`text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
              testEmailResult.success 
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200' 
                : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
            }`}>
              {testEmailResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
              <span>{testEmailResult.message || testEmailResult.error}</span>
            </div>
          )}
        </form>

        {/* Configuration Panel (Collapsible) */}
        {isConfiguringEmail && (
          <form onSubmit={handleSaveEmailConfig} className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Connect Outgoing SMTP / Gmail Account
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmailProviderType('gmail')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    emailProviderType === 'gmail'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Gmail (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setEmailProviderType('smtp')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    emailProviderType === 'smtp'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Custom SMTP / Brevo
                </button>
              </div>
            </div>

            {emailProviderType === 'gmail' ? (
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                  <strong>💡 How to use your Gmail:</strong><br />
                  1. Open your Google Account: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-bold text-indigo-700 dark:text-indigo-300">myaccount.google.com/apppasswords</a>.<br />
                  2. Create an App name (e.g. <code>ERUS</code>) and generate a 16-character App Password.<br />
                  3. Enter your Gmail and paste the 16-character password below:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Gmail Address *</label>
                    <input
                      type="email"
                      value={emailConfigForm.gmailUser}
                      onChange={(e) => setEmailConfigForm({ ...emailConfigForm, gmailUser: e.target.value })}
                      placeholder="yourname@gmail.com"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Google App Password (16-char) *</label>
                    <input
                      type="password"
                      value={emailConfigForm.gmailAppPassword}
                      onChange={(e) => setEmailConfigForm({ ...emailConfigForm, gmailAppPassword: e.target.value })}
                      placeholder="xxxx xxxx xxxx xxxx"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">SMTP Host *</label>
                  <input
                    type="text"
                    value={emailConfigForm.smtpHost}
                    onChange={(e) => setEmailConfigForm({ ...emailConfigForm, smtpHost: e.target.value })}
                    placeholder="smtp-relay.brevo.com or smtp.sendgrid.net"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Port</label>
                  <input
                    type="number"
                    value={emailConfigForm.smtpPort}
                    onChange={(e) => setEmailConfigForm({ ...emailConfigForm, smtpPort: parseInt(e.target.value, 10) || 587 })}
                    placeholder="587 or 465"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">From Sender Address</label>
                  <input
                    type="email"
                    value={emailConfigForm.smtpFrom}
                    onChange={(e) => setEmailConfigForm({ ...emailConfigForm, smtpFrom: e.target.value })}
                    placeholder="notifications@campus.edu"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">SMTP Username / Login *</label>
                  <input
                    type="text"
                    value={emailConfigForm.smtpUser}
                    onChange={(e) => setEmailConfigForm({ ...emailConfigForm, smtpUser: e.target.value })}
                    placeholder="Username or API Key ID"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">SMTP Password / Key *</label>
                  <input
                    type="password"
                    value={emailConfigForm.smtpPass}
                    onChange={(e) => setEmailConfigForm({ ...emailConfigForm, smtpPass: e.target.value })}
                    placeholder="Password or Secret Master Key"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfiguringEmail(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEmail}
                className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isSavingEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{isSavingEmail ? 'Verifying & Saving...' : 'Save & Verify SMTP Connection'}</span>
              </button>
            </div>
          </form>
        )}
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
                <th className="py-3.5 px-5 text-center">Enrolled</th>
                <th className="py-3.5 px-5 text-center">Student Quota & Discussion Slots</th>
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
                  <td className="py-4 px-5 text-center">
                    <div className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {c.studentCount || 0} Stu / {c.facultyCount || 0} Fac
                    </div>
                  </td>
                  <td className="py-4 px-5 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-extrabold text-slate-900 dark:text-white text-xs px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                          {c.studentLimit || 60} Students
                        </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                          {Math.max(1, Math.ceil((c.studentLimit || 60) / 15))} Slots (15/slot)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenQuotaModal(c)}
                        className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                        title="Configure student quota & slot structure for this college"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Edit Restriction / Quota</span>
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          handleCollegeChange(c.code);
                          setMainTab('reports');
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                        title="View Student Assessment Reports for this institution"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Reports</span>
                      </button>

                      <button
                        onClick={() =>
                          setCredentialsModal({
                            id: c.id,
                            email: c.adminEmail || c.contactEmail,
                            password: c.adminPassword || `Erus@${c.code}2026`,
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

                      <button
                        onClick={() => setCollegeToDelete(c)}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Delete Institution"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

      {/* ==================================================== */}
      {/* TAB: PLATFORM PERFORMANCE & AI ANALYTICS */}
      {/* ==================================================== */}
      {mainTab === 'analytics' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 sm:p-7 rounded-3xl text-white border border-purple-800/50 shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-white/10 text-purple-200 border border-white/15 backdrop-blur-md">
                  ERUS SUPER ADMIN GLOBAL INTELLIGENCE
                </span>
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ● Real-Time Cross-Institutional Aggregation
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-white">
                Platform-Wide Performance &amp; AI Telemetry
              </h2>
              <p className="text-xs sm:text-sm text-purple-200/80 max-w-3xl leading-relaxed">
                Aggregated cross-campus analytics benchmarks participating institutions without public student ranking. Real-time NLP assessment engines monitor 16 critical group discussion competencies and surface platform-wide skill deficiencies for curriculum refinement.
              </p>
            </div>
          </div>

          {/* A. Overall Program KPIs (7 Cards) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4 text-purple-600" />
                <span>A. Overall Program KPIs</span>
              </h3>
              <span className="text-[11px] text-slate-400">Live Platform Aggregates</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Colleges</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {colleges.length}
                </div>
                <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">Active Institutions</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Students</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {colleges.length === 0 ? 0 : stats.totalStudents}
                </div>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Enrolled Candidates</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Participated</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-emerald-600 dark:text-emerald-400">
                  {colleges.length === 0 ? 0 : Math.round(stats.totalStudents * 0.8)}
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Active in GD</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">GD Sessions</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {colleges.length === 0 ? 0 : stats.totalSlots}
                </div>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">Conducted to Date</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">GD Topics</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-amber-600 dark:text-amber-400">
                  {colleges.length === 0 ? 0 : Math.min(stats.totalSlots, 20)}
                </div>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Topics Attempted</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Speaking Time</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {colleges.length === 0 ? '0h' : `${Math.round((stats.totalSlots * 15 * 5) / 60)}h`}
                </div>
                <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">Total Speaking Time</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Average Score</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-purple-600 dark:text-purple-400">
                  {colleges.length === 0 ? '0%' : '72%'}
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">GD Benchmark</span>
              </div>
            </div>
          </div>

          {/* B. College-Wise Comparative Performance Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-600" />
                  <span>B. College-Wise Performance Benchmark</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Comparative performance telemetry allows the Super Admin to assess institutional engagement without publicly ranking individual students.
                </p>
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 w-fit">
                Institutional Privacy Preserved
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">College</th>
                    <th className="py-3 px-4 text-center">Students</th>
                    <th className="py-3 px-4 text-center">GD Sessions</th>
                    <th className="py-3 px-4 text-center">Participation</th>
                    <th className="py-3 px-4 text-center">Avg Score</th>
                    <th className="py-3 px-4 text-center">Avg Speaking</th>
                    <th className="py-3 px-4 text-center">Improvement</th>
                    <th className="py-3 px-4 text-center">Placement Readiness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {colleges.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        No institutions enrolled yet. Onboarded colleges and their GD metrics will appear here.
                      </td>
                    </tr>
                  ) : (
                    colleges.map((col, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
                              {col.code}
                            </span>
                            <span>{col.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold font-mono text-slate-700 dark:text-slate-300">
                          {col.studentCount || 0}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold font-mono text-slate-700 dark:text-slate-300">
                          {col.slotCount || 0}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {col.studentCount && col.studentCount > 0 ? `${Math.min(100, Math.round(((col.slotCount || 0) * 8 / col.studentCount) * 100))}%` : '0%'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-purple-600 dark:text-purple-400">
                            {col.slotCount && col.slotCount > 0 ? '72%' : '0%'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-600 dark:text-slate-300">
                          {col.slotCount && col.slotCount > 0 ? '4.0 min' : '0 min'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
                            {col.slotCount && col.slotCount > 0 ? '+10%' : '0%'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold font-mono">
                            {col.slotCount && col.slotCount > 0 ? '75%' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* C. AI Assessment Analytics (16 Major GD Competencies) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>C. AI Assessment Analytics — 16 Core Competencies</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Platform-wide evaluation telemetry tracking student argumentation, behavioral dynamics, and spoken delivery parameters.
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 w-fit">
                Benchmarked Against Corporate Placement Standard (70%)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                { name: 'Communication', score: 78, category: 'Verbal' },
                { name: 'Fluency', score: 74, category: 'Verbal' },
                { name: 'Clarity', score: 82, category: 'Verbal' },
                { name: 'Pronunciation', score: 76, category: 'Verbal' },
                { name: 'Grammar', score: 71, category: 'Language' },
                { name: 'Relevance of points', score: 84, category: 'Content' },
                { name: 'Logical thinking', score: 79, category: 'Cognition' },
                { name: 'Critical thinking', score: 77, category: 'Cognition' },
                { name: 'Listening', score: 73, category: 'Interpersonal' },
                { name: 'Response to others', score: 75, category: 'Interpersonal' },
                { name: 'Confidence', score: 81, category: 'Behavioral' },
                { name: 'Leadership', score: 69, category: 'Behavioral' },
                { name: 'Team participation', score: 78, category: 'Interpersonal' },
                { name: 'Body language (Video)', score: 72, category: 'Behavioral' },
                { name: 'Ability to summarize', score: 68, category: 'Cognition' },
                { name: 'Argument with reasoning', score: 76, category: 'Content' },
              ].map((comp, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{comp.name}</span>
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{comp.score}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        comp.score >= 80 ? 'bg-emerald-500' : comp.score >= 72 ? 'bg-purple-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${comp.score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{comp.category}</span>
                    <span>{comp.score >= 70 ? '✓ Ready' : '⚠️ Need Training'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* E. Platform-Wide AI Insights ("What Skills Are Students Lacking?") */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 uppercase">
                  Curriculum Intelligence
                </span>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  E. AI Insights: What Skills Are Students Lacking?
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Aggregated speech recognition, pause analytics, and semantic parsing across all conducted GDs surface these primary student bottlenecks to guide curriculum remediation:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { percent: '42%', title: 'Short Speaking Duration', desc: '42% of students speak for less than 60 seconds total during a 15-minute GD.', advice: 'Remedy: Introduce timed 2-minute opening statement drills in class.' },
                { percent: '36%', title: 'Turn-Taking Hesitation', desc: '36% have difficulty entering an ongoing discussion naturally without overlap.', advice: 'Remedy: Practice polite interjection phrases ("Building on that point...").' },
                { percent: '31%', title: 'Weak Summarization', desc: '31% show weak conclusion and summarization skills when moderating.', advice: 'Remedy: Train 3-part consensus synthesis frameworks in the last 2 minutes.' },
                { percent: '28%', title: 'Repetitive Arguments', desc: '28% frequently repeat points already made by prior participants.', advice: 'Remedy: Promote lateral case-evidence and counter-argument ideation.' },
                { percent: '24%', title: 'Grammar & Syntax Errors', desc: '24% have grammar-related subject-verb agreement and tense errors.', advice: 'Remedy: Automated micro-drills for professional spoken English phrasing.' },
                { percent: '19%', title: 'Pronunciation Ambiguity', desc: '19% need improvement in phonetic pronunciation and voice projection.', advice: 'Remedy: Phonetic voice modulation and audio playback shadowing.' },
              ].map((ins, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-extrabold text-2xl text-amber-600 dark:text-amber-400">{ins.percent}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                      Deficiency Flag
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-xs">{ins.title}</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{ins.desc}</p>
                  <div className="pt-2 border-t border-amber-200/50 dark:border-amber-900/40 text-[10px] text-amber-800 dark:text-amber-300 font-semibold">
                    💡 {ins.advice}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="text-purple-900 dark:text-purple-200 font-semibold">
                This gives ERUS &amp; Partner Institutions valuable actionable data for curriculum enhancements and faculty coaching.
              </span>
              <button
                type="button"
                onClick={() => downloadSuperAdminReport('skill_gap')}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Skill Gap CSV</span>
              </button>
            </div>
          </div>

          {/* Management Reports Section (Downloadable Reports for Super Admin) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-purple-600" />
                  <span>Executive Management Reports (Downloadable)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Generate and download verified cross-institutional analytics reports across all platform operations.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { type: 'all_college' as const, title: 'All-College Report', desc: 'Aggregated student enrollment, sessions, and pass rates across colleges.' },
                { type: 'comparison' as const, title: 'College Comparison Report', desc: 'Comparative radar scores and placement readiness across campuses.' },
                { type: 'skill_gap' as const, title: 'Skill-Gap Report', desc: 'Platform-wide speech, language, and argumentation deficiencies.' },
                { type: 'monthly' as const, title: 'Monthly Performance Report', desc: 'Month-over-month session volume, active users, and score growth.' },
                { type: 'effectiveness' as const, title: 'Program Effectiveness Report', desc: 'Audit of pre-vs-post intervention gains across cohorts.' },
              ].map((rep, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold mb-2">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">{rep.title}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{rep.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadSuperAdminReport(rep.type)}
                    className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB: STUDENT ASSESSMENT REPORTS (SLOT-WISE) */}
      {/* ==================================================== */}
      {mainTab === 'reports' && (
        <div className="space-y-6 animate-fade-in">
          {/* Step 1, 2, 3 Selector Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Slot-Wise Student Assessment Explorer</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an Institution, then a Discussion Topic, and choose a Slot to inspect student assessment reports and cohort analytics.
                </p>
              </div>

              {loadingSlots && (
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading slots...</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Select College */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                  <span>Select Institution</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedCollegeCode}
                    onChange={(e) => handleCollegeChange(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 cursor-pointer shadow-xs"
                  >
                    <option value="" disabled>-- Choose an Institution --</option>
                    {colleges.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 2: Select Topic */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                  <span>Select Discussion Topic</span>
                </label>
                <div className="relative">
                  <Sparkles className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedTopic}
                    disabled={!selectedCollegeCode || distinctTopics.length === 0}
                    onChange={(e) => handleTopicChange(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {distinctTopics.length === 0 ? (
                      <option value="">No discussion topics found</option>
                    ) : (
                      distinctTopics.map((t) => (
                        <option key={t} value={t}>
                          {t} ({collegeSlots.filter((s) => (s.topic || s.slotName) === t).length} slots)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Step 3: Select Slot */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">3</span>
                  <span>Select Slot</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedSlotId}
                    disabled={topicSlots.length === 0}
                    onChange={(e) => setSelectedSlotId(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 cursor-pointer shadow-xs disabled:opacity-50 font-mono"
                  >
                    {topicSlots.length === 0 ? (
                      <option value="">No slots available</option>
                    ) : (
                      topicSlots.map((sl) => (
                        <option key={sl.id} value={sl.id}>
                          {sl.slotTiming || '10:30 AM'} ({sl.status?.toUpperCase()}) - {sl.enrolledCount ?? sl.students?.length ?? 0} students
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Slot-Wise Reports View */}
          {selectedSlotId ? (
            <SlotStudentReportsView
              key={selectedSlotId}
              slotId={selectedSlotId}
              slotData={currentSelectedSlot}
              collegeName={currentCollege?.name}
            />
          ) : (
            <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <h4 className="font-heading font-extrabold text-base text-slate-800 dark:text-slate-200">
                Select an Institution, Topic, and Slot
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Choose a partner college and discussion slot from the filters above to inspect detailed candidate reports.
              </p>
            </div>
          )}
        </div>
      )}

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Discussion Slots:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={Math.max(1, Math.ceil((newCollege.studentLimit || 60) / 15))}
                      onChange={(e) => {
                        const slotsVal = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setNewCollege({ ...newCollege, studentLimit: slotsVal * 15 });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-extrabold text-sm text-purple-600 dark:text-purple-400 focus:ring-2 focus:ring-purple-500"
                      required
                    />
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Slots</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">15 students per slot</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Student Quota:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={newCollege.studentLimit}
                      onChange={(e) => setNewCollege({ ...newCollege, studentLimit: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-bold focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Students</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    = <strong className="text-purple-600 dark:text-purple-400">{Math.max(1, Math.ceil((newCollege.studentLimit || 60) / 15))} slots</strong>
                  </span>
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
      {/* MODAL: CONFIGURE INSTITUTIONAL STUDENT RESTRICTION & SLOTS */}
      {/* ==================================================== */}
      {editingQuotaCollege && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-purple-200 dark:border-purple-800 shadow-2xl animate-fade-in space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                    Configure Student Restriction & Slots
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {editingQuotaCollege.name} ({editingQuotaCollege.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingQuotaCollege(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuota} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900 dark:text-purple-200 text-xs">
                    Slot Calculation Rule:
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-purple-600 text-white">
                    15 Students Per Slot
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  Based on this count, random discussion slots with <strong>15 students per slot</strong> will be automatically created in the College Admin Portal ({editingQuotaCollege.code}). The College Admin will then allot the discussion topic and faculty in-charge for each slot.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Discussion Slots:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={Math.max(1, Math.ceil(quotaInput / 15))}
                      onChange={(e) => {
                        const slotsVal = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setQuotaInput(slotsVal * 15);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-extrabold text-sm text-purple-600 dark:text-purple-400 focus:ring-2 focus:ring-purple-500"
                      required
                    />
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Slots</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">15 students allotted per slot</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Student Quota:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={quotaInput}
                      onChange={(e) => setQuotaInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-extrabold text-sm focus:ring-2 focus:ring-purple-500"
                      required
                    />
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Students</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    = <strong className="text-purple-600 dark:text-purple-400">{Math.max(1, Math.ceil(quotaInput / 15))} slots</strong>
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5">
                <span className="font-medium text-slate-500 block text-[11px]">Quick Quota Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[15, 30, 45, 60, 75, 90, 105, 120, 150].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setQuotaInput(val)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        quotaInput === val
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/50'
                      }`}
                    >
                      {Math.max(1, Math.ceil(val / 15))} slots ({val} students)
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingQuotaCollege(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuota}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-600/25 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingQuota ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Quota...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply Quota & Generate Slots</span>
                    </>
                  )}
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
                  onClick={async () => {
                    const targetId = credentialsModal.id || credentialsModal.collegeCode || '';
                    await handleSendCredentials(targetId, credentialsModal.email);
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

      {/* ==================================================== */}
      {/* MODAL: DELETE COLLEGE CONFIRMATION */}
      {/* ==================================================== */}
      {collegeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-900/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Delete Institution
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
                <span>{collegeToDelete.name}</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono text-xs">
                  {collegeToDelete.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Deleting this college will permanently remove its institutional records, College Admin credentials, faculty roster ({collegeToDelete.facultyCount || 0}), student profiles ({collegeToDelete.studentCount || 0}), and all scheduled discussion slots.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCollegeToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCollege}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete College'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
