/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { RealisticGDRoom } from './components/GDRoom/RealisticGDRoom';
import { StudentReportView } from './components/AssessmentReport/StudentReportView';
import { FacultyDashboardView } from './components/FacultyDashboard/FacultyDashboardView';
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
import { facilitatorVoice } from './utils/speechSynthesis';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from './utils/facilitatorQuestionEngine';

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

  const STORAGE_KEY = 'erus_available_slots_v4';

  // Safely load and validate slots, purging stale legacy storage where all slots were full
  const loadInitialSlots = (): GDSession[] => {
    try {
      // Purge older legacy cache keys
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3'].forEach((k) => {
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
            return parsed;
          }
        }
      }
    } catch {}
    return INITIAL_SLOTS;
  };

  const [currentTab, setCurrentTab] = useState<'room' | 'report' | 'faculty' | 'manager'>('room');
  const [availableSlots, setAvailableSlots] = useState<GDSession[]>(loadInitialSlots);
  const [session, setSession] = useState<GDSession>(() => {
    const slots = loadInitialSlots();
    return slots[0] || INITIAL_SESSION;
  });
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>(INITIAL_TRANSCRIPTS);
  const [activeReport, setActiveReport] = useState<StudentAssessmentReport>(SAMPLE_REPORT_RAHUL);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(315); // Starts at 5:15 in demo
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const { theme } = useTheme();

  // Guard: Students are strictly restricted to their own portal and cannot view Faculty Analytics
  useEffect(() => {
    if (currentUser?.role === 'student' && currentTab === 'faculty') {
      setCurrentTab('room');
    }
  }, [currentUser, currentTab]);

  // Guard: When currentUser is faculty, ensure all students have isUser: false so faculty is purely an observer
  useEffect(() => {
    if (currentUser?.role === 'faculty') {
      setSession((prev) => ({
        ...prev,
        students: prev.students.map((s) => (s.isUser ? { ...s, isUser: false } : s)),
      }));
    }
  }, [currentUser]);

  // Keep availableSlots persisted to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(availableSlots));
    } catch {}
  }, [availableSlots]);

  // Reset slots back to clean demo defaults
  const handleResetSlots = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3'].forEach((k) => {
        localStorage.removeItem(k);
      });
    } catch {}
    setAvailableSlots(INITIAL_SLOTS);
    setSession(INITIAL_SLOTS[0]);
  };

  // Handle Login Event
  const handleLogin = (user: AuthUser) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('erus_auth_user', JSON.stringify(user));
    } catch {}

    if (user.role === 'student') {
      setViewingStudentId(null);
      const activeSlotId = session.id;
      const studentUserObj: Student = {
        ...INITIAL_SESSION.students[0],
        id: user.id || 'slot-stu-1',
        name: user.name,
        college: user.college,
        course: user.course,
        batch: user.batch,
        isUser: true,
      };
      setActiveReport(generateStudentReport(studentUserObj, session.topic, session.durationMinutes));

      setAvailableSlots((prevSlots) =>
        prevSlots.map((slot) => {
          const isCurrentSlot = slot.id === activeSlotId;
          return {
            ...slot,
            students: slot.students.map((s, idx) => {
              const shouldBeUser = isCurrentSlot && (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber);
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
        ...prev,
        students: prev.students.map((s, idx) => ({
          ...s,
          isUser: idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber,
          name: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.name : s.name,
          college: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.college : s.college,
          course: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.course : s.course,
          batch: (idx === 0 || s.id === user.id || s.seatNumber === user.seatNumber) ? user.batch : s.batch,
        })),
      }));
      setCurrentTab('room');
    } else {
      // Faculty evaluator starts at the Faculty Analytics dashboard and observes sessions
      setSession((prev) => ({
        ...prev,
        students: prev.students.map((s) => ({ ...s, isUser: false })),
      }));
      setAvailableSlots((prevSlots) =>
        prevSlots.map((slot) => ({
          ...slot,
          students: slot.students.map((s) => ({ ...s, isUser: false })),
        }))
      );
      setCurrentTab('faculty');
    }
  };

  // Handle Logout Event
  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('erus_auth_user');
    } catch {}
  };

  // Sync voice engine mute state
  useEffect(() => {
    facilitatorVoice.setMuted(voiceMuted);
  }, [voiceMuted]);

  // Main session elapsed timer & silence deadlock tracker
  useEffect(() => {
    if (!currentUser || session.status !== 'active') return;

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
  }, [currentUser, session.status, session.isFacilitatorSpeaking, session.currentSpeakerId]);

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
    // Generate AI evaluation for current user student
    const userStudent = session.students.find((s) => s.isUser) || session.students[0];
    
    try {
      const res = await fetch('/api/facilitator/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: userStudent,
          transcriptHistory: transcripts,
          sessionId: session.id,
          topic: session.topic,
          durationMinutes: session.durationMinutes,
        }),
      });

      const data = await res.json();
      if (data.report) {
        setActiveReport(data.report);
      }
    } catch (e) {
      console.warn('Evaluation fallback:', e);
    }

    setSession((prev) => ({
      ...prev,
      status: 'completed',
      currentPhase: 'conclusion',
      facilitatorSpeech: 'Thank you everyone. We discussed both the advantages and disadvantages thoroughly. Individual assessment reports have now been compiled.',
    }));

    setCurrentTab('report');
  };

  const handleSelectSlot = (slotId: string) => {
    const targetSlot = availableSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;

    if (slotId === session.id) return; // already in this slot

    const targetMaxCap = targetSlot.maxCapacity || 15;
    const targetCurrentEnrolled = targetSlot.enrolledCount ?? targetSlot.students?.length ?? 15;

    // Check if slot is already full
    if (targetCurrentEnrolled >= targetMaxCap) {
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

    const activeSlot: GDSession = {
      ...targetSlot,
      status: 'active',
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
              status: 'scheduled',
              enrolledCount: newPrevCount,
              students: s.students.map((st) => (st.isUser ? { ...st, isUser: false } : st)),
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
        text: activeSlot.facilitatorSpeech || `Welcome to ${activeSlot.slotName || 'this slot'}. The discussion on "${activeSlot.topic}" is underway. You are seated at Seat 1 with ${newTargetEnrolledCount} participants in the room.`,
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

    const activeNewSession = { ...newSessions[0], status: 'active' as const };
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
    setCurrentTab('room');
  };

  const handleCreateSession = (newSession: GDSession) => {
    handleCreateSessions([newSession]);
  };

  const handleViewStudentReport = (studentId: string) => {
    setCurrentTab('report');
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
      />

      {/* Main Responsive Application Viewport */}
      <main className="flex-1 pb-10 px-2 sm:px-4 max-w-7xl mx-auto w-full">
        {currentTab === 'room' && (
          <RealisticGDRoom
            session={session}
            setSession={setSession}
            transcripts={transcripts}
            setTranscripts={setTranscripts}
            onFinishSession={handleFinishSession}
            voiceMuted={voiceMuted}
            elapsedSeconds={elapsedSeconds}
            availableSlots={availableSlots}
            onSelectSlot={handleSelectSlot}
            onResetSlots={handleResetSlots}
            currentUser={currentUser}
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
            onBackToRoom={() => setCurrentTab('room')}
            onViewFacultyDashboard={() => setCurrentTab('faculty')}
            currentUser={currentUser}
            targetStudentId={viewingStudentId}
          />
        )}

        {currentTab === 'faculty' && (
          <FacultyDashboardView
            session={session}
            transcripts={transcripts}
            onViewStudentReport={handleViewStudentReport}
            onBackToRoom={() => setCurrentTab('room')}
          />
        )}
      </main>

      {/* Session Creation Modal */}
      <SessionCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSessions={handleCreateSessions}
        onCreateSession={handleCreateSession}
      />

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <GDAppContent />
    </ThemeProvider>
  );
}
