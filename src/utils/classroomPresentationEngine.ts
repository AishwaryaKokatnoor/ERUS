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
// 1. OPENING SCRIPT (PDF Page 1)
// ==========================================
export function getPresentationOpeningScript(topic?: string, participantCount?: number): string {
  const cleanTopic = topic && topic.trim() ? topic.trim() : 'technical innovations and research frameworks';
  const countStr = participantCount && participantCount > 1 ? `${participantCount} participants` : 'our candidates';
  return `Good morning, everyone! Welcome to the ERUS Classroom Seminar on "${cleanTopic}". Today, ${countStr} will present their technical analysis followed by peer discussion and Q and A. Each presenter has 6 to 8 minutes to present. Please explain the concepts clearly with practical applications. Let us begin with our first presenter!`;
}

export const PRESENTATION_OPENING_SCRIPT = 
`Good morning, everyone! Welcome to the ERUS Classroom Presentation Activity. Today, participants will present their assigned topics on research, technology, and industry applications. Each presenter has 6 to 8 minutes, followed by Peer Q and A. Please present your concepts clearly with practical examples and engage actively. Let us begin with our first presenter!`;

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
      return `Student Number ${serialNumber}${nameSuffix}, please begin your presentation${topicSuffix}. You have 6 to 8 minutes. All the best!`;
  }
}

// ==========================================
// 3. PEER Q&A INVITATION & SILENCE SCRIPTS (PDF Page 3)
// ==========================================
export function getPeerQAInvitationScript(presenterNum: number, nextStudentNum: number): string {
  return `Thank you for your presentation. Now, let us have a short question-and-answer session. The floor is open for peer questions on this topic. Would Student Number ${nextStudentNum} like to ask the first question?`;
}

export const PEER_QA_SILENCE_SCRIPT = 
`Since no questions have been raised by peers yet, I will ask a technical question on this topic.`;

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

export function generateAIQuestionForTopic(
  topic: string, 
  transcriptText?: string, 
  questionType?: PresentationQuestionType
): PresentationAIQuestion {
  const cleanTopic = String(topic || 'the assigned technology')
    .replace(/\s*\(Part\s*\d+\)/gi, '')
    .replace(/\s*\(Perspective\s*\d+\)/gi, '')
    .replace(/^Topic:\s*/i, '')
    .trim() || 'the assigned technology';

  const lower = cleanTopic.toLowerCase();
  const types: PresentationQuestionType[] = [
    'conceptual',
    'application',
    'analytical',
    'research',
    'critical_thinking',
    'future_oriented',
  ];
  const chosenType = questionType || types[Math.floor(Math.random() * types.length)];

  // Domain categorization
  const isAI = /ai|intelligence|machine learning|deep learning|neural|llm|nlp|vision|data science|algorithm/i.test(lower);
  const isSecurity = /security|cyber|hack|crypto|blockchain|privacy|zero trust|threat|auth/i.test(lower);
  const isCloudOrIoT = /cloud|distributed|iot|sensor|embedded|network|microservice|kubernetes|serverless/i.test(lower);
  const isHardwareOrEnergy = /energy|battery|solar|electric vehicle|ev|power|mechanical|robot|hardware|semiconductor/i.test(lower);
  const isBiotechOrHealth = /health|medical|biomed|patient|clinical|pharma|bio/i.test(lower);

  let question = '';
  let clarification = '';

  if (isAI) {
    const aiQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `In your presentation on "${cleanTopic}", how does the system validate model generalization to prevent overfitting and bias on unseen data?`,
        c: `The fundamental point is ensuring models generalize beyond training benchmarks and address statistical data drift in production.`,
      },
      application: {
        q: `When deploying "${cleanTopic}" into enterprise production, what are the primary inference latency, compute budget, and scaling trade-offs?`,
        c: `Real-world engineering requires balancing algorithmic precision against infrastructure cost and operational throughput.`,
      },
      analytical: {
        q: `What critical failure modes or accuracy degradation risks emerge in "${cleanTopic}" when input distributions shift unexpectedly?`,
        c: `Robust machine learning frameworks must implement active monitoring and fallback thresholds for distribution shift.`,
      },
      research: {
        q: `What open mathematical or architectural limitation in "${cleanTopic}" still requires novel research breakthroughs?`,
        c: `Advancing AI systems requires addressing fundamental bottlenecks like memory bandwidth, interpretability, and sample complexity.`,
      },
      critical_thinking: {
        q: `If the training dataset or feedback loop in "${cleanTopic}" is corrupted by adversarial noise, how resilient is the pipeline?`,
        c: `High-stakes AI architectures must incorporate adversarial verification and data sanitization checkpoints.`,
      },
      future_oriented: {
        q: `Over the next five years, how will edge hardware acceleration and multimodal integration reshape "${cleanTopic}"?`,
        c: `Preparing for future deployments requires understanding model quantization, local inference, and multimodal convergence.`,
      },
    };
    question = aiQuestions[chosenType].q;
    clarification = aiQuestions[chosenType].c;
  } else if (isSecurity) {
    const secQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `In "${cleanTopic}", what is the primary threat model, and what zero-trust principles are implemented to safeguard data confidentiality?`,
        c: `Effective security architecture assumes perimeter compromise and relies on end-to-end cryptographic verification.`,
      },
      application: {
        q: `How does an enterprise implement "${cleanTopic}" without creating unacceptable performance bottlenecks or user friction?`,
        c: `Production security demands balancing defense-in-depth overhead against user latency and developer velocity.`,
      },
      analytical: {
        q: `What are the most vulnerable attack vectors or side-channel risks associated with "${cleanTopic}"?`,
        c: `Comprehensive threat mitigation requires analyzing side channels, misconfigurations, and supply-chain dependencies.`,
      },
      research: {
        q: `How will post-quantum cryptography or decentralized protocols challenge the core assumptions of "${cleanTopic}"?`,
        c: `Next-generation security models must anticipate asymmetric cryptanalysis and quantum algorithmic speedups.`,
      },
      critical_thinking: {
        q: `In the event of a compromised root credential or insider threat, how does "${cleanTopic}" limit the blast radius?`,
        c: `Resilient systems partition trust boundaries and enforce automated least-privilege revocation.`,
      },
      future_oriented: {
        q: `How will autonomous AI-driven cyber threats impact the defensive posture of "${cleanTopic}" over the coming decade?`,
        c: `Future cyber defense shifts from reactive signature matching to autonomous real-time behavioral anomaly detection.`,
      },
    };
    question = secQuestions[chosenType].q;
    clarification = secQuestions[chosenType].c;
  } else if (isCloudOrIoT) {
    const cloudQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `In "${cleanTopic}", how does the system maintain state consistency and fault tolerance across distributed nodes during network partitions?`,
        c: `Distributed architecture is governed by the CAP theorem, requiring deliberate choices between strict consistency and high availability.`,
      },
      application: {
        q: `What practical deployment strategies in "${cleanTopic}" optimize operational cost while meeting strict SLAs for high-throughput traffic?`,
        c: `Scalable cloud systems leverage autoscaling, localized caching, and decoupled asynchronous messaging.`,
      },
      analytical: {
        q: `What are the critical telemetry and observability signals needed to diagnose transient failures in "${cleanTopic}"?`,
        c: `Effective site reliability engineering combines distributed tracing, tail latency analysis, and automated circuit breaking.`,
      },
      research: {
        q: `What emerging paradigms in serverless orchestration or edge mesh computing will most significantly improve "${cleanTopic}"?`,
        c: `Modern infrastructure research focuses on cold-start elimination, decentralized scheduling, and edge state locality.`,
      },
      critical_thinking: {
        q: `If network bandwidth drops by 80% or packet latency spikes tenfold, how gracefully does "${cleanTopic}" degrade?`,
        c: `Resilient architectures design graceful degradation paths, offline queues, and essential-service prioritization.`,
      },
      future_oriented: {
        q: `How will 5G and 6G edge convergence alter the architectural trade-offs of "${cleanTopic}" over the next five years?`,
        c: `Ultra-reliable low-latency networks enable pushing compute-intensive decision loops directly to boundary nodes.`,
      },
    };
    question = cloudQuestions[chosenType].q;
    clarification = cloudQuestions[chosenType].c;
  } else if (isHardwareOrEnergy) {
    const hwQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `Regarding "${cleanTopic}", what are the fundamental efficiency, thermal, or energy-conversion constraints that dictate system design?`,
        c: `Hardware engineering requires balancing thermodynamic limits against material lifecycle and volumetric power density.`,
      },
      application: {
        q: `In manufacturing and deploying "${cleanTopic}", what are the biggest economic obstacles to achieving economies of scale?`,
        c: `Commercial viability depends on component standardization, robust supply chains, and automated quality control.`,
      },
      analytical: {
        q: `What accelerated lifecycle stress tests or degradation failure modes are most critical for "${cleanTopic}"?`,
        c: `Ensuring multi-year reliability requires rigorous thermal cycling, vibrational analysis, and failure mode analysis.`,
      },
      research: {
        q: `What novel material science or solid-state innovation holds the greatest potential to advance "${cleanTopic}"?`,
        c: `Transformative hardware progress is driven by advanced semiconductor substrates, nanomaterials, and novel chemistries.`,
      },
      critical_thinking: {
        q: `If ambient operating temperatures exceed design specifications by 25 degrees, how does "${cleanTopic}" maintain fail-safe operation?`,
        c: `Mission-critical systems must integrate active thermal management, load derating, and redundant hardware interlocks.`,
      },
      future_oriented: {
        q: `How will global sustainability mandates and circular economy requirements influence the next generation of "${cleanTopic}"?`,
        c: `Future mechanical and energy designs must prioritize recyclability, non-toxic components, and minimal carbon footprints.`,
      },
    };
    question = hwQuestions[chosenType].q;
    clarification = hwQuestions[chosenType].c;
  } else if (isBiotechOrHealth) {
    const bioQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `In "${cleanTopic}", how is clinical efficacy established, and how do researchers control for confounding biological variables?`,
        c: `Biomedical validation requires double-blind methodologies, statistically powered cohorts, and rigorous baseline controls.`,
      },
      application: {
        q: `What regulatory hurdles, patient privacy protections, and workflow integration challenges affect the adoption of "${cleanTopic}"?`,
        c: `Healthcare translation demands compliance with regulatory frameworks, HIPAA, and seamless EHR integration.`,
      },
      analytical: {
        q: `What is the risk profile associated with false-positive versus false-negative outcomes in "${cleanTopic}"?`,
        c: `Clinical decision support systems must tune sensitivity and specificity to minimize diagnostic misclassification.`,
      },
      research: {
        q: `What unsolved biological mechanism or data scarcity issue represents the primary bottleneck in "${cleanTopic}"?`,
        c: `Translational research requires high-fidelity longitudinal data and multi-omics molecular characterization.`,
      },
      critical_thinking: {
        q: `How does "${cleanTopic}" safeguard equitable diagnostic performance across diverse demographic and socioeconomic groups?`,
        c: `Inclusive medical technology demands diverse training validation to mitigate systemic algorithmic bias.`,
      },
      future_oriented: {
        q: `Looking ahead, how will personalized medicine and real-time biometric sensors transform the standard of care in "${cleanTopic}"?`,
        c: `The future of health tech converges around predictive analytics, continuous monitoring, and tailored therapies.`,
      },
    };
    question = bioQuestions[chosenType].q;
    clarification = bioQuestions[chosenType].c;
  } else {
    // General Engineering & Technology topic
    const genQuestions: Record<PresentationQuestionType, { q: string; c: string }> = {
      conceptual: {
        q: `In your presentation on "${cleanTopic}", what is the core architectural principle that distinguishes this approach from traditional baseline methods?`,
        c: `Conceptual clarity requires isolating the foundational technological differentiator from peripheral features.`,
      },
      application: {
        q: `Regarding "${cleanTopic}", what is the biggest practical bottleneck engineers encounter when transitioning from prototype to full-scale deployment?`,
        c: `Bridging the gap between theory and industry implementation demands addressing real-world integration costs and operational constraints.`,
      },
      analytical: {
        q: `What are the critical performance limitations, operational costs, or architectural trade-offs associated with "${cleanTopic}"?`,
        c: `Every engineering solution balances system throughput and accuracy against resource consumption and complexity.`,
      },
      research: {
        q: `What open technological challenge or gap in current research must be solved before "${cleanTopic}" achieves universal adoption?`,
        c: `Engineering progress requires defining precise problem boundaries before proposing scalable technical solutions.`,
      },
      critical_thinking: {
        q: `If one of the core dependencies or resource conditions in "${cleanTopic}" fails unexpectedly, how does the system recover?`,
        c: `Resilient engineering requires stress-testing assumptions against unexpected edge cases and cascading failure modes.`,
      },
      future_oriented: {
        q: `Looking ahead five to seven years, what major technological trend or industry shift will most fundamentally reshape "${cleanTopic}"?`,
        c: `Long-term technical success requires anticipating cross-disciplinary convergence and continuous technological adaptation.`,
      },
    };
    question = genQuestions[chosenType].q;
    clarification = genQuestions[chosenType].c;
  }

  return {
    type: chosenType,
    question,
    clarification,
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
