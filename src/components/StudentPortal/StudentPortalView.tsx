import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Users, 
  ChevronRight, 
  ShieldCheck, 
  GraduationCap, 
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { GDSession } from '../../types/gd';
import { AuthUser } from '../../types/auth';

interface StudentPortalViewProps {
  currentUser: AuthUser | null;
  availableSlots: GDSession[];
  onExploreSlots: (topic: string) => void;
  onSelectSlot: (slotId: string) => void;
  onEnterActiveRoom?: () => void;
  activeSession?: GDSession;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  currentUser,
  availableSlots,
  onExploreSlots,
  onSelectSlot,
  onEnterActiveRoom,
  activeSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Group unique topics from available slots
  const topicsMap = useMemo(() => {
    const map = new Map<string, { topic: string; description: string; allottedFaculty: string; slots: GDSession[] }>();

    availableSlots.forEach((slot) => {
      const topicName = slot.topic;
      if (!map.has(topicName)) {
        map.set(topicName, {
          topic: topicName,
          description: slot.description || 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
          allottedFaculty: slot.allottedFaculty || 'Dr. Sunita Rao (Department)',
          slots: [],
        });
      }
      map.get(topicName)!.slots.push(slot);
    });

    return Array.from(map.values());
  }, [availableSlots]);

  // Filter topics by search query
  const filteredTopics = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return topicsMap;
    return topicsMap.filter(
      (t) =>
        t.topic.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.allottedFaculty.toLowerCase().includes(query)
    );
  }, [topicsMap, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* 1. Header Banner matching reference design */}
      <div className="bg-[#0b102b] dark:bg-[#070b1c] rounded-3xl p-6 sm:p-9 text-white relative overflow-hidden border border-indigo-950/80 shadow-xl">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium border border-white/10 backdrop-blur-md">
            <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Student GD Placement &amp; Evaluation Portal • {currentUser?.college || 'Engineering Institute'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mt-4 text-white font-heading">
            Welcome, {currentUser?.name || 'Student'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl mt-2.5 leading-relaxed font-normal">
            Explore scheduled group discussion topics, review allotted faculty evaluators, and confirm your seat in an
            available time slot. Under institutional guidelines, each candidate can reserve{' '}
            <span className="font-semibold text-white">one discussion slot per topic</span>.
          </p>

          {/* Quick Active Room Notification if enrolled */}
          {activeSession && activeSession.status === 'active' && onEnterActiveRoom && (
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>You have an ongoing active discussion: <strong>{activeSession.topic}</strong></span>
              </div>
              <button
                onClick={onEnterActiveRoom}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <span>Enter Live GD Room</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Ambient decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/2 -top-10 w-96 h-40 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 2. Discussion Topics Section Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Discussion Topics ({filteredTopics.length})</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Select a topic below to view its scheduled time slots and allotted faculty evaluators.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics or faculty..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* 3. Topics List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTopics.map((item, idx) => {
          const totalSlots = item.slots.length;
          const totalMaxCapacity = item.slots.reduce((acc, s) => acc + (s.maxCapacity || 15), 0);
          const totalEnrolled = item.slots.reduce((acc, s) => acc + (s.enrolledCount ?? s.students?.length ?? 0), 0);
          const seatsOpen = Math.max(0, totalMaxCapacity - totalEnrolled);

          return (
            <div
              key={item.topic}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Top Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>TOPIC {idx + 1}</span>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                    {totalSlots} Slot{totalSlots === 1 ? '' : 's'} Available
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-3 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.topic}
                </h3>

                {/* Description */}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Allotted Faculty in Charge */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                    ALLOTTED FACULTY IN CHARGE:
                  </span>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                    <span>{item.allottedFaculty}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Footer Row */}
              <div className="pt-4 mt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {seatsOpen} seats open across {totalSlots} batch{totalSlots === 1 ? 'es' : 'es'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onExploreSlots(item.topic)}
                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 group-hover:translate-x-0.5 transition-all cursor-pointer"
                >
                  <span>Explore Slots</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTopics.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
          <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching topics found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Try clearing your search query</p>
        </div>
      )}

      {/* 4. Institutional Slot Policy Card */}
      <div className="rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex items-start gap-3.5 mt-8">
        <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Institutional Slot Policy (FR-2 &amp; One Slot Per Topic Rule)
          </h4>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Candidates can reserve up to one discussion slot per topic for schedule and academic integrity. Candidates may
            revive/release their slot reservation for any topic at any time up to 1 hour prior to the scheduled start time.
            Within 1 hour of the slot start, bookings are permanently finalized.
          </p>
        </div>
      </div>
    </div>
  );
};
