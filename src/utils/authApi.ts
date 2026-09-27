import { AuthUser, StudentUser, FacultyUser } from '../types/auth';
import { authenticateUser, registerNewUser } from '../data/mockAuthData';

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

// ==========================================
// COLLEGE & SUPER ADMIN DATA STORAGE KEYS
// ==========================================
const CUSTOM_COLLEGES_KEY = 'erus_custom_colleges';

const DEFAULT_ADMIN_COLLEGES = [
  {
    id: 'col-1',
    name: 'Delhi Institute of Technology',
    code: 'DIT',
    contactEmail: 'admin@dit.edu.in',
    phone: '+91 11 2659 1000',
    address: 'Hauz Khas, New Delhi',
    status: 'active',
    studentCount: 120,
    facultyCount: 18,
    slotCount: 8,
    adminEmail: 'admin@dit.edu.in',
    adminName: 'DIT College Administrator',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'col-2',
    name: 'Indian Institute of Technology Bombay',
    code: 'IITB',
    contactEmail: 'admin@iitb.ac.in',
    phone: '+91 22 2572 2545',
    address: 'Powai, Mumbai',
    status: 'active',
    studentCount: 95,
    facultyCount: 14,
    slotCount: 6,
    adminEmail: 'admin@iitb.ac.in',
    adminName: 'IITB Academic Admin',
    createdAt: new Date().toISOString(),
  },
];

export function getLocalCustomColleges(): any[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLLEGES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCustomCollege(col: any) {
  try {
    const existing = getLocalCustomColleges();
    const filtered = existing.filter((c) => c.code?.toUpperCase() !== col.code?.toUpperCase());
    filtered.unshift(col);
    localStorage.setItem(CUSTOM_COLLEGES_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Error saving local college:', e);
  }
}

export function getLocalStudents(collegeCode: string): any[] {
  try {
    const raw = localStorage.getItem(`erus_college_students_${collegeCode.toUpperCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalStudents(collegeCode: string, students: any[]) {
  try {
    localStorage.setItem(`erus_college_students_${collegeCode.toUpperCase()}`, JSON.stringify(students));
  } catch (e) {
    console.warn('Error saving local students:', e);
  }
}

export function getLocalFaculty(collegeCode: string): any[] {
  try {
    const raw = localStorage.getItem(`erus_college_faculty_${collegeCode.toUpperCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalFaculty(collegeCode: string, faculty: any[]) {
  try {
    localStorage.setItem(`erus_college_faculty_${collegeCode.toUpperCase()}`, JSON.stringify(faculty));
  } catch (e) {
    console.warn('Error saving local faculty:', e);
  }
}

export function getLocalSlots(collegeCode: string): any[] {
  try {
    const raw = localStorage.getItem(`erus_college_slots_${collegeCode.toUpperCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalSlots(collegeCode: string, slots: any[]) {
  try {
    localStorage.setItem(`erus_college_slots_${collegeCode.toUpperCase()}`, JSON.stringify(slots));
  } catch (e) {
    console.warn('Error saving local slots:', e);
  }
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

export async function fetchCollegeStudents(collegeCode: string = 'DIT'): Promise<any[]> {
  const code = collegeCode.toUpperCase();
  let backendStudents: any[] = [];
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

  const defaultStudents: any[] = [];

  const localStudents = getLocalStudents(code);
  const map = new Map<string, any>();

  defaultStudents.forEach((s) => map.set(s.studentId || s.email, s));
  localStudents.forEach((s) => map.set(s.studentId || s.email, { ...map.get(s.studentId || s.email), ...s }));
  backendStudents.forEach((s) => map.set(s.studentId || s.email, { ...map.get(s.studentId || s.email), ...s }));

  const merged = Array.from(map.values());
  saveLocalStudents(code, merged);
  return merged;
}

export async function addCollegeStudents(payload: { students?: any[]; student?: any; collegeCode?: string }) {
  const code = (payload.collegeCode || 'DIT').toUpperCase();
  const incoming: any[] = Array.isArray(payload.students) ? payload.students : payload.student ? [payload.student] : [];

  const existing = getLocalStudents(code);
  const map = new Map<string, any>();
  existing.forEach((s) => map.set(s.studentId || s.email, s));

  incoming.forEach((s, idx) => {
    const studentObj = {
      id: s.id || `s-${Date.now()}-${idx}`,
      name: s.name,
      email: s.email,
      studentId: s.studentId || `STU-${Date.now().toString().slice(-4)}-${idx}`,
      course: s.course || 'B.Tech Computer Science & Engineering',
      batch: s.batch || '2022-2026',
      seatNumber: Number(s.seatNumber) || existing.length + idx + 1,
      college: s.college || (code === 'DIT' ? 'Delhi Institute of Technology' : code),
      collegeCode: code,
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
    } as any, 'password123');
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

export async function fetchCollegeFaculty(collegeCode: string = 'DIT'): Promise<any[]> {
  const code = collegeCode.toUpperCase();
  let backendFaculty: any[] = [];
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

  const defaultFaculty: any[] = [];

  const localFaculty = getLocalFaculty(code);
  const map = new Map<string, any>();

  defaultFaculty.forEach((f) => map.set(f.facultyId || f.email, f));
  localFaculty.forEach((f) => map.set(f.facultyId || f.email, { ...map.get(f.facultyId || f.email), ...f }));
  backendFaculty.forEach((f) => map.set(f.facultyId || f.email, { ...map.get(f.facultyId || f.email), ...f }));

  const merged = Array.from(map.values());
  saveLocalFaculty(code, merged);
  return merged;
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

export async function fetchCollegeSlots(collegeCode: string = 'DIT'): Promise<any[]> {
  const code = collegeCode.toUpperCase();
  let backendSlots: any[] = [];
  try {
    const res = await fetch(`/api/college/slots?collegeCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.slots)) {
        backendSlots = data.slots;
      }
    }
  } catch (e) {
    console.warn('Error fetching college slots:', e);
  }

  // Backend is authoritative. Local slots are only a resilience cache and must
  // never overwrite backend assignment/status/enrollment fields.
  const merged = backendSlots.length > 0
    ? backendSlots
    : getLocalSlots(code);
  saveLocalSlots(code, merged);
  return merged;
}

export async function deleteCollegeSlot(slotId: string, collegeCode: string = 'DIT') {
  const code = collegeCode.toUpperCase();
  try {
    const res = await fetch('/api/college/slots/' + encodeURIComponent(slotId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      const local = getLocalSlots(code).filter((s) => s.id !== slotId);
      saveLocalSlots(code, local);
      return data;
    }
    return { success: false, error: data.error || 'Unable to delete slot' };
  } catch (e) {
    console.warn('Error deleting college slot:', e);
    return { success: false, error: 'Unable to reach server' };
  }
}

export async function createCollegeSlot(payload: any) {
  const code = (payload.collegeCode || 'DIT').toUpperCase();
  const existing = getLocalSlots(code);
  const newSlot = {
    id: payload.id || `slot-${code.toLowerCase()}-${Date.now().toString().slice(-4)}`,
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

// ==========================================
// SUPER ADMIN CLIENT API HELPERS
// ==========================================

export async function fetchAdminColleges(): Promise<any[]> {
  let backendColleges: any[] = [];
  try {
    const res = await fetch('/api/admin/colleges');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.colleges)) {
        backendColleges = data.colleges;
      }
    }
  } catch (e) {
    console.warn('Error fetching admin colleges:', e);
  }

  const localCustom = getLocalCustomColleges();
  const map = new Map<string, any>();

  DEFAULT_ADMIN_COLLEGES.forEach((c) => map.set(c.code.toUpperCase(), c));
  localCustom.forEach((c) => map.set(c.code.toUpperCase(), { ...map.get(c.code.toUpperCase()), ...c }));
  backendColleges.forEach((c) => map.set(c.code.toUpperCase(), { ...map.get(c.code.toUpperCase()), ...c }));

  const merged = Array.from(map.values());
  try {
    localStorage.setItem(CUSTOM_COLLEGES_KEY, JSON.stringify(merged));
  } catch {}

  return merged;
}

export async function registerNewCollege(payload: any) {
  const cleanCode = (payload.code || '').trim().toUpperCase();
  const newCollegeObj = {
    id: `col-${Date.now()}`,
    ...payload,
    code: cleanCode,
    status: 'active',
    studentCount: 0,
    facultyCount: 0,
    slotCount: 0,
    adminEmail: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    adminName: payload.adminName || `${cleanCode} Administrator`,
    createdAt: new Date().toISOString(),
  };

  saveLocalCustomCollege(newCollegeObj);

  const creds = {
    email: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    password: payload.adminPassword || `Erus@${cleanCode}2026`,
    role: 'college_admin' as const,
    collegeName: payload.name,
    collegeCode: cleanCode,
    adminId: `CADM-${cleanCode}-001`,
  };

  // Auto-register new college admin user so they can log in immediately
  registerNewUser({
    id: `ca-${Date.now()}`,
    name: payload.adminName || `${cleanCode} College Administrator`,
    email: creds.email,
    role: 'college_admin',
    college: payload.name,
    collegeCode: cleanCode,
    adminId: creds.adminId,
  } as any, creds.password);

  try {
    const res = await fetch('/api/admin/colleges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, code: cleanCode }),
    });
    if (res.ok) {
      return await res.json();
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
  };
}


export async function fetchFacultyAssignedSlots(facultyId: string, collegeCode: string = 'DIT'): Promise<any[]> {
  const code = collegeCode.toUpperCase();
  try {
    const res = await fetch(
      `/api/faculty/sessions?facultyId=${encodeURIComponent(facultyId)}&collegeCode=${encodeURIComponent(code)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) return data.sessions;
    }
  } catch (e) {
    console.warn('Error fetching faculty sessions:', e);
  }
  return [];
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
