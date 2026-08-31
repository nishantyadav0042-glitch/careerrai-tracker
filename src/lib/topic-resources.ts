// Verified external learning resources, attached to preparation tasks.
//
// WHAT THIS IS: the same kind of static reference data as TOPIC_METADATA above
// it in the stack — content, reviewed in a PR like any other content change,
// not a database and not queried at runtime. It moves to a table when the
// curation volume needs one, not before.
//
// WHAT THIS IS NOT: a content library. CareerRai hosts nothing. Each entry is
// a link a student may optionally open on YouTube to help execute the task the
// plan engine already gave them. Using it is always optional; a student may
// use their own source, or none. See docs/RESOURCE-LINKING-PLAN-2026-08.md.
//
// EVERY entry below was verified against real YouTube metadata on 2026-08-31
// (vidIQ, 96 IDs checked). `realMinutes` is the video's ACTUAL length, read
// from the platform — never a claimed or estimated figure. Nine candidate
// videos from the research did not exist at all and are absent by design; see
// docs/phase0/VERIFICATION-FINAL.md for the full audit.
//
// DELIBERATELY NOT STORED: worked-question counts. Those were never
// independently verifiable and drifted between research runs, so a count must
// never reach a task card. Where a task needs a number, the target comes from
// the plan engine, not from here.

export type ResourceIntent =
  | 'concept'        // first exposure — teaches the topic from scratch
  | 'practice_easy'  // worked examples at basic-to-medium difficulty
  | 'practice_cat'   // real CAT-difficulty questions or sets, solved
  | 'exam_ready';    // technique, traps and pace for someone who knows it

export interface TopicResource {
  intent: ResourceIntent;
  /** YouTube video id. The card links out; nothing is embedded or hosted. */
  videoId: string;
  title: string;
  /** The channel as it really is on YouTube — three research rows credited
   *  the wrong channel, and our provenance gate is channel-level. */
  channel: string;
  /** ACTUAL runtime in minutes, read from platform metadata. */
  realMinutes: number;
  /** Platform view count at verification time — a rough popularity signal
   *  only. It is never a quality ranking; see the ranking rules in the
   *  master research protocol. */
  views: number;
  /** ISO date of the last successful metadata verification. */
  verifiedOn: string;
}

export const TOPIC_RESOURCES: Record<string, TopicResource[]> = {
  "Arrangements": [
    { intent: 'concept', videoId: '4tI-h-GKWVk', realMinutes: 20, views: 845389,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Linear and Circular Arrangement - I for CAT I Logical Reasoning" },
    { intent: 'practice_easy', videoId: 'spET6FqiBZ8', realMinutes: 11, views: 529748,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Linear Arrangement I Set - 1 I Logical Reasoning Preparation" },
    { intent: 'practice_cat', videoId: 'lF5YGHFysBA', realMinutes: 35, views: 47565,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "High LEVEL DILR puzzle & Detailed way to solve these puzzles | Must ch" },
  ],
  "Average": [
    { intent: 'concept', videoId: 'TBhanaOLNvc', realMinutes: 23, views: 760971,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Averages 1: Middle Term of an AP Series | Arithmetic for CAT 2026 | Ra" },
  ],
  "Charts": [
    { intent: 'concept', videoId: 'Kn17_JoFmjU', realMinutes: 30, views: 201732,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Pie Chart 1 || LR & DI Preparation || CAT Exam Preparation" },
    { intent: 'practice_easy', videoId: 'A6K2pPl0BLA', realMinutes: 17, views: 114140,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Pie Chart 2 || LR & DI Preparation || CAT Exam Preparation" },
    { intent: 'practice_cat', videoId: '7_t3CWThCQM', realMinutes: 26, views: 37016,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Pie Charts for CAT 2026 | How to Solve Any DI Set Step-by-Step | Part" },
    { intent: 'exam_ready', videoId: 'LlM00yczPBQ', realMinutes: 8, views: 8536,
      channel: "MBA Litmus | 1-on-1 CAT & MBA Coaching", verifiedOn: '2026-08-31',
      title: "Triangular Graph (DI)  -  How to interpret it ? (Important DI for CAT" },
  ],
  "Coordinate Geometry": [
    { intent: 'practice_cat', videoId: 'NXlFmkHm0N0', realMinutes: 15, views: 22200,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Geometry Practice 3: Coordinate Geometry & Medians | Geometry for" },
    { intent: 'exam_ready', videoId: 'NTxJBUAnAq0', realMinutes: 22, views: 22605,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "CAT QUANT CONCEPT 6| Area of Modulus | Important Concept for CAT" },
  ],
  "Editorial Reading": [
    { intent: 'concept', videoId: 'G8IXAwpurqc', realMinutes: 3, views: 2084,
      channel: "Patrick100", verifiedOn: '2026-08-31',
      title: "From where should we read editorials? | AskPatrick | Patrick Dsouza |" },
  ],
  "Games & Tournaments": [
    { intent: 'concept', videoId: 'bC3Wlg6DIRg', realMinutes: 26, views: 319239,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Games and Tournaments 1 || LR & DI Preparation for CAT || CAT Exa" },
    { intent: 'practice_easy', videoId: 'zsyDbQwC1Vg', realMinutes: 15, views: 138298,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Games & Tournament for CAT 2025 by Gaurav Kapoor" },
    { intent: 'practice_cat', videoId: 'Oy9ERJEboWY', realMinutes: 37, views: 105603,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Games & Tournaments - Difficult Set I LR & DI Preparation for CAT" },
  ],
  "Grammar": [
    { intent: 'concept', videoId: 'PlsBlgzhsXU', realMinutes: 35, views: 28113,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Grammar (Sentence Correction & Error Spotting) for CAT & OMETs -" },
  ],
  "Inequalities": [
    { intent: 'concept', videoId: 'zIrr1lkvyBY', realMinutes: 19, views: 233003,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Inequalities 1: Rules and Applications | Algebra for CAT 2026 | R" },
    { intent: 'practice_easy', videoId: 'w-ez6YnTnJ4', realMinutes: 15, views: 62467,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "INEQUALITIES - 9: Rational Inequality and Quadratic Range | Algeb" },
  ],
  "Logarithms": [
    { intent: 'concept', videoId: 'K6Jk3uEkIMA', realMinutes: 31, views: 186226,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Logarithms part 1: Logarithm Properties | Algebra for CAT 2026 |" },
    { intent: 'practice_easy', videoId: 'SzseQAYENMc', realMinutes: 24, views: 100363,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Logarithms 2: Logarithmic Equations with Quadratic Forms | Algebr" },
    { intent: 'practice_cat', videoId: 's28TG0ERFr4', realMinutes: 8, views: 9325,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Logarithms Practice: Logarithms & Product of Roots | Algebra for" },
  ],
  "Mixtures": [
    { intent: 'concept', videoId: '3LmRyBpIhgQ', realMinutes: 32, views: 560742,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Alligation and Mixture 1: Weighted Average Seesaw Method | Arithmetic" },
    { intent: 'practice_easy', videoId: 'qQcGkxuf4ws', realMinutes: 24, views: 332784,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Alligation and Mixture 3: Alligation in Mixtures | Arithmetic for CAT" },
  ],
  "Para Jumbles": [
    { intent: 'practice_easy', videoId: '7AKFH60Jiik', realMinutes: 42, views: 23521,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "RODHA VARC I Master PARAJUMBLES I Episode 1" },
  ],
  "Para Summary": [
    { intent: 'concept', videoId: '8YK-4sOQyUU', realMinutes: 9, views: 19094,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Summary Concepts || Verbal Preparation || CAT Preparation 2019" },
    { intent: 'practice_easy', videoId: 'K77dQAOf_Vg', realMinutes: 34, views: 30396,
      channel: "Unacademy CAT", verifiedOn: '2026-08-31',
      title: "Ace Para Summary for CAT 2025 - \u2018GIST\u2019 Method" },
    { intent: 'exam_ready', videoId: 'mvLAgP10om4', realMinutes: 31, views: 664,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "3 CAT Para Summary Rules That Break Every  Trap | VARC PYQs | Brijesh" },
  ],
  "Percentages": [
    { intent: 'concept', videoId: 'x-k8iSNr85g', realMinutes: 26, views: 1179679,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Percentages 1: Fractions to Percentages | Arithmetic for CAT 2026" },
    { intent: 'practice_easy', videoId: 'lzI_bpPpezE', realMinutes: 23, views: 680316,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Percentages 2: Successive Percentage Change | Arithmetic for CAT 2026" },
    { intent: 'exam_ready', videoId: 'VT9-jeEmlJ8', realMinutes: 31, views: 1828745,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Speed Maths 1: Percentage of a Number | Arithmetic for CAT 2026" },
  ],
  "Profit & Loss": [
    { intent: 'concept', videoId: 'bigCbKeUPO4', realMinutes: 26, views: 636219,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Profit and Loss 1: Profit, Loss, Discount, Markup | Arithmetic for CAT" },
    { intent: 'practice_easy', videoId: '3Q6V7qVGReo', realMinutes: 39, views: 473787,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Profit and Loss 3: Faulty Weights and Cheating | Arithmetic for CAT 20" },
    { intent: 'exam_ready', videoId: 'OyGkBz2DxAQ', realMinutes: 9, views: 7260,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Dishonest Seller CAT 2023 Question| 3 Methods to Tackle Dishonest Sell" },
  ],
  "Progressions": [
    { intent: 'practice_easy', videoId: 'wSbjXsULtrI', realMinutes: 22, views: 178347,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Arithmetic Progression 1: AP Average Funda | Algebra for CAT 2026 | Ra" },
    { intent: 'exam_ready', videoId: '8TygSoo-4Ig', realMinutes: 14, views: 17434,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Advance Level Quant Concept 9  || SEQUENCE & SERIES  || HUNNY MALHOTRA" },
  ],
  "Quadratic Equations": [
    { intent: 'concept', videoId: 'X3c60CCB18U', realMinutes: 21, views: 148934,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadratic Equation 2: Nature Of Roots | Algebra for CAT 2026 | Ra" },
    { intent: 'practice_easy', videoId: '27OVCl0b0nQ', realMinutes: 20, views: 147713,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadratic Equation 3: Imaginary and Common Roots | Algebra for CA" },
  ],
  "Ratio & Proportion": [
    { intent: 'practice_easy', videoId: 'eruwLy2vGV4', realMinutes: 39, views: 296568,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Ratio 3: Comparing Actual and Error Ratios | Arithmetic for CAT 2026 |" },
  ],
  "Reading Comprehension": [
    { intent: 'concept', videoId: 'Qt_FK9fWlMg', realMinutes: 26, views: 3294,
      channel: "2IIM CAT Preparation", verifiedOn: '2026-08-31',
      title: "Cracking RC 101\u2503 The Ultimate Guide to Acing Reading Comprehension \u2503Ex" },
    { intent: 'exam_ready', videoId: 'ak5_O5CbrJE', realMinutes: 27, views: 11680,
      channel: "Career Launcher MBA", verifiedOn: '2026-08-31',
      title: "CAT RC: Traps in Answer Choices | Smart Option Elimination Strategy |" },
  ],
  "SI & CI": [
    { intent: 'concept', videoId: 'hvikOiSu_D4', realMinutes: 22, views: 398424,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Simple and Compound Interest 1: SI and CI Basic Concepts | Arithm" },
    { intent: 'practice_easy', videoId: 'TG3M3QFyY0k', realMinutes: 26, views: 288757,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Simple and Compound Interest 2: SI and CI Difference Formula | Ar" },
    { intent: 'exam_ready', videoId: 'MTdAQnGCUtM', realMinutes: 15, views: 10167,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Arithmetic Practice 44: Installment Ratio Method | Arithmetic for" },
  ],
  "Tables": [
    { intent: 'concept', videoId: 'gqYVcVjqW0k', realMinutes: 22, views: 134690,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Tabular Set || LR & DI Preparation for CAT || CAT exam Preparation" },
    { intent: 'practice_easy', videoId: 'L6lxPe9gx68', realMinutes: 9, views: 3541,
      channel: "Aptitude Jab", verifiedOn: '2026-08-31',
      title: "CAT Infinite DILR - Set 303 | Organizing the scholarship test | Data T" },
    { intent: 'practice_cat', videoId: 'AfQf--BGAeo', realMinutes: 8, views: 10306,
      channel: "Aptitude Jab", verifiedOn: '2026-08-31',
      title: "CAT Infinite DILR - Set 410 | Lehra Do | Table Mapping" },
  ],
  "Time & Work": [
    { intent: 'concept', videoId: 'oApzHGJNx38', realMinutes: 22, views: 423047,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time and Work 1: LCM Method Introduction | Arithmetic for CAT 202" },
    { intent: 'practice_easy', videoId: '6IbA-nSj28g', realMinutes: 24, views: 319926,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time and Work 2: Alternate Days and Workers Leaving | Arithmetic" },
    { intent: 'exam_ready', videoId: 'MJIlrpc2oKc', realMinutes: 26, views: 296365,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time and Work 3: Efficiency and Time Ratios | Arithmetic for CAT" },
  ],
  "Time Speed Distance": [
    { intent: 'concept', videoId: 'CKiP208avbc', realMinutes: 22, views: 500528,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time Speed and Distance 1: Constant Distance Problems | Arithmeti" },
    { intent: 'practice_easy', videoId: 'PQvBSkJDF_E', realMinutes: 24, views: 308241,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time Speed and Distance 2: Speed Time Inverse Proportion | Arithm" },
    { intent: 'practice_cat', videoId: 'RHflaojKVlI', realMinutes: 24, views: 178116,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time Speed and Distance 8: Solving Escalator Problems | Arithmeti" },
    { intent: 'exam_ready', videoId: 'Kblu48aZ7bA', realMinutes: 8, views: 19279,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Advance Level Quant Concept 19| Time, Speed & Distance | Importan" },
  ],
};

/** The one lookup the task layer uses. Returns null when we have nothing
 *  verified — which is a normal, expected state for most topics, and the card
 *  must render perfectly well without a resource. */
export function resourceFor(topic: string, intent: ResourceIntent): TopicResource | null {
  return TOPIC_RESOURCES[topic]?.find((r) => r.intent === intent) ?? null;
}

/**
 * First match down an ordered preference list.
 *
 * Most topics carry two or three intents, not four, so asking for exactly one
 * intent misses far more often than it hits. The CALLER owns the order,
 * because only the caller knows the student's phase — this module deliberately
 * knows nothing about phases, which is also what keeps it free of any import
 * from the planner and therefore impossible to turn into a second planning
 * authority.
 */
export function resourceByPreference(topic: string, intents: readonly ResourceIntent[]): TopicResource | null {
  for (const intent of intents) {
    const hit = resourceFor(topic, intent);
    if (hit) return hit;
  }
  return null;
}

/** Coverage, for the founder-facing surfaces. Never shown to a student. */
export function resourceCoverage(): { topics: number; resources: number } {
  const v = Object.values(TOPIC_RESOURCES);
  return { topics: v.length, resources: v.reduce((n, r) => n + r.length, 0) };
}
