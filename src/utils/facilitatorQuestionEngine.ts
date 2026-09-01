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
