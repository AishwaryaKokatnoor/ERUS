import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Clock, 
  Users, 
  Calendar, 
  ShieldCheck, 
  Plus, 
  Trash2,
  GraduationCap
} from 'lucide-react';
import { GDSession, Student, GDRoomLayoutType } from '../../types/gd';
import { generateSlotParticipants, INSTITUTIONAL_FACULTY, FacultyMemberInfo } from '../../data/mockGDData';
import { fetchCollegeFaculty } from '../../utils/authApi';

export interface SlotScheduleItem {
  id: string;
  slotName: string;
  startTime: string;
  endTime: string;
  slotDate: string;
  participantCount: number;
}

interface SessionCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession?: (newSession: GDSession) => void;
  onCreateSessions?: (newSessions: GDSession[]) => void;
  collegeCode?: string;
}

const DEFAULT_FACULTY_ID = INSTITUTIONAL_FACULTY?.[0]?.facultyId || '';

const PRESET_TIMINGS = [
  { label: 'Morning', start: '09:30 AM', end: '10:00 AM' },
  { label: 'Midday', start: '11:45 AM', end: '12:15 PM' },
  { label: 'Afternoon', start: '02:30 PM', end: '03:00 PM' },
  { label: 'Evening', start: '04:30 PM', end: '05:00 PM' },
];

export const SessionCreationModal: React.FC<SessionCreationModalProps> = ({
  isOpen,
  onClose,
  onCreateSession,
  onCreateSessions,
  collegeCode = 'DIT',
}) => {
  const [topic, setTopic] = useState('Impact of Emerging Technologies on Sustainable Development');
  const [description, setDescription] = useState('Analyzing economic feasibility, ethical implications, and real-world implementation across sectors.');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [assessmentRubric, setAssessmentRubric] = useState('Standard Academic 7-Parameter Rubric');
  const [roomLayout, setRoomLayout] = useState<GDRoomLayoutType>('round_table');

  // Faculty In-Charge Assignment State
  const [facultyList, setFacultyList] = useState<FacultyMemberInfo[]>(INSTITUTIONAL_FACULTY);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(DEFAULT_FACULTY_ID);

  // Load college faculty from API on mount
  useEffect(() => {
    fetchCollegeFaculty(collegeCode)
      .then((fac) => {
        if (fac && fac.length > 0) {
          setFacultyList((prev) => {
            const merged = [...prev];
            fac.forEach((f: any) => {
              if (!merged.some((m) => m.facultyId === f.facultyId)) {
                merged.push({
                  id: f.id || f.facultyId,
                  name: f.name,
                  email: f.email,
                  facultyId: f.facultyId,
                  department: f.department || 'Academic Department',
                  designation: f.designation || 'Faculty Evaluator',
                  avatar: f.avatar,
                });
              }
            });
            return merged;
          });
        }
      })
      .catch(() => {});
  }, [collegeCode]);

  // Multiple slots state for this topic
  const [slots, setSlots] = useState<SlotScheduleItem[]>([
    {
      id: 'slot-cfg-1',
      slotName: 'Slot 1 - Morning Batch',
      startTime: '09:30 AM',
      endTime: '10:00 AM',
      slotDate: 'Today',
      participantCount: 8,
    },
    {
      id: 'slot-cfg-2',
      slotName: 'Slot 2 - Afternoon Batch',
      startTime: '02:30 PM',
      endTime: '03:00 PM',
      slotDate: 'Today',
      participantCount: 8,
    },
  ]);

  if (!isOpen) return null;

  const handleAddSlot = (preset?: { start: string; end: string; label: string }) => {
    const nextIdx = slots.length + 1;
    const newSlot: SlotScheduleItem = {
      id: `slot-cfg-${Date.now()}-${nextIdx}`,
      slotName: preset ? `Slot ${nextIdx} - ${preset.label} Batch` : `Slot ${nextIdx} - Batch ${String.fromCharCode(64 + nextIdx)}`,
      startTime: preset ? preset.start : '04:30 PM',
      endTime: preset ? preset.end : '05:00 PM',
      slotDate: 'Today',
      participantCount: 8,
    };
    setSlots((prev) => [...prev, newSlot]);
  };

  const handleRemoveSlot = (id: string) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSlot = (id: string, field: keyof SlotScheduleItem, value: any) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          [field]: field === 'participantCount' ? Math.max(2, Math.min(30, Number(value) || 8)) : value,
        };
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!topic.trim()) return;

    const baseTimestamp = Date.now();
    const selectedFaculty = facultyList.find((f) => f.facultyId === selectedFacultyId) || facultyList[0];

    const createdSessions: GDSession[] = slots.map((slot, index) => {
      const studentCount = Math.max(2, Math.min(30, slot.participantCount || 8));
      const seatedStudents: Student[] = generateSlotParticipants(studentCount);

      // Divide participants into 3 balanced breakout pods
      const podSize = Math.max(1, Math.ceil(seatedStudents.length / 3));
      const podAlphaIds = seatedStudents.slice(0, podSize).map((s) => s.id);
      const podBetaIds = seatedStudents.slice(podSize, podSize * 2).map((s) => s.id);
      const podGammaIds = seatedStudents.slice(podSize * 2).map((s) => s.id);

      const slotTimingStr = `${slot.startTime} - ${slot.endTime}`;
      const slotNameStr = slot.slotName.trim() || `Slot ${index + 1}`;

      return {
        id: `slot-${baseTimestamp.toString().slice(-4)}-${index + 1}`,
        slotName: slotNameStr,
        slotTiming: slotTimingStr,
        slotDate: slot.slotDate || 'Today',
        maxCapacity: studentCount,
        enrolledCount: 0,
        roomLayout: roomLayout,
        topic: topic.trim(),
        description: description.trim(),
        durationMinutes,
        difficulty,
        assessmentRubric,
        assignedFacultyId: selectedFaculty.facultyId,
        assignedFacultyName: selectedFaculty.name,
        assignedFacultyDept: selectedFaculty.department,
        assignedFacultyEmail: selectedFaculty.email,
        status: 'scheduled',
        students: seatedStudents,
        currentPhase: 'intro',
        facilitatorSpeech: `Good morning participants of ${slotNameStr}. Today's discussion topic is: "${topic}". There are ${studentCount} candidates participating in this slot scheduled for ${slotTimingStr}. Everyone will get an opportunity to speak. The floor will be open shortly.`,
        facilitatorAction: `Slot scheduled for ${slotTimingStr} (${studentCount} students seated)`,
        isFacilitatorSpeaking: false,
        silenceTimerSeconds: 0,
        currentSpeakerId: null,
        breakoutRooms: [
          {
            id: `br-1-${baseTimestamp}-${index}`,
            name: 'Breakout Pod Alpha',
            topic: `${topic} - Foundational Analysis`,
            studentIds: podAlphaIds,
            status: 'active',
          },
          {
            id: `br-2-${baseTimestamp}-${index}`,
            name: 'Breakout Pod Beta',
            topic: `${topic} - Practical Implementation`,
            studentIds: podBetaIds,
            status: 'active',
          },
          {
            id: `br-3-${baseTimestamp}-${index}`,
            name: 'Breakout Pod Gamma',
            topic: `${topic} - Governance & Future Outlook`,
            studentIds: podGammaIds,
            status: 'active',
          },
        ],
        createdAt: new Date().toISOString(),
        
      };
    });

    if (onCreateSessions) {
      onCreateSessions(createdSessions);
    } else if (onCreateSession) {
      onCreateSession(createdSessions[0]);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl space-y-5 relative max-h-[92vh] overflow-y-auto transition-colors duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>College Admin Slot Scheduler</span>
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Create Multiple Slots for Discussion Topic
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configure a discussion topic and schedule multiple time slots. All slots will immediately appear in the student portal for selection.
          </p>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* SECTION 1: TOPIC DETAILS */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Discussion Topic Details</span>
            </div>

            {/* Discussion Topic Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Topic Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter discussion topic title..."
                required
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Topic Brief / Context */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Topic Brief & Expected Debate Themes:
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief context and guidelines for AI moderator..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            {/* Topic Settings: Duration & Difficulty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Duration per Slot:</span>
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={25}>25 Minutes (Standard)</option>
                  <option value={30}>30 Minutes (Deep)</option>
                  <option value={45}>45 Minutes (Extended)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Difficulty Level:
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Faculty In-Charge Assignment */}
            <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Assign Faculty In-Charge (Evaluator & Academic Mentor):</span>
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold lowercase">
                  *students selecting this faculty will see these slots
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {facultyList.map((f) => {
                  const isSelected = f.facultyId === selectedFacultyId;
                  return (
                    <button
                      key={f.facultyId}
                      type="button"
                      onClick={() => setSelectedFacultyId(f.facultyId)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {f.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {f.name}
                          </span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        </div>
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 font-mono truncate">
                          {f.facultyId} • {f.department}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {f.designation}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Each slot is assigned to its own Faculty In-Charge. Students will see the assigned faculty on every published slot in the Student Portal.
                </span>
              </div>
            </div>

            {/* Discussion Room Visibility / Layout Mode */}
            <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-600" />
                <span>Discussion Room Visibility & Seating Mode:</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRoomLayout('round_table')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    roomLayout === 'round_table'
                      ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">1. Round Table</span>
                    <span className={`w-2 h-2 rounded-full ${roomLayout === 'round_table' ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    Circular conference table with all 15+ participants seated evenly around perimeter.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoomLayout('speaker_center')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    roomLayout === 'speaker_center'
                      ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">2. Speaker in Middle</span>
                    <span className={`w-2 h-2 rounded-full ${roomLayout === 'speaker_center' ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    Active speaker spotlighted in the center of the round table; peers surround them in an outer ring.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoomLayout('classroom')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    roomLayout === 'classroom'
                      ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">3. Classroom Presentation</span>
                    <span className={`w-2 h-2 rounded-full ${roomLayout === 'classroom' ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    Presenter stands front & center at podium before whiteboard; class seated in audience rows.
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: MULTIPLE TIME SLOTS SCHEDULE */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  <span>2. Schedule Time Slots ({slots.length} Configured)</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Configure custom timings and select the exact number of students for each slot.
                </p>
              </div>

              {/* Quick Time Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500 font-semibold">Quick Add:</span>
                {PRESET_TIMINGS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAddSlot(preset)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Slots List */}
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {slots.map((slot, index) => (
                <div
                  key={slot.id}
                  className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                        <span>Slot #{index + 1}</span>
                      </span>
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 truncate max-w-[220px]">
                        In-Charge: {facultyList.find(f => f.facultyId === selectedFacultyId)?.name || 'Faculty In-Charge'}
                      </span>
                    </div>

                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                        title="Remove this slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Slot Name */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Slot Name / Batch:
                      </label>
                      <input
                        type="text"
                        value={slot.slotName}
                        onChange={(e) => handleUpdateSlot(slot.id, 'slotName', e.target.value)}
                        placeholder="e.g. Slot 1 - Morning Batch"
                        required
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Start Time */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        <span>Start Time:</span>
                      </label>
                      <input
                        type="text"
                        value={slot.startTime}
                        onChange={(e) => handleUpdateSlot(slot.id, 'startTime', e.target.value)}
                        placeholder="09:30 AM"
                        required
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* End Time */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        End Time:
                      </label>
                      <input
                        type="text"
                        value={slot.endTime}
                        onChange={(e) => handleUpdateSlot(slot.id, 'endTime', e.target.value)}
                        placeholder="10:00 AM"
                        required
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Custom Capacity Option */}
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-amber-500" />
                          <span>No. of Students:</span>
                        </span>
                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                          {slot.participantCount} seats
                        </span>
                      </label>
                      <select
                        value={slot.participantCount}
                        onChange={(e) => handleUpdateSlot(slot.id, 'participantCount', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white cursor-pointer focus:ring-2 focus:ring-amber-500 font-medium"
                      >
                        <option value={4}>4 Students (Mini GD)</option>
                        <option value={6}>6 Students (Focused)</option>
                        <option value={8}>8 Students (Standard GD)</option>
                        <option value={10}>10 Students</option>
                        <option value={12}>12 Students</option>
                        <option value={15}>15 Students</option>
                        <option value={18}>18 Students</option>
                        <option value={20}>20 Students</option>
                        <option value={24}>24 Students</option>
                        <option value={30}>30 Students (Max)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Button to add custom slot */}
            <button
              type="button"
              onClick={() => handleAddSlot()}
              className="w-full py-2.5 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Another Time Slot for this Topic</span>
            </button>
          </div>

          {/* Student Portal Availability Alert */}
          <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/50 rounded-2xl border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong className="font-semibold">Faculty In-Charge & Student Portal Sync:</strong> Creating these {slots.length} slots will assign them to <span className="font-bold underline">{facultyList.find(f => f.facultyId === selectedFacultyId)?.name || 'the selected faculty'}</span> ({facultyList.find(f => f.facultyId === selectedFacultyId)?.department || 'Faculty'}). In the Student Portal, students selecting this faculty member will exclusively see and be able to book these slots.
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Total: <strong>{slots.length} Slots</strong> on this topic
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-semibold shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Publish {slots.length} Slots to Student Portal</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
