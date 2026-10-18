/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header, NavTabType } from './components/Header';
import { RealisticGDRoom } from './components/GDRoom/RealisticGDRoom';
import { ClassroomPresentationRoom } from './components/ClassroomPresentation/ClassroomPresentationRoom';
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
  generateStudentReport,
  generateSlotParticipants,
  distributeRubricScores,
  calculateStudentOverallScore
} from './data/mockGDData';
import { addReportToStudentHistory, getStudentReportHistory } from './utils/studentReportHistory';
import { facilitatorVoice } from './utils/speechSynthesis';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { 
  clearStoredAuth, 
  getStoredUser,
  getStoredToken,
  getDeletedSlotIds,
  markSlotDeletedLocally,
  isSlotCompletedLocally,
  markSlotCompletedLocally,
  verifyCurrentSession, 
  createCollegeSlot, 
  fetchCollegeSlots, 
  fetchFacultyAssignedSlots, 
  fetchStudentAssignedSlots, 
  isFacultyAssignedToSlot, 
  isSlotAssignedToFaculty, 
  isStudentAssignedToSlot, 
  hasStudentParticipatedInSlot, 
  sendUserHeartbeat, 
  normalizeClientCollegeCode,
  areCollegeCodesEquivalent
} from './utils/authApi';
import { getSocket } from './utils/socket';
import { 
  getStudentBookedSlotsByTopic,
  setStudentBookedSlotForTopic,
  clearStudentBookedSlotForTopic,
  getStudentBookedSlotId, 
  isSlotSelectableForTopic,
  checkCanReviveSlot 
} from './utils/studentBooking';
import { sessionQuestionTracker, getNextUniqueFacilitatorPrompt } from './utils/facilitatorQuestionEngine';
import { StudentTopicPortal } from './components/StudentPortal/StudentTopicPortal';

function GDAppContent() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  const userCollegeCode = normalizeClientCollegeCode((currentUser as any)?.collegeCode || (currentUser as any)?.college || '');

  const [currentTab, setCurrentTab] = useState<NavTabType>(() => {
    const user = getStoredUser();
    if (user?.role === 'super_admin') return 'super_admin';
    if (user?.role === 'college_admin') return 'college_admin';
    if (user?.role === 'faculty') return 'faculty';
    if (user?.role === 'student') return 'topics';
    return 'topics';
  });

  const [availableSlots, setAvailableSlots] = useState<GDSession[]>([]);
  const [session, setSession] = useState<GDSession>(INITIAL_SESSION);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [activeReport, setActiveReport] = useState<StudentAssessmentReport | null>(null);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);
  const [studentBookedSlotsByTopic, setStudentBookedSlotsByTopic] = useState<Record<string, string>>(() => {
    const u = getStoredUser();
    if (u && u.role === 'student') {
      const key = u.id || u.email || 'student';
      return getStudentBookedSlotsByTopic(key);
    }
    return {};
  });

  const studentBookedSlotId = useMemo(() => {
    const values = Object.values(studentBookedSlotsByTopic);
    return values.length > 0 ? values[0] : null;
  }, [studentBookedSlotsByTopic]);

  const facultyAssignedSlots = useMemo(() => {
    const collegeFiltered = userCollegeCode
      ? availableSlots.filter((s) => {
          const sCode = normalizeClientCollegeCode((s as any).collegeCode || '');
          return !sCode || areCollegeCodesEquivalent(sCode, userCollegeCode);
        })
      : availableSlots;
    if (currentUser?.role === 'faculty') {
      return collegeFiltered.filter((s) => isFacultyAssignedToSlot(s, currentUser));
    }
    return collegeFiltered;
  }, [availableSlots, currentUser, userCollegeCode]);

  const studentParticipatedSlots = useMemo(() => {
    const collegeFiltered = userCollegeCode
      ? availableSlots.filter((s) => {
          const sCode = normalizeClientCollegeCode((s as any).collegeCode || '');
          return !sCode || areCollegeCodesEquivalent(sCode, userCollegeCode);
        })
      : availableSlots;
    if (currentUser?.role === 'student') {
      return collegeFiltered.filter((s) => hasStudentParticipatedInSlot(s, currentUser));
    }
    return collegeFiltered;
  }, [availableSlots, currentUser, userCollegeCode]);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [initialReportTab, setInitialReportTab] = useState<'single' | 'comparison' | 'journey'>('single');
  const { theme } = useTheme();
  const isFinishingSessionRef = useRef(false);

  // Guard: Role-based navigation restrictions & Completed Slot Room Lock
  useEffect(() => {
    if (currentUser?.role === 'super_admin' && currentTab !== 'super_admin') {
      setCurrentTab('super_admin');
      return;
    }
    if (currentUser?.role === 'college_admin' && currentTab !== 'college_admin' && currentTab !== 'report') {
      setCurrentTab('college_admin');
      return;
    }
    if (currentUser?.role === 'student' && (currentTab === 'faculty' || currentTab === 'college_admin' || currentTab === 'super_admin')) {
      setCurrentTab('topics');
      return;
    }
    if (currentUser?.role !== 'super_admin' && currentTab === 'super_admin') {
      setCurrentTab(currentUser?.role === 'student' ? 'topics' : (currentUser?.role === 'college_admin' ? 'college_admin' : 'faculty'));
      return;
    }
    if (currentUser?.role !== 'college_admin' && currentTab === 'college_admin') {
      setCurrentTab(currentUser?.role === 'student' ? 'topics' : 'faculty');
      return;
    }
    if (currentTab === 'room' && (session?.status === 'completed' || isSlotCompletedLocally(session?.id))) {
      setCurrentTab('report');
      return;
    }
  }, [currentUser, currentTab, session?.id, session?.status]);

  // Guard: When currentUser is faculty or admin, ensure all students have isUser: false so observer mode is respected
  useEffect(() => {
    if (currentUser?.role === 'faculty' || currentUser?.role === 'college_admin' || currentUser?.role === 'super_admin') {
      setSession((prev) => ({
        ...prev,
        students: (prev.students || []).map((s) => (s.isUser ? { ...s, isUser: false } : s)),
      }));
    }
  }, [currentUser]);
 
  // User Presence & Heartbeat Tracking for Server Capacity & Active User Monitoring
  useEffect(() => {
    if (!currentUser) return;
    sendUserHeartbeat(currentUser);
    const interval = setInterval(() => {
      sendUserHeartbeat(currentUser);
    }, 45 * 1000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Keep live faculty observation notes synchronized into availableSlots
  useEffect(() => {
    if (session?.id && session?.facultyLiveNotes && session.facultyLiveNotes.length > 0) {
      setAvailableSlots((prev) => {
        const target = prev.find((s) => s.id === session.id);
        if (target && target.facultyLiveNotes === session.facultyLiveNotes) {
          return prev;
        }
        return prev.map((s) => (s.id === session.id ? { ...s, facultyLiveNotes: session.facultyLiveNotes } : s));
      });
    }
  }, [session?.id, session?.facultyLiveNotes]);

  // Authoritative slot synchronization: runs immediately on mount and periodically for all logged-in roles
  useEffect(() => {
    if (!currentUser) return;
    const rawCode = (currentUser as any).collegeCode || (currentUser as any).college || '';
    const collegeCode = normalizeClientCollegeCode(rawCode);
    if (!collegeCode && currentUser.role !== 'super_admin') return;

    const syncSlots = async () => {
      try {
        const rawSlots = currentUser.role === 'faculty'
          ? await fetchFacultyAssignedSlots((currentUser as any).facultyId || currentUser.id, collegeCode, currentUser.email, currentUser.name)
          : currentUser.role === 'student'
          ? await fetchStudentAssignedSlots(currentUser.id || (currentUser as any).studentId, collegeCode, currentUser.email)
          : await fetchCollegeSlots(collegeCode);

        if (Array.isArray(rawSlots)) {
          const deletedIds = getDeletedSlotIds();
          let filteredRaw = rawSlots.filter((s: any) => {
            if (!s || !s.id || deletedIds.has(s.id)) return false;
            const sCode = normalizeClientCollegeCode(s.collegeCode || '');
            if (collegeCode && sCode && !areCollegeCodesEquivalent(sCode, collegeCode)) return false;
            return true;
          });
          if (currentUser.role === 'faculty') {
            filteredRaw = filteredRaw.filter((s: any) => isFacultyAssignedToSlot(s, currentUser));
          } else if (currentUser.role === 'student') {
            filteredRaw = filteredRaw.filter((s: any) => isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, currentUser));
          }
          const mappedSlots: GDSession[] = filteredRaw.map((s: any, sIdx: number): GDSession => {
            const rawName = String(s.slotName || '').replace(/\s*\(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)\)/gi, '').trim();
            const cleanName = rawName || `Slot ${sIdx + 1}`;
            const isTopicAllotted = typeof s.topic === 'string' && s.topic.trim() !== '' && !/^slot\s+\d+\s*$/i.test(s.topic) && !s.topic.toLowerCase().includes('pending');
            const cleanTopic = isTopicAllotted ? s.topic.trim() : '';

            const recUrlStr = typeof s.recordingUrl === 'string' ? s.recordingUrl : (s.recordingUrl?.recordingUrl || s.recordingUrl?.url || '');
            const finalRecUrl = (recUrlStr && !recUrlStr.startsWith('blob:')) ? recUrlStr : '';

            if (s.status === 'completed') {
              markSlotCompletedLocally(s.id);
            }
            const isDone = s.status === 'completed' || isSlotCompletedLocally(s.id);

            return {
              ...INITIAL_SESSION,
              id: s.id,
              collegeCode: normalizeClientCollegeCode(s.collegeCode || collegeCode),
              activityType: s.activityType || 'gd',
              presentationTopics: s.presentationTopics || undefined,
              topic: cleanTopic,
              description: s.description || '',
              slotName: cleanName,
              slotTiming: s.slotTiming || '',
            slotDate: s.slotDate || s.scheduledTime || (s.createdAt ? s.createdAt.split('T')[0] : 'Today'),
            durationMinutes: s.durationMinutes || (s.activityType === 'presentation' ? 60 : 15),
            difficulty: s.difficulty || 'Intermediate',
            assessmentRubric: s.assessmentRubric || 'Standard Academic 7-Parameter Rubric',
            status: isDone ? 'completed' : s.status === 'active' ? 'active' : 'waiting',
            students: Array.isArray(s.students) && s.students.length > 0 ? s.students : generateSlotParticipants(Math.max(s.enrolledCount || 0, s.maxCapacity || 8)),
            currentPhase: isDone ? 'conclusion' : 'intro',
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
            recordingUrl: finalRecUrl,
            recordingDurationSeconds: s.recordingDurationSeconds || 0,
            recordingFileSize: s.recordingFileSize || 0,
            recordedAt: s.recordedAt || '',
            createdAt: s.createdAt || new Date().toISOString(),
          };
        });

          setAvailableSlots((prev) => {
            if (prev.length === mappedSlots.length) {
              const isDiff = mappedSlots.some((ns, idx) => {
                const ps = prev[idx];
                return (
                  ps.id !== ns.id ||
                  ps.status !== ns.status ||
                  ps.topic !== ns.topic ||
                  ps.slotTiming !== ns.slotTiming ||
                  ps.recordingUrl !== ns.recordingUrl ||
                  ps.enrolledCount !== ns.enrolledCount ||
                  (ps.students?.length || 0) !== (ns.students?.length || 0) ||
                  (ps.facultyLiveNotes?.length || 0) !== (ns.facultyLiveNotes?.length || 0)
                );
              });
              if (!isDiff) return prev;
            }
            return mappedSlots;
          });

          setSession((prev) => {
            if (!prev) return mappedSlots[0] || INITIAL_SESSION;
            const fresh = mappedSlots.find((s) => s.id === prev.id);
            if (!fresh) return mappedSlots[0] ? { ...prev, ...mappedSlots[0] } : prev;

            const isCompletedNow = fresh.status === 'completed' || isSlotCompletedLocally(fresh.id);

            // If session was completed while user is in room, automatically finish GD and transition to report
            if (isCompletedNow && prev.status !== 'completed' && currentTab === 'room') {
              setTimeout(() => {
                handleFinishSession();
              }, 50);
            }

            const resolvedStatus = isCompletedNow
              ? 'completed'
              : (prev.status === 'active' && fresh.status !== 'completed' ? 'active' : fresh.status);

            if (
              prev.status === resolvedStatus &&
              prev.topic === (fresh.topic || prev.topic) &&
              prev.slotTiming === fresh.slotTiming &&
              prev.recordingUrl === fresh.recordingUrl &&
              prev.assignedFacultyName === fresh.assignedFacultyName &&
              (prev.students?.length || 0) === (fresh.students?.length || 0) &&
              (prev.facultyLiveNotes?.length || 0) === (nsNotesLength(fresh))
            ) {
              return prev;
            }

            return {
              ...prev,
              ...fresh,
              status: resolvedStatus,
              roomLayout: prev.roomLayout || fresh.roomLayout || 'round_table',
              students: (prev.students && prev.students.length > 0) ? prev.students : (fresh.students && fresh.students.length > 0 ? fresh.students : generateSlotParticipants(8)),
            };
          });
        }
      } catch (err) {
        console.warn('[Slots] Polling sync error:', err);
      }
    };

    function nsNotesLength(s: GDSession) {
      return s.facultyLiveNotes?.length || 0;
    }

    // Run immediately on mount / currentUser change
    syncSlots();

    // Poll periodically for live status updates
    const timer = setInterval(syncSlots, 4000);
    return () => clearInterval(timer);
  }, [currentUser, currentTab]);

  // Synchronized session conclusion and slot updates across student client via WebSocket
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    if (!socket) return;
    const handleRemoteSessionStarted = (data: any) => {
      const slotId = String(data?.slotId || '').trim();
      if (!slotId) return;
      if (isSlotCompletedLocally(slotId)) return;

      const bookedSlotIds = Object.values(studentBookedSlotsByTopic);
      const isMySession = session?.id === slotId || bookedSlotIds.includes(slotId) || currentTab === 'room';
      if (!isMySession && currentUser.role === 'student') return;

      const targetSlot = availableSlots.find((slot) => slot.id === slotId);
      if (targetSlot?.status === 'completed') return;
      const alreadyActive = session?.id === slotId && session.status === 'active';

      setAvailableSlots((prev) =>
        prev.map((slot) => slot.id === slotId ? { ...slot, status: 'active' } : slot)
      );
      setSession((prev) => {
        const base = prev.id === slotId ? prev : (targetSlot || { ...prev, id: slotId });
        return {
          ...base,
          id: slotId,
          status: 'active',
          startedAt: base.startedAt || Date.now(),
        };
      });

      if (!alreadyActive) {
        setElapsedSeconds(0);
        setTranscripts([]);
      }
      if (currentUser.role === 'student' || currentTab === 'room') {
        setCurrentTab('room');
      }
    };
    const handleRemoteSessionEnded = (data: any) => {
      if (data?.slotId) {
        markSlotCompletedLocally(data.slotId);
        setAvailableSlots((prev) =>
          prev.map((s) => (s.id === data.slotId ? { ...s, status: 'completed' } : s))
        );
        if (session?.id === data.slotId) {
          setSession((prev) => ({ ...prev, status: 'completed' }));
          if (Array.isArray(data?.reports)) {
            const myReport = data.reports.find(
              (r: any) =>
                r.studentId === currentUser.id ||
                r.studentId === (currentUser as any).studentId ||
                (r.studentName && r.studentName.toLowerCase() === currentUser.name?.toLowerCase())
            );
            if (myReport) {
              setActiveReport(myReport);
              addReportToStudentHistory(myReport);
            }
          }
          if (currentTab === 'room') {
            if (currentUser.role === 'student') {
              handleFinishSession();
            } else {
              setCurrentTab('report');
            }
          }
        }
      }
    };
    const handleSlotUpdated = (data: any) => {
      if (data?.slot?.id) {
        const incomingCode = normalizeClientCollegeCode(data.slot.collegeCode || '');
        if (userCollegeCode && incomingCode && incomingCode !== userCollegeCode) {
          return;
        }
        if (data.slot.status === 'completed') {
          markSlotCompletedLocally(data.slot.id);
        }
        const resolvedSlot = {
          ...data.slot,
          status: (data.slot.status === 'completed' || isSlotCompletedLocally(data.slot.id)) ? 'completed' : data.slot.status,
        };
        setAvailableSlots((prev) =>
          prev.map((s) => (s.id === data.slot.id ? { ...s, ...resolvedSlot } : s))
        );
        if (session?.id === data.slot.id) {
          setSession((prev) => ({ ...prev, ...resolvedSlot }));
          if (resolvedSlot.status === 'completed' && currentTab === 'room') {
            setCurrentTab('report');
          }
        }
      }
    };
    const handleRecordingSaved = (data: any) => {
      if (data?.slotId && data?.recordingUrl) {
        setAvailableSlots((prev) =>
          prev.map((s) => (s.id === data.slotId ? { ...s, recordingUrl: data.recordingUrl, recordingDurationSeconds: data.durationSeconds } : s))
        );
        setSession((prev) => (prev?.id === data.slotId ? { ...prev, recordingUrl: data.recordingUrl, recordingDurationSeconds: data.durationSeconds } : prev));
      }
    };
    socket.on('session-started', handleRemoteSessionStarted);
    socket.on('session-ended', handleRemoteSessionEnded);
    socket.on('slot-updated', handleSlotUpdated);
    socket.on('session-recording-saved', handleRecordingSaved);
    return () => {
      socket.off('session-started', handleRemoteSessionStarted);
      socket.off('session-ended', handleRemoteSessionEnded);
      socket.off('slot-updated', handleSlotUpdated);
      socket.off('session-recording-saved', handleRecordingSaved);
    };
  }, [currentUser, session?.id, session?.status, currentTab, userCollegeCode, studentBookedSlotsByTopic, availableSlots]);


  // Reset slots back to clean demo defaults
  const handleResetSlots = () => {
    setAvailableSlots([]);
    setSession(INITIAL_SESSION);
    setElapsedSeconds(0);
  };

  // Handle Login Event
  const handleLogin = (user: AuthUser) => {
    facilitatorVoice.stop();
    // Clear previous user's slots immediately so another college's slots never flash or persist
    setAvailableSlots([]);
    setSession(INITIAL_SESSION);
    setCurrentUser(user);

    // Fetch real slots from backend. Faculty portals are restricted to their assigned sessions.
    const rawCode = (user as any).collegeCode || (user as any).college || '';
    const collegeCode = normalizeClientCollegeCode(rawCode);
    const slotSource = user.role === 'faculty'
      ? fetchFacultyAssignedSlots((user as any).facultyId || user.id, collegeCode, user.email, user.name)
      : user.role === 'student'
      ? fetchStudentAssignedSlots(user.id || (user as any).studentId, collegeCode, user.email)
      : fetchCollegeSlots(collegeCode);
    slotSource.then((backendSlots) => {
      if (backendSlots) {
        let activeBackendSlots = backendSlots.filter((s: any) => {
          if (!s || !s.id) return false;
          const sCode = normalizeClientCollegeCode(s.collegeCode || '');
          if (collegeCode && sCode && sCode !== collegeCode) return false;
          return true;
        });
        if (user.role === 'faculty') {
          activeBackendSlots = activeBackendSlots.filter((s: any) => isFacultyAssignedToSlot(s, user));
        } else if (user.role === 'student') {
          activeBackendSlots = activeBackendSlots.filter((s: any) => isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, user));
        }
        // Map backend slot objects to GDSession format expected by the frontend
        const mappedSlots: GDSession[] = activeBackendSlots.map((s: any, sIdx: number): GDSession => {
          const rawName = String(s.slotName || '').replace(/\s*\(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)\)/gi, '').trim();
          const cleanName = rawName || `Slot ${sIdx + 1}`;
          const isTopicAllotted = typeof s.topic === 'string' && s.topic.trim() !== '' && !/^slot\s+\d+\s*$/i.test(s.topic) && !s.topic.toLowerCase().includes('pending');
          const cleanTopic = isTopicAllotted ? s.topic.trim() : '';

          return {
            ...INITIAL_SESSION,
            id: s.id,
            collegeCode: normalizeClientCollegeCode(s.collegeCode || collegeCode),
            activityType: s.activityType || 'gd',
            presentationTopics: s.presentationTopics || undefined,
            topic: cleanTopic,
            description: s.description || '',
            slotName: cleanName,
            slotTiming: s.slotTiming || '',
          slotDate: s.slotDate || s.scheduledTime || (s.createdAt ? s.createdAt.split('T')[0] : 'Today'),
          durationMinutes: s.durationMinutes || (s.activityType === 'presentation' ? 60 : 15),
          difficulty: s.difficulty || 'Intermediate',
          assessmentRubric: s.assessmentRubric || 'Standard Academic 7-Parameter Rubric',
          status: s.status === 'active' ? 'active' : s.status === 'completed' ? 'completed' : 'waiting',
          students: s.students && s.students.length > 0 ? s.students : generateSlotParticipants(Math.max(s.enrolledCount || 0, s.maxCapacity || 8)),
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
          recordingUrl: s.recordingUrl || '',
          recordingDurationSeconds: s.recordingDurationSeconds || 0,
          recordingFileSize: s.recordingFileSize || 0,
          recordedAt: s.recordedAt || '',
          createdAt: s.createdAt || new Date().toISOString(),
        };
      });
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
        const targetBookedSlot = (availableSlots || []).find((s) => bookedIds.includes(s.id)) || session;
        if (targetBookedSlot && targetBookedSlot.id) {
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
          const initialStudentReport = generateStudentReport(studentUserObj, targetBookedSlot.topic, targetBookedSlot.durationMinutes, undefined, activeSlotId);
          initialStudentReport.sessionId = activeSlotId;
          initialStudentReport.topic = targetBookedSlot.topic;
          setActiveReport(initialStudentReport);

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
            students: (targetBookedSlot.students || generateSlotParticipants(targetBookedSlot.enrolledCount || 8)).map((s, idx) => ({
              ...s,
              isUser: idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber,
              name: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.name : s.name,
              college: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.college : s.college,
              course: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.course : s.course,
              batch: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.batch : s.batch,
            })),
          }));
        }
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
    setAvailableSlots([]);
    setSession(INITIAL_SESSION);
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

  // Stop any active AI speech when navigating away from the discussion room
  useEffect(() => {
    if (currentTab !== 'room') {
      facilitatorVoice.stop();
    }
  }, [currentTab]);

  // If GD session is marked completed, automatically navigate to report view - no re-entering room
  useEffect(() => {
    if (currentTab === 'room' && session.status === 'completed') {
      setCurrentTab('report');
    }
  }, [currentTab, session.status]);

  // Main session elapsed timer (Strictly active only when room is live; silence moderation is handled by RealisticGDRoom & server)
  useEffect(() => {
    const isLive = session.status === 'active' || Boolean(session.startedAt && session.status !== 'completed');
    if (!currentUser || currentTab !== 'room' || !isLive) return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [currentUser, currentTab, session.status, session.startedAt]);

  // Host / Participant Commences the Discussion Session
  const handleStartSession = (slotIdToStart?: string) => {
    const targetSlotId = slotIdToStart || session.id;
    const targetSlot = availableSlots.find((s) => s.id === targetSlotId) || session;

    // Reset timer to 0 for a fresh live discussion
    setElapsedSeconds(0);

    const isPresentation = targetSlot.activityType === 'presentation' || targetSlot.roomLayout === 'classroom';
    const welcomeIntroText = isPresentation
      ? `Welcome participants to today's classroom presentation on "${targetSlot.topic || 'the assigned topic'}". The session has commenced. Each presenter will deliver their topic followed by peer Q&A. Let us begin.`
      : `Welcome participants to today's group discussion on "${targetSlot.topic || 'the assigned topic'}". The discussion has now officially commenced. Each participant will get an opportunity to present their perspectives. Please respect others and avoid interruptions. Let us begin. Who would like to open the discussion?`;

    sessionQuestionTracker.clear();

    const baseStudents = (targetSlot.students && targetSlot.students.length > 0)
      ? targetSlot.students
      : (targetSlot.id === session.id && session.students && session.students.length > 0)
      ? session.students
      : generateSlotParticipants(8);

    const activeSlot: GDSession = {
      ...(targetSlot.id === session.id ? session : targetSlot),
      activityType: isPresentation ? 'presentation' : 'gd',
      roomLayout: isPresentation ? 'classroom' : (targetSlot.roomLayout === 'speaker_center' ? 'speaker_center' : 'round_table'),
      status: 'active',
      silenceTimerSeconds: 0,
      currentPhase: 'intro',
      facilitatorSpeech: welcomeIntroText,
      isFacilitatorSpeaking: false,
      startedAt: Date.now(),
      students: baseStudents.map((s) => ({
        ...s,
        speakingTurns: 0,
        speakingDurationSeconds: 0,
        isSpeaking: false,
      })),
    };

    // Update active session status and reset speaking metrics for fresh live discussion
    setSession(activeSlot);
    setCurrentTab('room');

    // Update availableSlots list
    setAvailableSlots((prevSlots) =>
      prevSlots.map((s) => (s.id === targetSlotId ? { 
        ...s, 
        activityType: isPresentation ? 'presentation' : 'gd',
        roomLayout: isPresentation ? 'classroom' : (s.roomLayout === 'speaker_center' ? 'speaker_center' : 'round_table'),
        status: 'active', 
        startedAt: Date.now(),
        students: (s.students && s.students.length > 0 ? s.students : baseStudents).map((st) => ({
          ...st,
          speakingTurns: 0,
          speakingDurationSeconds: 0,
          isSpeaking: false,
        })),
      } : s))
    );

    // Synchronized opening transcript: preserve existing or initialize fresh welcome entry so transcript stream is never blank
    setTranscripts((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: `t-opening-${Date.now()}`,
          sessionId: targetSlotId,
          speakerId: 'ai-facilitator',
          speakerName: 'AI Facilitator (ERUS)',
          seatNumber: null,
          isFacilitator: true,
          timestamp: '00:00',
          timestampSeconds: 0,
          text: `Welcome participants to today's group discussion on "${targetSlot.topic || 'the assigned topic'}". The floor is now officially open. Please share your opening thoughts.`,
          type: 'opening',
          sentiment: 'constructive',
        },
      ];
    });

    // Emit live WebRTC socket event so all room participants transition immediately
    // Validate authorization with the backend before broadcasting a session start.
    const startToken = getStoredToken();
    fetch(`/api/college/slots/${encodeURIComponent(targetSlotId)}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(startToken ? { Authorization: 'Bearer ' + startToken } : {}),
      },
      body: JSON.stringify({
        facultyId: (currentUser as any).facultyId || currentUser.id,
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to start GD session');
      }
      const socket = getSocket();
      if (socket) socket.emit('start-session', { slotId: targetSlotId });
    }).catch((err) => console.warn('Backend start session sync:', err));
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
    if (isFinishingSessionRef.current) return;
    isFinishingSessionRef.current = true;

    const finishedSlotId = session.id;

    // 0. Ensure any active GD recording is stopped and uploaded BEFORE unmounting RealisticGDRoom
    if (typeof window !== 'undefined' && typeof (window as any).__erusStopAndUploadRecording === 'function') {
      try {
        const uploadRes = await (window as any).__erusStopAndUploadRecording();
        if (uploadRes?.recordingUrl) {
          setSession((prev) => ({ ...prev, recordingUrl: uploadRes.recordingUrl }));
          setAvailableSlots((prev) =>
            prev.map((s) => (s.id === finishedSlotId ? { ...s, recordingUrl: uploadRes.recordingUrl } : s))
          );
        }
      } catch (recErr) {
        console.warn('[GD Recorder] Final upload before report transition notice:', recErr);
      }
    }

    // 1. Guaranteed student resolution
    const userStudent: Student = session.students?.find((s) => s.isUser) ||
      session.students?.find((s) => !s.isEmptySeat && (s.id === currentUser?.id || s.name === currentUser?.name)) ||
      session.students?.find((s) => !s.isEmptySeat) || {
        id: currentUser?.id || (currentUser as any)?.studentId || 'stu-current',
        name: currentUser?.name || 'Student Candidate',
        college: currentUser?.college || 'Institution',
        course: (currentUser as any)?.course || 'Engineering',
        batch: (currentUser as any)?.batch || '2024-2028',
        seatNumber: 1,
        avatar: currentUser?.avatar || '',
        isUser: true,
        micActive: false,
        isSpeaking: false,
        hasRaisedHand: false,
        cameraActive: false,
        speakingDurationSeconds: 0,
        speakingTurns: 0,
        interruptionCount: 0,
        questionsAnswered: 0,
        questionsInitiated: 0,
        sentiment: 'neutral',
      };

    if (userStudent.id.startsWith('seat-') && userStudent.id.endsWith('-empty')) {
      userStudent.id = currentUser?.id || (currentUser as any)?.studentId || 'stu-current';
      userStudent.name = currentUser?.name || 'Student Candidate';
      userStudent.college = currentUser?.college || 'Institution';
      userStudent.isUser = true;
    }

    try {
      if (currentUser?.role === 'faculty') {
        // 1. Immediately mark the slot as completed locally and in state so all portals and tabs lock the GD room instantaneously
        markSlotCompletedLocally(finishedSlotId);
        facilitatorVoice.stop();

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

        // Prepare an immediate fallback report for the first participant so the Report tab renders right away
        const initialFacultyReport = generateStudentReport(userStudent, session.topic, session.durationMinutes, undefined, finishedSlotId);
        initialFacultyReport.sessionId = finishedSlotId;
        initialFacultyReport.topic = session.topic;
        initialFacultyReport.facultyLiveNotes = session.facultyLiveNotes?.filter(
          (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
        );
        setViewingStudentId(userStudent.id);
        setActiveReport(initialFacultyReport);
        setCurrentTab('report');

        try {
          const socket = getSocket();
          if (socket) {
            socket.emit('finish-session', { slotId: finishedSlotId });
          }
        } catch (e) {
          console.warn('Socket finish-session emit error:', e);
        }

        // 2. Authoritative backend finalization: evaluates every participant, persists reports, and broadcasts completion across all portals
        const completeToken = getStoredToken();
        const endRes = await fetch('/api/college/slots/' + encodeURIComponent(finishedSlotId) + '/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(completeToken ? { Authorization: 'Bearer ' + completeToken } : {}),
          },
          body: JSON.stringify({
            facultyId: (currentUser as any).facultyId || currentUser.id,
            id: currentUser.id,
            userId: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            role: currentUser.role,
            collegeCode: userCollegeCode,
            transcriptHistory: transcripts,
          }),
        });
        const endData = await endRes.json().catch(() => ({}));

        const ownReport = Array.isArray(endData.reports)
          ? (endData.reports.find((r: StudentAssessmentReport) => r.studentId === userStudent.id) || endData.reports[0])
          : null;
        if (ownReport) {
          const enhancedReport: StudentAssessmentReport = {
            ...ownReport,
            facultyLiveNotes: session.facultyLiveNotes?.filter(
              (n) => n.studentId === (ownReport.studentId || userStudent.id) || n.studentName.toLowerCase() === (ownReport.studentName || userStudent.name).toLowerCase()
            ),
          };
          setViewingStudentId(ownReport.studentId || userStudent.id);
          setActiveReport(enhancedReport);
          addReportToStudentHistory(enhancedReport);
        }
      } else {
        // Students can request their own evaluation, but cannot close the GD.
        // First check if an authoritative report already exists on the backend (e.g., generated by faculty completion)
        // Resolve participant transcripts with resilient speaker identification
        const candidateId = String(userStudent.id || '').toLowerCase();
        const candidateName = String(userStudent.name || '').toLowerCase();
        let userTranscripts = (transcripts || []).filter(
          (t) =>
            !t.isFacilitator &&
            (
              String(t.speakerId || '').toLowerCase() === candidateId ||
              String(t.speakerId || '') === 'speaker-user' ||
              String(t.speakerId || '') === 'speaker-1' ||
              String(t.speakerId || '') === 'stu-current' ||
              String(t.speakerId || '').startsWith('t-user') ||
              (t.speakerName && String(t.speakerName).toLowerCase() === candidateName) ||
              (t.speakerName && (t.speakerName.toLowerCase() === 'candidate' || t.speakerName.toLowerCase().includes('student'))) ||
              (userStudent.seatNumber && t.seatNumber === userStudent.seatNumber)
            )
        );

        // If no strict match, but non-facilitator transcripts exist in the session
        if (userTranscripts.length === 0) {
          const nonFacilitator = (transcripts || []).filter(
            (t) => !t.isFacilitator && String(t.text || '').trim() && !String(t.speakerId || '').startsWith('ai-')
          );
          if (nonFacilitator.length > 0) {
            userTranscripts = nonFacilitator;
          }
        }

        const observedWords = userTranscripts.map((t) => t.text).join(' ').split(/\s+/).filter(Boolean).length;
        const wordsDuration = observedWords > 0 ? Math.round((observedWords / 130) * 60) : 0;
        const effectiveDuration = Math.max(userStudent.speakingDurationSeconds || 0, wordsDuration, userTranscripts.length > 0 ? userTranscripts.length * 20 : 0);
        const effectiveTurns = Math.max(userStudent.speakingTurns || 0, userTranscripts.length, userTranscripts.length > 0 ? 1 : 0);

        let foundAuthoritativeReport: StudentAssessmentReport | null = null;
        try {
          const fetchExisting = await fetch(
            `/api/student/reports?studentId=${encodeURIComponent(userStudent.id)}&studentName=${encodeURIComponent(userStudent.name)}&sessionId=${encodeURIComponent(finishedSlotId)}`
          );
          if (fetchExisting.ok) {
            const existingData = await fetchExisting.json();
            if (existingData.success && Array.isArray(existingData.reports) && existingData.reports.length > 0) {
              const matched = existingData.reports.find((r: any) => r.sessionId === finishedSlotId);
              // Only reuse existing report if it has positive marks, OR if the student genuinely did not speak
              if (matched && ((matched.overallScore || 0) > 0 || (effectiveDuration === 0 && userTranscripts.length === 0))) {
                foundAuthoritativeReport = matched;
              }
            }
          }
        } catch (e) {
          console.warn('[Student Report] Check for authoritative report error:', e);
        }

        if (foundAuthoritativeReport) {
          const enhancedReport: StudentAssessmentReport = {
            ...foundAuthoritativeReport,
            facultyLiveNotes: session.facultyLiveNotes?.filter(
              (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
            ),
          };
          setActiveReport(enhancedReport);
          addReportToStudentHistory(enhancedReport);
          setCurrentTab('report');
          return;
        }

        try {
          const evaluatedStudent: Student = {
            ...userStudent,
            speakingDurationSeconds: effectiveDuration,
            speakingTurns: effectiveTurns,
          };

          const res = await fetch('/api/facilitator/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student: evaluatedStudent,
              transcriptHistory: transcripts,
              sessionId: finishedSlotId,
              topic: session.topic,
              durationMinutes: session.durationMinutes,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.report) {
            let enhancedReport: StudentAssessmentReport = {
              ...data.report,
              facultyLiveNotes: session.facultyLiveNotes?.filter(
                (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
              ),
            };
            // Never overwrite an already-saved non-zero report with a 0-score report if candidate spoke
            if ((enhancedReport.overallScore || 0) <= 0 && (effectiveDuration > 0 || userTranscripts.length > 0)) {
              const savedHist = getStudentReportHistory(userStudent.id || userStudent.name || 'student');
              const nonZeroSaved = savedHist.find(
                (r) => (r.overallScore || 0) > 0 && (r.sessionId === finishedSlotId || r.topic === session.topic)
              ) || (activeReport && (activeReport.overallScore || 0) > 0 ? activeReport : null);
              if (nonZeroSaved) {
                enhancedReport = nonZeroSaved;
              } else {
                // Generate robust fallback evaluation with academic parameters
                const fallbackRep = generateStudentReport(evaluatedStudent, session.topic, session.durationMinutes);
                enhancedReport = { ...enhancedReport, ...fallbackRep };
              }
            }
            setActiveReport(enhancedReport);
            addReportToStudentHistory(enhancedReport);
          } else {
            throw new Error(data.error || 'Backend evaluation fallback');
          }
        } catch (evalErr) {
          console.warn('[Student Evaluation] Evaluation API fallback generated:', evalErr);
          const studentObjWithMetrics: Student = {
            ...userStudent,
            speakingDurationSeconds: Math.max(effectiveDuration, 30),
            speakingTurns: Math.max(effectiveTurns, 1),
          };
          let fallbackRep = generateStudentReport(studentObjWithMetrics, session.topic, session.durationMinutes);
          fallbackRep.sessionId = finishedSlotId;
          fallbackRep.facultyLiveNotes = session.facultyLiveNotes?.filter(
            (n) => n.studentId === userStudent.id || n.studentName.toLowerCase() === userStudent.name.toLowerCase()
          );
          if ((fallbackRep.overallScore || 0) <= 0) {
            const savedHist = getStudentReportHistory(userStudent.id || userStudent.name || 'student');
            const nonZeroSaved = savedHist.find(
              (r) => (r.overallScore || 0) > 0 && (r.sessionId === finishedSlotId || r.topic === session.topic)
            ) || (activeReport && (activeReport.overallScore || 0) > 0 ? activeReport : null);
            if (nonZeroSaved) {
              fallbackRep = nonZeroSaved;
            }
          }
          setActiveReport(fallbackRep);
          addReportToStudentHistory(fallbackRep);
        }
      }

      setCurrentTab('report');
    } catch (e) {
      console.warn('[Evaluation] Finalization exception, redirecting to report:', e);
      setCurrentTab('report');
    } finally {
      setTimeout(() => {
        isFinishingSessionRef.current = false;
      }, 2500);
    }
  };

  const handleOpenAssessmentReport = async (slotId: string) => {
    const cleanSlotId = String(slotId || '').trim();
    const targetSlot: GDSession = availableSlots.find((s) =>
      s.id === cleanSlotId ||
      s.slotId === cleanSlotId ||
      (s.id && cleanSlotId && s.id.toLowerCase() === cleanSlotId.toLowerCase()) ||
      (s.id && cleanSlotId && s.id.replace('slot-', 'session-') === cleanSlotId.replace('slot-', 'session-')) ||
      (s.id && cleanSlotId && s.id.replace('session-', 'slot-') === cleanSlotId.replace('session-', 'slot-')) ||
      (s.slotName && cleanSlotId && s.slotName.toLowerCase() === cleanSlotId.toLowerCase())
    ) || (session.id === cleanSlotId ? session : null) || {
      id: cleanSlotId,
      slotName: cleanSlotId.startsWith('slot-') ? `Slot ${cleanSlotId.replace('slot-', '')}` : cleanSlotId,
      topic: 'Group Discussion',
      status: 'completed',
      durationMinutes: 15,
      maxCapacity: 15,
      enrolledCount: 1,
      students: [],
    } as any;

    facilitatorVoice.stop();
    sessionQuestionTracker.clear();

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
        updatedTargetStudents = [
          {
            id: currentUser.id || 'speaker-user',
            name: currentUser.name,
            college: currentUser.college,
            course: currentUser.course,
            batch: currentUser.batch,
            seatNumber: 1,
            avatar: '',
            isUser: true,
            micActive: false,
            isSpeaking: false,
            hasRaisedHand: false,
            cameraActive: false,
            speakingDurationSeconds: 0,
            speakingTurns: 0,
            interruptionCount: 0,
            questionsAnswered: 0,
            questionsInitiated: 0,
            sentiment: 'neutral',
            isEmptySeat: false,
          },
        ];
      }

      // Check student history first matching cleanSlotId or topic
      const uHistory = getStudentReportHistory(currentUser.studentId || currentUser.id || currentUser.name || 'student');
      // A report belongs to a specific session, not just a matching topic.
      // Reusing a same-topic report from an earlier slot displayed stale scores.
      let foundReport: any = uHistory.find((r) =>
        (r.sessionId === cleanSlotId || (r as any).slotId === cleanSlotId || r.id === cleanSlotId) &&
        (!targetSlot.topic || !r.topic || String(r.topic).trim().toLowerCase() === String(targetSlot.topic).trim().toLowerCase())
      );

      const userStudent = updatedTargetStudents.find((s) => s.isUser) || updatedTargetStudents[0];

      const applyReportAndState = (repObj: any) => {
        if (repObj) {
          userStudent.speakingDurationSeconds = repObj.speakingTimeSeconds ?? repObj.speakingDurationSeconds ?? userStudent.speakingDurationSeconds ?? 0;
          userStudent.speakingTurns = repObj.speakingTurns ?? userStudent.speakingTurns ?? 0;
          userStudent.interruptionCount = repObj.interruptions ?? repObj.interruptionCount ?? 0;
          userStudent.questionsAnswered = repObj.questionsAnswered ?? 0;
          userStudent.questionsInitiated = repObj.questionsInitiated ?? 0;
        }

        const slotForState: GDSession = { ...targetSlot, status: 'completed', students: updatedTargetStudents };
        setSession(slotForState);
        setAvailableSlots((prev) =>
          prev.map((s) => (s.id === cleanSlotId ? { ...s, status: 'completed', students: updatedTargetStudents } : s))
        );

        const studentReport = repObj
          ? { ...repObj }
          : generateStudentReport(userStudent, targetSlot.topic, targetSlot.durationMinutes, undefined, cleanSlotId);
        studentReport.sessionId = cleanSlotId;
        studentReport.topic = targetSlot.topic || studentReport.topic;

        // Repair a zero score only when there is actual captured speech evidence.
        // Never invent speaking time or turns merely because a session was completed.
        const evidenceTranscripts = (transcripts || []).filter((t) =>
          !t.isFacilitator &&
          (t.speakerId === userStudent.id ||
            (t.speakerName && userStudent.name && String(t.speakerName).toLowerCase() === String(userStudent.name).toLowerCase()) ||
            (t.seatNumber != null && t.seatNumber === userStudent.seatNumber))
        );
        const observedWords = evidenceTranscripts.map((t) => String(t.text || '')).join(' ').split(/\\s+/).filter(Boolean).length;
        const wordsDuration = observedWords > 0 ? Math.round((observedWords / 130) * 60) : 0;
        const actualDuration = Math.max(
          Number(studentReport.speakingTimeSeconds || 0),
          Number(studentReport.speakingDurationSeconds || 0),
          Number(userStudent.speakingDurationSeconds || 0),
          wordsDuration
        );
        const actualTurns = Math.max(
          Number(studentReport.speakingTurns || 0),
          Number(userStudent.speakingTurns || 0),
          evidenceTranscripts.length
        );
        if (Number(studentReport.overallScore || 0) <= 0 && (observedWords > 0 || actualDuration > 0 || actualTurns > 0)) {
          const { overallScore: calculated } = calculateStudentOverallScore({
            seconds: actualDuration,
            turns: actualTurns,
            wpm: Number(studentReport.wpm || 0) || (actualDuration > 0 ? 130 : 0),
            hasCollab: actualTurns >= 2,
            hasLead: actualTurns >= 3,
          });
          studentReport.overallScore = calculated;
          studentReport.grade = calculated >= 90 ? 'Excellent' : calculated >= 75 ? 'Very Good' : calculated >= 60 ? 'Good' : calculated >= 40 ? 'Average' : 'Needs Improvement';
          studentReport.skills = distributeRubricScores(calculated);
          studentReport.speakingTimeSeconds = actualDuration;
          studentReport.speakingDurationSeconds = actualDuration;
          studentReport.speakingTurns = actualTurns;
          studentReport.speakingTimeFormatted = `${Math.floor(actualDuration / 60)} min ${actualDuration % 60} sec`;
        }

        setActiveReport(studentReport);
        addReportToStudentHistory(studentReport);
        setViewingStudentId(userStudent.id);
      };

      // 1. Immediately transition to report view so button feels 0ms instantaneous
      applyReportAndState(foundReport);
      setCurrentTab('report');

      // 2. Asynchronously enrich from backend if available
      try {
        const res = await fetch(`/api/college/slots/${encodeURIComponent(cleanSlotId)}/reports`);
        const data = await res.json();
        if (data.success && Array.isArray(data.reports)) {
          const matched = data.reports.find(
            (r: any) =>
              (r.studentId === currentUser.id ||
              r.studentId === (currentUser as any).studentId ||
              (r.studentName && currentUser.name && String(r.studentName || '').toLowerCase() === String(currentUser.name || '').toLowerCase())) &&
              (!targetSlot.topic || !r.topic || String(r.topic || '').toLowerCase() === String(targetSlot.topic || '').toLowerCase())
          );
          if (matched) {
            foundReport = matched;
            applyReportAndState(foundReport);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch slot reports for student:', err);
      }

      if (!foundReport) {
        try {
          const sRes = await fetch(
            `/api/student/reports?studentId=${encodeURIComponent(currentUser.id)}&studentName=${encodeURIComponent(currentUser.name || '')}&sessionId=${encodeURIComponent(cleanSlotId)}&topic=${encodeURIComponent(targetSlot.topic || '')}`
          );
          const sData = await sRes.json();
          if (sData.success && Array.isArray(sData.reports) && sData.reports.length > 0) {
            const matched = sData.reports.find((r: any) => !targetSlot.topic || r.topic === targetSlot.topic);
            if (matched) {
              foundReport = matched;
              applyReportAndState(foundReport);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch student reports directly:', err);
        }
      }
      let facultyStudents = (targetSlot.students || []).map((s) => ({ ...s, isUser: false }));

      // Fetch slot reports for faculty
      let foundFacultyReport: any = null;
      let slotParticipants: any[] = [];
      try {
        const res = await fetch(`/api/college/slots/${encodeURIComponent(slotId)}/reports`);
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.reports) && data.reports.length > 0) {
            foundFacultyReport = data.reports[0];
          }
          if (Array.isArray(data.participants) && data.participants.length > 0) {
            slotParticipants = data.participants;
          }
        }
      } catch {}

      if (!foundFacultyReport && currentUser?.role === 'faculty') {
        try {
          const facId = (currentUser as any).facultyId || currentUser.id;
          const fRes = await fetch(`/api/faculty/sessions/${encodeURIComponent(slotId)}/reports?facultyId=${encodeURIComponent(facId)}`);
          const fData = await fRes.json();
          if (fData.success) {
            if (Array.isArray(fData.reports) && fData.reports.length > 0) {
              foundFacultyReport = fData.reports[0];
            }
            if (Array.isArray(fData.participants) && fData.participants.length > 0) {
              slotParticipants = fData.participants;
            }
          }
        } catch {}
      }

      // If participants were returned from reports, merge them into facultyStudents
      if (slotParticipants.length > 0) {
        facultyStudents = slotParticipants.map((p, idx) => ({
          id: p.id,
          name: p.name,
          email: p.email || '',
          studentId: p.studentId || p.id,
          college: p.college || targetSlot.collegeCode || '',
          course: p.course || 'Engineering',
          batch: p.batch || '2024-2028',
          seatNumber: p.seatNumber || (idx + 1),
          avatar: '',
          isUser: false,
          micActive: false,
          isSpeaking: false,
          hasRaisedHand: false,
          cameraActive: false,
          speakingDurationSeconds: p.speakingDurationSeconds || 0,
          speakingTurns: p.speakingTurns || 0,
          interruptionCount: 0,
          questionsAnswered: 0,
          questionsInitiated: 0,
          sentiment: 'neutral',
          isEmptySeat: false,
        }));
      }

      const slotForState: GDSession = {
        ...targetSlot,
        status: 'completed',
        students: facultyStudents,
      };
      setSession(slotForState);

      if (foundFacultyReport) {
        const facultyEvidence = (transcripts || []).filter((t) =>
          !t.isFacilitator &&
          (t.speakerId === foundFacultyReport.studentId ||
            (t.speakerName && foundFacultyReport.studentName && String(t.speakerName).toLowerCase() === String(foundFacultyReport.studentName).toLowerCase()) ||
            (t.seatNumber != null && t.seatNumber === foundFacultyReport.seatNumber))
        );
        const facultyWords = facultyEvidence.map((t) => String(t.text || '')).join(' ').split(/\s+/).filter(Boolean).length;
        const facultyDuration = Math.max(
          Number(foundFacultyReport.speakingDurationSeconds || 0),
          Number(foundFacultyReport.speakingTimeSeconds || 0),
          facultyWords > 0 ? Math.round((facultyWords / 130) * 60) : 0
        );
        const facultyTurns = Math.max(Number(foundFacultyReport.speakingTurns || 0), facultyEvidence.length);
        if (Number(foundFacultyReport.overallScore || 0) <= 0 && (facultyWords > 0 || facultyDuration > 0 || facultyTurns > 0)) {
          const { overallScore: calculated } = calculateStudentOverallScore({
            seconds: facultyDuration,
            turns: facultyTurns,
            wpm: Number(foundFacultyReport.wpm || 0) || (facultyDuration > 0 ? 130 : 0),
            hasCollab: facultyTurns >= 2,
            hasLead: facultyTurns >= 3,
          });
          foundFacultyReport.overallScore = calculated;
          foundFacultyReport.grade = calculated >= 90 ? 'Excellent' : calculated >= 75 ? 'Very Good' : calculated >= 60 ? 'Good' : calculated >= 40 ? 'Average' : 'Needs Improvement';
          foundFacultyReport.skills = distributeRubricScores(calculated);
        }
        setViewingStudentId(foundFacultyReport.studentId);
        setActiveReport(foundFacultyReport);
      } else if (facultyStudents.length > 0) {
        const firstStudent = facultyStudents[0];
        setViewingStudentId(firstStudent.id);
        const studentReport = generateStudentReport(firstStudent, targetSlot.topic, targetSlot.durationMinutes, undefined, slotId);
        studentReport.sessionId = slotId;
        studentReport.topic = targetSlot.topic;
        setActiveReport(studentReport);
      }
      setCurrentTab('report');
    }
  };

  const handleSelectSlot = (slotId: string) => {
    const targetSlot = availableSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;

    // Handle Completed Session Click immediately:
    // Never open the GD room again or play AI voice.
    // - Students see their individual 7-parameter assessment report.
    // - Faculty & Admins see overall reports and cohort analytics.
    if (targetSlot.status === 'completed' || isSlotCompletedLocally(slotId)) {
      handleOpenAssessmentReport(slotId);
      return;
    }

    // Faculty slot access restriction: log loose match without blocking authorized evaluator
    if (currentUser && currentUser.role === 'faculty') {
      if (!isFacultyAssignedToSlot(targetSlot, currentUser)) {
        if (targetSlot.assignedFacultyId || targetSlot.assignedFacultyName) {
          console.warn('Faculty slot access loose match for slot:', targetSlot.id);
        }
      }
    }

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

    if (slotId === session.id && session.students && session.students.length > 0) return; // already in this slot with active participants

    const targetMaxCap = targetSlot.maxCapacity || 15;
    const targetCurrentEnrolled = targetSlot.enrolledCount ?? targetSlot.students?.length ?? 0;

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
        updatedTargetStudents = [
          {
            id: currentUser.id || 'speaker-user',
            name: currentUser.name,
            college: currentUser.college,
            course: currentUser.course,
            batch: currentUser.batch,
            seatNumber: 1,
            avatar: '',
            isUser: true,
            micActive: false,
            isSpeaking: false,
            hasRaisedHand: false,
            cameraActive: false,
            speakingDurationSeconds: 0,
            speakingTurns: 0,
            interruptionCount: 0,
            questionsAnswered: 0,
            questionsInitiated: 0,
            sentiment: 'neutral',
            isEmptySeat: false,
          },
        ];
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

    const isPresentation = targetSlot.activityType === 'presentation' || targetSlot.roomLayout === 'classroom';
    const activeSlot: GDSession = {
      ...targetSlot,
      activityType: isPresentation ? 'presentation' : 'gd',
      roomLayout: isPresentation ? 'classroom' : (targetSlot.roomLayout === 'speaker_center' ? 'speaker_center' : 'round_table'),
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
    const newSessionIds = new Set(newSessions.map((s) => s.id));
    setAvailableSlots((prev) => [...newSessions, ...prev.filter((s) => !newSessionIds.has(s.id))]);

    // Persist new slots to backend college API for college admins and faculty
    if (currentUser?.role === 'college_admin' || currentUser?.role === 'faculty') {
      const code =
        (currentUser as any).collegeCode ||
        (newSessions[0] as any).collegeCode ||
        ((currentUser as any).college ? (currentUser as any).college.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') : 'DIT');
      newSessions.forEach((s) => {
        createCollegeSlot({
          id: s.id,
          topic: s.topic,
          description: s.description,
          durationMinutes: s.durationMinutes,
          difficulty: s.difficulty,
          slotTiming: s.slotTiming,
          slotName: s.slotName,
          maxCapacity: s.maxCapacity || 15,
          collegeCode: (s as any).collegeCode || code,
          assignedFacultyId: s.assignedFacultyId || (currentUser.role === 'faculty' ? (currentUser as any).facultyId || currentUser.id : undefined),
          assignedFacultyName: s.assignedFacultyName || (currentUser.role === 'faculty' ? currentUser.name : undefined),
          assignedFacultyDept: s.assignedFacultyDept || (currentUser.role === 'faculty' ? (currentUser as any).department : undefined),
          assignedFacultyEmail: s.assignedFacultyEmail || (currentUser.role === 'faculty' ? currentUser.email : undefined),
        })
          .then((res) => {
            if (res && res.slot) {
              setAvailableSlots((prev) => prev.map((item) => (item.id === s.id ? { ...item, id: res.slot.id } : item)));
            }
          })
          .catch((err) => console.warn('Failed to sync new slot to backend:', err));
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

    // Keep users in their respective dashboard or transition to room
    if (currentUser?.role === 'college_admin') {
      setCurrentTab('college_admin');
    } else if (currentUser?.role === 'faculty') {
      setCurrentTab('faculty');
    } else {
      setCurrentTab('room');
    }
  };

  const handleCreateSession = (newSession: GDSession) => {
    handleCreateSessions([newSession]);
  };

  const handleDeleteSession = (slotId: string) => {
    setAvailableSlots((prev) => prev.filter((s) => s.id !== slotId));
    markSlotDeletedLocally(slotId);
  };

  const handleViewStudentReport = async (studentId?: string) => {
    const targetStudentId = studentId || viewingStudentId || session.students?.find((s) => !s.isEmptySeat)?.id || session.students?.[0]?.id;
    if (targetStudentId) {
      setViewingStudentId(targetStudentId);
      if (activeReport && activeReport.studentId === targetStudentId && (activeReport.overallScore || 0) > 0) {
        setCurrentTab('report');
        return;
      }

      let found: any = null;
      try {
        const res = await fetch(`/api/college/slots/${encodeURIComponent(session.id)}/reports`);
        const data = await res.json();
        if (data.success && Array.isArray(data.reports)) {
          found = data.reports.find(
            (r: any) =>
              r.studentId === targetStudentId ||
              (r.studentName && session.students?.some((s) => s.id === targetStudentId && s.name && s.name.toLowerCase() === r.studentName.toLowerCase()))
          );
        }
      } catch {}

      if (!found && currentUser?.role === 'faculty') {
        try {
          const facId = (currentUser as any).facultyId || currentUser.id;
          const fRes = await fetch(`/api/faculty/sessions/${encodeURIComponent(session.id)}/reports?facultyId=${encodeURIComponent(facId)}`);
          const fData = await fRes.json();
          if (fData.success && Array.isArray(fData.reports)) {
            found = fData.reports.find(
              (r: any) =>
                r.studentId === targetStudentId ||
                (r.studentName && session.students?.some((s) => s.id === targetStudentId && s.name && s.name.toLowerCase() === r.studentName.toLowerCase()))
            );
          }
        } catch {}
      }

      if (!found) {
        try {
          const sRes = await fetch(`/api/student/reports?studentId=${encodeURIComponent(targetStudentId)}&sessionId=${encodeURIComponent(session.id)}`);
          const sData = await sRes.json();
          if (sData.success && Array.isArray(sData.reports) && sData.reports.length > 0) {
            found = sData.reports[0];
          }
        } catch {}
      }

      if (found) {
        setActiveReport(found);
      } else {
        const studentObj = session.students?.find((s) => s.id === targetStudentId);
        if (studentObj) {
          const rep = generateStudentReport(studentObj, session.topic, session.durationMinutes);
          setActiveReport(rep);
        }
      }
    }
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
      const token = getStoredToken();
      const bookingRes = await fetch('/api/student/book-slot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
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
    const initialStudentReport = generateStudentReport(studentUserObj, targetSlot.topic, targetSlot.durationMinutes, undefined, slotId);
    initialStudentReport.sessionId = slotId;
    initialStudentReport.topic = targetSlot.topic;
    setActiveReport(initialStudentReport);
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
        setCurrentTab={(tab) => {
          if (tab === 'report' && currentUser?.role === 'student') {
            const target =
              studentParticipatedSlots.find((s) => s.status === 'completed') ||
              studentParticipatedSlots[0] ||
              availableSlots.find((s) => s.status === 'completed' && (isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, currentUser))) ||
              (studentBookedSlotId ? availableSlots.find((s) => s.id === studentBookedSlotId) : null);
            if (target) {
              handleOpenAssessmentReport(target.id);
              return;
            }
          }
          if (tab === 'report') {
            setInitialReportTab('single');
          }
          setCurrentTab(tab);
        }}
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
            availableSlots={
              currentUser?.role === 'student'
                ? availableSlots.filter((s) => isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, currentUser))
                : availableSlots
            }
            bookedSlotId={studentBookedSlotId}
            bookedSlotsByTopic={studentBookedSlotsByTopic}
            currentUser={currentUser}
            onBookSlot={handleBookSlot}
            onReviveSlot={handleReviveSlot}
            onEnterRoom={(slotId) => {
              const target = availableSlots.find((s) => s.id === slotId);
              if (target?.status === 'completed' || isSlotCompletedLocally(slotId)) {
                setInitialReportTab('single');
                handleOpenAssessmentReport(slotId);
                return;
              }
              handleSelectSlot(slotId);
              setCurrentTab('room');
            }}
            onViewReport={(slotId) => {
              setInitialReportTab('single');
              handleOpenAssessmentReport(slotId);
            }}
            onViewJourneyProfile={() => {
              setInitialReportTab('journey');
              const target =
                studentParticipatedSlots.find((s) => s.status === 'completed' || isSlotCompletedLocally(s.id)) ||
                studentParticipatedSlots[0] ||
                availableSlots.find((s) => (s.status === 'completed' || isSlotCompletedLocally(s.id)) && (isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, currentUser))) ||
                (studentBookedSlotId ? availableSlots.find((s) => s.id === studentBookedSlotId) : null);
              if (target) {
                handleOpenAssessmentReport(target.id);
              } else {
                setCurrentTab('report');
              }
            }}
          />
        )}

        {currentTab === 'room' && currentUser?.role !== 'college_admin' && currentUser?.role !== 'super_admin' && session.status !== 'completed' && !isSlotCompletedLocally(session.id) && (
          (session.activityType === 'presentation' || session.roomLayout === 'classroom') ? (
            <ClassroomPresentationRoom
              session={session}
              setSession={setSession}
              transcripts={transcripts}
              setTranscripts={setTranscripts}
              onFinishSession={handleFinishSession}
              onStartSession={handleStartSession}
              voiceMuted={voiceMuted}
              elapsedSeconds={elapsedSeconds}
              availableSlots={facultyAssignedSlots}
              onSelectSlot={handleSelectSlot}
              onResetSlots={handleResetSlots}
              currentUser={currentUser}
              bookedSlotId={studentBookedSlotId}
              onBackToDashboard={() => {
                if (currentUser?.role === 'super_admin') {
                  setCurrentTab('super_admin');
                } else if (currentUser?.role === 'college_admin') {
                  setCurrentTab('college_admin');
                } else if (currentUser?.role === 'faculty') {
                  setCurrentTab('faculty');
                } else {
                  setCurrentTab('topics');
                }
              }}
            />
          ) : (
            <RealisticGDRoom
              session={session}
              setSession={setSession}
              transcripts={transcripts}
              setTranscripts={setTranscripts}
              onFinishSession={handleFinishSession}
              onStartSession={handleStartSession}
              voiceMuted={voiceMuted}
              elapsedSeconds={elapsedSeconds}
              availableSlots={facultyAssignedSlots}
              onSelectSlot={handleSelectSlot}
              onResetSlots={handleResetSlots}
              currentUser={currentUser}
              bookedSlotId={studentBookedSlotId}
              onBackToDashboard={() => {
                if (currentUser?.role === 'super_admin') {
                  setCurrentTab('super_admin');
                } else if (currentUser?.role === 'college_admin') {
                  setCurrentTab('college_admin');
                } else if (currentUser?.role === 'faculty') {
                  setCurrentTab('faculty');
                } else {
                  setCurrentTab('topics');
                }
              }}
              onUpdateLayout={(newLayout) => {
                setSession((prev) => ({ ...prev, roomLayout: newLayout }));
                setAvailableSlots((prev) =>
                  prev.map((s) => (s.id === session.id ? { ...s, roomLayout: newLayout } : s))
                );
              }}
            />
          )
        )}

        {currentTab === 'report' && (
          <StudentReportView
            session={session}
            report={activeReport}
            initialTab={initialReportTab}
            onBackToRoom={() => {
              if (currentUser?.role === 'super_admin') {
                setCurrentTab('super_admin');
                return;
              }
              if (currentUser?.role === 'college_admin') {
                setCurrentTab('college_admin');
                return;
              }
              if (currentUser?.role === 'student') {
                setCurrentTab('topics');
                return;
              }
              if (session.status === 'completed' || isSlotCompletedLocally(session.id)) {
                setCurrentTab('faculty');
                return;
              }
              setCurrentTab('room');
            }}
            onViewFacultyDashboard={() => {
              if (currentUser?.role === 'super_admin') {
                setCurrentTab('super_admin');
              } else if (currentUser?.role === 'college_admin') {
                setCurrentTab('college_admin');
              } else {
                setCurrentTab('faculty');
              }
            }}
            currentUser={currentUser}
            targetStudentId={viewingStudentId}
            availableSlots={
              currentUser?.role === 'student'
                ? studentParticipatedSlots
                : facultyAssignedSlots
            }
            onSelectSlot={handleOpenAssessmentReport}
            bookedSlotId={studentBookedSlotId}
          />
        )}

        {currentTab === 'faculty' && (
          <FacultyDashboardView
            session={session}
            transcripts={transcripts}
            onViewStudentReport={handleViewStudentReport}
            onBackToRoom={() => {
              if (session.status === 'completed' || isSlotCompletedLocally(session.id)) {
                handleOpenAssessmentReport(session.id);
                return;
              }
              setCurrentTab('room');
            }}
            onEnterGDRoom={(slotId) => {
              if (slotId) {
                const target = availableSlots.find((s) => s.id === slotId);
                if (target?.status === 'completed' || isSlotCompletedLocally(slotId)) {
                  handleOpenAssessmentReport(slotId);
                  return;
                }
                if (slotId !== session.id) {
                  handleSelectSlot(slotId);
                }
              } else if (session.status === 'completed' || isSlotCompletedLocally(session.id)) {
                handleOpenAssessmentReport(session.id);
                return;
              }
              setCurrentTab('room');
            }}
            onStartSession={handleStartSession}
            availableSlots={facultyAssignedSlots}
            onSelectSlot={handleSelectSlot}
            facultyId={currentUser?.role === 'faculty' ? ((currentUser as any).facultyId || currentUser.id) : undefined}
            currentUser={currentUser}
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
            onDeleteSlot={handleDeleteSession}
            onEnterGDRoom={(slot) => {
              if (slot) {
                const targetSlotId = typeof slot === 'string' ? slot : (slot.id || '');
                if (targetSlotId) {
                  handleOpenAssessmentReport(targetSlotId);
                }
              }
            }}
          />
        )}
      </main>

      <SessionCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSession={handleCreateSession}
        onCreateSessions={handleCreateSessions}
        collegeCode={userCollegeCode || 'DIT'}
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
