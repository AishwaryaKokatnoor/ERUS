import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Clock, 
  Users, 
  Calendar, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Radio, 
  BookOpen, 
  Lock, 
  AlertCircle,
  RotateCcw,
  GraduationCap,
  UserCheck,
  Filter,
  FileText,
  BarChart3
} from 'lucide-react';
import { GDSession } from '../../types/gd';
import { INSTITUTIONAL_FACULTY, FacultyMemberInfo } from '../../data/mockGDData';
import { getStudentBookedSlotId } from '../../utils/studentBooking';

interface SlotSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSlots: GDSession[];
  currentSlotId: string;
  onSelectSlot: (slotId: string) => void;
  onResetSlots?: () => void;
  currentUser?: any;
  bookedSlotId?: string | null;
}

export const SlotSelectionModal: React.FC<SlotSelectionModalProps> = ({
  isOpen,
  onClose,
  availableSlots,
  currentSlotId,
  onSelectSlot,
  onResetSlots,
  currentUser,
  bookedSlotId,
}) => {
  if (!isOpen) return null;

  const FACULTY_STORAGE_KEY = 'erus_selected_faculty_incharge';

  // Build complete list of faculty from institutional master list and any added to available slots
  const facultyList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dept: string; email: string; avatar?: string }>();
    INSTITUTIONAL_FACULTY.forEach((f) => {
      map.set(f.facultyId, { id: f.facultyId, name: f.name, dept: f.department, email: f.email, avatar: f.avatar });
    });
    availableSlots.forEach((s) => {
      if (s.assignedFacultyId) {
        map.set(s.assignedFacultyId, {
          id: s.assignedFacultyId,
          name: s.assignedFacultyName || s.assignedFacultyId,
          dept: s.assignedFacultyDept || 'Department Faculty',
          email: s.assignedFacultyEmail || `${s.assignedFacultyId.toLowerCase()}@college.edu`,
        });
      }
    });
    return Array.from(map.values());
  }, [availableSlots]);

  const currentSlot = availableSlots.find((s) => s.id === currentSlotId);

  // Student's selected faculty in-charge (persisted in localStorage)
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(FACULTY_STORAGE_KEY);
      if (stored) return stored;
    } catch {}
    return currentSlot?.assignedFacultyId || 'FAC-CSE-102';
  });

  const handleSelectFaculty = (facultyId: string) => {
    setSelectedFacultyId(facultyId);
    try {
      localStorage.setItem(FACULTY_STORAGE_KEY, facultyId);
    } catch {}
  };

  // Filter slots strictly by selected faculty (or show all if 'ALL' chosen)
  const slotsMatchingFaculty = useMemo(() => {
    if (selectedFacultyId === 'ALL') {
      return availableSlots;
    }
    return availableSlots.filter(
      (s) => (s.assignedFacultyId || 'FAC-CSE-102') === selectedFacultyId
    );
  }, [availableSlots, selectedFacultyId]);

  // Extract unique topics available under the selected faculty
  const uniqueTopics = useMemo(() => {
    return Array.from(new Set(slotsMatchingFaculty.map((s) => s.topic)));
  }, [slotsMatchingFaculty]);

  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    if (currentSlot && slotsMatchingFaculty.some((s) => s.id === currentSlot.id)) {
      return currentSlot.topic;
    }
    return uniqueTopics[0] || 'All Topics';
  });

  // Whenever the faculty filter changes, ensure the selected topic remains valid
  useEffect(() => {
    if (uniqueTopics.length > 0 && !uniqueTopics.includes(selectedTopic)) {
      setSelectedTopic(uniqueTopics[0]);
    }
  }, [uniqueTopics, selectedTopic]);

  // Filter slots for the active topic under this faculty
  const slotsForTopic = useMemo(() => {
    if (uniqueTopics.length === 0) return [];
    return slotsMatchingFaculty.filter((s) => s.topic === selectedTopic);
  }, [slotsMatchingFaculty, selectedTopic, uniqueTopics]);

  const activeTopicDetails = slotsForTopic[0] || slotsMatchingFaculty[0] || availableSlots[0];
  const activeFaculty = facultyList.find((f) => f.id === selectedFacultyId);

  const effectiveBookedSlotId = useMemo(() => {
    if (bookedSlotId) return bookedSlotId;
    if (currentUser?.role === 'student') {
      const studentKey = currentUser.id || currentUser.email || 'student';
      return getStudentBookedSlotId(studentKey);
    }
    return null;
  }, [bookedSlotId, currentUser]);

  const bookedSlotDetails = useMemo(() => {
    if (!effectiveBookedSlotId) return null;
    return availableSlots.find((s) => s.id === effectiveBookedSlotId) || null;
  }, [effectiveBookedSlotId, availableSlots]);

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

        {/* Modal Header */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Student Portal: Discussion Slot Browser</span>
            </span>
            {onResetSlots && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Reset all demo slots back to default enrollment counts (Slot 2: 8/15 open, Slot 3: 11/15 open)?')) {
                    onResetSlots();
                  }
                }}
                className="text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer mr-8"
                title="Reset mock slots to fresh default counts"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Demo Slots</span>
              </button>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Select Your Discussion Slot
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Filter slots by your assigned <strong>Faculty In-Charge</strong>. You will only see and join the discussion slots scheduled under your selected mentor.
          </p>
        </div>

        {/* Single Slot Policy Notice Banner for Students */}
        {currentUser?.role === 'student' && effectiveBookedSlotId && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/60 flex items-start gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                  Single Slot Policy Active (FR-2)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200">
                  1 Slot / Candidate
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                You are confirmed for <strong>{bookedSlotDetails?.slotName || effectiveBookedSlotId}</strong> ({bookedSlotDetails?.slotTiming || 'Scheduled Time'}, {bookedSlotDetails?.slotDate || 'Today'}). Under institutional academic policy, each student may only book and participate in a single discussion slot. All other slots are locked.
              </p>
            </div>
          </div>
        )}

        {/* 1. FACULTY IN-CHARGE SELECTOR */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50/70 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-800/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <label className="text-xs font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Select Faculty In-Charge:</span>
            </label>
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              {selectedFacultyId === 'ALL' 
                ? 'Showing all faculty slots' 
                : `Filtering slots for ${activeFaculty?.name || 'Selected Faculty'}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {facultyList.map((fac) => {
              const isSelected = selectedFacultyId === fac.id;
              const count = availableSlots.filter(
                (s) => (s.assignedFacultyId || 'FAC-CSE-102') === fac.id
              ).length;

              return (
                <button
                  key={fac.id}
                  type="button"
                  onClick={() => handleSelectFaculty(fac.id)}
                  className={`p-2.5 rounded-xl text-left transition-all border flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-600 shadow-sm ring-2 ring-amber-400/40'
                      : 'bg-white dark:bg-slate-900 border-amber-200/70 dark:border-amber-900/50 text-slate-800 dark:text-slate-200 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs ${
                      isSelected ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {fac.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{fac.name}</div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-amber-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {fac.dept}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px]">
                    <span className={`font-semibold ${isSelected ? 'text-amber-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {count} {count === 1 ? 'Slot' : 'Slots'}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-white font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick toggle to show all faculty slots */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => handleSelectFaculty(selectedFacultyId === 'ALL' ? 'FAC-CSE-102' : 'ALL')}
              className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Filter className="w-3 h-3" />
              <span>{selectedFacultyId === 'ALL' ? 'Filter by Specific Faculty' : `View All Faculty Slots (${availableSlots.length})`}</span>
            </button>
          </div>
        </div>

        {/* 2. TOPIC SWITCHER (Under Selected Faculty) */}
        {uniqueTopics.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <span>Select Discussion Topic ({uniqueTopics.length} Topics for this Faculty):</span>
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {uniqueTopics.map((topicTitle) => {
                const isTopicActive = topicTitle === selectedTopic;
                const count = slotsMatchingFaculty.filter((s) => s.topic === topicTitle).length;
                return (
                  <button
                    key={topicTitle}
                    type="button"
                    onClick={() => setSelectedTopic(topicTitle)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                      isTopicActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className="truncate max-w-[240px]">{topicTitle}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isTopicActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {count} {count === 1 ? 'Slot' : 'Slots'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. CURRENT TOPIC BANNER */}
        {slotsForTopic.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5 shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300">
                  Shared Topic For These Slots
                </span>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {slotsForTopic.length} Scheduled {slotsForTopic.length === 1 ? 'Batch' : 'Batches'}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
                {selectedTopic}
              </p>
              {activeTopicDetails?.description && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                  {activeTopicDetails.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 4. SLOTS GRID */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 px-1">
            <span>
              {selectedFacultyId === 'ALL'
                ? `All Available Slots (${slotsForTopic.length} Total):`
                : `Slots with ${activeFaculty?.name || 'Faculty In-Charge'} (${slotsForTopic.length} Total):`}
            </span>
            <span className="text-[11px] font-mono text-slate-500">Live Seat Availability</span>
          </div>

          {slotsForTopic.length === 0 ? (
            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
              <GraduationCap className="w-10 h-10 text-slate-400 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  No Slots Scheduled for this Faculty
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                  {activeFaculty?.name} does not have any active slots scheduled under this topic right now. Select another faculty mentor above to view open discussion sessions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectFaculty('FAC-CSE-102')}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold shadow-xs hover:bg-amber-600 transition-colors cursor-pointer"
              >
                Switch to Dr. Sunita Rao (Computer Science)
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {slotsForTopic.map((slot, index) => {
                const maxCap = slot.maxCapacity || 15;
                const enrolled = slot.enrolledCount ?? slot.students?.length ?? 15;
                const isFull = enrolled >= maxCap;
                const isSelected = slot.id === currentSlotId;
                const isCompleted = slot.status === 'completed';
                const seatsLeft = Math.max(0, maxCap - enrolled);
                const occupancyPercent = Math.min(100, Math.round((enrolled / maxCap) * 100));

                const isStudent = currentUser?.role === 'student';
                const isBookedSlot = isStudent && Boolean(effectiveBookedSlotId) && slot.id === effectiveBookedSlotId;
                const isLockedOtherSlot = isStudent && Boolean(effectiveBookedSlotId) && slot.id !== effectiveBookedSlotId;

                return (
                  <div
                    key={slot.id}
                    className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                      isCompleted
                        ? 'bg-purple-50/40 dark:bg-purple-950/25 border-purple-300 dark:border-purple-800/60 shadow-xs'
                        : isBookedSlot
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/60 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-500/10'
                        : isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30 shadow-md shadow-indigo-500/10'
                        : isLockedOtherSlot
                        ? 'bg-slate-100/40 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60'
                        : isFull
                        ? 'bg-slate-50/60 dark:bg-slate-950/40 border-rose-200/80 dark:border-rose-900/50'
                        : 'bg-slate-50/70 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Row: Slot Badge & Status Pill */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            isCompleted
                              ? 'bg-purple-500'
                              : isBookedSlot
                              ? 'bg-emerald-500'
                              : isLockedOtherSlot
                              ? 'bg-slate-400'
                              : isFull && !isSelected 
                              ? 'bg-rose-500' 
                              : 'bg-indigo-500'
                          }`} />
                          <span className={isLockedOtherSlot ? 'line-through decoration-slate-400/60' : ''}>
                            {slot.slotName || `Slot ${index + 1}`}
                          </span>
                        </span>

                        {/* Status Badges */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[10px] border border-purple-200 dark:border-purple-800 shadow-xs">
                            <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span>COMPLETED</span>
                          </span>
                        ) : isBookedSlot ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px] shadow-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Your Confirmed Slot</span>
                          </span>
                        ) : isLockedOtherSlot ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] border border-slate-300 dark:border-slate-700">
                            <Lock className="w-3 h-3" />
                            <span>LOCKED FOR YOU</span>
                          </span>
                        ) : isSelected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 text-white font-bold text-[10px] shadow-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Joined (Your Slot)</span>
                          </span>
                        ) : isFull ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold text-[10px] border border-rose-200 dark:border-rose-800 shadow-xs animate-pulse">
                            <AlertCircle className="w-3 h-3" />
                            <span>SLOT FULL</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] border border-emerald-200 dark:border-emerald-800">
                            <span>{seatsLeft} {seatsLeft === 1 ? 'seat left' : 'seats left'}</span>
                          </span>
                        )}
                      </div>

                      {/* Faculty In-Charge Badge */}
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-200/70 dark:border-amber-800/50 mb-2.5">
                        <GraduationCap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">
                          Faculty In-Charge: <strong>{slot.assignedFacultyName || activeFaculty?.name || 'Dr. Sunita Rao'}</strong> {slot.assignedFacultyDept ? `(${slot.assignedFacultyDept})` : ''}
                        </span>
                      </div>

                      {/* Time & Date */}
                      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mb-2.5">
                        <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="font-mono text-[11px] text-amber-900 dark:text-amber-200">
                            {slot.slotTiming || '10:00 AM - 10:30 AM'}
                          </span>
                        </div>
                        <span className="text-slate-400">•</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{slot.slotDate || 'Today'}</span>
                        </div>
                      </div>

                      {/* Capacity & Occupancy Meter */}
                      <div className="space-y-1.5 mb-3 bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                            <Users className="w-3.5 h-3.5 text-teal-500" />
                            <span>{enrolled} / {maxCap} Students Joined</span>
                          </div>
                          {isCompleted ? (
                            <span className="font-bold text-purple-600 dark:text-purple-400 text-[10px]">
                              Session Concluded
                            </span>
                          ) : isFull ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400 text-[10px]">
                              Capacity Reached
                            </span>
                          ) : (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[10px]">
                              {seatsLeft} Open
                            </span>
                          )}
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 rounded-full ${
                              isCompleted
                                ? 'bg-purple-500'
                                : isFull 
                                ? 'bg-rose-500' 
                                : occupancyPercent > 80 
                                ? 'bg-amber-500' 
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${occupancyPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      {isCompleted ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isLockedOtherSlot) {
                              alert(`Slot Locked: You have booked ${bookedSlotDetails?.slotName || 'another slot'}. Students cannot view or switch to other discussion slots.`);
                              return;
                            }
                            onSelectSlot(slot.id);
                            onClose();
                          }}
                          disabled={isLockedOtherSlot}
                          className={`w-full py-2 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs ${
                            isLockedOtherSlot
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer group'
                          }`}
                        >
                          {isLockedOtherSlot ? (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Slot Locked • Another Slot Booked</span>
                            </>
                          ) : currentUser?.role === 'student' ? (
                            <>
                              <FileText className="w-3.5 h-3.5" />
                              <span>View My Assessment Report</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </>
                          ) : (
                            <>
                              <BarChart3 className="w-3.5 h-3.5" />
                              <span>View Overall Analytics & Reports</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </>
                          )}
                        </button>
                      ) : isLockedOtherSlot ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-200 dark:border-slate-800 opacity-70"
                          title={`Slot Locked: You have already booked ${bookedSlotDetails?.slotName || 'another slot'}. Students cannot select multiple slots.`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Slot Locked • Another Slot Booked</span>
                        </button>
                      ) : isBookedSlot && isSelected ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Joined in Your Confirmed Slot</span>
                        </div>
                      ) : isBookedSlot ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSlot(slot.id);
                            onClose();
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer group"
                        >
                          <span>Enter Your Booked Slot</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ) : isSelected ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Currently Joined in This Slot</span>
                        </div>
                      ) : isFull ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-rose-200 dark:border-rose-900/50 opacity-80"
                          title="This slot is full. No seats remaining."
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Slot Full • No Seats Available</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSlot(slot.id);
                            onClose();
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-indigo-600 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs group cursor-pointer"
                        >
                          <span>Select & Book Slot</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>
            Selecting a Faculty In-Charge links your evaluation directly to that evaluator's academic rubric. Slots update dynamically as peers enroll.
          </span>
        </div>

      </div>
    </div>
  );
};
