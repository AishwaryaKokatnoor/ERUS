import { StudentUser, FacultyUser, AuthUser } from '../types/auth';

export interface UserCredential {
  password: string;
  user: AuthUser;
}

// Clean initialization: No dummy or mock accounts
export const MOCK_STUDENTS: (StudentUser & { password: string })[] = [];
export const MOCK_FACULTY: (FacultyUser & { password: string })[] = [];

export const MOCK_COLLEGE_ADMINS: (import('../types/auth').CollegeAdminUser & { password: string })[] = [
  {
    id: 'ca-1',
    name: 'DIT College Administrator',
    email: 'admin@dit.edu.in',
    role: 'college_admin',
    adminId: 'CADM-DIT-001',
    college: 'Delhi Institute of Technology',
    collegeCode: 'DIT',
    department: 'Academic & Placement Affairs',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
    password: 'college123',
  },
];

export const MOCK_SUPER_ADMINS: (import('../types/auth').SuperAdminUser & { password: string })[] = [
  {
    id: 'sa-1',
    name: 'Platform Super Admin',
    email: 'superadmin@erus.ai',
    role: 'super_admin',
    college: 'ERUS Global Administration',
    accessLevel: 'root',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    password: 'admin123',
  },
];

const REGISTERED_USERS_KEY = 'erus_registered_users_db';

export function getRegisteredUsers(): (AuthUser & { password: string })[] {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function registerNewUser(user: AuthUser, password: string): AuthUser {
  try {
    const existing = getRegisteredUsers();
    // Check if duplicate email
    const filtered = existing.filter((u) => u.email.toLowerCase() !== user.email.toLowerCase());
    filtered.push({ ...user, password });
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Could not persist registration to localStorage:', e);
  }
  return user;
}

export function authenticateUser(
  role: import('../types/auth').UserRole,
  identifier: string,
  password: string
): AuthUser | null {
  const cleanId = identifier.trim().toLowerCase();
  
  // Authenticate against registered users in persistent storage
  const registeredUsers = getRegisteredUsers();
  const registeredMatch = registeredUsers.find(
    (u) =>
      u.role === role &&
      (u.email.toLowerCase() === cleanId ||
       ('studentId' in u && u.studentId?.toLowerCase() === cleanId) ||
       ('facultyId' in u && u.facultyId?.toLowerCase() === cleanId) ||
       ('adminId' in u && (u as any).adminId?.toLowerCase() === cleanId) ||
       u.name.toLowerCase().includes(cleanId)) &&
      (!password || u.password === password)
  );

  if (registeredMatch) {
    const { password: _, ...user } = registeredMatch;
    return user as AuthUser;
  }

  // 2. Fall back to mock users
  if (role === 'student') {
    const found = MOCK_STUDENTS.find(
      (s) =>
        (s.email.toLowerCase() === cleanId ||
         s.studentId.toLowerCase() === cleanId ||
         s.name.toLowerCase().includes(cleanId)) &&
        (!password || s.password === password)
    );
    if (found) {
      const { password: _, ...user } = found;
      return user;
    }
  } else if (role === 'faculty') {
    const found = MOCK_FACULTY.find(
      (f) =>
        (f.email.toLowerCase() === cleanId ||
         f.facultyId.toLowerCase() === cleanId ||
         f.name.toLowerCase().includes(cleanId)) &&
        (!password || f.password === password)
    );
    if (found) {
      const { password: _, ...user } = found;
      return user;
    }
  } else if (role === 'college_admin') {
    const found = MOCK_COLLEGE_ADMINS.find(
      (ca) =>
        (ca.email.toLowerCase() === cleanId ||
         ca.adminId.toLowerCase() === cleanId ||
         ca.name.toLowerCase().includes(cleanId)) &&
        (!password || ca.password === password)
    );
    if (found) {
      const { password: _, ...user } = found;
      return user;
    }
  } else if (role === 'super_admin') {
    const found = MOCK_SUPER_ADMINS.find(
      (sa) =>
        (sa.email.toLowerCase() === cleanId || sa.name.toLowerCase().includes(cleanId)) &&
        (!password || sa.password === password)
    );
    if (found) {
      const { password: _, ...user } = found;
      return user;
    }
  }

  return null;
}
