import { Student, PresentationAssessmentReport, GradeLevel } from '../types/gd';

export interface PresentationSlotStudent {
  serialNumber: number; // 1 to 6
  student: Student;
  topic: string;
  presentationStatus: 'waiting' | 'presenting' | 'qa' | 'completed';
  speakingSeconds: number;
  questionsAnswered: number;
  peerQuestionsAsked: number;
}

// ==========================================
// 1. OPENING SCRIPT (PDF Page 1)
// ==========================================
export const PRESENTATION_OPENING_SCRIPT = 
`Good morning, everyone! Welcome to the ERUS Student Presentation Activity.

Today, six students will present their assigned topics related to research, technology, and industry applications.

The objective of this activity is to develop your technical knowledge, communication skills, presentation skills, critical thinking, and confidence.

Each student will get 6 to 8 minutes to present their topic.

After every presentation, I will invite the remaining students to ask questions related to the topic. This will help you develop the ability to listen carefully, understand technical concepts, think critically, and communicate effectively.

Please follow these instructions:
1. Present your topic clearly and confidently.
2. Explain the important concepts with suitable examples.
3. Connect your topic to real-world or industry applications wherever possible.
4. Listen carefully to other students' presentations.
5. Ask relevant and meaningful questions.
6. Answer questions politely and confidently.

Remember, this is a learning activity. Do not hesitate to speak, ask questions, or express your ideas.

I will now begin the presentations by calling the students in serial order, from Student Number 1 to Student Number 6.

Let us begin with Student Number 1!`;

// ==========================================
// 2. CALLING STUDENTS IN SERIAL ORDER (PDF Page 2)
// ==========================================
export function getSerialCallScript(serialNumber: number, studentName?: string, topic?: string): string {
  const nameSuffix = studentName ? ` (${studentName})` : '';
  const topicSuffix = topic ? ` on "${topic}"` : '';

  switch (serialNumber) {
    case 1:
      return `Student Number 1${nameSuffix}, please come forward and begin your presentation${topicSuffix}. You have 6 to 8 minutes. All the best!`;
    case 2:
      return `Thank you, Student Number 1. Now, I invite Student Number 2${nameSuffix} to present the assigned topic${topicSuffix}. Please begin.`;
    case 3:
      return `Thank you. Student Number 3${nameSuffix}, it is your turn. Please explain your topic clearly${topicSuffix}, highlighting the key concepts and practical applications.`;
    case 4:
      return `Well done. Now, I invite Student Number 4${nameSuffix} to deliver the next presentation${topicSuffix}. You may begin.`;
    case 5:
      return `Thank you. Student Number 5${nameSuffix}, please present your topic${topicSuffix} and explain its importance in research or industry.`;
    case 6:
      return `Excellent. We have reached our final presentation. Student Number 6${nameSuffix}, please begin your presentation${topicSuffix}. All the best!`;
    default:
      return `Student Number ${serialNumber}${nameSuffix}, please begin your presentation. You have 6 to 8 minutes. All the best!`;
  }
}

// ==========================================
// 3. PEER Q&A INVITATION & SILENCE SCRIPTS (PDF Page 3)
// ==========================================
export function getPeerQAInvitationScript(presenterNum: number, nextStudentNum: number): string {
  return `Thank you for your presentation.

Now, let us have a short question-and-answer session.

The other students should ask questions related to the topic presented. Please think about the concepts you have heard and identify anything you would like to understand better.

Would Student Number ${nextStudentNum} like to ask the first question?`;
}

export const PEER_QA_SILENCE_SCRIPT = 
`Come on, everyone! This is an opportunity to learn from one another.

You may ask about a concept you did not understand, a practical application, a technical challenge, or a real-world example.

Let me give you a few seconds to think...

Since no one has asked a question, I will ask one.`;

// ==========================================
// 4. AI TOPIC-GROUNDED QUESTION GENERATOR (PDF Page 4)
// ==========================================
export type PresentationQuestionType = 
  | 'conceptual' 
  | 'application' 
  | 'analytical' 
  | 'research' 
  | 'critical_thinking' 
  | 'future_oriented';

export interface PresentationAIQuestion {
  type: PresentationQuestionType;
  question: string;
  clarification: string;
}

export function generateAIQuestionForTopic(topic: string, questionType?: PresentationQuestionType): PresentationAIQuestion {
  const t = topic.trim() || 'this technology';

  const bank: Record<PresentationQuestionType, { question: string; clarification: string }> = {
    conceptual: {
      question: `What is the primary underlying principle that makes ${t} effective, and how would you explain it to a non-technical audience?`,
      clarification: `The key point to remember is that conceptual clarity requires distinguishing the core mechanism from secondary features.`,
    },
    application: {
      question: `How can the concepts discussed in ${t} be deployed in real-world Indian industry or enterprise workflows to solve a practical problem?`,
      clarification: `The key point to remember is connecting theoretical architecture with industry constraints, cost parameters, and scalability.`,
    },
    analytical: {
      question: `What are the major performance limitations, security concerns, or operational trade-offs associated with ${t}?`,
      clarification: `The key point to remember is that every engineering framework balances performance efficiency against complexity and security overhead.`,
    },
    research: {
      question: `What fundamental open problem or gap in existing research does ${t} attempt to address?`,
      clarification: `The key point to remember is clearly identifying the problem boundary before proposing technical solutions.`,
    },
    critical_thinking: {
      question: `What would happen to the reliability of ${t} if one of its core underlying assumptions or resource conditions failed?`,
      clarification: `The key point to remember is stress-testing system assumptions against real-world edge cases and unpredictable failure modes.`,
    },
    future_oriented: {
      question: `Projecting five to seven years ahead: how might ${t} evolve, and what new multidisciplinary skills will professionals need?`,
      clarification: `The key point to remember is preparing for rapid technological convergence and continuous skill adaptability.`,
    },
  };

  const types: PresentationQuestionType[] = [
    'conceptual',
    'application',
    'analytical',
    'research',
    'critical_thinking',
    'future_oriented',
  ];

  const chosenType = questionType || types[Math.floor(Math.random() * types.length)];
  return {
    type: chosenType,
    question: bank[chosenType].question,
    clarification: bank[chosenType].clarification,
  };
}

// ==========================================
// 5. TRANSITION SCRIPT (PDF Page 4)
// ==========================================
export function getTransitionScript(completedStudentNumber: number, nextStudentNumber: number): string {
  if (nextStudentNumber > 6) {
    return `Thank you for your presentation and for participating in the discussion. We have completed all six presentations for today's session.`;
  }
  return `Thank you for your presentation and for participating in the discussion.

We have completed the presentation and question session for Student Number ${completedStudentNumber}.

Let us now move to the next presentation in our sequence.

I request Student Number ${nextStudentNumber} to get ready and begin when called.`;
}

// ==========================================
// 6. CLOSING REMARKS (PDF Page 5)
// ==========================================
export const PRESENTATION_CLOSING_SCRIPT = 
`Congratulations to all six students!

We have now successfully completed today's ERUS Student Presentation Activity.

Each of you has had an opportunity to present your ideas, explain technical concepts, listen to others, and participate in discussions.

I would like you to remember five important lessons from today's activity.

First — Technical Knowledge: Understand the topic beyond memorizing facts. Try to explain the concepts in your own words.

Second — Communication Skills: Speak clearly, organize your ideas, and use simple, professional language.

Third — Presentation Skills: Introduce your topic, explain the key points logically, provide examples, and conclude effectively.

Fourth — Critical Thinking: Listen carefully, ask meaningful questions, and evaluate different ideas.

Fifth — Confidence: Do not be afraid of making mistakes. Every presentation and every question will help you improve.

In the professional world, success depends not only on what you know but also on how effectively you communicate your knowledge, solve problems, and work with others.

The purpose of ERUS is to help you develop these skills and prepare yourselves for future academic, research, and employment opportunities.

Before our session ends, I encourage every student to reflect on three questions:
1. What did I learn from today's presentations?
2. What is one skill I need to improve?
3. What will I do differently in my next presentation?

Keep practising. Keep asking questions. Keep improving.

Thank you for your active participation.

This concludes today's ERUS Student Presentation Activity. Have a great day!`;

// ==========================================
// 7. PRESENTATION ASSESSMENT CALCULATOR (PDF Page 6 & 7)
// ==========================================
/**
 * Computes official 100-mark presentation report across the 6 PDF performance indicators:
 * 1. Topic understanding and technical accuracy (25 Marks)
 * 2. Organization and clarity of presentation (20 Marks)
 * 3. Spoken English and fluency (20 Marks)
 * 4. Confidence and professional delivery (15 Marks)
 * 5. Ability to answer questions (10 Marks)
 * 6. Quality of questions asked to peers (10 Marks)
 */
export function calculatePresentationReport(params: {
  sessionId: string;
  studentId: string;
  studentName: string;
  studentNumber: number;
  college: string;
  presentationTopic: string;
  durationMinutes: number;
  speakingTimeSeconds: number;
  questionsAnsweredCount: number;
  peerQuestionsAskedCount: number;
  transcriptText?: string;
}): PresentationAssessmentReport {
  const {
    sessionId,
    studentId,
    studentName,
    studentNumber,
    college,
    presentationTopic,
    durationMinutes,
    speakingTimeSeconds,
    questionsAnsweredCount,
    peerQuestionsAskedCount,
    transcriptText = '',
  } = params;

  // Duration benchmarks: target is 6-8 minutes (360s to 480s)
  // For classroom tests or quick demos, scale proportionally
  const sec = Math.max(0, speakingTimeSeconds);
  const words = transcriptText ? transcriptText.split(/\s+/).filter(Boolean).length : Math.round(sec * 2.1);

  // 1. Topic understanding and technical accuracy (25)
  let topicScore = 14;
  if (sec >= 360 && sec <= 540) topicScore += 9;
  else if (sec >= 240) topicScore += 7;
  else if (sec >= 120) topicScore += 5;
  else if (sec >= 30) topicScore += 2;
  if (words > 200) topicScore += 2;
  topicScore = Math.min(25, Math.max(8, topicScore));

  // 2. Organization and clarity of presentation (20)
  let orgScore = 11;
  if (/introduction|firstly|overview|main|core|for example|in conclusion|summary|finally/i.test(transcriptText)) {
    orgScore += 6;
  } else if (sec >= 180) {
    orgScore += 4;
  }
  orgScore = Math.min(20, Math.max(6, orgScore));

  // 3. Spoken English and fluency (20)
  let engScore = 12;
  if (sec >= 300) engScore += 6;
  else if (sec >= 180) engScore += 4;
  else if (sec >= 60) engScore += 2;
  engScore = Math.min(20, Math.max(6, engScore));

  // 4. Confidence and professional delivery (15)
  let confScore = 9;
  if (sec >= 300) confScore += 5;
  else if (sec >= 150) confScore += 3;
  else if (sec >= 45) confScore += 1;
  confScore = Math.min(15, Math.max(4, confScore));

  // 5. Ability to answer questions (10)
  let answerScore = 4;
  if (questionsAnsweredCount >= 2) answerScore = 10;
  else if (questionsAnsweredCount === 1) answerScore = 8;
  else if (sec >= 180) answerScore = 6;
  answerScore = Math.min(10, Math.max(2, answerScore));

  // 6. Quality of questions asked to peers (10)
  let askScore = 3;
  if (peerQuestionsAskedCount >= 2) askScore = 10;
  else if (peerQuestionsAskedCount === 1) askScore = 8;
  else if (sec >= 180) askScore = 5;
  askScore = Math.min(10, Math.max(2, askScore));

  const overallScore = Math.min(100, topicScore + orgScore + engScore + confScore + answerScore + askScore);

  let grade: GradeLevel = 'Needs Improvement';
  if (overallScore >= 85) grade = 'Excellent';
  else if (overallScore >= 75) grade = 'Very Good';
  else if (overallScore >= 60) grade = 'Good';
  else if (overallScore >= 45) grade = 'Average';

  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  const presentationTimeFormatted = `${mins} min ${remSec} sec`;

  const strengths: string[] = [];
  if (topicScore >= 20) strengths.push('Strong grasp of technical fundamentals and core principles.');
  if (orgScore >= 16) strengths.push('Structured presentation flow with logical chapter transitions.');
  if (engScore >= 16) strengths.push('Clear articulation and professional academic English.');
  if (confScore >= 12) strengths.push('Poised delivery and steady eye contact during presentation.');
  if (strengths.length === 0) strengths.push('Willingness to take the stage and share insights on assigned topic.');

  const improvements: string[] = [];
  if (sec < 360) improvements.push('Expand depth of examples to meet the 6–8 minute seminar window.');
  if (questionsAnsweredCount === 0) improvements.push('Engage actively during the post-presentation Q&A session.');
  if (peerQuestionsAskedCount === 0) improvements.push('Ask constructive questions to peer presenters to demonstrate active listening.');
  if (improvements.length === 0) improvements.push('Incorporate industry metrics or recent academic benchmark figures.');

  const aiRecommendations = [
    `Structure future presentations into clear Problem Statement, Implementation, and Real-World Impact phases.`,
    `Prepare 2 anticipatory questions and answers before taking the stage.`,
    `Practice timed 7-minute delivery using slide transitions to maintain optimal speaking pace.`,
  ];

  const aiSummary = `${studentName} (Student Number ${studentNumber}) presented on "${presentationTopic}", delivering ${presentationTimeFormatted} of presentation with ${questionsAnsweredCount} Q&A answer(s) and ${peerQuestionsAskedCount} peer question(s) asked. Overall presentation score: ${overallScore}/100 (${grade}).`;

  return {
    id: `rep-pres-${studentId}-${sessionId}`,
    sessionId,
    studentId,
    studentName,
    studentNumber,
    college,
    presentationTopic,
    durationMinutes,
    presentationTimeSeconds: sec,
    presentationTimeFormatted,
    questionsAnsweredCount,
    peerQuestionsAskedCount,
    skills: {
      topicUnderstanding: {
        parameter: 'Topic Understanding & Technical Accuracy',
        weightagePercent: 25,
        score: topicScore,
        maxScore: 25,
        feedback: topicScore >= 20 ? 'Demonstrated thorough conceptual mastery.' : 'Explain mechanisms with concrete technical examples.',
      },
      organizationClarity: {
        parameter: 'Organization & Clarity of Presentation',
        weightagePercent: 20,
        score: orgScore,
        maxScore: 20,
        feedback: orgScore >= 16 ? 'Well-organized structure from premise to conclusion.' : 'Use clear signposting between major points.',
      },
      spokenEnglishFluency: {
        parameter: 'Spoken English & Fluency',
        weightagePercent: 20,
        score: engScore,
        maxScore: 20,
        feedback: engScore >= 16 ? 'Fluent delivery with minimal pauses.' : 'Practice continuous verbal flow and reduce hesitation.',
      },
      confidenceDelivery: {
        parameter: 'Confidence & Professional Delivery',
        weightagePercent: 15,
        score: confScore,
        maxScore: 15,
        feedback: confScore >= 12 ? 'Professional demeanor and commanding presence.' : 'Speak with vocal projection and maintain posture.',
      },
      abilityToAnswerQA: {
        parameter: 'Ability to Answer Q&A Questions',
        weightagePercent: 10,
        score: answerScore,
        maxScore: 10,
        feedback: answerScore >= 8 ? 'Handled follow-up questions with clarity and composure.' : 'Substantiate answers with real-world scenarios.',
      },
      qualityOfQuestionsAsked: {
        parameter: 'Quality of Questions Asked to Peers',
        weightagePercent: 10,
        score: askScore,
        maxScore: 10,
        feedback: askScore >= 8 ? 'Posed insightful, relevant inquiries to peers.' : 'Actively question other presentations to show engagement.',
      },
    },
    overallScore,
    grade,
    strengths,
    areasForImprovement: improvements,
    aiRecommendations,
    aiSummary,
    generatedAt: new Date().toISOString(),
  };
}

// 6 Default Seminar Topics for Student 1 to 6
export const DEFAULT_PRESENTATION_TOPICS: string[] = [
  'Generative AI in Engineering Design and Manufacturing',
  'Autonomous Electric Vehicles and Grid Integration',
  'Blockchain Architectures for Transparent Supply Chains',
  'Quantum Computing Paradigms and Cryptographic Security',
  'Biomedical Informatics and Automated Diagnostic Imaging',
  'Edge Computing in Smart Cities and Industrial IoT',
];
