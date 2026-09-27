import { TranscriptEntry, Student } from '../types/gd';

// Session-level memory tracker to guarantee no question is repeated
export class FacilitatorQuestionTracker {
  private askedQuestions: Set<string> = new Set();
  private askedTopics: string[] = [];

  constructor() {
    this.askedQuestions = new Set();
  }

  public recordQuestion(question: string) {
    const normalized = this.normalize(question);
    this.askedQuestions.add(normalized);
    this.askedTopics.push(question);
  }

  public hasBeenAsked(question: string): boolean {
    const normalized = this.normalize(question);
    if (this.askedQuestions.has(normalized)) return true;
    
    // Check similarity ratio with any previously asked question
    for (const asked of this.askedQuestions) {
      if (this.calculateOverlap(normalized, asked) > 0.7) {
        return true;
      }
    }
    return false;
  }

  public getAskedQuestionsList(): string[] {
    return Array.from(this.askedTopics);
  }

  public clear() {
    this.askedQuestions.clear();
    this.askedTopics = [];
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  private calculateOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }
}

export const sessionQuestionTracker = new FacilitatorQuestionTracker();

// Comprehensive multidimensional question repositories for non-repeating, diverse discourse
interface TopicQuestions {
  ethical: string[];
  economic: string[];
  humanExperience: string[];
  pedagogical: string[];
  devilAdvocate: string[];
  futureOutlook: string[];
  implementation: string[];
}

const TOPIC_QUESTION_BANKS: Record<string, TopicQuestions> = {
  ai_education: {
    ethical: [
      "Let's examine the ethical dimension: if AI algorithms are trained on historic data, how do we prevent historical cultural biases from influencing automated grading?",
      "How do we address data privacy when biometric attention-tracking or predictive student analytics are collected by private tech conglomerates?",
      "What happens to intellectual authenticity and critical thinking when students rely on large language models for initial problem synthesis?"
    ],
    economic: [
      "Looking at infrastructure costs: how can tier-2 and tier-3 colleges afford high-performance AI computing clusters without increasing student tuition?",
      "What are the economic ramifications for academic publishing and educator employment if curriculum design is automated?",
      "Could the deployment of proprietary AI platforms exacerbate the educational divide between elite institutions and underfunded public schools?"
    ],
    humanExperience: [
      "Let us consider the psychological aspect: how does learning from an algorithm affect a young student's motivation, emotional resilience, and ability to handle academic failure?",
      "Can an artificial intelligence truly convey passion, storytelling, and serendipitous inspiration in the way a dedicated mentor does?",
      "How might the lack of organic peer-to-peer classroom struggles impact social and collaborative maturation?"
    ],
    pedagogical: [
      "How does automated adaptive feedback handle creative, non-linear reasoning in humanities and philosophy where there is no single binary truth?",
      "In laboratory sciences and clinical medical training, where physical dexterity and tactile instinct are paramount, what are the strict limitations of AI simulation?",
      "If AI designs the optimal personalized path for every child, do students lose the valuable skill of navigating confusion and ambiguity independently?"
    ],
    devilAdvocate: [
      "Let me challenge the consensus: what if human teachers are actually the bottleneck in education due to subjective favoritism, fatigue, and uneven teaching quality?",
      "If an AI tutor can be available 24/7 in 50 native languages with infinite patience, is it elitist to insist on human-only instruction?",
      "Why should memorization and conventional test-taking remain relevant if knowledge retrieval has effectively become instantaneous and zero-cost?"
    ],
    futureOutlook: [
      "Looking ahead 10 years: what specific new roles will emerge for human professors in a fully AI-augmented collegiate ecosystem?",
      "How must university degree credentials adapt when continuous AI-driven micro-certifications become the industry hiring standard?",
      "How should national educational policies regulate the boundary between human judgment and automated evaluation?"
    ],
    implementation: [
      "From an operational perspective, how should faculty development programs train veteran professors to collaborate seamlessly with AI teaching assistants?",
      "What fallback protocols must institutions establish when cloud-based AI learning networks experience outages or security breaches?",
      "How can educators structure assessments that evaluate high-order synthesis rather than easily regurgitated AI generated outputs?"
    ]
  },
  general: {
    ethical: [
      "Let's examine the ethical implications: who bears moral accountability if automated recommendations lead to unintended societal harm?",
      "How do we ensure that vulnerable and marginalized demographics are not disproportionately disadvantaged by this paradigm shift?",
      "What safeguards are necessary to protect individual autonomy and transparency under this model?"
    ],
    economic: [
      "From a financial feasibility standpoint, what is the anticipated return on investment, and who will fund the initial capital expenditure?",
      "How might market monopolization by early-adopter corporations impact competitive market pricing for end consumers?",
      "What are the secondary economic effects on workforce transition, retraining costs, and regional employment stability?"
    ],
    humanExperience: [
      "How does this transition alter interpersonal relationships, workplace camaraderie, and daily quality of life?",
      "Are we accounting for the psychological adjustments and emotional stresses experienced by users during rapid systemic change?",
      "How can we preserve human agency, creative intuition, and spontaneous serendipity as processes become increasingly standardized?"
    ],
    pedagogical: [
      "What fundamental competencies and foundational skills must the next generation develop to remain resilient in this evolving landscape?",
      "How should our analytical frameworks evolve to measure qualitative long-term impact rather than just short-term quantitative throughput?",
      "Where does conventional wisdom fail when applied to this unprecedented modern scenario?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if the primary risks being discussed are overstated, and delaying full adoption incurs far greater global opportunity costs?",
      "Could the traditional objections we have raised simply be reflexive resistance to inevitable technological evolution?",
      "What if the unintended secondary benefits far outweigh the localized transitional friction?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how might geopolitical competition and international regulatory standards reshape this domain?",
      "What unforeseen technological breakthroughs could render our current debates and assumptions obsolete?",
      "What legacy principles must we fiercely preserve regardless of how advanced the underlying tools become?"
    ],
    implementation: [
      "From a practical implementation standpoint, what are the top three phased milestones required for risk-mitigated rollout?",
      "How do we bridge the knowledge gap between policy architects and frontline operational teams executing on the ground?",
      "What empirical metrics should an independent audit committee monitor to evaluate whether this initiative is succeeding?"
    ]
  }
};

/**
 * Returns a unique, non-repeating probing question tailored to the topic, recent discussion flow,
 * and participation balance.
 */
export function getNextUniqueFacilitatorPrompt(
  topic: string,
  transcripts: TranscriptEntry[],
  students: Student[],
  phase: string = 'active_discussion',
  deadlockTriggered: boolean = false
): { text: string; actionType: string; targetStudent?: Student } {
  // 1. Identify under-represented or quiet students to promote balanced participation
  const quietStudents = students
    .filter((s) => !s.isSpeaking)
    .sort((a, b) => a.speakingTurns - b.speakingTurns || a.speakingDurationSeconds - b.speakingDurationSeconds);
  
  const mostQuiet = quietStudents[0];
  const mostActive = students.slice().sort((a, b) => b.speakingTurns - a.speakingTurns)[0];

  // Pick question bank based on topic keywords
  const isAITopic = /ai|artificial intelligence|machine learning|teacher|education/i.test(topic);
  const bank = isAITopic ? TOPIC_QUESTION_BANKS.ai_education : TOPIC_QUESTION_BANKS.general;

  // Collect all available dimension pools
  const categories: (keyof TopicQuestions)[] = [
    'ethical',
    'economic',
    'humanExperience',
    'pedagogical',
    'devilAdvocate',
    'futureOutlook',
    'implementation',
  ];

  // If deadlock (silence) occurred, prioritize thought-provoking devil's advocate or human experience
  if (deadlockTriggered) {
    const deadlockCandidates = [
      ...bank.devilAdvocate,
      ...bank.humanExperience,
      ...bank.futureOutlook,
    ];

    for (const q of deadlockCandidates) {
      if (!sessionQuestionTracker.hasBeenAsked(q)) {
        sessionQuestionTracker.recordQuestion(q);
        return {
          text: q,
          actionType: 'deadlock_recovery',
          targetStudent: mostQuiet && mostQuiet.speakingTurns === 0 ? mostQuiet : undefined,
        };
      }
    }
  }

  // If participation imbalance is high (e.g. one student spoke 4+ turns while someone has 0-1 turns)
  if (mostQuiet && mostActive && mostActive.speakingTurns - mostQuiet.speakingTurns >= 2) {
    const inviteTemplates = [
      `Thank you for those points. We'd love to balance the discussion by bringing in ${mostQuiet.name} from Seat ${mostQuiet.seatNumber}. What is your perspective on this topic?`,
      `That adds a valuable perspective. Let us hear from ${mostQuiet.name} at Seat ${mostQuiet.seatNumber}—how would you assess the practical challenges discussed so far?`,
      `Let's invite ${mostQuiet.name} (Seat ${mostQuiet.seatNumber}) to share their insights on how this affects students and professionals.`,
    ];

    for (const invite of inviteTemplates) {
      if (!sessionQuestionTracker.hasBeenAsked(invite)) {
        sessionQuestionTracker.recordQuestion(invite);
        return {
          text: invite,
          actionType: 'rebalance_turn',
          targetStudent: mostQuiet,
        };
      }
    }
  }

  // Iterate through question categories to find a fresh, unasked question
  // Shuffle categories to ensure varied angles across turns
  const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);

  for (const cat of shuffledCategories) {
    const questions = bank[cat];
    for (const q of questions) {
      if (!sessionQuestionTracker.hasBeenAsked(q)) {
        sessionQuestionTracker.recordQuestion(q);
        return {
          text: q,
          actionType: 'probing_question',
        };
      }
    }
  }

  // Dynamic context-spliced fallback if predefined bank is exhausted
  const recentSpeaker = transcripts.filter((t) => !t.isFacilitator).slice(-1)[0];
  const dynamicProbe = recentSpeaker
    ? `Building on what ${recentSpeaker.speakerName} shared, how might we weigh the short-term conveniences against the long-term societal accountability of this model?`
    : `Let us broaden our scope: what unexpected regulatory or ethical challenges might emerge as this technology scales over the next five years?`;

  sessionQuestionTracker.recordQuestion(dynamicProbe);
  return {
    text: dynamicProbe,
    actionType: 'probing_question',
  };
}

// ==========================================
// CANDIDATE PREVIOUS PRESENTATION MAPPINGS & INITIATION ENGINE
// ==========================================

export interface PreviousPresentationData {
  topic: string;
  keyInsight: string;
}

export const KNOWN_PREVIOUS_PRESENTATIONS: Record<string, PreviousPresentationData> = {
  'rahul kumar': {
    topic: 'Sustainable Cloud Computing and Green Datacenters',
    keyInsight: 'balancing computational scalability with energy efficiency and algorithmic ethics',
  },
  'priya sharma': {
    topic: 'Enterprise Data Privacy and Zero-Trust Distributed Systems',
    keyInsight: 'safeguarding consumer confidentiality in cloud-native microservices',
  },
  'ramesh patel': {
    topic: 'IoT Sensor Networks and Edge Hardware Acceleration',
    keyInsight: 'practical hardware deployment constraints in semi-urban and industrial networks',
  },
  'sneha reddy': {
    topic: 'Predictive Machine Learning and Algorithmic Bias Mitigation',
    keyInsight: 'demographic parity and representation in automated training datasets',
  },
  'vikram joshi': {
    topic: 'Industrial Robotics and Automated Operational Safety Standards',
    keyInsight: 'risk-managed physical deployment and regulatory compliance in automated environments',
  },
  'ananya verma': {
    topic: 'Large Language Models and Multilingual Natural Language Processing',
    keyInsight: 'bridging vernacular linguistic divides through generative NLP',
  },
  'rohan gupta': {
    topic: 'Next-Gen Cybersecurity and Autonomous Threat Detection',
    keyInsight: 'adversarial robustness and proactive perimeter monitoring',
  },
  'meera iyer': {
    topic: 'Bioinformatics and Ethical Governance in Healthcare Technology',
    keyInsight: 'patient data sovereignty and clinical precision diagnostics',
  },
  'kavita nair': {
    topic: 'Smart Urban Infrastructure and Sustainable Lifecycle Architecture',
    keyInsight: 'environmental resiliency and civic technology adoption',
  },
  'divya balaji': {
    topic: 'Decentralized Consensus Protocols and FinTech Trust Networks',
    keyInsight: 'transactional integrity and automated audit transparency',
  },
  'tanmay kulkarni': {
    topic: 'Thermodynamics Modeling and Computational Fluid Dynamics',
    keyInsight: 'computational simulations versus physical empirical verification',
  },
  'ritu sengupta': {
    topic: 'User Experience Optimization in Mission-Critical Systems',
    keyInsight: 'intuitive interface ergonomics and error reduction in high-stress workflows',
  },
  'varun mehta': {
    topic: 'Autonomous Drone Navigation and Sensor Fusion',
    keyInsight: 'real-time edge decision making under adverse network latency',
  },
  'pooja chawla': {
    topic: 'Automated CI/CD Pipelines and Enterprise Software Quality Assurance',
    keyInsight: 'continuous automated validation without compromising deployment agility',
  },
  'siddharth menon': {
    topic: 'Quantum Computing Foundations and Post-Quantum Cryptography',
    keyInsight: 'future-proofing secure encryption against next-generation compute paradigms',
  },
};

/**
 * Returns previous presentation data for any student, using known mapping or intelligent heuristic based on academic discipline
 */
export function getStudentPreviousPresentation(student: Student): PreviousPresentationData {
  const nameKey = (student.name || '').toLowerCase().trim();
  if (KNOWN_PREVIOUS_PRESENTATIONS[nameKey]) {
    return KNOWN_PREVIOUS_PRESENTATIONS[nameKey];
  }

  // Fallback heuristic based on course/department or academic background
  const course = (student.course || '').toLowerCase();
  if (course.includes('data') || course.includes('ai') || course.includes('ml')) {
    return {
      topic: 'Predictive Analytics and Responsible Machine Learning',
      keyInsight: 'model transparency, bias reduction, and algorithmic fairness',
    };
  }
  if (course.includes('ece') || course.includes('electronics') || course.includes('hardware')) {
    return {
      topic: 'Edge Intelligence and Embedded Hardware Architectures',
      keyInsight: 'processing constraints and real-time connectivity',
    };
  }
  if (course.includes('it') || course.includes('cse') || course.includes('software')) {
    return {
      topic: 'Distributed Systems and Scalable Software Architectures',
      keyInsight: 'system reliability, user data security, and latency optimization',
    };
  }
  if (course.includes('mech') || course.includes('mechatronics')) {
    return {
      topic: 'Automated Robotics and Precision Engineering Frameworks',
      keyInsight: 'physical feasibility and real-world industrial testing',
    };
  }
  if (course.includes('bio') || course.includes('chem')) {
    return {
      topic: 'Biomedical Informatics and Healthcare Data Governance',
      keyInsight: 'rigorous clinical validation and patient privacy ethics',
    };
  }
  return {
    topic: 'Emerging Technological Paradigms and Institutional Adaptation',
    keyInsight: 'societal impact, economic feasibility, and structured implementation',
  };
}

/**
 * Generates an initiation prompt inviting a specific student based on their previous presentation when no one speaks after start
 */
export function generateInitiationPrompt(student: Student, sessionTopic: string): string {
  const prev = getStudentPreviousPresentation(student);
  const firstName = student.name.split(' ')[0];
  const templates = [
    `Since no one has opened the floor yet, let us invite ${student.name} from Seat ${student.seatNumber}. ${firstName}, based on your previous presentation on "${prev.topic}", could you kick off today's discussion on "${sessionTopic}" with your opening thoughts?`,
    `As the floor is currently quiet, I would like to call upon ${student.name} at Seat ${student.seatNumber}. ${firstName}, drawing from your previous work regarding ${prev.keyInsight}, what are your opening thoughts on "${sessionTopic}"?`,
    `Let us get the discussion underway. ${student.name} (Seat ${student.seatNumber}), considering your previous presentation examining "${prev.topic}", would you like to set the stage and initiate our perspectives today?`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generates a targeted question explicitly mentioning the candidate by name during mid-discussion pauses
 */
export function generateTargetedQuestionForStudent(
  student: Student,
  sessionTopic: string,
  lastTranscript?: TranscriptEntry
): string {
  const firstName = student.name.split(' ')[0];
  const prev = getStudentPreviousPresentation(student);

  // Pick question bank based on topic keywords
  const isAITopic = /ai|artificial intelligence|machine learning|teacher|education/i.test(sessionTopic);
  const bank = isAITopic ? TOPIC_QUESTION_BANKS.ai_education : TOPIC_QUESTION_BANKS.general;

  const sampleQuestions = [
    ...bank.ethical,
    ...bank.economic,
    ...bank.humanExperience,
    ...bank.implementation,
    ...bank.devilAdvocate,
  ];
  const q = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];

  if (lastTranscript && !lastTranscript.isFacilitator) {
    const templates = [
      `${student.name} from Seat ${student.seatNumber}, building on what ${lastTranscript.speakerName} highlighted, how do you evaluate this? Specifically, ${q.replace(/^Let's examine |^How do we |^What happens to /, '')}`,
      `${firstName}, we haven't heard your viewpoint on this angle yet. In light of ${lastTranscript.speakerName}'s remarks, ${q}`,
      `${student.name}, as someone with research background in ${prev.keyInsight}, what is your take on this? ${q}`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  const templates = [
    `${student.name} from Seat ${student.seatNumber}, we would like to hear your perspective on this. ${q}`,
    `${firstName}, looking at this challenge through the lens of ${prev.topic}, how would you approach this?`,
    `${student.name}, you haven't shared your perspective yet—what is your assessment regarding ${q.replace(/^Let's examine /, '')}?`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Turn-taking logic: shifts to the candidate who hasn't spoken yet (speakingTurns === 0),
 * or shifts to the next person in sequence with the lowest turn count.
 */
export function getNextTurnSpeaker(
  students: Student[],
  currentSpeakerId?: string | null
): Student | undefined {
  // Exclude current speaker and empty seats
  const candidates = students.filter(
    (s) => s.id !== currentSpeakerId && !s.isEmptySeat
  );

  if (candidates.length === 0) return undefined;

  // 1. Priority: Find candidates who haven't spoken yet (speakingTurns === 0)
  const unspoken = candidates.filter((s) => (s.speakingTurns || 0) === 0);
  if (unspoken.length > 0) {
    // Sort by seat number to maintain an orderly flow around the table
    return unspoken.sort((a, b) => a.seatNumber - b.seatNumber)[0];
  }

  // 2. If all have spoken at least once: pick the student who spoke least
  const sortedByTurns = candidates.slice().sort((a, b) => {
    if (a.speakingTurns !== b.speakingTurns) {
      return a.speakingTurns - b.speakingTurns;
    }
    return (a.speakingDurationSeconds || 0) - (b.speakingDurationSeconds || 0);
  });

  // If there are candidates tied for lowest turns, try to pick the next sequential seat after current speaker
  const currentSpeaker = students.find((s) => s.id === currentSpeakerId);
  if (currentSpeaker) {
    const currentSeat = currentSpeaker.seatNumber || 1;
    const nextInSequence = candidates
      .filter((s) => s.seatNumber > currentSeat)
      .sort((a, b) => a.seatNumber - b.seatNumber)[0];
    if (nextInSequence && nextInSequence.speakingTurns <= sortedByTurns[0].speakingTurns + 1) {
      return nextInSequence;
    }
  }

  return sortedByTurns[0];
}

/**
 * Generates initial opening statement for the student who was initiated by the AI facilitator
 */
export function generateStudentOpeningStatement(student: Student, sessionTopic: string): string {
  const prev = getStudentPreviousPresentation(student);
  const templates = [
    `Thank you, Facilitator. To open today's discussion on "${sessionTopic}", drawing from my previous research on ${prev.topic}, I believe we must evaluate this through both technological feasibility and human accountability. In my previous work, I found that ${prev.keyInsight}, and that exact principle directly applies here.`,
    `Thank you for giving me the floor to initiate. When examining "${sessionTopic}", my immediate perspective—informed by my previous presentation on ${prev.topic}—is that we cannot treat this as an all-or-nothing proposition. Instead, ${prev.keyInsight} must guide our implementation framework.`,
    `I appreciate the opportunity to start off our group discussion. In my previous project on ${prev.topic}, we analyzed how ${prev.keyInsight}. Applying that to "${sessionTopic}", I would argue that our primary focus should be on practical sustainability and equitable access before scaling further.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generates follow-up arguments or answers to targeted facilitator questions for subsequent speaking turns
 */
export function generateStudentFollowUpStatement(
  student: Student,
  sessionTopic: string,
  previousSpeaker?: { name: string; text?: string },
  questionAsked?: string
): string {
  const prev = getStudentPreviousPresentation(student);
  const prevName = previousSpeaker?.name ? previousSpeaker.name.split(' ')[0] : 'the previous speaker';

  if (questionAsked) {
    const templates = [
      `Addressing the facilitator's question directly: regarding ${prev.keyInsight}, I strongly believe we need clear benchmark criteria. While ${prevName} made valid points, we must ensure safeguards and quality checks are in place from day one.`,
      `Thank you for that targeted question. Looking at this through the lens of ${prev.topic}, my perspective is that balancing cost, ethics, and scalability requires a structured multi-phase rollout rather than rushed deployment.`,
      `In response to that question, I would emphasize that ${prev.keyInsight}. If we overlook the ground realities and operational hurdles, the entire initiative risks losing trust and efficacy.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  const templates = [
    `Building on what ${prevName} just articulated, I agree with that viewpoint, but I would like to introduce another critical dimension: ${prev.keyInsight}. In my previous analysis of ${prev.topic}, we saw that failing to account for this led to major bottlenecks.`,
    `I would like to offer a constructive counter-perspective to ${prevName}'s argument. While that rationale works in ideal conditions, real-world deployment reveals that ${prev.keyInsight}. We must address these systemic constraints.`,
    `Adding to the points discussed by ${prevName}, from my experience analyzing ${prev.topic}, the solution lies in combining automation with rigorous human oversight. That way, we maintain high standards without compromising ethical responsibility.`,
    `I appreciate ${prevName}'s thoughts. From a practical standpoint, we must also consider how this impacts frontline practitioners. In my previous presentation on ${prev.topic}, evidence demonstrated that ${prev.keyInsight}.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
