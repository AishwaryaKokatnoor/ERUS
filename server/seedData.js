export const seedColleges = [
  {
    id: "col-1792416367948",
    name: "VTU",
    code: "VTU",
    contactEmail: "admin@vtu.in",
    phone: "9898989898",
    address: "Jnana Sangama, Machhe, Belagavi, Karnataka",
    status: "active",
    studentCount: 2,
    facultyCount: 1,
    slotCount: 4,
    studentLimit: 60,
    adminEmail: "admin@vtu.in",
    adminName: "dr raj",
    adminPassword: "Erus@VTU2026",
    createdAt: "2026-10-19T13:26:07.948Z"
  },
  {
    id: "col-1791652408903",
    name: "bit",
    code: "BIT",
    contactEmail: "admin@bit.in",
    phone: "9409384940",
    address: "",
    status: "active",
    studentCount: 0,
    facultyCount: 0,
    slotCount: 0,
    studentLimit: 60,
    adminEmail: "admin@bit.in",
    adminName: "BIT Administrator",
    adminPassword: "Erus@BIT2026",
    createdAt: "2026-10-10T17:13:28.910Z"
  }
];

export const seedUsers = [
  {
    id: "sa-1",
    name: "Platform Super Admin",
    email: "superadmin@erus.ai",
    role: "super_admin",
    college: "ERUS Global Administration",
    collegeCode: "",
    department: "Administration",
    designation: "Root Administrator",
    password: "admin123"
  },
  {
    id: "ca-1792416367948",
    name: "dr raj",
    email: "admin@vtu.in",
    role: "college_admin",
    password: "Erus@VTU2026",
    college: "VTU",
    collegeCode: "VTU",
    adminId: "CADM-VTU-001"
  },
  {
    id: "ca-1791652408903",
    name: "BIT College Administrator",
    email: "admin@bit.in",
    role: "college_admin",
    password: "Erus@BIT2026",
    college: "bit",
    collegeCode: "BIT",
    adminId: "CADM-BIT-001"
  },
  {
    id: "s-17923",
    name: "alana",
    email: "alana@vtu.in",
    role: "student",
    studentId: "STU-1633",
    course: "B.Tech Computer Science & Engineering",
    batch: "2024-2028",
    seatNumber: 1,
    college: "VTU",
    collegeCode: "VTU",
    password: "Stud@VTU2026!"
  },
  {
    id: "s-45414",
    name: "ananya",
    email: "ananya@vtu.in",
    role: "student",
    studentId: "STU-2505",
    course: "B.Tech Computer Science & Engineering",
    batch: "2024-2028",
    seatNumber: 2,
    college: "VTU",
    collegeCode: "VTU",
    password: "Stud@VTU2026!"
  },
  {
    id: "fac-1792416478070",
    name: "river",
    email: "river@vtu.in",
    role: "faculty",
    facultyId: "fac-cse-101",
    department: "Department of Computer Science & Engineering",
    designation: "Assistant Professor",
    college: "VTU",
    collegeCode: "VTU",
    password: "Fac@VTU2026!"
  }
];

export const seedSlots = [
  {
    id: "slot-vtu-1-1792416367948",
    slotName: "Slot 1",
    topic: "ai in military",
    description: "Cohort of 15 students.",
    slotTiming: "10:00 AM - 10:15 AM",
    slotDate: "2026-10-19",
    status: "scheduled",
    durationMinutes: 15,
    enrolledCount: 1,
    maxCapacity: 15,
    assignedFacultyId: "fac-1792416478070",
    assignedFacultyName: "river",
    assignedFacultyEmail: "river@vtu.in",
    assignedFacultyDept: "Department of Computer Science & Engineering",
    collegeCode: "VTU",
    createdAt: "2026-10-19T13:26:08.037Z",
    students: [
      {
        id: "s-17923",
        name: "alana",
        email: "alana@vtu.in",
        studentId: "STU-1633",
        course: "B.Tech Computer Science & Engineering",
        batch: "2024-2028",
        college: "VTU",
        collegeCode: "VTU",
        seatNumber: 1
      }
    ],
    recordedAt: ""
  },
  {
    id: "slot-vtu-2-1792416367949",
    slotName: "Slot 2",
    topic: "",
    description: "Cohort of 15 students. Waiting for College Admin to allot Topic & Faculty In-Charge.",
    slotTiming: "10:30 AM - 10:45 AM",
    slotDate: "2026-10-19",
    status: "scheduled",
    durationMinutes: 15,
    enrolledCount: 0,
    maxCapacity: 15,
    assignedFacultyId: "",
    assignedFacultyName: "Unassigned",
    assignedFacultyEmail: "",
    assignedFacultyDept: "",
    collegeCode: "VTU",
    createdAt: "2026-10-19T13:26:08.037Z",
    students: [],
    recordedAt: ""
  },
  {
    id: "slot-vtu-3-1792416367950",
    slotName: "Slot 3",
    topic: "",
    description: "Cohort of 15 students. Waiting for College Admin to allot Topic & Faculty In-Charge.",
    slotTiming: "11:00 AM - 11:15 AM",
    slotDate: "2026-10-19",
    status: "scheduled",
    durationMinutes: 15,
    enrolledCount: 0,
    maxCapacity: 15,
    assignedFacultyId: "",
    assignedFacultyName: "Unassigned",
    assignedFacultyEmail: "",
    assignedFacultyDept: "",
    collegeCode: "VTU",
    createdAt: "2026-10-19T13:26:08.038Z",
    students: [],
    recordedAt: ""
  },
  {
    id: "slot-vtu-4-1792416367951",
    slotName: "Slot 4",
    topic: "",
    description: "Cohort of 15 students. Waiting for College Admin to allot Topic & Faculty In-Charge.",
    slotTiming: "11:30 AM - 11:45 AM",
    slotDate: "2026-10-19",
    status: "scheduled",
    durationMinutes: 15,
    enrolledCount: 0,
    maxCapacity: 15,
    assignedFacultyId: "",
    assignedFacultyName: "Unassigned",
    assignedFacultyEmail: "",
    assignedFacultyDept: "",
    collegeCode: "VTU",
    createdAt: "2026-10-19T13:26:08.038Z",
    students: [],
    recordedAt: ""
  }
];

export const seedAssessmentReports = [];
