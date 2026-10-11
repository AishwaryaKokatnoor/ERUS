import mongoose, { Schema, Document, Model } from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Ensure Node uses reliable public DNS resolvers (Google & Cloudflare) for MongoDB SRV record resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (dnsErr: any) {
  console.warn('[MongoDB] Could not set custom DNS servers:', dnsErr.message);
}

// Disable automatic index building globally to prevent WiredTiger disk space threshold errors (code 14031) on limited-volume deployments
mongoose.set('autoIndex', false);

// =========================================================================
// MONGODB CONNECTION
// =========================================================================
let isConnected = false;
let lastMongoError: string | null = null;

export function getMongoLastError(): string | null {
  return lastMongoError;
}

export function getActiveMongoUri(): string {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URL ||
    'mongodb://127.0.0.1:27017/erus'
  ).trim();
}

function candidateMongoUris(raw: string): string[] {
  const list: string[] = [];
  const trimmed = raw.trim();
  if (!trimmed) return ['mongodb://127.0.0.1:27017/erus'];

  // 1. Direct user-provided URI should always be attempted first
  list.push(trimmed);

  // 2. If it's a mongodb:// URI (like Railway internal or localhost) with credentials
  if (trimmed.startsWith('mongodb://') && trimmed.includes('@')) {
    const withoutQuery = trimmed.split('?')[0].replace(/\/+$/, '');
    const queryPart = trimmed.split('?')[1] || '';
    const hasPath = /:\d+\/[^/?]+/.test(withoutQuery);

    if (!hasPath) {
      const q = queryPart
        ? (queryPart.includes('authSource=') ? queryPart : `${queryPart}&authSource=admin`)
        : 'authSource=admin';
      list.push(`${withoutQuery}/erus?${q}`);
      list.push(`${withoutQuery}/railway?${q}`);
    } else if (!trimmed.includes('authSource=')) {
      const separator = trimmed.includes('?') ? '&' : '?';
      list.push(`${trimmed}${separator}authSource=admin`);
    }
  }

  // 3. If it's a mongodb+srv:// URI with no path before ? (e.g. mongodb+srv://host/?)
  if (trimmed.startsWith('mongodb+srv://')) {
    const withoutQuery = trimmed.split('?')[0].replace(/\/+$/, '');
    const queryPart = trimmed.split('?')[1] ? `?${trimmed.split('?')[1]}` : '';
    // Check if path has a DB name (e.g. host.net/erus vs host.net)
    const hostPart = withoutQuery.replace('mongodb+srv://', '');
    if (!hostPart.includes('/')) {
      list.unshift(`${withoutQuery}/erus${queryPart}`);
    }
  }

  return list;
}

export async function connectMongoDB(): Promise<boolean> {
  if (isConnected && mongoose.connection.readyState === 1) return true;

  const rawUri = getActiveMongoUri();
  const candidates = candidateMongoUris(rawUri);

  for (const uri of candidates) {
    const masked = uri.includes('@')
      ? uri.replace(/:([^:@]+)@/, ':****@')
      : uri;

    try {
      console.log(`[MongoDB] Attempting connection to ${masked}...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        autoIndex: false,
      });
      isConnected = true;
      lastMongoError = null;
      console.log(`[MongoDB] Successfully connected to MongoDB (database: ${mongoose.connection.name || 'erus'})`);
      return true;
    } catch (err: any) {
      lastMongoError = err.message || String(err);
      console.warn(`[MongoDB] Connection attempt to ${masked} failed: ${lastMongoError}`);
    }
  }

  // Local fallback if target was local
  if (rawUri.includes('localhost') || rawUri.includes('127.0.0.1')) {
    try {
      const fallbackUri = 'mongodb://127.0.0.1:27017/erus';
      await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      lastMongoError = null;
      console.log(`[MongoDB] Successfully connected to MongoDB via 127.0.0.1:27017`);
      return true;
    } catch (fallbackErr: any) {
      lastMongoError = fallbackErr.message;
      isConnected = false;
      return false;
    }
  }

  isConnected = false;
  return false;
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
  studentLimit?: number;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
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
    studentLimit: { type: Number, default: 60 },
    adminEmail: { type: String, default: '' },
    adminName: { type: String, default: '' },
    adminPassword: { type: String, default: '' },
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
  students?: any[];
  recordingUrl?: string;
  recordingDurationSeconds?: number;
  recordingFileSize?: number;
  recordedAt?: Date;
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
    students: { type: [Schema.Types.Mixed] as any, default: [] },
    recordingUrl: { type: String, default: '' },
    recordingDurationSeconds: { type: Number, default: 0 },
    recordingFileSize: { type: Number, default: 0 },
    recordedAt: { type: Date, default: null },
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
  seatNumber?: number | null;
  topic?: string;
  overallScore: number;
  grade?: string;
  speakingDurationSeconds?: number;
  speakingTimeFormatted?: string;
  speakingTurns?: number;
  wpm?: number;
  wpmStatus?: string;
  fillerWordsCount?: number;
  fillerWordsBreakdown?: any[];
  interruptionCount?: number;
  questionsAnswered?: number;
  questionsInitiated?: number;
  rubricJson: any; // 7 parameters: English, Fluency, Clarity, Confidence, Content, Collaboration, Leadership
  feedback: string;
  strengths?: string[];
  improvements?: string[];
  aiRecommendations?: string[];
  fullReportJson?: any;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentReportSchema = new Schema<IAssessmentReport>(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true }, // Sub-table reference
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    seatNumber: { type: Number, default: null },
    topic: { type: String, default: '' },
    overallScore: { type: Number, default: 80 },
    grade: { type: String, default: 'Good' },
    speakingDurationSeconds: { type: Number, default: 0 },
    speakingTimeFormatted: { type: String, default: '0 min 0 sec' },
    speakingTurns: { type: Number, default: 0 },
    wpm: { type: Number, default: 0 },
    wpmStatus: { type: String, default: 'Optimal' },
    fillerWordsCount: { type: Number, default: 0 },
    fillerWordsBreakdown: { type: [Schema.Types.Mixed] as any, default: [] },
    interruptionCount: { type: Number, default: 0 },
    questionsAnswered: { type: Number, default: 0 },
    questionsInitiated: { type: Number, default: 0 },
    rubricJson: { type: Schema.Types.Mixed, default: {} },
    feedback: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    aiRecommendations: { type: [String], default: [] },
    fullReportJson: { type: Schema.Types.Mixed, default: {} },
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
// 7. SYSTEM STATE & GLOBAL CONFIGURATION (MongoDB Persistence)
// =========================================================================
export interface ISystemState extends Document {
  key: string; // 'global'
  deletedSlotIds: string[];
  slotsInitializedColleges: Record<string, boolean>;
  studentBookings: Record<string, string>;
  studentTopicBookings: Record<string, Record<string, string>>;
  recordings: Record<string, any>;
  systemSettings: {
    dailyUserLimit: number;
    maxConcurrentUsers: number;
    enforceDailyLimit: boolean;
    lastResetDate: string;
    activeUsersToday: string[];
    updatedAt: string;
  };
  updatedAt: Date;
}

const SystemStateSchema = new Schema<ISystemState>(
  {
    key: { type: String, required: true, unique: true, default: 'global', index: true },
    deletedSlotIds: { type: [String], default: [] },
    slotsInitializedColleges: { type: Schema.Types.Mixed, default: {} },
    studentBookings: { type: Schema.Types.Mixed, default: {} },
    studentTopicBookings: { type: Schema.Types.Mixed, default: {} },
    recordings: { type: Schema.Types.Mixed, default: {} },
    systemSettings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'system_state', autoIndex: false }
);

export const SystemStateModel: Model<ISystemState> =
  mongoose.models.SystemState || mongoose.model<ISystemState>('SystemState', SystemStateSchema);

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
  console.log('[MongoDB] 7. System Table:  system_state (Global settings & bookings)');
  console.log('[MongoDB] ==========================================\n');

  try {
    // 1. Legacy dummy-data cleanup is opt-in only. Startup must never delete
    // real users, sessions, transcripts, bookings, or assessment history.
    if (process.env.ERUS_PURGE_LEGACY_DUMMY_DATA === 'true') {
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
      console.warn('[MongoDB] ERUS_PURGE_LEGACY_DUMMY_DATA=true; configured legacy records were purged.');
    } else {
      console.log('[MongoDB] Legacy cleanup skipped; set ERUS_PURGE_LEGACY_DUMMY_DATA=true only for an intentional maintenance operation.');
    }

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
