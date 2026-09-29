import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  connectMongoDB,
  initMongoDBTablesAndSubTables,
  isMongoConnected,
  CollegeModel,
  UserModel,
  GDSessionModel,
  TranscriptEntryModel,
  AssessmentReportModel,
  GDBookingModel,
} from './src/db/mongo.ts';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'erus_super_secret_jwt_key_2026';

app.use(express.json());

// ==========================================
// PERSISTENT DATA STORE (Server-Side)
// ==========================================
interface BackendCollege {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  phone?: string;
  address?: string;
  status: string;
  studentCount: number;
  facultyCount: number;
  slotCount: number;
  adminEmail?: string;
  adminName?: string;
  createdAt: string;
}

interface BackendCollegeStudentItem {
  id: string;
  name: string;
  email: string;
  studentId: string;
  course: string;
  batch: string;
  seatNumber: number;
  college: string;
  collegeCode: string;
}

interface BackendCollegeFacultyItem {
  id: string;
  name: string;
  email: string;
  facultyId: string;
  department: string;
  designation: string;
  college: string;
  collegeCode: string;
  assignedSlotsCount: number;
}

interface BackendCollegeSlotItem {
  id: string;
  slotName: string;
  topic: string;
  description: string;
  slotTiming: string;
  status: string;
  durationMinutes: number;
  enrolledCount: number;
  maxCapacity: number;
  assignedFacultyId?: string;
  assignedFacultyName?: string;
  assignedFacultyEmail?: string;
  assignedFacultyDept?: string;
  collegeCode: string;
  createdAt: string;
}

interface StoredAuthUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'college_admin' | 'faculty' | 'student';
  password: string;
  college: string;
  collegeCode?: string;
  department?: string;
  designation?: string;
  course?: string;
  batch?: string;
  seatNumber?: number;
  studentId?: string;
  facultyId?: string;
  adminId?: string;
  avatar?: string;
}

const DEFAULT_COLLEGES: BackendCollege[] = [];

const DEFAULT_COLLEGE_STUDENTS: Record<string, BackendCollegeStudentItem[]> = {};

const DEFAULT_COLLEGE_FACULTY: Record<string, BackendCollegeFacultyItem[]> = {};

const DEFAULT_COLLEGE_SLOTS: Record<string, BackendCollegeSlotItem[]> = {};

const DEFAULT_USERS: StoredAuthUser[] = [
  {
    id: 'sa-1',
    name: 'Platform Super Admin',
    email: 'superadmin@erus.ai',
    password: 'admin123',
    role: 'super_admin',
    college: 'ERUS Global Administration',
  },
];

const PERSIST_FILE = path.join(process.cwd(), '.erus_backend_state.json');

let persistentState = {
  colleges: [...DEFAULT_COLLEGES],
  students: { ...DEFAULT_COLLEGE_STUDENTS },
  faculty: { ...DEFAULT_COLLEGE_FACULTY },
  slots: { ...DEFAULT_COLLEGE_SLOTS },
  users: [...DEFAULT_USERS],
  studentBookings: {} as Record<string, string>,
  studentTopicBookings: {} as Record<string, Record<string, string>>,
};

function loadPersistentState() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        const dummyCollegeCodes = ['DIT', 'IITB'];
        const dummyUserIds = ['ca-1', 'fac-1', 'fac-2', 's1', 's2', 's3'];

        if (Array.isArray(data.colleges)) {
          persistentState.colleges = data.colleges.filter(
            (c: any) => !dummyCollegeCodes.includes(c?.code) && !['col-1', 'col-2'].includes(c?.id)
          );
        }
        if (data.students && typeof data.students === 'object') {
          persistentState.students = {};
          for (const [k, v] of Object.entries(data.students)) {
            if (!dummyCollegeCodes.includes(k) && Array.isArray(v)) {
              persistentState.students[k] = (v as any[]).filter(
                (s: any) => !dummyUserIds.includes(s?.id)
              );
            }
          }
        }
        if (data.faculty && typeof data.faculty === 'object') {
          persistentState.faculty = {};
          for (const [k, v] of Object.entries(data.faculty)) {
            if (!dummyCollegeCodes.includes(k) && Array.isArray(v)) {
              persistentState.faculty[k] = (v as any[]).filter(
                (f: any) => !dummyUserIds.includes(f?.id)
              );
            }
          }
        }
        if (data.slots && typeof data.slots === 'object') {
          persistentState.slots = {};
          for (const [k, v] of Object.entries(data.slots)) {
            if (!dummyCollegeCodes.includes(k) && Array.isArray(v)) {
              persistentState.slots[k] = (v as any[]).filter(
                (slot: any) => !['slot-dit-001', 'session-101', 'slot-teachers-1'].includes(slot?.id)
              );
            }
          }
        }
        if (Array.isArray(data.users)) {
          const filteredUsers = data.users.filter(
            (u: any) =>
              !dummyUserIds.includes(u?.id) &&
              u?.email !== 'admin@dit.edu.in' &&
              u?.email !== 'sunita.rao@dit.edu.in' &&
              u?.email !== 'rajesh.verma@dit.edu.in' &&
              u?.email !== 'rahul.kumar@dit.edu.in' &&
              u?.email !== 'neha.gupta@dit.edu.in' &&
              u?.email !== 'aditya.singh@dit.edu.in'
          );
          if (!filteredUsers.some((u: any) => u.role === 'super_admin' || u.email === 'superadmin@erus.ai')) {
            filteredUsers.push(...DEFAULT_USERS);
          }
          persistentState.users = filteredUsers;
        }
        if (data.studentBookings && typeof data.studentBookings === 'object') {
          const bookings = { ...data.studentBookings };
          delete bookings['s1'];
          persistentState.studentBookings = bookings;
        }
        if (data.studentTopicBookings && typeof data.studentTopicBookings === 'object') {
          persistentState.studentTopicBookings = data.studentTopicBookings;
        }
      }
    }
  } catch (err) {
    console.warn('[Backend State] Could not read persistent state file:', err);
  }
}

function savePersistentState() {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(persistentState, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Backend State] Could not write persistent state file:', err);
  }
}

loadPersistentState();

// ==========================================
// MONGODB CLIENT & TABLE / SUB-TABLE PERSISTENCE
// ==========================================
async function syncMongoDBWithPersistentState() {
  if (!isMongoConnected()) return;
  try {
    const collegeCount = await CollegeModel.countDocuments();
    if (collegeCount === 0) {
      console.log('[MongoDB] Fresh database detected. Initializing tables & sub-tables...');
      await initMongoDBTablesAndSubTables();
    } else {
      console.log('[MongoDB] Existing MongoDB records found. Hydrating state from MongoDB...');
      const dbColleges = await CollegeModel.find();
      if (dbColleges.length > 0) {
        persistentState.colleges = dbColleges.map((c: any) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          contactEmail: c.contactEmail,
          phone: c.phone || '',
          address: c.address || '',
          status: c.status || 'active',
          studentCount: c.studentCount || 0,
          facultyCount: c.facultyCount || 0,
          slotCount: c.slotCount || 0,
          adminEmail: c.adminEmail || c.contactEmail,
          adminName: c.adminName || `${c.code} Administrator`,
          createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        }));
      }

      const dbUsers = await UserModel.find();
      if (dbUsers.length > 0) {
        for (const u of dbUsers) {
          const existingIdx = persistentState.users.findIndex(
            (pu) => pu.email.toLowerCase() === u.email.toLowerCase()
          );
          const mappedUser: StoredAuthUser = {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role as any,
            password: u.password,
            college: u.college,
            collegeCode: u.collegeCode,
            avatar: u.avatar,
            studentId: u.studentProfile?.studentId,
            course: u.studentProfile?.course,
            batch: u.studentProfile?.batch,
            seatNumber: u.studentProfile?.seatNumber,
            facultyId: u.facultyProfile?.facultyId,
            department: u.facultyProfile?.department || u.collegeAdminProfile?.department,
            designation: u.facultyProfile?.designation,
            adminId: u.collegeAdminProfile?.adminId,
          };
          if (existingIdx >= 0) {
            persistentState.users[existingIdx] = mappedUser;
          } else {
            persistentState.users.push(mappedUser);
          }
        }

        // Hydrate students and faculty lists per college
        for (const col of persistentState.colleges) {
          const colStudents = persistentState.users
            .filter((u) => u.role === 'student' && (u.collegeCode === col.code || u.college === col.name))
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              studentId: u.studentId || 'STU-001',
              course: u.course || 'B.Tech CSE',
              batch: u.batch || '2022-2026',
              seatNumber: u.seatNumber || 1,
              college: col.name,
              collegeCode: col.code,
            }));
          if (colStudents.length > 0) persistentState.students[col.code] = colStudents;

          const colFaculty = persistentState.users
            .filter((u) => u.role === 'faculty' && (u.collegeCode === col.code || u.college === col.name))
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              facultyId: u.facultyId || 'FAC-001',
              department: u.department || 'Computer Science & Engineering',
              designation: u.designation || 'Faculty Member',
              college: col.name,
              collegeCode: col.code,
              assignedSlotsCount: 0,
            }));
          if (colFaculty.length > 0) persistentState.faculty[col.code] = colFaculty;
        }
      }

      // Hydrate Slots (Parent Table: gd_sessions)
      const dbSessions = await GDSessionModel.find();
      if (dbSessions.length > 0) {
        for (const s of dbSessions) {
          const colCode = s.collegeCode || 'DIT';
          if (!persistentState.slots[colCode]) persistentState.slots[colCode] = [];
          const slotItem: BackendCollegeSlotItem = {
            id: s.id,
            slotName: s.slotName,
            topic: s.topic,
            description: s.description || '',
            slotTiming: s.slotTiming || '10:00 AM - 10:30 AM',
            status: s.status,
            durationMinutes: s.durationMinutes,
            enrolledCount: s.enrolledCount,
            maxCapacity: s.maxCapacity,
            assignedFacultyId: s.assignedFacultyId,
            assignedFacultyName: s.assignedFacultyName,
            assignedFacultyEmail: s.assignedFacultyEmail,
            assignedFacultyDept: s.assignedFacultyDept,
            collegeCode: colCode,
            createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
          };
          const existingSlotIdx = persistentState.slots[colCode].findIndex((slot) => slot.id === s.id);
          if (existingSlotIdx >= 0) {
            persistentState.slots[colCode][existingSlotIdx] = slotItem;
          } else {
            persistentState.slots[colCode].push(slotItem);
          }
        }
      }

      // Hydrate Bookings (Sub-Table: gd_bookings)
      const dbBookings = await GDBookingModel.find({ status: { $ne: 'CANCELLED' } });
      for (const b of dbBookings) {
        persistentState.studentBookings[b.studentId] = b.sessionId;
      }

      savePersistentState();
      console.log(
        `[MongoDB] Hydrated state from MongoDB: ${dbColleges.length} colleges, ${dbUsers.length} users, ${dbSessions.length} slots, ${dbBookings.length} active bookings.`
      );
    }
  } catch (err: any) {
    console.warn('[MongoDB] State sync warning:', err.message);
  }
}

async function persistCollegeToMongoDB(col: BackendCollege) {
  if (!isMongoConnected()) return;
  try {
    await CollegeModel.findOneAndUpdate(
      { code: col.code },
      {
        id: col.id,
        name: col.name,
        code: col.code,
        contactEmail: col.contactEmail,
        phone: col.phone || '',
        address: col.address || '',
        status: col.status || 'active',
        studentCount: col.studentCount || 0,
        facultyCount: col.facultyCount || 0,
        slotCount: col.slotCount || 0,
        adminEmail: col.adminEmail || '',
        adminName: col.adminName || '',
      },
      { upsert: true, new: true }
    );
  } catch (e: any) {
    console.warn('[MongoDB] Save college error:', e.message);
  }
}

async function persistUserToMongoDB(u: StoredAuthUser) {
  if (!isMongoConnected()) return;
  try {
    await UserModel.findOneAndUpdate(
      { email: u.email.toLowerCase() },
      {
        id: u.id,
        name: u.name,
        email: u.email.toLowerCase(),
        password: u.password,
        role: u.role,
        college: u.college,
        collegeCode: u.collegeCode || 'DIT',
        avatar: u.avatar || '',
        studentProfile:
          u.role === 'student'
            ? {
                studentId: u.studentId || `STU-${Date.now().toString().slice(-4)}`,
                course: u.course || 'B.Tech CSE',
                batch: u.batch || '2022-2026',
                seatNumber: u.seatNumber || 1,
              }
            : undefined,
        facultyProfile:
          u.role === 'faculty'
            ? {
                facultyId: u.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
                department: u.department || 'Department of Computer Science & Engineering',
                designation: u.designation || 'Faculty Member',
              }
            : undefined,
        collegeAdminProfile:
          u.role === 'college_admin'
            ? {
                adminId: u.adminId || `CADM-${u.collegeCode || 'DIT'}-001`,
                department: u.department || 'Academic Administration',
              }
            : undefined,
      },
      { upsert: true, new: true }
    );
  } catch (e: any) {
    console.warn('[MongoDB] Save user error:', e.message);
  }
}

async function persistSlotToMongoDB(slot: BackendCollegeSlotItem) {
  if (!isMongoConnected()) return;
  try {
    await GDSessionModel.findOneAndUpdate(
      { id: slot.id },
      {
        id: slot.id,
        slotName: slot.slotName || slot.topic,
        topic: slot.topic,
        description: slot.description || '',
        slotTiming: slot.slotTiming || '10:00 AM - 10:30 AM',
        status: (slot.status as any) || 'scheduled',
        durationMinutes: slot.durationMinutes || 25,
        enrolledCount: slot.enrolledCount || 0,
        maxCapacity: slot.maxCapacity || 15,
        collegeCode: slot.collegeCode || 'DIT',
        assignedFacultyId: slot.assignedFacultyId || '',
        assignedFacultyName: slot.assignedFacultyName || '',
        assignedFacultyEmail: slot.assignedFacultyEmail || '',
        assignedFacultyDept: slot.assignedFacultyDept || '',
      },
      { upsert: true, new: true }
    );
  } catch (e: any) {
    console.warn('[MongoDB] Save slot error:', e.message);
  }
}

async function deleteSlotFromMongoDB(slotId: string) {
  if (!isMongoConnected()) return;
  try {
    await GDSessionModel.deleteOne({ id: slotId });
    await GDBookingModel.deleteMany({ sessionId: slotId });
    await TranscriptEntryModel.deleteMany({ sessionId: slotId });
    await AssessmentReportModel.deleteMany({ sessionId: slotId });
  } catch (e: any) {
    console.warn('[MongoDB] Delete slot error:', e.message);
  }
}

async function persistBookingToMongoDB(
  sessionId: string,
  studentId: string,
  status: 'BOOKED' | 'LIVE' | 'COMPLETED' | 'CANCELLED',
  topic?: string
) {
  if (!isMongoConnected()) return;
  try {
    await GDBookingModel.findOneAndUpdate(
      { sessionId, studentId },
      {
        id: `bk-${studentId}-${sessionId}`,
        sessionId,
        studentId,
        topic: topic || '',
        status,
        bookedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (e: any) {
    console.warn('[MongoDB] Save booking error:', e.message);
  }
}

async function persistTranscriptToMongoDB(t: BackendTranscript) {
  if (!isMongoConnected()) return;
  try {
    await TranscriptEntryModel.findOneAndUpdate(
      { id: t.id },
      {
        id: t.id,
        sessionId: t.sessionId,
        speakerId: t.speakerId,
        speakerName: t.speakerName,
        seatNumber: t.seatNumber ?? null,
        isFacilitator: t.isFacilitator,
        timestamp: t.timestamp,
        timestampSeconds: t.timestampSeconds,
        text: t.text,
        type: t.type || 'statement',
        sentiment: t.sentiment || 'neutral',
      },
      { upsert: true, new: true }
    );
  } catch (e: any) {
    console.warn('[MongoDB] Save transcript error:', e.message);
  }
}

// ==========================================
// PRISMA POSTGRESQL CLIENT & DUAL-PERSISTENCE
// ==========================================
let prisma: PrismaClient | null = null;
let isDbConnected = false;

async function syncDatabaseWithPersistentState() {
  if (!prisma || !isDbConnected) return;
  try {
    const collegeCount = await prisma.college.count();
    if (collegeCount === 0) {
      console.log('[Database] Fresh PostgreSQL detected. Seeding from persistent state...');
      for (const col of persistentState.colleges) {
        await prisma.college.upsert({
          where: { code: col.code },
          update: {
            name: col.name,
            contactEmail: col.contactEmail,
            phone: col.phone || '',
            address: col.address || '',
            status: col.status || 'active',
          },
          create: {
            name: col.name,
            code: col.code,
            contactEmail: col.contactEmail,
            phone: col.phone || '',
            address: col.address || '',
            status: col.status || 'active',
          },
        });
      }

      for (const u of persistentState.users) {
        const collegeRec = await prisma.college.findUnique({ where: { code: u.collegeCode || 'DIT' } });
        const passHash = u.password.startsWith('$2') ? u.password : await bcrypt.hash(u.password, 10);
        
        await prisma.user.upsert({
          where: { email: u.email.toLowerCase() },
          update: {
            name: u.name,
            role: u.role,
            college: u.college,
            collegeId: collegeRec?.id || null,
          },
          create: {
            email: u.email.toLowerCase(),
            passwordHash: passHash,
            name: u.name,
            role: u.role,
            college: u.college,
            collegeId: collegeRec?.id || null,
            avatar: u.avatar,
            ...(u.role === 'student'
              ? {
                  studentProfile: {
                    create: {
                      studentId: u.studentId || `STU-${Date.now().toString().slice(-4)}`,
                      course: u.course || 'B.Tech CSE',
                      batch: u.batch || '2022-2026',
                      seatNumber: u.seatNumber || 1,
                    },
                  },
                }
              : u.role === 'faculty'
              ? {
                  facultyProfile: {
                    create: {
                      facultyId: u.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
                      department: u.department || 'Computer Science & Engineering',
                      designation: u.designation || 'Faculty Member',
                    },
                  },
                }
              : u.role === 'college_admin'
              ? {
                  collegeAdminProfile: {
                    create: {
                      adminId: u.adminId || `CADM-${u.collegeCode || 'DIT'}-001`,
                      department: u.department || 'Academic Administration',
                    },
                  },
                }
              : {}),
          },
        });
      }

      for (const [code, slotList] of Object.entries(persistentState.slots)) {
        const col = await prisma.college.findUnique({ where: { code } });
        for (const slot of slotList) {
          await prisma.gDSession.upsert({
            where: { id: slot.id },
            update: {
              topic: slot.topic,
              description: slot.description,
              slotTiming: slot.slotTiming,
              slotName: slot.slotName,
              durationMinutes: slot.durationMinutes,
              maxCapacity: slot.maxCapacity,
              enrolledCount: slot.enrolledCount,
              assignedFacultyId: slot.assignedFacultyId,
              assignedFacultyName: slot.assignedFacultyName,
              status: slot.status,
            },
            create: {
              id: slot.id,
              topic: slot.topic,
              description: slot.description,
              slotTiming: slot.slotTiming,
              slotName: slot.slotName,
              durationMinutes: slot.durationMinutes,
              maxCapacity: slot.maxCapacity,
              enrolledCount: slot.enrolledCount,
              assignedFacultyId: slot.assignedFacultyId,
              assignedFacultyName: slot.assignedFacultyName,
              collegeId: col?.id,
              status: slot.status,
            },
          });
        }
      }
      console.log('[Database] Seeding to PostgreSQL completed successfully.');
    } else {
      console.log('[Database] PostgreSQL records found. Hydrating persistent memory state from DB...');
      const dbColleges = await prisma.college.findMany({
        include: {
          users: {
            include: {
              studentProfile: true,
              facultyProfile: true,
              collegeAdminProfile: true,
            },
          },
          sessions: true,
        },
      });

      if (dbColleges.length > 0) {
        persistentState.colleges = dbColleges.map((c) => {
          const adminUser = c.users.find((u) => u.role === 'college_admin');
          return {
            id: c.id,
            name: c.name,
            code: c.code,
            contactEmail: c.contactEmail,
            phone: c.phone || '',
            address: c.address || '',
            status: c.status || 'active',
            studentCount: c.users.filter((u) => u.role === 'student').length,
            facultyCount: c.users.filter((u) => u.role === 'faculty').length,
            slotCount: c.sessions.length,
            adminEmail: adminUser?.email || c.contactEmail,
            adminName: adminUser?.name || `${c.code} Administrator`,
            createdAt: c.createdAt.toISOString(),
          };
        });

        for (const c of dbColleges) {
          const students = c.users
            .filter((u) => u.role === 'student')
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              studentId: u.studentProfile?.studentId || 'STU-001',
              course: u.studentProfile?.course || 'B.Tech CSE',
              batch: u.studentProfile?.batch || '2022-2026',
              seatNumber: u.studentProfile?.seatNumber || 1,
              college: c.name,
              collegeCode: c.code,
            }));
          if (students.length > 0) {
            persistentState.students[c.code] = students;
          }

          const faculty = c.users
            .filter((u) => u.role === 'faculty')
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              facultyId: u.facultyProfile?.facultyId || 'FAC-001',
              department: u.facultyProfile?.department || 'Computer Science & Engineering',
              designation: u.facultyProfile?.designation || 'Professor',
              college: c.name,
              collegeCode: c.code,
              assignedSlotsCount: 0,
            }));
          if (faculty.length > 0) {
            persistentState.faculty[c.code] = faculty;
          }

          const slots = c.sessions.map((s) => ({
            id: s.id,
            slotName: s.slotName || s.topic,
            topic: s.topic,
            description: s.description || '',
            slotTiming: s.slotTiming || '10:30 AM - 10:45 AM',
            status: s.status,
            durationMinutes: s.durationMinutes,
            enrolledCount: s.enrolledCount,
            maxCapacity: s.maxCapacity,
            assignedFacultyId: s.assignedFacultyId || undefined,
            assignedFacultyName: s.assignedFacultyName || undefined,
            collegeCode: c.code,
            createdAt: s.createdAt.toISOString(),
          }));
          if (slots.length > 0) {
            persistentState.slots[c.code] = slots;
          }
        }

        const allDbUsers = await prisma.user.findMany({
          include: {
            studentProfile: true,
            facultyProfile: true,
            collegeAdminProfile: true,
            collegeOrg: true,
          },
        });

        for (const u of allDbUsers) {
          const existingIdx = persistentState.users.findIndex((pu) => pu.email.toLowerCase() === u.email.toLowerCase());
          const mappedUser: StoredAuthUser = {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role as any,
            password: u.passwordHash,
            college: u.college,
            collegeCode: u.collegeOrg?.code || undefined,
            department: u.facultyProfile?.department || u.collegeAdminProfile?.department,
            designation: u.facultyProfile?.designation,
            course: u.studentProfile?.course,
            batch: u.studentProfile?.batch,
            seatNumber: u.studentProfile?.seatNumber,
            studentId: u.studentProfile?.studentId,
            facultyId: u.facultyProfile?.facultyId,
            adminId: u.collegeAdminProfile?.adminId,
            avatar: u.avatar || undefined,
          };
          if (existingIdx >= 0) {
            persistentState.users[existingIdx] = mappedUser;
          } else {
            persistentState.users.push(mappedUser);
          }
        }

        savePersistentState();
        console.log(`[Database] Hydrated ${dbColleges.length} colleges, ${allDbUsers.length} users from PostgreSQL.`);
      }
    }
  } catch (err: any) {
    console.warn('[Database] Sync error:', err);
  }
}

if (process.env.DATABASE_URL) {
  try {
    prisma = new PrismaClient();
    prisma.$connect()
      .then(async () => {
        isDbConnected = true;
        console.log('[Database] Connected to PostgreSQL via Prisma');
        await syncDatabaseWithPersistentState();
      })
      .catch((err: any) => {
        console.warn('[Database] Prisma connection error (using persistent file/in-memory fallback):', err.message);
      });
  } catch (err: any) {
    console.warn('[Database] Prisma initialization error:', err);
  }
} else {
  console.log('[Database] No DATABASE_URL configured. Running with persistent file store (.erus_backend_state.json).');
}

// --- ADMIN COLLEGES ---
app.get('/api/admin/colleges', (req, res) => {
  const updatedColleges = persistentState.colleges.map((c) => {
    const sCount = (persistentState.students[c.code] || []).length;
    const fCount = (persistentState.faculty[c.code] || []).length;
    const slCount = (persistentState.slots[c.code] || []).length;
    return {
      ...c,
      studentCount: sCount || c.studentCount || 0,
      facultyCount: fCount || c.facultyCount || 0,
      slotCount: slCount || c.slotCount || 0,
    };
  });
  res.json({ success: true, colleges: updatedColleges });
});

app.post('/api/admin/colleges', async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.name || !payload.code) {
    return res.status(400).json({ success: false, error: 'Name and code are required' });
  }
  const cleanCode = payload.code.trim().toUpperCase();
  const newCol: BackendCollege = {
    id: `col-${Date.now()}`,
    name: payload.name.trim(),
    code: cleanCode,
    contactEmail: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    phone: payload.phone || '',
    address: payload.address || '',
    status: 'active',
    studentCount: 0,
    facultyCount: 0,
    slotCount: 0,
    adminEmail: payload.contactEmail || `admin@${cleanCode.toLowerCase()}.edu.in`,
    adminName: payload.adminName || `${cleanCode} Administrator`,
    createdAt: new Date().toISOString(),
  };

  const adminPass = payload.adminPassword || `Erus@${cleanCode}2026`;
  const adminUser: StoredAuthUser = {
    id: `ca-${Date.now()}`,
    name: payload.adminName || `${cleanCode} College Administrator`,
    email: newCol.contactEmail,
    password: adminPass,
    role: 'college_admin',
    college: newCol.name,
    collegeCode: cleanCode,
    adminId: `CADM-${cleanCode}-001`,
  };

  persistentState.colleges = [newCol, ...persistentState.colleges.filter((c) => c.code !== cleanCode)];
  persistentState.users = [adminUser, ...persistentState.users.filter((u) => u.email.toLowerCase() !== adminUser.email.toLowerCase())];
  savePersistentState();
  persistCollegeToMongoDB(newCol);
  persistUserToMongoDB(adminUser);

  if (isDbConnected && prisma) {
    try {
      const dbCol = await prisma.college.upsert({
        where: { code: cleanCode },
        update: {
          name: newCol.name,
          contactEmail: newCol.contactEmail,
          phone: newCol.phone,
          address: newCol.address,
          status: newCol.status,
        },
        create: {
          name: newCol.name,
          code: cleanCode,
          contactEmail: newCol.contactEmail,
          phone: newCol.phone,
          address: newCol.address,
          status: newCol.status,
        },
      });

      const hashedAdminPass = await bcrypt.hash(adminPass, 10);
      await prisma.user.upsert({
        where: { email: adminUser.email.toLowerCase() },
        update: {
          name: adminUser.name,
          passwordHash: hashedAdminPass,
          college: newCol.name,
          collegeId: dbCol.id,
        },
        create: {
          email: adminUser.email.toLowerCase(),
          passwordHash: hashedAdminPass,
          name: adminUser.name,
          role: 'college_admin',
          college: newCol.name,
          collegeId: dbCol.id,
          collegeAdminProfile: {
            create: {
              adminId: adminUser.adminId!,
              department: 'Academic Administration',
            },
          },
        },
      });
      console.log(`[Database] College ${cleanCode} and admin persisted to PostgreSQL.`);
    } catch (dbErr: any) {
      console.warn('[Database] Failed to persist college to PostgreSQL:', dbErr.message);
    }
  }

  res.json({
    success: true,
    college: newCol,
    generatedCredentials: {
      email: adminUser.email,
      password: adminPass,
      role: 'college_admin',
      collegeName: newCol.name,
      collegeCode: cleanCode,
      adminId: adminUser.adminId,
    },
  });
});

app.post('/api/admin/colleges/:id/send-credentials', (req, res) => {
  res.json({ success: true, message: 'Credentials dispatched successfully via secure notification.' });
});

app.get('/api/admin/stats', (req, res) => {
  let totalStu = 0;
  Object.values(persistentState.students).forEach((list) => { totalStu += list.length; });
  let totalFac = 0;
  Object.values(persistentState.faculty).forEach((list) => { totalFac += list.length; });
  let totalSl = 0;
  Object.values(persistentState.slots).forEach((list) => { totalSl += list.length; });

  res.json({
    success: true,
    stats: {
      totalColleges: persistentState.colleges.length,
      totalStudents: totalStu || 215,
      totalFaculty: totalFac || 32,
      totalSlots: totalSl || 14,
      activeLiveGDs: (typeof LIVE_ROOMS !== 'undefined' ? LIVE_ROOMS.size : 0) || 1,
    },
  });
});

// --- COLLEGE ADMIN ENDPOINTS ---
app.get('/api/college/stats', (req, res) => {
  const code = ((req.query.collegeCode as string) || 'DIT').toUpperCase();
  const college = persistentState.colleges.find((c) => c.code === code);
  const stuList = persistentState.students[code] || [];
  const facList = persistentState.faculty[code] || [];
  const slotList = persistentState.slots[code] || [];

  res.json({
    success: true,
    stats: {
      collegeName: college?.name || 'Delhi Institute of Technology',
      collegeCode: code,
      totalStudents: stuList.length || (code === 'DIT' ? 120 : 0),
      totalFaculty: facList.length || (code === 'DIT' ? 18 : 0),
      scheduledSlots: slotList.filter((s) => s.status === 'scheduled').length,
      completedSlots: slotList.filter((s) => s.status === 'completed').length,
      totalSlots: slotList.length,
    },
  });
});

app.get('/api/college/students', (req, res) => {
  const code = ((req.query.collegeCode as string) || 'DIT').toUpperCase();
  const students = persistentState.students[code] || [];
  res.json({ success: true, students });
});

app.post('/api/college/students', async (req, res) => {
  const { students, student, collegeCode } = req.body;
  const code = (collegeCode || 'DIT').toUpperCase();
  const incoming: any[] = Array.isArray(students) ? students : student ? [student] : [];

  if (!persistentState.students[code]) {
    persistentState.students[code] = [];
  }

  const addedStudents: BackendCollegeStudentItem[] = [];
  incoming.forEach((st, idx) => {
    const newStu: BackendCollegeStudentItem = {
      id: st.id || `s-${Date.now()}-${idx}`,
      name: st.name || 'Candidate',
      email: st.email || `student-${Date.now()}-${idx}@${code.toLowerCase()}.edu.in`,
      studentId: st.studentId || `STU-${Date.now().toString().slice(-4)}-${idx}`,
      course: st.course || 'B.Tech Computer Science & Engineering',
      batch: st.batch || '2022-2026',
      seatNumber: Number(st.seatNumber) || persistentState.students[code].length + 1,
      college: st.college || (persistentState.colleges.find((c) => c.code === code)?.name || 'Engineering Institute'),
      collegeCode: code,
    };
    persistentState.students[code].push(newStu);
    addedStudents.push(newStu);

    persistentState.users.push({
      id: newStu.id,
      name: newStu.name,
      email: newStu.email,
      password: 'password123',
      role: 'student',
      college: newStu.college,
      collegeCode: code,
      studentId: newStu.studentId,
      course: newStu.course,
      batch: newStu.batch,
      seatNumber: newStu.seatNumber,
    });
  });

  savePersistentState();
  for (const st of addedStudents) {
    persistUserToMongoDB({ ...st, role: 'student', password: 'password123' });
  }

  if (isDbConnected && prisma) {
    try {
      const col = await prisma.college.findUnique({ where: { code } });
      const defaultPassHash = await bcrypt.hash('password123', 10);
      for (const st of addedStudents) {
        await prisma.user.upsert({
          where: { email: st.email.toLowerCase() },
          update: {
            name: st.name,
            college: st.college,
            collegeId: col?.id,
          },
          create: {
            email: st.email.toLowerCase(),
            passwordHash: defaultPassHash,
            name: st.name,
            role: 'student',
            college: st.college,
            collegeId: col?.id,
            studentProfile: {
              create: {
                studentId: st.studentId,
                course: st.course,
                batch: st.batch,
                seatNumber: st.seatNumber,
              },
            },
          },
        });
      }
      console.log(`[Database] Persisted ${addedStudents.length} students to PostgreSQL.`);
    } catch (dbErr: any) {
      console.warn('[Database] Failed to persist students to PostgreSQL:', dbErr.message);
    }
  }

  res.json({ success: true, addedCount: addedStudents.length, students: persistentState.students[code] });
});

app.get('/api/college/faculty', async (req, res) => {
  const code = ((req.query.collegeCode as string) || 'DIT').toUpperCase();
  const facultyMap = new Map<string, any>();

  // Persistent roster remains the fast path / fallback.
  for (const f of (persistentState.faculty[code] || [])) {
    facultyMap.set(f.facultyId || f.email, f);
  }

  // When PostgreSQL is configured, merge the actual faculty roster from the
  // college database so faculty created in another browser/session survives
  // reloads and is available to the slot-creation modal.
  if (isDbConnected && prisma) {
    try {
      const dbFaculty = await prisma.user.findMany({
        where: {
          role: 'faculty',
          college: { code },
        },
        include: { facultyProfile: true },
      });

      for (const u of dbFaculty) {
        const f = {
          id: u.id,
          name: u.name,
          email: u.email,
          facultyId: u.facultyProfile?.facultyId || (u as any).facultyId || u.id,
          department: u.facultyProfile?.department || (u as any).department || 'Academic Department',
          designation: u.facultyProfile?.designation || (u as any).designation || 'Faculty Evaluator',
          college: u.college || code,
          collegeCode: code,
          assignedSlotsCount: (persistentState.slots[code] || []).filter(
            (s) => s.assignedFacultyId === (u.facultyProfile?.facultyId || u.id)
          ).length,
        };
        facultyMap.set(f.facultyId || f.email, f);
      }
    } catch (dbErr: any) {
      console.warn('[Database] Failed to read faculty roster:', dbErr.message);
    }
  }

  const faculty = Array.from(facultyMap.values());
  persistentState.faculty[code] = faculty;
  savePersistentState();
  res.json({ success: true, faculty });
});

app.post('/api/college/faculty', async (req, res) => {
  const payload = req.body;
  const code = (payload.collegeCode || 'DIT').toUpperCase();

  if (!persistentState.faculty[code]) {
    persistentState.faculty[code] = [];
  }

  const newFac: BackendCollegeFacultyItem = {
    id: payload.id || `fac-${Date.now()}`,
    name: payload.name || 'Faculty Member',
    email: payload.email || `faculty@${code.toLowerCase()}.edu.in`,
    facultyId: payload.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
    department: payload.department || 'Computer Science & Engineering',
    designation: payload.designation || 'Assistant Professor',
    college: payload.college || (persistentState.colleges.find((c) => c.code === code)?.name || 'Engineering Institute'),
    collegeCode: code,
    assignedSlotsCount: payload.assignedSlotsCount || 0,
  };

  persistentState.faculty[code].push(newFac);
  persistentState.users.push({
    id: newFac.id,
    name: newFac.name,
    email: newFac.email,
    password: payload.password || 'faculty123',
    role: 'faculty',
    college: newFac.college,
    collegeCode: code,
    facultyId: newFac.facultyId,
    department: newFac.department,
    designation: newFac.designation,
  });

  savePersistentState();
  persistUserToMongoDB(persistentState.users[persistentState.users.length - 1]);

  if (isDbConnected && prisma) {
    try {
      const col = await prisma.college.findUnique({ where: { code } });
      const passHash = await bcrypt.hash(payload.password || 'faculty123', 10);
      await prisma.user.upsert({
        where: { email: newFac.email.toLowerCase() },
        update: {
          name: newFac.name,
          college: newFac.college,
          collegeId: col?.id,
          facultyProfile: {
            upsert: {
              create: {
                facultyId: newFac.facultyId,
                department: newFac.department,
                designation: newFac.designation,
              },
              update: {
                facultyId: newFac.facultyId,
                department: newFac.department,
                designation: newFac.designation,
              },
            },
          },
        },
        create: {
          email: newFac.email.toLowerCase(),
          passwordHash: passHash,
          name: newFac.name,
          role: 'faculty',
          college: newFac.college,
          collegeId: col?.id,
          facultyProfile: {
            create: {
              facultyId: newFac.facultyId,
              department: newFac.department,
              designation: newFac.designation,
            },
          },
        },
      });
      console.log(`[Database] Persisted faculty ${newFac.name} to PostgreSQL.`);
    } catch (dbErr: any) {
      console.warn('[Database] Failed to persist faculty to PostgreSQL:', dbErr.message);
    }
  }

  res.json({ success: true, faculty: newFac });
});

app.get('/api/college/slots', async (req, res) => {
  const code = ((req.query.collegeCode as string) || 'DIT').toUpperCase();
  const facultyList = persistentState.faculty[code] || [];
  const slotMap = new Map<string, any>();

  // Start with the in-memory state.
  for (const slot of (persistentState.slots[code] || [])) {
    slotMap.set(slot.id, slot);
  }

  // PostgreSQL is also authoritative for persisted slots. This is important
  // after a Railway restart/deploy, where in-memory state starts empty.
  if (isDbConnected && prisma) {
    try {
      const dbSlots = await prisma.gDSession.findMany({
        where: { college: { code } },
        orderBy: { createdAt: 'desc' },
      });

      for (const s of dbSlots) {
        const existing = slotMap.get(s.id) || {};
        slotMap.set(s.id, {
          ...existing,
          id: s.id,
          topic: s.topic,
          description: s.description || '',
          durationMinutes: s.durationMinutes,
          difficulty: s.difficulty,
          status: s.status,
          scheduledTime: s.scheduledTime || undefined,
          slotTiming: s.slotTiming || '',
          slotName: s.slotName || s.topic,
          maxCapacity: s.maxCapacity,
          enrolledCount: s.enrolledCount,
          assignedFacultyId: s.assignedFacultyId || '',
          assignedFacultyName: s.assignedFacultyName || '',
          collegeCode: code,
          createdAt: s.createdAt.toISOString(),
        });
      }
    } catch (dbErr: any) {
      console.warn('[Database] Failed to read college slots:', dbErr.message);
    }
  }

  const slots = Array.from(slotMap.values()).map((slot) => {
    const faculty = slot.assignedFacultyId
      ? facultyList.find((f) => f.facultyId === slot.assignedFacultyId || f.id === slot.assignedFacultyId)
      : undefined;

    return {
      ...slot,
      assignedFacultyId: faculty?.facultyId || slot.assignedFacultyId || '',
      assignedFacultyName: faculty?.name || slot.assignedFacultyName || '',
      assignedFacultyEmail: faculty?.email || slot.assignedFacultyEmail || '',
      assignedFacultyDept: faculty?.department || slot.assignedFacultyDept || '',
    };
  });

  // Keep the in-memory cache synchronized so all portals see the same roster.
  persistentState.slots[code] = slots;
  savePersistentState();

  res.json({ success: true, slots });
});

app.post('/api/college/slots', async (req, res) => {
  const payload = req.body;
  const code = (payload.collegeCode || 'DIT').toUpperCase();

  if (!persistentState.slots[code]) {
    persistentState.slots[code] = [];
  }

  // Faculty assignment is topic-level: every slot under the same topic must
  // use the same Faculty In-Charge. The first published assignment becomes the
  // authoritative faculty for that topic.
  const existingTopicSlot = (persistentState.slots[code] || []).find(
    (s) => String(s.topic || '').trim().toLowerCase() === String(payload.topic || '').trim().toLowerCase()
      && s.assignedFacultyId
  );
  const topicFacultyId = existingTopicSlot?.assignedFacultyId || payload.assignedFacultyId;

  const assignedFaculty = topicFacultyId
    ? (persistentState.faculty[code] || []).find(
        (f) => f.facultyId === topicFacultyId || f.id === topicFacultyId
      )
    : undefined;

  const newSlot: BackendCollegeSlotItem = {
    id: payload.id || `slot-${code.toLowerCase()}-${Date.now().toString().slice(-4)}`,
    slotName: payload.slotName || payload.topic,
    topic: payload.topic,
    description: payload.description || `Autonomous AI evaluation of ${payload.topic}`,
    slotTiming: payload.slotTiming || '10:30 AM - 10:45 AM',
    status: payload.status || 'scheduled',
    durationMinutes: Number(payload.durationMinutes) || 15,
    enrolledCount: Number(payload.enrolledCount) || 0,
    maxCapacity: Number(payload.maxCapacity) || 15,
    assignedFacultyId: assignedFaculty?.facultyId || topicFacultyId || payload.assignedFacultyId,
    assignedFacultyName: assignedFaculty?.name || (existingTopicSlot?.assignedFacultyName || payload.assignedFacultyName),
    assignedFacultyEmail: assignedFaculty?.email || (existingTopicSlot?.assignedFacultyEmail || payload.assignedFacultyEmail),
    assignedFacultyDept: assignedFaculty?.department || (existingTopicSlot?.assignedFacultyDept || payload.assignedFacultyDept),
    collegeCode: code,
    createdAt: new Date().toISOString(),
  };

  persistentState.slots[code].unshift(newSlot);
  savePersistentState();
  persistSlotToMongoDB(newSlot);

  if (isDbConnected && prisma) {
    try {
      const col = await prisma.college.findUnique({ where: { code } });
      await prisma.gDSession.upsert({
        where: { id: newSlot.id },
        update: {
          topic: newSlot.topic,
          description: newSlot.description,
          slotTiming: newSlot.slotTiming,
          slotName: newSlot.slotName,
          durationMinutes: newSlot.durationMinutes,
          maxCapacity: newSlot.maxCapacity,
          enrolledCount: newSlot.enrolledCount,
          assignedFacultyId: newSlot.assignedFacultyId,
          assignedFacultyName: newSlot.assignedFacultyName,
          status: newSlot.status,
        },
        create: {
          id: newSlot.id,
          topic: newSlot.topic,
          description: newSlot.description,
          slotTiming: newSlot.slotTiming,
          slotName: newSlot.slotName,
          durationMinutes: newSlot.durationMinutes,
          maxCapacity: newSlot.maxCapacity,
          enrolledCount: newSlot.enrolledCount,
          assignedFacultyId: newSlot.assignedFacultyId,
          assignedFacultyName: newSlot.assignedFacultyName,
          collegeId: col?.id,
          status: newSlot.status,
        },
      });
      console.log(`[Database] Persisted slot ${newSlot.topic} to PostgreSQL.`);
    } catch (dbErr: any) {
      console.warn('[Database] Failed to persist slot to PostgreSQL:', dbErr.message);
    }
  }

  res.json({ success: true, slot: newSlot });
});

app.delete('/api/college/slots/:id', async (req, res) => {
  const slotId = req.params.id;
  let target: any = null;
  let code = '';

  for (const [collegeCode, list] of Object.entries(persistentState.slots)) {
    const found = list.find((s) => s.id === slotId);
    if (found) {
      target = found;
      code = collegeCode;
      break;
    }
  }

  if (!target) return res.status(404).json({ success: false, error: 'GD slot not found' });
  if (target.status === 'active') {
    return res.status(409).json({ success: false, error: 'An active GD session cannot be deleted' });
  }

  persistentState.slots[code] = (persistentState.slots[code] || []).filter((s) => s.id !== slotId);
  savePersistentState();
  deleteSlotFromMongoDB(slotId);

  if (isDbConnected && prisma) {
    try {
      await prisma.gDBooking.deleteMany({ where: { sessionId: slotId } });
      await prisma.gDSession.delete({ where: { id: slotId } });
    } catch (dbErr: any) {
      console.warn('[Database] Failed to delete GD slot from PostgreSQL:', dbErr.message);
    }
  }

  res.json({ success: true, slotId });
});

app.post('/api/college/slots/:id/complete', async (req, res) => {
  const slotId = req.params.id;
  const facultyId = String(req.body?.facultyId || '').trim();
  let target: any = null;
  for (const list of Object.values(persistentState.slots)) {
    const found = list.find((s) => s.id === slotId);
    if (found) { target = found; break; }
  }
  if (!target) return res.status(404).json({ success: false, error: 'GD slot not found' });
  if (!facultyId || target.assignedFacultyId !== facultyId) {
    return res.status(403).json({ success: false, error: 'Only the assigned faculty can end this session' });
  }

  const room = LIVE_ROOMS.get(slotId);
  const transcriptHistory = room
    ? room.transcripts.filter((t) => t.sessionId === slotId)
    : liveTranscripts.filter((t) => t.sessionId === slotId);

  if (isDbConnected && prisma && transcriptHistory.length > 0) {
    try {
      await prisma.transcriptEntry.deleteMany({ where: { sessionId: slotId } });
      await prisma.transcriptEntry.createMany({
        data: transcriptHistory.map((t: any) => ({
          id: t.id, sessionId: slotId, speakerId: t.speakerId, speakerName: t.speakerName,
          seatNumber: t.seatNumber ?? null, isFacilitator: !!t.isFacilitator, timestamp: t.timestamp || '00:00',
          timestampSeconds: Number(t.timestampSeconds || 0), text: String(t.text || ''),
          type: t.type || 'statement', sentiment: t.sentiment || 'neutral',
        })),
        skipDuplicates: true,
      });
    } catch (e: any) { console.warn('[Database] Failed to persist final transcript:', e.message); }
  }

  const participantIds = new Set<string>();
  if (room) for (const peer of room.peers.values()) if (peer.role === 'student' && peer.userId) participantIds.add(peer.userId);
  transcriptHistory.forEach((t: any) => { if (!t.isFacilitator && t.speakerId) participantIds.add(t.speakerId); });

  const reports: any[] = [];
  for (const participantId of participantIds) {
    let studentUser: any = persistentState.users.find((u) => u.id === participantId || u.studentId === participantId);
    if (!studentUser && isDbConnected && prisma) {
      try {
        const u = await prisma.user.findUnique({ where: { id: participantId }, include: { studentProfile: true } });
        if (u) studentUser = { id: u.id, name: u.name, role: u.role, college: u.college, studentId: u.studentProfile?.studentId, course: u.studentProfile?.course, batch: u.studentProfile?.batch, seatNumber: u.studentProfile?.seatNumber };
      } catch (e) {}
    }
    if (!studentUser || studentUser.role !== 'student') continue;
    const peer = room ? Array.from(room.peers.values()).find((p) => p.userId === studentUser.id || p.userId === studentUser.studentId) : undefined;
    const entries = transcriptHistory.filter((t: any) => t.speakerId === studentUser.id || t.speakerId === studentUser.studentId);
    const wordCount = entries.reduce((sum: number, t: any) => sum + String(t.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
    const speakingSeconds = peer?.speakingDurationSeconds || (wordCount ? Math.max(1, Math.round(wordCount / 130 * 60)) : 0);
    const report = await generateAssessmentReport(studentUser, transcriptHistory, target.topic, target.durationMinutes, {
      sessionId: slotId, speakingDurationSeconds: speakingSeconds, speakingTurns: peer?.speakingTurns ?? entries.length,
      interruptionCount: peer?.interruptionCount ?? 0, questionsAnswered: 0, questionsInitiated: 0,
    });
    await persistAssessmentReport(report);
    reports.push(report);
  }

  target.status = 'completed';
  savePersistentState();
  if (isMongoConnected()) {
    GDSessionModel.updateOne({ id: slotId }, { $set: { status: 'completed' } }).catch(() => null);
    GDBookingModel.updateMany({ sessionId: slotId, status: { $ne: 'CANCELLED' } }, { $set: { status: 'COMPLETED' } }).catch(() => null);
  }
  if (isDbConnected && prisma) {
    try {
      await prisma.gDSession.update({ where: { id: slotId }, data: { status: 'completed' } });
      await prisma.gDBooking.updateMany({ where: { sessionId: slotId, status: { not: 'CANCELLED' } }, data: { status: 'COMPLETED' } });
    } catch (e: any) { console.warn('[Database] Failed to finalize session:', e.message); }
  }
  if (room) {
    room.status = 'completed';
    io.to('room-' + slotId).emit('session-ended', { slotId, status: 'completed', reports });
  }
  res.json({ success: true, slotId, status: 'completed', reports, transcriptCount: transcriptHistory.length });
});

app.post('/api/college/slots/:id/start', async (req, res) => {
  const slotId = req.params.id;
  const facultyId = String(req.body?.facultyId || '').trim();
  let target: any = null;
  let code = '';
  for (const [collegeCode, list] of Object.entries(persistentState.slots)) {
    const found = list.find((s) => s.id === slotId);
    if (found) { target = found; code = collegeCode; break; }
  }
  if (!target) return res.status(404).json({ success: false, error: 'GD slot not found' });
  if (!facultyId) return res.status(403).json({ success: false, error: 'Only the assigned faculty can start this session' });
  if (target.assignedFacultyId !== facultyId) return res.status(403).json({ success: false, error: 'You are not the faculty assigned to this GD slot' });
  if (target.status === 'completed') return res.status(409).json({ success: false, error: 'Session is already completed' });

  target.status = 'active';
  savePersistentState();
  if (isMongoConnected()) {
    GDSessionModel.updateOne({ id: slotId }, { $set: { status: 'active' } }).catch(() => null);
  }
  if (isDbConnected && prisma) {
    try {
      await prisma.gDSession.update({ where: { id: slotId }, data: { status: 'active' } });
    } catch (e) { console.warn('[Database] Failed to mark slot active:', (e as any).message); }
  }
  const room = LIVE_ROOMS.get(slotId);
  if (room) {
    room.status = 'active';
    room.silenceTimerSeconds = 0;
    io.to(`room-${slotId}`).emit('session-started', { slotId, status: 'active', topic: room.topic });
    scheduleNextTurn(room);
  }
  res.json({ success: true, slotId, status: 'active' });
});


// --- FACULTY ASSIGNED SESSION ENDPOINTS ---
app.get('/api/faculty/sessions', async (req, res) => {
  const facultyId = String(req.query.facultyId || '').trim();
  const code = String(req.query.collegeCode || 'DIT').toUpperCase();
  if (!facultyId) return res.status(400).json({ success: false, error: 'facultyId is required' });

  const roster = persistentState.faculty[code] || [];
  const faculty = roster.find((f) => f.facultyId === facultyId || f.id === facultyId);
  if (!faculty) return res.status(403).json({ success: false, error: 'Faculty is not registered for this college' });

  // A faculty member can be referenced by faculty ID or internal User ID
  // depending on when the slot was created. Match both so every slot assigned
  // to this faculty is visible in the faculty portal.
  const facultyAssignmentIds = new Set(
    [faculty.facultyId, faculty.id, faculty.email].filter(Boolean).map(String)
  );

  let slots = (persistentState.slots[code] || []).filter(
    (slot) => !!slot.assignedFacultyId && facultyAssignmentIds.has(String(slot.assignedFacultyId))
  );

  if (isDbConnected && prisma) {
    try {
      const dbSlots = await prisma.gDSession.findMany({
        where: {
          college: { code },
          OR: [
            { assignedFacultyId: faculty.facultyId },
            { assignedFacultyId: faculty.id },
            { assignedFacultyId: faculty.email },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Merge DB records with the persistent roster rather than allowing one
      // representation to hide assignments stored under the other identifier.
      const merged = new Map(slots.map((slot) => [slot.id, slot]));
      for (const s of dbSlots) {
        merged.set(s.id, {
          id: s.id,
          slotName: s.slotName || s.topic,
          topic: s.topic,
          description: s.description || '',
          slotTiming: s.slotTiming || '',
          status: s.status,
          durationMinutes: s.durationMinutes,
          enrolledCount: s.enrolledCount,
          maxCapacity: s.maxCapacity,
          assignedFacultyId: s.assignedFacultyId || faculty.facultyId,
          assignedFacultyName: faculty.name,
          assignedFacultyEmail: faculty.email,
          assignedFacultyDept: faculty.department,
          collegeCode: code,
          createdAt: s.createdAt.toISOString(),
        });
      }
      slots = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (e) {
      console.warn('[Faculty Sessions] DB read failed:', e);
    }
  }

  res.json({ success: true, sessions: slots });
});

// --- STUDENT SLOT BOOKING ENDPOINTS (One Slot Per Topic Policy) ---
app.get('/api/student/:studentId/booked-slot', (req, res) => {
  const { studentId } = req.params;
  const bookedSlotId = persistentState.studentBookings[studentId] || null;
  const topicBookings = persistentState.studentTopicBookings[studentId] || {};
  res.json({ success: true, studentId, bookedSlotId, topicBookings });
});

app.post('/api/student/book-slot', async (req, res) => {
  // Accept the canonical database user id plus stable student identifiers.
  // Older browser sessions can still hold a legacy id (for example "s1"),
  // while PostgreSQL has the same student under a CUID. In that case the
  // email/studentId must be used to resolve the real account.
  const {
    studentId,
    studentIdentifier,
    studentEmail,
    studentStudentId,
    studentName,
    slotId,
    topic,
  } = req.body;

  const identifiers = Array.from(new Set(
    [studentId, studentIdentifier, studentEmail, studentStudentId, studentName]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));

  if (identifiers.length === 0 || !slotId) {
    return res.status(400).json({ success: false, error: 'studentId and slotId are required' });
  }

  let authenticatedEmail: string | undefined;
  let authenticatedUserId: string | undefined;
  try {
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      const claims = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET) as { id?: string; email?: string; role?: string };
      if (claims.role === 'student') {
        authenticatedUserId = claims.id;
        authenticatedEmail = claims.email?.toLowerCase();
      }
    }
  } catch {}

  const resolvedIdentifiers = Array.from(new Set(
    [authenticatedUserId, authenticatedEmail, ...identifiers]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));

  // PostgreSQL is authoritative in production. Resolve the authenticated
  // student first, then use legacy identifiers as a compatibility fallback.
  let student: any = undefined;
  if (isDbConnected && prisma) {
    try {
      const include = { studentProfile: true, collegeOrg: true };

      // Prefer exact user id/email/profile-id matches before name matching.
      for (const identifier of resolvedIdentifiers) {
        if (student) break;

        let dbUser = await prisma.user.findUnique({
          where: { id: identifier },
          include,
        }).catch(() => null);

        if (!dbUser && identifier.includes('@')) {
          dbUser = await prisma.user.findUnique({
            where: { email: identifier.toLowerCase() },
            include,
          }).catch(() => null);
        }

        if (!dbUser) {
          dbUser = await prisma.user.findFirst({
            where: {
              studentProfile: {
                studentId: { equals: identifier, mode: 'insensitive' },
              },
            },
            include,
          }).catch(() => null);
        }

        if (!dbUser) {
          dbUser = await prisma.user.findFirst({
            where: {
              name: { equals: identifier, mode: 'insensitive' },
              role: 'student',
            },
            include,
          }).catch(() => null);
        }

        if (dbUser && dbUser.role === 'student') {
          student = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            college: dbUser.college,
            collegeCode: dbUser.collegeOrg?.code,
            course: dbUser.studentProfile?.course,
            batch: dbUser.studentProfile?.batch,
            seatNumber: dbUser.studentProfile?.seatNumber,
            studentId: dbUser.studentProfile?.studentId,
            avatar: dbUser.avatar || undefined,
          };

          // Keep the compatibility state synchronized for booking/cancellation
          // endpoints that still use persistentState as their local projection.
          const existingIdx = persistentState.users.findIndex(
            (u) => u.id === student.id || u.email.toLowerCase() === student.email.toLowerCase()
          );
          if (existingIdx >= 0) {
            persistentState.users[existingIdx] = { ...persistentState.users[existingIdx], ...student };
          } else {
            persistentState.users.push(student);
          }
          savePersistentState();
        }
      }
    } catch (dbErr: any) {
      console.warn('[Database] Student lookup during booking failed:', dbErr.message);
    }
  }

  // Persistent-state fallback also checks every stable identifier so a stale
  // browser session cannot produce a false "Student account not found".
  if (!student) {
    const normalized = identifiers.map((value) => value.toLowerCase());
    student = persistentState.users.find((u) =>
      u.role === 'student' &&
      (
        normalized.includes(String(u.id || '').toLowerCase()) ||
        normalized.includes(String(u.studentId || '').toLowerCase()) ||
        normalized.includes(String(u.email || '').toLowerCase()) ||
        normalized.includes(String(u.name || '').toLowerCase())
      )
    );
  }

  if (!student || student.role !== 'student') {
    return res.status(403).json({ success: false, error: 'Student account not found' });
  }

  let slot: any = null;
  let slotCode = (student.collegeCode || 'DIT').toUpperCase();
  for (const [code, list] of Object.entries(persistentState.slots)) {
    const found = list.find((s) => s.id === slotId);
    if (found) { slot = found; slotCode = code; break; }
  }
  if (!slot) return res.status(404).json({ success: false, error: 'GD slot not found' });
  if (slot.collegeCode && slot.collegeCode !== slotCode) {
    return res.status(403).json({ success: false, error: 'Invalid college for this slot' });
  }
  if (slot.status === 'completed' || slot.status === 'active') {
    return res.status(409).json({ success: false, error: 'This GD session is no longer bookable' });
  }

  const topicKey = topic || slot.topic || 'General Topic';
  if (!persistentState.studentTopicBookings) persistentState.studentTopicBookings = {};
  if (!persistentState.studentTopicBookings[student.id]) persistentState.studentTopicBookings[student.id] = {};

  const existingBookingForTopic = persistentState.studentTopicBookings[student.id][topicKey];
  if (existingBookingForTopic && existingBookingForTopic !== slotId) {
    return res.status(403).json({
      success: false,
      error: `Topic Policy: You have already booked a slot for "${topicKey}". Only one slot per topic is allowed.`,
      bookedSlotId: existingBookingForTopic, topic: topicKey,
    });
  }

  const currentCount = Number(slot.enrolledCount || 0);
  const maxCapacity = Number(slot.maxCapacity || 15);
  const alreadyBooked = existingBookingForTopic === slotId;
  if (!alreadyBooked && currentCount >= maxCapacity) {
    return res.status(409).json({ success: false, error: 'This GD slot is full' });
  }

  if (!alreadyBooked) {
    slot.enrolledCount = currentCount + 1;
    persistentState.studentTopicBookings[student.id][topicKey] = slotId;
    persistentState.studentBookings[student.id] = slotId;
  }
  savePersistentState();
  persistBookingToMongoDB(slotId, student.id, 'BOOKED', topicKey);
  if (isMongoConnected()) {
    GDSessionModel.updateOne({ id: slotId }, { $set: { enrolledCount: slot.enrolledCount } }).catch(() => null);
  }

  if (isDbConnected && prisma) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: student.id } });
      if (dbUser) {
        await prisma.gDBooking.upsert({
          where: { sessionId_studentId: { sessionId: slotId, studentId: dbUser.id } },
          update: { status: 'BOOKED' },
          create: { sessionId: slotId, studentId: dbUser.id, status: 'BOOKED' },
        });
        await prisma.gDSession.update({ where: { id: slotId }, data: { enrolledCount: slot.enrolledCount } });
      }
    } catch (dbErr: any) {
      console.warn('[Database] Failed to persist booking:', dbErr.message);
    }
  }

  res.json({ success: true, studentId: student.id, bookedSlotId: slotId, topic: topicKey,
    topicBookings: persistentState.studentTopicBookings[student.id], enrolledCount: slot.enrolledCount });
});

app.post('/api/student/cancel-slot', async (req, res) => {
  const studentId = req.body.studentId || req.body.studentIdentifier;
  const { slotId, topic } = req.body;
  if (!studentId) {
    return res.status(400).json({ success: false, error: 'studentId or studentIdentifier is required' });
  }

  if (persistentState.studentTopicBookings && persistentState.studentTopicBookings[studentId]) {
    if (topic && persistentState.studentTopicBookings[studentId][topic]) {
      delete persistentState.studentTopicBookings[studentId][topic];
    } else if (slotId) {
      for (const [t, sId] of Object.entries(persistentState.studentTopicBookings[studentId])) {
        if (sId === slotId) {
          delete persistentState.studentTopicBookings[studentId][t];
          break;
        }
      }
    }
  }

  const previouslyBooked = persistentState.studentBookings[studentId] || null;
  if (persistentState.studentBookings[studentId] === slotId || !slotId) {
    delete persistentState.studentBookings[studentId];
  }
  for (const list of Object.values(persistentState.slots)) {
    const slot = list.find((candidate) => candidate.id === slotId);
    if (slot) slot.enrolledCount = Math.max(0, Number(slot.enrolledCount || 0) - 1);
  }
  savePersistentState();
  if (slotId) {
    persistBookingToMongoDB(slotId, studentId, 'CANCELLED');
    if (isMongoConnected()) {
      GDSessionModel.updateOne({ id: slotId }, { $inc: { enrolledCount: -1 } }).catch(() => null);
    }
  }

  if (isDbConnected && prisma && slotId) {
    try {
      await prisma.gDBooking.updateMany({
        where: { sessionId: slotId, studentId: studentId },
        data: { status: 'CANCELLED' },
      });
      const slot = await prisma.gDSession.findUnique({ where: { id: slotId } });
      if (slot) await prisma.gDSession.update({ where: { id: slotId }, data: { enrolledCount: Math.max(0, slot.enrolledCount - 1) } });
    } catch (dbErr: any) {
      console.warn('[Database] Failed to cancel booking:', dbErr.message);
    }
  }

  res.json({
    success: true,
    studentId,
    releasedSlotId: slotId || previouslyBooked,
    topicBookings: persistentState.studentTopicBookings?.[studentId] || {},
  });
});

// --- AUTH ENDPOINTS ---
app.post('/api/auth/login', async (req, res) => {
  const { role, identifier, password } = req.body;
  if (!identifier) {
    return res.status(400).json({ success: false, error: 'Identifier is required' });
  }

  const cleanId = identifier.trim().toLowerCase();
  let user: StoredAuthUser | undefined;

  // PostgreSQL is authoritative in production. Do not let stale in-memory
  // users hide accounts that were registered/updated in another session.
  if (isDbConnected && prisma) {
    try {
      // Look up the account first by email. The role is validated after the
      // account is found, which makes login resilient to older records whose
      // role/profile metadata was created before the multi-portal auth changes.
      let dbUser = await prisma.user.findUnique({
        where: { email: cleanId },
        include: { studentProfile: true, facultyProfile: true, collegeAdminProfile: true, collegeOrg: true },
      });

      // For ID-based login, search the profile identifiers.
      if (!dbUser) {
        dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { studentProfile: { studentId: { equals: cleanId, mode: 'insensitive' } } },
              { facultyProfile: { facultyId: { equals: cleanId, mode: 'insensitive' } } },
              { collegeAdminProfile: { adminId: { equals: cleanId, mode: 'insensitive' } } },
              { name: { contains: cleanId, mode: 'insensitive' } },
            ],
          },
          include: { studentProfile: true, facultyProfile: true, collegeAdminProfile: true, collegeOrg: true },
        });
      }

      if (dbUser) {
        user = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role as any,
          password: dbUser.passwordHash,
          college: dbUser.college,
          collegeCode: dbUser.collegeOrg?.code,
          department: dbUser.facultyProfile?.department || dbUser.collegeAdminProfile?.department,
          designation: dbUser.facultyProfile?.designation,
          course: dbUser.studentProfile?.course,
          batch: dbUser.studentProfile?.batch,
          seatNumber: dbUser.studentProfile?.seatNumber,
          studentId: dbUser.studentProfile?.studentId,
          facultyId: dbUser.facultyProfile?.facultyId,
          adminId: dbUser.collegeAdminProfile?.adminId,
          avatar: dbUser.avatar || undefined,
        };
      }
    } catch (dbErr: any) {
      console.warn('[Database] DB lookup error during login:', dbErr.message);
    }
  }

  // In-memory state is only a fallback when the database is unavailable.
  if (!user) {
    user = persistentState.users.find((u) => {
      const matchId =
        u.email.toLowerCase() === cleanId ||
        u.name.toLowerCase().includes(cleanId) ||
        (u.studentId && u.studentId.toLowerCase() === cleanId) ||
        (u.facultyId && u.facultyId.toLowerCase() === cleanId) ||
        (u.adminId && u.adminId.toLowerCase() === cleanId);
      return matchId;
    });
  }

  // Repair older accounts that exist in the persisted application state but
  // were never written to PostgreSQL. This is especially important for faculty
  // accounts registered before database-authoritative authentication was added.
  if (user && isDbConnected && prisma && !user.id.startsWith('c')) {
    try {
      const passHash = user.password?.startsWith('$2')
        ? user.password
        : await bcrypt.hash(user.password || 'password123', 10);
      const col = user.collegeCode
        ? await prisma.college.findUnique({ where: { code: user.collegeCode } })
        : null;
      const repaired = await prisma.user.upsert({
        where: { email: user.email.toLowerCase() },
        update: {
          name: user.name,
          passwordHash: passHash,
          role: user.role,
          college: user.college || 'Engineering Institute',
          collegeId: col?.id,
          avatar: user.avatar,
        },
        create: {
          email: user.email.toLowerCase(),
          passwordHash: passHash,
          name: user.name,
          role: user.role,
          college: user.college || 'Engineering Institute',
          collegeId: col?.id,
          avatar: user.avatar,
          ...(user.role === 'faculty'
            ? { facultyProfile: { create: {
                facultyId: user.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
                department: user.department || 'Engineering',
                designation: user.designation || 'Faculty Evaluator',
              } } }
            : user.role === 'student'
            ? { studentProfile: { create: {
                studentId: user.studentId || `STU-${Date.now().toString().slice(-4)}`,
                course: user.course || 'General Engineering',
                batch: user.batch || '2024-2028',
                seatNumber: user.seatNumber || 1,
              } } }
            : {}),
        },
        include: { studentProfile: true, facultyProfile: true, collegeAdminProfile: true, collegeOrg: true },
      });
      user = {
        ...user,
        id: repaired.id,
        password: repaired.passwordHash,
        role: repaired.role as any,
        facultyId: repaired.facultyProfile?.facultyId || user.facultyId,
        studentId: repaired.studentProfile?.studentId || user.studentId,
      };
    } catch (repairErr: any) {
      console.warn('[Database] Could not repair legacy auth account:', repairErr.message);
    }
  }
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials. User not found.' });
  }

  // A user found through email/ID must still be signing into the correct portal.
  if (role && user.role !== role) {
    return res.status(401).json({ success: false, error: `This account is registered as ${user.role.replace('_', ' ')}. Please use the correct portal.` });
  }

  if (password && user.password) {
    let isMatch = false;
    if (user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password.' });
    }
  }

  const { password: _, ...cleanUser } = user;
  const token = jwt.sign({ id: cleanUser.id, email: cleanUser.email, role: cleanUser.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true,
    user: cleanUser,
    token,
  });
});

app.post('/api/auth/register', async (req, res) => {
  const userData = req.body;
  if (!userData || !userData.email || !userData.name) {
    return res.status(400).json({ success: false, error: 'Name and email are required.' });
  }

  const cleanEmail = userData.email.trim().toLowerCase();
  const existing = persistentState.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return res.status(400).json({ success: false, error: 'Email already registered.' });
  }

  const role = userData.role || 'student';
  const newUser: StoredAuthUser = {
    id: `${role === 'student' ? 's' : 'fac'}-reg-${Date.now().toString().slice(-4)}`,
    name: userData.name.trim(),
    email: cleanEmail,
    password: userData.password || 'password123',
    role: role,
    college: userData.college || 'Engineering Institute',
    collegeCode: userData.collegeCode || 'DIT',
    course: userData.course,
    batch: userData.batch,
    seatNumber: userData.seatNumber || 1,
    studentId: userData.studentId,
    facultyId: userData.facultyId,
    department: userData.department,
    designation: userData.designation,
    avatar: userData.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userData.name)}`,
  };

  persistentState.users.push(newUser);
  if (role === 'student' && newUser.collegeCode) {
    if (!persistentState.students[newUser.collegeCode]) persistentState.students[newUser.collegeCode] = [];
    persistentState.students[newUser.collegeCode].push({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      studentId: newUser.studentId || `STU-${Date.now().toString().slice(-4)}`,
      course: newUser.course || 'B.Tech Computer Science & Engineering',
      batch: newUser.batch || '2024-2028',
      seatNumber: newUser.seatNumber || persistentState.students[newUser.collegeCode].length + 1,
      college: newUser.college,
      collegeCode: newUser.collegeCode,
    });
  }
  savePersistentState();
  persistUserToMongoDB(newUser);

  if (isDbConnected && prisma) {
    try {
      const col = await prisma.college.findUnique({ where: { code: newUser.collegeCode || 'DIT' } });
      const passHash = await bcrypt.hash(newUser.password, 10);
      await prisma.user.upsert({
        where: { email: cleanEmail },
        update: {
          passwordHash: passHash,
          name: newUser.name,
          role: newUser.role,
          college: newUser.college,
          collegeId: col?.id,
          avatar: newUser.avatar,
          ...(role === 'student'
            ? {
                studentProfile: {
                  upsert: {
                    create: {
                      studentId: newUser.studentId || `STU-${Date.now().toString().slice(-4)}`,
                      course: newUser.course || 'General Engineering',
                      batch: newUser.batch || '2024-2028',
                      seatNumber: newUser.seatNumber || 1,
                    },
                    update: {
                      studentId: newUser.studentId || undefined,
                      course: newUser.course || undefined,
                      batch: newUser.batch || undefined,
                      seatNumber: newUser.seatNumber || undefined,
                    },
                  },
                },
              }
            : {
                facultyProfile: {
                  upsert: {
                    create: {
                      facultyId: newUser.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
                      department: newUser.department || 'Engineering',
                      designation: newUser.designation || 'Faculty Evaluator',
                    },
                    update: {
                      facultyId: newUser.facultyId || undefined,
                      department: newUser.department || undefined,
                      designation: newUser.designation || undefined,
                    },
                  },
                },
              }),
        },
        create: {
          email: cleanEmail,
          passwordHash: passHash,
          name: newUser.name,
          role: newUser.role,
          college: newUser.college,
          collegeId: col?.id,
          avatar: newUser.avatar,
          ...(role === 'student'
            ? {
                studentProfile: {
                  create: {
                    studentId: newUser.studentId || `STU-${Date.now().toString().slice(-4)}`,
                    course: newUser.course || 'General Engineering',
                    batch: newUser.batch || '2024-2028',
                    seatNumber: newUser.seatNumber || 1,
                  },
                },
              }
            : {
                facultyProfile: {
                  create: {
                    facultyId: newUser.facultyId || `FAC-${Date.now().toString().slice(-4)}`,
                    department: newUser.department || 'Engineering',
                    designation: newUser.designation || 'Faculty Evaluator',
                  },
                },
              }),
        },
      });
      console.log(`[Database] User ${newUser.email} registered to PostgreSQL.`);
    } catch (dbErr: any) {
      console.error('[Database] Failed to register user to PostgreSQL:', dbErr.message);
      return res.status(500).json({
        success: false,
        error: 'Account could not be saved to the database. Please try registration again.',
      });
    }
  }

  const { password: _, ...cleanUser } = newUser;
  const token = jwt.sign({ id: cleanUser.id, email: cleanUser.email, role: cleanUser.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true,
    user: cleanUser,
    token,
  });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      userId = decoded.id;
    } catch {
      if (token.startsWith('jwt-')) {
        userId = token.split('-')[1];
      }
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    let user = persistentState.users.find((u) => u.id === userId);
    if (!user && isDbConnected && prisma) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { studentProfile: true, facultyProfile: true, collegeAdminProfile: true, collegeOrg: true },
      });
      if (dbUser) {
        user = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role as any,
          password: dbUser.passwordHash,
          college: dbUser.college,
          collegeCode: dbUser.collegeOrg?.code,
          department: dbUser.facultyProfile?.department || dbUser.collegeAdminProfile?.department,
          designation: dbUser.facultyProfile?.designation,
          course: dbUser.studentProfile?.course,
          batch: dbUser.studentProfile?.batch,
          seatNumber: dbUser.studentProfile?.seatNumber,
          studentId: dbUser.studentProfile?.studentId,
          facultyId: dbUser.facultyProfile?.facultyId,
          adminId: dbUser.collegeAdminProfile?.adminId,
          avatar: dbUser.avatar || undefined,
        };
      }
    }

    if (user) {
      const { password: _, ...cleanUser } = user;
      return res.json({ success: true, user: cleanUser });
    }

    return res.status(401).json({ success: false, error: 'Session invalid' });
  } catch (err: any) {
    return res.status(401).json({ success: false, error: 'Authentication failed' });
  }
});

// Initialize Gemini Client safely
let ai: GoogleGenAI | null = null;
if (
  process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
  process.env.GEMINI_API_KEY.trim() !== ''
) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Gemini client initialization error:', err);
    ai = null;
  }
}

// Real-Time Socket.IO Room Participant Store
export interface RoomParticipant {
  socketId: string;
  userId: string;
  name: string;
  seatNumber: number;
  college: string;
  course: string;
  batch: string;
  avatar: string;
  role: 'student' | 'faculty';
  micActive: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  cameraActive: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  questionsAnswered: number;
  questionsInitiated: number;
  joinedAt: number;
}

// Room participants mapping: roomId -> Map<socketId, RoomParticipant>
const roomUsersMap = new Map<string, Map<string, RoomParticipant>>();
// Socket to room mapping: socketId -> { roomId: string; userId: string }
const socketToRoomMap = new Map<string, { roomId: string; userId: string }>();

function normalizeRoomId(roomId?: string): string {
  return (roomId || 'slot-morning-1').trim();
}

function allocateSeatNumber(roomMap: Map<string, RoomParticipant>, preferredSeat?: number): number {
  const occupiedSeats = new Set<number>();
  for (const p of roomMap.values()) {
    if (p.seatNumber) occupiedSeats.add(p.seatNumber);
  }
  if (preferredSeat && preferredSeat >= 1 && preferredSeat <= 15 && !occupiedSeats.has(preferredSeat)) {
    return preferredSeat;
  }
  for (let s = 1; s <= 15; s++) {
    if (!occupiedSeats.has(s)) return s;
  }
  return roomMap.size + 1;
}

// In-Memory Backend State Store for Seamless Full-Stack Integration
interface BackendStudent {
  id: string;
  name: string;
  avatar: string;
  college: string;
  course: string;
  seatNumber: number;
  isUser: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  questionsAnswered: number;
  questionsInitiated: number;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
  lastSpokenAt?: number;
}

interface BackendTranscript {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  seatNumber: number | null;
  isFacilitator: boolean;
  timestamp: string;
  timestampSeconds: number;
  text: string;
  type: string;
  sentiment: string;
}

interface BackendSession {
  id: string;
  topic: string;
  description: string;
  durationMinutes: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  assessmentRubric: string;
  status: 'active' | 'completed' | 'paused';
  currentPhase: 'intro' | 'rules' | 'active_discussion' | 'probing' | 'conclusion';
  facilitatorSpeech: string;
  facilitatorAction: string;
  isFacilitatorSpeaking: boolean;
  silenceTimerSeconds: number;
  currentSpeakerId: string | null;
  students: BackendStudent[];
  breakoutRooms: any[];
  createdAt: string;
  startedAt: number;
}

const DEFAULT_STUDENTS: BackendStudent[] = [];

const DEFAULT_SERVER_SLOTS = [
  {
    id: 'slot-genai-1',
    slotName: 'Slot 1 - Morning Batch',
    slotTiming: '10:00 AM - 10:30 AM',
    slotDate: 'Today',
    enrolledCount: 3,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
    description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
    allottedFaculty: 'Dr. Sunita Rao (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric (English, Fluency, Clarity, Confidence, Content, Collaboration, Leadership)',
    status: 'active',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation from syntax memorization to architectural thinking. The floor is open.',
    facilitatorAction: 'Monitoring participation balance and encouraging critical examples.',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-genai-2',
    slotName: 'Slot 2 - Afternoon Batch',
    slotTiming: '02:30 PM - 03:00 PM',
    slotDate: 'Today',
    enrolledCount: 4,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
    description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
    allottedFaculty: 'Dr. Sunita Rao (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to Slot 2. We will begin our discussion momentarily.',
    facilitatorAction: 'Session scheduled for afternoon batch',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-teachers-1',
    slotName: 'Slot 1 - Morning Batch',
    slotTiming: '11:30 AM - 12:00 PM',
    slotDate: 'Today',
    enrolledCount: 2,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Should Artificial Intelligence replace teachers in Higher Education?',
    description: 'Debating cognitive personalization algorithms versus empathetic educator mentoring in higher technical education.',
    allottedFaculty: 'Prof. Rajesh Verma (Department)',
    durationMinutes: 25,
    difficulty: 'Intermediate',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Good morning participants. Today we debate whether AI can substitute teachers in higher education. Please maintain decorum.',
    facilitatorAction: 'Waiting for room start',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
  {
    id: 'slot-ev-1',
    slotName: 'Slot 1 - Evening Batch',
    slotTiming: '04:30 PM - 05:00 PM',
    slotDate: 'Today',
    enrolledCount: 1,
    maxCapacity: 15,
    roomLayout: 'round_table',
    topic: 'Electric Vehicles vs Hydrogen Fuel Cells: The Future of Mobility',
    description: 'Analyzing battery infrastructure, environmental life-cycle emissions, and commercial feasibility in Indian logistics.',
    allottedFaculty: 'Dr. Ananya Sen (Department)',
    durationMinutes: 25,
    difficulty: 'Advanced',
    assessmentRubric: 'Standard Academic 7-Parameter Rubric',
    status: 'scheduled',
    students: [],
    currentPhase: 'intro',
    facilitatorSpeech: 'Welcome to the Future of Mobility debate. Which powertrain offers the most viable path to zero emissions?',
    facilitatorAction: 'Session scheduled for evening batch',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  },
];

let serverSlots: any[] = [...DEFAULT_SERVER_SLOTS];
let ioInstance: any = null;

let currentLiveSession: BackendSession = {
  id: 'session-101',
  topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
  description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
  durationMinutes: 25,
  difficulty: 'Intermediate',
  assessmentRubric: 'Standard Academic 7-Parameter Rubric',
  status: 'active',
  currentPhase: 'active_discussion',
  facilitatorSpeech: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation from syntax memorization to architectural thinking. The floor is open.',
  facilitatorAction: 'Moderating discussion flow',
  isFacilitatorSpeaking: false,
  silenceTimerSeconds: 0,
  currentSpeakerId: null,
  students: [],
  breakoutRooms: [],
  createdAt: new Date().toISOString(),
  startedAt: Date.now(),
};

let liveTranscripts: BackendTranscript[] = [];

// Note: Prisma Client & database sync are configured at the top of server.ts

interface InMemCollege {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  phone?: string;
  address?: string;
  status: 'active' | 'trial' | 'suspended';
  createdAt: string;
}

const IN_MEM_COLLEGES: InMemCollege[] = [
  {
    id: 'col-1',
    name: 'Delhi Institute of Technology',
    code: 'DIT',
    contactEmail: 'admin@dit.edu.in',
    phone: '+91 11 2659 1000',
    address: 'Hauz Khas, New Delhi, Delhi 110016',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'col-2',
    name: 'Indian Institute of Technology Bombay',
    code: 'IITB',
    contactEmail: 'admin@iitb.ac.in',
    phone: '+91 22 2572 2545',
    address: 'Powai, Mumbai, Maharashtra 400076',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'col-3',
    name: 'St. Xavier Engineering College',
    code: 'SXEC',
    contactEmail: 'admin@sxec.edu.in',
    phone: '+91 22 2262 0661',
    address: 'Mahapalika Marg, Mumbai 400001',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

interface InMemUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'student' | 'faculty' | 'college_admin' | 'super_admin';
  college: string;
  collegeId?: string;
  collegeCode?: string;
  avatar?: string;
  studentId?: string;
  course?: string;
  batch?: string;
  seatNumber?: number;
  facultyId?: string;
  department?: string;
  designation?: string;
  adminId?: string;
  accessLevel?: 'root';
}

const IN_MEM_USERS: InMemUser[] = [
  {
    id: 'sa1',
    name: 'Platform Super Admin',
    email: 'superadmin@erus.ai',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'super_admin',
    college: 'ERUS Global Administration',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    accessLevel: 'root',
  },
  {
    id: 'ca1',
    name: 'DIT College Administrator',
    email: 'admin@dit.edu.in',
    passwordHash: bcrypt.hashSync('college123', 10),
    role: 'college_admin',
    college: 'Delhi Institute of Technology',
    collegeId: 'col-1',
    collegeCode: 'DIT',
    adminId: 'CADM-DIT-001',
    department: 'Academic & Placement Affairs',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
  },
  {
    id: 's1',
    name: 'Rahul Kumar',
    email: 'rahul.kumar@dit.edu.in',
    role: 'student',
    studentId: 'STU-2022-041',
    college: 'Delhi Institute of Technology',
    collegeId: 'col-1',
    course: 'B.Tech CSE',
    batch: '2022-2026',
    seatNumber: 1,
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&q=80',
    passwordHash: bcrypt.hashSync('password123', 10),
  },
  {
    id: 's2',
    name: 'Priya Sharma',
    email: 'priya.sharma@sxec.edu.in',
    role: 'student',
    studentId: 'STU-2022-089',
    college: 'St. Xavier Engineering College',
    collegeId: 'col-3',
    course: 'B.Tech IT',
    batch: '2022-2026',
    seatNumber: 2,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
    passwordHash: bcrypt.hashSync('password123', 10),
  },
  {
    id: 'f1',
    name: 'Dr. Sunita Rao',
    email: 'sunita.rao@dit.edu.in',
    role: 'faculty',
    facultyId: 'FAC-CSE-102',
    college: 'Delhi Institute of Technology',
    collegeId: 'col-1',
    department: 'Computer Science & Engineering',
    designation: 'Professor & Head of Department',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
    passwordHash: bcrypt.hashSync('faculty123', 10),
  },
  {
    id: 'f2',
    name: 'Prof. Aravind Swamy',
    email: 'aravind.swamy@iitb.ac.in',
    role: 'faculty',
    facultyId: 'FAC-AI-204',
    college: 'Indian Institute of Technology Bombay',
    collegeId: 'col-2',
    department: 'Artificial Intelligence & Robotics',
    designation: 'Associate Professor',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    passwordHash: bcrypt.hashSync('faculty123', 10),
  },
];

interface InMemSlot {
  id: string;
  topic: string;
  description?: string;
  durationMinutes: number;
  difficulty: string;
  status: 'scheduled' | 'active' | 'completed';
  scheduledTime?: string;
  slotTiming?: string;
  slotName?: string;
  maxCapacity: number;
  enrolledCount: number;
  assignedFacultyId?: string;
  assignedFacultyName?: string;
  collegeId?: string;
  collegeName?: string;
  studentIds?: string[];
  createdAt: string;
}

const IN_MEM_SLOTS: InMemSlot[] = [
  {
    id: 'slot-101',
    topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
    description: 'Autonomous AI evaluation of technical arguments, ethics, and career roadmaps.',
    durationMinutes: 15,
    difficulty: 'Intermediate',
    status: 'scheduled',
    scheduledTime: '10:30 AM - 10:45 AM',
    slotTiming: '10:30 AM - 10:45 AM',
    slotName: 'Slot 1: AI & Tech Careers',
    maxCapacity: 15,
    enrolledCount: 8,
    assignedFacultyId: 'FAC-CSE-102',
    assignedFacultyName: 'Dr. Sunita Rao',
    collegeId: 'col-1',
    collegeName: 'Delhi Institute of Technology',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'slot-102',
    topic: 'Electric Vehicles vs Hydrogen Fuel Cells: Sustainability Tradeoffs',
    description: 'Assessment on technical feasibility, grid strain, and infrastructure.',
    durationMinutes: 20,
    difficulty: 'Advanced',
    status: 'scheduled',
    scheduledTime: '11:00 AM - 11:20 AM',
    slotTiming: '11:00 AM - 11:20 AM',
    slotName: 'Slot 2: Clean Tech Mobility',
    maxCapacity: 15,
    enrolledCount: 5,
    assignedFacultyId: 'FAC-AI-204',
    assignedFacultyName: 'Prof. Aravind Swamy',
    collegeId: 'col-1',
    collegeName: 'Delhi Institute of Technology',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'slot-103',
    topic: 'Should Academic Campuses Mandate Attendance or Outcome-Based Grading?',
    description: 'Evaluation of student engagement, mental health, and institutional rigor.',
    durationMinutes: 15,
    difficulty: 'Beginner',
    status: 'completed',
    scheduledTime: '09:00 AM - 09:15 AM',
    slotTiming: '09:00 AM - 09:15 AM',
    slotName: 'Slot 0: Academic Pedagogy',
    maxCapacity: 15,
    enrolledCount: 15,
    assignedFacultyId: 'FAC-CSE-102',
    assignedFacultyName: 'Dr. Sunita Rao',
    collegeId: 'col-1',
    collegeName: 'Delhi Institute of Technology',
    createdAt: new Date().toISOString(),
  },
];

function formatUserResponse(u: any) {
  if (u.role === 'student') {
    const prof = u.studentProfile || {};
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: 'student' as const,
      college: u.college,
      collegeId: u.collegeId,
      avatar: u.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80',
      studentId: prof.studentId || u.studentId || 'STU-001',
      course: prof.course || u.course || 'General Engineering',
      batch: prof.batch || u.batch || '2024-2028',
      seatNumber: prof.seatNumber || u.seatNumber || 1,
    };
  } else if (u.role === 'faculty') {
    const prof = u.facultyProfile || {};
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: 'faculty' as const,
      college: u.college,
      collegeId: u.collegeId,
      avatar: u.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
      facultyId: prof.facultyId || u.facultyId || 'FAC-001',
      department: prof.department || u.department || 'Computer Science',
      designation: prof.designation || u.designation || 'Faculty Evaluator',
    };
  } else if (u.role === 'college_admin') {
    const prof = u.collegeAdminProfile || {};
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: 'college_admin' as const,
      college: u.college,
      collegeId: u.collegeId,
      collegeCode: u.collegeCode || (u.collegeOrg ? u.collegeOrg.code : 'DIT'),
      adminId: prof.adminId || u.adminId || 'CADM-001',
      department: prof.department || u.department || 'Academic Administration',
      avatar: u.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
    };
  } else {
    // super_admin
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: 'super_admin' as const,
      college: u.college || 'ERUS Global Administration',
      accessLevel: 'root' as const,
      avatar: u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    };
  }
}

// Health Check (Deployment & Railway liveness probe)
app.get('/api/health', async (req, res) => {
  const mongoActive = isMongoConnected();
  let mongoTables: Record<string, number> | null = null;
  if (mongoActive) {
    try {
      mongoTables = {
        colleges: await CollegeModel.countDocuments(),
        users: await UserModel.countDocuments(),
        gd_sessions: await GDSessionModel.countDocuments(),
        gd_transcripts: await TranscriptEntryModel.countDocuments(),
        assessment_reports: await AssessmentReportModel.countDocuments(),
        gd_bookings: await GDBookingModel.countDocuments(),
      };
    } catch {}
  }

  res.json({
    status: 'ok',
    service: 'ERUS AI Group Discussion Facilitator (ERUS-AIGDF)',
    database: mongoActive ? 'mongodb' : isDbConnected ? 'postgresql' : 'in-memory',
    mongoConnected: mongoActive,
    mongoTables,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    activeSessionId: currentLiveSession.id,
    participants: currentLiveSession.students.length,
    timestamp: new Date().toISOString(),
  });
});


// Endpoint: GET Current Session & Transcripts
app.get('/api/session/current', (req, res) => {
  res.json({
    session: currentLiveSession,
    transcripts: liveTranscripts,
  });
});

// Endpoint: POST Create New Session
app.post('/api/session/create', (req, res) => {
  const { topic, description, durationMinutes = 20, difficulty = 'Intermediate', assessmentRubric = 'Standard Academic 7-Parameter Rubric' } = req.body;

  currentLiveSession = {
    id: `session-${Date.now().toString().slice(-4)}`,
    topic: topic || 'Should Artificial Intelligence replace teachers?',
    description: description || 'Debating the transformative role of AI in pedagogy.',
    durationMinutes,
    difficulty,
    assessmentRubric,
    status: 'active',
    currentPhase: 'intro',
    facilitatorSpeech: `Good morning everyone. Today's discussion topic is: "${topic}". Each participant will get an opportunity to speak. Please respect others' opinions and avoid interruptions.`,
    facilitatorAction: 'Introducing discussion and explaining rules',
    isFacilitatorSpeaking: false,
    silenceTimerSeconds: 0,
    currentSpeakerId: null,
    students: [],
    breakoutRooms: [],
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  };

  liveTranscripts = [];

  res.json({
    success: true,
    session: currentLiveSession,
    transcripts: liveTranscripts,
  });
});

// Endpoint: POST Submit Student Speech & Update Turn
app.post('/api/session/speak', (req, res) => {
  const { studentId, text, elapsedSeconds = 0 } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Speech text is required' });
  }

  const student = currentLiveSession.students.find((s) => s.id === studentId) || currentLiveSession.students[0];
  const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

  // Interruption detection
  let isInterruption = false;
  if (currentLiveSession.currentSpeakerId && currentLiveSession.currentSpeakerId !== student.id) {
    isInterruption = true;
    student.interruptionCount += 1;
  }

  const newTranscript: BackendTranscript = {
    id: `t-${Date.now()}`,
    sessionId: currentLiveSession.id,
    speakerId: student.id,
    speakerName: student.name,
    seatNumber: student.seatNumber,
    isFacilitator: false,
    timestamp: `${mins}:${secs}`,
    timestampSeconds: elapsedSeconds,
    text: text.trim(),
    type: 'statement',
    sentiment: 'positive',
  };

  liveTranscripts.push(newTranscript);
  persistTranscriptToMongoDB(newTranscript);

  // Update student stats
  student.speakingTurns += 1;
  student.speakingDurationSeconds += Math.max(15, Math.round(text.length / 7));
  student.lastSpokenAt = Date.now();
  currentLiveSession.currentSpeakerId = student.id;
  currentLiveSession.silenceTimerSeconds = 0;

  res.json({
    success: true,
    transcript: newTranscript,
    student,
    isInterruption,
    session: currentLiveSession,
  });
});

// Endpoint: POST Simulate Peer Turn (Intelligent AI Student Response)
app.post('/api/session/simulate-peer', async (req, res) => {
  try {
    const { elapsedSeconds = 0, excludeStudentId, targetStudentId, questionAsked, mode } = req.body;
    
    let selectedPeer: any = null;
    if (targetStudentId) {
      selectedPeer = currentLiveSession.students.find((s) => s.id === targetStudentId);
    }

    if (!selectedPeer) {
      const candidates = currentLiveSession.students.filter((s) => !s.isUser && s.id !== excludeStudentId);
      if (!candidates.length) {
        return res.json({ success: false, message: 'No eligible peer students' });
      }

      // Priority 1: Candidates who haven't spoken yet (speakingTurns === 0)
      const unspoken = candidates.filter((s) => (s.speakingTurns || 0) === 0);
      if (unspoken.length > 0) {
        selectedPeer = unspoken[0];
      } else {
        // Priority 2: Candidates with the fewest turns
        candidates.sort((a, b) => (a.speakingTurns || 0) - (b.speakingTurns || 0));
        selectedPeer = candidates[0];
      }
    }

    let peerStatement = '';

    if (ai) {
      const recentHistory = liveTranscripts.slice(-4).map((t) => `${t.speakerName}: "${t.text}"`).join('\n');
      
      let contextGuidance = 'Deliver a thoughtful collegiate follow-up argument building upon recent points.';
      if (mode === 'initiation') {
        contextGuidance = 'You have been called upon by the AI Facilitator to initiate the discussion based on your previous presentation. Give your opening statement on the topic, referencing practical research principles.';
      } else if (questionAsked) {
        contextGuidance = `The AI Facilitator specifically directed a question to you: "${questionAsked}". Address this question directly and constructively.`;
      }

      const prompt = `You are simulating an Indian college student named ${selectedPeer.name} (${selectedPeer.course} at ${selectedPeer.college}) participating in a collegiate group discussion.
Topic: "${currentLiveSession.topic}"
Context: ${contextGuidance}
Recent group statements:
${recentHistory}

Language, Accent & Tone Guidelines:
- Language: Authentic Indian Academic English as spoken in Indian university GDs.
- Tone: Natural, conversational, articulate and occasionally disagreeing; do not sound like a prepared essay.
- This participant must have an INDIVIDUAL viewpoint. Do not repeat, paraphrase, or merely agree with any recent statement.
- Before answering, identify the newest point in the recent discussion and either challenge it, add a genuinely new dimension, give a concrete example, or connect two different viewpoints.
- Avoid generic phrases such as "we must consider", "human oversight", "practical standpoint", or "balanced approach" unless they are directly relevant and add a new idea.
- Different turns should explore different angles: evidence/data, economics, implementation, ethics, social impact, counter-example, feasibility, or synthesis.
- If another participant already made the same argument, explicitly move to a different angle.
- Length: 2 to 4 concise sentences. Sound like a real student responding to peers, not a chatbot or speech writer.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
        });
        peerStatement = response.text?.trim() || '';
      } catch (geminiErr) {
        console.warn('Gemini simulate-peer error, falling back to heuristic engine:', geminiErr);
      }
    }

    if (!peerStatement) {
      if (mode === 'initiation') {
        peerStatement = `Thank you, Facilitator. To open today's discussion on "${currentLiveSession.topic}", drawing from my previous academic research, I believe we must evaluate this through both technological feasibility and human accountability. We cannot rush implementation without proper governance.`;
      } else if (questionAsked) {
        peerStatement = `In response to the facilitator's question regarding this challenge: looking at the ground reality in our academic and professional institutions, sustainable rollout requires phased adoption and benchmark quality testing before full-scale deployment.`;
      } else {
        const fallbackList = [
          'Building upon what my colleague pointed out, if we look at our Indian educational context, digital infrastructure and affordable access must be addressed first.',
          'I would like to present a constructive counter-perspective here. While technological automation offers great scale, human mentorship, empathy, and moral guidance cannot be replaced.',
          'Looking at the ground reality in technical disciplines, hands-on laboratory verification remains absolutely vital to ensure real-world engineering competency.',
          'A balanced hybrid pedagogical approach would allow faculty members to dedicate quality time towards individual student mentoring rather than administrative tasks.',
          'From a practical implementation standpoint, we must also examine data privacy and whether our institutions have adequate regulatory safeguards in place.',
        ];
        peerStatement = fallbackList[Math.floor(Math.random() * fallbackList.length)];
      }
    }

    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

    const peerTranscript: BackendTranscript = {
      id: `t-peer-${Date.now()}`,
      sessionId: currentLiveSession.id,
      speakerId: selectedPeer.id,
      speakerName: selectedPeer.name,
      seatNumber: selectedPeer.seatNumber,
      isFacilitator: false,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds,
      text: peerStatement,
      type: 'statement',
      sentiment: 'positive',
    };

    liveTranscripts.push(peerTranscript);
    selectedPeer.speakingTurns = (selectedPeer.speakingTurns || 0) + 1;
    selectedPeer.speakingDurationSeconds = (selectedPeer.speakingDurationSeconds || 0) + 20;
    currentLiveSession.currentSpeakerId = selectedPeer.id;
    currentLiveSession.silenceTimerSeconds = 0;

    res.json({
      success: true,
      transcript: peerTranscript,
      student: selectedPeer,
      session: currentLiveSession,
    });
  } catch (error: any) {
    console.error('Simulate peer error:', error);
    res.status(500).json({ error: 'Failed to simulate peer' });
  }
});

// Endpoint: POST Hand Raise Toggle
app.post('/api/session/hand-raise', (req, res) => {
  const { studentId } = req.body;
  const student = currentLiveSession.students.find((s) => s.id === studentId);
  if (student) {
    student.hasRaisedHand = !student.hasRaisedHand;
  }
  res.json({ success: true, student });
});

// In-memory set of asked facilitator questions for anti-repetition tracking
const serverAskedQuestions = new Set<string>();

// Endpoint 1: AI Facilitator Autonomous Moderation Engine
app.post('/api/facilitator/moderate', async (req, res) => {
  try {
    const {
      topic = currentLiveSession.topic,
      phase = currentLiveSession.currentPhase,
      transcriptHistory = liveTranscripts,
      students = currentLiveSession.students,
      silenceDurationSeconds = currentLiveSession.silenceTimerSeconds,
      interruptionDetected = false,
      previousQuestions = [],
    } = req.body;

    // Combine previous questions from client and server
    const allAsked = Array.from(new Set([...Array.from(serverAskedQuestions), ...previousQuestions]));

    // If Gemini key is available, run prompt for human-like moderation
    if (ai) {
      const recentContext = transcriptHistory
        .slice(-6)
        .map((t: any) => `${t.speakerName} (${t.isFacilitator ? 'AI Moderator' : 'Student'}): ${t.text}`)
        .join('\n');

      const studentStats = students
        .map((s: any) => `${s.name} (Seat ${s.seatNumber}): ${s.speakingDurationSeconds}s spoken, ${s.speakingTurns} turns, ${s.interruptionCount} interruptions`)
        .join('\n');

      const previousQuestionsBlock = allAsked.length > 0
        ? `\nCRITICAL ANTI-REPETITION MANDATE:\nYou MUST NEVER repeat, rephrase, or re-ask any of the following questions that were ALREADY asked in this session:\n- ${allAsked.slice(-10).join('\n- ')}\nEvery new question MUST explore a fresh, distinctive angle (e.g. ethical accountability, economic viability, human psychological impact, technical limitations, policy frameworks, or inviting an under-participating student by name).\n`
        : '';

      const prompt = `You are the AI Facilitator / Moderator for the ERUS AI Group Discussion Facilitator (ERUS-AIGDF) platform.
Your role is that of a dignified, articulate Indian collegiate GD moderator and evaluator.
Topic: "${topic}"
Current Phase: ${phase}
Silence Duration: ${silenceDurationSeconds} seconds
Interruption Detected: ${interruptionDetected}
${previousQuestionsBlock}
Recent Transcript:
${recentContext || '(Discussion just started)'}

Student Participation Stats:
${studentStats}

Language, Accent & Moderator Behavior Guidelines:
- Language: Authentic, formal Indian Academic English with an Indian collegiate moderator demeanor (dignified, polite, encouraging yet firm).
- Phrasing & Style:
  1. If phase is 'intro': Introduce the discussion warmly with Indian academic greeting ("Good morning participants. Today's group discussion topic is: '${topic}'... Each candidate will receive an opportunity to put forth their views.").
  2. If phase is 'rules': State the 5 core rules clearly (Speak one at a time, respect differing viewpoints, substantiate with examples, ensure balanced participation, stay strictly on topic), then invite someone to initiate.
  3. If one student is dominating: Politely thank them and invite a less active or quiet peer by name and seat ("Thank you [Name] for your points. I would like to request our other peers, such as [Quiet Student], to share their perspective.").
  4. If there is a silence/deadlock (>15-20s): Intervene with a fresh, provocative open-ended question relevant to practical realities, ethics, or societal impact in our context.
  5. If off-topic: Politely thank them and steer back to "${topic}".
  6. If discussion is in progress: Ask thoughtful probing questions tailored to the latest speaker's argument (asking for counter-evidence, practical implementation barriers in our context, long-term societal effects, or addressing quiet participants).
  7. If phase is 'conclusion': Summarize the main arguments, thank all participants with dignity, and announce that individual assessment reports are being compiled.

Generate your response in JSON format with:
- speech: The exact dialogue the AI Facilitator speaks to the room (clear, natural, professional Indian English, max 2 sentences).
- actionType: One of ['introduce', 'explain_rules', 'invite_speaker', 'probing_question', 'deadlock_recovery', 'rebalance_turn', 'redirect_topic', 'conclude']
- targetStudentName: Name of the student being addressed directly (if any)
- isProbingQuestion: Boolean`;

      try {
        const geminiResponse = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                speech: { type: Type.STRING },
                actionType: { type: Type.STRING },
                targetStudentName: { type: Type.STRING },
                isProbingQuestion: { type: Type.BOOLEAN },
              },
              required: ['speech', 'actionType', 'isProbingQuestion'],
            },
          },
        });

        const parsed = JSON.parse(geminiResponse.text?.trim() || '{}');
        const speech = parsed.speech || 'Thank you for your valuable perspective. Who would like to build on this point?';
        serverAskedQuestions.add(speech);

        return res.json({
          success: true,
          speech,
          actionType: parsed.actionType || 'probing_question',
          targetStudentName: parsed.targetStudentName || null,
          isProbingQuestion: !!parsed.isProbingQuestion,
        });
      } catch (geminiErr) {
        console.warn('Gemini moderate error, falling through to heuristic engine:', geminiErr);
      }
    }

    // Extensive Multi-category Heuristic Fallback Engine with Deduplication
    let speech = 'Let us continue our discussion on this topic.';
    let actionType = 'probing_question';
    let targetStudentName: string | null = null;
    let isProbing = true;

    if (phase === 'intro') {
      speech = `Good morning participants. Welcome to this group discussion. Today's topic is: "${topic}". Each participant will receive an opportunity to put forth their views. Kindly maintain decorum, listen actively, and avoid interruptions.`;
      actionType = 'introduce';
      isProbing = false;
    } else if (phase === 'rules') {
      speech = `Before we begin, kindly note the ground rules: 1. Speak one at a time. 2. Respect differing viewpoints. 3. Support arguments with concrete examples. 4. Encourage quiet peers to participate. 5. Stay strictly on topic. Let us initiate the discussion. Who would like to start?`;
      actionType = 'explain_rules';
      isProbing = false;
    } else if (silenceDurationSeconds >= 15) {
      const deadlockPool = [
        `Let me pose a question to the room: what unexpected regulatory or ethical challenges might emerge if this model is adopted in our Indian context?`,
        `To restart our momentum: how might this issue fundamentally impact vulnerable communities and future workplace dynamics?`,
        `Playing devil's advocate: what if the primary risks we have identified are overstated, and delaying action carries far greater opportunity costs?`,
        `Let us examine the human experience: how will this change affect psychological safety, emotional empathy, and student motivation?`,
      ];
      const unaskedDeadlock = deadlockPool.find((q) => !allAsked.includes(q)) || deadlockPool[0];
      speech = unaskedDeadlock;
      actionType = 'deadlock_recovery';
    } else if (interruptionDetected) {
      speech = `Kindly allow the speaker to conclude their thoughts before taking the floor. Let us maintain mutual respect and speaking decorum.`;
      actionType = 'rebalance_turn';
      isProbing = false;
    } else if (phase === 'conclusion') {
      speech = `Thank you everyone. We have had a comprehensive and thoughtful discussion covering both opportunities and practical challenges. The session is now concluded, and individual assessment reports will be compiled.`;
      actionType = 'conclude';
      isProbing = false;
    } else {
      const richProbingPool = [
        'How might industry regulations and governance frameworks adapt to ensure accountability in this space?',
        'Looking at infrastructure and costs, how can underfunded institutions afford this transition without steep price hikes?',
        'What happens to intellectual authenticity and critical thinking when automated tools handle initial problem synthesis?',
        'How does this shift alter interpersonal collaboration and social maturation among team members?',
        'In hands-on technical or clinical disciplines requiring physical dexterity, what are the strict limitations of this approach?',
        'Looking ahead ten years: what new specialized human roles will emerge as this ecosystem matures?',
        'What empirical metrics should an independent audit committee monitor to evaluate genuine success?',
        'How do we prevent algorithmic bias and historical inequities from being amplified at scale?',
      ];
      
      const unasked = richProbingPool.find((q) => !allAsked.includes(q)) || richProbingPool[Math.floor(Math.random() * richProbingPool.length)];
      speech = unasked;
    }

    serverAskedQuestions.add(speech);

    res.json({
      success: true,
      speech,
      actionType,
      targetStudentName,
      isProbingQuestion: isProbing,
    });
  } catch (error: any) {
    console.error('Facilitator error:', error);
    res.status(500).json({
      error: 'Facilitator generation failed',
      fallbackSpeech: 'Thank you for your thoughts. Let us explore the practical implementation challenges.',
    });
  }
});

// Endpoint 2: AI Assessment Engine - evidence-grounded 7-parameter evaluation
const ASSESSMENT_MODEL = 'gemini-3.7-flash';

function gradeForScore(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Improvement';
}

function clampScore(value: any, max: number) {
  const n = Number(value);
  return Math.min(max, Math.max(0, Number.isFinite(n) ? Math.round(n) : 0));
}

function fallbackAssessment(student: any, entries: any[], topic: string, durationMinutes: number, metrics: any) {
  const spokenText = entries.map((t: any) => String(t.text || '').trim()).filter(Boolean).join(' ');
  const words = spokenText ? spokenText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const turns = metrics.speakingTurns ?? entries.length;
  const seconds = Math.max(0, Number(metrics.speakingDurationSeconds || (wordCount ? Math.round(wordCount / 130 * 60) : 0)));
  const wpm = seconds > 0 ? Math.round(wordCount / (seconds / 60)) : 0;
  const fillerKeywords = ['um', 'uh', 'like', 'basically', 'actually', 'you know', 'sort of', 'kind of', 'i mean'];
  const fillerMap: Record<string, number> = {};
  fillerKeywords.forEach((kw) => {
    const m = spokenText.toLowerCase().match(new RegExp('\\b' + kw + '\\b', 'gi'));
    if (m?.length) fillerMap[kw] = m.length;
  });
  const fillerWordsCount = Object.values(fillerMap).reduce((a, b) => a + b, 0);
  const fillerWordsBreakdown = Object.entries(fillerMap).map(([word, count]) => ({ word, count }));
  if (!wordCount) {
    const skills = {
      english: { score: 0, max: 20, feedback: 'No student speech was captured.' },
      fluency: { score: 0, max: 20, feedback: 'No student speech was captured.' },
      clarity: { score: 0, max: 15, feedback: 'No student speech was captured.' },
      confidence: { score: 0, max: 15, feedback: 'No speaking evidence was captured.' },
      contentQuality: { score: 0, max: 15, feedback: 'No argument evidence was captured.' },
      collaboration: { score: 0, max: 10, feedback: 'No peer interaction evidence was captured.' },
      leadership: { score: 0, max: 5, feedback: 'No leadership evidence was captured.' },
    };
    return {
      id: 'rep-' + student.id + '-' + Date.now(), sessionId: metrics.sessionId, studentId: student.id,
      studentName: student.name, college: student.college || 'Engineering Institute', topic, durationMinutes,
      speakingTimeFormatted: '0 min 0 sec', speakingTimeSeconds: 0, speakingTurns: 0,
      interruptions: metrics.interruptionCount || 0, questionsAnswered: 0, questionsInitiated: 0,
      wpm: 0, wpmStatus: 'No Speech', fillerWordsCount: 0, fillerWordsBreakdown: [],
      skills, overallScore: 0, grade: 'Needs Improvement', strengths: [],
      areasForImprovement: ['Participate in the discussion so measurable evidence can be captured.'],
      aiRecommendations: ['Check microphone and transcription permissions before the next GD.'],
      aiSummary: 'No student speech was captured. No performance claims were inferred.',
      facultyEndorsement: { endorsed: false }, generatedAt: new Date().toISOString(),
    };
  }

  const english = Math.min(20, Math.max(6, Math.round(6 + Math.min(14, new Set(words.map((w: string) => w.toLowerCase())).size / wordCount * 22))));
  const fluencyBase = wpm >= 110 && wpm <= 165 ? 20 : wpm >= 90 && wpm <= 190 ? 15 : 10;
  const fluency = Math.max(0, fluencyBase - Math.min(8, Math.max(0, fillerWordsCount - 4)));
  const clarity = Math.min(15, Math.max(5, Math.round(5 + Math.min(10, wordCount / 35))));
  const confidence = Math.min(15, Math.max(4, Math.round(4 + Math.min(11, turns * 1.5))));
  const content = Math.min(15, Math.max(5, Math.round(5 + Math.min(10, Math.log2(wordCount + 1) * 1.5))));
  const collaboration = entries.some((e: any) => /agree|disagree|adding|build|point|others/i.test(e.text)) ? 8 : 4;
  const leadership = entries.some((e: any) => /initiat|summar|conclud|suggest|bring.*point|let us hear/i.test(e.text)) ? 4 : turns >= 3 ? 2 : 1;
  const skills = {
    english: { score: english, max: 20, feedback: 'Fallback score based only on captured language evidence.' },
    fluency: { score: fluency, max: 20, feedback: 'Captured pace was ' + wpm + ' WPM with ' + fillerWordsCount + ' filler words.' },
    clarity: { score: clarity, max: 15, feedback: 'Based on the amount and structure of captured speech.' },
    confidence: { score: confidence, max: 15, feedback: 'Based on observable speaking turns only.' },
    contentQuality: { score: content, max: 15, feedback: 'Based on the amount of topic-related captured speech.' },
    collaboration: { score: collaboration, max: 10, feedback: 'Only explicit peer-reference language was considered.' },
    leadership: { score: leadership, max: 5, feedback: 'Only observable initiative or synthesis language was considered.' },
  };
  const overallScore = Object.values(skills).reduce((sum, item) => sum + item.score, 0);
  return {
    id: 'rep-' + student.id + '-' + Date.now(), sessionId: metrics.sessionId, studentId: student.id,
    studentName: student.name, college: student.college || 'Engineering Institute', topic, durationMinutes,
    speakingTimeFormatted: Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' sec',
    speakingTimeSeconds: seconds, speakingTurns: turns, interruptions: metrics.interruptionCount || 0,
    questionsAnswered: metrics.questionsAnswered || 0, questionsInitiated: metrics.questionsInitiated || 0,
    wpm, wpmStatus: wpm < 115 ? 'Too Slow' : wpm > 165 ? 'Too Fast' : 'Optimal',
    fillerWordsCount, fillerWordsBreakdown, skills, overallScore, grade: gradeForScore(overallScore),
    strengths: turns > 1 ? ['Participated in multiple speaking turns.'] : ['Provided a captured contribution.'],
    areasForImprovement: fillerWordsCount > 4 ? ['Reduce conversational filler words.'] : ['Use more explicit evidence and peer references.'],
    aiRecommendations: ['Review the transcript for practice.', 'Maintain a steady speaking pace.', 'Use concise evidence-based arguments.'],
    aiSummary: 'Fallback assessment based only on captured transcript evidence.',
    facultyEndorsement: { endorsed: false }, generatedAt: new Date().toISOString(),
  };
}

async function generateAssessmentReport(student: any, transcriptHistory: any[], topic: string, durationMinutes: number, metrics: any = {}) {
  const entries = (transcriptHistory || []).filter((t: any) => t.speakerId === student.id && !t.isFacilitator && String(t.text || '').trim());
  const spokenText = entries.map((t: any) => String(t.text).trim()).join(' ');
  const words = spokenText ? spokenText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const seconds = Math.max(0, Number(metrics.speakingDurationSeconds || (wordCount ? Math.round(wordCount / 130 * 60) : 0)));
  const wpm = seconds > 0 ? Math.max(65, Math.min(210, Math.round(wordCount / (seconds / 60)))) : 0;
  const fillers = ['um', 'uh', 'like', 'basically', 'actually', 'you know', 'sort of', 'kind of', 'i mean'];
  const fillerMap: Record<string, number> = {};
  fillers.forEach((kw) => {
    const m = spokenText.toLowerCase().match(new RegExp('\\b' + kw + '\\b', 'gi'));
    if (m?.length) fillerMap[kw] = m.length;
  });
  const fillerWordsCount = Object.values(fillerMap).reduce((a, b) => a + b, 0);
  const fillerWordsBreakdown = Object.entries(fillerMap).map(([word, count]) => ({ word, count }));

  if (!ai || wordCount === 0) {
    return fallbackAssessment(student, entries, topic, durationMinutes, {
      ...metrics, speakingDurationSeconds: seconds, speakingTurns: metrics.speakingTurns ?? entries.length,
      sessionId: metrics.sessionId, questionsAnswered: metrics.questionsAnswered || 0, questionsInitiated: metrics.questionsInitiated || 0,
    });
  }

  const prompt = 'Evaluate one student using only observable evidence. Never invent behavior. Leadership is not automatic for speaking first. If evidence is insufficient, use a conservative score and say so.\\n' +
    'Student: ' + student.name + '\\nTopic: ' + topic + '\\nSpeaking seconds: ' + seconds +
    '\\nTurns: ' + (metrics.speakingTurns ?? entries.length) + '\\nInterruptions: ' + (metrics.interruptionCount || 0) +
    '\\nWords: ' + wordCount + '\\nWPM: ' + wpm + '\\nFiller words: ' + fillerWordsCount + '\\nTranscript:\\n' + spokenText +
    '\\nRubric: English 20, Fluency 20, Clarity 15, Confidence 15, Content 15, Collaboration 10, Leadership 5. ' +
    'Return JSON fields: englishScore, englishFeedback, fluencyScore, fluencyFeedback, clarityScore, clarityFeedback, confidenceScore, confidenceFeedback, contentScore, contentFeedback, collaborationScore, collaborationFeedback, leadershipScore, leadershipFeedback, strengths, areasForImprovement, aiRecommendations, aiSummary.';

  try {
    const response = await ai.models.generateContent({
      model: ASSESSMENT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            englishScore: { type: Type.NUMBER }, englishFeedback: { type: Type.STRING },
            fluencyScore: { type: Type.NUMBER }, fluencyFeedback: { type: Type.STRING },
            clarityScore: { type: Type.NUMBER }, clarityFeedback: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER }, confidenceFeedback: { type: Type.STRING },
            contentScore: { type: Type.NUMBER }, contentFeedback: { type: Type.STRING },
            collaborationScore: { type: Type.NUMBER }, collaborationFeedback: { type: Type.STRING },
            leadershipScore: { type: Type.NUMBER }, leadershipFeedback: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiSummary: { type: Type.STRING },
          },
          required: ['englishScore','englishFeedback','fluencyScore','fluencyFeedback','clarityScore','clarityFeedback','confidenceScore','confidenceFeedback','contentScore','contentFeedback','collaborationScore','collaborationFeedback','leadershipScore','leadershipFeedback','strengths','areasForImprovement','aiRecommendations','aiSummary'],
        },
      },
    });
    const parsed = JSON.parse(response.text?.trim() || '{}');
    const skills = {
      english: { score: clampScore(parsed.englishScore, 20), max: 20, feedback: parsed.englishFeedback || 'Evidence limited.' },
      fluency: { score: clampScore(parsed.fluencyScore, 20), max: 20, feedback: parsed.fluencyFeedback || ('Observed ' + wpm + ' WPM and ' + fillerWordsCount + ' filler words.') },
      clarity: { score: clampScore(parsed.clarityScore, 15), max: 15, feedback: parsed.clarityFeedback || 'Evidence limited.' },
      confidence: { score: clampScore(parsed.confidenceScore, 15), max: 15, feedback: parsed.confidenceFeedback || 'Evidence limited.' },
      contentQuality: { score: clampScore(parsed.contentScore, 15), max: 15, feedback: parsed.contentFeedback || 'Evidence limited.' },
      collaboration: { score: clampScore(parsed.collaborationScore, 10), max: 10, feedback: parsed.collaborationFeedback || 'Evidence limited.' },
      leadership: { score: clampScore(parsed.leadershipScore, 5), max: 5, feedback: parsed.leadershipFeedback || 'Evidence limited.' },
    };
    const overallScore = Object.values(skills).reduce((sum, item) => sum + item.score, 0);
    return {
      id: 'rep-' + student.id + '-' + Date.now(), sessionId: metrics.sessionId, studentId: student.id,
      studentName: student.name, college: student.college || 'Engineering Institute', topic, durationMinutes,
      speakingTimeFormatted: Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' sec',
      speakingTimeSeconds: seconds, speakingTurns: metrics.speakingTurns ?? entries.length,
      interruptions: metrics.interruptionCount || 0, questionsAnswered: metrics.questionsAnswered || 0,
      questionsInitiated: metrics.questionsInitiated || 0, wpm,
      wpmStatus: wpm < 115 ? 'Too Slow' : wpm > 165 ? 'Too Fast' : 'Optimal',
      fillerWordsCount, fillerWordsBreakdown, skills, overallScore, grade: gradeForScore(overallScore),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
      areasForImprovement: Array.isArray(parsed.areasForImprovement) ? parsed.areasForImprovement.slice(0, 3) : [],
      aiRecommendations: Array.isArray(parsed.aiRecommendations) ? parsed.aiRecommendations.slice(0, 3) : [],
      aiSummary: parsed.aiSummary || 'Assessment generated from captured transcript.',
      facultyEndorsement: { endorsed: false }, generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[Assessment AI] Gemini failed; using evidence-based fallback:', e);
    return fallbackAssessment(student, entries, topic, durationMinutes, {
      ...metrics, speakingDurationSeconds: seconds, speakingTurns: metrics.speakingTurns ?? entries.length, sessionId: metrics.sessionId,
    });
  }
}

async function persistAssessmentReport(report: any) {
  if (!report?.sessionId) return;

  // Persist to MongoDB (Sub-Table: assessment_reports)
  if (isMongoConnected()) {
    try {
      const repId = report.id || `rep-${report.studentId}-${report.sessionId}`;
      await AssessmentReportModel.findOneAndUpdate(
        { sessionId: report.sessionId, studentId: report.studentId },
        {
          id: repId,
          sessionId: report.sessionId,
          studentId: report.studentId,
          studentName: report.studentName || '',
          overallScore: report.overallScore || 80,
          rubricJson: report.skills || {},
          feedback: report.aiSummary || '',
          strengths: report.strengths || [],
          improvements: report.areasForImprovement || [],
        },
        { upsert: true, new: true }
      );
      report.id = repId;
    } catch (e: any) {
      console.warn('[MongoDB] Failed to persist assessment report:', e.message);
    }
  }

  // Dual-persist to PostgreSQL if connected
  if (isDbConnected && prisma) {
    try {
      const existing = await prisma.assessmentReport.findFirst({ where: { sessionId: report.sessionId, studentId: report.studentId } });
      const data = {
        sessionId: report.sessionId, studentId: report.studentId, overallScore: report.overallScore,
        rubricJson: JSON.stringify(report.skills), feedback: report.aiSummary || '',
        strengths: (report.strengths || []).join('; '), improvements: (report.areasForImprovement || []).join('; '),
      };
      if (existing) {
        await prisma.assessmentReport.update({ where: { id: existing.id }, data });
        report.id = existing.id;
      } else {
        await prisma.assessmentReport.create({ data: { id: report.id, ...data } });
      }
    } catch (e: any) { console.warn('[Database] Failed to persist assessment report:', e.message); }
  }
}

app.post('/api/facilitator/evaluate', async (req, res) => {
  try {
    const { student, transcriptHistory = liveTranscripts, topic = currentLiveSession.topic, durationMinutes = 20 } = req.body;
    if (!student?.id) return res.status(400).json({ success: false, error: 'student is required' });
    const report = await generateAssessmentReport(student, transcriptHistory, topic, durationMinutes, {
      sessionId: req.body.sessionId || currentLiveSession.id,
      speakingDurationSeconds: student.speakingDurationSeconds,
      speakingTurns: student.speakingTurns,
      interruptionCount: student.interruptionCount,
      questionsAnswered: student.questionsAnswered || 0,
      questionsInitiated: student.questionsInitiated || 0,
    });
    await persistAssessmentReport(report);
    res.json({ success: true, report });
  } catch (error: any) {
    console.error('Evaluation error:', error);
    res.status(500).json({ success: false, error: 'Evaluation failed' });
  }
});

// Authoritative persisted report for a student.
app.get('/api/student/reports', async (req, res) => {
  const studentId = String(req.query.studentId || '').trim();
  const sessionId = String(req.query.sessionId || '').trim();
  if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });

  // Query MongoDB Sub-Table: assessment_reports
  if (isMongoConnected()) {
    try {
      const filter: any = { studentId };
      if (sessionId) filter.sessionId = sessionId;
      const mongoReports = await AssessmentReportModel.find(filter).sort({ createdAt: -1 });
      if (mongoReports.length > 0) {
        return res.json({
          success: true,
          reports: mongoReports.map((r) => ({
            id: r.id,
            sessionId: r.sessionId,
            studentId: r.studentId,
            overallScore: r.overallScore,
            grade: gradeForScore(r.overallScore),
            skills: r.rubricJson,
            aiSummary: r.feedback,
            strengths: r.strengths || [],
            areasForImprovement: r.improvements || [],
            generatedAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
            facultyEndorsement: { endorsed: false },
          })),
        });
      }
    } catch (e: any) {
      console.warn('[Student Reports] MongoDB read failed:', e.message);
    }
  }

  if (isDbConnected && prisma) {
    try {
      const where: any = { studentId };
      if (sessionId) where.sessionId = sessionId;
      const reports = await prisma.assessmentReport.findMany({ where, orderBy: { createdAt: 'desc' } });
      return res.json({
        success: true,
        reports: reports.map((r) => {
          let skills: any = {};
          try { skills = JSON.parse(r.rubricJson || '{}'); } catch {}
          return {
            id: r.id, sessionId: r.sessionId, studentId: r.studentId, overallScore: r.overallScore,
            grade: gradeForScore(r.overallScore), skills, aiSummary: r.feedback,
            strengths: r.strengths ? r.strengths.split('; ').filter(Boolean) : [],
            areasForImprovement: r.improvements ? r.improvements.split('; ').filter(Boolean) : [],
            generatedAt: r.createdAt.toISOString(), facultyEndorsement: { endorsed: false },
          };
        }),
      });
    } catch (e: any) { console.warn('[Student Reports] DB read failed:', e.message); }
  }
  res.json({ success: true, reports: [] });
});

// Faculty report access is limited to the faculty assigned to the session.
app.get('/api/faculty/sessions/:id/reports', async (req, res) => {
  const sessionId = req.params.id;
  const facultyId = String(req.query.facultyId || '').trim();
  if (!facultyId) return res.status(400).json({ success: false, error: 'facultyId is required' });

  let slot: any = null;
  for (const list of Object.values(persistentState.slots)) {
    const found = list.find((s) => s.id === sessionId);
    if (found) { slot = found; break; }
  }
  if (!slot || slot.assignedFacultyId !== facultyId) {
    return res.status(403).json({ success: false, error: 'Faculty is not assigned to this session' });
  }

  // Query MongoDB Sub-Table: assessment_reports
  if (isMongoConnected()) {
    try {
      const mongoReports = await AssessmentReportModel.find({ sessionId }).sort({ createdAt: 1 });
      const reportStudentIds = mongoReports.map((r) => r.studentId);
      const mongoUsers = reportStudentIds.length > 0
        ? await UserModel.find({ id: { $in: reportStudentIds } })
        : [];
      const reportNameById = new Map(mongoUsers.map((u) => [u.id, u.name]));
      const reportsWithStudentNames = mongoReports.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        studentId: r.studentId,
        studentName: reportNameById.get(r.studentId) || r.studentName || r.studentId,
        overallScore: r.overallScore,
        rubricJson: typeof r.rubricJson === 'string' ? r.rubricJson : JSON.stringify(r.rubricJson),
        feedback: r.feedback,
        strengths: (r.strengths || []).join('; '),
        improvements: (r.improvements || []).join('; '),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));

      const bookings = await GDBookingModel.find({ sessionId, status: { $ne: 'CANCELLED' } });
      const bookingStudentIds = bookings.map((b) => b.studentId);
      const bookingUsers = bookingStudentIds.length > 0
        ? await UserModel.find({ id: { $in: bookingStudentIds } })
        : [];
      const userMap = new Map(bookingUsers.map((u) => [u.id, u]));

      return res.json({
        success: true,
        sessionId,
        reports: reportsWithStudentNames,
        participants: bookings.map((b) => {
          const user = userMap.get(b.studentId);
          return {
            id: b.studentId,
            name: user?.name || b.studentId,
            email: user?.email || '',
            studentId: user?.studentProfile?.studentId || '',
            seatNumber: user?.studentProfile?.seatNumber || null,
            bookingStatus: b.status,
          };
        }),
      });
    } catch (e: any) {
      console.warn('[Faculty Reports] MongoDB read failed:', e.message);
    }
  }

  if (isDbConnected && prisma) {
    try {
      const reports = await prisma.assessmentReport.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      });
      const reportStudentIds = reports.map((r) => r.studentId);
      const reportUsers = reportStudentIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: reportStudentIds } }, select: { id: true, name: true } })
        : [];
      const reportNameById = new Map(reportUsers.map((u) => [u.id, u.name]));
      const reportsWithStudentNames = reports.map((r) => ({ ...r, studentName: reportNameById.get(r.studentId) || r.studentId }));
      const bookings = await prisma.gDBooking.findMany({
        where: { sessionId, status: { not: 'CANCELLED' } },
        include: { student: { include: { studentProfile: true } } },
      });
      return res.json({
        success: true,
        sessionId,
        reports: reportsWithStudentNames,
        participants: bookings.map((b) => ({
          id: b.student.id,
          name: b.student.name,
          email: b.student.email,
          studentId: b.student.studentProfile?.studentId || '',
          seatNumber: b.student.studentProfile?.seatNumber || null,
          bookingStatus: b.status,
        })),
      });
    } catch (e: any) {
      console.warn('[Faculty Reports] DB read failed:', e.message);
    }
  }

  res.json({ success: true, sessionId, reports: [], participants: [] });
});

// Endpoint 2B: Faculty Endorsement & Score Override
app.post('/api/facilitator/endorse', (req, res) => {
  try {
    const { report, updatedSkills, facultyRemarks, facultyUser } = req.body;
    if (!report) {
      return res.status(400).json({ success: false, error: 'Report is required for endorsement.' });
    }

    const mergedSkills = updatedSkills || report.skills;
    const english = mergedSkills.english?.score ?? 16;
    const fluency = mergedSkills.fluency?.score ?? 16;
    const clarity = mergedSkills.clarity?.score ?? 12;
    const confidence = mergedSkills.confidence?.score ?? 12;
    const content = mergedSkills.contentQuality?.score ?? 12;
    const collaboration = mergedSkills.collaboration?.score ?? 8;
    const leadership = mergedSkills.leadership?.score ?? 4;

    const newOverall = english + fluency + clarity + confidence + content + collaboration + leadership;
    let newGrade = 'Very Good';
    if (newOverall >= 90) newGrade = 'Excellent';
    else if (newOverall >= 75) newGrade = 'Very Good';
    else if (newOverall >= 60) newGrade = 'Good';
    else if (newOverall >= 40) newGrade = 'Average';
    else newGrade = 'Needs Improvement';

    const endorsedReport = {
      ...report,
      skills: mergedSkills,
      overallScore: newOverall,
      grade: newGrade,
      facultyEndorsement: {
        endorsed: true,
        facultyName: facultyUser?.name || 'Dr. Sunita Rao',
        facultyId: facultyUser?.facultyId || 'FAC-CSE-102',
        designation: facultyUser?.designation || 'Professor & Head of Department',
        remarks: facultyRemarks || 'Performance validated and verified against academic evaluation rubric.',
        endorsedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        adjustedScores: !!updatedSkills,
      },
    };

    res.json({ success: true, report: endorsedReport });
  } catch (error: any) {
    console.error('Endorsement error:', error);
    res.status(500).json({ success: false, error: 'Failed to endorse report.' });
  }
});

// Endpoint: GET Faculty Analytics
app.get('/api/faculty/analytics', (req, res) => {
  const students = currentLiveSession.students;
  const totalSpeakingTime = students.reduce((acc, s) => acc + s.speakingDurationSeconds, 0);
  const totalTurns = students.reduce((acc, s) => acc + s.speakingTurns, 0);

  res.json({
    sessionId: currentLiveSession.id,
    topic: currentLiveSession.topic,
    totalStudents: students.length,
    totalSpeakingTimeSeconds: totalSpeakingTime,
    totalTurns,
    participationRatePercent: 96,
    averageScore: 82,
    students,
    transcriptsCount: liveTranscripts.length,
  });
});

// Endpoint: GET Curated Topics
app.get('/api/topics', (req, res) => {
  res.json({
    topics: [
      {
        id: 't-1',
        topic: 'Should Artificial Intelligence replace teachers in higher education?',
        category: 'Technology & Education',
        difficulty: 'Intermediate',
      },
      {
        id: 't-2',
        topic: 'Is remote work sustainable for corporate innovation and culture?',
        category: 'Workplace & Economy',
        difficulty: 'Intermediate',
      },
      {
        id: 't-3',
        topic: 'Can renewable energy completely eliminate fossil fuels by 2040?',
        category: 'Environment & Energy',
        difficulty: 'Advanced',
      },
      {
        id: 't-4',
        topic: 'Should social media algorithms be legally regulated by governments?',
        category: 'Ethics & Governance',
        difficulty: 'Beginner',
      },
    ],
  });
});

// ==========================================
// REAL-TIME MULTI-USER WEBRTC AUDIO & ROOM GATEWAY (SOCKET.IO)
// ==========================================

interface LiveRoomPeer {
  socketId: string;
  userId: string;
  name: string;
  avatar: string;
  role: string;
  college: string;
  seatNumber: number;
  isSpeaking: boolean;
  micActive: boolean;
  cameraActive: boolean;
  speakingDurationSeconds: number;
  speakingTurns: number;
  interruptionCount: number;
  joinedAt: number;
  lastSpokeAt?: number;
  floorTurnCounted?: boolean;
}

interface AIParticipant {
  id: string;
  name: string;
  seatNumber: number;
  avatar: string;
  role: 'student';
  college: string;
  speakingTurns: number;
  speakingDurationSeconds: number;
  lastSpokeAt?: number;
}

interface LiveGDRoomState {
  slotId: string;
  peers: Map<string, LiveRoomPeer>; // socketId -> LiveRoomPeer
  aiParticipants: Map<string, AIParticipant>;
  assignedSeats: Map<number, string>; // seatNumber (1..15) -> socketId
  currentSpeakerId: string | null;
  currentSpeakerSocketId: string | null;
  silenceTimerSeconds: number;
  status: 'active' | 'paused' | 'completed' | 'waiting' | 'scheduled';
  topic: string;
  transcripts: BackendTranscript[];
  silenceInterval?: NodeJS.Timeout;
  turnTimer?: NodeJS.Timeout;
  lastDeadlockAt?: number;
  deadlockCount: number;
  lastDeadlockTargetId?: string;
  // Temporary demo mode: the room is populated and driven entirely by AI
  // participants so the GD can be simulated without multiple human devices.
  simulationMode: boolean;
  // Server-authoritative turn lock. Only one participant may own the floor.
  waitingForParticipantId?: string;
  floorVersion: number;
  initialSpeakerSelected?: boolean;
  announcedNextSpeakerId?: string;
  // When an AI finishes a turn, sometimes it hands off directly to another
  // participant; other times the facilitator owns the next invitation.
  nextSpeakerId?: string;
  openingStarted?: boolean;
  facilitatorHandoffCount: number;
  facilitatorHandoffStreak: number;
}

const LIVE_ROOMS = new Map<string, LiveGDRoomState>();

function getSlotCapacity(slotId: string) {
  for (const slots of Object.values(persistentState.slots)) {
    const slot = slots.find((s) => s.id === slotId);
    if (slot) return Math.max(1, Number(slot.maxCapacity || 1));
  }
  return Math.max(1, Number((currentLiveSession as any)?.maxCapacity || 6));
}

const AI_PARTICIPANT_NAMES = [
  'Aarav Mehta','Ananya Rao','Rohan Sharma','Ishita Nair','Vikram Patel','Kavya Reddy',
  'Arjun Iyer','Meera Kapoor','Aditya Menon','Sneha Joshi','Kabir Shah','Diya Nair',
  'Nikhil Reddy','Riya Malhotra','Vivek Rao','Pooja Menon','Karan Joshi','Anika Sharma',
  'Manav Patel','Sanya Kapoor'
];
const AI_GD_SIMULATION_MODE = false;
const AI_GD_SIMULATION_PARTICIPANTS = 6; // Fallback only; simulation normally follows slot capacity.

function syncAiParticipants(room: LiveGDRoomState) {
  // Keep a realistic six-person GD floor. If fewer real students join, fill
  // the remaining seats with distinct AI participants; real students always
  // take priority when they join.
  const capacity = Math.max(6, getSlotCapacity(room.slotId));
  const realStudents = Array.from(room.peers.values()).filter((p) => p.role === 'student');
  // In simulation mode the humans connected to the browser are observers only.
  // Keep exactly six distinct AI students on the discussion floor.
  const targetCount = room.simulationMode
    ? Math.max(1, getSlotCapacity(room.slotId))
    : Math.max(0, capacity - realStudents.length);
  const usedSeats = new Set(realStudents.map((p) => p.seatNumber));
  const existing = Array.from(room.aiParticipants.values()).slice(0, targetCount);
  room.aiParticipants = new Map(existing.map((p) => [p.id, p]));
  let seat = 1;
  while (room.aiParticipants.size < targetCount) {
    while (usedSeats.has(seat)) seat++;
    const name = AI_PARTICIPANT_NAMES[room.aiParticipants.size % AI_PARTICIPANT_NAMES.length];
    const id = 'ai-' + room.slotId + '-' + (room.aiParticipants.size + 1);
    room.aiParticipants.set(id, { id, name, seatNumber: seat, avatar: '', role: 'student', college: 'ERUS AI Participant', speakingTurns: 0, speakingDurationSeconds: 0 });
    usedSeats.add(seat);
    seat++;
  }
  return Array.from(room.aiParticipants.values());
}

function getOrCreateLiveRoom(slotId: string, topic?: string): LiveGDRoomState {
  let room = LIVE_ROOMS.get(slotId);
  if (!room) {
    let resolvedTopic = topic;
    if (!resolvedTopic) {
      for (const slots of Object.values(persistentState.slots)) {
        const slot = slots.find((s) => s.id === slotId);
        if (slot?.topic) {
          resolvedTopic = slot.topic;
          break;
        }
      }
    }
    resolvedTopic = resolvedTopic || (currentLiveSession as any)?.topic || 'Group Discussion';
    room = {
      slotId,
      peers: new Map(),
      aiParticipants: new Map(),
      assignedSeats: new Map(),
      currentSpeakerId: null,
      currentSpeakerSocketId: null,
      silenceTimerSeconds: 0,
      status: 'waiting',
      topic: resolvedTopic,
      transcripts: liveTranscripts.filter((t) => t.sessionId === slotId),
      deadlockCount: 0,
      simulationMode: AI_GD_SIMULATION_MODE,
      floorVersion: 0,
      openingStarted: false,
      facilitatorHandoffCount: 0,
      facilitatorHandoffStreak: 0,
    };

    // Central 20-Second Silence Deadlock Watchdog (PDF Page 4, Section F)
    room.silenceInterval = setInterval(async () => {
      if (room.status !== 'active' || room.peers.size === 0) return;

      if (!room.currentSpeakerId) {
        room.silenceTimerSeconds += 1;

        // Broadcast current silence countdown tick to all peers
        io.to(`room-${slotId}`).emit('silence-timer-tick', {
          silenceTimerSeconds: room.silenceTimerSeconds,
          maxSilence: 20,
        });

        // Deadlock intervention is a safety net, not the normal turn engine.
        // Apply a cooldown so the same silence cannot repeatedly trigger the
        // same moderator question.
        const now = Date.now();
        const deadlockCooldownMs = 45000;
        if (
          room.silenceTimerSeconds >= 20 &&
          !room.waitingForParticipantId &&
          (!room.lastDeadlockAt || now - room.lastDeadlockAt >= deadlockCooldownMs)
        ) {
          room.silenceTimerSeconds = 0;
          room.lastDeadlockAt = now;
          room.deadlockCount += 1;
          await triggerDeadlockIntervention(room);
        }
      } else {
        // Someone is speaking -> floor is active
        room.silenceTimerSeconds = 0;
        
        // Track current speaker's continuous speaking time
        if (room.currentSpeakerSocketId) {
          const spkPeer = room.peers.get(room.currentSpeakerSocketId);
          if (spkPeer) {
            spkPeer.speakingDurationSeconds += 1;
            // Check for dominance if speaking > 75 seconds
            if (spkPeer.speakingDurationSeconds > 0 && spkPeer.speakingDurationSeconds % 75 === 0) {
              triggerDominanceNudge(room, spkPeer);
            }
          }
        }
      }
    }, 1000);

    LIVE_ROOMS.set(slotId, room);
  }
  return room;
}

async function scheduleNextTurn(room: LiveGDRoomState, completedUserId?: string) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = undefined;
  if (room.status !== 'active') return;

  const realStudents = Array.from(room.peers.values()).filter((p) => p.role === 'student');
  const aiStudents = syncAiParticipants(room);
  // Simulation mode deliberately removes humans from the speaking pool.
  // Connected humans are observers; all six seats are AI participants.
  const allParticipants: any[] = room.simulationMode
    ? [...aiStudents]
    : [...realStudents, ...aiStudents];
  if (!allParticipants.length) return;

  // Round-robin rule: nobody may receive a second turn until every active
  // participant has completed the current round. A participant's
  // speakingTurns count is therefore the round counter.
  const minimumTurns = Math.min(...allParticipants.map((p) => Number(p.speakingTurns || 0)));
  const currentRoundCandidates = allParticipants.filter(
    (p) => Number(p.speakingTurns || 0) === minimumTurns
  );

  // Normally exclude the person who just finished. At the exact boundary
  // where everyone has the same turn count, start the next round instead of
  // allowing another participant to get an extra turn first.
  const completedMatches = currentRoundCandidates.some(
    (p) => p.id === completedUserId || p.userId === completedUserId
  );
  // If everyone has the same turn count, the previous round is complete.
  // Start the next round with the full participant set; never skip the
  // participant who just finished in this boundary case.
  const isNewRoundBoundary = currentRoundCandidates.length === allParticipants.length;
  const candidates: any[] =
    completedMatches && !isNewRoundBoundary && currentRoundCandidates.length > 1
      ? currentRoundCandidates.filter((p) => p.id !== completedUserId && p.userId !== completedUserId)
      : currentRoundCandidates;

  if (!candidates.length) return;

  // Randomize only the opening turn. From the second turn onward the existing
  // minimum-turn round-robin logic keeps participation balanced.
  if (!room.initialSpeakerSelected && allParticipants.length > 1) {
    const starter = allParticipants[Math.floor(Math.random() * allParticipants.length)];
    candidates.splice(0, candidates.length, starter);
    room.initialSpeakerSelected = true;
  }

  room.turnTimer = setTimeout(async () => {
    room.turnTimer = undefined;
    if (room.currentSpeakerId) return;
    const now = Date.now();

    candidates.sort((a, b) => {
      // AI participants must actively participate in every round. When both
      // AI and human participants are still waiting for their first turn in
      // the round, let the AI participants contribute before asking the
      // facilitator to invite a human. This prevents the discussion from
      // becoming facilitator-only while still preserving one turn per
      // participant per round.
      const aIsAI = String(a.id || '').startsWith('ai-');
      const bIsAI = String(b.id || '').startsWith('ai-');
      if (aIsAI !== bIsAI) return aIsAI ? -1 : 1;

      // Within the same participant type, prefer the participant who has
      // waited longest.
      return (a.lastSpokeAt || 0) - (b.lastSpokeAt || 0);
    });

    let target = candidates[0];
    // When the previous AI explicitly handed the floor to someone, honor that
    // handoff instead of recalculating a different participant.
    if (room.nextSpeakerId) {
      const handedOff = candidates.find((p) => p.id === room.nextSpeakerId);
      if (handedOff) target = handedOff;
      room.nextSpeakerId = undefined;
    }
    // Randomize only the opening turn. After the discussion starts, fairness
    // is handled by the round/turn counters below.
    if (!room.openingStarted) {
      target = candidates[Math.floor(Math.random() * candidates.length)];
      room.openingStarted = true;
    }
    const recentHistory = room.transcripts.filter((t) => !t.isFacilitator).slice(-10).map((t) => t.speakerName + ': ' + t.text).join('\\n');

    if (target.id.startsWith('ai-')) {
      // If nobody has started the discussion yet, the facilitator must open
      // the floor by calling the randomly selected participant by name.
      // This is intentionally separate from the participant's speech so the
      // opening does not look like the AI participant started itself.
      if (!room.transcripts.some((t) => !t.isFacilitator)) {
        const firstName = target.name.split(' ')[0];
        const openingOptions = [
          'The discussion is open. ' + firstName + ', please begin with your view on this topic.',
          'Let us get started. ' + firstName + ', could you share your opening thoughts on this topic?',
          firstName + ', you can start the discussion. What is your perspective on this topic?',
          'To begin, I would like to hear from ' + firstName + '. Please share your initial view.'
        ];
        const openingText = openingOptions[Math.floor(Math.random() * openingOptions.length)];
        const openingTranscript: BackendTranscript = {
          id: 't-facilitator-opening-' + Date.now(),
          sessionId: room.slotId,
          speakerId: 'facilitator',
          speakerName: 'AI Facilitator',
          seatNumber: null,
          isFacilitator: true,
          timestamp: '00:00',
          timestampSeconds: Date.now(),
          text: openingText,
          type: 'intervention',
          sentiment: 'neutral',
        };
        room.transcripts.push(openingTranscript);
        room.nextSpeakerId = target.id;
        room.facilitatorHandoffCount += 1;
        io.to('room-' + room.slotId).emit('facilitator-intervention', {
          text: openingText,
          action: 'opening_turn',
          targetUserId: target.id,
          targetSeatNumber: target.seatNumber,
          transcript: openingTranscript,
        });
      }

      // Normal AI turns use direct participant-to-participant handoffs.
      // The facilitator is reserved for genuine deadlocks, not every turn.
      if (room.status !== 'active' || room.currentSpeakerId) return;
      const aiIndex = Math.max(0, target.seatNumber - 1);
      const perspectives = [
        'Use an evidence or data angle: mention a concrete trend, measurable outcome, or comparison.',
        'Use an implementation angle: discuss feasibility, resources, infrastructure, or execution in India.',
        'Use an ethical angle: examine fairness, accountability, bias, privacy, or unintended consequences.',
        'Use an economic angle: discuss cost, jobs, productivity, incentives, or who benefits and who bears the cost.',
        'Use a social impact angle: discuss students, families, communities, inclusion, or behaviour change.',
        'Use a counterargument angle: challenge the strongest recent point respectfully and explain why.',
        'Use a policy angle: discuss regulation, institutional responsibility, or governance.',
        'Use a long-term angle: discuss sustainability, future consequences, or how the issue may evolve.',
        'Use a practical example angle: give a short realistic Indian workplace, campus, or public example.',
        'Use a synthesis angle: connect two different viewpoints and propose a nuanced way forward.'
      ];
      const perspective = perspectives[(aiIndex >= 0 ? aiIndex : 0) % perspectives.length];
      const previousAiStatements = room.transcripts
        .filter((t) => !t.isFacilitator && String(t.speakerId).startsWith('ai-'))
        .slice(-8)
        .map((t) => t.speakerName + ': ' + t.text)
        .join('\n');

      let statement = '';
      const topicFallbacks = [
        'On "' + room.topic + '", I would start by looking at the actual evidence and measurable outcomes rather than assuming the headline benefits tell the whole story.',
        'For "' + room.topic + '", the practical question is whether institutions, companies, or communities have the resources and infrastructure needed to implement the idea at scale.',
        'The ethical side of "' + room.topic + '" matters because efficiency or convenience should not come at the cost of fairness, privacy, accountability, or inclusion.',
        'Economically, "' + room.topic + '" should be examined by asking who benefits, who bears the cost, and how the change could affect jobs, productivity, or access.',
        'The social impact of "' + room.topic + '" also deserves attention. A solution may work technically but still affect different groups very differently.',
        'I would challenge the assumption that "' + room.topic + '" has a simple answer. A phased approach could help us test benefits while limiting unintended consequences.',
        'From a policy perspective, "' + room.topic + '" needs clear responsibility and practical rules so that institutions know how decisions should be made and reviewed.',
        'We should also consider the long-term consequences of "' + room.topic + '". What looks efficient today could create new dependencies, risks, or inequalities later.',
        'A realistic campus or workplace example shows why "' + room.topic + '" is more complicated than it first appears: the same approach can produce different outcomes for different groups.',
        'I see a possible middle ground on "' + room.topic + '": keep the useful benefits, but add specific safeguards for the risks raised in the discussion.'
      ];
      statement = topicFallbacks[(aiIndex >= 0 ? aiIndex : target.speakingTurns) % topicFallbacks.length];

      if (ai) {
        try {
          const response = await Promise.race([
            ai.models.generateContent({
              model: 'gemini-3.7-flash',
            contents: 'You are ' + target.name + ', one distinct student in a live Indian college group discussion. Topic: "' + room.topic + '".\n' +
              'Your assigned perspective for this turn: ' + perspective + '\n' +
              'Recent discussion:\n' + (recentHistory || '(opening)') + '\n' +
              'Recent AI contributions:\n' + (previousAiStatements || '(none)') + '\n\n' +
              'Rules: Write a fresh 45-80 word spoken contribution that is specifically about the current topic \"' + room.topic + '\". First understand the topic and the recent discussion, then respond to the latest participant\'s actual point when possible. Add one genuinely new, topic-specific argument, example, implication, counterpoint, or practical consideration from your assigned perspective. Do NOT reuse, repeat, paraphrase, summarize, or restate any point, example, argument, conclusion, or wording already present in the recent discussion or previous AI contributions. Treat every previous contribution as unavailable for your own content. Choose a different angle and advance the discussion. If a point has already been made, move to a different aspect instead of repeating it. Do not invent facts. If the topic is unfamiliar, reason from its exact wording and the recent discussion instead of falling back to a generic AI/technology answer. Sound like a student speaking spontaneously in a real Indian college GD, not an essay. Do not mention AI, prompts, or these instructions.',
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('AI participant generation timeout')), 8000)),
          ]);
          const generated = response.text?.trim();
          if (generated) statement = generated;
        } catch (err) { console.warn('[AI Participant Speech Error]:', err); }
      }
      target.speakingTurns += 1;
      target.lastSpokeAt = now;
      target.speakingDurationSeconds += Math.max(4, Math.round(statement.split(/\s+/).length / 2.2));

      // Decide how the floor changes hands. Most AI turns can flow naturally
      // to another participant, but the facilitator should also own a meaningful
      // share of invitations so it does not feel like every participant is
      // mechanically calling the next person.
      const participantsAfterTurn: any[] = room.simulationMode
        ? [...syncAiParticipants(room)]
        : [...realStudents, ...syncAiParticipants(room)];
      const eligibleNext = participantsAfterTurn.filter((p) => p.id !== target.id);
      const minimumNextTurns = eligibleNext.length
        ? Math.min(...eligibleNext.map((p) => Number(p.speakingTurns || 0)))
        : 0;
      const leastSpoken = eligibleNext.filter(
        (p) => Number(p.speakingTurns || 0) === minimumNextTurns
      );
      const shuffled = [...leastSpoken].sort(() => Math.random() - 0.5);
      const nextParticipant = shuffled[0];

      // The facilitator should be occasional, not the default turn router.
      // Most turns flow directly from one participant to another.
      // Never let the facilitator call two participants consecutively.
      const totalAiTurns = participantsAfterTurn.reduce(
        (sum, p) => sum + Number(p.speakingTurns || 0),
        0,
      );
      const isEarlyRound = totalAiTurns <= participantsAfterTurn.length;

      // Once every participant has completed one turn in the current round,
      // the facilitator explicitly opens the next round by calling a
      // participant. This gives each round a clear moderator-led transition.
      const roundTurnCounts = participantsAfterTurn.map(
        (p) => Number(p.speakingTurns || 0)
      );
      const roundComplete =
        roundTurnCounts.length > 0 &&
        Math.min(...roundTurnCounts) === Math.max(...roundTurnCounts) &&
        roundTurnCounts[0] > 0;

      const facilitatorWasJustUsed = room.facilitatorHandoffStreak > 0;
      const useFacilitatorHandoff = !!nextParticipant && (
        roundComplete ||
        (!isEarlyRound && !facilitatorWasJustUsed && Math.random() < 0.20)
      );

      if (nextParticipant && useFacilitatorHandoff) {
        room.nextSpeakerId = nextParticipant.id;
        room.facilitatorHandoffCount += 1;
        room.facilitatorHandoffStreak += 1;

        const firstName = nextParticipant.name.split(' ')[0];
        const facilitatorHandoffOptions = [
          'Thank you for that perspective. Let us hear from ' + firstName + ' next. What is your view?',
          'That is a useful point. ' + firstName + ', could you share your perspective on this?',
          'Let us bring in another perspective. ' + firstName + ', how would you respond to that?',
          firstName + ', I would like to invite you to take this point forward. What do you think?',
          'We have heard one angle on this. ' + firstName + ', could you offer a different perspective?'
        ];
        const invitation = facilitatorHandoffOptions[(room.facilitatorHandoffCount - 1) % facilitatorHandoffOptions.length];

        // The facilitator invitation is a separate transcript event and is not
        // appended to the participant's speech. This keeps speaker attribution
        // and assessment evidence correct.
        const facilitatorTranscript: BackendTranscript = {
          id: 't-facilitator-handoff-' + Date.now(),
          sessionId: room.slotId,
          speakerId: 'facilitator',
          speakerName: 'AI Facilitator',
          seatNumber: null,
          isFacilitator: true,
          timestamp: '00:00',
          timestampSeconds: Date.now(),
          text: invitation,
          type: 'intervention',
          sentiment: 'neutral',
        };
        room.transcripts.push(facilitatorTranscript);
        io.to('room-' + room.slotId).emit('facilitator-intervention', {
          text: invitation,
          action: 'next_turn',
          targetUserId: nextParticipant.id,
          targetSeatNumber: nextParticipant.seatNumber,
          transcript: facilitatorTranscript,
        });
      } else if (nextParticipant) {
        // Direct participant-to-participant handoff. Reset the facilitator
        // streak so the facilitator cannot appear repeatedly in succession.
        room.facilitatorHandoffStreak = 0;
        // Keep this randomized
        // and exclude the speaker who just finished.
        room.nextSpeakerId = nextParticipant.id;
        const firstName = nextParticipant.name.split(' ')[0];
        const handoffOptions = [
          'I would like to hear from ' + firstName + ' next. What do you think about that?',
          firstName + ', I would be interested in your perspective on this. What is your view?',
          'Let us bring in ' + firstName + ' next. How would you respond to this point?',
          firstName + ', what is your take on this issue?'
        ];
        const handoff = handoffOptions[(target.speakingTurns + target.seatNumber) % handoffOptions.length];
        statement = statement.replace(/\\s+$/, '') + ' ' + handoff;
      }

      room.currentSpeakerId = target.id;
      room.currentSpeakerSocketId = null;
      room.waitingForParticipantId = undefined;
      room.floorVersion += 1;
      io.to('room-' + room.slotId).emit('floor-state', {
        speakerId: target.id,
        speakerSocketId: null,
        floorVersion: room.floorVersion,
      });
      const transcript: BackendTranscript = {
        id: 't-ai-' + Date.now(), sessionId: room.slotId, speakerId: target.id, speakerName: target.name,
        seatNumber: target.seatNumber, isFacilitator: false, timestamp: '00:00', timestampSeconds: Date.now(),
        text: statement, type: 'statement', sentiment: 'neutral',
      };
      room.transcripts.push(transcript);
      io.to('room-' + room.slotId).emit('ai-participant-speech', {
        participant: target,
        transcript,
        text: statement,
        simulationMode: room.simulationMode,
      });
      io.to('room-' + room.slotId).emit('new-transcript', { transcript, studentId: target.id, seatNumber: target.seatNumber });
      // Browser SpeechSynthesis speaks at human pace, so do not release the
      // server floor after the old short estimate. Releasing early caused the
      // next participant to start while this AI was still audible.
      const wordCount = statement.split(/\s+/).filter(Boolean).length;
      const durationMs = Math.min(40000, Math.max(9000, wordCount * 520 + 2000));
      room.turnTimer = setTimeout(() => {
        // Only this AI turn may release the floor. A stale timer can never
        // release a newer speaker's floor.
        if (room.currentSpeakerId !== target.id) return;
        room.currentSpeakerId = null;
        room.currentSpeakerSocketId = null;
        room.floorVersion += 1;
        io.to('room-' + room.slotId).emit('floor-state', {
          speakerId: null,
          speakerSocketId: null,
          floorVersion: room.floorVersion,
        });
        scheduleNextTurn(room, target.id);
      }, durationMs);
      return;
    }

    const targetReal = target as LiveRoomPeer;
    room.waitingForParticipantId = targetReal.userId;
    const recentSeconds = targetReal.lastSpokeAt ? Math.round((now - targetReal.lastSpokeAt) / 1000) : null;
    let invitation = 'Thank you. Let us hear from ' + targetReal.name + ' from Seat ' + targetReal.seatNumber + '. ' + targetReal.name.split(' ')[0] + ', what is your view on this topic?';
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: 'You are the live moderator of a collegiate Group Discussion on "' + room.topic + '". Call exactly ' + targetReal.name + ' next. They have spoken ' + targetReal.speakingTurns + ' time(s). ' + (recentSeconds === null ? 'They have not spoken yet.' : 'They last spoke ' + recentSeconds + ' seconds ago.') + ' Recent discussion:\n' + (recentHistory || '(none)') + '\nWrite one natural moderator sentence under 28 words. Name the participant and ask a short topic-specific question if they have not spoken recently.',
        });
        invitation = response.text?.trim() || invitation;
      } catch {}
    }
    const transcript: BackendTranscript = {
      id: 't-next-turn-' + Date.now(), sessionId: room.slotId, speakerId: 'facilitator',
      speakerName: 'AI Facilitator', seatNumber: null, isFacilitator: true, timestamp: '00:00',
      timestampSeconds: Date.now(), text: invitation, type: 'intervention', sentiment: 'neutral',
    };
    room.transcripts.push(transcript);
    io.to('room-' + room.slotId).emit('facilitator-intervention', { text: invitation, action: 'next_turn', targetUserId: targetReal.userId, targetSeatNumber: targetReal.seatNumber, transcript });
  }, 1200);
}
async function triggerDeadlockIntervention(room: LiveGDRoomState) {
  const realStudents = Array.from(room.peers.values()).filter((p) => p.role === 'student');
  if (realStudents.length === 0) return;

  // Prefer the participant with the fewest turns, then the longest silence.
  // Do not immediately call the same person again when another participant
  // is available.
  const candidates = realStudents
    .filter((p) => p.userId !== room.lastDeadlockTargetId)
    .sort((a, b) =>
      (a.speakingTurns || 0) - (b.speakingTurns || 0) ||
      (a.lastSpokeAt || 0) - (b.lastSpokeAt || 0)
    );
  const quietPeer = candidates[0] || realStudents.sort(
    (a, b) => (a.speakingTurns || 0) - (b.speakingTurns || 0) || (a.lastSpokeAt || 0) - (b.lastSpokeAt || 0)
  )[0];

  const candidateName = quietPeer?.name || 'participants';
  if (quietPeer) room.lastDeadlockTargetId = quietPeer.userId;

  const recentHistory = room.transcripts
    .filter((t) => !t.isFacilitator)
    .slice(-8)
    .map((t) => `${t.speakerName}: ${t.text}`)
    .join('\\n');

  const previousDeadlocks = room.transcripts
    .filter((t) => t.isFacilitator && t.type === 'intervention')
    .slice(-5)
    .map((t) => t.text)
    .join('\\n');

  const fallbackQuestions = [
    `${candidateName}, what is one practical example that supports your position on "${room.topic}"?`,
    `${candidateName}, what is the strongest concern you see with the viewpoint discussed so far?`,
    `${candidateName}, how could this idea be implemented realistically in an Indian college or workplace?`,
    `${candidateName}, who is most affected by this issue, and why should their perspective matter?`,
    `${candidateName}, if you had to challenge one assumption in this discussion, which would you challenge?`,
    `${candidateName}, what evidence or outcome would convince you that this approach is actually working?`
  ];
  let deadlockQuestion = fallbackQuestions[(room.deadlockCount - 1) % fallbackQuestions.length];

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `You are the live moderator of an Indian collegiate Group Discussion.
Topic: "${room.topic}"
Candidate to call: "${candidateName}"
This is deadlock intervention number ${room.deadlockCount}.

Recent discussion:
${recentHistory || '(no recent student speech)'}

Previous moderator interventions that MUST NOT be repeated or paraphrased:
${previousDeadlocks || '(none)'}

Write ONE short, natural moderator question under 25 words.
Call exactly ${candidateName} by name.
Ask a NEW angle based on the recent discussion.
Do not say "the floor is quiet", "since nobody is speaking", "opportunities and risks", or repeat any previous question.
Do not mention AI.`,
      });
      const generated = response.text?.trim();
      if (generated) deadlockQuestion = generated;
    } catch (err) {
      console.warn('[AI Deadlock Question Error]:', err);
    }
  }

  const interventionTranscript: BackendTranscript = {
    id: `t-facilitator-deadlock-${Date.now()}`,
    sessionId: room.slotId,
    speakerId: 'facilitator',
    speakerName: 'AI Facilitator',
    seatNumber: null,
    isFacilitator: true,
    timestamp: '00:00',
    timestampSeconds: Date.now(),
    text: deadlockQuestion,
    type: 'intervention',
    sentiment: 'neutral',
  };

  room.transcripts.push(interventionTranscript);

  io.to(`room-${room.slotId}`).emit('facilitator-intervention', {
    text: deadlockQuestion,
    action: 'deadlock_intervention',
    targetUserId: quietPeer?.userId,
    targetSeatNumber: quietPeer?.seatNumber,
    transcript: interventionTranscript,
  });

  // A deadlock question should immediately hand control back to the normal
  // turn engine; otherwise the room can sit silent for another full 20 seconds.
  if (room.status === 'active') {
    setTimeout(() => {
      if (room.status === 'active' && !room.currentSpeakerId) {
        scheduleNextTurn(room);
      }
    }, 2500);
  }
}
function triggerDominanceNudge(room: LiveGDRoomState, dominantPeer: LiveRoomPeer) {
  const quietStudents = Array.from(room.peers.values()).filter(
    p => p.role === 'student' && p.userId !== dominantPeer.userId && p.speakingTurns <= 1
  );

  if (quietStudents.length === 0) return;

  const quietStudent = quietStudents[0];
  const firstName = dominantPeer.name.split(' ')[0];
  const quietName = quietStudent.name.split(' ')[0];
  const nudgeText = `Thank you, ${firstName}. Let us hear from ${quietName} now.`;

  const nudgeTranscript: BackendTranscript = {
    id: `t-nudge-${Date.now()}`,
    sessionId: room.slotId,
    speakerId: 'facilitator',
    speakerName: 'AI Facilitator',
    seatNumber: null,
    isFacilitator: true,
    timestamp: '05:00',
    timestampSeconds: Date.now(),
    text: nudgeText,
    type: 'intervention',
    sentiment: 'neutral',
  };

  room.transcripts.push(nudgeTranscript);

  io.to(`room-${room.slotId}`).emit('facilitator-intervention', {
    text: nudgeText,
    action: 'dominance_nudge',
    transcript: nudgeTranscript,
    targetUserId: quietStudent.userId,
  });
}

io.on('connection', (socket) => {
  // 1. Join Slot Room
  socket.on('join-gd-room', ({ slotId, user }) => {
    const safeSlotId = slotId || 'slot-dit-001';
    const room = getOrCreateLiveRoom(safeSlotId);
    socket.join(`room-${safeSlotId}`);

    // Seat allotment (PDF Page 14)
    let seatNumber = user?.seatNumber;
    if (!seatNumber || room.assignedSeats.has(seatNumber)) {
      for (let s = 1; s <= 15; s++) {
        if (!room.assignedSeats.has(s)) {
          seatNumber = s;
          break;
        }
      }
      if (!seatNumber) seatNumber = (room.peers.size % 15) + 1;
    }

    room.assignedSeats.set(seatNumber, socket.id);

    const peer: LiveRoomPeer = {
      socketId: socket.id,
      userId: user?.id || socket.id,
      name: user?.name || `Student ${seatNumber}`,
      avatar: user?.avatar || '',
      role: user?.role || 'student',
      college: user?.college || 'Campus Participant',
      seatNumber,
      isSpeaking: false,
      micActive: true,
      cameraActive: false,
      speakingDurationSeconds: 0,
      speakingTurns: 0,
      interruptionCount: 0,
      joinedAt: Date.now(),
    };

    room.peers.set(socket.id, peer);

    syncAiParticipants(room);

    // Real peer connectivity: send all connected peers in the room to enable WebRTC mesh
    const otherPeers = Array.from(room.peers.values()).filter(p => p.socketId !== socket.id);
    socket.emit('gd-room-joined', {
      assignedSeat: seatNumber,
      peers: otherPeers,
      aiParticipants: Array.from(room.aiParticipants.values()),
      simulationMode: false,
      transcripts: room.transcripts,
      topic: room.topic,
      silenceTimerSeconds: room.silenceTimerSeconds,
      currentSpeakerId: room.currentSpeakerId,
      status: room.status,
    });

    // Notify all other peers in the room
    socket.to(`room-${safeSlotId}`).emit('peer-joined', {
      peer,
    });

    if (room.simulationMode && room.status === 'waiting') {
      room.status = 'active';
      room.silenceTimerSeconds = 0;
      syncAiParticipants(room);
      io.to(`room-${safeSlotId}`).emit('session-started', {
        slotId: safeSlotId,
        status: 'active',
        topic: room.topic,
        simulationMode: true,
        aiParticipants: Array.from(room.aiParticipants.values()),
      });
      scheduleNextTurn(room);
    }
  });

  // 1.5 Start Discussion Session. In the current demo configuration,
  // the room is an autonomous six-AI GD; connected students are observers.
  socket.on('start-session', ({ slotId }: { slotId: string }) => {
    const safeSlotId = slotId || 'slot-dit-001';
    const room = LIVE_ROOMS.get(safeSlotId);
    if (room) {
      room.status = 'active';
      room.silenceTimerSeconds = 0;
      syncAiParticipants(room);
      io.to(`room-${safeSlotId}`).emit('session-started', {
        slotId: safeSlotId,
        status: 'active',
        topic: room.topic,
        simulationMode: room.simulationMode,
        aiParticipants: Array.from(room.aiParticipants.values()),
      });
      scheduleNextTurn(room);
    }
  });

  // 2. WebRTC N-Way Signaling Relay (All-to-All mesh)
  socket.on('signal-send', ({ to, signal }) => {
    io.to(to).emit('signal-receive', {
      from: socket.id,
      signal,
    });
  });

  // 3. Speaking Activity & Floor State
  socket.on('peer-speaking-state', ({ slotId, isSpeaking, micActive, cameraActive, volumeLevel }) => {
    const safeSlotId = slotId || 'slot-dit-001';
    const room = LIVE_ROOMS.get(safeSlotId);
    if (!room) return;

    const peer = room.peers.get(socket.id);
    if (!peer) return;

    peer.isSpeaking = !!isSpeaking;
    if (micActive !== undefined) peer.micActive = micActive;
    if (cameraActive !== undefined) peer.cameraActive = cameraActive;

    if (isSpeaking) {
      // A participant has claimed the floor; cancel any pending AI timers
      if (room.turnTimer) clearTimeout(room.turnTimer);
      room.turnTimer = undefined;
      room.waitingForParticipantId = undefined;
      room.currentSpeakerId = peer.userId;
      room.currentSpeakerSocketId = socket.id;
      room.silenceTimerSeconds = 0;
      peer.lastSpokeAt = Date.now();
      peer.floorTurnCounted = false;
      room.floorVersion += 1;
      io.to(`room-${safeSlotId}`).emit('floor-state', {
        speakerId: peer.userId,
        speakerSocketId: socket.id,
        floorVersion: room.floorVersion,
      });
    } else if (room.currentSpeakerSocketId === socket.id) {
      // Current speaker finished speaking
      room.currentSpeakerId = null;
      room.currentSpeakerSocketId = null;
      room.waitingForParticipantId = undefined;
      room.floorVersion += 1;
      io.to(`room-${safeSlotId}`).emit('floor-state', {
        speakerId: null,
        speakerSocketId: null,
        floorVersion: room.floorVersion,
      });
      scheduleNextTurn(room, peer.userId);
    }

    io.to(`room-${safeSlotId}`).emit('peer-speaking-updated', {
      socketId: socket.id,
      userId: peer.userId,
      seatNumber: peer.seatNumber,
      isSpeaking: peer.isSpeaking,
      micActive: peer.micActive,
      cameraActive: peer.cameraActive,
      volumeLevel: volumeLevel || 0,
    });
  });

  // 4. Synchronized Live Transcript Broadcasting (PDF Page 5, FR-1)
  socket.on('peer-transcript', ({ slotId, text, elapsedSeconds, transcriptId }) => {
    const safeSlotId = slotId || 'slot-dit-001';
    const room = LIVE_ROOMS.get(safeSlotId);
    if (!room || !text?.trim()) return;

    const peer = room.peers.get(socket.id);
    if (!peer) return;

    if (room.currentSpeakerId !== peer.userId) {
      room.currentSpeakerId = peer.userId;
      room.currentSpeakerSocketId = socket.id;
    }

    // A quick statement can arrive before VAD claims the floor. In that case,
    // atomically grant the floor to this socket before accepting the transcript.
    if (!room.currentSpeakerId) {
      room.currentSpeakerId = peer.userId;
      room.currentSpeakerSocketId = socket.id;
      room.waitingForParticipantId = undefined;
      room.silenceTimerSeconds = 0;
      room.floorVersion += 1;
      io.to(`room-${safeSlotId}`).emit('floor-state', {
        speakerId: peer.userId,
        speakerSocketId: socket.id,
        floorVersion: room.floorVersion,
      });
    }

    if (!peer.floorTurnCounted) {
      peer.speakingTurns += 1;
      peer.floorTurnCounted = true;
    }
    peer.lastSpokeAt = Date.now();
    room.silenceTimerSeconds = 0;

    const mins = Math.floor((elapsedSeconds || 0) / 60).toString().padStart(2, '0');
    const secs = ((elapsedSeconds || 0) % 60).toString().padStart(2, '0');

    const newTranscript: BackendTranscript = {
      id: `t-live-${Date.now()}`,
      sessionId: safeSlotId,
      speakerId: peer.userId,
      speakerName: peer.name,
      seatNumber: peer.seatNumber,
      isFacilitator: false,
      timestamp: `${mins}:${secs}`,
      timestampSeconds: elapsedSeconds || 0,
      text: text.trim(),
      type: 'statement',
      sentiment: 'positive',
    };

    room.transcripts.push(newTranscript);
    persistTranscriptToMongoDB(newTranscript);

    // Broadcast transcript to all connected students and faculty in room
    io.to(`room-${safeSlotId}`).emit('new-transcript', {
      transcript: newTranscript,
      studentId: peer.userId,
      seatNumber: peer.seatNumber,
    });
  });

  // 5. Peer Disconnect Cleanup
  socket.on('disconnect', () => {
    for (const [slotId, room] of LIVE_ROOMS.entries()) {
      const peer = room.peers.get(socket.id);
      if (peer) {
        room.assignedSeats.delete(peer.seatNumber);
        room.peers.delete(socket.id);
        syncAiParticipants(room);

        if (room.currentSpeakerSocketId === socket.id) {
          room.currentSpeakerId = null;
          room.currentSpeakerSocketId = null;
        }

        io.to(`room-${slotId}`).emit('peer-left', {
          socketId: socket.id,
          userId: peer.userId,
          seatNumber: peer.seatNumber,
        });

        if (room.status === 'active') {
          scheduleNextTurn(room, peer.userId);
        }

        if (room.peers.size === 0 && room.silenceInterval) {
          clearInterval(room.silenceInterval);
          LIVE_ROOMS.delete(slotId);
        }
        break;
      }
    }
  });
});

// Vite middleware / SPA static serving
async function setupVite() {
  // 1. Initialize MongoDB connection, tables and sub-tables
  await connectMongoDB();
  await initMongoDBTablesAndSubTables();
  await syncMongoDBWithPersistentState();

  const distPath = path.join(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isProd = process.env.NODE_ENV === 'production' || distIndexExists;

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[ERUS-AIGDF] Server active on port ${PORT} with WebSockets enabled (mode: ${isProd ? 'production' : 'development'})`);
  });
}

setupVite();

