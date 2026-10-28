# PROJECT DEVELOPMENT PROPOSAL
## ERUS AI Group Discussion Facilitator (ERUS-AIGDF)
### AI Facilitator for Online Group Discussions and Individual Assessment

---

## 1. Objective

This proposal outlines a phased development plan for **ERUS-AIGDF**, an AI-powered Group Discussion (GD) facilitator that autonomously moderates online group discussions, manages speaking turns, evaluates individual student communication, and generates detailed assessment analytics. The objective is to replace or augment human GD moderators with an AI facilitator capable of conducting structured discussions, ensuring balanced participation, and delivering objective, data-driven performance reports to both students and faculty.

The project is structured into four sequential phases, each scoped to be independently designed, built, tested, and delivered within a 2-month development cycle.

---

## 2. Phased Delivery Roadmap (2-Month Cycles)

| Timeline | Phase | Focus Area | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Months 1-2** | **Phase 1 – Foundation** | Session management, speech recognition, speaker identification, and core database schema | Working session creation UI + API; speaker-tagged transcripts; persistent schema. |
| **Months 3-4** | **Phase 2 – AI Facilitator** | Conversational facilitation engine: introductions, rules, turn management, probing questions, deadlock handling | LLM-driven autonomous moderation logic tested in multi-student sessions. |
| **Months 5-6** | **Phase 3 – Assessment Engine**| Participation tracking, multi-parameter scoring, individual student report generation | Automated scoring engine with 7 weighted parameters, letter grades, and downloadable PDF/text reports. |
| **Months 7-8** | **Phase 4 – Dashboard & Rooms** | Faculty dashboard, analytics visualizations, realistic GD room design, and deployment hardening | Live faculty dashboard, realistic virtual room with numbered desks, breakout pods, and WebRTC audio mesh. |

---

## 3. Functional Requirements Matrix

### Phase 1: Foundation (Months 1–2)
- **FR-1 Session Manager:** Create GD sessions with topic, duration, participant count (15 max), difficulty, and rubrics.
- **FR-2 Speech Recognition:** Convert live speech to text in real time with timestamped sentences; support Indian English accents.
- **FR-3 Speaker Identification:** Track speaker duration, number of turns, and interruptions.
- **FR-4 Database Schema:** Persist Colleges, Users, Sessions, Transcripts, and Bookings.
- **FR-5 Recording Storage:** Store and retrieve full transcripts and media recordings.

### Phase 2: AI Facilitator Engine (Months 3–4)
- **FR-6 Discussion Introduction & Rules:** Automated opening script setting topic and etiquette.
- **FR-7 Turn & Flow Management:** Intervene when participants dominate or remain quiet.
- **FR-8 Probing Questions:** Dynamic contextual follow-ups to deepen debate.
- **FR-9 Deadlock Handling:** Proactively break prolonged silences (15–20s).
- **FR-10 Discussion Conclusion:** Summarize findings and signal evaluation report generation.

### Phase 3: Assessment Engine (Months 5–6)
- **FR-11 Participation Tracking:** Record speaking time, turns, response latency, and interruptions.
- **FR-12 Multi-Parameter Scoring:** Weighted formula ($20\% + 20\% + 15\% + 15\% + 15\% + 10\% + 5\%$).
- **FR-13 Individual Assessment Reports:** Generate downloadable reports with radar charts, strengths, areas for improvement, and recommendations.
- **FR-14 Historical Progress Tracking:** Query student growth across multiple sessions (Student Journey).

### Phase 4: Dashboards & Virtual Rooms (Months 7–8)
- **FR-15 Faculty Dashboard:** Summary metrics, student scorecards, live observer interface, and rubric endorsement.
- **FR-16 Analytics Visualizations:** Participation heatmaps, speaking duration distribution graphs, and downloadable artifacts.
- **FR-17 Realistic GD Room Design:** Circle/mesh layout with desk numbers (1–15) displayed visibly in front of each student.
- **FR-18 Breakout Room Automation:** Automated generation of parallel discussion pods.
- **FR-19 Real-Time Communication Layer:** WebRTC audio mesh and Socket.IO signaling.
