export type UserRole = 'student' | 'faculty';

export interface BaseUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  college: string;
}

export interface StudentUser extends BaseUser {
  role: 'student';
  studentId: string;
  course: string;
  batch: string;
  seatNumber: number;
}

export interface FacultyUser extends BaseUser {
  role: 'faculty';
  facultyId: string;
  department: string;
  designation: string;
}

export type AuthUser = StudentUser | FacultyUser;
