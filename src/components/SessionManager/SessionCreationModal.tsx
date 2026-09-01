import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Clock, 
  Users, 
  BookOpen, 
  CheckCircle2, 
  Layers,
  HelpCircle
} from 'lucide-react';
import { GDSession, Student } from '../../types/gd';
import { TOPIC_PRESETS, INITIAL_STUDENTS } from '../../data/mockGDData';

interface SessionCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (newSession: GDSession) => void;
}

export const SessionCreationModal: React.FC<SessionCreationModalProps> = ({
  isOpen,
  onClose,
  onCreateSession,
}) => {
  const [topic, setTopic] = useState('Should Artificial Intelligence replace teachers?');
  const [description, setDescription] = useState('Debating AI personalized learning vs human mentorship, empathy, and ethical holistic education.');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [participantCount, setParticipantCount] = useState(8);
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [assessmentRubric, setAssessmentRubric] = useState('Standard Academic 7-Parameter Rubric');

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof TOPIC_PRESETS[0]) => {
    setTopic(preset.topic);
    setDescription(preset.description);
    setDifficulty(preset.difficulty as any);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare seated students (up to participantCount)
    const seatedStudents: Student[] = INITIAL_STUDENTS.slice(0, participantCount).map((s, idx) => ({
      ...s,
      seatNumber: idx + 1,
      speakingDurationSeconds: 0,
      speakingTurns: 0,
      interruptionCount: 0,
      questionsAnswered: 0,
      questionsInitiated: 0,
      isSpeaking: false,
      hasRaisedHand: false,
    }));

    const newSession: GDSession = {
      id: `session-${Date.now().toString().slice(-4)}`,
      topic,
      description,
      durationMinutes,
      difficulty,
      assessmentRubric,
      status: 'active',
      students: seatedStudents,
      currentPhase: 'intro',
      facilitatorSpeech: `Good morning everyone. Today's discussion topic is: "${topic}". Each participant will get an opportunity to speak. Please respect others' opinions and avoid interruptions.`,
      facilitatorAction: 'Introducing discussion and explaining rules',
      isFacilitatorSpeaking: false,
      silenceTimerSeconds: 0,
      currentSpeakerId: null,
      breakoutRooms: [
        {
          id: `br-1-${Date.now()}`,
          name: 'Breakout Pod Alpha',
          topic: `${topic} - Core Perspectives`,
          studentIds: seatedStudents.slice(0, 4).map((s) => s.id),
          status: 'active',
        },
        {
          id: `br-2-${Date.now()}`,
          name: 'Breakout Pod Beta',
          topic: `${topic} - Policy & Future Impact`,
          studentIds: seatedStudents.slice(4, 8).map((s) => s.id),
          status: 'active',
        },
      ],
      createdAt: new Date().toISOString(),
      startedAt: Date.now(),
    };

    onCreateSession(newSession);

    // Sync to backend
    try {
      fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          description,
          durationMinutes,
          participantCount,
          difficulty,
          assessmentRubric,
        }),
      }).catch((e) => console.warn('Create session API sync:', e));
    } catch (e) {
      console.warn(e);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto transition-colors duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              Module 1: Session Manager
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-heading font-bold text-slate-900 dark:text-white">
            Create Group Discussion Session
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Configure topic, duration, participant roster, and rubric parameters.
          </p>
        </div>

        {/* Quick Topic Presets */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Preset Topic Library:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TOPIC_PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                  topic === preset.topic
                    ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{preset.category}</span>
                  <span>{preset.difficulty}</span>
                </div>
                <p className="font-bold line-clamp-1">{preset.topic}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Discussion Topic:</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Topic Brief / Context:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Duration (Minutes):</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes</option>
                <option value={20}>20 Minutes (Standard)</option>
                <option value={30}>30 Minutes (Deep)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Participant Seats:</label>
              <select
                value={participantCount}
                onChange={(e) => setParticipantCount(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value={4}>4 Students (Pods)</option>
                <option value={6}>6 Students</option>
                <option value={8}>8 Students (Full Table)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Difficulty Level:</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">Assessment Rubric Selected:</span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Standard 7-Parameter Formula: English (20%), Fluency (20%), Clarity (15%), Confidence (15%), Content (15%), Collaboration (10%), Leadership (5%).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-md shadow-indigo-600/20 dark:shadow-indigo-600/30 transition-all active:scale-95"
            >
              Launch Live GD Session
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
