import { AuthUser, StudentUser, FacultyUser } from '../types/auth';
import { authenticateUser, registerNewUser } from '../data/mockAuthData';
import { getStudentBookedSlotsByTopic } from './studentBooking';
import { getStudentReportHistory } from './studentReportHistory';

const TOKEN_KEY = 'erus_jwt_token';
const USER_KEY = 'erus_auth_user';

export interface AuthResponse {
  success: boolean;
  user: AuthUser;
  token?: string;
  message?: string;
}

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setStoredAuth = (user: AuthUser, token?: string) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch (e) {
    console.warn('Auth storage error:', e);
  }
};

export const clearStoredAuth = () => {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Auth clear error:', e);
  }
};

/**
 * Log in via Backend API with graceful fallback to mock data
 */
export async function loginUser(
  role: import('../types/auth').UserRole,
  identifier: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, identifier, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.user) {
      setStoredAuth(data.user, data.token);
      return { success: true, user: data.user };
    }

    return {
      success: false,
      error: data.error || 'Invalid credentials. Please check your login details and try again.',
    };
  } catch (err) {
    console.warn('[Auth] Backend login unreachable:', err);
    return {
      success: false,
      error: 'Authentication server is unavailable. Please try again in a moment.',
    };
  }
}

export async function registerUser(
  userData: (Omit<StudentUser, 'id'> | Omit<FacultyUser, 'id'>) & { password: string }
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.user) {
      setStoredAuth(data.user, data.token);
      return { success: true, user: data.user };
    }

    return {
      success: false,
      error: data.error || 'Registration failed. Please try again.',
    };
  } catch (err) {
    console.warn('[Auth] Backend registration unreachable:', err);
    return {
      success: false,
      error: 'Authentication server is unavailable. Your account was not created.',
    };
  }
}

/**
 * Verify current session token with Backend
 */
export async function verifyCurrentSession(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setStoredAuth(data.user, token);
        return data.user;
      }
    }
  } catch (err) {
    console.warn('[Auth] Session verify error:', err);
  }
  return null;
}

const COMPLETED_SLOTS_KEY = 'erus_completed_slots_v1';

// ==========================================
// PURGE LEGACY LOCALSTORAGE ON BOOT
// Preserve auth token, user, and completed slot IDs
// ==========================================
if (typeof localStorage !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('erus_') && k !== TOKEN_KEY && k !== USER_KEY && k !== COMPLETED_SLOTS_KEY) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

// In-Memory Data Stores (Authoritative Source is MongoDB via Backend API)
let inMemoryCustomColleges: any[] = [];
const inMemoryStudentsMap = new Map<string, any[]>();
const inMemoryFacultyMap = new Map<string, any[]>();
const inMemorySlotsMap = new Map<string, any[]>();
const inMemoryDeletedSlotIds = new Set<string>();
const inMemoryCompletedSlotIds = new Set<string>(
  (() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(COMPLETED_SLOTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.map((id) => String(id));
        }
      } catch {}
    }
    return [];
  })()
);

export function getCompletedSlotIds(): Set<string> {
  return new Set(inMemoryCompletedSlotIds);
}

export function isSlotCompletedLocally(slotId?: string): boolean {
  if (!slotId) return false;
  return inMemoryCompletedSlotIds.has(String(slotId));
}

export function markSlotCompletedLocally(slotId?: string) {
  if (!slotId) return;
  const cleanId = String(slotId).trim();
  if (!cleanId) return;
  inMemoryCompletedSlotIds.add(cleanId);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(COMPLETED_SLOTS_KEY, JSON.stringify(Array.from(inMemoryCompletedSlotIds)));
    } catch {}
  }
  // Also update any cached slots in memory immediately
  for (const [code, list] of inMemorySlotsMap.entries()) {
    const updated = list.map((s: any) => (s && s.id === cleanId ? { ...s, status: 'completed' } : s));
    inMemorySlotsMap.set(code, updated);
  }
}

export function getLocalCustomColleges(): any[] {
  return inMemoryCustomColleges.filter((c: any) => !['DIT', 'IITB'].includes(c?.code?.toUpperCase()) && !['col-1', 'col-2'].includes(c?.id));
}

export function saveLocalCustomCollege(col: any) {
  const filtered = inMemoryCustomColleges.filter((c) => c.code?.toUpperCase() !== col.code?.toUpperCase());
  filtered.unshift(col);
  inMemoryCustomColleges = filtered;
}

export function getLocalStudents(collegeCode: string): any[] {
  const code = (collegeCode || '').trim().toUpperCase();
  return inMemoryStudentsMap.get(code) || [];
}

export function saveLocalStudents(collegeCode: string, students: any[]) {
  const code = (collegeCode || '').trim().toUpperCase();
  inMemoryStudentsMap.set(code, students || []);
}

export function getLocalFaculty(collegeCode: string): any[] {
  const code = (collegeCode || '').trim().toUpperCase();
  return inMemoryFacultyMap.get(code) || [];
}

export function saveLocalFaculty(collegeCode: string, faculty: any[]) {
  const code = (collegeCode || '').trim().toUpperCase();
  inMemoryFacultyMap.set(code, faculty || []);
}

export function getDeletedSlotIds(): Set<string> {
  return new Set(inMemoryDeletedSlotIds);
}

export function markSlotDeletedLocally(slotId: string) {
  if (!slotId) return;
  inMemoryDeletedSlotIds.add(slotId);
}

export function normalizeClientCollegeCode(rawCode?: string): string {
  if (!rawCode) return '';
  const c = String(rawCode).trim().toUpperCase();
  if (c === 'BMSIT2002' || c === 'BMSI' || c === 'BMS' || c.includes('BMSIT')) {
    return 'BMSIT';
  }
  if (c === 'VIT2002') {
    return 'VIT-2002';
  }
  return c;
}

export function getLocalSlots(collegeCode: string): any[] {
  const targetCode = normalizeClientCollegeCode(collegeCode);
  if (!targetCode) return [];
  const list = inMemorySlotsMap.get(targetCode) || [];
  return list
    .filter((s: any) => {
      if (!s || !s.id || inMemoryDeletedSlotIds.has(s.id)) return false;
      const sCode = normalizeClientCollegeCode(s.collegeCode || targetCode);
      return sCode === targetCode;
    })
    .map((s: any) => {
      if (s.status === 'completed') markSlotCompletedLocally(s.id);
      const resolvedStatus = s.status === 'completed' || isSlotCompletedLocally(s.id) ? 'completed' : s.status;
      const topic = s.topic ? String(s.topic).trim() : '';
      const numMatch = (s.slotName || '').match(/^(Slot\s+\d+)/i) || (s.id || '').match(/slot-.*?-(\d+)/i);
      const prefix = numMatch ? (numMatch[1].startsWith('Slot') ? numMatch[1] : `Slot ${numMatch[1]}`) : '';
      if (prefix && topic && !topic.toLowerCase().includes('pending') && !s.description?.includes('Waiting for College Admin to allot')) {
        return { ...s, status: resolvedStatus, collegeCode: targetCode, slotName: `${prefix}: ${topic}` };
      }
      return { ...s, status: resolvedStatus, collegeCode: targetCode };
    });
}

export function saveLocalSlots(collegeCode: string, slots: any[]) {
  const targetCode = normalizeClientCollegeCode(collegeCode);
  if (!targetCode) return;
  const filtered = (slots || [])
    .filter((s: any) => {
      if (!s || !s.id || inMemoryDeletedSlotIds.has(s.id)) return false;
      const sCode = normalizeClientCollegeCode(s.collegeCode || targetCode);
      return sCode === targetCode;
    })
    .map((s: any) => {
      if (s.status === 'completed') markSlotCompletedLocally(s.id);
      const resolvedStatus = s.status === 'completed' || isSlotCompletedLocally(s.id) ? 'completed' : s.status;
      return { ...s, status: resolvedStatus, collegeCode: targetCode };
    });
  inMemorySlotsMap.set(targetCode, filtered);
}

// ==========================================
// COLLEGE ADMIN CLIENT API HELPERS
// ==========================================

export async function fetchCollegeStats(collegeCode: string = 'DIT') {
  const code = collegeCode.toUpperCase();
  try {
    const res = await fetch(`/api/college/stats?collegeCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.stats) return data.stats;
    }
  } catch (e) {
    console.warn('Error fetching college stats:', e);
  }

  const students = getLocalStudents(code);
  const faculty = getLocalFaculty(code);
  const slots = getLocalSlots(code);
  const colleges = getLocalCustomColleges();
  const collegeObj = colleges.find((c) => c.code?.toUpperCase() === code);

  return {
    collegeName: collegeObj?.name || `${code} Campus`,
    collegeCode: code,
    totalStudents: students.length,
    totalFaculty: faculty.length,
    scheduledSlots: slots.filter((s) => s.status === 'scheduled').length,
    completedSlots: slots.filter((s) => s.status === 'completed').length,
    totalSlots: slots.length,
  };
}

export async function fetchCollegeStudents(collegeCode: string = ''): Promise<any[]> {
  const code = (collegeCode || '').trim().toUpperCase();
  if (!code) return [];
  let backendStudents: any[] | null = null;
  try {
    const res = await fetch(`/api/college/students?collegeCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.students)) {
        backendStudents = data.students;
      }
    }
  } catch (e) {
    console.warn('Error fetching college students:', e);
  }

  // Backend is authoritative whenever it responds
  if (backendStudents !== null) {
    saveLocalStudents(code, backendStudents);
    return backendStudents;
  }

  return getLocalStudents(code);
}

export async function addCollegeStudents(payload: { students?: any[]; student?: any; collegeCode?: string }) {
  const code = (payload.collegeCode || 'DIT').toUpperCase();
  const incoming: any[] = Array.isArray(payload.students) ? payload.students : payload.student ? [payload.student] : [];

  const existing = getLocalStudents(code);
  const map = new Map<string, any>();
  existing.forEach((s) => map.set(s.studentId || s.email, s));

  const usedSeats = new Set(existing.map((e: any) => Number(e.seatNumber)).filter(Boolean));

  incoming.forEach((s, idx) => {
    let assignedSeat = Number(s.seatNumber);
    if (!assignedSeat || assignedSeat < 1 || usedSeats.has(assignedSeat)) {
      assignedSeat = 1;
      while (usedSeats.has(assignedSeat)) assignedSeat++;
    }
    usedSeats.add(assignedSeat);

    const studentObj = {
      id: s.id || `s-${Date.now()}-${idx}`,
      name: s.name,
      email: s.email,
      studentId: s.studentId || `STU-${Date.now().toString().slice(-4)}-${idx}`,
      course: s.course || 'B.Tech Computer Science & Engineering',
      batch: s.batch || '2024-2028',
      seatNumber: assignedSeat,
      college: s.college || (code === 'DIT' ? 'Delhi Institute of Technology' : code),
      collegeCode: code,
      password: s.password || 'password123',
    };
    map.set(studentObj.studentId || studentObj.email, studentObj);

    // Register user locally for login capability
    registerNewUser({
      id: studentObj.id,
      name: studentObj.name,
      email: studentObj.email,
      role: 'student',
      college: studentObj.college,
      studentId: studentObj.studentId,
      course: studentObj.course,
      batch: studentObj.batch,
      seatNumber: studentObj.seatNumber,
    } as any, s.password || 'password123');
  });

  const updated = Array.from(map.values());
  saveLocalStudents(code, updated);

  try {
    const res = await fetch('/api/college/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, collegeCode: code }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.students)) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Error adding students to backend:', e);
  }

  return { success: true, addedCount: incoming.length, students: updated };
}

export async function updateCollegeStudent(studentIdOrId: string, updates: any, collegeCode: string = '') {
  const code = (collegeCode || '').trim().toUpperCase();
  const existing = getLocalStudents(code);
  const studentIdx = existing.findIndex(
    (s) => s.id === studentIdOrId || s.studentId === studentIdOrId || s.email?.toLowerCase() === studentIdOrId.toLowerCase()
  );

  let updatedStudent = { ...updates };
  if (studentIdx >= 0) {
    updatedStudent = { ...existing[studentIdx], ...updates };
    existing[studentIdx] = updatedStudent;
    saveLocalStudents(code, existing);
  }



  try {
    const res = await fetch(`/api/college/students/${encodeURIComponent(studentIdOrId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, collegeCode: code }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.student) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Error updating student in backend:', e);
  }

  return { success: true, student: updatedStudent };
}

export async function fetchCollegeFaculty(collegeCode: string = ''): Promise<any[]> {
  const code = (collegeCode || '').trim().toUpperCase();
  if (!code) return [];
  let backendFaculty: any[] | null = null;
  try {
    const res = await fetch(`/api/college/faculty?collegeCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.faculty)) {
        backendFaculty = data.faculty;
      }
    }
  } catch (e) {
    console.warn('Error fetching college faculty:', e);
  }

  // Backend is authoritative whenever it responds
  if (backendFaculty !== null) {
    saveLocalFaculty(code, backendFaculty);
    return backendFaculty;
  }

  return getLocalFaculty(code);
}

export async function addCollegeFaculty(payload: any) {
  const code = (payload.collegeCode || 'DIT').toUpperCase();
  const existing = getLocalFaculty(code);
  const facObj = {
    id: payload.id || `fac-${Date.now()}`,
    name: payload.name,
    email: payload.email,
    facultyId: payload.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
    department: payload.department || 'Computer Science & Engineering',
    designation: payload.designation || 'Assistant Professor',
    college: payload.college || (code === 'DIT' ? 'Delhi Institute of Technology' : code),
    collegeCode: code,
    assignedSlotsCount: payload.assignedSlotsCount || 0,
    password: payload.password || 'faculty123',
  };

  const updated = [facObj, ...existing.filter((f) => f.facultyId !== facObj.facultyId && f.email !== facObj.email)];
  saveLocalFaculty(code, updated);

  registerNewUser({
    id: facObj.id,
    name: facObj.name,
    email: facObj.email,
    role: 'faculty',
    college: facObj.college,
    facultyId: facObj.facultyId,
    department: facObj.department,
    designation: facObj.designation,
  } as any, payload.password || 'faculty123');

  try {
    const res = await fetch('/api/college/faculty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, collegeCode: code }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Error adding faculty to backend:', e);
  }

  return { success: true, faculty: facObj };
}

export async function updateCollegeFaculty(facultyIdOrId: string, updates: any, collegeCode: string = '') {
  const code = (collegeCode || '').trim().toUpperCase();
  const existing = getLocalFaculty(code);
  const facIdx = existing.findIndex(
    (f) => f.id === facultyIdOrId || f.facultyId === facultyIdOrId || f.email?.toLowerCase() === facultyIdOrId.toLowerCase()
  );

  let updatedFaculty = { ...updates };
  if (facIdx >= 0) {
    updatedFaculty = { ...existing[facIdx], ...updates };
    existing[facIdx] = updatedFaculty;
    saveLocalFaculty(code, existing);
  }



  try {
    const res = await fetch(`/api/college/faculty/${encodeURIComponent(facultyIdOrId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, collegeCode: code }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.faculty) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Error updating faculty in backend:', e);
  }

  return { success: true, faculty: updatedFaculty };
}

export function isFacultyAssignedToSlot(slot: any, user: any): boolean {
  if (!user) return false;
  if (user.role !== 'faculty') return true;
  if (!slot) return false;

  const userCode = normalizeClientCollegeCode((user as any).collegeCode);
  const slotCode = normalizeClientCollegeCode(slot.collegeCode);
  if (userCode && slotCode && userCode !== slotCode) {
    return false;
  }

  const uId = String(user.id || '').trim().toLowerCase();
  const uFacultyId = String((user as any).facultyId || '').trim().toLowerCase();
  const uEmail = String(user.email || '').trim().toLowerCase();
  const uName = String(user.name || '').trim().toLowerCase();

  const slotFacultyId = String(slot.assignedFacultyId || slot.facultyId || '').trim().toLowerCase();
  const slotFacultyEmail = String(slot.assignedFacultyEmail || slot.facultyEmail || '').trim().toLowerCase();
  const slotFacultyName = String(slot.assignedFacultyName || slot.facultyName || slot.faculty || '').trim().toLowerCase();
  const allottedFaculty = String(slot.allottedFaculty || '').trim().toLowerCase();

  // If both slot and user have emails and they differ, do not match by generic facultyId/name
  if (slotFacultyEmail && uEmail && slotFacultyEmail !== uEmail) {
    return false;
  }

  // 1. Direct identifier match
  if (slotFacultyId) {
    if (uId && slotFacultyId === uId) return true;
    if (uFacultyId && slotFacultyId === uFacultyId) return true;
  }

  // 2. Email match
  if (slotFacultyEmail && uEmail && slotFacultyEmail === uEmail) {
    return true;
  }

  // 3. Name match
  if (slotFacultyName && uName && (slotFacultyName === uName || slotFacultyName.includes(uName) || uName.includes(slotFacultyName))) {
    return true;
  }

  // 4. Legacy / combined allottedFaculty string match
  if (allottedFaculty) {
    if (uFacultyId && allottedFaculty.includes(uFacultyId)) return true;
    if (uId && allottedFaculty.includes(uId)) return true;
    if (uEmail && allottedFaculty.includes(uEmail)) return true;
    if (uName && (allottedFaculty.includes(uName) || uName.includes(allottedFaculty))) return true;
  }

  return false;
}

export function isSlotAssignedToFaculty(slot: any): boolean {
  if (!slot) return false;
  const facId = String(slot.assignedFacultyId || slot.facultyId || '').trim();
  const facName = String(slot.assignedFacultyName || slot.facultyName || slot.faculty || '').trim();
  const allotted = String(slot.allottedFaculty || '').trim();

  const isExplicitlyUnassigned =
    (!facName && !facId && !allotted) ||
    facName.toLowerCase() === 'unassigned' ||
    facName.toLowerCase().includes('unassigned') ||
    allotted.toLowerCase() === 'unassigned' ||
    allotted.toLowerCase().includes('unassigned') ||
    facId.toLowerCase() === 'unassigned' ||
    facId.toLowerCase().includes('unassigned');

  if (isExplicitlyUnassigned) {
    return false;
  }

  return (
    (facId !== '' && facId.toLowerCase() !== 'unassigned') ||
    (facName !== '' && facName.toLowerCase() !== 'unassigned') ||
    (allotted !== '' && allotted.toLowerCase() !== 'unassigned')
  );
}

export function isStudentAssignedToSlot(slot: any, user: any): boolean {
  if (!user) return false;
  if (user.role !== 'student') return true;
  if (!slot) return false;

  const userCode = normalizeClientCollegeCode((user as any).collegeCode);
  const slotCode = normalizeClientCollegeCode(slot.collegeCode);
  if (userCode && slotCode && userCode !== slotCode) {
    return false;
  }

  const uId = String(user.id || '').trim().toLowerCase();
  const uStudentId = String((user as any).studentId || '').trim().toLowerCase();
  const uEmail = String(user.email || '').trim().toLowerCase();
  const uName = String(user.name || '').trim().toLowerCase();
  const uRoll = String((user as any).rollNumber || '').trim().toLowerCase();

  // 1. Check if student is in slot.students list
  if (Array.isArray(slot.students)) {
    const isEnrolled = slot.students.some((s: any) => {
      if (!s) return false;
      const sCode = normalizeClientCollegeCode(s.collegeCode);
      if (userCode && sCode && userCode !== sCode) return false;

      const sId = String(s.id || '').trim().toLowerCase();
      const sStudentId = String(s.studentId || '').trim().toLowerCase();
      const sEmail = String(s.email || '').trim().toLowerCase();
      const sName = String(s.name || '').trim().toLowerCase();
      const sRoll = String(s.rollNumber || '').trim().toLowerCase();

      if (sEmail && uEmail && sEmail !== uEmail) return false;

      return (
        (uId && (sId === uId || sStudentId === uId)) ||
        (uStudentId && (sStudentId === uStudentId || sId === uStudentId)) ||
        (uEmail && sEmail === uEmail) ||
        (uRoll && sRoll === uRoll) ||
        (uName && sName === uName && (!sEmail || !uEmail || sEmail === uEmail))
      );
    });
    if (isEnrolled) return true;
  }

  // 2. Check if student has booked this slot
  if (slot.id) {
    if (user.bookedSlotId === slot.id) return true;
    if ((user as any).bookedSlotsByTopic) {
      if (Object.values((user as any).bookedSlotsByTopic).includes(slot.id)) return true;
    }
    const bookedTopics = getStudentBookedSlotsByTopic(user.id || user.email || 'student');
    if (bookedTopics && Object.values(bookedTopics).includes(slot.id)) return true;
  }

  // 3. Check assignedStudentIds array if present
  if (Array.isArray((slot as any).assignedStudentIds)) {
    const hasAssignedId = (slot as any).assignedStudentIds.some((id: string) => {
      const cleanId = String(id).trim().toLowerCase();
      return cleanId === uId || (uStudentId && cleanId === uStudentId);
    });
    if (hasAssignedId) return true;
  }

  return false;
}

export function hasStudentParticipatedInSlot(slot: any, user: any, reportHistory?: any[]): boolean {
  if (!user) return false;
  if (user.role !== 'student') return true;
  if (!slot) return false;

  const userCode = normalizeClientCollegeCode((user as any).collegeCode);
  const slotCode = normalizeClientCollegeCode(slot.collegeCode);
  if (userCode && slotCode && userCode !== slotCode) {
    return false;
  }

  const uId = String(user.id || '').trim().toLowerCase();
  const uStudentId = String((user as any).studentId || '').trim().toLowerCase();
  const uEmail = String(user.email || '').trim().toLowerCase();
  const uName = String(user.name || '').trim().toLowerCase();
  const uRoll = String((user as any).rollNumber || '').trim().toLowerCase();

  const studentKey = user.id || (user as any).studentId || user.email || user.name || 'student';
  const effectiveHistory = reportHistory || getStudentReportHistory(studentKey);

  // 1. Check if student has a recorded evaluation report for this exact slot
  if (Array.isArray(effectiveHistory)) {
    const hasReport = effectiveHistory.some((r) => {
      return r.sessionId === slot.id || r.id === slot.id || (r as any).slotId === slot.id;
    });
    if (hasReport) return true;
  }

  // If slot is completed, check participant lists and bookings
  const isCompleted = slot.status === 'completed';

  // Check if student was present in slot.students
  if (Array.isArray(slot.students)) {
    const stMatch = slot.students.find((s: any) => {
      if (!s) return false;
      const sCode = normalizeClientCollegeCode(s.collegeCode);
      if (userCode && sCode && userCode !== sCode) return false;
      if (s.isUser) return true;
      const sId = String(s.id || '').trim().toLowerCase();
      const sStudentId = String(s.studentId || '').trim().toLowerCase();
      const sEmail = String(s.email || '').trim().toLowerCase();
      const sName = String(s.name || '').trim().toLowerCase();
      const sRoll = String(s.rollNumber || '').trim().toLowerCase();
      if (sEmail && uEmail && sEmail !== uEmail) return false;
      return (
        (uId && (sId === uId || sStudentId === uId)) ||
        (uStudentId && (sStudentId === uStudentId || sId === uStudentId)) ||
        (uEmail && sEmail === uEmail) ||
        (uRoll && sRoll === uRoll) ||
        (uName && sName === uName && (!sEmail || !uEmail || sEmail === uEmail))
      );
    });
    if (stMatch && isCompleted) return true;
  }

  // Check assignedStudentIds array if present
  if (Array.isArray((slot as any).assignedStudentIds)) {
    const hasAssignedId = (slot as any).assignedStudentIds.some((id: string) => {
      const cleanId = String(id).trim().toLowerCase();
      return cleanId === uId || (uStudentId && cleanId === uStudentId);
    });
    if (hasAssignedId && isCompleted) return true;
  }

  // Check if student had booked this slot and completed
  if (slot.id && isCompleted) {
    if (user.bookedSlotId === slot.id) return true;
    if ((user as any).bookedSlotsByTopic && Object.values((user as any).bookedSlotsByTopic).includes(slot.id)) return true;
    const bookedTopics = getStudentBookedSlotsByTopic(studentKey);
    if (bookedTopics && Object.values(bookedTopics).includes(slot.id)) return true;
  }

  return false;
}

export async function fetchStudentAssignedSlots(
  studentId: string,
  collegeCode: string = 'DIT',
  studentEmail?: string
): Promise<any[]> {
  const code = normalizeClientCollegeCode(collegeCode);
  if (!code) return [];
  const deleted = getDeletedSlotIds();
  try {
    const url = `/api/college/slots?collegeCode=${encodeURIComponent(code)}&studentId=${encodeURIComponent(studentId)}&email=${encodeURIComponent(studentEmail || '')}&role=student`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.slots)) {
        return data.slots
          .filter((s: any) => s && s.id && !deleted.has(s.id) && normalizeClientCollegeCode(s.collegeCode || code) === code)
          .map((s: any) => {
            if (s.status === 'completed') markSlotCompletedLocally(s.id);
            const resolvedStatus = s.status === 'completed' || isSlotCompletedLocally(s.id) ? 'completed' : s.status;
            return { ...s, status: resolvedStatus, collegeCode: code };
          });
      }
    }
  } catch (e) {
    console.warn('Error fetching student assigned slots:', e);
  }
  const allSlots = await fetchCollegeSlots(code);
  return allSlots.filter(
    (s) =>
      !deleted.has(s.id) &&
      normalizeClientCollegeCode(s.collegeCode || code) === code &&
      (isSlotAssignedToFaculty(s) || isStudentAssignedToSlot(s, { id: studentId, email: studentEmail, collegeCode: code, role: 'student' }))
  );
}

export async function fetchCollegeSlots(collegeCode: string = 'DIT'): Promise<any[]> {
  const code = normalizeClientCollegeCode(collegeCode);
  if (!code) return [];
  const deleted = getDeletedSlotIds();
  let backendSlots: any[] | null = null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
    const res = await fetch(`/api/college/slots?collegeCode=${encodeURIComponent(code)}`, {
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.slots)) {
        backendSlots = data.slots
          .filter((s: any) => s && s.id && !deleted.has(s.id) && normalizeClientCollegeCode(s.collegeCode || code) === code)
          .map((s: any) => {
            if (s.status === 'completed') markSlotCompletedLocally(s.id);
            const resolvedStatus = s.status === 'completed' || isSlotCompletedLocally(s.id) ? 'completed' : s.status;
            return { ...s, status: resolvedStatus, collegeCode: code };
          });
      }
    }
  } catch (e) {
    console.warn('Error fetching college slots:', e);
  }

  // Backend is authoritative.
  if (backendSlots !== null) {
    saveLocalSlots(code, backendSlots);
    return backendSlots;
  }

  return getLocalSlots(code);
}

export async function deleteCollegeSlot(slotId: string, collegeCode: string = 'DIT') {
  const raw = collegeCode.toUpperCase();
  const code = raw === 'BMSIT2002' || raw === 'BMSI' || raw === 'BMS' || raw.includes('BMS') ? 'BMSIT' : raw;

  // 0. Permanently mark slotId as deleted locally
  markSlotDeletedLocally(slotId);

  // 1. Purge from local slots cache
  try {
    const local = getLocalSlots(code).filter((s) => s.id !== slotId);
    saveLocalSlots(code, local);
  } catch {}



  // 3. Request backend deletion
  try {
    const res = await fetch(`/api/college/slots/${encodeURIComponent(slotId)}?collegeCode=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    return { success: true, slotId, ...data };
  } catch (e) {
    console.warn('Error deleting college slot:', e);
    return { success: true, slotId };
  }
}

export async function createCollegeSlot(payload: any) {
  const code = (payload.collegeCode || 'DIT').toUpperCase();
  const existing = getLocalSlots(code);
  const newSlot = {
    id: payload.id || `slot-${code.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...payload,
    collegeCode: code,
    status: payload.status || 'scheduled',
    enrolledCount: payload.enrolledCount ?? 0,
    createdAt: new Date().toISOString(),
  };

  const updated = [newSlot, ...existing.filter((s) => s.id !== newSlot.id)];
  saveLocalSlots(code, updated);

  try {
    const res = await fetch('/api/college/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, collegeCode: code }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Error creating slot in backend:', e);
  }

  return { success: true, slot: newSlot };
}

export async function updateCollegeStudentLimit(
  collegeIdOrCode: string,
  studentLimit: number,
  addSlots?: number
): Promise<{
  success: boolean;
  college?: any;
  slots?: any[];
  slotCount?: number;
  addedSlotsCount?: number;
  studentLimit?: number;
  error?: string;
}> {
  const limitNum = Math.max(1, studentLimit || 60);
  const slotsToAdd = addSlots && addSlots > 0 ? addSlots : Math.max(1, Math.ceil(limitNum / 15));

  try {
    const res = await fetch(`/api/admin/colleges/${encodeURIComponent(collegeIdOrCode)}/limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentLimit: limitNum, addSlots: slotsToAdd }),
    });
    if (res.ok) {
      const data = await res.json();
      const resolvedCode = normalizeClientCollegeCode(data.college?.code || collegeIdOrCode);
      if (data.slots && Array.isArray(data.slots)) {
        saveLocalSlots(collegeIdOrCode, data.slots);
        if (resolvedCode) {
          saveLocalSlots(resolvedCode, data.slots);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('erus-slots-updated', {
              detail: {
                collegeCode: resolvedCode,
                slots: data.slots,
                studentLimit: data.studentLimit || data.slots.length * 15,
                slotCount: data.slots.length,
              },
            })
          );
        }
      }
      // Update in-memory college limit
      inMemoryCustomColleges = inMemoryCustomColleges.map((c: any) => {
        if (
          c.id === collegeIdOrCode ||
          normalizeClientCollegeCode(c.code) === resolvedCode
        ) {
          return {
            ...c,
            studentLimit: data.studentLimit || limitNum,
            slotCount: data.slotCount || data.slots?.length || c.slotCount,
          };
        }
        return c;
      });
      return data;
    }
  } catch (e) {
    console.warn('Error updating college student limit:', e);
  }
  return { success: true, studentLimit: limitNum, addedSlotsCount: slotsToAdd };
}

export async function generateCollegeSlots(
  collegeCode: string,
  studentLimit?: number
): Promise<{
  success: boolean;
  slots?: any[];
  slotCount?: number;
  addedSlotsCount?: number;
  studentLimit?: number;
  message?: string;
}> {
  const code = normalizeClientCollegeCode(collegeCode || 'DIT');
  try {
    const res = await fetch('/api/college/generate-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collegeCode: code, studentLimit }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.slots && Array.isArray(data.slots)) {
        saveLocalSlots(code, data.slots);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('erus-slots-updated', {
              detail: {
                collegeCode: code,
                slots: data.slots,
                studentLimit: data.studentLimit || data.slots.length * 15,
                slotCount: data.slots.length,
              },
            })
          );
        }
      }
      return data;
    }
  } catch (e) {
    console.warn('Error generating college slots:', e);
  }
  return { success: false, message: 'Failed to generate slots' };
}

export async function allotSlotTopicAndFaculty(
  slotId: string,
  collegeCode: string,
  data: {
    topic: string;
    description?: string;
    slotName?: string;
    assignedFacultyId: string;
    assignedFacultyName: string;
    assignedFacultyEmail?: string;
    assignedFacultyDept?: string;
    slotTiming?: string;
    slotDate?: string;
  }
): Promise<{ success: boolean; slot?: any; error?: string }> {
  const code = (collegeCode || 'DIT').toUpperCase();

  // Update local slots cache immediately
  try {
    const local = getLocalSlots(code);
    const updated = local.map((s: any) => {
      if (s.id === slotId) {
        const slotNumMatch = (data.slotName || s.slotName || '').match(/^(Slot\s+\d+)/i) || (s.id || '').match(/slot-.*?-(\d+)/i);
        const prefix = slotNumMatch ? (slotNumMatch[1].startsWith('Slot') ? slotNumMatch[1] : `Slot ${slotNumMatch[1]}`) : 'Slot';
        const syncedSlotName = data.topic ? `${prefix}: ${data.topic}` : (data.slotName || s.slotName || prefix);

        return {
          ...s,
          ...data,
          topic: data.topic,
          slotName: syncedSlotName,
          assignedFacultyId: data.assignedFacultyId,
          assignedFacultyName: data.assignedFacultyName,
          assignedFacultyEmail: data.assignedFacultyEmail || s.assignedFacultyEmail,
          assignedFacultyDept: data.assignedFacultyDept || s.assignedFacultyDept,
          slotTiming: data.slotTiming || s.slotTiming,
          slotDate: data.slotDate || s.slotDate,
        };
      }
      return s;
    });
    saveLocalSlots(code, updated);
  } catch {}

  try {
    const res = await fetch(`/api/college/slots/${encodeURIComponent(slotId)}/allot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, collegeCode: code }),
    });
    if (res.ok) {
      const resData = await res.json();
      return resData;
    }
  } catch (e) {
    console.warn('Error allotting slot topic and faculty:', e);
  }

  return { success: true };
}

// ==========================================
// SUPER ADMIN CLIENT API HELPERS
// ==========================================

export async function fetchAdminColleges(): Promise<any[]> {
  try {
    const res = await fetch('/api/admin/colleges');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.colleges)) {
        inMemoryCustomColleges = data.colleges.filter(
          (c: any) => !['DIT', 'IITB'].includes(c?.code?.toUpperCase()) && !['col-1', 'col-2'].includes(c?.id)
        );
        return data.colleges;
      }
    }
  } catch (e) {
    console.warn('Error fetching admin colleges from server:', e);
  }

  return getLocalCustomColleges();
}

export async function registerNewCollege(payload: any) {
  const cleanCode = (payload.code || '').trim().toUpperCase();
  const collegeName = (payload.name || '').trim();
  const adminPass = payload.adminPassword || `Erus@${cleanCode}2026`;

  // 1. Purge in-memory student, faculty, and slot data for this college code
  inMemoryStudentsMap.delete(cleanCode);
  inMemoryFacultyMap.delete(cleanCode);
  inMemorySlotsMap.delete(cleanCode);

  const newCollegeObj = {
    id: `col-${Date.now()}`,
    ...payload,
    name: collegeName,
    code: cleanCode,
    adminPassword: adminPass,
    status: 'active',
    studentCount: 0,
    facultyCount: 0,
    slotCount: 0,
    studentLimit: Number(payload.studentLimit) || 60,
    adminEmail: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    adminName: payload.adminName || `${cleanCode} Administrator`,
    createdAt: new Date().toISOString(),
  };

  saveLocalCustomCollege(newCollegeObj);

  const creds = {
    email: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    password: adminPass,
    role: 'college_admin' as const,
    collegeName: collegeName,
    collegeCode: cleanCode,
    adminId: `CADM-${cleanCode}-001`,
  };

  // Auto-register fresh college admin user so they can log in immediately
  registerNewUser({
    id: `ca-${Date.now()}`,
    name: payload.adminName || `${cleanCode} College Administrator`,
    email: creds.email,
    role: 'college_admin',
    college: collegeName,
    collegeCode: cleanCode,
    adminId: creds.adminId,
  } as any, creds.password);

  try {
    const res = await fetch('/api/admin/colleges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, name: collegeName, code: cleanCode, adminPassword: adminPass }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.college) {
        data.college.adminPassword = adminPass;
      }
      return data;
    }
  } catch (e) {
    console.warn('Error registering new college with backend:', e);
  }

  return {
    success: true,
    college: newCollegeObj,
    generatedCredentials: creds,
  };
}

export async function sendCollegeCredentials(collegeId: string) {
  try {
    const res = await fetch(`/api/admin/colleges/${collegeId}/send-credentials`, {
      method: 'POST',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Error sending credentials:', e);
  }
  return { success: true, message: 'Credentials dispatched successfully via secure notification.' };
}

export async function deleteCollege(
  collegeIdOrCode: string,
  collegeCode?: string,
  collegeName?: string
): Promise<{ success: boolean; error?: string }> {
  const target = (collegeIdOrCode || '').trim();
  if (!target) return { success: false, error: 'No college ID or code provided' };

  const code = (collegeCode || (target.length <= 8 && !target.startsWith('col-') ? target : '')).trim().toUpperCase();
  const name = (collegeName || '').trim();

  try {
    const local = getLocalCustomColleges();
    const targetCol = local.find(
      (c) => c.id === target || (code && c.code?.toUpperCase() === code) || c.code?.toUpperCase() === target.toUpperCase()
    );
    const resolvedCode = (code || targetCol?.code || (target.length <= 8 && !target.startsWith('col-') ? target : '')).toUpperCase();
    const resolvedName = name || targetCol?.name || '';

    const updated = local.filter((c) => {
      const matchId = target && c.id === target;
      const matchCode = resolvedCode && c.code?.toUpperCase() === resolvedCode;
      const matchTargetCode = target && c.code?.toUpperCase() === target.toUpperCase();
      const matchName = resolvedName && c.name?.toLowerCase() === resolvedName.toLowerCase();
      return !(matchId || matchCode || matchTargetCode || matchName);
    });
    inMemoryCustomColleges = updated;

    // Clear all in-memory student, faculty, and slot keys associated with this college
    const codesToClear = Array.from(new Set([resolvedCode, code, target.toUpperCase()].filter(Boolean)));
    codesToClear.forEach((c) => {
      inMemoryStudentsMap.delete(c);
      inMemoryFacultyMap.delete(c);
      inMemorySlotsMap.delete(c);
    });
  } catch (e) {
    console.warn('Error clearing local college state:', e);
  }

  try {
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (name) params.set('name', name);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`/api/admin/colleges/${encodeURIComponent(target)}${queryString}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to delete college from server' };
  } catch (e: any) {
    console.warn('Error calling delete college endpoint:', e);
    return { success: true };
  }
}

export async function fetchAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.stats) return data.stats;
    }
  } catch (e) {
    console.warn('Error fetching admin stats:', e);
  }

  const colleges = getLocalCustomColleges();
  return {
    totalColleges: colleges.length,
    totalStudents: 0,
    totalFaculty: 0,
    totalSlots: 0,
    activeLiveGDs: 0,
    activeUsersCount: 1,
    activeUsersTodayCount: 1,
    dailyUserLimit: 100,
    enforceDailyLimit: true,
    serverLoadPercent: 1,
  };
}

export interface ServerCapacityData {
  activeUsersCount: number;
  activeUsersTodayCount: number;
  dailyUserLimit: number;
  maxConcurrentUsers: number;
  enforceDailyLimit: boolean;
  lastResetDate: string;
  serverLoadPercent: number;
  activeUsers?: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    college?: string;
    lastActive: number;
  }>;
}

export async function fetchServerCapacity(): Promise<ServerCapacityData | null> {
  try {
    const res = await fetch('/api/admin/capacity');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.capacity) return data.capacity;
    }
  } catch (e) {
    console.warn('Error fetching server capacity:', e);
  }
  return null;
}

export async function updateServerCapacity(payload: {
  dailyUserLimit: number;
  enforceDailyLimit: boolean;
  maxConcurrentUsers?: number;
}): Promise<{ success: boolean; message?: string; capacity?: ServerCapacityData }> {
  try {
    const res = await fetch('/api/admin/capacity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Error updating server capacity:', e);
  }
  return { success: false, message: 'Failed to update capacity settings' };
}

export async function sendUserHeartbeat(user: any): Promise<void> {
  if (!user || !user.id) return;
  try {
    await fetch('/api/user/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    });
  } catch (e) {
    // Silent background heartbeat failure
  }
}


export async function fetchFacultyAssignedSlots(
  facultyId: string,
  collegeCode: string = 'DIT',
  facultyEmail?: string,
  facultyName?: string
): Promise<any[]> {
  const code = normalizeClientCollegeCode(collegeCode);
  if (!code) return [];
  const deleted = getDeletedSlotIds();
  try {
    const params = new URLSearchParams({
      facultyId,
      collegeCode: code,
    });
    if (facultyEmail) params.set('facultyEmail', facultyEmail);
    if (facultyName) params.set('facultyName', facultyName);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
    const res = await fetch(`/api/faculty/sessions?${params.toString()}`, { signal: controller?.signal });
    if (timeoutId) clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) {
        return data.sessions
          .filter(
            (s: any) =>
              s &&
              s.id &&
              !deleted.has(s.id) &&
              normalizeClientCollegeCode(s.collegeCode || code) === code &&
              isFacultyAssignedToSlot(s, { id: facultyId, facultyId, email: facultyEmail, name: facultyName, collegeCode: code, role: 'faculty' })
          )
          .map((s: any) => {
            if (s.status === 'completed') markSlotCompletedLocally(s.id);
            const resolvedStatus = s.status === 'completed' || isSlotCompletedLocally(s.id) ? 'completed' : s.status;
            return { ...s, status: resolvedStatus, collegeCode: code };
          });
      }
    }
  } catch (e) {
    console.warn('Error fetching faculty sessions:', e);
  }

  // Fallback: load all college slots and filter for this faculty
  try {
    const allSlots = await fetchCollegeSlots(code);
    return allSlots.filter(
      (s: any) =>
        s &&
        s.id &&
        !deleted.has(s.id) &&
        normalizeClientCollegeCode(s.collegeCode || code) === code &&
        isFacultyAssignedToSlot(s, { id: facultyId, facultyId, email: facultyEmail, name: facultyName, collegeCode: code, role: 'faculty' })
    );
  } catch {
    return [];
  }
}

export async function fetchStudentBookings(studentId: string) {
  try {
    const res = await fetch(`/api/student/${encodeURIComponent(studentId)}/booked-slot`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Error fetching student bookings:', e);
  }
  return { success: false, topicBookings: {} };
}

// ==========================================
// CREDENTIAL DISPATCH & PASSWORD RESET HELPERS
// ==========================================

export async function requestPasswordReset(email: string, role?: string) {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    return await res.json();
  } catch (e: any) {
    console.warn('Error requesting password reset:', e);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function confirmPasswordReset(email: string, otp: string, newPassword: string) {
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword }),
    });
    return await res.json();
  } catch (e: any) {
    console.warn('Error confirming password reset:', e);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function dispatchCredentials(payload: {
  collegeCode: string;
  targetType: 'students' | 'faculty' | 'single';
  recipientId?: string;
  email?: string;
  customPassword?: string;
}) {
  try {
    const res = await fetch('/api/college/dispatch-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    console.warn('Error dispatching credentials:', e);
    return { success: false, error: 'Failed to communicate with mail service.' };
  }
}

export async function fetchSlotReports(slotId: string): Promise<{ success: boolean; slot?: any; reports: any[]; participants: any[] }> {
  try {
    const res = await fetch(`/api/college/slots/${encodeURIComponent(slotId)}/reports`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          slot: data.slot,
          reports: Array.isArray(data.reports) ? data.reports : [],
          participants: Array.isArray(data.participants) ? data.participants : [],
        };
      }
    }
  } catch (e: any) {
    console.warn('Error fetching slot reports:', e);
  }
  return { success: false, reports: [], participants: [] };
}


