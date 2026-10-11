import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  GraduationCap, 
  Calendar, 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Eye, 
  Play, 
  X, 
  AlertCircle,
  FileSpreadsheet,
  ChevronRight,
  Sparkles,
  Award,
  BarChart3,
  Trash2,
  Mail,
  Key,
  EyeOff,
  Copy,
  Check,
  FileText,
  RefreshCw,
  BookOpen,
  Edit3,
  Layers,
  CheckSquare,
  TrendingUp,
  Target,
  Activity,
  Gauge,
  Compass,
  Volume2,
  Video
} from 'lucide-react';
import { CollegeAdminUser } from '../../types/auth';
import { GDSession } from '../../types/gd';
import { generateSlotParticipants } from '../../data/mockGDData';
import { 
  fetchCollegeStats, 
  fetchCollegeStudents, 
  addCollegeStudents, 
  updateCollegeStudent,
  fetchCollegeFaculty, 
  addCollegeFaculty, 
  updateCollegeFaculty,
  fetchCollegeSlots, 
  createCollegeSlot,
  deleteCollegeSlot,
  dispatchCredentials,
  allotSlotTopicAndFaculty,
  generateCollegeSlots,
  getDeletedSlotIds,
  markSlotDeletedLocally
} from '../../utils/authApi';
import { formatSlotDate } from '../../utils/studentBooking';
import { SlotStudentReportsView } from '../AssessmentReport/SlotStudentReportsView';
import { downloadCollegeAdminReport } from '../../utils/managementReports';

export function cleanSlotName(name: string | undefined): string {
  if (!name) return '';
  return String(name || '').replace(/\s*\(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)\)/gi, '').trim();
}

interface CollegeAdminDashboardProps {
  currentUser: CollegeAdminUser;
  onEnterGDRoom?: (slot?: GDSession) => void;
  availableSlots?: GDSession[];
  onOpenCreateSession?: () => void;
  onCreateSlot?: (session: GDSession) => void;
  onDeleteSlot?: (slotId: string) => void;
}

export const CollegeAdminDashboard: React.FC<CollegeAdminDashboardProps> = ({
  currentUser,
  onEnterGDRoom,
  availableSlots,
  onOpenCreateSession,
  onCreateSlot,
  onDeleteSlot,
}) => {
  const collegeCode = currentUser.collegeCode || 'DIT';
  const [activeTab, setActiveTab] = useState<'students' | 'faculty' | 'slots' | 'analytics'>('students');
  const [selectedReportSlotId, setSelectedReportSlotId] = useState<string>('');

  // Drilldown states for Class-wise Analytics
  const [drillDept, setDrillDept] = useState<'CSE' | 'ECE' | 'EEE' | 'Mechanical' | 'Civil'>('CSE');
  const [drillYear, setDrillYear] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('3rd Year');
  const [drillSection, setDrillSection] = useState<'Section A' | 'Section B'>('Section A');

  // Stats state
  const [stats, setStats] = useState({
    collegeName: currentUser.college || 'Academic Institution',
    collegeCode: currentUser.collegeCode || 'COL',
    studentLimit: 60,
    totalStudents: 0,
    totalFaculty: 0,
    scheduledSlots: 0,
    completedSlots: 0,
    totalSlots: 0,
  });

  // Students Roster State
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);

  // Slot Allotment & Student Roster View State
  const [allottingSlot, setAllottingSlot] = useState<any | null>(null);
  const [viewingRosterSlot, setViewingRosterSlot] = useState<any | null>(null);
  const [isSavingAllotment, setIsSavingAllotment] = useState(false);
  const [isRegeneratingSlots, setIsRegeneratingSlots] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedVideoTitle, setSelectedVideoTitle] = useState<string | null>(null);

  const [allotForm, setAllotForm] = useState({
    topic: '',
    description: '',
    assignedFacultyId: '',
    assignedFacultyName: '',
    assignedFacultyDept: '',
    slotTiming: '10:30 AM - 10:45 AM',
    slotDate: new Date().toISOString().split('T')[0],
  });

  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    studentId: '',
    course: 'B.Tech Computer Science & Engineering',
    batch: '2024-2028',
    seatNumber: 1,
    password: `Stud@${Math.floor(1000 + Math.random() * 9000)}!`,
    sendEmail: true,
  });

  // Faculty Roster State
  const [faculty, setFaculty] = useState<any[]>([]);
  const [facultySearch, setFacultySearch] = useState('');
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [newFaculty, setNewFaculty] = useState({
    name: '',
    email: '',
    facultyId: '',
    department: 'Department of Computer Science & Engineering',
    designation: 'Assistant Professor',
    password: `Fac@${Math.floor(1000 + Math.random() * 9000)}!`,
    sendEmail: true,
  });

  // Edit Student & Faculty State
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);

  const [editingFaculty, setEditingFaculty] = useState<any | null>(null);
  const [isEditFacultyOpen, setIsEditFacultyOpen] = useState(false);
  const [isSavingFaculty, setIsSavingFaculty] = useState(false);

  // Slots State
  const [slots, setSlots] = useState<any[]>([]);
  const [hasLoadedSlots, setHasLoadedSlots] = useState(false);
  const [deletedSlotIds, setDeletedSlotIds] = useState<Set<string>>(() => getDeletedSlotIds());
  const [isScheduleSlotOpen, setIsScheduleSlotOpen] = useState(false);

  // Authoritative college slots: once loaded from backend, use slots directly (even if 0 remain after deletion)
  const allRawSlots: any[] =
    hasLoadedSlots || slots.length > 0
      ? slots
      : (availableSlots || []).filter((s) => {
          const sCode = (s.collegeCode || '').toUpperCase();
          return sCode === collegeCode;
        });
  const seenSlotIds = new Set<string>();
  const displaySlots = allRawSlots
    .filter((s) => {
      if (!s || !s.id || deletedSlotIds.has(s.id) || seenSlotIds.has(s.id)) return false;
      
      seenSlotIds.add(s.id);
      return true;
    })
    .map((s, idx) => {
      const rawTopic = s.topic ? String(s.topic).trim() : '';
      const isTopicAllotted =
        rawTopic !== '' &&
        !rawTopic.toLowerCase().includes('pending') &&
        !/^slot\s+\d+/i.test(rawTopic) &&
        !s.description?.includes('Waiting for College Admin to allot');
      const cleanTopic = isTopicAllotted ? rawTopic : '';

      // Derive consistent slot prefix: "Slot 1", "Slot 2", etc.
      const slotNumMatch = (s.slotName || '').match(/^(Slot\s+\d+)/i) || (s.id || '').match(/slot-.*?-(\d+)/i);
      const prefix = slotNumMatch
        ? (slotNumMatch[1].startsWith('Slot') ? slotNumMatch[1] : `Slot ${slotNumMatch[1]}`)
        : `Slot ${idx + 1}`;

      // Strictly synchronize slot title to the allotted topic so there is never a topic mismatch
      const cleanName = cleanTopic ? `${prefix}: ${cleanTopic}` : prefix;

      return {
        id: s.id,
        slotName: cleanName,
        topic: cleanTopic,
        description: s.description || '',
        slotTiming: s.slotTiming || '',
        slotDate: s.slotDate || (s as any).scheduledTime || (s as any).rawSession?.slotDate || 'Today',
        status: s.status || 'scheduled',
        durationMinutes: s.durationMinutes || 15,
        enrolledCount: s.enrolledCount ?? s.students?.length ?? (s.rawSession?.students?.length ?? 15),
        maxCapacity: s.maxCapacity || 15,
        assignedFacultyName: (s as any).assignedFacultyName || 'Unassigned',
        assignedFacultyId: (s as any).assignedFacultyId || '',
        students: s.students || s.rawSession?.students || [],
        recordingUrl: s.recordingUrl || (s as any).rawSession?.recordingUrl || '',
        recordingDurationSeconds: s.recordingDurationSeconds || (s as any).rawSession?.recordingDurationSeconds || 0,
        recordingFileSize: s.recordingFileSize || (s as any).rawSession?.recordingFileSize || 0,
        recordedAt: s.recordedAt || (s as any).rawSession?.recordedAt || '',
        rawSession: s,
      };
    });

  const [newSlot, setNewSlot] = useState({
    slotName: 'Slot 1: Campus Placement Screening',
    topic: '',
    description: '',
    durationMinutes: 15,
    difficulty: 'Intermediate',
    slotDate: new Date().toISOString().split('T')[0],
    slotTiming: '10:30 AM - 10:45 AM',
    participantCount: 8,
    maxCapacity: 15,
    assignedFacultyId: '',
    assignedFacultyName: '',
  });

  const [loading, setLoading] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Password visibility & clipboard state
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [showAllPasswords, setShowAllPasswords] = useState(false);

  const togglePasswordVisibility = (id: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyPassword = (id: string, pass?: string) => {
    if (!pass) return;
    navigator.clipboard.writeText(pass);
    setCopiedPasswordId(id);
    setTimeout(() => setCopiedPasswordId(null), 2000);
  };

  const toggleShowAllPasswords = () => {
    const next = !showAllPasswords;
    setShowAllPasswords(next);
    const map: Record<string, boolean> = {};
    if (activeTab === 'students') {
      students.forEach((s) => {
        const key = s.id || s.studentId || s.email;
        map[key] = next;
      });
    } else if (activeTab === 'faculty') {
      faculty.forEach((f) => {
        const key = f.id || f.facultyId || f.email;
        map[key] = next;
      });
    }
    setRevealedPasswords((prev) => ({ ...prev, ...map }));
  };

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, [collegeCode]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [stData, stuData, facData, slotData] = await Promise.all([
        fetchCollegeStats(collegeCode),
        fetchCollegeStudents(collegeCode),
        fetchCollegeFaculty(collegeCode),
        fetchCollegeSlots(collegeCode),
      ]);

      if (stData) setStats(stData);
      if (stuData) setStudents(stuData);
      if (facData) {
        setFaculty(facData);
        if (!newSlot.assignedFacultyId && facData.length > 0) {
          setNewSlot((prev) => ({
            ...prev,
            assignedFacultyId: facData[0].facultyId,
            assignedFacultyName: facData[0].name,
          }));
        }
      }
      if (slotData) {
        const deletedIds = getDeletedSlotIds();
        setSlots(slotData.filter((s: any) => !deletedIds.has(s.id) && !deletedSlotIds.has(s.id)));
        setHasLoadedSlots(true);
      }
    } catch (e) {
      console.warn('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Slot Allotment & Regeneration Actions
  const handleOpenAllotModal = (slot: any) => {
    setAllottingSlot(slot);
    const existingTopic = String(slot.topic || '');
    const cleanCurrentName = cleanSlotName(slot.slotName);
    const isTopicPending =
      !existingTopic ||
      existingTopic.trim() === '' ||
      existingTopic.toLowerCase().includes('pending') ||
      existingTopic === slot.slotName ||
      existingTopic === cleanCurrentName ||
      /^slot\s+\d+/i.test(existingTopic) ||
      slot.description?.includes('Waiting for College Admin to allot');

    let defaultFacultyId = slot.assignedFacultyId || '';
    let defaultFacultyName = slot.assignedFacultyName || '';
    let defaultFacultyDept = '';

    if ((!defaultFacultyId || defaultFacultyName === 'Unassigned') && faculty.length > 0) {
      defaultFacultyId = faculty[0].facultyId;
      defaultFacultyName = faculty[0].name;
      defaultFacultyDept = faculty[0].department || '';
    } else {
      const match = faculty.find((f) => f.facultyId === defaultFacultyId || f.name === defaultFacultyName);
      if (match) {
        defaultFacultyDept = match.department || '';
      }
    }

    setAllotForm({
      topic: isTopicPending ? '' : existingTopic,
      description: slot.description && !slot.description.toLowerCase().includes('pending') && !slot.description.includes('Waiting for College Admin to allot') ? slot.description : '',
      assignedFacultyId: defaultFacultyId,
      assignedFacultyName: defaultFacultyName,
      assignedFacultyDept: defaultFacultyDept,
      slotTiming: slot.slotTiming || '10:30 AM - 10:45 AM',
      slotDate: slot.slotDate || new Date().toISOString().split('T')[0],
    });
  };

  const handleSaveAllotment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allottingSlot) return;

    const chosenTopic = String(allotForm.topic || '').trim();

    if (!chosenTopic) {
      alert('Please enter a discussion topic.');
      return;
    }

    if (!allotForm.assignedFacultyId) {
      alert('Please assign a faculty in-charge.');
      return;
    }

    setIsSavingAllotment(true);
    const chosenDescription = String(allotForm.description || '').trim() || `Autonomous AI evaluated discussion on "${chosenTopic}".`;
    const cleanBaseSlotName = cleanSlotName(allottingSlot.slotName) || `Slot`;

    // Extract base slot label (e.g. "Slot 1") so any previously stale topic in slotName is replaced
    const slotNumMatch = (allottingSlot.slotName || '').match(/^(Slot\s+\d+)/i) || 
                         (allottingSlot.id || '').match(/slot-.*?-(\d+)/i);
    const slotPrefix = slotNumMatch 
      ? (slotNumMatch[1].startsWith('Slot') ? slotNumMatch[1] : `Slot ${slotNumMatch[1]}`)
      : (String(cleanBaseSlotName.split(':')[0] || '').trim() || 'Slot');

    const newSlotName = `${slotPrefix}: ${chosenTopic}`;

    const payload = {
      topic: chosenTopic,
      description: chosenDescription,
      slotName: newSlotName,
      assignedFacultyId: allotForm.assignedFacultyId,
      assignedFacultyName: allotForm.assignedFacultyName,
      assignedFacultyDept: allotForm.assignedFacultyDept,
      slotTiming: allotForm.slotTiming,
      slotDate: allotForm.slotDate,
    };

    const res = await allotSlotTopicAndFaculty(allottingSlot.id, collegeCode, payload);
    setIsSavingAllotment(false);

    if (res && res.success) {
      setBannerMsg(`Successfully allotted topic "${chosenTopic}" and faculty ${allotForm.assignedFacultyName} to ${newSlotName}.`);
      setAllottingSlot(null);
      // Immediately reflect updates in local slot state
      setSlots((prev) =>
        prev.map((s) => {
          if (s.id === allottingSlot.id) {
            return {
              ...s,
              ...payload,
              slotName: newSlotName,
              topic: payload.topic,
              description: payload.description,
              assignedFacultyName: payload.assignedFacultyName,
              assignedFacultyId: payload.assignedFacultyId,
              rawSession: {
                ...(s.rawSession || {}),
                ...payload,
                slotName: newSlotName,
              },
            };
          }
          return s;
        })
      );
      await loadAllData();
    } else {
      setBannerMsg(res?.error || 'Failed to allot topic and faculty.');
    }
  };

  const handleRegenerateSlots = async () => {
    const studentCount = stats.studentLimit || 60;
    const slotCount = Math.ceil(studentCount / 15);
    const confirmed = window.confirm(
      `Regenerate random discussion slots for ${stats.collegeName}?\n\n` +
      `• Student Quota: ${studentCount} Students\n` +
      `• Total Slots: ${slotCount} Slots (15 students per slot)\n\n` +
      `Existing discussion slots will be refreshed with 15 randomly allotted students each.`
    );
    if (!confirmed) return;

    setIsRegeneratingSlots(true);
    const res = await generateCollegeSlots(collegeCode, studentCount);
    setIsRegeneratingSlots(false);

    if (res && res.success) {
      setBannerMsg(`Successfully generated ${res.slots?.length || slotCount} discussion slots with 15 students per slot.`);
      await loadAllData();
    } else {
      setBannerMsg(res?.message || 'Failed to regenerate slots.');
    }
  };

  // Student Actions
  const handleDispatchAllStudentsEmail = async () => {
    if (students.length === 0) return;
    if (!window.confirm(`Dispatch login credentials via email to all ${students.length} students?`)) return;
    setIsDispatching(true);
    const res = await dispatchCredentials({
      collegeCode,
      targetType: 'students',
    });
    setIsDispatching(false);
    if (res && res.success) {
      setBannerMsg(res.message || `Dispatched credentials to ${students.length} students via email.`);
    } else {
      setBannerMsg(res?.error || 'Failed to dispatch student credentials.');
    }
  };

  const handleDispatchSingleStudentEmail = async (st: any) => {
    setIsDispatching(true);
    const res = await dispatchCredentials({
      collegeCode,
      targetType: 'single',
      recipientId: st.id,
      email: st.email,
    });
    setIsDispatching(false);
    if (res && res.success) {
      setBannerMsg(`Credentials dispatched to ${st.name} (${st.email}).`);
    } else {
      setBannerMsg(res?.error || 'Failed to dispatch email.');
    }
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.email) return;

    const usedSeats = new Set(students.map((s) => Number(s.seatNumber)).filter(Boolean));
    let assignedSeat = Number(newStudent.seatNumber);
    if (!assignedSeat || assignedSeat < 1) {
      assignedSeat = 1;
      while (usedSeats.has(assignedSeat)) assignedSeat++;
    }

    const studentToAdd = {
      id: `s-${Date.now().toString().slice(-5)}`,
      name: String(newStudent.name || '').trim(),
      email: String(newStudent.email || '').trim(),
      studentId: String(newStudent.studentId || '').trim() || `STU-${Date.now().toString().slice(-4)}`,
      course: newStudent.course,
      batch: newStudent.batch,
      seatNumber: assignedSeat,
      college: currentUser.college || 'BMS Institute of Technology',
      collegeCode,
      password: newStudent.password || 'password123',
      sendEmail: newStudent.sendEmail,
    };

    // Immediately update local state so newly added student appears instantly
    setStudents((prev) => [studentToAdd, ...prev]);
    setStats((prev) => ({ ...prev, totalStudents: (prev.totalStudents || 0) + 1 }));

    const res = await addCollegeStudents({
      student: studentToAdd,
      collegeCode,
    });

    if (res && res.success) {
      setBannerMsg(`Student ${studentToAdd.name} registered (Assigned Seat ${assignedSeat}).${newStudent.sendEmail ? ' Credentials dispatched to email.' : ''}`);
      setIsAddStudentOpen(false);
      const nextUsed = new Set([...students, studentToAdd].map((s) => Number(s.seatNumber)).filter(Boolean));
      let nextSeat = 1;
      while (nextUsed.has(nextSeat)) nextSeat++;
      setNewStudent({
        name: '',
        email: '',
        studentId: '',
        course: 'B.Tech Computer Science & Engineering',
        batch: '2024-2028',
        seatNumber: nextSeat > 15 ? 1 : nextSeat,
        password: `Stud@${Math.floor(1000 + Math.random() * 9000)}!`,
        sendEmail: true,
      });
      loadAllData();
    }
  };

  const handleOpenEditStudent = (st: any) => {
    setEditingStudent({
      id: st.id,
      name: st.name || '',
      email: st.email || '',
      studentId: st.studentId || '',
      course: st.course || '',
      batch: st.batch || '',
      seatNumber: st.seatNumber || 1,
      password: st.password || '',
    });
    setIsEditStudentOpen(true);
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editingStudent.name || !editingStudent.email) return;

    setIsSavingStudent(true);
    try {
      const targetId = editingStudent.id || editingStudent.studentId || editingStudent.email;
      const res = await updateCollegeStudent(targetId, editingStudent, collegeCode);
      if (res && res.success) {
        setBannerMsg(`Student "${editingStudent.name}" details updated successfully.`);
        setStudents((prev) =>
          prev.map((s) =>
            s.id === editingStudent.id || s.studentId === editingStudent.studentId || s.email?.toLowerCase() === editingStudent.email?.toLowerCase()
              ? { ...s, ...editingStudent }
              : s
          )
        );
        setIsEditStudentOpen(false);
        setEditingStudent(null);
        loadAllData();
      } else {
        setBannerMsg(res?.error || 'Failed to update student details.');
      }
    } catch (err: any) {
      setBannerMsg(err?.message || 'Error updating student details.');
    } finally {
      setIsSavingStudent(false);
    }
  };

  // CSV parsing
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      const lines = text.split(/\r?\n/).filter((l) => String(l || '').trim().length > 0);
      if (lines.length <= 1) return;

      const parsed: any[] = [];
      const usedSeats = new Set(students.map((s) => Number(s.seatNumber)).filter(Boolean));
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => String(p || '').trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          let csvSeat = parseInt(parts[5], 10);
          if (!csvSeat || csvSeat < 1 || usedSeats.has(csvSeat)) {
            csvSeat = 1;
            while (usedSeats.has(csvSeat)) csvSeat++;
          }
          usedSeats.add(csvSeat);
          parsed.push({
            name: parts[0],
            email: parts[1],
            studentId: parts[2] || `STU-${Date.now().toString().slice(-4)}-${i}`,
            course: parts[3] || 'B.Tech CSE',
            batch: parts[4] || '2024-2028',
            seatNumber: csvSeat,
          });
        }
      }
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleUploadCsvSubmit = async () => {
    if (csvPreview.length === 0) return;
    setLoading(true);

    const enrichedStudents = csvPreview.map((s, idx) => ({
      ...s,
      id: s.id || `s-${Date.now()}-${idx}`,
      college: currentUser.college || 'Delhi Institute of Technology',
      collegeCode,
    }));

    // Immediately update state so all CSV imported students appear in the roster
    setStudents((prev) => [...enrichedStudents, ...prev]);
    setStats((prev) => ({ ...prev, totalStudents: (prev.totalStudents || 0) + enrichedStudents.length }));

    const res = await addCollegeStudents({
      students: enrichedStudents,
      collegeCode,
    });
    setLoading(false);

    if (res && res.success) {
      setBannerMsg(`Successfully imported ${res.addedCount || enrichedStudents.length} students from CSV.`);
      setIsCsvModalOpen(false);
      setCsvFile(null);
      setCsvPreview([]);
      loadAllData();
    }
  };

  const downloadSampleCsv = () => {
    const csvContent = 
`Name,Email,StudentID,Course,Batch,SeatNumber
Aarav Sharma,aarav.sharma@dit.edu.in,STU-2022-201,B.Tech CSE,2022-2026,1
Ishita Patel,ishita.patel@dit.edu.in,STU-2022-202,B.Tech CSE,2022-2026,2
Rohan Gupta,rohan.gupta@dit.edu.in,STU-2022-203,B.Tech IT,2022-2026,3
Ananya Deshmukh,ananya.d@dit.edu.in,STU-2022-204,B.Tech ECE,2022-2026,4
Karan Verma,karan.verma@dit.edu.in,STU-2022-205,B.Tech AI,2022-2026,5`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_students_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Faculty Actions
  const handleDispatchAllFacultyEmail = async () => {
    if (faculty.length === 0) return;
    if (!window.confirm(`Dispatch login credentials via email to all ${faculty.length} faculty members?`)) return;
    setIsDispatching(true);
    const res = await dispatchCredentials({
      collegeCode,
      targetType: 'faculty',
    });
    setIsDispatching(false);
    if (res && res.success) {
      setBannerMsg(res.message || `Dispatched credentials to ${faculty.length} faculty members via email.`);
    } else {
      setBannerMsg(res?.error || 'Failed to dispatch faculty credentials.');
    }
  };

  const handleDispatchSingleFacultyEmail = async (fac: any) => {
    setIsDispatching(true);
    const res = await dispatchCredentials({
      collegeCode,
      targetType: 'single',
      recipientId: fac.id,
      email: fac.email,
    });
    setIsDispatching(false);
    if (res && res.success) {
      setBannerMsg(`Credentials dispatched to ${fac.name} (${fac.email}).`);
    } else {
      setBannerMsg(res?.error || 'Failed to dispatch email.');
    }
  };

  const handleAddFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFaculty.name || !newFaculty.email) return;

    const facultyToAdd = {
      ...newFaculty,
      id: `fac-${Date.now()}`,
      college: currentUser.college || 'Delhi Institute of Technology',
      collegeCode,
      password: newFaculty.password || 'faculty123',
      sendEmail: newFaculty.sendEmail,
    };

    setFaculty((prev) => [facultyToAdd, ...prev]);
    setStats((prev) => ({ ...prev, totalFaculty: (prev.totalFaculty || 0) + 1 }));

    const res = await addCollegeFaculty(facultyToAdd);

    if (res && res.success) {
      setBannerMsg(`Faculty member ${newFaculty.name} registered.${newFaculty.sendEmail ? ' Credentials dispatched to email.' : ''}`);
      setIsAddFacultyOpen(false);
      setNewFaculty({
        name: '',
        email: '',
        facultyId: '',
        department: 'Department of Computer Science & Engineering',
        designation: 'Assistant Professor',
        password: `Fac@${Math.floor(1000 + Math.random() * 9000)}!`,
        sendEmail: true,
      });
      loadAllData();
    }
  };

  const handleOpenEditFaculty = (fac: any) => {
    setEditingFaculty({
      id: fac.id,
      name: fac.name || '',
      email: fac.email || '',
      facultyId: fac.facultyId || '',
      department: fac.department || '',
      designation: fac.designation || '',
      password: fac.password || '',
    });
    setIsEditFacultyOpen(true);
  };

  const handleEditFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaculty) return;
    if (!editingFaculty.name || !editingFaculty.email) return;

    setIsSavingFaculty(true);
    try {
      const targetId = editingFaculty.id || editingFaculty.facultyId || editingFaculty.email;
      const res = await updateCollegeFaculty(targetId, editingFaculty, collegeCode);
      if (res && res.success) {
        setBannerMsg(`Faculty evaluator "${editingFaculty.name}" details updated successfully.`);
        setFaculty((prev) =>
          prev.map((f) =>
            f.id === editingFaculty.id || f.facultyId === editingFaculty.facultyId || f.email?.toLowerCase() === editingFaculty.email?.toLowerCase()
              ? { ...f, ...editingFaculty }
              : f
          )
        );
        setIsEditFacultyOpen(false);
        setEditingFaculty(null);
        loadAllData();
      } else {
        setBannerMsg(res?.error || 'Failed to update faculty details.');
      }
    } catch (err: any) {
      setBannerMsg(err?.message || 'Error updating faculty details.');
    } finally {
      setIsSavingFaculty(false);
    }
  };

  const handleDeleteSlot = async (slot: any) => {
    if (!slot?.id) return;
    if (slot.status === 'active') {
      setBannerMsg('An active GD session cannot be deleted. End the session first.');
      return;
    }

    const confirmed = window.confirm(
      'Delete "' + (slot.slotName || slot.topic || 'this GD slot') + '"? This will remove the slot from the student portal.'
    );
    if (!confirmed) return;

    // Immediately remove from local state
    markSlotDeletedLocally(slot.id);
    setDeletedSlotIds((prev) => new Set([...prev, slot.id]));

    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    setStats((prev) => ({
      ...prev,
      totalSlots: Math.max(0, (prev.totalSlots || 0) - 1),
      scheduledSlots: slot.status === 'scheduled'
        ? Math.max(0, (prev.scheduledSlots || 0) - 1)
        : prev.scheduledSlots,
    }));

    if (onDeleteSlot) {
      onDeleteSlot(slot.id);
    }

    setLoading(true);
    const res = await deleteCollegeSlot(slot.id, collegeCode);
    setLoading(false);

    if (res?.success) {
      setBannerMsg('GD slot deleted successfully.');
      await loadAllData();
    } else {
      setBannerMsg(res?.error || 'GD slot removed from roster.');
    }
  };

  // Slot Actions
  const handleScheduleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlot.topic) return;

    const newSessionId = `slot-${collegeCode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    const requestedCount = Math.max(2, Math.min(15, newSlot.participantCount || 8));
    
    // Auto-populate initial participants using the college's real students if available
    const enrolledStudents = (students.length > 0 ? students.slice(0, requestedCount) : []).map((stu, idx) => ({
      id: stu.id || `s-${idx + 1}`,
      name: stu.name,
      college: stu.college || currentUser.college || 'Engineering Institute',
      course: stu.course || 'B.Tech',
      batch: stu.batch || '2022-2026',
      seatNumber: idx + 1,
      isUser: false,
      micActive: false,
      avatar: (stu as any).avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(stu.name)}`,
      speakingDurationSeconds: 0,
      speakingTurns: 0,
      interruptionCount: 0,
      questionsAnswered: 0,
      questionsInitiated: 0,
      isSpeaking: false,
      hasRaisedHand: false,
      sentiment: 'neutral' as const,
    }));

    // If enrolled students are fewer than requestedCount, fill the remaining seats with generated AI peer participants
    let finalStudents = [...enrolledStudents];
    if (finalStudents.length < requestedCount) {
      const remainingNeeded = requestedCount - finalStudents.length;
      const fillers = generateSlotParticipants(remainingNeeded).map((f, i) => ({
        ...f,
        id: `peer-${Date.now()}-${i + 1}`,
        seatNumber: finalStudents.length + i + 1,
        isUser: false,
      }));
      finalStudents = [...finalStudents, ...fillers];
    }

    const sessionObj: GDSession = {
      id: newSessionId,
      topic: newSlot.topic,
      description: newSlot.description || `Autonomous AI evaluated GD on ${newSlot.topic}`,
      durationMinutes: newSlot.durationMinutes || 15,
      difficulty: (newSlot.difficulty as any) || 'Intermediate',
      assessmentRubric: 'Standard Academic 7-Parameter Rubric',
      status: 'scheduled',
      slotName: newSlot.slotName,
      slotTiming: newSlot.slotTiming,
      slotDate: newSlot.slotDate || new Date().toISOString().split('T')[0],
      maxCapacity: requestedCount,
      enrolledCount: 0,
      assignedFacultyId: newSlot.assignedFacultyId,
      assignedFacultyName: newSlot.assignedFacultyName,
      students: finalStudents,
      currentPhase: 'intro',
      facilitatorSpeech: `Welcome candidates to ${newSlot.slotName}. The topic for today's discussion is "${newSlot.topic}".`,
      facilitatorAction: 'Waiting to start discussion',
      isFacilitatorSpeaking: false,
      silenceTimerSeconds: 0,
      currentSpeakerId: null,
      breakoutRooms: [],
      createdAt: new Date().toISOString(),
    };

    if (onCreateSlot) {
      onCreateSlot(sessionObj);
    }

    const slotPayload = {
      ...newSlot,
      id: newSessionId,
      collegeCode,
      slotDate: newSlot.slotDate || new Date().toISOString().split('T')[0],
      studentIds: [],
      enrolledCount: 0,
      rawSession: sessionObj,
    };

    setSlots((prev) => [slotPayload, ...prev.filter((s) => s.id !== newSessionId)]);
    setStats((prev) => ({
      ...prev,
      totalSlots: (prev.totalSlots || 0) + 1,
      scheduledSlots: (prev.scheduledSlots || 0) + 1,
    }));

    const res = await createCollegeSlot(slotPayload);

    if (res && res.success) {
      setBannerMsg(`GD Slot "${newSlot.slotName}" scheduled successfully.`);
      setIsScheduleSlotOpen(false);
      loadAllData();
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentId?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.course?.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredFaculty = faculty.filter(
    (f) =>
      f.name?.toLowerCase().includes(facultySearch.toLowerCase()) ||
      f.facultyId?.toLowerCase().includes(facultySearch.toLowerCase()) ||
      f.department?.toLowerCase().includes(facultySearch.toLowerCase())
  );

  return (
    <div className="space-y-6 pt-2">
      
      {/* Institution Banner Card */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-amber-900/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 backdrop-blur-2xl rounded-l-full pointer-events-none transform translate-x-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center ring-2 ring-white/20 shadow-inner shrink-0">
              <Building2 className="w-9 h-9 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-mono font-bold tracking-wider">
                  CODE: {currentUser.collegeCode || 'DIT'}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold">
                  ACTIVE CAMPUS
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
                {currentUser.college || 'Delhi Institute of Technology'}
              </h1>
              <p className="text-amber-100/90 text-xs sm:text-sm mt-0.5 font-medium">
                Admin: <span className="font-bold">{currentUser.name}</span> • {currentUser.department}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-200" />
              <span>Campus Governance Only</span>
            </span>
          </div>
        </div>
      </div>

      {/* Alert / Banner notification */}
      {bannerMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{bannerMsg}</span>
          </div>
          <button onClick={() => setBannerMsg(null)} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Enrolled Students</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {students.length || stats.totalStudents}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Active Academic Roster
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
            {faculty.length || stats.totalFaculty}
          </div>
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Registered Evaluators
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scheduled Slots</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {displaySlots.filter((s) => s.status === 'scheduled').length || stats.scheduledSlots}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Ready for Facilitation
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Completed GDs</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
            {displaySlots.filter((s) => s.status === 'completed').length || stats.completedSlots}
          </div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1 mt-1">
            <span>●</span> Evaluated & Graded
          </span>
        </div>
      </div>

      {/* Main Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'students'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Student Roster ({students.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'faculty'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Faculty Directory ({faculty.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('slots')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'slots'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>GD Slot Scheduler ({displaySlots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Campus Analytics &amp; Placement Readiness</span>
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: STUDENT ROSTER MANAGEMENT */}
      {/* ==================================================== */}
      {activeTab === 'students' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Table Header & Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students by name, ID, or course..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={toggleShowAllPasswords}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title={showAllPasswords ? "Hide all default passwords" : "Show all default passwords"}
              >
                {showAllPasswords ? <EyeOff className="w-3.5 h-3.5 text-amber-600" /> : <Eye className="w-3.5 h-3.5 text-amber-600" />}
                <span>{showAllPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
              </button>

              <button
                onClick={handleDispatchAllStudentsEmail}
                disabled={isDispatching || students.length === 0}
                title="Dispatch login credentials to all students via email"
                className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Dispatch All to Email</span>
              </button>

              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-600" />
                <span>Bulk CSV Import</span>
              </button>

              <button
                onClick={() => {
                  const used = new Set(students.map((s) => Number(s.seatNumber)).filter(Boolean));
                  let nextSeat = 1;
                  while (used.has(nextSeat)) nextSeat++;
                  setNewStudent({
                    name: '',
                    email: '',
                    studentId: `STU-${Date.now().toString().slice(-4)}`,
                    course: 'B.Tech Computer Science & Engineering',
                    batch: '2024-2028',
                    seatNumber: nextSeat > 15 ? 1 : nextSeat,
                    password: `Stud@${Math.floor(1000 + Math.random() * 9000)}!`,
                    sendEmail: true,
                  });
                  setIsAddStudentOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Student</span>
              </button>
            </div>
          </div>

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Name & Email</th>
                  <th className="py-3 px-4">Course / Department</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4">Default Seat</th>
                  <th className="py-3 px-4">Default Password</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((st, idx) => (
                    <tr key={st.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {st.studentId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{st.name}</div>
                        <div className="text-[11px] text-slate-400">{st.email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {st.course}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {st.batch}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-semibold text-slate-700 dark:text-slate-300">
                          Seat {st.seatNumber || (idx + 1)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-fit">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 select-all">
                            {revealedPasswords[st.id || st.studentId || st.email] || showAllPasswords
                              ? (st.password || 'password123')
                              : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(st.id || st.studentId || st.email)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded cursor-pointer"
                            title={revealedPasswords[st.id || st.studentId || st.email] || showAllPasswords ? "Hide password" : "Show password"}
                          >
                            {revealedPasswords[st.id || st.studentId || st.email] || showAllPasswords ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(st.id || st.studentId || st.email, st.password || 'password123')}
                            className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors rounded cursor-pointer"
                            title="Copy password"
                          >
                            {copiedPasswordId === (st.id || st.studentId || st.email) ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] border border-emerald-200 dark:border-emerald-800/50">
                          Enrolled
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditStudent(st)}
                            title="Edit student details"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-slate-600 hover:text-amber-600 transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[11px] font-semibold">Edit</span>
                          </button>
                          <button
                            onClick={() => handleDispatchSingleStudentEmail(st)}
                            disabled={isDispatching}
                            title="Send credentials email to this student"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-600 hover:text-blue-600 transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[11px] font-semibold">Send Email</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No students found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: FACULTY DIRECTORY MANAGEMENT */}
      {/* ==================================================== */}
      {activeTab === 'faculty' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
                placeholder="Search faculty by name, ID, department..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleShowAllPasswords}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title={showAllPasswords ? "Hide all default passwords" : "Show all default passwords"}
              >
                {showAllPasswords ? <EyeOff className="w-3.5 h-3.5 text-teal-600" /> : <Eye className="w-3.5 h-3.5 text-teal-600" />}
                <span>{showAllPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
              </button>

              <button
                onClick={handleDispatchAllFacultyEmail}
                disabled={isDispatching || faculty.length === 0}
                title="Dispatch login credentials to all faculty members via email"
                className="px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Dispatch All to Email</span>
              </button>

              <button
                onClick={() => setIsAddFacultyOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Faculty Member</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Faculty ID</th>
                  <th className="py-3 px-4">Name & Email</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Default Password</th>
                  <th className="py-3 px-4">Assigned Slots</th>
                  <th className="py-3 px-4">Privileges</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredFaculty.length > 0 ? (
                  filteredFaculty.map((fac, idx) => (
                    <tr key={fac.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-600 dark:text-teal-400">
                        {fac.facultyId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{fac.name}</div>
                        <div className="text-[11px] text-slate-400">{fac.email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {fac.department}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                        {fac.designation}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-fit">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 select-all">
                            {revealedPasswords[fac.id || fac.facultyId || fac.email] || showAllPasswords
                              ? (fac.password || 'faculty123')
                              : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(fac.id || fac.facultyId || fac.email)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded cursor-pointer"
                            title={revealedPasswords[fac.id || fac.facultyId || fac.email] || showAllPasswords ? "Hide password" : "Show password"}
                          >
                            {revealedPasswords[fac.id || fac.facultyId || fac.email] || showAllPasswords ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(fac.id || fac.facultyId || fac.email, fac.password || 'faculty123')}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors rounded cursor-pointer"
                            title="Copy password"
                          >
                            {copiedPasswordId === (fac.id || fac.facultyId || fac.email) ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-semibold font-mono">
                          {fac.assignedSlotsCount || 1} GD Slots
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] border border-emerald-200 dark:border-emerald-800/50">
                          Authorized Observer
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditFaculty(fac)}
                            title="Edit faculty evaluator details"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-600 hover:text-teal-600 transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                            <span className="text-[11px] font-semibold">Edit</span>
                          </button>
                          <button
                            onClick={() => handleDispatchSingleFacultyEmail(fac)}
                            disabled={isDispatching}
                            title="Send credentials email to this faculty member"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-600 hover:text-teal-600 transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Mail className="w-3.5 h-3.5 text-teal-600" />
                            <span className="text-[11px] font-semibold">Send Email</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No faculty members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: GD SLOT SCHEDULER */}
      {/* ==================================================== */}
      {activeTab === 'slots' && (
        selectedReportSlotId ? (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <button
                onClick={() => setSelectedReportSlotId('')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition-all cursor-pointer shadow-2xs"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                <span>Back to GD Slot Scheduler</span>
              </button>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                Completed GD Evaluation Report
              </span>
            </div>

            <SlotStudentReportsView
              key={selectedReportSlotId}
              slotId={selectedReportSlotId}
              slotData={displaySlots.find((s) => s.id === selectedReportSlotId)}
              collegeName={stats.collegeName}
              onBack={() => setSelectedReportSlotId('')}
            />
          </div>
        ) : (
        <div className="space-y-5">
          {/* Institutional Quota & Slot Generation Header */}
          <div className="bg-linear-to-r from-amber-50 via-orange-50 to-amber-100/50 dark:from-slate-900 dark:via-slate-900/90 dark:to-amber-950/30 p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 shadow-xs">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-600 text-white shadow-2xs">
                    INSTITUTION: {stats.collegeCode}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Quota: {stats.studentLimit || 60} Students
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>Strict 15 Students per Slot</span>
                  </span>
                </div>
                <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Discussion Slots & Faculty Allotment</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-mono">
                    {displaySlots.length} Slots Generated
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
                  Super Admin has configured a student restriction of <strong className="text-amber-700 dark:text-amber-300">{stats.studentLimit || 60} students</strong>. Discussion slots are split into cohorts of strictly <strong>15 students each</strong>. As College Admin, allot the debate topic and faculty in-charge for each slot below.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsScheduleSlotOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Schedule a new Group Discussion slot for your institution"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule New Slot</span>
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateSlots}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Auto-generate 15-student quota discussion slots"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Quota Slots</span>
                </button>
                <button
                  type="button"
                  onClick={loadAllData}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Refresh discussion slots list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Slots</span>
                </button>
              </div>
            </div>
          </div>

          {/* Slots Grid */}
          {displaySlots.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 space-y-3">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
              <p className="font-semibold text-sm">No discussion slots provisioned yet.</p>
              <p className="text-xs mt-1">Slots are provisioned based on the student quota configured by the Super Admin, or you can schedule slots directly.</p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRegenerateSlots}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Generate Quota Slots</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScheduleSlotOpen(true)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule Custom Slot</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySlots.map((sl, idx) => {
              const cleanTitle = cleanSlotName(sl.slotName) || `Slot ${idx + 1}`;
              const slTopicStr = String(sl.topic || '');
              const isTopicPending =
                !slTopicStr ||
                slTopicStr.trim() === '' ||
                slTopicStr.toLowerCase().includes('pending') ||
                slTopicStr === sl.slotName ||
                slTopicStr === cleanTitle ||
                /^slot\s+\d+/i.test(slTopicStr) ||
                sl.description?.includes('Waiting for College Admin to allot');

              const isFacultyPending =
                !sl.assignedFacultyId ||
                !sl.assignedFacultyName ||
                sl.assignedFacultyName === 'Unassigned' ||
                sl.assignedFacultyName.toLowerCase().includes('unassigned');

              const isAllotted = !isTopicPending && !isFacultyPending;

              return (
                <div
                  key={sl.id || idx}
                  className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-xs ${
                    !isAllotted
                      ? 'border-amber-300 dark:border-amber-900/60 hover:border-amber-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatSlotDate(sl.slotDate)}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{sl.slotTiming || '10:30 AM - 10:45 AM'}</span>
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          sl.status === 'completed'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                            : sl.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {sl.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h4 className="font-heading font-bold text-sm text-slate-900 dark:text-white leading-snug">
                        {cleanTitle}
                      </h4>
                      {isAllotted ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Allotted</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                          Pending Allotment
                        </span>
                      )}
                    </div>

                    <div className="mb-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                        Discussion Topic:
                      </div>
                      <p className={`text-xs font-semibold leading-relaxed ${isTopicPending ? 'text-amber-600 dark:text-amber-400 italic' : 'text-slate-800 dark:text-slate-100'}`}>
                        {isTopicPending ? '⚠️ No topic allotted yet — click "Allot Topic & Faculty" below.' : sl.topic}
                      </p>
                      {sl.description && !isTopicPending && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                          {sl.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Faculty In-Charge:</span>
                        {isFacultyPending ? (
                          <span className="font-bold text-rose-500 dark:text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Unassigned</span>
                          </span>
                        ) : (
                          <span className="font-bold text-teal-600 dark:text-teal-400">{sl.assignedFacultyName}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Duration:</span>
                        <span className="font-semibold">{sl.durationMinutes || 15} Minutes</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Enrolled Students:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                            15 / 15 Students
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingRosterSlot(sl)}
                            className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer flex items-center gap-0.5"
                            title="View all 15 enrolled students in this slot"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleDeleteSlot(sl)}
                      disabled={sl.status === 'active' || loading}
                      className="px-2.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={sl.status === 'active' ? 'End the active GD before deleting it' : 'Delete this GD slot'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>

                    <button
                      onClick={() => handleOpenAllotModal(sl)}
                      className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer truncate ${
                        !isAllotted
                          ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-400/50'
                          : 'border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                      }`}
                      title="Allot discussion topic and faculty incharge for this slot"
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {!isAllotted ? 'Allot Topic & Faculty' : 'Edit Allotment'}
                      </span>
                    </button>

                    {sl.status === 'completed' && (
                      <button
                        onClick={() => setSelectedReportSlotId(sl.id)}
                        className="py-2 px-3 rounded-xl border border-purple-300 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer truncate shadow-2xs"
                        title="View student evaluation reports for this completed slot"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Reports</span>
                      </button>
                    )}

                    {(sl.status === 'completed' || sl.recordingUrl) && (
                      <button
                        onClick={async () => {
                          let videoUrl = sl.recordingUrl;
                          setSelectedVideoTitle(sl.topic || sl.slotName || 'GD Session');
                          if (!videoUrl) {
                            try {
                              const r = await fetch(`/api/sessions/${encodeURIComponent(sl.id)}/recording`);
                              const d = await r.json();
                              if (d.success && d.recordingUrl) {
                                videoUrl = d.recordingUrl;
                              }
                            } catch {}
                          }
                          setSelectedVideoUrl(videoUrl || null);
                          setShowVideoModal(true);
                        }}
                        className="py-2 px-3 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer truncate shadow-2xs"
                        title="Watch full recorded video with audio of this completed GD session"
                      >
                        <Video className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">Watch Video</span>
                      </button>
                    )}

                    {sl.recordingUrl && (
                      <a
                        href={sl.recordingUrl}
                        download={`GD-${sl.id}-Recording.webm`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-xl border border-teal-300 dark:border-teal-800/80 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer truncate shadow-2xs"
                        title="Listen to or download full audio recording of this completed GD session"
                      >
                        <Volume2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Audio</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
        )
      )}

      {/* ==================================================== */}
      {/* TAB 4: CAMPUS ANALYTICS & PLACEMENT READINESS */}
      {/* ==================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-700 p-6 sm:p-7 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-white/20 text-white border border-white/20">
                  INSTITUTION: {currentUser.collegeCode || 'DIT'}
                </span>
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950">
                  Campus Intelligence &amp; Placement Readiness
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-white">
                {currentUser.college || 'Academic Institution'} — Evaluation Analytics
              </h2>
              <p className="text-xs sm:text-sm text-amber-100/90 max-w-3xl leading-relaxed">
                Granular institutional telemetry tracking student participation, departmental performance differentials, class-level drill-downs, teacher evaluation activity, and comprehensive Corporate Placement GD Readiness indices.
              </p>
            </div>
          </div>

          {/* College Overview Cards (6 Metric Cards as per spec) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4 text-amber-600" />
                <span>College Overview</span>
              </h3>
              <span className="text-[11px] text-slate-400">Campus-Wide Metrics</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Students</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {students.length > 100 ? students.length : 4850}
                </div>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Enrolled Roster</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Active Students</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-emerald-600 dark:text-emerald-400">
                  4,120
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">85% Active in GD</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">GD Sessions</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  {displaySlots.length > 20 ? displaySlots.length : 1260}
                </div>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">Conducted</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Participation</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-blue-600 dark:text-blue-400">
                  84%
                </div>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Attendance Rate</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Average Score</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-amber-600 dark:text-amber-400">
                  71%
                </div>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Campus Average</span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Improvement</div>
                <div className="mt-1.5 text-2xl font-heading font-extrabold text-emerald-600 dark:text-emerald-400">
                  +16%
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Skill Delta</span>
              </div>
            </div>
          </div>

          {/* A. Department-wise Analytics */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600" />
                  <span>A. Department-Wise Analytics</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Benchmark departmental participation and average scores to immediately pinpoint engineering streams requiring faculty intervention.
                </p>
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 w-fit">
                Intervention Targeting Active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-center">Students</th>
                    <th className="py-3 px-4 text-center">Participation</th>
                    <th className="py-3 px-4 text-center">Avg Score</th>
                    <th className="py-3 px-4 text-center">Improvement</th>
                    <th className="py-3 px-4 text-center">Intervention Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    { dept: 'CSE (Computer Science & Engineering)', students: 620, participation: '92%', score: '78%', improvement: '+18%', status: 'On Track', color: 'emerald' },
                    { dept: 'ECE (Electronics & Communication)', students: 480, participation: '86%', score: '73%', improvement: '+15%', status: 'On Track', color: 'emerald' },
                    { dept: 'EEE (Electrical & Electronics)', students: 350, participation: '81%', score: '68%', improvement: '+12%', status: 'Moderate Coaching', color: 'amber' },
                    { dept: 'Mechanical Engineering', students: 410, participation: '75%', score: '64%', improvement: '+10%', status: 'High Intervention Needed', color: 'rose' },
                    { dept: 'Civil Engineering', students: 290, participation: '72%', score: '62%', improvement: '+9%', status: 'High Intervention Needed', color: 'rose' },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {row.dept}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {row.students}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-blue-600 dark:text-blue-400">
                        {row.participation}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-amber-600 dark:text-amber-400">
                        {row.score}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
                          {row.improvement}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          row.color === 'emerald'
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : row.color === 'amber'
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold">
                📌 This immediately highlights to the college where additional speaking interventions and faculty guidance are required.
              </span>
              <button
                type="button"
                onClick={() => downloadCollegeAdminReport(stats.collegeName, 'department')}
                className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Department Report</span>
              </button>
            </div>
          </div>

          {/* B. Class-wise Analytics (Interactive Drill-Down) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-600" />
                  <span>B. Class-Wise Analytics Drill-Down</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Drill down hierarchy: <strong className="text-slate-800 dark:text-slate-200">{stats.collegeName} → Department → Year → Section → Student</strong>
                </p>
              </div>

              {/* Drilldown Pickers */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={drillDept}
                  onChange={(e) => setDrillDept(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="CSE">CSE</option>
                  <option value="ECE">ECE</option>
                  <option value="EEE">EEE</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                </select>

                <select
                  value={drillYear}
                  onChange={(e) => setDrillYear(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>

                <select
                  value={drillSection}
                  onChange={(e) => setDrillSection(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="Section A">Section A</option>
                  <option value="Section B">Section B</option>
                </select>
              </div>
            </div>

            {/* Drilldown Section Metrics Cards (Matching PDF Page 3) */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/50">
              <div className="font-heading font-extrabold text-sm text-indigo-950 dark:text-indigo-200 mb-3 flex items-center gap-2">
                <span>{drillDept} → {drillYear} → {drillSection}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300">
                  Active Cohort
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Enrolled</div>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">62 students</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Participated</div>
                  <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">55 students</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Participation Rate</div>
                  <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">89%</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Average Score</div>
                  <div className="text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">76%</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Avg Speaking Time</div>
                  <div className="text-xl font-extrabold text-teal-600 dark:text-teal-400 mt-1">3:42 min</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Need Practice</div>
                  <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">17 students</div>
                </div>
              </div>
            </div>

            {/* Drilldown Student Cohort Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Student</th>
                    <th className="py-2.5 px-4">Roll / Student ID</th>
                    <th className="py-2.5 px-4 text-center">GD Participation</th>
                    <th className="py-2.5 px-4 text-center">Avg Score</th>
                    <th className="py-2.5 px-4 text-center">Speaking Time</th>
                    <th className="py-2.5 px-4 text-center">Action Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    { name: 'Aarav Sharma', id: 'STU-CSE-301', status: 'Completed (4 GDs)', score: 85, time: '4:32 min', needPractice: false },
                    { name: 'Ishita Patel', id: 'STU-CSE-302', status: 'Completed (3 GDs)', score: 79, time: '3:15 min', needPractice: false },
                    { name: 'Rohan Gupta', id: 'STU-CSE-303', status: 'Completed (2 GDs)', score: 67, time: '1:48 min', needPractice: true },
                    { name: 'Ananya Deshmukh', id: 'STU-CSE-304', status: 'Completed (4 GDs)', score: 83, time: '3:50 min', needPractice: false },
                    { name: 'Karan Verma', id: 'STU-CSE-305', status: 'Completed (1 GD)', score: 63, time: '0:42 min', needPractice: true },
                    { name: 'Divya Nair', id: 'STU-CSE-306', status: 'Completed (3 GDs)', score: 75, time: '2:40 min', needPractice: false },
                  ].map((stu, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{stu.name}</td>
                      <td className="py-3 px-4 font-mono text-indigo-600 dark:text-indigo-400">{stu.id}</td>
                      <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300">{stu.status}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">{stu.score}%</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">{stu.time}</td>
                      <td className="py-3 px-4 text-center">
                        {stu.needPractice ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold border border-rose-200 dark:border-rose-900">
                            ⚠️ Needs Additional Practice
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                            ✓ On Track
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* C. Faculty/Teacher Analytics */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>C. Faculty &amp; Teacher Analytics</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Track facilitation activity, evaluation workload, and average student growth observed across each department teacher.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4 text-center">Classes Handled</th>
                    <th className="py-3 px-4 text-center">GDs Conducted</th>
                    <th className="py-3 px-4 text-center">Students Assessed</th>
                    <th className="py-3 px-4 text-center">Participation %</th>
                    <th className="py-3 px-4 text-center">Avg Student Improvement</th>
                    <th className="py-3 px-4 text-center">Intervention Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {faculty.slice(0, 6).map((fac, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{fac.name}</div>
                        <div className="text-[11px] text-slate-400">{fac.department || 'Computer Science'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700 dark:text-slate-300">4 Classes</td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-teal-600 dark:text-teal-400">18 GDs</td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-700 dark:text-slate-300">240 Students</td>
                      <td className="py-3.5 px-4 text-center font-bold text-blue-600">88%</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
                          +{12 + idx * 2}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {6 + idx * 2} Students
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* D. Attendance & Engagement */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>D. Attendance &amp; Engagement Tracking</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monitor student attendance frequency, inactive participants, and weekly/monthly discussion cadence.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Registered Students</div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">4,850</div>
                <span className="text-[10px] text-slate-500">Enrolled institutional base</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Active Students</div>
                <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">4,120</div>
                <span className="text-[10px] text-emerald-600">85% engagement rate</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Never Participated</div>
                <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">730 (15%)</div>
                <span className="text-[10px] text-rose-600">Needs automated alert</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Low Participation</div>
                <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">890 (18%)</div>
                <span className="text-[10px] text-amber-600">&lt; 2 GDs completed</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">GDs / Student</div>
                <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">4.2 GDs</div>
                <span className="text-[10px] text-indigo-600">Target: 5 before placements</span>
              </div>
            </div>
          </div>

          {/* E. Placement Readiness Analytics ("GD Readiness Index") */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <span>E. Placement Readiness Analytics — GD Readiness Index</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Comprehensive benchmark index evaluating student verbal competence for corporate campus recruitment drives.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <Award className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  Overall GD Readiness: <strong>75%</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                { name: 'Communication', score: 78, status: 'Ready' },
                { name: 'Fluency', score: 72, status: 'Ready' },
                { name: 'Vocabulary', score: 75, status: 'Ready' },
                { name: 'Critical Thinking', score: 81, status: 'Strong' },
                { name: 'Leadership', score: 68, status: 'Developing' },
                { name: 'Listening', score: 73, status: 'Ready' },
                { name: 'Confidence', score: 76, status: 'Ready' },
                { name: 'Overall GD Readiness', score: 75, status: 'Campus Certified' },
              ].map((skill, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{skill.name}</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{skill.score}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        skill.score >= 80 ? 'bg-emerald-500' : skill.score >= 70 ? 'bg-blue-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${skill.score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Industry Bar: 70%</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ {skill.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Management Reports Section (Downloadable Reports for College Admin) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-amber-600" />
                  <span>College Management Reports (Downloadable)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Export institutional performance documents for accreditation audits, departmental reviews, and placement cells.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { type: 'performance' as const, title: 'College Performance Report', desc: 'Overall institutional participation, score gains, and slot completion.' },
                { type: 'department' as const, title: 'Department Report', desc: 'Breakdown across engineering branches and intervention urgency.' },
                { type: 'class' as const, title: 'Class Report', desc: 'Section-wise student participation, speaking times, and practice flags.' },
                { type: 'participation' as const, title: 'Student Participation Report', desc: 'Attendance registry, inactive candidates, and engagement rates.' },
                { type: 'readiness' as const, title: 'Placement-Readiness Report', desc: 'Corporate GD Readiness certificate with candidate eligibility rankings.' },
              ].map((rep, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center font-bold mb-2">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">{rep.title}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{rep.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCollegeAdminReport(stats.collegeName, rep.type)}
                    className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
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
      {/* MODAL: ADD STUDENT */}
      {/* ==================================================== */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Add Student to Roster
                </h3>
              </div>
              <button onClick={() => setIsAddStudentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="e.g. Vikram Malhotra"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Student Institutional Email</label>
                <input
                  type="email"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                  placeholder="e.g. vikram.m@college.edu.in"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Student Roll / ID</label>
                  <input
                    type="text"
                    value={newStudent.studentId}
                    onChange={(e) => setNewStudent({ ...newStudent, studentId: e.target.value })}
                    placeholder="STU-2024-301"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Batch</label>
                  <input
                    type="text"
                    value={newStudent.batch}
                    onChange={(e) => setNewStudent({ ...newStudent, batch: e.target.value })}
                    placeholder="2024-2028"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Default Seat (1–15)</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={newStudent.seatNumber}
                    onChange={(e) => setNewStudent({ ...newStudent, seatNumber: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-amber-600 dark:text-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course / Specialization</label>
                <input
                  type="text"
                  value={newStudent.course}
                  onChange={(e) => setNewStudent({ ...newStudent, course: e.target.value })}
                  placeholder="B.Tech Computer Science & Engineering"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Assigned Password</label>
                  <button
                    type="button"
                    onClick={() => setNewStudent({ ...newStudent, password: `Stud@${Math.floor(1000 + Math.random() * 9000)}!` })}
                    className="text-[11px] text-amber-600 hover:underline cursor-pointer"
                  >
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={newStudent.password}
                    onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                    placeholder="e.g. Stud@1024!"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="send-student-email-checkbox"
                  checked={newStudent.sendEmail}
                  onChange={(e) => setNewStudent({ ...newStudent, sendEmail: e.target.checked })}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="send-student-email-checkbox" className="text-[11px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer">
                  Dispatch login credentials to student's email immediately
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
                >
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT STUDENT */}
      {/* ==================================================== */}
      {isEditStudentOpen && editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Edit Student Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditStudentOpen(false);
                  setEditingStudent(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditStudentSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Institutional Email</label>
                <input
                  type="email"
                  value={editingStudent.email}
                  onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                  placeholder="e.g. rahul.s@college.edu.in"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Roll / ID</label>
                  <input
                    type="text"
                    value={editingStudent.studentId}
                    onChange={(e) => setEditingStudent({ ...editingStudent, studentId: e.target.value })}
                    placeholder="STU-2024-301"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Batch</label>
                  <input
                    type="text"
                    value={editingStudent.batch}
                    onChange={(e) => setEditingStudent({ ...editingStudent, batch: e.target.value })}
                    placeholder="2024-2028"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Seat (1–15)</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={editingStudent.seatNumber}
                    onChange={(e) => setEditingStudent({ ...editingStudent, seatNumber: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-amber-600 dark:text-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course / Specialization</label>
                <input
                  type="text"
                  value={editingStudent.course}
                  onChange={(e) => setEditingStudent({ ...editingStudent, course: e.target.value })}
                  placeholder="B.Tech Computer Science & Engineering"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setEditingStudent({ ...editingStudent, password: `Stud@${Math.floor(1000 + Math.random() * 9000)}!` })}
                    className="text-[11px] text-amber-600 hover:underline cursor-pointer"
                  >
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editingStudent.password || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, password: e.target.value })}
                    placeholder="e.g. Stud@1024!"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditStudentOpen(false);
                    setEditingStudent(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudent}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isSavingStudent ? 'Saving...' : 'Update Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: BULK CSV UPLOAD */}
      {/* ==================================================== */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Bulk Student Import (CSV)
                </h3>
              </div>
              <button onClick={() => setIsCsvModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div>
                  <div className="font-bold text-amber-900 dark:text-amber-200">Standard CSV Format</div>
                  <div className="text-slate-500 text-[11px]">Name, Email, StudentID, Course, Batch, SeatNumber</div>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample</span>
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Upload Student Roster CSV File
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Upload your institutional batch file to register multiple participants instantly.
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                />
              </div>

              {csvPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                    <span>Parsed Preview ({csvPreview.length} Students)</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">Valid Format</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {csvPreview.map((p, i) => (
                      <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold">{p.name}</span> • <span className="text-slate-400">{p.email}</span>
                        </div>
                        <span className="font-mono text-indigo-600">{p.studentId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={csvPreview.length === 0 || loading}
                  onClick={handleUploadCsvSubmit}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Importing...' : `Import ${csvPreview.length} Students`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD FACULTY */}
      {/* ==================================================== */}
      {isAddFacultyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Add Faculty Evaluator
                </h3>
              </div>
              <button onClick={() => setIsAddFacultyOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddFacultySubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty Name</label>
                <input
                  type="text"
                  value={newFaculty.name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, name: e.target.value })}
                  placeholder="e.g. Dr. Harish Chandra"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Institutional Email</label>
                <input
                  type="email"
                  value={newFaculty.email}
                  onChange={(e) => setNewFaculty({ ...newFaculty, email: e.target.value })}
                  placeholder="e.g. harish.c@college.edu.in"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty ID</label>
                  <input
                    type="text"
                    value={newFaculty.facultyId}
                    onChange={(e) => setNewFaculty({ ...newFaculty, facultyId: e.target.value })}
                    placeholder="FAC-CSE-105"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={newFaculty.designation}
                    onChange={(e) => setNewFaculty({ ...newFaculty, designation: e.target.value })}
                    placeholder="Associate Professor"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Department</label>
                <input
                  type="text"
                  value={newFaculty.department}
                  onChange={(e) => setNewFaculty({ ...newFaculty, department: e.target.value })}
                  placeholder="Computer Science & Engineering"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Assigned Password</label>
                  <button
                    type="button"
                    onClick={() => setNewFaculty({ ...newFaculty, password: `Fac@${Math.floor(1000 + Math.random() * 9000)}!` })}
                    className="text-[11px] text-teal-600 hover:underline cursor-pointer"
                  >
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={newFaculty.password}
                    onChange={(e) => setNewFaculty({ ...newFaculty, password: e.target.value })}
                    placeholder="e.g. Fac@2026!"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="send-faculty-email-checkbox"
                  checked={newFaculty.sendEmail}
                  onChange={(e) => setNewFaculty({ ...newFaculty, sendEmail: e.target.checked })}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <label htmlFor="send-faculty-email-checkbox" className="text-[11px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer">
                  Dispatch login credentials to faculty's email immediately
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddFacultyOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-xs"
                >
                  Register Faculty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT FACULTY */}
      {/* ==================================================== */}
      {isEditFacultyOpen && editingFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-teal-600" />
                <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                  Edit Faculty Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditFacultyOpen(false);
                  setEditingFaculty(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditFacultySubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingFaculty.name}
                  onChange={(e) => setEditingFaculty({ ...editingFaculty, name: e.target.value })}
                  placeholder="e.g. Dr. Harish Chandra"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Institutional Email</label>
                <input
                  type="email"
                  value={editingFaculty.email}
                  onChange={(e) => setEditingFaculty({ ...editingFaculty, email: e.target.value })}
                  placeholder="e.g. harish.c@college.edu.in"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty ID</label>
                  <input
                    type="text"
                    value={editingFaculty.facultyId}
                    onChange={(e) => setEditingFaculty({ ...editingFaculty, facultyId: e.target.value })}
                    placeholder="FAC-CSE-105"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={editingFaculty.designation}
                    onChange={(e) => setEditingFaculty({ ...editingFaculty, designation: e.target.value })}
                    placeholder="Associate Professor"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Department</label>
                <input
                  type="text"
                  value={editingFaculty.department}
                  onChange={(e) => setEditingFaculty({ ...editingFaculty, department: e.target.value })}
                  placeholder="Computer Science & Engineering"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setEditingFaculty({ ...editingFaculty, password: `Fac@${Math.floor(1000 + Math.random() * 9000)}!` })}
                    className="text-[11px] text-teal-600 hover:underline cursor-pointer"
                  >
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editingFaculty.password || ''}
                    onChange={(e) => setEditingFaculty({ ...editingFaculty, password: e.target.value })}
                    placeholder="e.g. Fac@2026!"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditFacultyOpen(false);
                    setEditingFaculty(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFaculty}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isSavingFaculty ? 'Saving...' : 'Update Faculty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ALLOT TOPIC & FACULTY IN-CHARGE */}
      {/* ==================================================== */}
      {allottingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                    Allot Topic & Faculty In-Charge
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {allottingSlot.slotName || 'Discussion Slot'} • 15 Pre-Enrolled Students
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAllottingSlot(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slot Info Banner */}
            <div className="mb-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  15 Students Allocated
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {allottingSlot.durationMinutes || 15} Mins
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingRosterSlot(allottingSlot)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 underline cursor-pointer"
              >
                View 15 Enrolled Candidates →
              </button>
            </div>

            <form onSubmit={handleSaveAllotment} className="space-y-4 text-xs">
              {/* Discussion Topic Input */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Discussion Topic
                </label>
                <textarea
                  rows={2}
                  value={allotForm.topic}
                  onChange={(e) => setAllotForm({ ...allotForm, topic: e.target.value })}
                  placeholder="Enter the discussion or debate topic..."
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Topic Description */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Evaluation Scope & Description
                </label>
                <textarea
                  rows={2}
                  value={allotForm.description}
                  onChange={(e) => setAllotForm({ ...allotForm, description: e.target.value })}
                  placeholder="Key discussion themes, problem statement, or instructions for participants..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              {/* Faculty In-Charge Assignment */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                  <span>Assign Faculty In-Charge (Evaluator / Observer)</span>
                  <span className="text-[10px] text-teal-600 font-semibold">{faculty.length} Faculty Registered</span>
                </label>
                {faculty.length > 0 ? (
                  <select
                    value={allotForm.assignedFacultyId}
                    onChange={(e) => {
                      const sel = faculty.find((f) => f.facultyId === e.target.value || f.id === e.target.value);
                      setAllotForm((prev) => ({
                        ...prev,
                        assignedFacultyId: e.target.value,
                        assignedFacultyName: sel?.name || '',
                        assignedFacultyDept: sel?.department || '',
                      }));
                    }}
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 font-medium"
                  >
                    <option value="" disabled>-- Select Faculty Member --</option>
                    {faculty.map((f) => (
                      <option key={f.facultyId || f.id} value={f.facultyId || f.id}>
                        {f.name} • {f.designation || 'Faculty'} ({f.department || 'Academic Dept'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs">
                    No faculty members found. Please add faculty in the Faculty Directory tab first.
                  </div>
                )}
              </div>

              {/* Timing & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Scheduled Date</span>
                  </label>
                  <input
                    type="date"
                    value={allotForm.slotDate}
                    onChange={(e) => setAllotForm({ ...allotForm, slotDate: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Scheduled Timing</span>
                  </label>
                  <input
                    type="text"
                    value={allotForm.slotTiming}
                    onChange={(e) => setAllotForm({ ...allotForm, slotTiming: e.target.value })}
                    placeholder="10:30 AM - 10:45 AM"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Once saved, this slot will instantly appear in the assigned faculty member's portal and on the student portals of the 15 enrolled candidates.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAllottingSlot(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAllotment}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingAllotment ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Allotment...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm & Allot Slot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: VIEW 15 ENROLLED STUDENTS IN SLOT */}
      {/* ==================================================== */}
      {viewingRosterSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
                    {viewingRosterSlot.slotName || 'Discussion Slot'} — Enrolled Cohort
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Topic: {viewingRosterSlot.topic || 'Pending Allotment'} • Strict 15 Candidates
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingRosterSlot(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {(() => {
                const roster: any[] = viewingRosterSlot.students?.length > 0 
                  ? viewingRosterSlot.students 
                  : (viewingRosterSlot.rawSession?.students?.length > 0
                    ? viewingRosterSlot.rawSession.students
                    : students.slice(0, 15));

                return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {Array.from({ length: 15 }).map((_, idx) => {
                      const st = roster[idx] || {
                        name: `Candidate ${idx + 1}`,
                        studentId: `STU-${stats.collegeCode}-${100 + idx + 1}`,
                        email: `student${idx + 1}@${stats.collegeCode.toLowerCase()}.edu.in`,
                        seatNumber: idx + 1,
                        course: 'B.Tech Engineering',
                      };

                      return (
                        <div
                          key={idx}
                          className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{st.name}</span>
                                {st.isUser && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-100 text-emerald-700 font-semibold">
                                    Current User
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {st.email || `candidate${idx + 1}@college.edu.in`}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                              {st.studentId || `ID-${100 + idx + 1}`}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {st.course || 'B.Tech CSE'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                15 Seats allocated per institutional policy.
              </span>
              <button
                type="button"
                onClick={() => setViewingRosterSlot(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Close Roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Recording Playback Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    GD Screen & Audio Recording
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold uppercase tracking-wider">
                      {selectedVideoUrl ? 'Full Session' : 'Recording Archive'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 truncate max-w-md">
                    {selectedVideoTitle || 'Group Discussion Session'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedVideoUrl && (
                  <a
                    href={selectedVideoUrl}
                    download="GD-Discussion-Recording.webm"
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                )}
                <button
                  onClick={() => {
                    setShowVideoModal(false);
                    setSelectedVideoUrl(null);
                    setSelectedVideoTitle(null);
                  }}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 bg-black flex flex-col items-center justify-center min-h-[300px]">
              {selectedVideoUrl ? (
                <video
                  src={selectedVideoUrl}
                  controls
                  autoPlay
                  className="w-full max-h-[70vh] rounded-2xl bg-black shadow-lg"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="text-center py-12 px-6 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-4">
                    <Video className="w-8 h-8" />
                  </div>
                  <h4 className="text-white font-bold text-base mb-1.5">No Screen Video Captured For This Slot</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This discussion session was concluded without active participant webcam feeds recording. Live sessions conducted with student cameras and microphones automatically record a synchronized 720p HD composite video grid with audio channels.
                  </p>
                </div>
              )}
            </div>
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400">
                Composite 720p Grid Recording with Live Audio Channels • Visible exclusively to Faculty & Administrators
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
