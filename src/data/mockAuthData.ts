import { StudentUser, FacultyUser, AuthUser } from '../types/auth';

export interface UserCredential {
  password: string;
  user: AuthUser;
}

export const MOCK_STUDENTS: (StudentUser & { password: string })[] = [
  {
    id: 's1',
    name: 'Rahul Kumar',
    email: 'rahul.kumar@dit.edu.in',
    role: 'student',
    studentId: 'STU-2022-041',
    college: 'Delhi Institute of Technology',
    course: 'B.Tech CSE',
    batch: '2022-2026',
    seatNumber: 1,
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&q=80',
    password: 'password123',
  },
  {
    id: 's2',
    name: 'Priya Sharma',
    email: 'priya.sharma@sxec.edu.in',
    role: 'student',
    studentId: 'STU-2022-089',
    college: 'St. Xavier Engineering College',
    course: 'B.Tech IT',
    batch: '2022-2026',
    seatNumber: 2,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
    password: 'password123',
  },
  {
    id: 's3',
    name: 'Ramesh Patel',
    email: 'ramesh.patel@nit.edu.in',
    role: 'student',
    studentId: 'STU-2022-112',
    college: 'National Institute of Tech',
    course: 'B.Tech ECE',
    batch: '2022-2026',
    seatNumber: 3,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    password: 'password123',
  },
  {
    id: 's6',
    name: 'Sneha Reddy',
    email: 'sneha.reddy@srm.edu.in',
    role: 'student',
    studentId: 'STU-2022-178',
    college: 'SRM Institute Chennai',
    course: 'B.Tech Data Science',
    batch: '2022-2026',
    seatNumber: 6,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    password: 'password123',
  },
];

export const MOCK_FACULTY: (FacultyUser & { password: string })[] = [
  {
    id: 'fac-1',
    name: 'Dr. Sunita Rao',
    email: 'sunita.rao@dit.edu.in',
    role: 'faculty',
    facultyId: 'FAC-CSE-102',
    college: 'Delhi Institute of Technology',
    department: 'Department of Computer Science & Engineering',
    designation: 'Professor & Head of Department',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
    password: 'faculty123',
  },
  {
    id: 'fac-2',
    name: 'Prof. Rajesh Verma',
    email: 'rajesh.verma@dit.edu.in',
    role: 'faculty',
    facultyId: 'FAC-MGT-205',
    college: 'Delhi Institute of Technology',
    department: 'School of Management & Humanities',
    designation: 'Dean of Academic Affairs',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&q=80',
    password: 'faculty123',
  },
];

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
  
  // 1. First check newly registered accounts in localStorage
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
