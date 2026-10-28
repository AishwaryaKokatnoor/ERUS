# ERUS AI Group Discussion Facilitator (ERUS-AIGDF)

> **Autonomous AI-Powered Online Group Discussion (GD) Facilitator and Individual Assessment Platform**  
> Cloned and configured directly from the production release: [`https://erus-production-24b3.up.railway.app/`](https://erus-production-24b3.up.railway.app/)

---

## 🎯 Executive Overview

**ERUS-AIGDF** is an AI-powered conversational group discussion facilitator and assessment platform designed for higher education institutions and mock interview preparation. It replaces and augments human evaluators by autonomously moderating live discussions, managing speaking turns, detecting deadlocks, and generating objective multi-parameter analytical reports.

### 🌟 Key Capabilities
- **Autonomous AI Moderator:** Welcomes participants, outlines discussion ground rules, asks probing questions, manages speaking turns, and intervenes to balance quiet and dominant speakers.
- **Realistic Virtual GD Room Layout:** Implements round-table/circle and classroom seating arrangements with **seats 1 through 15 clearly visible on the table/station** before each student.
- **Low-Latency Audio Mesh & WebRTC:** Real-time WebRTC peer mesh with Socket.IO signaling, floor speaker lock, and voice activity indicators.
- **Automated Silence & Deadlock Resolution:** Proactively detects prolonged silence (e.g., 15–20s) and introduces contextual prompts to rekindle discussion.
- **7-Parameter Weighted Scoring Engine:** Calculates objective scores (0–100) and letter grades based on industry evaluation rubrics.
- **Interactive Multi-Role Portals:** Tailored interfaces and workflows for **Students**, **Faculty Evaluators**, **College Administrators**, and **Super Admins**.

---

## 🏗️ Architecture & Technology Stack

```
Student & Faculty Devices (Web / Mobile)
               │
               ▼
   [ React 18 + Tailwind CSS SPA ]
       (Plus Jakarta Sans & Space Grotesk)
               │
      ┌────────┴────────┐
      ▼                 ▼
[ WebRTC Audio Mesh ]  [ Socket.IO Signaling ]
      │                 │
      └────────┬────────┘
               ▼
   [ Node.js + Express Backend Gateway ]
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
Discussion  AI Moderation Assessment
Manager     Engine        Engine (7-parameter)
    │          │          │
    └──────────┴──────────┘
               │
               ▼
    [ Faculty & Student Dashboards ]
```

- **Frontend:** React 18, Tailwind CSS, Lucide React, Recharts, HTML5 Web Audio API & Web Speech API.
- **Backend:** Node.js, Express, Socket.IO v4, JSON Web Tokens (JWT), REST APIs.
- **Real-Time Communication:** WebRTC Peer Mesh with automated signaling, speaker arbitration, and audio level visualization.
- **AI Facilitator Voice:** Indian English accent speech synthesis (Neerja, Prabhat, Google voices) with natural speech rate and pitch modulation.

---

## 🔑 Demo Access Credentials

The platform is pre-loaded with demonstration accounts across all four institutional roles:

| Role | Portal / Focus | Identifier / Email | Password |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Platform Root & Multi-Tenant Management | `superadmin@erus.ai` | `admin123` |
| **College Admin** | Campus Rosters, Slots & Departments | `admin@bmsit.in` | `admin123` |
| **College Admin (DIT)** | Institutional Operations | `admin@dit.edu.in` | `admin123` |
| **Faculty Evaluator** | Live Observer, Rubric Endorsement | `prof@college.edu` | `password123` |
| **Student Participant** | Slot Booking, Live GD Room, Report | `student@college.edu` | `password123` |
| **Student (Vikram)** | Slot Booking, Live GD Room | `vikram@vit.in` | `password123` |

*(Note: In student & faculty mode, new custom identifiers can also be entered to log in immediately as participant or observer.)*

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ (tested on Node v24)
- **npm** v9+

### 2. Installation
The dependencies are already installed in `node_modules`. If needed, run:
```bash
npm install
```

### 3. Running Locally
Start the integrated backend server (serves both the REST APIs, Socket.IO WebRTC signaling, and the production frontend):
```bash
npm start
# or
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📊 AI Assessment Parameters & Scoring Rubric

The automated assessment engine evaluates participants on **7 standardized parameters** using the weighted formula from the Developer Specifications:

$$\text{Overall Score} = (\text{English} \times 20\%) + (\text{Fluency} \times 20\%) + (\text{Clarity} \times 15\%) + (\text{Confidence} \times 15\%) + (\text{Content} \times 15\%) + (\text{Collaboration} \times 10\%) + (\text{Leadership} \times 5\%)$$

| Parameter | Weight | Max Score | Evaluation Focus |
| :--- | :---: | :---: | :--- |
| **Speaking in English** | **20%** | 20 | Sentence formation, grammar usage, technical vocabulary |
| **Fluency** | **20%** | 20 | Continuous flow, natural cadence, reduced pauses/hesitation |
| **Communication Clarity**| **15%** | 15 | Structured thought articulation, lucid explanation |
| **Confidence** | **15%** | 15 | Vocal projection, initiate contributions, question handling |
| **Content Quality** | **15%** | 15 | Subject relevance, logical reasoning, real-world examples |
| **Collaboration** | **10%** | 10 | Respect for peers, active listening, non-interruption |
| **Leadership** | **5%** | 5 | Discussion summarization, conflict mitigation, group guidance |

### Performance Grading Scale
- **90 – 100:** `Excellent`
- **75 – 89:** `Very Good`
- **60 – 74:** `Good`
- **40 – 59:** `Average`
- **Below 40:** `Needs Improvement`

---

## 📁 Repository Structure

```
Internship-Project/
├── dist/                          # Production client application bundle
│   ├── index.html                 # Main SPA entry point
│   └── assets/                    # Compiled JS (1.7MB) and CSS (212KB) bundles
├── server/                        # Backend application
│   ├── server.js                  # Express API + Socket.IO WebRTC signaling server
│   └── seedData.js                # Default institutions, sessions, users & reports
├── docs/                          # Developer specifications & proposal artifacts
│   ├── Developer_Specifications.md# Full developer specification breakdown
│   ├── Development_Proposal.md    # 4-Phase Roadmap and functional deliverables
│   └── ERUS AI Group Discussion Facilitator (ERUS-AIGDF).pdf
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git ignore rules
├── package.json                   # Project manifest & npm scripts
└── README.md                      # Comprehensive project documentation
```

---

## 📡 API Reference Summary

| Endpoint | Method | Role | Description |
| :--- | :---: | :---: | :--- |
| `/api/health` | `GET` | Public | System status, connected databases, active socket count |
| `/api/auth/login` | `POST` | Public | Multi-role authentication (returns user profile + JWT) |
| `/api/auth/me` | `GET` | User | Verify current user session via Bearer token |
| `/api/admin/stats` | `GET` | Super Admin | Platform-wide institution, student, and slot statistics |
| `/api/admin/capacity`| `GET`| Super Admin | Real-time concurrent load telemetry and user limits |
| `/api/admin/colleges`| `GET/POST`| Super Admin| Manage registered colleges, quotas, and credentials |
| `/api/college/slots` | `GET/POST`| College Admin| View, schedule, and allocate 15-student discussion slots |
| `/api/college/students`| `GET/POST`| College Admin| Manage student rosters and CSV batch dispatches |
| `/api/college/faculty` | `GET/POST`| College Admin| Manage faculty evaluators and observer assignments |
| `/api/facilitator/moderate`| `POST`| Facilitator| Dynamic prompt generation, probing questions & deadlock rescue |
| `/api/facilitator/evaluate`| `POST`| Evaluator | Compute weighted 7-parameter assessment report |
| `/api/facilitator/endorse` | `POST`| Faculty | Official faculty seal and manual rubric adjustment |
| `/api/student/book-slot` | `POST`| Student | Enroll in discussion topic and receive numbered seat (1-15) |
| `/api/student/reports` | `GET` | Student | Retrieve student performance analytics & journey profile |

---

## 🛡️ License & Acknowledgements
- Developed for higher education autonomous assessment and mock interview facilitation.
- Built to satisfy all Functional Requirements from **Phase 1 through Phase 4** of the ERUS-AIGDF project charter.
