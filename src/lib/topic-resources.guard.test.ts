/**
 * Guards on the verified external-resource map.
 *
 * Every rule here exists because the research that produced this data broke it
 * at least once. Nine candidate videos did not exist; twenty-two durations were
 * wrong, several by twenty minutes or more; three videos were credited to the
 * wrong channel. See docs/phase0/VERIFICATION-FINAL.md. These tests are the
 * standing cost of never shipping that to a student.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TOPIC_RESOURCES, resourceFor, resourceCoverage, type ResourceIntent } from './topic-resources';
import { KNOWLEDGE_GRAPH } from './topics-constants';

const ALL_UNITS = new Set(KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units));

// The platform ledger — see scripts/verify-resources.mjs, which is the only
// thing allowed to write it. Read here, never fetched, so the suite stays
// offline and deterministic.
const LEDGER = JSON.parse(readFileSync('docs/phase0/VERIFIED-IDS.json', 'utf8')) as {
  videos: Record<string, { minutes: number; channel: string; title: string }>;
};


// Units modern CAT does not test as question types. Grammar was dropped from
// the exam after 2014; the rest are tested only inside Reading Comprehension.
// They may carry ONE orientation pointer, never a practice ladder — otherwise
// the planner would be sending students to practise a question type that does
// not exist.
const SKILL_UNITS = new Set(['Grammar', 'Vocabulary', 'Editorial Reading', 'Reading Speed Practice']);

describe('topic-resources: every key is a real unit', () => {
  it('never invents a topic name outside the knowledge graph', () => {
    // A typo here would silently orphan the resource: the lookup is by exact
    // topic string, so a near-miss key attaches to nothing and fails silently.
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      expect(ALL_UNITS.has(topic), `"${topic}" is not a unit in topics-constants`).toBe(true);
    }
  });
});

describe('topic-resources: the data must stay verifiable', () => {
  const rows = Object.entries(TOPIC_RESOURCES).flatMap(([t, rs]) => rs.map((r) => [t, r] as const));

  it('carries a real YouTube video id in every row', () => {
    for (const [topic, r] of rows) {
      expect(r.videoId, `${topic}/${r.intent}`).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it('records a real duration, and never misrepresents a long one as today\'s work', () => {
    // This test used to REJECT anything over 45 minutes. That was the wrong
    // shape for the rule it was protecting. 45 minutes is still the ceiling a
    // daily topic block can hold — but for six topics the best free
    // explanation that exists is longer than that, and refusing to link it
    // leaves the student with nothing rather than with something honest.
    //
    // Founder, 31 Aug: do not bypass the 45-minute rule — reframe it so that
    // it protects the student from being misled.
    //
    // So the rule is now what it always meant: a resource may exceed the daily
    // block, but the system must never represent its full runtime as today's
    // required work. A long row must SAY it is long, and the surface must
    // carry the sentence that says finishing today is not the job.
    for (const [topic, r] of rows) {
      expect(r.realMinutes, `${topic}/${r.intent}`).toBeGreaterThan(0);
      expect(
        r.longForm === true,
        `${topic}/${r.intent} runs ${r.realMinutes} min and must be flagged longForm`,
      ).toBe(r.realMinutes > 45);
    }
  });

  it('records when each row was last checked against the platform', () => {
    for (const [topic, r] of rows) {
      expect(r.verifiedOn, `${topic}/${r.intent}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('names a channel for every row', () => {
    // The provenance gate is channel-level. Three research rows credited the
    // wrong channel, which would have meant vetting one creator and shipping
    // another's video.
    for (const [topic, r] of rows) {
      expect(r.channel.trim().length, `${topic}/${r.intent}`).toBeGreaterThan(0);
    }
  });
});

describe('topic-resources: one resource per slot, no duplicates', () => {
  it('never lists the same intent twice for a topic', () => {
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      const intents = rs.map((r) => r.intent);
      expect(new Set(intents).size, `${topic} has a duplicate intent`).toBe(intents.length);
    }
  });

  it('never reuses one video for two intents in the same topic', () => {
    // The research did exactly this: one Average video was returned as both
    // L1 and L2 under two different titles, and one Time & Work video was
    // graded two levels apart across runs.
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      const ids = rs.map((r) => r.videoId);
      expect(new Set(ids).size, `${topic} reuses a video across intents`).toBe(ids.length);
    }
  });
});

describe('topic-resources: skill units get a pointer, not a ladder', () => {
  it('gives non-question-type units at most one concept resource', () => {
    for (const unit of SKILL_UNITS) {
      const rs = TOPIC_RESOURCES[unit];
      if (!rs) continue;
      expect(rs.length, `${unit} should carry at most one orientation pointer`).toBeLessThanOrEqual(1);
      expect(rs[0].intent, `${unit} must not carry a practice intent`).toBe('concept');
    }
  });
});

describe('resourceFor', () => {
  it('returns null for a topic we have nothing verified for', () => {
    // The overwhelmingly common case, and the card must render fine without a
    // resource. Absence is a normal state, never an error.
    // The example has moved twice as coverage grew — Base System, then Odd One
    // Out. Hybrid DILR Sets is the one topic deliberately left uncovered: its
    // previous primary was a Tables video serving two topics, and no genuine
    // hybrid-set concept video has been found. Absence is the correct state.
    expect(resourceFor('Hybrid DILR Sets', 'concept')).toBeNull();
    expect(resourceFor('not a real topic', 'concept')).toBeNull();
  });

  it('returns the matching intent when we do have one', () => {
    const r = resourceFor('Percentages', 'concept');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('concept');
    expect(r!.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('returns null for an intent a covered topic does not have', () => {
    // Partial ladders are the norm — most topics have two or three intents,
    // not four, and the caller must handle the hole.
    const covered = Object.keys(TOPIC_RESOURCES)[0];
    const have = new Set(TOPIC_RESOURCES[covered].map((r) => r.intent));
    const missing = (['concept', 'worked_example', 'practice', 'revision', 'exam_practice'] as ResourceIntent[])
      .find((i) => !have.has(i));
    if (missing) expect(resourceFor(covered, missing)).toBeNull();
  });
});

describe('resourceCoverage', () => {
  it('reports honest totals', () => {
    const c = resourceCoverage();
    expect(c.topics).toBe(Object.keys(TOPIC_RESOURCES).length);
    expect(c.resources).toBeGreaterThan(0);
  });
});

// ── Layer A: the format rule, enforced ──────────────────────────────────────
//
// "Never attach a resource merely because it exists. Attach it because its
// format matches what the student is being asked to do."
//
// This was broken in production: `foundation` fell back to a practice video,
// so a student meeting a topic for the first time was handed someone else's
// practice. A comment would not have caught it. These three tests would.
describe('Layer A: a resource must match what the task asks', () => {
  it('ships nothing but concept and worked_example', () => {
    // practice / revision / exam_practice are declared in the type because
    // they are the plan, but no row may claim them until a real question
    // source exists behind them.
    const intents = new Set(
      Object.values(TOPIC_RESOURCES).flatMap((rs) => rs.map((r) => r.intent)),
    );
    expect([...intents].sort()).toEqual(['concept', 'worked_example']);
  });

  it('never lets a practice task reach a video', async () => {
    // The defect, stated as a test. If someone re-adds a fallback to
    // RESOURCE_PREFERENCE, this fails before a student sees it.
    const { resourceForTask } = await import('./routine-engine');
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      expect(resourceForTask(topic, 'intensive'), `${topic} at intensive`).toBeNull();
      expect(resourceForTask(topic, 'revision'), `${topic} at revision`).toBeNull();
    }
  });

  it('offers a secondary only where a primary exists', async () => {
    // A practice task must not acquire an alternative explanation by accident
    // just because the topic happens to own a worked_example.
    const { secondaryForTask } = await import('./routine-engine');
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      expect(secondaryForTask(topic, 'intensive'), `${topic}`).toBeNull();
      expect(secondaryForTask(topic, 'revision'), `${topic}`).toBeNull();
    }
  });

  it('never uses the same video as both primary and secondary', () => {
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      const primary = rs.find((r) => r.intent === 'concept');
      const secondary = rs.find((r) => r.intent === 'worked_example');
      if (primary && secondary) {
        expect(secondary.videoId, `${topic} offers the same video twice`).not.toBe(primary.videoId);
      }
    }
  });
});

describe('a video is the primary for at most one topic', () => {
  it('never uses one video to teach two different topics', () => {
    // Found by audit: `gqYVcVjqW0k` ("Tabular Set", Rodha) was the concept
    // primary for BOTH Tables and Hybrid DILR Sets. It is genuinely a Tables
    // video; hybrid sets are a different thing, and no verified concept video
    // for them exists. The topic was dropped rather than kept wrong — a
    // missing resource is acceptable, a wrong one is not.
    const seen = new Map<string, string>();
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      for (const r of rs) {
        if (r.intent !== 'concept') continue;
        const prior = seen.get(r.videoId);
        expect(prior, `${r.videoId} teaches both "${prior}" and "${topic}"`).toBeUndefined();
        seen.set(r.videoId, topic);
      }
    }
  });

  it('never reuses one video across topics at all', () => {
    const seen = new Map<string, string>();
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      for (const r of rs) {
        const prior = seen.get(r.videoId);
        if (prior && prior !== topic) {
          expect.fail(`${r.videoId} appears under both "${prior}" and "${topic}"`);
        }
        seen.set(r.videoId, topic);
      }
    }
  });
});

describe('confirmPending is an honest, temporary marker', () => {
  it('is empty, because the direct id lookup has now been run for every row', () => {
    // The flag meant "taken from a search response, not yet re-checked by a
    // direct id lookup" — vidIQ credits ran out mid-round, so eleven rows were
    // hand-checked against the search response instead.
    //
    // scripts/verify-resources.mjs does that lookup for every row on a free
    // YouTube Data API quota, and its output is asserted below. So the flag has
    // been discharged rather than abandoned: the check it was waiting for now
    // runs on every test run, for every row, not just these eleven.
    //
    // The field stays on the interface. If a future round ever adds a row ahead
    // of the lookup again, it has somewhere honest to say so — and the test
    // below will fail until the lookup is run.
    const pending = Object.entries(TOPIC_RESOURCES)
      .flatMap(([t, rs]) => rs.filter((r) => r.confirmPending).map((r) => `${t}/${r.intent}`));
    expect(pending).toEqual([]);
  });

  it('holds every flagged row to the same data standard as a confirmed one', () => {
    // Pending confirmation is not a licence to ship a weaker row. Vacuous while
    // nothing is flagged, and that is the point: it stays armed for the next
    // row that needs the flag.
    for (const [topic, rs] of Object.entries(TOPIC_RESOURCES)) {
      for (const r of rs.filter((x) => x.confirmPending)) {
        expect(r.videoId, `${topic}/${r.intent}`).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(r.realMinutes, `${topic}/${r.intent}`).toBeGreaterThan(0);
        expect(r.longForm === true, `${topic}/${r.intent}`).toBe(r.realMinutes > 45);
        expect(r.channel.trim().length, `${topic}/${r.intent}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('topic-resources: nothing ships that the platform has not confirmed', () => {
  const rows = Object.entries(TOPIC_RESOURCES).flatMap(([t, rs]) => rs.map((r) => [t, r] as const));

  it('has a platform record for every live video id', () => {
    const unverified = rows
      .filter(([, r]) => !(r.videoId in LEDGER.videos))
      .map(([t, r]) => `${t}/${r.intent} (${r.videoId})`);
    expect(
      unverified,
      'run scripts/verify-resources.mjs — if the API returns nothing for an id, it does not exist',
    ).toEqual([]);
  });

  it('stores the runtime the platform reports, not a claimed one', () => {
    for (const [topic, r] of rows) {
      const truth = LEDGER.videos[r.videoId];
      if (!truth) continue;
      expect(r.realMinutes, `${topic}/${r.intent} (${r.videoId})`).toBe(truth.minutes);
    }
  });

  it('credits the channel the platform reports', () => {
    for (const [topic, r] of rows) {
      const truth = LEDGER.videos[r.videoId];
      if (!truth) continue;
      expect(r.channel, `${topic}/${r.intent} (${r.videoId})`).toBe(truth.channel);
    }
  });

  it('keeps no ledger entry for a video that is no longer live', () => {
    const liveIds = new Set(rows.map(([, r]) => r.videoId));
    const orphans = Object.keys(LEDGER.videos).filter((id) => !liveIds.has(id));
    expect(orphans, 're-run scripts/verify-resources.mjs to prune these').toEqual([]);
  });

  it('has no row still waiting on a direct id lookup', () => {
    // confirmPending marked rows taken from a search response when vidIQ ran
    // out of credits. The ledger IS that lookup, so the flag has no remaining
    // meaning — and leaving it would let a future row wear it indefinitely.
    const pending = rows.filter(([, r]) => r.confirmPending).map(([t, r]) => `${t} (${r.videoId})`);
    expect(pending, 'the ledger performs this lookup — clear the flag').toEqual([]);
  });
});

// ── A student is told what language the lesson is in, before they tap ─────
//
// YouTube's defaultAudioLanguage cannot be used for this: it returns `zxx`
// ("no linguistic content") for lectures that plainly have speech, and `en`
// for videos taught entirely in Hindi. Every value here was established by
// reading the transcript, and the evidence file records that.
describe('topic-resources: the teaching language is recorded, not guessed', () => {
  const LANGS = JSON.parse(readFileSync('docs/phase0/RESOURCE-LANGUAGES.json', 'utf8')) as {
    languages: Record<string, 'en' | 'hi'>;
    _unresolved: Record<string, string>;
  };
  const rows = Object.entries(TOPIC_RESOURCES).flatMap(([t, rs]) => rs.map((r) => [t, r] as const));

  it('only claims a language it has transcript evidence for', () => {
    const unbacked = rows
      .filter(([, r]) => r.language !== undefined && LANGS.languages[r.videoId] !== r.language)
      .map(([t, r]) => `${t} (${r.videoId})`);
    expect(unbacked, 'read the transcript and record it, or leave the row unlabelled').toEqual([]);
  });

  it('leaves a row unlabelled rather than guessing, and says which', () => {
    // Absence is a legitimate state. What is not legitimate is an unlabelled
    // row nobody has accounted for, so every one must be named in the file.
    const unlabelled = rows.filter(([, r]) => r.language === undefined).map(([, r]) => r.videoId);
    for (const id of unlabelled) {
      expect(LANGS._unresolved[id], `${id} is unlabelled but not recorded as unresolved`).toBeTruthy();
    }
  });
});
