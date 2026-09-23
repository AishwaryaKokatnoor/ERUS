import { StudentUser, FacultyUser, AuthUser } from '../types/auth';

export interface UserCredential {
  password: string;
  user: AuthUser;
}

// Clean initialization: No dummy or mock accounts
export const MOCK_STUDENTS: (StudentUser & { password: string })[] = [];
export const MOCK_FACULTY: (FacultyUser & { password: string })[] = [];

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
  role: 'student' | 'faculty',
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
       u.name.toLowerCase() === cleanId) &&
      (!password || u.password === password)
  );

  if (registeredMatch) {
    const { password: _, ...user } = registeredMatch;
    return user as AuthUser;
  }

  return null;
}
