# Developer Specifications – GD & MOCK INTERVIEWS
## AI Facilitator for Online Group Discussions and Individual Assessment
### Product Name: ERUS AI Group Discussion Facilitator (ERUS-AIGDF)

---

## 1. Project Objective

Develop an AI-powered Group Discussion (GD) Facilitator that can:
- Conduct online group discussions autonomously.
- Act like a human moderator/facilitator.
- Encourage participation from all students.
- Manage speaking turns and discussion flow.
- Ask probing questions and provide guidance.
- Evaluate each student's communication and participation.
- Generate individual assessment reports and analytics.

---

## 2. System Overview

```
Student Devices (Mobile/Web)
            │
            ▼
   Video/Audio Interface
            │
            ▼
  Speech-to-Text Engine
            │
            ▼
   AI Facilitator Engine
            │
 ┌──────────┼──────────┐
 │          │          │
 ▼          ▼          ▼
Discussion  Participation  Assessment
Manager      Analyzer       Engine
 │           │              │
 └───────────┴──────────────┘
            │
            ▼
    Reporting Dashboard
```

---

## 3. Major Components

### Module 1: Group Discussion Session Manager
- Create GD sessions
- Allocate students into groups
- Schedule discussions
- Manage session duration
- Store recordings and transcripts

#### Session Creation Parameters
- Discussion Topic
- Duration (e.g. 20 Minutes)
- Number of Participants (Strict 15 Students per Slot)
- Assessment Rubric
- Difficulty Level (Beginner / Intermediate / Advanced)

---

### Module 2: AI Facilitator Engine
The AI acts as a human moderator.

#### Responsibilities:
1. **Introduce Discussion:**
   > *"Good morning everyone. Today's discussion topic is: 'Should Artificial Intelligence replace teachers?' Each participant will get an opportunity to speak. Please respect others' opinions and avoid interruptions."*
2. **Explain Discussion Rules:**
   - Speak only one person at a time.
   - Respect differing opinions.
   - Support arguments with examples.
   - Encourage participation.
   - Stay on topic.
3. **Start Discussion:**
   > *"Let us begin. Who would like to start the discussion?"*
4. **Manage Speaking Turns:**
   - Detect silence
   - Detect interruptions
   - Invite quiet students (*"Rahul, let us hear from Priya now"*)
   - Balance participation (*"Ramesh, would you like to share your thoughts?"*)
   - Steer off-topic students back to the core discussion
5. **Ask Probing Questions:**
   - *"Can you explain further?"*
   - *"Do you have an example?"*
   - *"Does anyone have a different opinion?"*
   - *"What might be the disadvantages?"*
6. **Handle Deadlock Situations:**
   - If nobody speaks for 15–20 seconds, AI intervenes with a provocative prompt.
7. **Conclude Discussion:**
   - Summarize key points, thank participants, and signal report generation.

---

## 4. Assessment Engine & Formula

### Assessment Parameters:
1. **Speaking in English (20%):** Grammar usage, vocabulary, sentence structure.
2. **Fluency (20%):** Reduced pauses, natural cadence, reduced filler words.
3. **Communication Clarity (15%):** Clear ideas, proper explanations.
4. **Confidence (15%):** Initiating discussion, confident response, body language/voice projection.
5. **Content Quality (15%):** Relevance, logical reasoning, supporting examples.
6. **Collaboration (10%):** Respect for peers, active listening, non-interruption.
7. **Leadership (5%):** Guiding discussion, summarizing points, conflict mitigation.

### Overall Score Formula:
$$\text{Overall Score} = (\text{English} \times 20\%) + (\text{Fluency} \times 20\%) + (\text{Clarity} \times 15\%) + (\text{Confidence} \times 15\%) + (\text{Content} \times 15\%) + (\text{Collaboration} \times 10\%) + (\text{Leadership} \times 5\%)$$

### Performance Scale:
- **90–100:** Excellent
- **75–89:** Very Good
- **60–74:** Good
- **40–59:** Average
- **Below 40:** Needs Improvement

---

## 5. Realistic GD Room Design

- **Seating Arrangement:** Realistic virtual round-table / circle seating layout.
- **Seat Allocation:** Each student is allotted one numbered seat in the setup (Seats 1 through 15).
- **Seat Number Display:** The allocated seat number prominently reflects on the desk/station before the student.
- **Breakout Rooms:** Automated creation of breakout pods for group discussions.
