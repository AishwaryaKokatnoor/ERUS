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
    // 1. Purge legacy dummy mock records from database if present
    const legacyDummyUserIds = ['ca-1', 'fac-1', 'fac-2', 's1', 's2', 's3'];
    const legacyDummyEmails = [
      'admin@dit.edu.in',
      'sunita.rao@dit.edu.in',
      'rajesh.verma@dit.edu.in',
      'rahul.kumar@dit.edu.in',
      'neha.gupta@dit.edu.in',
      'aditya.singh@dit.edu.in',
    ];
    await UserModel.deleteMany({
      $or: [{ id: { $in: legacyDummyUserIds } }, { email: { $in: legacyDummyEmails } }],
    });

    const legacyDummyCollegeCodes = ['DIT', 'IITB'];
    await CollegeModel.deleteMany({
      $or: [{ code: { $in: legacyDummyCollegeCodes } }, { id: { $in: ['col-1', 'col-2'] } }],
    });

    const legacyDummySessionIds = ['slot-dit-001', 'session-101', 'slot-teachers-1', 'slot-dit-0700'];
    await GDSessionModel.deleteMany({
      $or: [
        { id: { $in: legacyDummySessionIds } },
        { collegeCode: { $in: legacyDummyCollegeCodes } },
        { assignedFacultyEmail: { $in: legacyDummyEmails } },
      ],
    });
    await TranscriptEntryModel.deleteMany({
      $or: [
        { id: { $in: ['t-init-1', 't-init-2', 't-live-test-001'] } },
        { speakerName: 'Rahul Kumar' },
        { speakerId: { $in: legacyDummyUserIds } },
      ],
    });
    await GDBookingModel.deleteMany({
      $or: [
        { id: { $in: ['b-s1-slot-dit-001', 'bk-s3-slot-teachers-1', 'bk-s1-slot-dit-0700'] } },
        { studentId: { $in: legacyDummyUserIds } },
      ],
    });
    await AssessmentReportModel.deleteMany({
      $or: [
        { id: { $in: ['rep-s1-session-101', 'rep-live-test-001'] } },
        { studentName: 'Rahul Kumar' },
        { studentId: { $in: legacyDummyUserIds } },
      ],
    });

    // 2. Ensure Super Admin account exists in users collection
    const superAdminExists = await UserModel.findOne({
      $or: [{ role: 'super_admin' }, { email: 'superadmin@erus.ai' }],
    });
    if (!superAdminExists) {
      console.log('[MongoDB] Creating Platform Super Admin account...');
      await UserModel.create({
        id: 'sa-1',
        name: 'Platform Super Admin',
        email: 'superadmin@erus.ai',
        password: 'admin123',
        role: 'super_admin',
        college: 'ERUS Global Administration',
      });
      console.log('[MongoDB] Platform Super Admin account initialized.');
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
