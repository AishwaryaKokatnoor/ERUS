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
import { GDSession, TranscriptEntry, StudentAssessmentReport } from './types/gd';
import { 
  INITIAL_SESSION, 
  INITIAL_TRANSCRIPTS, 
  SAMPLE_REPORT_RAHUL 
} from './data/mockGDData';
import { facilitatorVoice } from './utils/speechSynthesis';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { getNextUniqueFacilitatorPrompt, sessionQuestionTracker } from './utils/facilitatorQuestionEngine';

function GDAppContent() {
  const [currentTab, setCurrentTab] = useState<'room' | 'report' | 'faculty' | 'manager'>('room');
  const [session, setSession] = useState<GDSession>(INITIAL_SESSION);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>(INITIAL_TRANSCRIPTS);
  const [activeReport, setActiveReport] = useState<StudentAssessmentReport>(SAMPLE_REPORT_RAHUL);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(315); // Starts at 5:15 in demo
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const { theme } = useTheme();

  // Sync voice engine mute state
  useEffect(() => {
    facilitatorVoice.setMuted(voiceMuted);
  }, [voiceMuted]);

  // Main session elapsed timer & silence deadlock tracker
  useEffect(() => {
    if (session.status !== 'active') return;

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
  }, [session.status, session.isFacilitatorSpeaking, session.currentSpeakerId]);

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
    // Generate AI evaluation for User (Rahul Kumar - Seat 1)
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

  const handleCreateSession = (newSession: GDSession) => {
    sessionQuestionTracker.clear();
    setSession(newSession);
    setTranscripts([
      {
        id: `t-init-${Date.now()}`,
        sessionId: newSession.id,
        speakerId: 'ai-facilitator',
        speakerName: 'AI Facilitator (ERUS)',
        seatNumber: null,
        isFacilitator: true,
        timestamp: '00:00',
        timestampSeconds: 0,
        text: newSession.facilitatorSpeech,
        type: 'intro',
        sentiment: 'positive',
      },
    ]);
    setElapsedSeconds(0);
    setCurrentTab('room');
  };

  const handleViewStudentReport = (studentId: string) => {
    setCurrentTab('report');
  };

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
          />
        )}

        {currentTab === 'report' && (
          <StudentReportView
            session={session}
            report={activeReport}
            onBackToRoom={() => setCurrentTab('room')}
            onViewFacultyDashboard={() => setCurrentTab('faculty')}
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


