/**
 * Student Slot Booking Manager:
 * Enforces the "One Slot Per Topic" Policy.
 * A student is allowed to book only ONE slot for a given topic.
 * They CAN freely select and book slots on OTHER topics!
 */

const STORAGE_PREFIX_SLOT = 'erus_student_booked_slot_';
const STORAGE_PREFIX_TOPICS = 'erus_student_booked_topics_';

/**
 * Retrieve map of { [topic: string]: slotId } for a student.
 */
export function getStudentBookedSlotsByTopic(studentIdentifier?: string | null): Record<string, string> {
  if (!studentIdentifier) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_TOPICS}${studentIdentifier}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }

    // Fallback migration: check legacy single slot
    const legacy = localStorage.getItem(`${STORAGE_PREFIX_SLOT}${studentIdentifier}`);
    if (legacy) {
      return { '__legacy__': legacy };
    }
  } catch {}
  return {};
}

/**
 * Record a student booking for a specific topic.
 */
export function setStudentBookedSlotForTopic(
  studentIdentifier: string,
  topic: string,
  slotId: string
): void {
  if (!studentIdentifier || !topic || !slotId) return;
  try {
    const current = getStudentBookedSlotsByTopic(studentIdentifier);
    current[topic] = slotId;
    delete current['__legacy__'];
    localStorage.setItem(`${STORAGE_PREFIX_TOPICS}${studentIdentifier}`, JSON.stringify(current));
    // Keep legacy single slot updated with latest booked slot for backwards compatibility
    localStorage.setItem(`${STORAGE_PREFIX_SLOT}${studentIdentifier}`, slotId);
  } catch {}

  // Sync with backend API
  try {
    fetch('/api/student/book-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentIdentifier, topic, slotId }),
    }).catch((err) => console.warn('[Student Slot Booking Sync Notice]:', err));
  } catch {}
}

/**
 * Revive / release a booked slot for a specific topic.
 */
export function clearStudentBookedSlotForTopic(
  studentIdentifier: string,
  topic: string,
  slotId?: string
): void {
  if (!studentIdentifier) return;
  try {
    const current = getStudentBookedSlotsByTopic(studentIdentifier);
    if (topic && current[topic]) {
      delete current[topic];
    } else if (slotId) {
      for (const [t, sId] of Object.entries(current)) {
        if (sId === slotId) {
          delete current[t];
          break;
        }
      }
    }
    delete current['__legacy__'];
    localStorage.setItem(`${STORAGE_PREFIX_TOPICS}${studentIdentifier}`, JSON.stringify(current));

    const remaining = Object.values(current);
    if (remaining.length > 0) {
      localStorage.setItem(`${STORAGE_PREFIX_SLOT}${studentIdentifier}`, remaining[0]);
    } else {
      localStorage.removeItem(`${STORAGE_PREFIX_SLOT}${studentIdentifier}`);
    }
  } catch {}

  // Sync with backend API
  try {
    fetch('/api/student/cancel-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentIdentifier, topic, slotId }),
    }).catch((err) => console.warn('[Student Slot Cancel Sync Notice]:', err));
  } catch {}
}

/**
 * Check if a specific slot is selectable for a student under the One-Slot-Per-Topic rule.
 */
export function isSlotSelectableForTopic(
  slot: { id: string; topic?: string },
  userRole?: string | null,
  bookedSlotsMap: Record<string, string> = {}
): { allowed: boolean; isUserBookedSlot: boolean; reason?: string } {
  // Evaluators and admins can access any slot
  if (userRole !== 'student') {
    return { allowed: true, isUserBookedSlot: false };
  }

  const topicKey = slot.topic || 'General Topic';
  const bookedForThisTopic = bookedSlotsMap[topicKey] || (bookedSlotsMap['__legacy__'] === slot.id ? slot.id : null);

  // If student hasn't booked any slot on this topic, it's open!
  if (!bookedForThisTopic) {
    return { allowed: true, isUserBookedSlot: false };
  }

  // If this slot IS the student's confirmed booked slot on this topic:
  if (bookedForThisTopic === slot.id) {
    return { allowed: true, isUserBookedSlot: true };
  }

  // A different slot is already booked on THIS SAME topic:
  return {
    allowed: false,
    isUserBookedSlot: false,
    reason: `You have already booked a slot for "${topicKey}". Under evaluation guidelines, only one slot per topic is allowed. You may still book slots on other topics.`,
  };
}

/**
 * 1-Hour Revive Rule:
 * Students can revive/cancel their booked slot before 1 hour of the slot start time.
 */
export function checkCanReviveSlot(slot: { slotTiming?: string; slotDate?: string; status?: string }): {
  canRevive: boolean;
  minutesRemaining?: number;
  reason?: string;
} {
  if (slot.status === 'completed') {
    return { canRevive: false, reason: 'This discussion session has already concluded and been evaluated.' };
  }
  if (slot.status === 'active') {
    return { canRevive: false, reason: 'This discussion session is currently live in progress.' };
  }

  // Parse time from slotTiming, e.g. "09:30 AM - 10:00 AM" or "02:30 PM - 03:00 PM"
  if (!slot.slotTiming) {
    return { canRevive: true };
  }

  try {
    const timeMatch = slot.slotTiming.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      const now = new Date();
      const slotStartTime = new Date();
      slotStartTime.setHours(hours, minutes, 0, 0);

      if (slot.slotDate && slot.slotDate.toLowerCase().includes('tomorrow')) {
        slotStartTime.setDate(slotStartTime.getDate() + 1);
      }

      const diffMs = slotStartTime.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      // In prototype/demo: if past, assume future run unless active/completed
      if (diffMinutes < 0) {
        return { canRevive: true, minutesRemaining: 150 };
      }

      if (diffMinutes <= 60) {
        return {
          canRevive: false,
          minutesRemaining: Math.max(1, diffMinutes),
          reason: `Slot starts in ${diffMinutes} minute(s). Under institutional policy, bookings are locked and cannot be revived within 1 hour of slot start time.`,
        };
      }

      return {
        canRevive: true,
        minutesRemaining: diffMinutes,
      };
    }
  } catch (err) {
    console.warn('[checkCanReviveSlot error]:', err);
  }

  return { canRevive: true };
}

// -------------------------------------------------------------
// Backward compatibility aliases
// -------------------------------------------------------------
export function getStudentBookedSlotId(studentIdentifier?: string | null): string | null {
  if (!studentIdentifier) return null;
  const map = getStudentBookedSlotsByTopic(studentIdentifier);
  const values = Object.values(map);
  return values.length > 0 ? values[0] : null;
}

export function setStudentBookedSlotId(studentIdentifier: string, slotId: string): void {
  setStudentBookedSlotForTopic(studentIdentifier, 'General Topic', slotId);
}

export function clearStudentBookedSlot(studentIdentifier?: string | null): void {
  if (!studentIdentifier) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX_TOPICS}${studentIdentifier}`);
    localStorage.removeItem(`${STORAGE_PREFIX_SLOT}${studentIdentifier}`);
  } catch {}
}

export function isSlotSelectableForStudent(
  slotId: string,
  userRole?: string | null,
  studentIdentifier?: string | null,
  currentBookedSlotId?: string | null
): { allowed: boolean; reason?: string } {
  if (userRole !== 'student') return { allowed: true };
  if (!currentBookedSlotId || currentBookedSlotId === slotId) return { allowed: true };
  return {
    allowed: false,
    reason: 'You have already booked a slot on this topic.',
  };
}
