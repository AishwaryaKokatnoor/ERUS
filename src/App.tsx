/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header, NavTabType } from './components/Header';
import { RealisticGDRoom } from './components/GDRoom/RealisticGDRoom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentReportView } from './components/AssessmentReport/StudentReportView';
import { FacultyDashboardView } from './components/FacultyDashboard/FacultyDashboardView';
import { CollegeAdminDashboard } from './components/CollegeAdmin/CollegeAdminDashboard';
import { SuperAdminDashboard } from './components/SuperAdmin/SuperAdminDashboard';
import { SessionCreationModal } from './components/SessionManager/SessionCreationModal';
import { AuthPortal } from './components/Auth/AuthPortal';
import { GDSession, Student, TranscriptEntry, StudentAssessmentReport } from './types/gd';
import { AuthUser } from './types/auth';
import { 
  INITIAL_SESSION, 
  INITIAL_SLOTS, 
  INITIAL_TRANSCRIPTS, 
  SAMPLE_REPORT_RAHUL,
  generateStudentReport,
  generateSlotParticipants 
} from './data/mockGDData';
import { addReportToStudentHistory } from './utils/studentReportHistory';
import { facilitatorVoice } from './utils/speechSynthesis';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from './utils/facilitatorQuestionEngine';
import { clearStoredAuth, verifyCurrentSession, createCollegeSlot, fetchCollegeSlots, fetchFacultyAssignedSlots } from './utils/authApi';
import { 
  getStudentBookedSlotsByTopic,
  setStudentBookedSlotForTopic,
  clearStudentBookedSlotForTopic,
  getStudentBookedSlotId, 
  isSlotSelectableForTopic,
  checkCanReviveSlot 
} from './utils/studentBooking';
import { StudentTopicPortal } from './components/StudentPortal/StudentTopicPortal';

function GDAppContent() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('erus_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const STORAGE_KEY = 'erus_available_slots_v9';

  // Safely load and validate slots, purging stale legacy storage where all slots were full or active
  const loadInitialSlots = (): GDSession[] => {
    try {
      // Purge older legacy cache keys
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3', 'erus_available_slots_v4', 'erus_available_slots_v5', 'erus_available_slots_v6', 'erus_available_slots_v7', 'erus_available_slots_v8'].forEach((k) => {
        localStorage.removeItem(k);
      });

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Check if every slot in storage is marked full (15/15) - if so, discard stale cache
          const allFull = parsed.every((s: GDSession) => {
            const maxCap = s.maxCapacity || 15;
            const enrolled = s.enrolledCount ?? s.students?.length ?? 15;
            return enrolled >= maxCap;
          });
          if (!allFull) {
            return parsed.map((s: GDSession) => ({
              ...s,
              status: s.status === 'completed' ? 'completed' : (s.status === 'active' ? 'active' : 'waiting'),
            }));
          }
        }
      }
    } catch {}
    return [];
  };

  const [currentTab, setCurrentTab] = useState<NavTabType>(() => {
    try {
      const saved = localStorage.getItem('erus_auth_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.role === 'super_admin') return 'super_admin';
        if (u.role === 'college_admin') return 'college_admin';
        if (u.role === 'faculty') return 'faculty';
        if (u.role === 'student') return 'topics';
      }
    } catch {}
    return 'topics';
  });
  const [availableSlots, setAvailableSlots] = useState<GDSession[]>(loadInitialSlots);
  const [session, setSession] = useState<GDSession>(() => {
    const slots = loadInitialSlots();
    return slots[0] || INITIAL_SESSION;
  });
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>(INITIAL_TRANSCRIPTS);
  const [activeReport, setActiveReport] = useState<StudentAssessmentReport>(SAMPLE_REPORT_RAHUL);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);
  const [studentBookedSlotsByTopic, setStudentBookedSlotsByTopic] = useState<Record<string, string>>(() => {
    try {
      const userRaw = localStorage.getItem('erus_auth_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u.role === 'student') {
          const key = u.id || u.email || 'student';
          return getStudentBookedSlotsByTopic(key);
        }
      }
    } catch {}
    return {};
  });

  const studentBookedSlotId = useMemo(() => {
    const values = Object.values(studentBookedSlotsByTopic);
    return values.length > 0 ? values[0] : null;
  }, [studentBookedSlotsByTopic]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    const slots = loadInitialSlots();
    return slots[0]?.status === 'active' ? 315 : 0;
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const { theme } = useTheme();

  // Guard: Role-based navigation restrictions
  useEffect(() => {
    if (currentUser?.role === 'super_admin' && currentTab !== 'super_admin') {
      setCurrentTab('super_admin');
      return;
    }
    if (currentUser?.role === 'student' && (currentTab === 'faculty' || currentTab === 'college_admin' || currentTab === 'super_admin')) {
      setCurrentTab('topics');
    }
    if (currentUser?.role !== 'super_admin' && currentTab === 'super_admin') {
      setCurrentTab(currentUser?.role === 'student' ? 'topics' : 'room');
    }
    if (currentUser?.role !== 'college_admin' && currentTab === 'college_admin') {
      setCurrentTab(currentUser?.role === 'student' ? 'topics' : 'room');
    }
  }, [currentUser, currentTab]);

  // Guard: When currentUser is faculty or admin, ensure all students have isUser: false so observer mode is respected
  useEffect(() => {
    if (currentUser?.role === 'faculty' || currentUser?.role === 'college_admin' || currentUser?.role === 'super_admin') {
      setSession((prev) => ({
        ...prev,
        students: (prev.students || []).map((s) => (s.isUser ? { ...s, isUser: false } : s)),
      }));
    }
  }, [currentUser]);

  // Keep availableSlots persisted to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(availableSlots));
    } catch {}
  }, [availableSlots]);

  // Keep live faculty observation notes synchronized into availableSlots
  useEffect(() => {
    if (session.facultyLiveNotes && session.facultyLiveNotes.length > 0) {
      setAvailableSlots((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, facultyLiveNotes: session.facultyLiveNotes } : s))
      );
    }
  }, [session.id, session.facultyLiveNotes]);

  // Student live-session status polling: backend remains the source of truth.
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') return;
    const collegeCode = (currentUser as any).collegeCode || 'DIT';
    const timer = setInterval(async () => {
      try {
        const slots = await fetchCollegeSlots(collegeCode);
        // Even an empty response is authoritative: the college currently has no published slots.
        // Backend is authoritative: slots missing from the response were deleted
        // and must disappear from the student portal as well.
        setAvailableSlots(slots.map((fresh: any) => ({
          ...fresh,
          status: fresh.status === 'active' ? 'active' : fresh.status === 'completed' ? 'completed' : 'waiting',
        })));
        setSession((prev) => {
          const fresh = slots.find((s: any) => s.id === prev.id);
          if (!fresh) {
            return slots[0]
              ? { ...prev, ...slots[0], status: slots[0].status === 'active' ? 'active' : slots[0].status === 'completed' ? 'completed' : 'waiting' }
              : prev;
          }
          return { ...prev, ...fresh, status: fresh.status === 'active' ? 'active' : fresh.status === 'completed' ? 'completed' : 'waiting' };
        });
      } catch {}
    }, 2000);
    return () => clearInterval(timer);
  }, [currentUser]);

  // Reset slots back to clean demo defaults
  const handleResetSlots = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3', 'erus_available_slots_v4', 'erus_available_slots_v5', 'erus_available_slots_v6', 'erus_available_slots_v7', 'erus_available_slots_v8'].forEach((k) => {
        localStorage.removeItem(k);
      });
    } catch {}
    setAvailableSlots(INITIAL_SLOTS);
    setSession(INITIAL_SLOTS[0]);
    setElapsedSeconds(0);
  };

  // Handle Login Event
  const handleLogin = (user: AuthUser) => {
    facilitatorVoice.stop();
    setCurrentUser(user);
    try {
      localStorage.setItem('erus_auth_user', JSON.stringify(user));
    } catch {}

    // Fetch real slots from backend. Faculty portals are restricted to their assigned sessions.
    const collegeCode = (user as any).collegeCode || 'DIT';
    const slotSource = user.role === 'faculty'
      ? fetchFacultyAssignedSlots((user as any).facultyId || user.id, collegeCode)
      : fetchCollegeSlots(collegeCode);
    slotSource.then((backendSlots) => {
      if (backendSlots) {
        // Map backend slot objects to GDSession format expected by the frontend
        const mappedSlots: GDSession[] = backendSlots.map((s: any): GDSession => ({
          ...INITIAL_SESSION,
          id: s.id,
          topic: s.topic || s.slotName || 'Group Discussion',
          description: s.description || '',
          slotName: s.slotName || s.topic || 'Slot',
          slotTiming: s.slotTiming || '',
          durationMinutes: s.durationMinutes || 15,
          difficulty: s.difficulty || 'Intermediate',
          assessmentRubric: s.assessmentRubric || 'Standard Academic 7-Parameter Rubric',
          status: s.status === 'active' ? 'active' : s.status === 'completed' ? 'completed' : 'waiting',
          students: s.students && s.students.length > 0 ? s.students : generateSlotParticipants(s.enrolledCount || 8),
          currentPhase: 'intro',
          facilitatorSpeech: `Welcome to ${s.slotName || 'this GD slot'}. Session begins once started by the Faculty In-Charge.`,
          facilitatorAction: 'Waiting for Faculty In-Charge to commence session',
          isFacilitatorSpeaking: false,
          silenceTimerSeconds: 0,
          currentSpeakerId: null,
          breakoutRooms: [],
          enrolledCount: s.enrolledCount ?? (s.students?.length ?? 0),
          maxCapacity: s.maxCapacity ?? 15,
          assignedFacultyId: s.assignedFacultyId || '',
          assignedFacultyName: s.assignedFacultyName || '',
          assignedFacultyEmail: s.assignedFacultyEmail || '',
          assignedFacultyDept: s.assignedFacultyDept || '',
          facultyLiveNotes: s.facultyLiveNotes || [],
          createdAt: s.createdAt || new Date().toISOString(),
        }));
        // The backend response is authoritative, including an empty array.
        // This prevents stale local/demo topics from hiding the real college roster.
        setAvailableSlots(mappedSlots);
        setSession(mappedSlots[0] || INITIAL_SESSION);
      }
    }).catch(() => {/* Backend unreachable — slots stay empty until admin creates them */});

    if (user.role === 'student') {
      setViewingStudentId(null);
      const studentKey = user.id || user.email || 'student';
      // Retrieve topic bookings if candidate booked previously
      const bookedTopics = getStudentBookedSlotsByTopic(studentKey);
      setStudentBookedSlotsByTopic(bookedTopics);

      const bookedIds = Object.values(bookedTopics);
      if (bookedIds.length > 0) {
        const targetBookedSlot = availableSlots.find((s) => bookedIds.includes(s.id)) || session;
        const activeSlotId = targetBookedSlot.id;
        const studentUserObj: Student = {
          ...INITIAL_SESSION.students[0],
          id: user.id || 'slot-stu-1',
          name: user.name,
          college: user.college,
          course: user.course,
          batch: user.batch,
          isUser: true,
          bookedSlotId: activeSlotId,
        };
        const initialStudentReport = generateStudentReport(studentUserObj, targetBookedSlot.topic, targetBookedSlot.durationMinutes);
        setActiveReport(initialStudentReport);
        addReportToStudentHistory(initialStudentReport);

        setAvailableSlots((prevSlots) =>
          prevSlots.map((slot) => {
            const isUserInSlot = bookedIds.includes(slot.id);
            return {
              ...slot,
              students: (slot.students || generateSlotParticipants(slot.enrolledCount || 8)).map((s, idx) => {
                const shouldBeUser = isUserInSlot && (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber);
                return {
                  ...s,
                  isUser: shouldBeUser,
                  name: shouldBeUser ? user.name : s.name,
                  college: shouldBeUser ? user.college : s.college,
                  course: shouldBeUser ? user.course : s.course,
                  batch: shouldBeUser ? user.batch : s.batch,
                };
              }),
            };
          })
        );
        setSession((prev) => ({
          ...targetBookedSlot,
          students: targetBookedSlot.students.map((s, idx) => ({
            ...s,
            isUser: idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber,
            name: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.name : s.name,
            college: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.college : s.college,
            course: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.course : s.course,
            batch: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.batch : s.batch,
          })),
        }));
      }

      // Candidate always lands on Topics & Slot Booking after logging in
      setCurrentTab('topics');
    } else if (user.role === 'faculty') {
      // Faculty evaluator starts at the Faculty Analytics dashboard. The
      // authoritative assigned slots were already fetched above; normalize
      // their participant arrays before rendering so a backend slot without
      // a local students array can never crash the dashboard.
      setCurrentTab('faculty');
    } else if (user.role === 'college_admin') {
      setSession((prev) => ({
        ...prev,
        students: (prev.students || []).map((s) => ({ ...s, isUser: false })),
      }));
      setCurrentTab('college_admin');
    } else if (user.role === 'super_admin') {
      setCurrentTab('super_admin');
    }
  };

  // Handle Logout Event
  const handleLogout = () => {
    facilitatorVoice.stop();
    setCurrentUser(null);
    clearStoredAuth();
  };

  // Verify stored JWT session token with Backend on mount
  useEffect(() => {
    verifyCurrentSession().then((verifiedUser) => {
      if (verifiedUser) {
        setCurrentUser(verifiedUser);
      }
    });
  }, []);

  // Sync voice engine mute state
  useEffect(() => {
    facilitatorVoice.setMuted(voiceMuted);
  }, [voiceMuted]);

  // Stop any active AI speech when outside of the discussion room or when session is not actively ongoing
  useEffect(() => {
    if (currentTab !== 'room' || session.status !== 'active') {
      facilitatorVoice.stop();
    }
  }, [currentTab, session.status]);

  // Main session elapsed timer & silence deadlock tracker (Strictly active only when room is live)
  useEffect(() => {
    if (!currentUser || currentTab !== 'room' || session.status !== 'active') return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);

      // Deadlock silence detection
      setSession((prevSession) => {
        const newSilence = prevSession.silenceTimerSeconds + 1;
        // If silence reaches 20 seconds, trigger deadlock prompt
        if (newSilence === 20 && !prevSession.isFacilitatorSpeaking && !prevSession.currentSpeakerId) {
          triggerDeadlockIntervention(prevSession);
        }
        return {
          ...prevSession,
          silenceTimerSeconds: newSilence,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentUser, currentTab, session.status, session.isFacilitatorSpeaking, session.currentSpeakerId]);

  // Faculty In-Charge / Host Commences the Discussion Session
  const handleStartSession = (slotIdToStart?: string) => {
    if (currentUser?.role !== 'faculty') {
      return;
    }
    const targetSlotId = slotIdToStart || session.id;
    if (session.assignedFacultyId && (currentUser as any).facultyId !== session.assignedFacultyId) {
      alert('Only the faculty assigned to this GD slot can start the session.');
      return;
    }

    // Reset timer to 0 for a fresh live discussion
    setElapsedSeconds(0);

    const welcomeIntroText = `Welcome participants to today's group discussion on "${session.topic}". The discussion has now officially commenced. Each participant will get an opportunity to present their perspectives. Please respect others and avoid interruptions. Let us begin. Who would like to open the discussion?`;

    sessionQuestionTracker.clear();

    // Update active session status and reset speaking metrics for fresh live discussion
    setSession((prev) => ({
      ...prev,
      status: 'active',
      silenceTimerSeconds: 0,
      currentPhase: 'intro',
      facilitatorSpeech: welcomeIntroText,
      isFacilitatorSpeaking: true,
      startedAt: Date.now(),
      students: prev.students.map((s) => ({
        ...s,
        speakingTurns: 0,
        speakingDurationSeconds: 0,
        isSpeaking: false,
      })),
    }));

    // Update availableSlots list
    setAvailableSlots((prevSlots) =>
      prevSlots.map((s) => (s.id === targetSlotId ? { 
        ...s, 
        status: 'active', 
        startedAt: Date.now(),
        students: s.students.map((st) => ({
          ...st,
          speakingTurns: 0,
          speakingDurationSeconds: 0,
          isSpeaking: false,
        })),
      } : s))
    );

    // Speak introduction only if voice is not muted and currently viewing room
    if (!voiceMuted && currentTab === 'room') {
      facilitatorVoice.speak(welcomeIntroText, () => {
        setSession((prev) => ({ ...prev, isFacilitatorSpeaking: false }));
      });
    }

    // Initialize clean transcripts list with AI welcome intro
    setTranscripts([
      {
        id: `t-start-${Date.now()}`,
        sessionId: targetSlotId,
        speakerId: 'ai-facilitator',
        speakerName: 'AI Facilitator (ERUS)',
        seatNumber: null,
        isFacilitator: true,
        timestamp: '00:00',
        timestampSeconds: 0,
        text: welcomeIntroText,
        type: 'intro',
        sentiment: 'positive',
      },
    ]);

    // Notify backend
    if (currentUser?.role === 'faculty') {
      fetch(`/api/college/slots/${encodeURIComponent(targetSlotId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facultyId: (currentUser as any).facultyId || currentUser.id }),
      }).then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Unable to start GD session');
        }
      }).catch((err) => console.warn('Backend start session sync:', err));
    }
  };

  // Deadlock intervention helper using unique non-repeating dynamic prompt generator
  const triggerDeadlockIntervention = (currentSession: GDSession) => {
    const nextPrompt = getNextUniqueFacilitatorPrompt(
      currentSession.topic,
      transcripts,
      currentSession.students,
      'probing',
      true // deadlock recovery triggered
    );

    const promptText = nextPrompt.text;
    facilitatorVoice.speak(promptText);

    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    setTranscripts((prev) => [
      ...prev,
      {
        id: `t-deadlock-${Date.now()}`,
        sessionId: currentSession.id,
        speakerId: 'ai-facilitator',
        speakerName: 'AI Facilitator (ERUS)',
        seatNumber: null,
        isFacilitator: true,
        timestamp: `${mins}:${secs}`,
        timestampSeconds: elapsedSeconds,
        text: promptText,
        type: 'probing',
        sentiment: 'constructive',
      },
    ]);

    setSession((prev) => ({
      ...prev,
      facilitatorSpeech: promptText,
      facilitatorAction: 'Deadlock intervention (20s silence)',
      currentPhase: 'probing',
      silenceTimerSeconds: 0,
    }));
  };

  // Conclude GD and generate report
  const handleFinishSession = async () => {
    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    if (!userStudent) return;

    const finishedSlotId = session.id;

    try {
      if (currentUser?.role === 'faculty') {
        // Faculty completion is the authoritative finalization point.
        // The backend evaluates every real participant, persists every report,
        // finalizes the transcript, and then closes the slot.
        const endRes = await fetch('/api/college/slots/' + encodeURIComponent(finishedSlotId) + '/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facultyId: (currentUser as any).facultyId || currentUser.id }),
        });
        const endData = await endRes.json().catch(() => ({}));
        if (!endRes.ok) throw new Error(endData.error || 'Unable to finalize GD session');

        const ownReport = Array.isArray(endData.reports)
          ? endData.reports.find((r: StudentAssessmentReport) => r.studentId === userStudent.id)
          : null;
        if (ownReport) {
          const enhancedReport: StudentAssessmentReport = {
            ...ownReport,
            facultyLiveNotes: session.facultyLiveNotes?.filter(
              (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
            ),
          };
          setActiveReport(enhancedReport);
          addReportToStudentHistory(enhancedReport);
        }

        setSession((prev) => ({
          ...prev,
          status: 'completed',
          currentPhase: 'conclusion',
          facilitatorSpeech: 'Thank you everyone. The final transcript and participant evaluations have been compiled.',
        }));
        setAvailableSlots((prevSlots) =>
          prevSlots.map((slot) =>
            slot.id === finishedSlotId
              ? { ...slot, status: 'completed', currentPhase: 'conclusion', facultyLiveNotes: session.facultyLiveNotes || slot.facultyLiveNotes }
              : slot
          )
        );
      } else {
        // Students can request their own evaluation, but cannot close the GD.
        const res = await fetch('/api/facilitator/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student: userStudent,
            transcriptHistory: transcripts,
            sessionId: finishedSlotId,
            topic: session.topic,
            durationMinutes: session.durationMinutes,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.report) throw new Error(data.error || 'Unable to generate assessment');
        const enhancedReport: StudentAssessmentReport = {
          ...data.report,
          facultyLiveNotes: session.facultyLiveNotes?.filter(
            (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
          ),
        };
        setActiveReport(enhancedReport);
        addReportToStudentHistory(enhancedReport);
      }

      setCurrentTab('report');
    } catch (e) {
      console.error('[Evaluation] Finalization failed:', e);
      alert(e instanceof Error ? e.message : 'Unable to generate the assessment report.');
    }
  };

  const handleSelectSlot = (slotId: string) => {
    const targetSlot = availableSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;

    // One Slot Per Topic Policy: Enforce that students cannot select a different slot on a topic they already booked
    if (currentUser && currentUser.role === 'student') {
      const studentKey = currentUser.id || currentUser.email || 'student';
      const topicKey = targetSlot.topic || 'General Topic';
      const bookedOnTopic = studentBookedSlotsByTopic[topicKey];
      if (bookedOnTopic && bookedOnTopic !== slotId) {
        const bookedSlot = availableSlots.find((s) => s.id === bookedOnTopic);
        alert(`Slot Locked: You have already booked ${bookedSlot?.slotName || 'a slot'} for this topic ("${topicKey}"). Under institutional policy, candidates can only book one slot per topic. You may choose slots on other topics.`);
        return;
      }
      if (!bookedOnTopic) {
        const targetMaxCap = targetSlot.maxCapacity || 15;
        const targetCurrentEnrolled = targetSlot.enrolledCount ?? targetSlot.students?.length ?? 15;
        if (targetSlot.status !== 'completed' && targetCurrentEnrolled >= targetMaxCap) {
          alert(`Slot "${targetSlot.slotName || targetSlot.id}" is full (${targetCurrentEnrolled}/${targetMaxCap} students). Please select an open slot.`);
          return;
        }
        setStudentBookedSlotForTopic(studentKey, topicKey, slotId);
        setStudentBookedSlotsByTopic((prev) => ({ ...prev, [topicKey]: slotId }));
      }
    }

    // Handle Completed Session Click:
    // Never open the GD room again or play AI voice.
    // - Students see their individual 7-parameter assessment report.
    // - Faculty & Admins see overall reports and cohort analytics.
    if (targetSlot.status === 'completed') {
      facilitatorVoice.stop();
      sessionQuestionTracker.clear();

      let slotForState = targetSlot;
      if (currentUser && currentUser.role === 'student') {
        const targetStudents = targetSlot.students || [];
        let updatedTargetStudents: Student[];
        if (targetStudents.length > 0) {
          updatedTargetStudents = targetStudents.map((s, idx) => ({
            ...s,
            isUser: idx === 0 || s.id === currentUser.id,
            name: (idx === 0 || s.id === currentUser.id) ? currentUser.name : s.name,
            college: (idx === 0 || s.id === currentUser.id) ? currentUser.college : s.college,
            course: (idx === 0 || s.id === currentUser.id) ? currentUser.course : s.course,
            batch: (idx === 0 || s.id === currentUser.id) ? currentUser.batch : s.batch,
          }));
        } else {
          updatedTargetStudents = generateSlotParticipants(15).map((s, idx) => ({
            ...s,
            isUser: idx === 0,
            name: idx === 0 ? currentUser.name : s.name,
            college: idx === 0 ? currentUser.college : s.college,
            course: idx === 0 ? currentUser.course : s.course,
            batch: idx === 0 ? currentUser.batch : s.batch,
          }));
        }
        slotForState = { ...targetSlot, students: updatedTargetStudents };
        setSession(slotForState);

        const userStudent = slotForState.students.find((s) => s.isUser) || slotForState.students[0];
        const studentReport = generateStudentReport(userStudent, targetSlot.topic, targetSlot.durationMinutes);
        setActiveReport(studentReport);
        addReportToStudentHistory(studentReport);
        setViewingStudentId(userStudent.id);
        setCurrentTab('report');
      } else {
        const facultyStudents = (targetSlot.students || []).map((s) => ({ ...s, isUser: false }));
        slotForState = {
          ...targetSlot,
          students: facultyStudents.length > 0 ? facultyStudents : generateSlotParticipants(15).map((s) => ({ ...s, isUser: false })),
        };
        setSession(slotForState);
        setCurrentTab('faculty');
      }
      return;
    }

    if (slotId === session.id) return; // already in this slot

    const targetMaxCap = targetSlot.maxCapacity || 15;
    const targetCurrentEnrolled = targetSlot.enrolledCount ?? targetSlot.students?.length ?? 15;

    // Check if slot is already full
    if (currentUser?.role === 'student' && targetCurrentEnrolled >= targetMaxCap) {
      alert(`Slot "${targetSlot.slotName || targetSlot.id}" is full (${targetCurrentEnrolled}/${targetMaxCap} students). Please select an open slot.`);
      return;
    }

    sessionQuestionTracker.clear();

    const previousSlotId = session.id;

    // Build updated student roster for target slot with user at Seat 1
    const targetStudents = targetSlot.students || [];
    let updatedTargetStudents: Student[];

    if (currentUser && currentUser.role === 'student') {
      if (targetStudents.length > 0) {
        updatedTargetStudents = targetStudents.map((s, idx) => ({
          ...s,
          isUser: idx === 0 || s.id === currentUser.id,
          name: (idx === 0 || s.id === currentUser.id) ? currentUser.name : s.name,
          college: (idx === 0 || s.id === currentUser.id) ? currentUser.college : s.college,
          course: (idx === 0 || s.id === currentUser.id) ? currentUser.course : s.course,
          batch: (idx === 0 || s.id === currentUser.id) ? currentUser.batch : s.batch,
        }));
      } else {
        updatedTargetStudents = generateSlotParticipants(targetCurrentEnrolled + 1).map((s, idx) => ({
          ...s,
          isUser: idx === 0,
          name: idx === 0 ? currentUser.name : s.name,
          college: idx === 0 ? currentUser.college : s.college,
          course: idx === 0 ? currentUser.course : s.course,
          batch: idx === 0 ? currentUser.batch : s.batch,
        }));
      }
    } else {
      updatedTargetStudents = targetStudents.map((s) => ({ ...s, isUser: false }));
    }

    const isStudentUser = currentUser && currentUser.role === 'student';
    const newTargetEnrolledCount = isStudentUser
      ? Math.min(targetMaxCap, targetCurrentEnrolled + 1)
      : targetCurrentEnrolled;

    const targetStatus = targetSlot.status === 'completed'
      ? 'completed'
      : (targetSlot.status === 'active' ? 'active' : 'waiting');

    const activeSlot: GDSession = {
      ...targetSlot,
      status: targetStatus,
      maxCapacity: targetMaxCap,
      enrolledCount: newTargetEnrolledCount,
      students: updatedTargetStudents,
    };

    // Update availableSlots:
    if (isStudentUser) {
      setAvailableSlots((prevSlots) =>
        prevSlots.map((s) => {
          if (s.id === slotId) {
            return activeSlot;
          }
          if (s.id === previousSlotId) {
            const prevCount = s.enrolledCount ?? s.students?.length ?? 15;
            const newPrevCount = Math.max(1, prevCount - 1);
            return {
              ...s,
              status: s.status === 'completed' ? 'completed' : 'waiting',
              enrolledCount: newPrevCount,
              students: (s.students || generateSlotParticipants(s.enrolledCount || 8)).map((st) => (st.isUser ? { ...st, isUser: false } : st)),
            };
          }
          return s;
        })
      );
    } else {
      setAvailableSlots((prevSlots) =>
        prevSlots.map((s) => (s.id === slotId ? activeSlot : s))
      );
    }

    setSession(activeSlot);
    setTranscripts([
      {
        id: `t-slot-${Date.now()}`,
        sessionId: activeSlot.id,
        speakerId: 'ai-facilitator',
        speakerName: 'AI Facilitator (ERUS)',
        seatNumber: null,
        isFacilitator: true,
        timestamp: '00:00',
        timestampSeconds: 0,
        text: activeSlot.status === 'active'
          ? (activeSlot.facilitatorSpeech || `Welcome to ${activeSlot.slotName || 'this slot'}. The discussion on "${activeSlot.topic}" is underway.`)
          : `Welcome to ${activeSlot.slotName || 'this slot'}. The discussion on "${activeSlot.topic}" is currently in the waiting lobby. The session will commence once started by Faculty In-Charge (${activeSlot.assignedFacultyName || 'Assigned Faculty'}).`,
        type: 'intro',
        sentiment: 'positive',
      },
    ]);
    setElapsedSeconds(0);
  };

  const handleCreateSessions = (newSessions: GDSession[]) => {
    if (!newSessions || newSessions.length === 0) return;

    sessionQuestionTracker.clear();
    setAvailableSlots((prev) => [...newSessions, ...prev]);

    // Persist new slots to backend college API if college admin
    if (currentUser?.role === 'college_admin') {
      newSessions.forEach((s) => {
        createCollegeSlot({
          topic: s.topic,
          description: s.description,
          durationMinutes: s.durationMinutes,
          difficulty: s.difficulty,
          slotTiming: s.slotTiming,
          slotName: s.slotName,
          maxCapacity: s.maxCapacity || 15,
          collegeCode: (currentUser as any).collegeCode || 'DIT',
          assignedFacultyId: s.assignedFacultyId,
          assignedFacultyName: s.assignedFacultyName,
          assignedFacultyDept: s.assignedFacultyDept,
          assignedFacultyEmail: s.assignedFacultyEmail,
        }).catch((err) => console.warn('Failed to sync new slot to backend:', err));
      });
    }

    const activeNewSession = { ...newSessions[0], status: 'scheduled' as const };
    setSession(activeNewSession);
    setTranscripts([
      {
        id: `t-init-${Date.now()}`,
        sessionId: activeNewSession.id,
        speakerId: 'ai-facilitator',
        speakerName: 'AI Facilitator (ERUS)',
        seatNumber: null,
        isFacilitator: true,
        timestamp: '00:00',
        timestampSeconds: 0,
        text: activeNewSession.facilitatorSpeech,
        type: 'intro',
        sentiment: 'positive',
      },
    ]);
    setElapsedSeconds(0);

    // Keep college admin in the admin dashboard so they can review their created slots
    if (currentUser?.role === 'college_admin') {
      setCurrentTab('college_admin');
    } else {
      setCurrentTab('room');
    }
  };

  const handleCreateSession = (newSession: GDSession) => {
    handleCreateSessions([newSession]);
  };

  const handleViewStudentReport = (studentId: string) => {
    setViewingStudentId(studentId);
    setCurrentTab('report');
  };

  // Student books a slot (One Slot Per Topic Policy)
  const handleBookSlot = async (slotId: string) => {
    if (!currentUser || currentUser.role !== 'student') return;
    const studentKey = currentUser.id || currentUser.email || 'student';

    const targetSlot = availableSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;
    const topicKey = targetSlot.topic || 'General Topic';

    // One Slot Per Topic Policy: Candidate cannot book more than one slot for the SAME topic
    const existingSlotIdOnThisTopic = studentBookedSlotsByTopic[topicKey];
    if (existingSlotIdOnThisTopic) {
      const alreadyBooked = availableSlots.find((s) => s.id === existingSlotIdOnThisTopic);
      alert(`Under institutional policy, candidates can only book one slot per topic. You already have a confirmed booking for "${alreadyBooked?.slotName || topicKey}". You may select slots on other topics or revive this slot before 1 hour of its start time.`);
      return;
    }

    const maxCap = targetSlot.maxCapacity || 15;
    const currentEnrolled = targetSlot.enrolledCount ?? targetSlot.students?.length ?? 0;
    if (targetSlot.status !== 'completed' && currentEnrolled >= maxCap) {
      alert(`Slot "${targetSlot.slotName || targetSlot.id}" is full (${currentEnrolled}/${maxCap} candidates). Please select another open slot.`);
      return;
    }

    // Backend validates and persists the booking first. Frontend state follows it.
    try {
      const bookingRes = await fetch('/api/student/book-slot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('erus_jwt_token')
            ? { Authorization: 'Bearer ' + localStorage.getItem('erus_jwt_token') }
            : {}),
        },
        body: JSON.stringify({
          // Send all stable identifiers. This handles older browser sessions
          // whose stored currentUser.id is a legacy id while PostgreSQL uses a
          // different CUID for the same student account.
          studentId: currentUser.id,
          studentIdentifier: (currentUser as any).studentId || currentUser.email || currentUser.id,
          studentEmail: currentUser.email,
          studentStudentId: (currentUser as any).studentId,
          studentName: currentUser.name,
          studentCollege: currentUser.college,
          slotId,
          topic: topicKey,
        }),
      });
      const bookingData = await bookingRes.json().catch(() => ({}));
      if (!bookingRes.ok || !bookingData.success) {
        alert(bookingData.error || 'Unable to book this GD slot.');
        return;
      }
    } catch {
      alert('Unable to reach the ERUS server. The slot was not booked.');
      return;
    }

    setStudentBookedSlotForTopic(studentKey, topicKey, slotId);
    setStudentBookedSlotsByTopic((prev) => ({ ...prev, [topicKey]: slotId }));

    // Update students list in the booked slot
    const targetStudents = targetSlot.students || [];
    let updatedTargetStudents: Student[];
    if (targetStudents.length > 0) {
      updatedTargetStudents = targetStudents.map((s, idx) => ({
        ...s,
        isUser: idx === 0 || s.id === currentUser.id,
        name: (idx === 0 || s.id === currentUser.id) ? currentUser.name : s.name,
        college: (idx === 0 || s.id === currentUser.id) ? currentUser.college : s.college,
        course: (idx === 0 || s.id === currentUser.id) ? currentUser.course : s.course,
        batch: (idx === 0 || s.id === currentUser.id) ? currentUser.batch : s.batch,
        bookedSlotId: slotId,
      }));
    } else {
      updatedTargetStudents = generateSlotParticipants(currentEnrolled + 1).map((s, idx) => ({
        ...s,
        isUser: idx === 0,
        name: idx === 0 ? currentUser.name : s.name,
        college: idx === 0 ? currentUser.college : s.college,
        course: idx === 0 ? currentUser.course : s.course,
        batch: idx === 0 ? currentUser.batch : s.batch,
        bookedSlotId: slotId,
      }));
    }

    const updatedSlot: GDSession = {
      ...targetSlot,
      enrolledCount: Math.min(maxCap, currentEnrolled + 1),
      students: updatedTargetStudents,
    };

    setAvailableSlots((prevSlots) =>
      prevSlots.map((s) => (s.id === slotId ? updatedSlot : s))
    );

    setSession(updatedSlot);

    const studentUserObj = updatedTargetStudents.find((s) => s.isUser) || updatedTargetStudents[0];
    const initialStudentReport = generateStudentReport(studentUserObj, targetSlot.topic, targetSlot.durationMinutes);
    setActiveReport(initialStudentReport);
    addReportToStudentHistory(initialStudentReport);
  };

  // Student revives (releases/cancels) their booked slot before 1 hour of slot start
  const handleReviveSlot = (slotId: string) => {
    if (!currentUser || currentUser.role !== 'student') return;
    const studentKey = currentUser.id || currentUser.email || 'student';

    const targetSlot = availableSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;
    const topicKey = targetSlot.topic || 'General Topic';

    // Check 1-hour policy
    const check = checkCanReviveSlot(targetSlot);
    if (!check.canRevive) {
      alert(`Cannot Revive Slot: ${check.reason}`);
      return;
    }

    // Clear local storage and state for this topic
    clearStudentBookedSlotForTopic(studentKey, topicKey, slotId);
    setStudentBookedSlotsByTopic((prev) => {
      const next = { ...prev };
      delete next[topicKey];
      return next;
    });

    // Sync cancellation to backend
    try {
      fetch('/api/student/cancel-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentKey,
          studentIdentifier: studentKey,
          slotId,
          topic: topicKey,
        }),
      }).catch((err) => console.warn('[Student Slot Cancel Sync]:', err));
    } catch {}

    // Decrement enrolled count and remove isUser flag from slot students
    setAvailableSlots((prevSlots) =>
      prevSlots.map((s) => {
        if (s.id === slotId) {
          const currentCount = s.enrolledCount ?? s.students?.length ?? 1;
          return {
            ...s,
            enrolledCount: Math.max(0, currentCount - 1),
            students: s.students.map((st) => (st.isUser ? { ...st, isUser: false } : st)),
          };
        }
        return s;
      })
    );

    if (session.id === slotId) {
      setSession((prev) => ({
        ...prev,
        students: prev.students.map((st) => (st.isUser ? { ...st, isUser: false } : st)),
      }));
    }
  };

  // If unauthenticated, render the Dedicated Student / Faculty Authentication Portal
  if (!currentUser) {
    return <AuthPortal onLogin={handleLogin} defaultRole="student" />;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      
      {/* Top Main Navigation Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        session={session}
        voiceMuted={voiceMuted}
        setVoiceMuted={setVoiceMuted}
        elapsedSeconds={elapsedSeconds}
        onOpenCreateSession={() => setIsCreateModalOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        bookedSlotId={studentBookedSlotId}
      />

      {/* Main Responsive Application Viewport */}
      <main className="flex-1 pb-10 px-2 sm:px-4 max-w-7xl mx-auto w-full">
        {currentTab === 'topics' && (
          <StudentTopicPortal
            availableSlots={availableSlots}
            bookedSlotId={studentBookedSlotId}
            bookedSlotsByTopic={studentBookedSlotsByTopic}
            currentUser={currentUser}
            onBookSlot={handleBookSlot}
            onReviveSlot={handleReviveSlot}
            onEnterRoom={(slotId) => {
              handleSelectSlot(slotId);
              setCurrentTab('room');
              const target = availableSlots.find((s) => s.id === slotId);
              // Students never start a GD. They only enter after the assigned
              // faculty starts it; Socket.IO/polling will update the status.
            }}
          />
        )}

        {currentTab === 'room' && (
          <RealisticGDRoom
            session={session}
            setSession={setSession}
            transcripts={transcripts}
            setTranscripts={setTranscripts}
            onFinishSession={handleFinishSession}
            onStartSession={handleStartSession}
            voiceMuted={voiceMuted}
            elapsedSeconds={elapsedSeconds}
            availableSlots={availableSlots}
            onSelectSlot={handleSelectSlot}
            onResetSlots={handleResetSlots}
            currentUser={currentUser}
            bookedSlotId={studentBookedSlotId}
            onUpdateLayout={(newLayout) => {
              setSession((prev) => ({ ...prev, roomLayout: newLayout }));
              setAvailableSlots((prev) =>
                prev.map((s) => (s.id === session.id ? { ...s, roomLayout: newLayout } : s))
              );
            }}
          />
        )}

        {currentTab === 'report' && (
          <StudentReportView
            session={session}
            report={activeReport}
            onBackToRoom={() => {
              if (session.status === 'completed') {
                if (currentUser?.role !== 'student') {
                  const openSlot = availableSlots.find((s) => s.status !== 'completed');
                  if (openSlot) {
                    handleSelectSlot(openSlot.id);
                    return;
                  }
                }
              }
              setCurrentTab('room');
            }}
            onViewFacultyDashboard={() => setCurrentTab('faculty')}
            currentUser={currentUser}
            targetStudentId={viewingStudentId}
            availableSlots={availableSlots}
            onSelectSlot={handleSelectSlot}
            bookedSlotId={studentBookedSlotId}
          />
        )}

        {currentTab === 'faculty' && (
          <FacultyDashboardView
            session={session}
            transcripts={transcripts}
            onViewStudentReport={handleViewStudentReport}
            onBackToRoom={() => {
              if (session.status === 'completed') {
                const openSlot = availableSlots.find((s) => s.status !== 'completed');
                if (openSlot) {
                  handleSelectSlot(openSlot.id);
                  return;
                }
              }
              setCurrentTab('room');
            }}
            onStartSession={handleStartSession}
            availableSlots={availableSlots}
            onSelectSlot={handleSelectSlot}
            facultyId={currentUser?.role === 'faculty' ? ((currentUser as any).facultyId || currentUser.id) : undefined}
          />
        )}

        {currentTab === 'super_admin' && currentUser?.role === 'super_admin' && (
          <SuperAdminDashboard
            currentUser={currentUser}
          />
        )}

        {currentTab === 'college_admin' && currentUser?.role === 'college_admin' && (
          <CollegeAdminDashboard
            currentUser={currentUser}
            availableSlots={availableSlots}
            onOpenCreateSession={() => setIsCreateModalOpen(true)}
            onCreateSlot={handleCreateSession}
            onEnterGDRoom={(slot) => {
              if (slot) {
                handleSelectSlot(typeof slot === 'string' ? slot : (slot.id || ''));
              } else {
                setCurrentTab('room');
              }
            }}
          />
        )}
      </main>

      {/* Session Creation Modal */}
      <SessionCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSessions={handleCreateSessions}
        onCreateSession={handleCreateSession}
        collegeCode={currentUser?.role === 'college_admin' ? currentUser.collegeCode : undefined}
      />

    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <GDAppContent />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
