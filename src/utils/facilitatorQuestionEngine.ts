import { TranscriptEntry, Student } from '../types/gd';

// Session-level memory tracker to guarantee no question is repeated
export class FacilitatorQuestionTracker {
  private askedQuestions: Set<string> = new Set();
  private askedTopics: string[] = [];

  constructor() {
    this.askedQuestions = new Set();
  }

  public recordQuestion(question: string) {
    if (!question) return;
    const normalized = this.normalize(question);
    this.askedQuestions.add(normalized);
    // Also store key substantive stem (stripping student greeting prefixes)
    const stem = this.extractStem(question);
    if (stem && stem.length > 10) {
      this.askedQuestions.add(stem);
    }
    if (!this.askedTopics.includes(question)) {
      this.askedTopics.push(question);
    }
  }

  public hasBeenAsked(question: string): boolean {
    if (!question) return false;
    const normalized = this.normalize(question);
    if (this.askedQuestions.has(normalized)) return true;
    
    const stem = this.extractStem(question);
    if (stem && this.askedQuestions.has(stem)) return true;

    // Check similarity ratio with any previously asked question
    for (const asked of this.askedQuestions) {
      if (this.calculateOverlap(normalized, asked) > 0.48) {
        return true;
      }
      if (stem && asked.length > 15 && this.calculateOverlap(stem, asked) > 0.48) {
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
    return String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  private extractStem(text: string): string {
    // Remove participant greetings like "Chetan from Seat 1, ...", "Good morning, ..."
    return this.normalize(text.replace(/^[^,]+,\s*/, '').replace(/^(seat \d+|dear participant|thank you|welcome)[^,.:]*[,.:]\s*/i, ''));
  }

  private calculateOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }
}

export const sessionQuestionTracker = new FacilitatorQuestionTracker();

export type TopicDomain = 
  | 'cinema_media'
  | 'healthcare_medicine'
  | 'ecommerce_retail'
  | 'clean_energy_ev'
  | 'finance_crypto'
  | 'workplace_career'
  | 'education_learning'
  | 'technology_ai'
  | 'social_governance'
  | 'general';

/**
 * Accurately classifies any topic title into its corresponding discussion domain
 */
export function detectTopicDomain(topic: string = ''): TopicDomain {
  const t = (topic || '').toLowerCase();
  
  if (/\b(movie|movies|film|films|cinema|cinemas|theatre|theater|hollywood|bollywood|tollywood|kollywood|actor|actress|director|ott|streaming|censor|censorship|box office|multiplex|entertainment|media|pop culture|drama|documentar(y|ies)|series)\b/i.test(t)) {
    return 'cinema_media';
  }
  
  if (/\b(health|healthcare|medical|medicine|hospital|doctor|patient|pharma|pharmaceutical|vaccine|disease|mental health|telemedicine|clinic|surgery|wellness|nurs(e|ing))\b/i.test(t)) {
    return 'healthcare_medicine';
  }
  
  if (/\b(e-?commerce|ecommerce|online shopping|retail|quick commerce|q-?commerce|delivery|blinkit|zepto|instamart|swiggy|zomato|amazon|flipkart|dark store|kirana|shopping|consumerism|logistics)\b/i.test(t)) {
    return 'ecommerce_retail';
  }
  
  if (/\b(ev|evs|electric vehicle|electric vehicles|solar|wind|renewable|clean energy|green energy|carbon|climate|climate change|battery|pollution|sustainable|sustainability|net zero|emissions)\b/i.test(t)) {
    return 'clean_energy_ev';
  }
  
  if (/\b(crypto|cryptocurrency|bitcoin|blockchain|fintech|banking|upi|digital currency|stock market|shares|inflation|investment|cbdc|cashless|finance|monetary)\b/i.test(t)) {
    return 'finance_crypto';
  }
  
  if (/\b(remote work|work from home|wfh|hybrid work|four-day|4-day|work-life|workplace|layoff|layoffs|moonlighting|gig economy|freelanc(e|ing)|corporate culture|career|retire|employment|unemployment)\b/i.test(t)) {
    return 'workplace_career';
  }
  
  if (/\b(education|edtech|school|schools|college|colleges|university|universities|student|students|teacher|teachers|curriculum|exam|exams|nep|rote learning|online learning|academic|degree|degrees|higher education)\b/i.test(t)) {
    return 'education_learning';
  }
  
  if (/\b(ai|artificial intelligence|machine learning|deep learning|genai|generative ai|llm|robot|robotics|automation|algorithm|algorithms|cyber|cybersecurity|data privacy|software|tech|technology|deepfake|metaverse)\b/i.test(t)) {
    return 'technology_ai';
  }
  
  if (/\b(govern(ance|ment)|polic(y|ies)|democra(cy|tic)|free speech|civil rights|urban planning|smart cit(y|ies)|traffic|public transport|reservation|corruption|law|legal|judiciar(y|ial)|social reform)\b/i.test(t)) {
    return 'social_governance';
  }

  return 'general';
}

// Comprehensive multidimensional question repositories for non-repeating, diverse discourse
export interface TopicQuestions {
  ethical: string[];
  economic: string[];
  humanExperience: string[];
  pedagogical: string[];
  devilAdvocate: string[];
  futureOutlook: string[];
  implementation: string[];
}

export const TOPIC_QUESTION_BANKS: Record<string, TopicQuestions> = {
  cinema_media: {
    ethical: [
      "Let's examine the ethical dimension: does cinema have an inherent moral obligation to challenge societal prejudices, or is its sole duty commercial entertainment?",
      "How do we balance creative artistic expression against the danger of glorifying violence, crime, and regressive stereotypes on the big screen?",
      "With algorithmic content curation on OTT platforms, who bears ethical accountability when sensationalized media polarizes viewers?"
    ],
    economic: [
      "From an economic standpoint: how can independent and regional filmmakers survive when massive corporate marketing budgets and multiplexes dominate screen allocation?",
      "What are the financial ramifications for traditional single-screen theatres as direct-to-digital OTT streaming deals proliferate?",
      "Could hyper-commercialization and reliance on formulaic star-driven franchises stifle genuine cinematic innovation and scriptwriting quality?"
    ],
    humanExperience: [
      "Considering the cultural impact: how deeply does cinematic representation shape the identity, dreams, and worldview of rural and grassroots communities?",
      "How does the shift from collective theatre viewing with diverse audiences to isolated smartphone streaming alter the communal storytelling experience?",
      "Can films and regional digital series bridge cultural and linguistic divides, or do they risk creating homogeneous urban-centric narratives?"
    ],
    pedagogical: [
      "How can media literacy be taught so young audiences critically deconstruct screen narratives rather than passively absorbing them as reality?",
      "In an era of generative AI visual synthesis and digital likenesses, how should viewers evaluate narrative credibility and creative authenticity?",
      "Where do conventional film appreciation models fail when evaluating emerging non-linear, multi-part episodic streaming storytelling?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if films are purely commercial commodities driven by market demand, and expecting filmmakers to act as social reformers is unrealistic?",
      "Could government film censorship and moral policing actually do far more harm to cultural maturity than unrestricted creative freedom?",
      "What if the decline of traditional single-screen theatres is simply natural economic evolution that brings cheaper, diverse global cinema directly to everyone?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how will generative AI tools in scriptwriting, visual effects, and virtual actors reshape human filmmaking careers?",
      "Will hyper-personalized interactive cinema, where viewers choose their own story arcs, replace traditional linear film watching?",
      "How will regional Indian cinema compete or collaborate with global streaming giants to retain authentic cultural roots on the international stage?"
    ],
    implementation: [
      "From a policy implementation standpoint: how should national certification boards transition from punitive censorship to transparent age-rating frameworks?",
      "What targeted financial subsidies or tax incentives can state governments establish to preserve heritage single-screen cinemas in tier-2 and tier-3 towns?",
      "How can industry guilds legally protect the wages, working hours, and physical safety of behind-the-scenes crew, technicians, and junior artists?"
    ]
  },
  healthcare_medicine: {
    ethical: [
      "Let's examine the ethical dimension: how should society navigate the moral dilemma when life-saving treatments are priced beyond the reach of ordinary families?",
      "Where do we draw the line between clinical doctor autonomy and algorithmic AI diagnostic recommendations in critical care?",
      "What ethical safeguards must govern clinical trials to guarantee economically vulnerable populations are not exploited?"
    ],
    economic: [
      "From a healthcare economics standpoint: how can developing nations fund universal healthcare without crippling public fiscal budgets?",
      "What is the economic impact of catastrophic out-of-pocket medical expenditure on pushing lower-income households into poverty?",
      "How can governments incentivize domestic pharmaceutical innovation while keeping generic essential drugs universally affordable?"
    ],
    humanExperience: [
      "How do we preserve the empathetic, compassionate doctor-patient bond in an increasingly digitized, telemedicine-driven consultation environment?",
      "What psychological toll does healthcare professional burnout take on clinical quality and frontline medical decisions?",
      "How can healthcare systems address the stigma and systemic neglect surrounding mental health in grassroots and rural communities?"
    ],
    pedagogical: [
      "How should medical curricula modernize to prepare doctors for AI-assisted diagnostics, genomics, and digital health records?",
      "What public health awareness campaigns are most effective at dismantling deeply rooted medical misinformation in rural areas?",
      "Where does traditional hospital-centric training fail when preparing practitioners for community preventative medicine?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if aggressive private healthcare investment is the only realistic way to build world-class medical infrastructure quickly?",
      "Could over-regulating medical technology and drug approvals delay life-saving innovations at greater net human cost?",
      "What if primary preventative wellness incentives produce ten times greater societal returns than subsidizing ultra-expensive late-stage tertiary treatments?"
    ],
    futureOutlook: [
      "Looking ahead 10 years: how will personalized mRNA therapies and CRISPR gene editing reshape preventive healthcare?",
      "Will remote robotic surgeries and drone-delivered medical supplies successfully bridge the acute urban-rural healthcare divide?",
      "How will national digital health IDs and unified health interfaces transform preventative epidemiology and pandemic response?"
    ],
    implementation: [
      "From an operational perspective: what mandatory incentives can ensure newly trained doctors complete mandatory service in rural primary health centers?",
      "How can hospitals implement interoperable electronic health records without overwhelming doctors with bureaucratic administrative burdens?",
      "What emergency protocols should be codified to rapidly scale oxygen, beds, and critical supplies during regional epidemics?"
    ]
  },
  ecommerce_retail: {
    ethical: [
      "Let's examine the ethical dimension: is the consumer convenience of 10-minute delivery worth the severe physical risks imposed on gig delivery riders?",
      "How do we address anti-competitive predatory pricing by mega-platforms that deliberately drives local mom-and-pop stores out of business?",
      "What are the ethical concerns regarding hyper-targeted dark-pattern algorithms designed to exploit impulsive consumer spending?",
      "How do we balance AI-driven personalization in e-commerce against consumer privacy and the risk of algorithmic price discrimination?"
    ],
    economic: [
      "Looking at retail economics: what is the long-term impact on local employment and community wealth when spending shifts from local Kiranas to centralized dark stores?",
      "Can quick-commerce platforms achieve sustainable unit economics without continually squeezing vendor margins and delivery fees?",
      "What are the macroeconomic risks if a duopoly of foreign-backed e-commerce conglomerates monopolizes domestic consumer retail?",
      "Will AI-automated warehouse logistics and predictive demand forecasting permanently widen the gap between tech conglomerates and small retail businesses?"
    ],
    humanExperience: [
      "How does the decline of neighbourhood physical markets impact interpersonal community bonds and organic social interaction?",
      "What are the psychological implications of instant-gratification shopping on consumer debt and material satisfaction?",
      "How does the lived daily reality of a gig-economy delivery partner compare to the glossy promises of platform flexibility?",
      "How do automated customer service chatbots compare to human support when shoppers face transaction fraud or disputed refunds?"
    ],
    pedagogical: [
      "How can traditional retail associations educate small merchants to adopt digital inventory, UPI, and local collective delivery models?",
      "What analytical frameworks should consumers learn to evaluate whether 'free shipping' actually hides inflated product markups?",
      "Where does conventional supply chain management theory fail when dealing with unpredictable flash sales and festival demand spikes?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: isn't quick-commerce simply giving consumers exactly what they demand—speed, transparent pricing, and unparalleled variety?",
      "What if e-commerce has actually created millions of flexible entry-level jobs and opened pan-national markets for small cottage craft producers?",
      "Why should policy artificially protect inefficient retail intermediaries if modern logistics networks deliver better prices to ordinary families?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how will autonomous delivery drones, automated dark stores, and ONDC protocols reshape the retail landscape?",
      "Will generative AI virtual try-ons, conversational shopping agents, and automated dark stores reshape the retail workforce over the next decade?",
      "Will social commerce and live-stream shopping overtake traditional search-based e-commerce storefronts?",
      "How will environmental regulations around single-use plastic packaging and carbon footprints alter urban fulfillment networks?"
    ],
    implementation: [
      "From an operational standpoint: how can municipal authorities regulate rapid dark stores to prevent local traffic congestion and residential hazards?",
      "What enforceable labor welfare standards should be mandated for gig delivery workers, including accident insurance and rest areas?",
      "How can governments accelerate open digital commerce networks to give local merchants level footing against giant closed platforms?"
    ]
  },
  clean_energy_ev: {
    ethical: [
      "Let's examine the ethical dimension: if electric vehicle batteries require lithium and cobalt mining that harms indigenous ecosystems, is EV adoption truly clean?",
      "How do we ensure that the transition to green energy does not disproportionately penalize low-income citizens who rely on affordable fossil fuels?",
      "Who bears moral accountability for managing the catastrophic environmental hazards of decommissioned solar panels and battery e-waste?"
    ],
    economic: [
      "Looking at capital requirements: how can developing economies finance trillions in renewable energy grid upgrades while managing high debt burdens?",
      "What are the financial implications for state utility companies as affluent consumers switch to rooftop solar, leaving poorer households to shoulder grid maintenance?",
      "Will subsidies for electric vehicles artificially distort markets, or are they essential until manufacturing achieves genuine economies of scale?"
    ],
    humanExperience: [
      "How do we address consumer range anxiety and behavioral inertia when shifting from 2-minute petrol refueling to 45-minute battery charging?",
      "What happens to the livelihoods and identity of millions of mechanics, refinery workers, and coal communities as fossil industries wind down?",
      "How can renewable energy projects empower remote rural villages that have lived without reliable electricity for generations?"
    ],
    pedagogical: [
      "How must technical engineering colleges revamp curriculum to train millions of technicians in battery management and high-voltage EV powertrains?",
      "What public awareness frameworks are needed to dispel common safety myths regarding electric scooter battery fires?",
      "Where do conventional energy models fall short in calculating the full lifecycle carbon emissions from vehicle production to disposal?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: if an electric car is charged by a coal-fired power grid, isn't it simply displacing tailpipe emissions to a rural power plant?",
      "What if investing aggressively in modern public transit and walkable cities yields far greater carbon reductions than replacing petrol cars with electric cars?",
      "Could heavy renewable subsidies trigger catastrophic grid instability when weather conditions cause sudden solar and wind generation drop-offs?"
    ],
    futureOutlook: [
      "Looking ahead 10 years: will solid-state batteries and green hydrogen overtake lithium-ion technology for heavy transport and aviation?",
      "How will decentralized microgrids and vehicle-to-grid power sharing transform consumers into active energy suppliers?",
      "How will international carbon border taxes reshape global trade and manufacturing competitiveness for developing nations?"
    ],
    implementation: [
      "From an infrastructure rollout perspective: how can urban apartment complexes and shared parking lots realistically deploy overnight EV charging points?",
      "What standardized safety and battery-swapping protocols must governments mandate to ensure cross-brand interoperability?",
      "How can power grids deploy grid-scale battery storage to balance peak evening demand without restarting fossil-fuel peaking plants?"
    ]
  },
  finance_crypto: {
    ethical: [
      "Let's examine the ethical dimension: who is responsible when aggressive influencer marketing lures financially inexperienced young retail investors into speculative crypto crashes?",
      "How do we reconcile the principles of decentralized financial freedom with the reality of ransomware payments, tax evasion, and dark-web financing?",
      "Is it ethical for institutional algorithmic traders to front-run retail investors using high-frequency digital trading infrastructure?"
    ],
    economic: [
      "From a macroeconomic perspective: could widespread adoption of private cryptocurrencies undermine a central bank's ability to control inflation and monetary policy?",
      "How has India's UPI model demonstrated that public digital financial infrastructure can outperform private credit card fee monopolies?",
      "What are the systemic contagion risks if heavily leveraged digital asset exchanges collapse within the broader banking system?"
    ],
    humanExperience: [
      "How does the gamification of stock and crypto trading apps impact the emotional well-being and addictive tendencies of young adults?",
      "What does true financial inclusion look like for rural street vendors who previously had zero access to formal credit and insurance?",
      "How does the transition to completely cashless payments alter an individual's subconscious psychology of spending and saving?"
    ],
    pedagogical: [
      "Why is basic financial literacy still missing from secondary school curricula, leaving graduates unprepared for debt, taxation, and compound interest?",
      "How can citizens be educated to distinguish between genuine technological blockchain utility and fraudulent multi-level marketing pyramid schemes?",
      "Where does traditional financial theory fail when pricing meme tokens and sentiment-driven viral digital assets?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if cryptocurrency speculation is an inevitable symptom of public distrust in fiat currency debasement and central bank money printing?",
      "Could central bank digital currencies (CBDCs) become an unprecedented tool for totalitarian financial surveillance and transaction control?",
      "What if decentralized finance (DeFi) ultimately cuts out parasitic banking middlemen and offers superior global remittance efficiency?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how will AI agents conducting autonomous micro-transactions reshape banking and consumer finance?",
      "Will sovereign cross-border digital payment networks permanently replace SWIFT and traditional foreign exchange corridors?",
      "How will tokenization of real-world assets like real estate and commodities democratize high-barrier investment opportunities?"
    ],
    implementation: [
      "From a regulatory implementation standpoint: how should financial watchdogs balance consumer fraud protection without suffocating domestic Web3 innovation?",
      "What robust cybersecurity protocols must digital payment apps enforce to protect senior citizens from sophisticated social-engineering OTP scams?",
      "How can microfinance institutions deploy algorithmic credit scoring that does not discriminate against unbanked applicants lacking formal credit histories?"
    ]
  },
  workplace_career: {
    ethical: [
      "Let's examine the ethical dimension: is it acceptable for corporations to use background keystroke logging and webcam tracking on remote employees?",
      "How do we address the ethical dilemmas of workplace moonlighting—is it an employee's personal right in off-hours, or a breach of professional integrity?",
      "What moral accountability do companies have toward contract workers who perform identical work to full-time staff but receive zero healthcare benefits?"
    ],
    economic: [
      "Looking at corporate economics: how does commercial office downsizing affect urban real estate, local cafeteria vendors, and municipal transit revenues?",
      "What is the economic productivity trade-off between flexible hybrid work models and spontaneous, serendipitous in-person office collaboration?",
      "How will the rapid compression of white-collar entry-level roles due to automation affect corporate salary structures and graduate hiring?"
    ],
    humanExperience: [
      "How do we combat the profound workplace isolation, loneliness, and blurred boundaries between home and office created by permanent remote work?",
      "What happens to career mentorship, professional networking, and informal learning when junior employees never interact in person with senior leaders?",
      "How can professionals build enduring mental resilience against chronic burnout, toxic hustle culture, and relentless connectivity expectations?"
    ],
    pedagogical: [
      "What essential emotional intelligence and cross-cultural communication skills must young professionals master to lead asynchronous global teams?",
      "How can corporate training evolve from boring compliance checkboxes to meaningful, continuous micro-learning that prevents skill obsolescence?",
      "Where does traditional hierarchy theory fail when managing Gen-Z employees who prioritize work-life balance and purpose over title status?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if the 40-hour work week is an obsolete industrial relic, and outcome-based compensation is far more empowering for talent?",
      "Could returning to mandatory five-day office work simply be a mechanism for insecure managers to justify their surveillance existence?",
      "What if job-hopping every two years is the only rational economic response to corporate wage stagnation and non-existent company loyalty?"
    ],
    futureOutlook: [
      "Looking ahead 10 years: will the traditional full-time corporate job dissolve into a portfolio career of fractional executive consulting and gig projects?",
      "How will virtual reality workspaces and spatial computing alter the nature of remote team meetings and cross-border project rooms?",
      "How must national labor laws modernize to protect freelancers and digital nomads working across international legal jurisdictions?"
    ],
    implementation: [
      "From an organizational implementation standpoint: how can human resource departments design equitable promotion rubrics that don't penalize remote staff due to proximity bias?",
      "What concrete institutional protocols can companies enact to enforce a strict 'right to disconnect' after official working hours?",
      "How can leaders structure hybrid schedules so in-office days are dedicated to creative workshops rather than sitting in cubicles on video calls?"
    ]
  },
  education_learning: {
    ethical: [
      "Let's examine the ethical dimension: how do we prevent aggressive private coaching institutes from commodifying student anxiety and fueling severe mental health crises?",
      "Is it ethical for universities to charge astronomical tuition fees for degrees that leave graduates unemployable in a rapidly automated economy?",
      "How do we address algorithmic bias and socio-economic exclusion when standardized entrance examinations favor wealthy urban candidates?"
    ],
    economic: [
      "Looking at educational return on investment: how can tier-2 and tier-3 colleges upgrade infrastructure without shifting the financial burden onto students?",
      "What are the economic consequences for the national economy when lakhs of engineering and arts graduates require complete corporate retraining after graduation?",
      "Can affordable EdTech platforms democratize quality higher education, or do they primarily enrich venture-backed private platforms?"
    ],
    humanExperience: [
      "How does hyper-competitive academic pressure and parental expectation erode curiosity, creative play, and genuine intellectual joy in teenagers?",
      "Can an online remote degree replicate the transformative social maturation, diverse friendships, and campus culture of physical university life?",
      "How do students from marginalized rural backgrounds overcome feelings of imposter syndrome and language barriers when entering elite academic institutions?"
    ],
    pedagogical: [
      "How can higher education pivot from rote memorization and exam regurgitation toward critical problem-solving, debates, and hands-on synthesis?",
      "How should assessment methodologies evolve to evaluate original thinking when AI tools can instantly generate standard essay answers?",
      "Where does traditional teacher-led lecturing fail when modern students have instant access to world-class interactive educational content online?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if conventional four-year university degrees are becoming obsolete, and industry-recognized 6-month skill apprenticeships are far superior?",
      "Could competitive entrance exams, despite their stress, be the only genuinely objective, corruption-free meritocratic filter available in high-population nations?",
      "What if human teachers should step back from repetitive content delivery and transition purely into motivational life coaches and facilitators?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how will AI personalized learning companions that adapt to a child's exact cognitive pace reshape classroom structures?",
      "Will micro-credentials, GitHub portfolios, and demonstrable project work permanently replace formal degree certificates in recruitment?",
      "How will the National Education Policy's focus on multidisciplinary degrees and vocational integration transform employment readiness?"
    ],
    implementation: [
      "From an operational rollout standpoint: how can state universities train tenured faculty to incorporate project-based learning and industry case studies?",
      "What practical steps can colleges take to establish mental health counseling and peer-support networks that students actually trust and use?",
      "How can academic audit committees ensure continuous industry-curriculum alignment without getting bogged down in years of bureaucratic red tape?"
    ]
  },
  technology_ai: {
    ethical: [
      "Let's examine the ethical dimension: who bears ultimate legal and moral liability when an autonomous AI system makes a fatal diagnostic or driving error?",
      "How do we protect copyright, artistic integrity, and creative livelihoods when generative models scrape human creations without consent or compensation?",
      "What safeguards are essential to prevent deepfake synthesis from destroying democratic elections, legal evidence, and individual reputations?"
    ],
    economic: [
      "From a tech economics standpoint: will the astronomical capital cost of training frontier AI models concentrate unprecedented global power in three or four mega-monopolies?",
      "What are the macroeconomic consequences of cognitive automation on entry-level professional salaries and national tax revenues?",
      "How can open-source AI ecosystems maintain competitive viability against closed, proprietary corporate models backed by billions in compute?"
    ],
    humanExperience: [
      "How does relying on predictive algorithms for romance, news, and entertainment affect human serendipity, free will, and personal autonomy?",
      "What psychological impacts occur when humans form deep emotional attachments to hyper-realistic AI companions and chatbots?",
      "How do we prevent cognitive atrophy—the gradual loss of human memory, writing ability, and analytical problem-solving—when algorithms do our thinking?"
    ],
    pedagogical: [
      "How should computer science education shift now that code generation is largely automated by AI assistants?",
      "What multidisciplinary ethics and philosophical training must engineers undergo before designing autonomous systems that govern human lives?",
      "Where do standard benchmark evaluations fail when assessing whether an AI model truly understands context versus regurgitating statistical patterns?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if fears of technological unemployment are the same historical panic we saw during the Industrial Revolution, and AI will create far more fulfilling jobs?",
      "Could premature government regulation and bureaucratic red tape simply stifle domestic technological innovation and cede leadership to foreign competitors?",
      "What if AI decision-making, despite flawed training data, is still demonstrably less biased and erratic than corrupt or fatigued human administrators?"
    ],
    futureOutlook: [
      "Looking ahead 10 years: how will agentic multi-AI systems negotiating autonomously reshape supply chains, legal contracts, and financial markets?",
      "What breakthrough in quantum computing or neuromorphic chips will be required to break through current AI energy and data bottlenecks?",
      "How will sovereign nations approach the geopolitical AI race—will we see a digital Iron Curtain dividing technological standards and hardware supply?"
    ],
    implementation: [
      "From an engineering implementation standpoint: how can organizations deploy robust 'red-teaming' and safety guardrails to prevent model hallucinations in production?",
      "What verifiable watermarking and cryptographic provenance standards can platforms mandate to detect AI-generated synthetic media at scale?",
      "How can enterprise leaders establish transparent data governance frameworks so proprietary company secrets are never leaked into public LLM training runs?"
    ]
  },
  social_governance: {
    ethical: [
      "Let's examine the ethical dimension: where does the line lie between legitimate state surveillance for national security and the citizen's fundamental right to privacy?",
      "How should democratic institutions balance majority electoral mandates against the constitutional rights and protections of minority communities?",
      "What ethical obligations do public servants have when institutional political pressures clash directly with grassroots public welfare?"
    ],
    economic: [
      "From a public finance perspective: how can governments strike a sustainable balance between targeted social welfare subsidies and capital expenditure on long-term infrastructure?",
      "What is the economic cost of bureaucratic red tape, judicial backlogs, and regulatory unpredictability on domestic and foreign investment?",
      "How can municipal corporations generate independent revenue streams to fund modern sanitation, public health, and climate-resilient urban infrastructure?"
    ],
    humanExperience: [
      "How does chronic traffic congestion, unbreathable air, and unplanned urban sprawl diminish the daily dignity, happiness, and mental health of urban citizens?",
      "What builds deep, lasting trust between ordinary citizens and local law enforcement in underserved neighborhoods?",
      "How can modern democratic societies cultivate constructive civil dialogue across deep ideological and socio-economic fault lines?"
    ],
    pedagogical: [
      "How can civic education move beyond memorizing constitutional articles to teaching active citizen participation, RTI filing, and municipal engagement?",
      "What analytical frameworks help citizens distinguish between sensationalized partisan media narratives and objective policy evaluation?",
      "Where does traditional administrative theory fall short when handling viral social media-driven public protests and rapid misinformation outbreaks?"
    ],
    devilAdvocate: [
      "Playing devil's advocate: what if welfare transfers are not 'freebies' but essential investments in human capital that prevent severe economic inequality and social unrest?",
      "Could hyper-centralized governance, while sometimes undemocratic, be the only practical way to execute massive infrastructure projects at national speed?",
      "What if the primary obstacle to national development is not corrupt leadership, but civic apathy and citizen unwillingness to follow civic laws?"
    ],
    futureOutlook: [
      "Projecting into the next decade: how will digital public infrastructure like Aadhaar, DigiLocker, and direct benefit transfers eliminate corruption at scale?",
      "Will AI-assisted judicial document summarization and case triaging finally clear decades of court backlog and deliver timely justice?",
      "How will climate migration from coastal and drought-prone regions reshape urban demographics and municipal governance in major cities?"
    ],
    implementation: [
      "From a policy implementation standpoint: how can urban local bodies be genuinely empowered with financial autonomy rather than remaining subordinate to state ministries?",
      "What grievance redressal mechanisms can ensure public complaints regarding roads, water, and electricity are resolved within enforceable time-bound SLAs?",
      "How can governments design public-private partnerships with transparent risk-sharing so taxpayers don't absorb private sector failures?"
    ]
  },
  general: {
    ethical: [
      "Let's examine the ethical implications: who bears moral accountability if automated recommendations or policy shifts lead to unintended societal harm?",
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

// Aliases for backward compatibility
TOPIC_QUESTION_BANKS.ai_education = TOPIC_QUESTION_BANKS.education_learning;

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

  // Pick question bank based on topic domain detection
  const domain = detectTopicDomain(topic);
  const bank = TOPIC_QUESTION_BANKS[domain] || TOPIC_QUESTION_BANKS.general;

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
      `Thank you for those points. We'd love to balance the discussion by bringing in ${mostQuiet.name} from Seat ${mostQuiet.seatNumber}. What is your perspective on "${topic}"?`,
      `Thank you. Let us hear from ${mostQuiet.name} at Seat ${mostQuiet.seatNumber}—how would you assess the practical challenges discussed so far in "${topic}"?`,
      `Let's invite ${mostQuiet.name} (Seat ${mostQuiet.seatNumber}) to share their insights on how "${topic}" affects communities and professionals.`,
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
  const dynamicThemes = [
    `how might we weigh the short-term conveniences against the long-term societal accountability of this model?`,
    `what unexpected regulatory or ethical challenges might emerge as this scales across India over the next five years?`,
    `how does this shift impact economic inclusivity for small enterprises and rural communities?`,
    `what are the primary operational bottlenecks that could cause this implementation to fail in practice?`,
    `if we examine the human psychological experience, what critical emotional and interpersonal costs are being overlooked?`,
    `playing devil's advocate, what if our primary assumptions about this risk are fundamentally flawed?`,
    `what concrete compliance metrics should independent governing bodies monitor to prevent abuse?`,
    `how do we balance rapid innovation in this space against privacy and democratic rights?`,
  ];

  let dynamicProbe = '';
  for (const theme of dynamicThemes) {
    const candidateProbe = recentSpeaker
      ? `Building on what ${recentSpeaker.speakerName} shared regarding "${topic}", ${theme}`
      : `Let us broaden our perspective regarding "${topic}": ${theme}`;
    if (!sessionQuestionTracker.hasBeenAsked(candidateProbe)) {
      dynamicProbe = candidateProbe;
      break;
    }
  }

  if (!dynamicProbe) {
    const timestampSeed = Date.now().toString().slice(-4);
    dynamicProbe = recentSpeaker
      ? `Examining an alternative dimension of ${recentSpeaker.speakerName}'s argument on "${topic}": what unaddressed socio-economic trade-offs should we critically analyze?`
      : `Looking ahead at the evolution of "${topic}": what novel frameworks will be required to ensure equitable and responsible deployment?`;
  }

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

export const KNOWN_PREVIOUS_PRESENTATIONS: Record<string, PreviousPresentationData> = {};

/**
 * Returns previous presentation data for any student, adapted to match their discipline
 */
export function getStudentPreviousPresentation(student: Student): PreviousPresentationData {
  const nameKey = (student.name || '').toLowerCase().trim();
  if (KNOWN_PREVIOUS_PRESENTATIONS[nameKey]) {
    return KNOWN_PREVIOUS_PRESENTATIONS[nameKey];
  }

  const course = (student.course || '').toLowerCase();
  if (course.includes('data') || course.includes('ai') || course.includes('ml')) {
    return {
      topic: 'Predictive Analytics and Responsible Machine Learning',
      keyInsight: 'algorithmic transparency, bias reduction, and model fairness',
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
      keyInsight: 'system reliability, data security, and latency optimization',
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
 * Generates an initiation prompt inviting a specific student based on the exact session topic domain
 * when no one speaks after start. Never uses generic repetitive static phrases.
 */
export function generateInitiationPrompt(student: Student, sessionTopic: string): string {
  const domain = detectTopicDomain(sessionTopic);
  const firstName = student.name.split(' ')[0];
  const seatStr = student.seatNumber ? `Seat ${student.seatNumber}` : 'Seat 1';

  const domainPrompts: Record<TopicDomain, string[]> = {
    cinema_media: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Cinema holds immense cultural and social influence across our communities. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's discussion on "${sessionTopic}". The floor is now officially open. Examining storytelling, cultural reach, and commercial realities, let us invite ${student.name} from ${seatStr}. ${firstName}, could you set the stage with your opening thoughts?`,
    ],
    healthcare_medicine: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Healthcare accessibility and clinical quality affect every citizen. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to our session on "${sessionTopic}". The floor is now open. Balancing patient welfare, public infrastructure, and medical innovation, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your initial perspectives.`,
    ],
    ecommerce_retail: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Digital commerce and rapid fulfillment are reshaping consumer habits and local retail ecosystems. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to our discussion on "${sessionTopic}". The floor is now open. Evaluating consumer convenience, local merchant sustainability, and platform economics, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts.`,
    ],
    clean_energy_ev: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Sustainable infrastructure and clean mobility are crucial for our future. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's discussion on "${sessionTopic}". The floor is now officially open. Examining technological breakthroughs, grid investments, and environmental realities, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening perspective.`,
    ],
    finance_crypto: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Digital financial systems must balance rapid innovation with security and stability. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's session on "${sessionTopic}". The floor is now open. Looking at economic inclusion, regulatory frameworks, and market risks, let us invite ${student.name} from ${seatStr}. ${firstName}, please initiate our discussion.`,
    ],
    workplace_career: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Modern workplace dynamics, flexibility, and professional growth are undergoing historic shifts. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to our session on "${sessionTopic}". The floor is now open. Evaluating employee well-being, organisational culture, and career progression, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening perspective.`,
    ],
    education_learning: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Education and skill development form the bedrock of societal progression. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's discussion on "${sessionTopic}". The floor is now open. Balancing traditional academic rigor with emerging practical competencies, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your initial perspective.`,
    ],
    technology_ai: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Technological innovation brings immense potential alongside critical ethical and operational considerations. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to our discussion on "${sessionTopic}". The floor is now officially open. Examining scalability, human oversight, and practical deployment, let us invite ${student.name} from ${seatStr}. ${firstName}, could you share your opening perspective?`,
    ],
    social_governance: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. Effective public governance demands balancing civic welfare and administrative execution. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's session on "${sessionTopic}". The floor is now open. Looking at policy implementation, institutional trust, and citizen rights, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening perspective.`,
    ],
    general: [
      `Welcome participants to today's group discussion on "${sessionTopic}". The discussion has now officially commenced. To begin, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening thoughts on "${sessionTopic}".`,
      `Welcome to today's discussion on "${sessionTopic}". The floor is now officially open. To set the stage and initiate our deliberation, let us invite ${student.name} from ${seatStr}. ${firstName}, please share your opening perspective.`,
    ],
  };

  const pool = domainPrompts[domain] || domainPrompts.general;
  return pool[Math.floor(Math.random() * pool.length)];
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
  const seatStr = student.seatNumber ? `Seat ${student.seatNumber}` : 'your seat';
  const domain = detectTopicDomain(sessionTopic);
  const primaryBank = TOPIC_QUESTION_BANKS[domain] || TOPIC_QUESTION_BANKS.general;
  const generalBank = TOPIC_QUESTION_BANKS.general;

  const sampleQuestions = [
    ...primaryBank.ethical,
    ...primaryBank.economic,
    ...primaryBank.humanExperience,
    ...primaryBank.pedagogical,
    ...primaryBank.implementation,
    ...primaryBank.devilAdvocate,
    ...(primaryBank.futureOutlook || []),
    ...generalBank.ethical,
    ...generalBank.economic,
    ...generalBank.humanExperience,
    ...generalBank.devilAdvocate,
  ];

  let q = '';
  for (const candidate of sampleQuestions) {
    if (!sessionQuestionTracker.hasBeenAsked(candidate)) {
      q = candidate;
      sessionQuestionTracker.recordQuestion(q);
      break;
    }
  }

  // If all catalog questions have been asked, construct a fresh conceptual probe
  if (!q) {
    const freshAngles = [
      `how do we balance rapid adoption in "${sessionTopic}" against essential safety, equity, and accountability?`,
      `what are the primary financial or operational barriers that could prevent "${sessionTopic}" from succeeding at scale?`,
      `if you had to challenge the prevailing consensus on "${sessionTopic}", what major risk would you emphasize?`,
      `how will advances in "${sessionTopic}" impact the next generation of professionals in your field?`,
      `what specific regulatory safeguards should be enacted to ensure "${sessionTopic}" remains ethically grounded?`,
      `from a ground-level implementation perspective, how should colleges and institutions adapt to "${sessionTopic}"?`,
    ];
    for (const angle of freshAngles) {
      if (!sessionQuestionTracker.hasBeenAsked(angle)) {
        q = angle;
        sessionQuestionTracker.recordQuestion(q);
        break;
      }
    }
    if (!q) {
      q = `what is your perspective on the most critical unaddressed challenge surrounding "${sessionTopic}"?`;
    }
  }

  let finalPrompt = '';
  if (lastTranscript && !lastTranscript.isFacilitator) {
    const templates = [
      `${student.name} from ${seatStr}, building on what ${lastTranscript.speakerName} highlighted regarding "${sessionTopic}", how do you evaluate this? Specifically: ${q}`,
      `${firstName}, we would like to hear your viewpoint on this angle. In light of ${lastTranscript.speakerName}'s remarks on "${sessionTopic}", ${q}`,
      `${student.name} (${seatStr}), considering ${lastTranscript.speakerName}'s stance, what is your assessment? ${q}`,
    ];
    for (const tmpl of templates) {
      if (!sessionQuestionTracker.hasBeenAsked(tmpl)) {
        finalPrompt = tmpl;
        break;
      }
    }
    if (!finalPrompt) finalPrompt = templates[0];
  } else {
    const templates = [
      `${student.name} from ${seatStr}, we would like to hear your perspective on "${sessionTopic}". ${q}`,
      `${firstName}, looking at "${sessionTopic}", how would you approach this challenge: ${q}`,
      `${student.name} (${seatStr}), you haven't shared your perspective on this dimension yet—${q}`,
      `${firstName} from ${seatStr}, to advance our discussion on "${sessionTopic}": ${q}`,
    ];
    for (const tmpl of templates) {
      if (!sessionQuestionTracker.hasBeenAsked(tmpl)) {
        finalPrompt = tmpl;
        break;
      }
    }
    if (!finalPrompt) finalPrompt = templates[0];
  }

  sessionQuestionTracker.recordQuestion(finalPrompt);
  return finalPrompt;
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
  const domain = detectTopicDomain(sessionTopic);

  const domainStatements: Record<TopicDomain, string[]> = {
    cinema_media: [
      `Thank you, Facilitator. To open today's discussion on "${sessionTopic}", I believe cinema is far more than entertainment—it is a powerful cultural mirror that influences social values, public discourse, and grassroots communities. In rural and village communities, movies often have a profound emotional and aspirational reach. At the same time, we must examine commercial pressures and whether mainstream cinema addresses genuine grassroots issues or promotes commercial escapism.`,
      `Thank you for giving me the floor. When examining "${sessionTopic}", my perspective is that films hold immense storytelling power to inspire positive social change and bridge cultural divides. However, we also face commercial challenges—such as exorbitant star salaries, the struggle of independent regional cinema, and the monopolization of screens by big-budget blockbusters. We need to evaluate both the cultural influence and the economic realities of the industry.`,
      `I appreciate the opportunity to start off our group discussion. Regarding "${sessionTopic}", the transition from traditional cinema halls to OTT streaming platforms has democratized access to diverse stories, but it has also altered communal viewing experiences. We must consider how media consumption affects youth, regional languages, and community cohesion.`,
    ],
    healthcare_medicine: [
      `Thank you, Facilitator. Opening our discussion on "${sessionTopic}", my view is that accessibility and patient-centric care must take precedence over pure commercial profitability. Modern medicine must bridge the rural-urban divide while maintaining affordability and trust across primary health centers and tertiary care hospitals.`,
      `Thank you for giving me the floor to initiate. When examining "${sessionTopic}", we must analyze both preventive wellness and acute care infrastructure. While cutting-edge medical technologies and telemedicine offer tremendous hope, we must ensure basic diagnostics and essential medicines remain accessible to every citizen.`,
    ],
    ecommerce_retail: [
      `Thank you, Facilitator. To start off our discussion on "${sessionTopic}", rapid digital commerce and 10-minute delivery apps have transformed consumer habits. However, we must evaluate the broader impact on traditional mom-and-pop Kirana stores and the working conditions of gig delivery riders who face intense road risks.`,
      `Thank you for the opportunity to initiate. When analyzing "${sessionTopic}", consumer convenience cannot come at the cost of predatory monopolistic practices. We must ensure fair competition, ethical labor standards for delivery partners, and sustainable packaging solutions.`,
    ],
    clean_energy_ev: [
      `Thank you, Facilitator. Opening our discussion on "${sessionTopic}", transitioning to electric vehicles and clean energy is vital for climate resilience. However, we must look at the entire lifecycle—including charging grid infrastructure, battery raw material sourcing, and end-of-life recycling—to ensure it is truly green.`,
      `Thank you for the floor. When examining "${sessionTopic}", affordability and infrastructure readiness are the primary determinants of adoption. Until charging stations are as widespread as petrol bunks, consumer range anxiety and initial vehicle costs will remain substantial hurdles.`,
    ],
    finance_crypto: [
      `Thank you, Facilitator. Initiating our discussion on "${sessionTopic}", modern financial technologies have democratized payments and credit access, as seen with digital public infrastructure. However, with speculative crypto assets, volatility and consumer fraud protection require prudent regulatory safeguards.`,
      `Thank you for giving me the floor. Regarding "${sessionTopic}", financial inclusion must go hand-in-hand with financial literacy. We cannot allow vulnerable retail investors to risk life savings in volatile digital schemes without robust consumer protection standards.`,
    ],
    workplace_career: [
      `Thank you, Facilitator. To begin our discussion on "${sessionTopic}", workplace models have fundamentally transformed with hybrid and remote arrangements. We must balance employee flexibility and work-life harmony against organizational culture, team collaboration, and fair career progression.`,
      `Thank you for the opportunity to initiate. When discussing "${sessionTopic}", productivity is not merely hours logged at a desk, but measurable outcomes. However, companies must establish clear boundaries to prevent chronic digital fatigue and burnout among remote workers.`,
    ],
    education_learning: [
      `Thank you, Facilitator. Opening our discussion on "${sessionTopic}", education must evolve beyond rote memorization and high-stakes exam pressure. We need curricula that foster critical thinking, practical problem solving, and interdisciplinary creativity to prepare students for the modern workforce.`,
      `Thank you for giving me the floor to initiate. When evaluating "${sessionTopic}", the integration of digital learning tools must empower teachers rather than replace human mentorship. We must ensure equitable access so underprivileged students are not left behind.`,
    ],
    technology_ai: [
      `Thank you, Facilitator. To start today's discussion on "${sessionTopic}", technological automation offers unprecedented productivity gains across industries. However, ethical accountability, data privacy, and human oversight must guide deployment so algorithms serve human welfare rather than exacerbating biases.`,
      `Thank you for giving me the floor. When examining "${sessionTopic}", we cannot look at technological progress in isolation from societal readiness. Reskilling the workforce, mitigating algorithmic risks, and establishing transparent safety standards are non-negotiable imperatives.`,
    ],
    social_governance: [
      `Thank you, Facilitator. Initiating our discussion on "${sessionTopic}", effective public governance requires balancing civic rights, citizen participation, and administrative efficiency. Long-term institutional reforms and grassroots transparency are crucial for sustainable civic progress.`,
      `Thank you for giving me the floor to initiate. Regarding "${sessionTopic}", policy decisions must be grounded in real community needs rather than top-down assumptions. Bridging the gap between policy formulation and ground-level execution is our primary challenge.`,
    ],
    general: [
      `Thank you, Facilitator. To open today's discussion on "${sessionTopic}", I believe we must evaluate this through both practical feasibility and societal impact. We cannot treat this as an all-or-nothing proposition; instead, balanced multi-stakeholder participation must guide our approach.`,
      `Thank you for giving me the floor to initiate. When examining "${sessionTopic}", my perspective is that we must focus on long-term sustainability, equitable access, and operational ground realities before scaling further.`,
    ],
  };

  const pool = domainStatements[domain] || domainStatements.general;
  return pool[Math.floor(Math.random() * pool.length)];
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
  const domain = detectTopicDomain(sessionTopic);
  const prevName = previousSpeaker?.name ? previousSpeaker.name.split(' ')[0] : 'the previous speaker';

  if (questionAsked) {
    const templates = [
      `Addressing the facilitator's question directly on "${sessionTopic}": I strongly believe we need clear benchmark criteria and balanced execution. While ${prevName} made valid points, we must ensure safeguards and ground-level checks are established from day one.`,
      `Thank you for that targeted question. Looking at "${sessionTopic}", my perspective is that balancing cost, ethics, and scalability requires a structured multi-phase rollout rather than rushed deployment.`,
      `In response to that question regarding "${sessionTopic}", if we overlook the operational hurdles and grassroots realities, the entire initiative risks losing public trust and efficacy.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  const templates = [
    `Building on what ${prevName} just articulated regarding "${sessionTopic}", I agree with that viewpoint, but I would like to introduce another critical dimension: sustainable long-term adoption. We must ensure that practical implementation constraints are accounted for early.`,
    `I would like to offer a constructive counter-perspective to ${prevName}'s argument on "${sessionTopic}". While that rationale works in ideal conditions, real-world deployment reveals systemic bottlenecks that we must actively address.`,
    `Adding to the points discussed by ${prevName}, from my perspective on "${sessionTopic}", the solution lies in combining innovation with rigorous human oversight. That way, we maintain high standards without compromising ethical responsibility.`,
    `I appreciate ${prevName}'s thoughts on "${sessionTopic}". From a practical standpoint, we must also consider how this impacts frontline practitioners and grassroots communities on the ground.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ============================================================================
// ERUS AI INSTRUCTOR – CLASSROOM PRESENTATION ACTIVITY SCRIPT ENGINE
// Based on the Official 7-Page AI-Based Student Presentation Activity Script
// ============================================================================

export interface ClassroomAssignedTopic {
  seatNumber: number;
  subTopicTitle: string;
  focusArea: string;
  questionType: 'Conceptual' | 'Application-based' | 'Analytical' | 'Research-oriented' | 'Critical thinking' | 'Future-oriented';
  suggestedQuestion: string;
  keyTakeaway: string;
}

export const CLASSROOM_INSTRUCTOR_SCRIPTS = {
  // Page 1: Opening Script (verbatim from official document)
  OPENING: `Good morning, everyone! Welcome to the ERUS Student Presentation Activity. Today, six students will present their assigned topics related to research, technology, and industry applications. The objective of this activity is to develop your technical knowledge, communication skills, presentation skills, critical thinking, and confidence. Each student will get 6 to 8 minutes to present their topic. After every presentation, I will invite the remaining students to ask questions related to the topic. This will help you develop the ability to listen carefully, understand technical concepts, think critically, and communicate effectively. Please follow these instructions: 1. Present your topic clearly and confidently. 2. Explain the important concepts with suitable examples. 3. Connect your topic to real-world or industry applications wherever possible. 4. Listen carefully to other students' presentations. 5. Ask relevant and meaningful questions. 6. Answer questions politely and confidently. Remember, this is a learning activity. Do not hesitate to speak, ask questions, or express your ideas. I will now begin the presentations by calling the students in serial order, from Student Number 1 to Student Number 6. Let us begin with Student Number 1!`,

  // Page 2: Calling Students in Serial Order (01 to 06 verbatim)
  CALLING: [
    `Student Number 1, please come forward and begin your presentation on your assigned topic. You have 6 to 8 minutes. All the best!`,
    `Thank you, Student Number 1. Now, I invite Student Number 2 to present the assigned topic. Please begin.`,
    `Thank you. Student Number 3, it is your turn. Please explain your topic clearly, highlighting the key concepts and practical applications.`,
    `Well done. Now, I invite Student Number 4 to deliver the next presentation. You may begin.`,
    `Thank you. Student Number 5, please present your topic and explain its importance in research or industry.`,
    `Excellent. We have reached our final presentation. Student Number 6, please begin your presentation. All the best!`,
  ],

  // Page 3: Peer Questioning Script
  PEER_QUESTION_INVITE: (peerNumber: number) =>
    `Thank you for your presentation. Now, let us have a short question-and-answer session. The other students should ask questions related to the topic presented. Please think about the concepts you have heard and identify anything you would like to understand better. Would Student Number ${peerNumber} like to ask the first question?`,

  PROMPT_ASK_QUESTION_CLEARLY: `Thank you. Please ask your question clearly.`,

  PROMPT_PRESENTER_ANSWER: `Student who presented the topic, please answer the question.`,

  AFTER_PEER_ANSWER: `Thank you to both students. That was a useful question and answer. Would any other student like to ask a question? If there are no more questions, I will ask one question to check your understanding of the topic.`,

  // Page 3-4: When Students Are Silent
  WHEN_SILENT: `Come on, everyone! This is an opportunity to learn from one another. You may ask about a concept you did not understand, a practical application, a technical challenge, or a real-world example. Let me give you a few seconds to think... Since no one has asked a question, I will ask one.`,

  AI_QUESTION_PROMPT: (question: string) =>
    `My question is: ${question} Student who presented the topic, please answer the question in your own words.`,

  TAKEAWAY_FEEDBACK: (takeaway: string) =>
    `Thank you for your response. The key point to remember is: ${takeaway} Let us now proceed to the next student.`,

  // Page 4: Transition Between Students
  TRANSITION: `Thank you for your presentation and for participating in the discussion. We have completed the presentation and question session for this student. Let us now move to the next presentation in our sequence. I request the next student to get ready and begin when called. Please remember that every presentation is an opportunity to improve your communication, technical understanding, and professional confidence.`,

  // Page 5: Closing Remarks (verbatim from official document)
  CLOSING: `Congratulations to all six students! We have now successfully completed today's ERUS Student Presentation Activity. Each of you has had an opportunity to present your ideas, explain technical concepts, listen to others, and participate in discussions. I would like you to remember five important lessons from today's activity. First — Technical Knowledge: Understand the topic beyond memorizing facts. Try to explain the concepts in your own words. Second — Communication Skills: Speak clearly, organize your ideas, and use simple, professional language. Third — Presentation Skills: Introduce your topic, explain the key points logically, provide examples, and conclude effectively. Fourth — Critical Thinking: Listen carefully, ask meaningful questions, and evaluate different ideas. Fifth — Confidence: Do not be afraid of making mistakes. Every presentation and every question will help you improve. In the professional world, success depends not only on what you know but also on how effectively you communicate your knowledge, solve problems, and work with others. The purpose of ERUS is to help you develop these skills and prepare yourselves for future academic, research, and employment opportunities. Before our session ends, I encourage every student to reflect on three questions: 1. What did I learn from today's presentations? 2. What is one skill I need to improve? 3. What will I do differently in my next presentation? Keep practising. Keep asking questions. Keep improving. Thank you for your active participation. This concludes today's ERUS Student Presentation Activity. Have a great day!`,
};

/**
 * Returns 6 distinct assigned presentation sub-topics tailored to the topic domain
 */
export function getClassroomAssignedTopics(mainTopic: string = 'Artificial Intelligence & Engineering Systems'): ClassroomAssignedTopic[] {
  const domain = detectTopicDomain(mainTopic);

  const domainMaps: Record<TopicDomain, ClassroomAssignedTopic[]> = {
    technology_ai: [
      {
        seatNumber: 1,
        subTopicTitle: 'Core Architecture & Fundamental Algorithmic Principles',
        focusArea: 'Conceptual Foundations',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the main principle behind this technology, and how does its foundational architecture differ from classical heuristic algorithms?`,
        keyTakeaway: `Robust algorithmic foundations and clear model interpretability are essential before deploying automated models into critical production environments.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'Industry Implementation & Enterprise Deployment Case Studies',
        focusArea: 'Application & Engineering',
        questionType: 'Application-based',
        suggestedQuestion: `How can this concept be used in a real industry setting, particularly when integrating with legacy enterprise infrastructure?`,
        keyTakeaway: `Real-world industry adoption depends on backward compatibility, reliable API integration, and verifiable return on investment.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Performance Bottlenecks, Latency & Edge Scalability Limits',
        focusArea: 'Analytical Performance',
        questionType: 'Analytical',
        suggestedQuestion: `What are the major limitations and performance bottlenecks of this approach under high-throughput concurrent workloads?`,
        keyTakeaway: `System performance must be evaluated under worst-case peak loads and low-bandwidth edge constraints, not just idealized lab conditions.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'Emerging Research Methodologies & Benchmark Optimization',
        focusArea: 'Research & Innovation',
        questionType: 'Research-oriented',
        suggestedQuestion: `What specific technical problem does this recent research attempt to solve that existing baseline methods failed to address?`,
        keyTakeaway: `Scientific progress requires rigorous benchmark comparison against verified baselines rather than selective demonstration metrics.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Data Privacy, Security Safeguards & Algorithmic Governance',
        focusArea: 'Critical Thinking & Governance',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen if the underlying training data assumptions or regulatory compliance frameworks changed drastically?`,
        keyTakeaway: `Proactive data governance, privacy-by-design, and continuous auditing protect organizations from catastrophic compliance failures.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Future Horizons: Autonomous Systems & Next-Gen Innovations',
        focusArea: 'Future Trends & Strategy',
        questionType: 'Future-oriented',
        suggestedQuestion: `How might this technology develop and reshape modern industrial workflows over the next five years?`,
        keyTakeaway: `Long-term competitive advantage belongs to institutions that anticipate paradigm shifts and invest early in resilient foundational skillsets.`,
      },
    ],
    clean_energy_ev: [
      {
        seatNumber: 1,
        subTopicTitle: 'Battery Chemistry Fundamentals & Electrochemical Principles',
        focusArea: 'Electrochemical Foundations',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the primary electrochemical principle behind next-generation battery chemistries, and how does it prevent thermal runaway?`,
        keyTakeaway: `Energy density must always be balanced against thermal stability and long-term cyclic cell degradation.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'High-Voltage Fast Charging Grid Integration & Fleet Adoption',
        focusArea: 'Infrastructure Deployment',
        questionType: 'Application-based',
        suggestedQuestion: `How can municipal utility grids accommodate high-voltage charging networks without causing localized brownouts?`,
        keyTakeaway: `Smart charging scheduling and localized buffer battery storage are crucial to prevent peak-demand grid overloads.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Supply Chain Bottlenecks & Critical Mineral Dependency',
        focusArea: 'Analytical Limitations',
        questionType: 'Analytical',
        suggestedQuestion: `What are the major supply chain and refining limitations for critical rare earth minerals in the clean energy transition?`,
        keyTakeaway: `Diversifying mineral procurement and accelerating closed-loop recycling reduce strategic dependency risks.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'Solid-State Electrolyte Research & Lifecycle Breakthroughs',
        focusArea: 'Research & Materials',
        questionType: 'Research-oriented',
        suggestedQuestion: `What technical obstacle in solid-state dendrite formation is current materials research trying to solve?`,
        keyTakeaway: `Solid-state interfaces require nanometer-level precision before commercial gigafactory manufacturing is viable.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Lifecycle Carbon Accounting: Cradle-to-Grave Impact',
        focusArea: 'Critical Lifecycle Evaluation',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen to the net carbon advantage if upstream battery manufacturing relies heavily on coal-fired electricity grids?`,
        keyTakeaway: `True decarbonization requires greening the manufacturing supply chain alongside tailpipe emissions reduction.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Next-Gen Hydrogen Fuel Cells & Distributed Renewable Grids',
        focusArea: 'Future Infrastructure',
        questionType: 'Future-oriented',
        suggestedQuestion: `How might distributed microgrids and green hydrogen reshape commercial heavy-duty transport over the next five years?`,
        keyTakeaway: `Heavy freight and maritime transport will likely adopt hybrid hydrogen-electric systems while passenger vehicles rely on batteries.`,
      },
    ],
    healthcare_medicine: [
      {
        seatNumber: 1,
        subTopicTitle: 'Pathophysiological Mechanisms & Molecular Diagnostics',
        focusArea: 'Clinical Foundations',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the core biochemical mechanism behind early biomarker detection in personalized clinical diagnostics?`,
        keyTakeaway: `High diagnostic sensitivity and specificity prevent costly false positives and enable timely clinical intervention.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'Telemedicine Systems & Primary Health Center Rollout',
        focusArea: 'Healthcare Delivery',
        questionType: 'Application-based',
        suggestedQuestion: `How can remote diagnostic platforms be deployed effectively across rural primary healthcare centers with intermittent bandwidth?`,
        keyTakeaway: `Store-and-forward edge telemedicine ensures continuous patient triage even in bandwidth-constrained rural clinics.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Clinical Algorithmic Bias & Diagnostic Validation Limits',
        focusArea: 'Analytical Safety',
        questionType: 'Analytical',
        suggestedQuestion: `What are the chief clinical limitations when diagnostic predictive models are trained on demographically homogeneous datasets?`,
        keyTakeaway: `Multicenter cross-validation across diverse demographic cohorts is mandatory before clinical deployment.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'mRNA Vaccine Platforms & Targeted Immunotherapy Research',
        focusArea: 'Translational Research',
        questionType: 'Research-oriented',
        suggestedQuestion: `What fundamental delivery vehicle challenge does lipid nanoparticle research attempt to solve in modern therapeutics?`,
        keyTakeaway: `Targeted intracellular delivery without systemic cytotoxic side effects is the frontier of modern pharmacokinetics.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Medical Ethics, Patient Autonomy & Data Sovereignty',
        focusArea: 'Bioethics & Law',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen if an autonomous diagnostic tool disagrees with a senior attending physician on a high-risk surgical intervention?`,
        keyTakeaway: `Final clinical responsibility must remain anchored in human physician oversight while using AI strictly as assistive decision support.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Generative Protein Design & Robotic Surgical Horizons',
        focusArea: 'Future Medicine',
        questionType: 'Future-oriented',
        suggestedQuestion: `How might robotic tele-surgery and generative molecular simulation revolutionize operating rooms over the next five years?`,
        keyTakeaway: `Ultra-low latency 5G networks and haptic feedback will expand access to world-class specialist surgeons globally.`,
      },
    ],
    ecommerce_retail: [
      {
        seatNumber: 1,
        subTopicTitle: 'Omnichannel Supply Chain Architecture & Dark Store Logistics',
        focusArea: 'Logistics Foundations',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the fundamental algorithmic principle behind micro-fulfillment dark store inventory placement?`,
        keyTakeaway: `Hyper-local predictive stocking reduces transit miles and prevents stockouts during sudden demand surges.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'Quick-Commerce Delivery Operations & Last-Mile Efficiency',
        focusArea: 'Operational Execution',
        questionType: 'Application-based',
        suggestedQuestion: `How can e-commerce logistics platforms optimize route batching without compromising rider safety on congested roads?`,
        keyTakeaway: `Dynamic route grouping must prioritize delivery partner safety buffers over hyper-aggressive delivery countdown timers.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Customer Acquisition Costs & Margin Pressures in Retail',
        focusArea: 'Economic Sustainability',
        questionType: 'Analytical',
        suggestedQuestion: `What are the financial limitations and burn-rate risks of discounting models when customer retention rates remain low?`,
        keyTakeaway: `Sustainable unit economics depend on organic repeat orders and private label margins rather than perpetual capital subsidies.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'Dynamic Pricing Algorithms & Demand Forecasting Models',
        focusArea: 'Predictive Analytics',
        questionType: 'Research-oriented',
        suggestedQuestion: `What exact problem in supply-demand elasticity does modern real-time dynamic pricing research aim to solve?`,
        keyTakeaway: `Price elasticity models must balance short-term revenue optimization against long-term brand trust and customer loyalty.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Gig Worker Welfare, Ethical Logistics & Fair Labor Standards',
        focusArea: 'Social Impact & Labor',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen to the quick-commerce business model if statutory minimum wages and occupational insurance become mandatory?`,
        keyTakeaway: `Ethical labor standards, health coverage, and transparent payout formulas create stable, long-term supply chain workforces.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Autonomous Drone Delivery & Computer Vision Checkout',
        focusArea: 'Future Retail',
        questionType: 'Future-oriented',
        suggestedQuestion: `How might cashierless sensor fusion and drone logistics reshape consumer grocery purchasing over the next five years?`,
        keyTakeaway: `Frictionless checkout and aerial delivery will redefine urban convenience once civil aviation regulatory corridors mature.`,
      },
    ],
    finance_crypto: [
      {
        seatNumber: 1,
        subTopicTitle: 'Digital Public Infrastructure & Real-Time Payment Switches',
        focusArea: 'Fintech Architecture',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the core architectural principle that enables zero-cost, instant settlement in modern digital payment rails?`,
        keyTakeaway: `Interoperable open APIs and unified authentication layers eliminate private intermediary monopolies in financial settlements.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'Algorithmic Credit Scoring for Underserved MSMEs',
        focusArea: 'Financial Inclusion',
        questionType: 'Application-based',
        suggestedQuestion: `How can cash-flow based underwriting be applied to extend formal credit to collateral-free small business enterprises?`,
        keyTakeaway: `Transactional GST and invoice data provide more reliable credit assessment for small enterprises than static asset collateral.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Decentralized Consensus Protocols & Throughput Bottlenecks',
        focusArea: 'Technical Limitations',
        questionType: 'Analytical',
        suggestedQuestion: `What are the fundamental trilemma trade-offs between decentralization, security, and transaction throughput in blockchain protocols?`,
        keyTakeaway: `Layer-2 rollups and sharding address throughput bottlenecks while anchoring security in proven base settlement chains.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'Central Bank Digital Currencies (CBDC) & Programmable Money',
        focusArea: 'Monetary Research',
        questionType: 'Research-oriented',
        suggestedQuestion: `What monetary transmission problem does central bank programmable currency solve compared to commercial bank electronic money?`,
        keyTakeaway: `Programmable sovereign currency allows targeted welfare disbursements with guaranteed end-use verification.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Systemic Financial Contagion & Algorithmic Trading Risks',
        focusArea: 'Risk & Governance',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen if high-frequency automated liquidity algorithms trigger a cascade liquidation during sudden market volatility?`,
        keyTakeaway: `Circuit breakers and automated capital buffers are essential safeguards against algorithmic flash crashes and systemic contagion.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Tokenized Real-World Assets & Quantum-Resistant Cryptography',
        focusArea: 'Future Capital Markets',
        questionType: 'Future-oriented',
        suggestedQuestion: `How might tokenization of illiquid assets and post-quantum encryption redefine institutional investment banking over the next five years?`,
        keyTakeaway: `Fractional asset tokenization democratizes high-value investments while post-quantum encryption secures digital assets against future compute threats.`,
      },
    ],
    general: [
      {
        seatNumber: 1,
        subTopicTitle: 'Foundational Principles, Terminology & Framework Overview',
        focusArea: 'Conceptual Foundations',
        questionType: 'Conceptual',
        suggestedQuestion: `What is the main principle underlying this topic, and what are its core structural components?`,
        keyTakeaway: `Clear conceptual definitions and structured frameworks form the baseline for any successful technical endeavor.`,
      },
      {
        seatNumber: 2,
        subTopicTitle: 'Practical Real-World Implementation & Industry Applications',
        focusArea: 'Application & Execution',
        questionType: 'Application-based',
        suggestedQuestion: `How can these core concepts be applied practically to solve a concrete real-world industrial challenge?`,
        keyTakeaway: `Theoretical models must always be tested against ground-level operational realities and customer requirements.`,
      },
      {
        seatNumber: 3,
        subTopicTitle: 'Operational Limitations, Risk Factors & Implementation Hurdles',
        focusArea: 'Critical Analysis',
        questionType: 'Analytical',
        suggestedQuestion: `What are the most significant limitations and potential failure modes of this approach in practice?`,
        keyTakeaway: `Identifying hidden edge cases and failure modes early prevents costly rework and organizational friction.`,
      },
      {
        seatNumber: 4,
        subTopicTitle: 'Research Inquiries, Empirical Evidence & Problem Solving',
        focusArea: 'Research & Evidence',
        questionType: 'Research-oriented',
        suggestedQuestion: `What specific research questions or empirical evidence validate the effectiveness of this methodology?`,
        keyTakeaway: `Evidence-based decision making and controlled validation are paramount when evaluating competing solutions.`,
      },
      {
        seatNumber: 5,
        subTopicTitle: 'Multi-Stakeholder Trade-offs, Ethics & Governance Policies',
        focusArea: 'Governance & Ethics',
        questionType: 'Critical thinking',
        suggestedQuestion: `What would happen if key stakeholder priorities or external economic conditions changed unexpectedly?`,
        keyTakeaway: `Adaptive governance and transparent stakeholder communication ensure long-term organizational resilience.`,
      },
      {
        seatNumber: 6,
        subTopicTitle: 'Future Trajectory, Technological Evolution & Strategic Outlook',
        focusArea: 'Future Strategy',
        questionType: 'Future-oriented',
        suggestedQuestion: `How is this domain expected to evolve over the next five years, and what skills should students prioritize?`,
        keyTakeaway: `Continuous learning and interdisciplinary adaptability are essential to thrive amid accelerating industry change.`,
      },
    ],
    cinema_media: [],
    workplace_career: [],
    education_learning: [],
    social_governance: [],
  };

  // Default to general if domain not explicitly mapped
  const list = domainMaps[domain] && domainMaps[domain].length === 6 ? domainMaps[domain] : domainMaps.general;
  return list;
}

/**
 * Generates an articulate academic presentation speech delivered by a student at the podium
 */
export function generateClassroomStudentPresentation(
  student: Student,
  mainTopic: string,
  assigned: ClassroomAssignedTopic
): string {
  return `Respected Faculty, AI Instructor, and dear peers. Today, I am presenting on "${assigned.subTopicTitle}" as part of our discussion on "${mainTopic}". ` +
    `To understand this subject, we must first examine the key principles: ${assigned.focusArea.toLowerCase()} plays a decisive role in driving measurable outcomes. ` +
    `In practical industry environments, organizations that implement these standards experience significant improvements in efficiency, reliability, and technical quality. ` +
    `However, we must also consider the practical challenges—such as resource constraints, backward compatibility, and regulatory compliance. ` +
    `In conclusion, mastering these concepts enables us to build resilient, scalable solutions that meet modern professional expectations. Thank you, and I look forward to your questions.`;
}

/**
 * Generates a thoughtful, relevant peer question from an audience member
 */
export function generateClassroomPeerQuestion(
  peerStudent: Student,
  presenter: Student,
  assigned: ClassroomAssignedTopic
): string {
  const templates = [
    `Thank you for that insightful presentation, ${presenter.name.split(' ')[0]}. Regarding "${assigned.subTopicTitle}", how would you suggest an engineering team address the primary limitation you highlighted when operating under tight budget constraints?`,
    `Great presentation, ${presenter.name.split(' ')[0]}. In your discussion on "${assigned.subTopicTitle}", could you elaborate on a real-world scenario where this method significantly outperformed traditional alternatives?`,
    `I appreciated your presentation on "${assigned.subTopicTitle}". From your research, what is the single biggest practical hurdle when scaling this solution in production?`,
  ];
  return templates[(peerStudent.seatNumber || 1) % templates.length];
}

/**
 * Generates presenter's answer to a peer or AI instructor question
 */
export function generateClassroomStudentAnswer(
  presenterStudent: Student,
  question: string,
  assigned: ClassroomAssignedTopic
): string {
  return `Thank you for that excellent question. Addressing that point directly: when implementing "${assigned.subTopicTitle}", the primary focus should be on modular design and incremental testing. By establishing clear benchmarks early and isolating edge cases, teams can overcome these limitations without excessive operational overhead. That balance between technical precision and practical feasibility is what makes this approach effective.`;
}
