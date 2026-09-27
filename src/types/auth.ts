export type UserRole = 'student' | 'faculty' | 'college_admin' | 'super_admin';

export interface BaseUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  college: string;
  collegeId?: string;
  collegeCode?: string;
}

export interface StudentUser extends BaseUser {
  role: 'student';
  studentId: string;
  course: string;
  batch: string;
  seatNumber: number;
  bookedSlotId?: string;
}

export interface FacultyUser extends BaseUser {
  role: 'faculty';
  facultyId: string;
  department: string;
  designation: string;
}

export interface CollegeAdminUser extends BaseUser {
  role: 'college_admin';
  adminId: string;
  department: string;
  collegeCode: string;
}

export interface SuperAdminUser extends BaseUser {
  role: 'super_admin';
  accessLevel: 'root';
}

export type AuthUser = StudentUser | FacultyUser | CollegeAdminUser | SuperAdminUser;

export interface CollegeInfo {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  phone?: string;
  address?: string;
  status: 'active' | 'trial' | 'suspended';
  studentCount?: number;
  facultyCount?: number;
  slotCount?: number;
  adminEmail?: string;
  adminName?: string;
  createdAt: string;
}

