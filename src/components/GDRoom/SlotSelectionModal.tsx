import React, { useState } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { GDSession } from '../../types/gd';

interface SlotSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSlots: GDSession[];
  currentSlotId: string;
  onSelectSlot: (slotId: string) => void;
  onResetSlots?: () => void;
  initialTopic?: string;
}

export const SlotSelectionModal: React.FC<SlotSelectionModalProps> = ({
  isOpen,
  onClose,
  availableSlots,
  currentSlotId,
  onSelectSlot,
  onResetSlots,
  initialTopic,
}) => {
  if (!isOpen) return null;

  // Extract unique topics from available slots
  const uniqueTopics = Array.from(new Set(availableSlots.map((s) => s.topic)));
  const currentSlot = availableSlots.find((s) => s.id === currentSlotId);
  
  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    return initialTopic || currentSlot?.topic || uniqueTopics[0] || 'Group Discussion Topic';
  });

  React.useEffect(() => {
    if (initialTopic) {
      setSelectedTopic(initialTopic);
    }
  }, [initialTopic]);

  // Filter slots for the active topic
  const slotsForTopic = availableSlots.filter((s) => s.topic === selectedTopic);
  const activeTopicDetails = slotsForTopic[0] || availableSlots[0];

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
            Browse and join scheduled time slots. Slot counts update in real-time as students join. Full slots cannot accept new entries.
          </p>
        </div>

        {/* Multi-Topic Switcher (if more than 1 topic exists) */}
        {uniqueTopics.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <span>Select Discussion Topic ({uniqueTopics.length} Topics Available):</span>
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {uniqueTopics.map((topicTitle) => {
                const isTopicActive = topicTitle === selectedTopic;
                const count = availableSlots.filter((s) => s.topic === topicTitle).length;
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

        {/* Current Topic Banner */}
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

        {/* Slots Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 px-1">
            <span>Scheduled Slots for this Topic ({slotsForTopic.length} Total):</span>
            <span className="text-[11px] font-mono text-slate-500">Live Seat Availability</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {slotsForTopic.map((slot, index) => {
              const maxCap = slot.maxCapacity || 15;
              const enrolled = slot.enrolledCount ?? slot.students?.length ?? 15;
              const isFull = enrolled >= maxCap;
              const isSelected = slot.id === currentSlotId;
              const seatsLeft = Math.max(0, maxCap - enrolled);
              const occupancyPercent = Math.min(100, Math.round((enrolled / maxCap) * 100));

              return (
                <div
                  key={slot.id}
                  className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30 shadow-md shadow-indigo-500/10'
                      : isFull
                      ? 'bg-slate-50/60 dark:bg-slate-950/40 border-rose-200/80 dark:border-rose-900/50'
                      : 'bg-slate-50/70 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Top Row: Slot Badge & Status Pill */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isFull && !isSelected ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                        <span>{slot.slotName || `Slot ${index + 1}`}</span>
                      </span>

                      {/* Status Badges */}
                      {isSelected ? (
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
                        {isFull ? (
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
                            isFull 
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
                    {isSelected ? (
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
                        <span>Select & Join Slot</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Footer */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>
            Slot enrollment count updates automatically when you switch slots. When a slot is full (15/15 seats taken), new entries are locked.
          </span>
        </div>

      </div>
    </div>
  );
};
