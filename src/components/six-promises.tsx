// The six worries CareerRai takes off a student's plate, as short nouns.
//
// This file used to render the first screen after signup ("Six jobs are ours.
// One job is yours."). That screen was replaced on 24 Sep by
// components/what-careerrai-is.tsx: the founder's audit found the product
// explained five times in the first session, in our language rather than a
// student's. The six nouns stay because the later value-proof card and the
// /welcome page still say them.

// The six worries, in the words CAT students actually use.
//
// Founder, 8 Aug: too long, and the design was heavy. "Keep it simple — which
// is the go-to language of CAT students in class, in coaching, during prep."
//
// Two things fixed. First, "Don't worry about" was repeated six times, which is
// what made it long; it is said ONCE in the heading and the six become short
// nouns. Second, the vocabulary is theirs, not ours: BACKLOG, not "what is
// left". GIVE a mock, not "take" one. OFF DAY, not "a bad day". PORTION and
// SYLLABUS, not "coverage". A student who reads their own coaching's words
// believes the screen; a student who reads product language reads an ad.
//
// Every line maps to something that ships:
//   1 daily plan · 2 topic coverage · 3 revision cadence
//   4 mock calendar + analysis slot · 5 feasibility verdict · 6 busy day
export const SIX_PROMISES: { n: string; head: string }[] = [
  { n: '1', head: 'what to study today' },
  { n: '2', head: 'your backlog' },
  { n: '3', head: 'revision' },
  { n: '4', head: 'mocks' },
  { n: '5', head: 'syllabus completion' },
  { n: '6', head: 'off days' },
];
