import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Calendar, 
  Clock, 
  Users, 
  GraduationCap, 
  CheckCircle2, 
  Lock, 
  ArrowRight, 
  RotateCcw, 
  AlertCircle, 
  ShieldCheck, 
  Sparkles, 
  Search, 
  ChevronRight, 
  ArrowLeft,
  Cpu,
  Zap,
  TrendingUp,
  Scale,
  Radio,
  SlidersHorizontal,
  HelpCircle
} from 'lucide-react';
import { GDSession, Student } from '../../types/gd';
import { AuthUser } from '../../types/auth';
import { checkCanReviveSlot } from '../../utils/studentBooking';

interface StudentTopicPortalProps {
  availableSlots: GDSession[];
  bookedSlotId?: string | null;
  bookedSlotsByTopic?: Record<string, string>;
  currentUser: AuthUser | null;
  onBookSlot: (slotId: string) => void;
  onReviveSlot: (slotId: string) => void;
  onEnterRoom: (slotId: string) => void;
}

export const StudentTopicPortal: React.FC<StudentTopicPortalProps> = ({
  availableSlots,
  bookedSlotId,
  bookedSlotsByTopic,
  currentUser,
  onBookSlot,
  onReviveSlot,
  onEnterRoom,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviveModalSlot, setReviveModalSlot] = useState<GDSession | null>(null);

  // Normalize map of { [topic]: slotId } for the student
  const bookedSlotsMap = useMemo(() => {
    if (bookedSlotsByTopic && Object.keys(bookedSlotsByTopic).length > 0) {
      return bookedSlotsByTopic;
    }
    if (bookedSlotId) {
      const s = availableSlots.find((slot) => slot.id === bookedSlotId);
      const t = s?.topic || 'General Topic';
      return { [t]: bookedSlotId };
    }
    return {};
  }, [bookedSlotsByTopic, bookedSlotId, availableSlots]);

  // Find all slots booked by this student across topics
  const allBookedSlots = useMemo(() => {
    const bookedIds = new Set(Object.values(bookedSlotsMap));
    if (bookedIds.size === 0) return [];
    return availableSlots.filter((s) => bookedIds.has(s.id));
  }, [availableSlots, bookedSlotsMap]);

  // Backward-compatible single booked slot reference
  const bookedSlot = allBookedSlots[0] || null;

  // Group available slots by topic
  const topicsData = useMemo(() => {
    const topicMap = new Map<string, {
      topic: string;
      description: string;
      difficulty: string;
      durationMinutes: number;
      slots: GDSession[];
      facultyList: Array<{ name: string; dept?: string; avatar?: string }>;
      totalSeats: number;
      enrolledSeats: number;
      hasBookedSlot: boolean;
      bookedSlotIdForTopic?: string;
    }>();

    (availableSlots || []).forEach((slot) => {
      const topicTitle = slot.topic || 'General Topic';
      const existing = topicMap.get(topicTitle);
      const maxCap = slot.maxCapacity || 15;
      const enrolled = slot.enrolledCount ?? slot.students?.length ?? 0;
      const bookedSlotForThisTopic = bookedSlotsMap[topicTitle];
      const isBooked = Boolean(bookedSlotForThisTopic && bookedSlotForThisTopic === slot.id);

      if (!existing) {
        topicMap.set(topicTitle, {
          topic: topicTitle,
          description: slot.description || 'Institutional Group Discussion evaluation session.',
          difficulty: slot.difficulty || 'Intermediate',
          durationMinutes: slot.durationMinutes || 25,
          slots: [slot],
          facultyList: slot.assignedFacultyName ? [{
            name: slot.assignedFacultyName,
            dept: slot.assignedFacultyDept,
          }] : [],
          totalSeats: maxCap,
          enrolledSeats: enrolled,
          hasBookedSlot: Boolean(bookedSlotForThisTopic),
          bookedSlotIdForTopic: bookedSlotForThisTopic,
        });
      } else {
        existing.slots.push(slot);
        existing.totalSeats += maxCap;
        existing.enrolledSeats += enrolled;
        if (bookedSlotForThisTopic) {
          existing.hasBookedSlot = true;
          existing.bookedSlotIdForTopic = bookedSlotForThisTopic;
        }
        if (slot.assignedFacultyName && !existing.facultyList.some((f) => f.name === slot.assignedFacultyName)) {
          existing.facultyList.push({
            name: slot.assignedFacultyName,
            dept: slot.assignedFacultyDept,
          });
        }
      }
    });

    return Array.from(topicMap.values());
  }, [availableSlots, bookedSlotsMap]);

  // Filter topics by search query
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return topicsData;
    const q = searchQuery.toLowerCase();
    return topicsData.filter(
      (t) =>
        (t.topic || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.facultyList.some((f) => (f.name || '').toLowerCase().includes(q) || (f.dept && f.dept.toLowerCase().includes(q)))
    );
  }, [topicsData, searchQuery]);

  // Selected topic object (when drilldown is active)
  const activeTopicObj = useMemo(() => {
    if (!selectedTopic) return null;
    return topicsData.find((t) => t.topic === selectedTopic) || null;
  }, [selectedTopic, topicsData]);

  // Helper icon by topic keywords
  const getTopicIcon = (title: string) => {
    const t = (title || '').toLowerCase();
    if (t.includes('ai') || t.includes('intelligence') || t.includes('teacher') || t.includes('software')) {
      return <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
    }
    if (t.includes('vehicle') || t.includes('hydrogen') || t.includes('clean') || t.includes('energy')) {
      return <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
    }
    if (t.includes('basic income') || t.includes('economic') || t.includes('finance') || t.includes('security')) {
      return <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    }
    return <Scale className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-in fade-in duration-200">
      
      {/* 1. HERO INSTITUTIONAL GREETING */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 p-6 sm:p-8 text-white shadow-xl border border-indigo-800/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-indigo-200 border border-white/15">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-300" />
              <span>Student GD Placement & Evaluation Portal</span>
              <span className="text-indigo-400">•</span>
              <span>{currentUser?.college || 'Delhi Institute of Technology'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome, {currentUser?.name || 'Student Participant'}
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/90 leading-relaxed">
              Explore scheduled group discussion topics, review allotted faculty evaluators, and confirm your seat in an available time slot. Under institutional guidelines, each candidate can reserve <strong>one discussion slot per topic</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* 2. CONFIRMED BOOKED SLOTS BANNER (If Student Has Booked Any Topic Slots) */}
      {allBookedSlots.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 px-1">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Your Confirmed Discussion Bookings ({allBookedSlots.length})</span>
            </span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              1 Slot Per Topic Policy Active
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {allBookedSlots.map((bSlot) => {
              const canReviveInfo = checkCanReviveSlot(bSlot);
              const isLockedDueToTime = !canReviveInfo.canRevive;

              return (
                <div
                  key={bSlot.id}
                  className="p-5 rounded-3xl bg-emerald-50/80 dark:bg-emerald-950/40 border-2 border-emerald-500/80 dark:border-emerald-500/60 shadow-md shadow-emerald-600/5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30 mt-0.5">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                            Confirmed Topic Slot
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                            {bSlot.slotName}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                          {bSlot.topic}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 flex-wrap pt-0.5">
                          <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{bSlot.slotTiming || '10:00 AM - 10:30 AM'} ({bSlot.slotDate || 'Today'})</span>
                          </span>
                          {bSlot.assignedFacultyName && (
                            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Evaluator: <strong>{bSlot.assignedFacultyName}</strong></span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-medium text-slate-500">
                            <Users className="w-3.5 h-3.5" />
                            <span>{bSlot.enrolledCount ?? bSlot.students?.length ?? 15}/{bSlot.maxCapacity || 15} Candidates</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Enter GD Room & Revive/Release Slot */}
                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onEnterRoom(bSlot.id)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Radio className="w-4 h-4 animate-pulse" />
                        <span>Enter Discussion Room</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {/* Revive Slot Button with 1-Hour Guard */}
                      {isLockedDueToTime ? (
                        <button
                          type="button"
                          disabled
                          title="Slot starts within 1 hour. Cancellation or slot changes are disabled as per institutional evaluation policy."
                          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-not-allowed opacity-75"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Revive Locked (&lt;1h to Start)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReviveModalSlot(bSlot)}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 hover:border-rose-300 text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
                          title="Revive your booking to release this seat and choose another discussion slot on this topic (available up to 1 hour before session starts)"
                        >
                          <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-45 transition-transform" />
                          <span>Revive / Change Slot</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. MAIN TOPICS OR DETAILED SLOTS VIEW */}
      {!selectedTopic ? (
        /* TOPICS SELECTION VIEW */
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Discussion Topics ({topicsData.length})</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Select a topic below to view its scheduled time slots and allotted faculty evaluators.
              </p>
            </div>

            {/* Search filter */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search topics or faculty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Topics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {filteredTopics.map((topicItem, index) => {
              const openSeats = Math.max(0, topicItem.totalSeats - topicItem.enrolledSeats);
              const isTopicBooked = topicItem.hasBookedSlot;

              return (
                <div
                  key={topicItem.topic}
                  onClick={() => setSelectedTopic(topicItem.topic)}
                  className={`p-5 sm:p-6 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden ${
                    isTopicBooked
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600/60 hover:shadow-lg hover:shadow-emerald-500/10'
                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600/60 hover:shadow-lg hover:shadow-indigo-500/10'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header Row: Topic Number, Domain Tag & Booking Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-800/40">
                          {getTopicIcon(topicItem.topic)}
                        </div>
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Topic {index + 1}
                        </span>
                      </div>

                      {isTopicBooked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>1 Confirmed Slot</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {topicItem.slots.length} {topicItem.slots.length === 1 ? 'Slot Available' : 'Slots Available'}
                        </span>
                      )}
                    </div>

                    {/* Topic Title */}
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
                      {topicItem.topic}
                    </h3>

                    {/* Topic Description */}
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {topicItem.description}
                    </p>

                    {/* Allotted Faculty Mentors Badges */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                        <GraduationCap className="w-3 h-3 text-amber-500" />
                        <span>Allotted Faculty In-Charge:</span>
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {topicItem.facultyList[0] && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/40 text-[11px] font-medium">
                            <strong>{topicItem.facultyList[0].name}</strong>{topicItem.facultyList[0].dept ? ` (${topicItem.facultyList[0].dept.split(' ')[0]})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Row: Capacity Meter & Action Arrow */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                      <Users className="w-3.5 h-3.5 text-teal-500" />
                      <span>{openSeats} seats open across {topicItem.slots.length} batches</span>
                    </div>

                    <div className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform text-xs">
                      <span>Explore Slots</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 4. SLOTS VIEW FOR SELECTED TOPIC */
        activeTopicObj && (
          <div className="space-y-6">
            {/* Top Bar: Back button & Active Topic Summary */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to All Topics</span>
              </button>

              <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    Selected Discussion Topic
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {activeTopicObj.slots.length} Scheduled Evaluation Batches
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                  {activeTopicObj.topic}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-4xl">
                  {activeTopicObj.description}
                </p>
              </div>
            </div>

            {/* Slots Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 px-1">
                <span>Available Slots with Allotted Faculty ({activeTopicObj.slots.length}):</span>
                <span className="text-[11px] font-mono text-slate-500 font-normal">Standard 15-Seat Batches</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTopicObj.slots.map((slot, index) => {
                  const maxCap = slot.maxCapacity || 15;
                  const enrolled = slot.enrolledCount ?? slot.students?.length ?? 15;
                  const isFull = enrolled >= maxCap;
                  const bookedSlotForThisTopic = bookedSlotsMap[activeTopicObj.topic];
                  const isThisBooked = Boolean(bookedSlotForThisTopic) && slot.id === bookedSlotForThisTopic;
                  const isOtherSlotLocked = Boolean(bookedSlotForThisTopic) && slot.id !== bookedSlotForThisTopic;
                  const seatsLeft = Math.max(0, maxCap - enrolled);
                  const occupancyPercent = Math.min(100, Math.round((enrolled / maxCap) * 100));

                  const canReviveInfo = checkCanReviveSlot(slot);
                  const isReviveLockedByTime = !canReviveInfo.canRevive;

                  return (
                    <div
                      key={slot.id}
                      className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                        isThisBooked
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                          : isOtherSlotLocked
                          ? 'bg-slate-100/40 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60'
                          : isFull
                          ? 'bg-slate-50/70 dark:bg-slate-950/40 border-rose-200/80 dark:border-rose-900/40'
                          : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                      }`}
                    >
                      <div className="space-y-3.5">
                        {/* Top: Slot Title & Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              isThisBooked 
                                ? 'bg-emerald-500' 
                                : isOtherSlotLocked 
                                ? 'bg-slate-400' 
                                : isFull 
                                ? 'bg-rose-500' 
                                : 'bg-indigo-500'
                            }`} />
                            <span className={isOtherSlotLocked ? 'line-through decoration-slate-400/60' : ''}>
                              {slot.slotName || `Slot ${index + 1}`}
                            </span>
                          </span>

                          {isThisBooked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] shadow-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Your Confirmed Slot</span>
                            </span>
                          ) : isOtherSlotLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] border border-slate-300 dark:border-slate-700">
                              <Lock className="w-3 h-3" />
                              <span>LOCKED ON THIS TOPIC</span>
                            </span>
                          ) : isFull ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold text-[10px] border border-rose-200 dark:border-rose-800">
                              <AlertCircle className="w-3 h-3" />
                              <span>SLOT FULL</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] border border-emerald-200 dark:border-emerald-800">
                              <span>{seatsLeft} {seatsLeft === 1 ? 'seat left' : 'seats left'}</span>
                            </span>
                          )}
                        </div>

                        {/* ALLOTTED FACULTY IN-CHARGE CARD */}
                        <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 tracking-wider">
                                Allotted Faculty Evaluator
                              </span>
                              <span className="text-[10px] font-mono text-amber-700/80 dark:text-amber-300/80">
                                {slot.assignedFacultyId || 'FAC-DIT'}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-900 dark:text-amber-100 truncate mt-0.5">
                              {slot.assignedFacultyName || 'Dr. Sunita Rao'}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                              {slot.assignedFacultyDept || 'Computer Science & Engineering'}
                            </div>
                          </div>
                        </div>

                        {/* Date & Timing */}
                        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-mono text-[11px]">{slot.slotTiming || '10:00 AM - 10:30 AM'}</span>
                          </div>
                          <span className="text-slate-400">•</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{slot.slotDate || 'Today'}</span>
                          </div>
                        </div>

                        {/* Capacity & Progress Meter */}
                        <div className="space-y-1.5 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-teal-500" />
                              <span>{enrolled} / {maxCap} Students Enrolled</span>
                            </span>
                            <span className="font-bold text-slate-500 text-[10px]">
                              {seatsLeft > 0 ? `${seatsLeft} Open Seats` : 'Full'}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 rounded-full ${
                                isThisBooked 
                                  ? 'bg-emerald-500' 
                                  : isFull 
                                  ? 'bg-rose-500' 
                                  : occupancyPercent > 80 
                                  ? 'bg-amber-500' 
                                  : 'bg-indigo-500'
                              }`}
                              style={{ width: `${occupancyPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        {isThisBooked ? (
                          <div className="w-full flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onEnterRoom(slot.id)}
                              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <span>Enter GD Room</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>

                            {isReviveLockedByTime ? (
                              <button
                                type="button"
                                disabled
                                title="Slot starts within 1 hour. Cannot be revived as per institutional policy."
                                className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-not-allowed flex items-center justify-center gap-1"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Revive Locked (&lt;1h)</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReviveModalSlot(slot)}
                                className="py-2 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-semibold transition-all cursor-pointer"
                                title="Revive and release your booked slot"
                              >
                                <span>Revive Slot</span>
                              </button>
                            )}
                          </div>
                        ) : isOtherSlotLocked ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-200 dark:border-slate-800"
                            title={`Slot Locked: You have already reserved a slot for "${activeTopicObj.topic}". Institutional policy permits one slot per topic. You may choose slots in other topics.`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Slot Locked • Topic Slot Already Reserved</span>
                          </button>
                        ) : isFull ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-rose-200 dark:border-rose-900/50 opacity-80"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Slot Full • No Seats Available</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onBookSlot(slot.id)}
                            className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer group"
                          >
                            <span>Book This Slot</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )
      )}

      {/* 5. REVIVE SLOT CONFIRMATION MODAL */}
      {reviveModalSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Revive & Release Booked Slot?
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Institutional Slot Cancellation & Re-Booking
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>You are currently registered for:</span>
              </div>
              <p className="font-semibold pl-5">
                {reviveModalSlot.slotName} ({reviveModalSlot.slotTiming || '10:00 AM'})
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 pl-5">
                Evaluator: <strong>{reviveModalSlot.assignedFacultyName || 'Dr. Sunita Rao'}</strong>
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Reviving this slot will <strong>cancel your confirmed reservation for this topic</strong> and immediately release your seat back to the open pool. Other slots for this topic will unlock, allowing you to choose a different time slot. Any bookings you hold on other topics remain active.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReviveModalSlot(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Keep Booking
              </button>
              <button
                type="button"
                onClick={() => {
                  onReviveSlot(reviveModalSlot.id);
                  setReviveModalSlot(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Revive & Release</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Institutional Policy Footer Info */}
      <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Institutional Slot Policy (FR-2 & One Slot Per Topic Rule)
          </span>
          <p className="text-[11px] leading-relaxed">
            Candidates can reserve up to one discussion slot per topic for schedule and academic integrity. Candidates may revive/release their slot reservation for any topic at any time up until 1 hour prior to the scheduled start time. Within 1 hour of the slot start, bookings are permanently finalized.
          </p>
        </div>
      </div>

    </div>
  );
};
