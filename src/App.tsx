/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { RealisticGDRoom } from './components/GDRoom/RealisticGDRoom';
import { StudentPortalView } from './components/StudentPortal/StudentPortalView';
import { SlotSelectionModal } from './components/GDRoom/SlotSelectionModal';
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
  createDefaultAssessmentReport,
  generateStudentReport,
  generateSlotParticipants 
} from './data/mockGDData';
import { facilitatorVoice, roomVoice } from './utils/speechSynthesis';
import { webrtcAudio } from './utils/webrtcAudio';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from './utils/facilitatorQuestionEngine';
import { getSocket } from './utils/socket';

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

  const STORAGE_KEY = 'erus_available_slots_v6';

  // Safely load and validate slots, purging stale legacy storage
  const loadInitialSlots = (): GDSession[] => {
    try {
      // Purge older legacy cache keys
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3', 'erus_available_slots_v4', 'erus_available_slots_v5'].forEach((k) => {
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

  const [currentTab, setCurrentTab] = useState<'topics' | 'room' | 'report' | 'faculty' | 'manager'>(() => {
    try {
      const saved = localStorage.getItem('erus_auth_user');
      const user = saved ? JSON.parse(saved) : null;
      if (user?.role === 'student') return 'topics';
      if (user?.role === 'faculty') return 'faculty';
    } catch {}
    return 'topics';
  });
  const [isSlotModalOpen, setIsSlotModalOpen] = useState<boolean>(false);
  const [selectedPortalTopic, setSelectedPortalTopic] = useState<string | undefined>(undefined);
  const [availableSlots, setAvailableSlots] = useState<GDSession[]>(loadInitialSlots);
  const [session, setSession] = useState<GDSession>(() => {
    const slots = loadInitialSlots();
    return slots[0] || INITIAL_SESSION;
  });
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [activeReport, setActiveReport] = useState<StudentAssessmentReport>(() =>
    createDefaultAssessmentReport()
  );
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const { theme } = useTheme();

  // Guard: Students are strictly restricted to their own portal and cannot view Faculty Analytics
  useEffect(() => {
    if (currentUser?.role === 'student' && currentTab === 'faculty') {
      setCurrentTab('topics');
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
      ['erus_available_slots', 'erus_available_slots_v1', 'erus_available_slots_v2', 'erus_available_slots_v3', 'erus_available_slots_v4', 'erus_available_slots_v5'].forEach((k) => {
        localStorage.removeItem(k);
      });
    } catch {}
    setAvailableSlots(INITIAL_SLOTS);
    setSession(INITIAL_SLOTS[0]);
    setTranscripts([]);
    setElapsedSeconds(0);
  };

  // Socket.IO Real-Time Room & Users Synchronization
  useEffect(() => {
    if (!currentUser) return;

    const socket = getSocket();
    const currentRoomId = session.id || 'slot-morning-1';

    const joinCurrentRoom = () => {
      socket.emit('join_room', {
        roomId: currentRoomId,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          college: currentUser.college,
          course: currentUser.course,
          batch: currentUser.batch,
          role: currentUser.role,
        },
      });
      webrtcAudio.initialize(socket, currentRoomId, currentUser.id);
    };

    if (socket.connected) {
      joinCurrentRoom();
    } else {
      socket.connect();
    }

    socket.on('connect', joinCurrentRoom);

    // Synchronize real-time participants (NO DUMMY USERS)
    const handleRoomUsers = (participants: any[]) => {
      if (!Array.isArray(participants)) return;
      console.log(`[Socket.IO Room] Live users in room "${currentRoomId}":`, participants);
      webrtcAudio.syncRoomParticipants(participants);

      const realStudents: Student[] = participants
        .filter((p) => p.role !== 'faculty')
        .map((p, idx) => {
          const isUser = currentUser.role !== 'faculty' && (
            (currentUser.id && p.userId === currentUser.id) ||
            (socket.id && p.socketId === socket.id) ||
            p.name === currentUser.name
          );

          return {
            id: p.userId || p.socketId,
            name: p.name,
            seatNumber: p.seatNumber || (idx + 1),
            college: p.college || 'Engineering Institute',
            course: p.course || 'B.Tech',
            batch: p.batch || '2022-2026',
            avatar: p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}`,
            isUser,
            micActive: !!p.micActive,
            isSpeaking: !!p.isSpeaking,
            hasRaisedHand: !!p.hasRaisedHand,
            cameraActive: !!p.cameraActive,
            speakingDurationSeconds: p.speakingDurationSeconds || 0,
            speakingTurns: p.speakingTurns || 0,
            interruptionCount: p.interruptionCount || 0,
            questionsAnswered: p.questionsAnswered || 0,
            questionsInitiated: p.questionsInitiated || 0,
            sentiment: 'positive',
          };
        });

      setSession((prev) => ({
        ...prev,
        students: realStudents,
        enrolledCount: realStudents.length,
      }));

      // Update current slot enrolled count in availableSlots
      setAvailableSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === currentRoomId
            ? { ...slot, enrolledCount: realStudents.length, students: realStudents }
            : slot
        )
      );
    };

    // Synchronize incoming live transcripts from peers or AI
    const handleNewTranscript = (entry: TranscriptEntry) => {
      if (!entry) return;
      setTranscripts((prev) => {
        if (prev.some((t) => t.id === entry.id)) return prev;
        return [...prev, entry];
      });

      // Voice incoming peer transcript if live WebRTC audio is not already playing for this peer
      if (!entry.isFacilitator && entry.speakerId && entry.speakerId !== currentUser?.id) {
        if (!webrtcAudio.isPeerAudioActive(entry.speakerId)) {
          setSession((prev) => {
            const peerStudent = prev.students.find(
              (s) => s.id === entry.speakerId || s.name === entry.speakerName
            );
            if (peerStudent) {
              roomVoice.speakAsStudent(peerStudent, entry.text);
            }
            return prev;
          });
        }
      }
    };

    // Synchronize current speaker
    const handleSpeakerActive = ({ speakerId }: { speakerId: string | null }) => {
      setSession((prev) => ({
        ...prev,
        currentSpeakerId: speakerId,
      }));
    };

    socket.on('room_users', handleRoomUsers);
    socket.on('new_transcript', handleNewTranscript);
    socket.on('speaker_active', handleSpeakerActive);

    return () => {
      socket.off('connect', joinCurrentRoom);
      socket.off('room_users', handleRoomUsers);
      socket.off('new_transcript', handleNewTranscript);
      socket.off('speaker_active', handleSpeakerActive);
      socket.emit('leave_room', { roomId: currentRoomId });
      webrtcAudio.cleanup();
    };
  }, [currentUser, session.id]);

  // Handle Login Event
  const handleLogin = (user: AuthUser) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('erus_auth_user', JSON.stringify(user));
    } catch {}

    if (user.role === 'student') {
      setViewingStudentId(null);
      const studentUserObj: Student = {
        id: user.id || 'slot-stu-1',
        name: user.name,
        college: user.college || 'Engineering Institute',
        course: user.course || 'B.Tech CSE',
        batch: user.batch || '2022-2026',
        avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`,
        seatNumber: 1,
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
        sentiment: 'positive',
      };
      setActiveReport(generateStudentReport(studentUserObj, session.topic, session.durationMinutes));

      // Put the current user in students; Socket.IO will sync all real users on join
      setSession((prev) => ({
        ...prev,
        students: [studentUserObj],
        enrolledCount: 1,
      }));
      setCurrentTab('topics');
    } else {
      // Faculty evaluator starts at the Faculty Analytics dashboard and observes sessions
      setSession((prev) => ({
        ...prev,
        students: prev.students.map((s) => ({ ...s, isUser: false })),
      }));
      setCurrentTab('faculty');
    }
  };

  // Handle Logout Event
  const handleLogout = () => {
    try {
      const socket = getSocket();
      socket.emit('leave_room', { roomId: session.id });
    } catch {}
    setCurrentUser(null);
    try {
      localStorage.removeItem('erus_auth_user');
    } catch {}
  };

  // Sync voice engine mute state
  useEffect(() => {
    facilitatorVoice.setMuted(voiceMuted);
    roomVoice.setMuted(voiceMuted);
    webrtcAudio.setMuted(voiceMuted);
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

    // Prepare student roster for target slot without dummy users
    let updatedTargetStudents: Student[] = [];

    if (currentUser && currentUser.role === 'student') {
      const studentUserObj: Student = {
        id: currentUser.id || 'slot-stu-1',
        name: currentUser.name,
        college: currentUser.college || 'Engineering Institute',
        course: currentUser.course || 'B.Tech CSE',
        batch: currentUser.batch || '2022-2026',
        avatar: currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.name)}`,
        seatNumber: 1,
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
        sentiment: 'positive',
      };
      updatedTargetStudents = [studentUserObj];
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
    setCurrentTab('room');
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
    setViewingStudentId(studentId);
    const target = session.students.find((s) => s.id === studentId);
    if (target) {
      setActiveReport(generateStudentReport(target, session.topic, session.durationMinutes));
    }
    setCurrentTab('report');
  };

  // If unauthenticated, render the Dedicated Student / Faculty Authentication Portal
  if (!currentUser) {
    return <AuthPortal onLogin={handleLogin} defaultRole="student" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      
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
      <main className="flex-1 py-4 sm:py-6 px-3 sm:px-6 max-w-7xl mx-auto w-full">
        {currentTab === 'topics' && (
          <StudentPortalView
            currentUser={currentUser}
            availableSlots={availableSlots}
            onExploreSlots={(topic) => {
              setSelectedPortalTopic(topic);
              setIsSlotModalOpen(true);
            }}
            onSelectSlot={(slotId) => {
              handleSelectSlot(slotId);
              setIsSlotModalOpen(false);
              setCurrentTab('room');
            }}
            onEnterActiveRoom={() => setCurrentTab('room')}
            activeSession={session}
          />
        )}

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

      {/* Slot Selection Modal from Student Topics Portal */}
      <SlotSelectionModal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        availableSlots={availableSlots}
        currentSlotId={session.id}
        onSelectSlot={(slotId) => {
          handleSelectSlot(slotId);
          setIsSlotModalOpen(false);
          setCurrentTab('room');
        }}
        onResetSlots={handleResetSlots}
        initialTopic={selectedPortalTopic}
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
