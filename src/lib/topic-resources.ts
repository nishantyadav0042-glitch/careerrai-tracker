// Verified external learning resources, attached to preparation tasks.
//
// WHAT THIS IS: static reference data — content, reviewed in a PR like any
// other content change, not a database and not queried at runtime. It moves to
// a table when the curation volume needs one, not before.
//
// WHAT THIS IS NOT: a content library. CareerRai hosts nothing. Each entry is
// a link a student may optionally open on YouTube to help execute the task the
// plan engine already gave them. See docs/phase0/RESOURCE-ARCHITECTURE.md.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// Never attach a resource merely because it exists. Attach it because its
// FORMAT matches what the student is being asked to do. A video of a teacher
// solving twenty questions is a worked example; it is never practice. Practice
// is questions the student attempts, and until we have question sources, a
// practice task correctly shows no row at all.
//
// That rule was broken in production: `foundation` used to fall back to a
// practice video, so a student meeting a topic for the first time was handed
// someone else's practice. See docs/phase0/LADDER-REGRADE.md.
//
// ── LAYER A: CONCEPT ONLY ───────────────────────────────────────────────────
// Two intents are reachable today. `concept` is the primary — first exposure.
// `worked_example` is the SECONDARY, shown only after a student says the
// primary did not help; it is never displayed beside it. `practice`,
// `revision` and `exam_practice` are declared but deliberately unreachable
// (routine-engine returns nothing for those phases) until real question
// sources exist. Guards enforce both facts.
//
// EVERY row was verified against real YouTube metadata via vidIQ on
// 2026-08-31 by direct id lookup — existence, title, channel and runtime are
// platform-read, never claimed. `realMinutes` is the video's ACTUAL length.
// Eleven researched ids did not exist at all and are absent by design; see
// docs/phase0/VERIFICATION-ROUND2-PLATFORM.md.
//
// WHAT VERIFICATION DOES NOT COVER: whether the video teaches well, suits a
// beginner's pace, or is a funnel for a paid batch. Nobody has watched most of
// these. That is what the thumbs on the surface are for — a student saying
// "not helpful" is the only quality signal we have, and it is worth more than
// another round of my inspection.
//
// LONG-FORM: six concept videos run past the 45-minute daily block. They are
// the best free explanations that exist for those topics, so they ship — but
// flagged `longForm`, and the surface says plainly that finishing today is not
// expected. The old guard rejected them outright; the rule it protected was
// never "resources must be short", it was "never misrepresent a resource as
// today's work". That is what the guard now enforces.
//
// DELIBERATELY NOT STORED: worked-question counts. Never independently
// verifiable, drifted between research runs, and — since a video is not
// practice — never a number that should reach a task card.

export type ResourceIntent =
  | 'concept'        // first exposure — teaches the topic from scratch
  | 'worked_example' // a teacher solving representative problems; the secondary
  | 'practice'       // questions the student attempts — NOT a video
  | 'revision'       // retrieval for a topic already learned
  | 'exam_practice'; // timed / CAT-level / mixed application

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
   *  only. It is never a quality ranking. */
  views: number;
  /** ISO date of the last successful metadata verification. */
  verifiedOn: string;
  /**
   * True when the video is longer than a single daily task block (45 min).
   *
   * This does NOT reject the resource — some topics have no shorter honest
   * option, and the best available explanation beats none. It changes what we
   * SAY: a long-form row tells the student outright that finishing it today is
   * not the job. The task's target never moves either way.
   *
   * Founder, 31 Aug: ship all 40 topics, but do not bypass the 45-minute
   * rule — reframe it so it protects the student from being misled.
   */
  longForm?: true;
}

export const TOPIC_RESOURCES: Record<string, TopicResource[]> = {
  "Arrangements": [
    { intent: 'concept', videoId: '4tI-h-GKWVk', realMinutes: 20, views: 845389,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Linear and Circular Arrangement - I for CAT I Logical Reasoning" },
  ],
  "Average": [
    { intent: 'concept', videoId: 'TBhanaOLNvc', realMinutes: 23, views: 760971,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Averages 1: Middle Term of an AP Series | Arithmetic for CAT 2026 | Ra" },
    { intent: 'worked_example', videoId: 'MYud15DuP6s', realMinutes: 18, views: 24179,
      channel: "Takshzila", verifiedOn: '2026-08-31',
      title: "Averages for CAT: Part 2 (More Concepts and Solved Examples)" },
  ],
  "Base System": [
    { intent: 'concept', videoId: 'yVXgLm09yuM', realMinutes: 56, longForm: true, views: 377,
      channel: "CAT Funda by Unacademy", verifiedOn: '2026-08-31',
      title: "Number System - Converting from Decimal to Other Bases and Vice Versa " },
    { intent: 'worked_example', videoId: 'mp1A85pK6YQ', realMinutes: 5, views: 4143,
      channel: "Takshzila", verifiedOn: '2026-08-31',
      title: "Base System for CAT: Part 1 (Introduction)" },
  ],
  "Binary Logic": [
    { intent: 'concept', videoId: 'z69ElNGKPFs', realMinutes: 61, longForm: true, views: 3819,
      channel: "CAT Funda by Unacademy", verifiedOn: '2026-08-31',
      title: "Binary Logic / True Liar - Basic Concepts (English) l CAT 2021 l LRDI " },
    { intent: 'worked_example', videoId: 'qmNtXHFjMOY', realMinutes: 19, views: 7547,
      channel: "Lokesh Agarwal", verifiedOn: '2026-08-31',
      title: "SNAP 2022|| Binary Logic || Truth Liar - Basic Concepts l LRDI l Lokes" },
  ],
  "Charts": [
    { intent: 'concept', videoId: 'Kn17_JoFmjU', realMinutes: 30, views: 201732,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Pie Chart 1 || LR & DI Preparation || CAT Exam Preparation" },
  ],
  "Circles": [
    { intent: 'concept', videoId: '4vj3U-tEjYE', realMinutes: 45, views: 77996,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Circles 1 Basic Terms + Angle Properties | Quant Geometry 07 | CAT 202" },
    { intent: 'worked_example', videoId: 'IqfBailsqTk', realMinutes: 67, longForm: true, views: 3796,
      channel: "Cracku - MBA CAT Preparation", verifiedOn: '2026-08-31',
      title: "CAT 2026 Easy Geometry Circles and Polygons | CAT Geometry Important Q" },
  ],
  "Coordinate Geometry": [
    { intent: 'concept', videoId: '9t7cKr-KZ8U', realMinutes: 68, longForm: true, views: 84842,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Coordinate Geometry 1 | Quant Geometry L10 | CAT 2024 | MBA Wallah" },
    { intent: 'worked_example', videoId: '0GNr5I019-I', realMinutes: 76, longForm: true, views: 64517,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Coordinate Geometry- 2 | Equations of line | Quant Geometry 11 | CAT 2" },
  ],
  "Divisibility": [
    { intent: 'concept', videoId: 'p0JbJd5DpWY', realMinutes: 30, views: 375679,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Divisibility Rules 1 | Number System for CAT 2026 | Ravi Prakash Rodha" },
    { intent: 'worked_example', videoId: 'rb3Sk_L7vMQ', realMinutes: 25, views: 177488,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Divisibility Rules 4 | Number System for CAT 2026 | Ravi Prakash Rodha" },
  ],
  "Editorial Reading": [
    { intent: 'concept', videoId: 'G8IXAwpurqc', realMinutes: 3, views: 2084,
      channel: "Patrick100", verifiedOn: '2026-08-31',
      title: "From where should we read editorials? | AskPatrick | Patrick Dsouza |" },
  ],
  "Functions": [
    { intent: 'concept', videoId: '6FEnbG2Ux5o', realMinutes: 21, views: 182830,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Functions 1: Domain Range Types Of Functions | Algebra for CAT 2026 | " },
    { intent: 'worked_example', videoId: 'EWB1NaL4N4U', realMinutes: 19, views: 113729,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Function 2: Total Onto And Bijective Functions | Algebra for CAT 2026 " },
  ],
  "Games & Tournaments": [
    { intent: 'concept', videoId: 'bC3Wlg6DIRg', realMinutes: 26, views: 319239,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Games and Tournaments 1 || LR & DI Preparation for CAT || CAT Exa" },
    { intent: 'worked_example', videoId: 'zsyDbQwC1Vg', realMinutes: 15, views: 138298,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Games & Tournament for CAT 2025 by Gaurav Kapoor" },
  ],
  "Grammar": [
    { intent: 'concept', videoId: 'PlsBlgzhsXU', realMinutes: 35, views: 28113,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Grammar (Sentence Correction & Error Spotting) for CAT & OMETs -" },
  ],
  "HCF & LCM": [
    { intent: 'concept', videoId: 'JyN6EROdhrw', realMinutes: 26, views: 216008,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "HCF LCM 1 | Number System for CAT 2026 | Ravi Prakash Rodha" },
    { intent: 'worked_example', videoId: '0S_rT7720t8', realMinutes: 20, views: 151829,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "HCF LCM 2 | Number System for CAT 2026 | Ravi Prakash Rodha" },
  ],
  "Inequalities": [
    { intent: 'concept', videoId: 'zIrr1lkvyBY', realMinutes: 19, views: 233003,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Inequalities 1: Rules and Applications | Algebra for CAT 2026 | R" },
    { intent: 'worked_example', videoId: 'w-ez6YnTnJ4', realMinutes: 15, views: 62467,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "INEQUALITIES - 9: Rational Inequality and Quadratic Range | Algeb" },
  ],
  "Linear Equations": [
    { intent: 'concept', videoId: 'W6MKuAnB0h4', realMinutes: 26, views: 366828,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Simple Equations 1: Linear Equation Solutions | Algebra for CAT 2026 |" },
    { intent: 'worked_example', videoId: 'b72RfaOsAmg', realMinutes: 15, views: 15277,
      channel: "Takshzila", verifiedOn: '2026-08-31',
      title: "Linear Eqn in 2 variables, Integer solns - 1" },
  ],
  "Lines & Angles": [
    { intent: 'concept', videoId: 'GaEZEJbKLtY', realMinutes: 44, views: 214353,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Lines and Angles | Quant Geometry L1 | CAT 2024 | MBA Wallah" },
    { intent: 'worked_example', videoId: 'rUI1bbCvk7E', realMinutes: 22, views: 491000,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Geometry Introduction  | Quantitative Aptitude I CAT PREPARATION" },
  ],
  "Logarithms": [
    { intent: 'concept', videoId: 'K6Jk3uEkIMA', realMinutes: 31, views: 186226,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Logarithms part 1: Logarithm Properties | Algebra for CAT 2026 |" },
    { intent: 'worked_example', videoId: 'SzseQAYENMc', realMinutes: 24, views: 100363,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Logarithms 2: Logarithmic Equations with Quadratic Forms | Algebr" },
  ],
  "Mensuration": [
    { intent: 'concept', videoId: 'HhtLt2JZKu4', realMinutes: 25, views: 171615,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Mensuration 1: Prisms, Pyramids & Spheres | Geometry for CAT 2026 | Ra" },
    { intent: 'worked_example', videoId: '17lfsV7IbR0', realMinutes: 58, longForm: true, views: 36969,
      channel: "MBA Pathshala", verifiedOn: '2026-08-31',
      title: "Mensuration 2-D | CAT & OMETs | Session 01 | Udit Saini" },
  ],
  "Mixtures": [
    { intent: 'concept', videoId: '3LmRyBpIhgQ', realMinutes: 32, views: 560742,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Alligation and Mixture 1: Weighted Average Seesaw Method | Arithmetic" },
    { intent: 'worked_example', videoId: 'qQcGkxuf4ws', realMinutes: 24, views: 332784,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Alligation and Mixture 3: Alligation in Mixtures | Arithmetic for CAT" },
  ],
  "Para Summary": [
    { intent: 'concept', videoId: '8YK-4sOQyUU', realMinutes: 9, views: 19094,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Summary Concepts || Verbal Preparation || CAT Preparation 2019" },
    { intent: 'worked_example', videoId: 'K77dQAOf_Vg', realMinutes: 34, views: 30396,
      channel: "Unacademy CAT", verifiedOn: '2026-08-31',
      title: "Ace Para Summary for CAT 2025 - \\u2018GIST\\u2019 Method" },
  ],
  "Percentages": [
    { intent: 'concept', videoId: 'x-k8iSNr85g', realMinutes: 26, views: 1179679,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Percentages 1: Fractions to Percentages | Arithmetic for CAT 2026" },
    { intent: 'worked_example', videoId: 'lzI_bpPpezE', realMinutes: 23, views: 680316,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Percentages 2: Successive Percentage Change | Arithmetic for CAT 2026" },
  ],
  "Permutation & Combination": [
    { intent: 'concept', videoId: '8kvqSY1-W5Y', realMinutes: 27, views: 381258,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Permutations and Combinations 1: Fundamental Principle of Counting | C" },
    { intent: 'worked_example', videoId: 'fnFjdi4XbTQ', realMinutes: 59, longForm: true, views: 158823,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Permutations And Combinations - 1 | Quant Modern Maths 04 | CAT 2024 |" },
  ],
  "Pipes & Cisterns": [
    { intent: 'concept', videoId: 'kwO4buoyWHg', realMinutes: 78, longForm: true, views: 57279,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Pipes & Cistern | Arithmetic  Ep. 04 | The Game Begins | CAT 2025 Prep" },
    { intent: 'worked_example', videoId: 'x3SEYdBUGaA', realMinutes: 20, views: 3475901,
      channel: "Dear Sir", verifiedOn: '2026-08-31',
      title: "Pipe and Cisterns Problems Tricks | Pipe and Tanki Shortcuts and Trick" },
  ],
  "Probability": [
    { intent: 'concept', videoId: 'b6hmLsjbA7E', realMinutes: 22, views: 148462,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Probability 1: Basics, Coin Tosses and Odds | CAT 2026 | Ravi Sir" },
    { intent: 'worked_example', videoId: '1KYf9l1wGTY', realMinutes: 21, views: 86507,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Probability 2: Graphical and Geometric Probability | CAT 2026 | Ravi S" },
  ],
  "Profit & Loss": [
    { intent: 'concept', videoId: 'bigCbKeUPO4', realMinutes: 26, views: 636219,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Profit and Loss 1: Profit, Loss, Discount, Markup | Arithmetic for CAT" },
    { intent: 'worked_example', videoId: '3Q6V7qVGReo', realMinutes: 39, views: 473787,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Profit and Loss 3: Faulty Weights and Cheating | Arithmetic for CAT 20" },
  ],
  "Quadratic Equations": [
    { intent: 'concept', videoId: 'X3c60CCB18U', realMinutes: 21, views: 148934,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadratic Equation 2: Nature Of Roots | Algebra for CAT 2026 | Ra" },
    { intent: 'worked_example', videoId: '27OVCl0b0nQ', realMinutes: 20, views: 147713,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadratic Equation 3: Imaginary and Common Roots | Algebra for CA" },
  ],
  "Quadrilaterals": [
    { intent: 'concept', videoId: 'TZadcVDti64', realMinutes: 39, views: 193526,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadrilaterals 1 | Geometry for CAT 2026 | Ravi Prakash Rodha" },
    { intent: 'worked_example', videoId: 'Dy4_ESXGjeY', realMinutes: 13, views: 112832,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Quadrilaterals 3: Trapezium & Area Questions | Geometry for CAT 2026 |" },
  ],
  "Reading Comprehension": [
    { intent: 'concept', videoId: 'Qt_FK9fWlMg', realMinutes: 26, views: 3294,
      channel: "2IIM CAT Preparation", verifiedOn: '2026-08-31',
      title: "Cracking RC 101\\u2503 The Ultimate Guide to Acing Reading Comprehension \\u2503Ex" },
  ],
  "Reading Speed Practice": [
    { intent: 'concept', videoId: 'IzzDC2qCYu0', realMinutes: 19, views: 100045,
      channel: "Gejo Speaks", verifiedOn: '2026-08-31',
      title: "How to read a passage effectively | CAT-RC-Series | GejoSpeaks | Readi" },
  ],
  "Remainders": [
    { intent: 'concept', videoId: 'taNnRLuS4pk', realMinutes: 70, longForm: true, views: 179294,
      channel: "MBA Wallah", verifiedOn: '2026-08-31',
      title: "Remainder Theorem l Quant Number System 06 | CAT 2024 l MBA Wallah" },
    { intent: 'worked_example', videoId: 'VSFs3JuKafY', realMinutes: 34, views: 177921,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Remainders 3: Euler's Theorem Cyclicity | Number System for CAT 2026 |" },
  ],
  "SI & CI": [
    { intent: 'concept', videoId: 'hvikOiSu_D4', realMinutes: 22, views: 398424,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Simple and Compound Interest 1: SI and CI Basic Concepts | Arithm" },
    { intent: 'worked_example', videoId: 'TG3M3QFyY0k', realMinutes: 26, views: 288757,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Simple and Compound Interest 2: SI and CI Difference Formula | Ar" },
  ],
  "Selection & Distribution": [
    { intent: 'concept', videoId: 'DcX3oOYVDh0', realMinutes: 12, views: 35814,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "Selections and Distribution Puzzles by Elites Grid | Best Approach" },
    { intent: 'worked_example', videoId: 'd38v_cGG0Y0', realMinutes: 13, views: 14936,
      channel: "ELITES GRID - CAT PREP", verifiedOn: '2026-08-31',
      title: "SELECTIONS & Distibutions | Conventional method | CAT LRDI" },
  ],
  "Sentence Completion": [
    { intent: 'concept', videoId: 'e4Ec4KzqaME', realMinutes: 8, views: 14080,
      channel: "CATKing", verifiedOn: '2026-08-31',
      title: "Rules To Crack Para Completion Questions In CAT VARC | CAT Exam Verbal" },
    { intent: 'worked_example', videoId: '_K0ZbySSTzw', realMinutes: 28, views: 81,
      channel: "ACE CAT", verifiedOn: '2026-08-31',
      title: "VARC for CAT 2026 | Para Completion  | Lecture #06" },
  ],
  "Set Theory": [
    { intent: 'concept', videoId: 'IgEKyxYTXDg', realMinutes: 64, longForm: true, views: 2183,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "CAT 2025 I INTRODUCTION TO VENN Diagrams I LRDI I SWAPANIL SIR" },
    { intent: 'worked_example', videoId: 'jdusH0OI-jY', realMinutes: 59, longForm: true, views: 1655,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "VENN DIAGRAM SET I CAT PREVIOUS YEAR QUESTION I BY SWAPANIL SIR" },
  ],
  "Tables": [
    { intent: 'concept', videoId: 'gqYVcVjqW0k', realMinutes: 22, views: 134690,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Tabular Set || LR & DI Preparation for CAT || CAT exam Preparation" },
  ],
  "Time & Work": [
    { intent: 'concept', videoId: 'oApzHGJNx38', realMinutes: 22, views: 423047,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time and Work 1: LCM Method Introduction | Arithmetic for CAT 202" },
    { intent: 'worked_example', videoId: '6IbA-nSj28g', realMinutes: 24, views: 319926,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time and Work 2: Alternate Days and Workers Leaving | Arithmetic" },
  ],
  "Time Speed Distance": [
    { intent: 'concept', videoId: 'CKiP208avbc', realMinutes: 22, views: 500528,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time Speed and Distance 1: Constant Distance Problems | Arithmeti" },
    { intent: 'worked_example', videoId: 'PQvBSkJDF_E', realMinutes: 24, views: 308241,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Time Speed and Distance 2: Speed Time Inverse Proportion | Arithm" },
  ],
  "Triangles": [
    { intent: 'concept', videoId: '25P2O9r3AfM', realMinutes: 33, views: 422192,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Triangles 1: Centroid Orthocenter Incenter Circumcenter | Geometry for" },
    { intent: 'worked_example', videoId: '9H2CftySPkI', realMinutes: 11, views: 36772,
      channel: "Takshzila", verifiedOn: '2026-08-31',
      title: "Geometry for CAT (Sides of a Triangle): Part 1 (Basic Concepts)" },
  ],
  "Venn / Sets": [
    { intent: 'concept', videoId: 'D3iR5cIr_VQ', realMinutes: 10, views: 301171,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Venn Diagram & Chocolate Distribution (Introduction) - 1  | LR & DI  |" },
    { intent: 'worked_example', videoId: 'dRbw57eHvuo', realMinutes: 30, views: 421636,
      channel: "Rodha", verifiedOn: '2026-08-31',
      title: "Venn Diagrams - 2 |  4 parameter Venn Diagram | CAT Preparation" },
  ],
};

/** The primary (or any named intent) for a topic. Null is the normal state —
 *  most topics carry nothing, and every caller must render fine without one. */
export function resourceFor(topic: string, intent: ResourceIntent): TopicResource | null {
  return TOPIC_RESOURCES[topic]?.find((r) => r.intent === intent) ?? null;
}

export function resourceByPreference(topic: string, intents: readonly ResourceIntent[]): TopicResource | null {
  for (const intent of intents) {
    const hit = resourceFor(topic, intent);
    if (hit) return hit;
  }
  return null;
}

/**
 * The alternative explanation, offered ONLY after a student says the primary
 * did not help. Never rendered beside the primary: one link is a decision made
 * for the student, two links hand the decision back.
 */
export function resourceSecondary(topic: string | null): TopicResource | null {
  if (!topic) return null;
  return resourceFor(topic, 'worked_example');
}

export function resourceCoverage(): { topics: number; resources: number } {
  const v = Object.values(TOPIC_RESOURCES);
  return { topics: v.length, resources: v.reduce((n, r) => n + r.length, 0) };
}
