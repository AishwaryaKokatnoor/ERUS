import mongoose, { Schema, Document, Model } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Disable automatic index building globally to prevent WiredTiger disk space threshold errors (code 14031) on limited-volume deployments
mongoose.set('autoIndex', false);

// =========================================================================
// MONGODB CONNECTION
// =========================================================================
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URL ||
  'mongodb://127.0.0.1:27017/erus';

let isConnected = false;

export async function connectMongoDB(): Promise<boolean> {
  if (isConnected) return true;

  try {
    const maskedUri = MONGODB_URI.includes('@')
      ? MONGODB_URI.replace(/:([^:@]+)@/, ':****@')
      : MONGODB_URI;
    console.log(`[MongoDB] Connecting to database at ${maskedUri}...`);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      autoIndex: false,
    });
    isConnected = true;
    console.log(`[MongoDB] Successfully connected to MongoDB (database: ${mongoose.connection.name || 'erus'})`);
    return true;
  } catch (err: any) {
    if (MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1')) {
      console.warn(`[MongoDB] Local connection warning (${err.message}). Attempting fallback to 127.0.0.1...`);
      try {
        const fallbackUri = 'mongodb://127.0.0.1:27017/erus';
        await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 5000,
        });
        isConnected = true;
        console.log(`[MongoDB] Successfully connected to MongoDB via 127.0.0.1:27017`);
        return true;
      } catch (fallbackErr: any) {
        console.warn(`[MongoDB] Could not connect to local MongoDB: ${fallbackErr.message}`);
        isConnected = false;
        return false;
      }
    } else {
      console.warn(`[MongoDB] Remote MongoDB connection error: ${err.message}. Server will continue in resilient fallback mode.`);
      isConnected = false;
      return false;
    }
  }
}

export function isMongoConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

// =========================================================================
// 1. PRIMARY TABLE (PARENT): COLLEGES
// =========================================================================
export interface ICollege extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const CollegeSchema = new Schema<ICollege>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, index: true },
    contactEmail: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    status: { type: String, default: 'active' },
    studentCount: { type: Number, default: 0 },
    facultyCount: { type: Number, default: 0 },
    slotCount: { type: Number, default: 0 },
    adminEmail: { type: String, default: '' },
    adminName: { type: String, default: '' },
  },
  { timestamps: true, collection: 'colleges', autoIndex: false }
);

export const CollegeModel: Model<ICollege> =
  mongoose.models.College || mongoose.model<ICollege>('College', CollegeSchema);

// =========================================================================
// 2. PRIMARY TABLE (PARENT): USERS & SUB-TABLE PROFILES
// =========================================================================
export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'super_admin' | 'college_admin' | 'faculty' | 'student';
  college: string;
  collegeCode?: string;
  avatar?: string;
  // Sub-table Profile Documents
  studentProfile?: {
    studentId: string;
    course: string;
    batch: string;
    seatNumber: number;
  };
  facultyProfile?: {
    facultyId: string;
    department: string;
    designation: string;
  };
  collegeAdminProfile?: {
    adminId: string;
    department: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'college_admin', 'faculty', 'student'],
      index: true,
    },
    college: { type: String, required: true },
    collegeCode: { type: String, default: 'DIT', index: true },
    avatar: { type: String, default: '' },
    // Sub-Table: Student Profile
    studentProfile: {
      studentId: { type: String },
      course: { type: String, default: 'B.Tech CSE' },
      batch: { type: String, default: '2022-2026' },
      seatNumber: { type: Number, default: 1 },
    },
    // Sub-Table: Faculty Profile
    facultyProfile: {
      facultyId: { type: String },
      department: { type: String, default: 'Department of Computer Science & Engineering' },
      designation: { type: String, default: 'Faculty Member' },
    },
    // Sub-Table: College Admin Profile
    collegeAdminProfile: {
      adminId: { type: String },
      department: { type: String, default: 'Academic Administration' },
    },
  },
  { timestamps: true, collection: 'users', autoIndex: false }
);

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

// =========================================================================
// 3. PRIMARY TABLE (PARENT): GD SESSIONS / SLOTS
// =========================================================================
export interface IGDSession extends Document {
  id: string; // e.g. "slot-dit-001", "session-101"
  slotName: string;
  topic: string;
  description: string;
  slotTiming: string;
  slotDate: string;
  status: 'scheduled' | 'active' | 'completed';
  currentPhase: 'intro' | 'rules' | 'active_discussion' | 'probing' | 'conclusion';
  durationMinutes: number;
  maxCapacity: number;
  enrolledCount: number;
  collegeCode: string;
  assignedFacultyId?: string;
  assignedFacultyName?: string;
  assignedFacultyEmail?: string;
  assignedFacultyDept?: string;
  facilitatorSpeech?: string;
  facilitatorAction?: string;
  isFacilitatorSpeaking?: boolean;
  silenceTimerSeconds?: number;
  currentSpeakerId?: string | null;
  startedAt?: number;
  createdAt: Date;
  updatedAt: Date;
}

const GDSessionSchema = new Schema<IGDSession>(
  {
    id: { type: String, required: true, unique: true, index: true },
    slotName: { type: String, required: true },
    topic: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    slotTiming: { type: String, default: '10:00 AM - 10:30 AM' },
    slotDate: { type: String, default: 'Today' },
    status: {
      type: String,
      required: true,
      enum: ['scheduled', 'active', 'completed'],
      default: 'scheduled',
      index: true,
    },
    currentPhase: {
      type: String,
      enum: ['intro', 'rules', 'active_discussion', 'probing', 'conclusion'],
      default: 'intro',
    },
    durationMinutes: { type: Number, default: 25 },
    maxCapacity: { type: Number, default: 15 },
    enrolledCount: { type: Number, default: 0 },
    collegeCode: { type: String, default: 'DIT', index: true },
    assignedFacultyId: { type: String, default: '' },
    assignedFacultyName: { type: String, default: '' },
    assignedFacultyEmail: { type: String, default: '' },
    assignedFacultyDept: { type: String, default: '' },
    facilitatorSpeech: { type: String, default: '' },
    facilitatorAction: { type: String, default: '' },
    isFacilitatorSpeaking: { type: Boolean, default: false },
    silenceTimerSeconds: { type: Number, default: 0 },
    currentSpeakerId: { type: String, default: null },
    startedAt: { type: Number, default: Date.now },
  },
  { timestamps: true, collection: 'gd_sessions', autoIndex: false }
);

export const GDSessionModel: Model<IGDSession> =
  mongoose.models.GDSession || mongoose.model<IGDSession>('GDSession', GDSessionSchema);

// =========================================================================
// 4. SUB-TABLE (CHILD): GD TRANSCRIPTS (Parent: gd_sessions)
// =========================================================================
export interface ITranscriptEntry extends Document {
  id: string;
  sessionId: string; // Foreign key referencing gd_sessions.id
  speakerId: string;
  speakerName: string;
  seatNumber?: number | null;
  isFacilitator: boolean;
  timestamp: string;
  timestampSeconds: number;
  text: string;
  type: string; // 'statement' | 'question' | 'summary' | 'greeting'
  sentiment: string; // 'positive' | 'neutral' | 'constructive'
  createdAt: Date;
}

const TranscriptEntrySchema = new Schema<ITranscriptEntry>(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true }, // Sub-table reference
    speakerId: { type: String, required: true, index: true },
    speakerName: { type: String, required: true },
    seatNumber: { type: Number, default: null },
    isFacilitator: { type: Boolean, default: false },
    timestamp: { type: String, default: () => new Date().toLocaleTimeString() },
    timestampSeconds: { type: Number, default: 0 },
    text: { type: String, required: true },
    type: { type: String, default: 'statement' },
    sentiment: { type: String, default: 'neutral' },
  },
  { timestamps: true, collection: 'gd_transcripts', autoIndex: false }
);

export const TranscriptEntryModel: Model<ITranscriptEntry> =
  mongoose.models.TranscriptEntry ||
  mongoose.model<ITranscriptEntry>('TranscriptEntry', TranscriptEntrySchema);

// =========================================================================
// 5. SUB-TABLE (CHILD): ASSESSMENT REPORTS (Parent: gd_sessions)
// =========================================================================
export interface IAssessmentReport extends Document {
  id: string;
  sessionId: string; // Foreign key referencing gd_sessions.id
  studentId: string; // Foreign key referencing users.id
  studentName?: string;
  overallScore: number;
  rubricJson: any; // 7 parameters: English, Fluency, Clarity, Confidence, Content, Collaboration, Leadership
  feedback: string;
  strengths?: string[];
  improvements?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentReportSchema = new Schema<IAssessmentReport>(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true }, // Sub-table reference
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    overallScore: { type: Number, default: 80 },
    rubricJson: { type: Schema.Types.Mixed, default: {} },
    feedback: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'assessment_reports', autoIndex: false }
);

export const AssessmentReportModel: Model<IAssessmentReport> =
  mongoose.models.AssessmentReport ||
  mongoose.model<IAssessmentReport>('AssessmentReport', AssessmentReportSchema);

// =========================================================================
// 6. SUB-TABLE (CHILD): GD BOOKINGS (Parent: gd_sessions & users)
// =========================================================================
export interface IGDBooking extends Document {
  id: string;
  sessionId: string; // Foreign key referencing gd_sessions.id
  studentId: string; // Foreign key referencing users.id
  topic?: string;
  status: 'BOOKED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  bookedAt: Date;
  updatedAt: Date;
}

const GDBookingSchema = new Schema<IGDBooking>(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true }, // Sub-table reference
    studentId: { type: String, required: true, index: true },
    topic: { type: String, default: '' },
    status: {
      type: String,
      required: true,
      enum: ['BOOKED', 'LIVE', 'COMPLETED', 'CANCELLED'],
      default: 'BOOKED',
      index: true,
    },
    bookedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'gd_bookings', autoIndex: false }
);

export const GDBookingModel: Model<IGDBooking> =
  mongoose.models.GDBooking || mongoose.model<IGDBooking>('GDBooking', GDBookingSchema);

// =========================================================================
// INITIALIZATION: CREATE TABLES, SUB-TABLES & SEED AUTHORITATIVE DATA
// =========================================================================
export async function initMongoDBTablesAndSubTables(): Promise<void> {
  const connected = await connectMongoDB();
  if (!connected) {
    console.warn('[MongoDB] Database not connected. Tables and sub-tables will initialize once connected.');
    return;
  }

  console.log('\n[MongoDB] ==========================================');
  console.log('[MongoDB] Initializing Tables and Sub-Tables in "erus" DB:');
  console.log('[MongoDB] 1. Primary Table: colleges');
  console.log('[MongoDB] 2. Primary Table: users (with Student/Faculty/Admin sub-profiles)');
  console.log('[MongoDB] 3. Primary Table: gd_sessions (Parent Table)');
  console.log('[MongoDB] 4. Sub-Table:     gd_transcripts (Child of gd_sessions)');
  console.log('[MongoDB] 5. Sub-Table:     assessment_reports (Child of gd_sessions)');
  console.log('[MongoDB] 6. Sub-Table:     gd_bookings (Child of gd_sessions & users)');
  console.log('[MongoDB] ==========================================\n');

  try {
    // 1. Seed Default Colleges (Parent Table)
    const collegeCount = await CollegeModel.countDocuments();
    if (collegeCount === 0) {
      console.log('[MongoDB] Seeding Primary Table: colleges...');
      await CollegeModel.create([
        {
          id: 'col-1',
          name: 'Delhi Institute of Technology',
          code: 'DIT',
          contactEmail: 'admin@dit.edu.in',
          phone: '+91 11 2659 1000',
          address: 'Hauz Khas, New Delhi',
          status: 'active',
          studentCount: 3,
          facultyCount: 2,
          slotCount: 2,
          adminEmail: 'admin@dit.edu.in',
          adminName: 'DIT College Administrator',
        },
        {
          id: 'col-2',
          name: 'Indian Institute of Technology Bombay',
          code: 'IITB',
          contactEmail: 'admin@iitb.ac.in',
          phone: '+91 22 2572 2545',
          address: 'Powai, Mumbai',
          status: 'active',
          studentCount: 2,
          facultyCount: 1,
          slotCount: 1,
          adminEmail: 'admin@iitb.ac.in',
          adminName: 'IITB Academic Admin',
        },
      ]);
      console.log('[MongoDB] Primary Table colleges seeded successfully.');
    }

    // 3. Seed Default Users (Parent Table) with Sub-Table Profiles
    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      console.log('[MongoDB] Seeding Primary Table: users & profile sub-tables...');
      await UserModel.create([
        {
          id: 'sa-1',
          name: 'Platform Super Admin',
          email: 'superadmin@erus.ai',
          password: 'admin123',
          role: 'super_admin',
          college: 'ERUS Global Administration',
        },
        {
          id: 'ca-1',
          name: 'DIT College Administrator',
          email: 'admin@dit.edu.in',
          password: 'college123',
          role: 'college_admin',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          collegeAdminProfile: {
            adminId: 'CADM-DIT-001',
            department: 'Academic Administration',
          },
        },
        {
          id: 'fac-1',
          name: 'Dr. Sunita Rao',
          email: 'sunita.rao@dit.edu.in',
          password: 'faculty123',
          role: 'faculty',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          facultyProfile: {
            facultyId: 'FAC-CSE-102',
            department: 'Department of Computer Science & Engineering',
            designation: 'Professor & Head of Department',
          },
        },
        {
          id: 'fac-2',
          name: 'Prof. Rajesh Verma',
          email: 'rajesh.verma@dit.edu.in',
          password: 'faculty123',
          role: 'faculty',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          facultyProfile: {
            facultyId: 'FAC-MGT-205',
            department: 'School of Management',
            designation: 'Dean of Academic Affairs',
          },
        },
        {
          id: 's1',
          name: 'Rahul Kumar',
          email: 'rahul.kumar@dit.edu.in',
          password: 'password123',
          role: 'student',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          studentProfile: {
            studentId: 'STU-2022-041',
            course: 'B.Tech CSE',
            batch: '2022-2026',
            seatNumber: 1,
          },
        },
        {
          id: 's2',
          name: 'Neha Gupta',
          email: 'neha.gupta@dit.edu.in',
          password: 'password123',
          role: 'student',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          studentProfile: {
            studentId: 'STU-2022-072',
            course: 'B.Tech IT',
            batch: '2022-2026',
            seatNumber: 2,
          },
        },
        {
          id: 's3',
          name: 'Aditya Singh',
          email: 'aditya.singh@dit.edu.in',
          password: 'password123',
          role: 'student',
          college: 'Delhi Institute of Technology',
          collegeCode: 'DIT',
          studentProfile: {
            studentId: 'STU-2022-094',
            course: 'B.Tech ECE',
            batch: '2022-2026',
            seatNumber: 3,
          },
        },
      ]);
      console.log('[MongoDB] Primary Table users seeded successfully.');
    }

    // 4. Seed Default GD Sessions (Parent Table)
    const sessionCount = await GDSessionModel.countDocuments();
    if (sessionCount === 0) {
      console.log('[MongoDB] Seeding Primary Table: gd_sessions (Parent Table)...');
      await GDSessionModel.create([
        {
          id: 'slot-dit-001',
          slotName: 'Slot 1: AI Ethics & Hiring Transformation',
          topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
          description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
          slotTiming: '10:30 AM - 10:45 AM',
          slotDate: 'Today',
          status: 'scheduled',
          currentPhase: 'intro',
          durationMinutes: 15,
          enrolledCount: 1,
          maxCapacity: 15,
          collegeCode: 'DIT',
          assignedFacultyId: 'FAC-CSE-102',
          assignedFacultyName: 'Dr. Sunita Rao',
          assignedFacultyEmail: 'sunita.rao@dit.edu.in',
          assignedFacultyDept: 'Department of Computer Science & Engineering',
          facilitatorSpeech: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation.',
          facilitatorAction: 'Waiting for room start',
          isFacilitatorSpeaking: false,
        },
        {
          id: 'session-101',
          slotName: 'Live Session: Generative AI Discussion',
          topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
          description: 'Autonomous AI evaluation of technical argumentation, structured thinking, and empathy.',
          slotTiming: '10:00 AM - 10:30 AM',
          slotDate: 'Today',
          status: 'active',
          currentPhase: 'active_discussion',
          durationMinutes: 25,
          enrolledCount: 3,
          maxCapacity: 15,
          collegeCode: 'DIT',
          assignedFacultyId: 'FAC-CSE-102',
          assignedFacultyName: 'Dr. Sunita Rao',
          assignedFacultyEmail: 'sunita.rao@dit.edu.in',
          assignedFacultyDept: 'Department of Computer Science & Engineering',
          facilitatorSpeech: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation from syntax memorization to architectural thinking. The floor is open.',
          facilitatorAction: 'Moderating discussion flow',
          isFacilitatorSpeaking: false,
        },
        {
          id: 'slot-teachers-1',
          slotName: 'Slot 1 - Morning Batch',
          topic: 'Should Artificial Intelligence replace teachers in Higher Education?',
          description: 'Debating cognitive personalization algorithms versus empathetic educator mentoring in higher technical education.',
          slotTiming: '11:30 AM - 12:00 PM',
          slotDate: 'Today',
          status: 'scheduled',
          currentPhase: 'intro',
          durationMinutes: 25,
          enrolledCount: 0,
          maxCapacity: 15,
          collegeCode: 'DIT',
          assignedFacultyId: 'FAC-MGT-205',
          assignedFacultyName: 'Prof. Rajesh Verma',
          assignedFacultyEmail: 'rajesh.verma@dit.edu.in',
          assignedFacultyDept: 'School of Management',
          facilitatorSpeech: 'Good morning participants. Today we debate whether AI can substitute teachers in higher education.',
          facilitatorAction: 'Waiting for room start',
          isFacilitatorSpeaking: false,
        },
      ]);
      console.log('[MongoDB] Primary Table gd_sessions seeded successfully.');
    }

    // 5. Seed Sub-Table: gd_transcripts (Child of gd_sessions)
    const transcriptCount = await TranscriptEntryModel.countDocuments();
    if (transcriptCount === 0) {
      console.log('[MongoDB] Seeding Sub-Table: gd_transcripts (Child of gd_sessions)...');
      await TranscriptEntryModel.create([
        {
          id: 't-init-1',
          sessionId: 'session-101', // References parent gd_sessions.id
          speakerId: 'facilitator-ai',
          speakerName: 'Dr. Sunita Rao (AI Facilitator)',
          seatNumber: null,
          isFacilitator: true,
          timestamp: '10:00:15 AM',
          timestampSeconds: 15,
          text: 'Welcome participants. Today we analyze how generative AI is shifting tech talent evaluation from syntax memorization to architectural thinking. The floor is open.',
          type: 'greeting',
          sentiment: 'neutral',
        },
        {
          id: 't-init-2',
          sessionId: 'session-101', // References parent gd_sessions.id
          speakerId: 's1',
          speakerName: 'Rahul Kumar',
          seatNumber: 1,
          isFacilitator: false,
          timestamp: '10:00:45 AM',
          timestampSeconds: 45,
          text: 'I believe generative AI tools like GitHub Copilot allow developers to focus higher-level system design rather than boilerplate code.',
          type: 'statement',
          sentiment: 'positive',
        },
      ]);
      console.log('[MongoDB] Sub-Table gd_transcripts seeded successfully.');
    }

    // 6. Seed Sub-Table: gd_bookings (Child of gd_sessions & users)
    const bookingCount = await GDBookingModel.countDocuments();
    if (bookingCount === 0) {
      console.log('[MongoDB] Seeding Sub-Table: gd_bookings (Child of gd_sessions)...');
      await GDBookingModel.create([
        {
          id: 'b-s1-slot-dit-001',
          sessionId: 'slot-dit-001', // References parent gd_sessions.id
          studentId: 's1', // References parent users.id
          topic: 'Impact of Generative AI on Tech Hiring & Software Engineering',
          status: 'BOOKED',
          bookedAt: new Date(),
        },
      ]);
      console.log('[MongoDB] Sub-Table gd_bookings seeded successfully.');
    }

    // 7. Seed Sub-Table: assessment_reports (Child of gd_sessions)
    const reportCount = await AssessmentReportModel.countDocuments();
    if (reportCount === 0) {
      console.log('[MongoDB] Seeding Sub-Table: assessment_reports (Child of gd_sessions)...');
      await AssessmentReportModel.create([
        {
          id: 'rep-s1-session-101',
          sessionId: 'session-101', // References parent gd_sessions.id
          studentId: 's1', // References parent users.id
          studentName: 'Rahul Kumar',
          overallScore: 86,
          rubricJson: {
            englishCommunication: 88,
            fluency: 84,
            clarity: 87,
            confidence: 85,
            contentKnowledge: 89,
            collaboration: 85,
            leadership: 84,
          },
          feedback: 'Rahul demonstrated solid technical depth and clear opening argumentation on AI development practices.',
          strengths: ['Clear articulate delivery', 'Strong conceptual foundation in software engineering'],
          improvements: ['Engage more proactively in collaborative rebuttal and questioning peers'],
        },
      ]);
      console.log('[MongoDB] Sub-Table assessment_reports seeded successfully.');
    }

    const counts = {
      colleges: await CollegeModel.countDocuments(),
      users: await UserModel.countDocuments(),
      gd_sessions: await GDSessionModel.countDocuments(),
      gd_transcripts: await TranscriptEntryModel.countDocuments(),
      assessment_reports: await AssessmentReportModel.countDocuments(),
      gd_bookings: await GDBookingModel.countDocuments(),
    };

    console.log('[MongoDB] Database ready! Verified table and sub-table document counts:');
    console.log(JSON.stringify(counts, null, 2));
  } catch (err: any) {
    console.error('[MongoDB] Error during table/sub-table initialization:', err);
  }
}
