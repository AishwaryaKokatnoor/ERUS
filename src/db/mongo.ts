import mongoose, { Schema, Document, Model } from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Ensure Node uses reliable public DNS resolvers (Google & Cloudflare) for MongoDB SRV & shard host resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  const origLookup = dns.lookup.bind(dns);
  (dns as any).lookup = function (hostname: string, options: any, callback?: any) {
    let cb = callback;
    let opts = options;
    if (typeof options === 'function') {
      cb = options;
      opts = {};
    } else if (typeof options === 'number') {
      opts = { family: options };
    }
    return origLookup(hostname, opts, (err: any, address: any, family: any) => {
      if (!err) {
        return cb(null, address, family);
      }
      // Fallback to c-ares dns.resolve4 (which uses 8.8.8.8 / 1.1.1.1) if OS getaddrinfo fails
      dns.resolve4(hostname, (resErr, addresses) => {
        if (!resErr && addresses && addresses.length > 0) {
          if (opts && opts.all) {
            return cb(
              null,
              addresses.map((a) => ({ address: a, family: 4 }))
            );
          }
          return cb(null, addresses[0], 4);
        }
        return cb(err, address, family);
      });
    });
  };
} catch (dnsErr: any) {
  console.warn('[MongoDB] Could not configure custom DNS fallback:', dnsErr.message);
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

  // 1. If it's a mongodb:// URI (like Railway internal or localhost) with credentials
  if (trimmed.startsWith('mongodb://') && trimmed.includes('@')) {
    const withoutQuery = trimmed.split('?')[0].replace(/\/+$/, '');
    const queryPart = trimmed.split('?')[1] || '';
    const hasPath = /:\d+\/[^/?]+/.test(withoutQuery);

    if (!hasPath) {
      const q = queryPart
        ? (queryPart.includes('authSource=') ? queryPart : `${queryPart}&authSource=admin`)
        : 'authSource=admin';
      // Prioritize /erus with authSource=admin so Mongoose connects to the erus database rather than default "test"
      list.push(`${withoutQuery}/erus?${q}`);
      list.push(`${withoutQuery}/railway?${q}`);
      list.push(trimmed);
    } else if (!trimmed.includes('authSource=')) {
      const separator = trimmed.includes('?') ? '&' : '?';
      list.push(`${trimmed}${separator}authSource=admin`);
      list.push(trimmed);
    } else {
      list.push(trimmed);
    }
  } else if (trimmed.startsWith('mongodb+srv://')) {
    const withoutQuery = trimmed.split('?')[0].replace(/\/+$/, '');
    const queryPart = trimmed.split('?')[1] ? `?${trimmed.split('?')[1]}` : '';
    const hostPart = withoutQuery.replace('mongodb+srv://', '');
    if (!hostPart.includes('/')) {
      list.push(`${withoutQuery}/erus${queryPart}`);
    }
    list.push(trimmed);
  } else {
    list.push(trimmed);
  }

  return list;
}

// Lifecycle event listeners for continuous automatic self-healing
if (!mongoose.connection.listenerCount('disconnected')) {
  mongoose.connection.on('connected', () => {
    isConnected = true;
    lastMongoError = null;
    console.log(`[MongoDB] Active connection established to database "${mongoose.connection.name}"`);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Connection lost. Auto-reconnecting in 3s...');
    setTimeout(() => {
      connectMongoDB().catch(() => {});
    }, 3000);
  });

  mongoose.connection.on('error', (err: any) => {
    lastMongoError = err.message;
    console.warn('[MongoDB] Runtime error event:', err.message);
  });
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
// MONGODB GRIDFS STORAGE (Persistent Video & Audio Chunks across deployments)
// =========================================================================
let recordingsBucket: mongoose.mongo.GridFSBucket | null = null;

export function getRecordingsBucket(): mongoose.mongo.GridFSBucket | null {
  if (recordingsBucket && mongoose.connection.readyState === 1) {
    return recordingsBucket;
  }
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    recordingsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'gd_recordings',
    });
    return recordingsBucket;
  }
  return null;
}

export async function saveRecordingToGridFS(
  filename: string,
  buffer: Buffer,
  metadata?: Record<string, any>
): Promise<string | null> {
  const bucket = getRecordingsBucket();
  if (!bucket) {
    console.warn('[MongoDB GridFS] Bucket not available to save recording:', filename);
    return null;
  }
  try {
    // Clean up older records for this filename to save space and avoid duplicate chunks
    try {
      const existing = await bucket.find({ filename }).toArray();
      for (const doc of existing) {
        await bucket.delete(doc._id);
      }
    } catch {}

    const contentType = metadata?.contentType || (filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm');

    return await new Promise<string>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: {
          contentType,
          slotId: metadata?.slotId || '',
          altSlotId: metadata?.altSlotId || '',
          durationSeconds: metadata?.durationSeconds || 0,
          recordedAt: metadata?.recordedAt || new Date().toISOString(),
          recordedBy: metadata?.recordedBy || '',
          fileSizeBytes: buffer.length,
          ...metadata,
        },
      } as any);

      uploadStream.on('finish', () => {
        console.log(`[MongoDB GridFS] Permanently stored ${buffer.length} bytes for "${filename}" (ID: ${uploadStream.id})`);
        resolve(uploadStream.id.toString());
      });

      uploadStream.on('error', (err) => {
        console.error(`[MongoDB GridFS] Upload stream error for "${filename}":`, err);
        reject(err);
      });

      uploadStream.end(buffer);
    });
  } catch (err: any) {
    console.error(`[MongoDB GridFS] Failed to save recording "${filename}":`, err.message);
    return null;
  }
}

export async function findRecordingInGridFS(filenameOrSlotId: string): Promise<any | null> {
  const bucket = getRecordingsBucket();
  if (!bucket) return null;
  try {
    const raw = String(filenameOrSlotId || '').trim();
    if (!raw) return null;

    const baseName = path.basename(raw);
    const cleanSlot = raw
      .replace(/^gd-recording-/, '')
      .replace(/-\d+\.(webm|mp4|ogg|wav)$/, '');
    const altSlot = cleanSlot.startsWith('slot-')
      ? cleanSlot.replace('slot-', 'session-')
      : cleanSlot.startsWith('session-')
      ? cleanSlot.replace('session-', 'slot-')
      : '';

    const queries: any[] = [
      { filename: baseName },
      { filename: raw },
      { 'metadata.slotId': raw },
      { 'metadata.slotId': cleanSlot },
      ...(altSlot ? [{ 'metadata.slotId': altSlot }] : []),
      { 'metadata.altSlotId': raw },
      { filename: new RegExp(cleanSlot.replace(/[^a-zA-Z0-9_-]/g, '_'), 'i') },
    ];

    for (const q of queries) {
      const docs = await bucket.find(q).sort({ uploadDate: -1 }).limit(1).toArray();
      if (docs && docs.length > 0) {
        return docs[0];
      }
    }
  } catch (err: any) {
    console.warn('[MongoDB GridFS] Lookup error:', err.message);
  }
  return null;
}

export function openGridFSDownloadStream(id: any, options?: { start?: number; end?: number }) {
  const bucket = getRecordingsBucket();
  if (!bucket) return null;
  try {
    return bucket.openDownloadStream(id, options);
  } catch (err: any) {
    console.warn('[MongoDB GridFS] Download stream error:', err.message);
    return null;
  }
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
  activityType?: 'gd' | 'presentation';
  presentationTopics?: string[];
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
    activityType: { type: String, enum: ['gd', 'presentation'], default: 'gd' },
    presentationTopics: { type: [String], default: [] },
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
    // 1. Purge legacy dummy-data records unconditionally to ensure only original data remains
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
        { id: { $regex: /erus global administration/i } },
        { collegeCode: { $in: legacyDummyCollegeCodes } },
        { collegeCode: { $regex: /erus global/i } },
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
        { id: { $in: ['rep-s1-session-101', 'rep-live-test-001', 'session-101_stu-demo'] } },
        { studentName: 'Rahul Kumar' },
        { studentId: { $in: [...legacyDummyUserIds, 'stu-demo'] } },
      ],
    });
    console.log('[MongoDB] Verified removal of any legacy dummy records.');

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
    } else {
      await UserModel.updateOne({ email: 'superadmin@erus.ai' }, { $set: { password: 'admin123', collegeCode: '' } });
    }

    // Ensure all real user passwords meet policy
    await UserModel.updateOne({ email: 'admin@vtu.in' }, { $set: { password: 'Erus@VTU2026' } });
    await UserModel.updateOne({ email: 'admin@bit.in' }, { $set: { password: 'Erus@BIT2026' } });
    await UserModel.updateOne({ email: 'alana@vtu.in' }, { $set: { password: 'Stud@VTU2026!' } });
    await UserModel.updateOne({ email: 'ananya@vtu.in' }, { $set: { password: 'Stud@VTU2026!' } });
    await UserModel.updateOne({ email: 'river@vtu.in' }, { $set: { password: 'Fac@VTU2026!' } });
    await CollegeModel.updateOne({ code: 'VTU' }, { $set: { adminPassword: 'Erus@VTU2026' } });
    await CollegeModel.updateOne({ code: 'BIT' }, { $set: { adminPassword: 'Erus@BIT2026' } });

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
