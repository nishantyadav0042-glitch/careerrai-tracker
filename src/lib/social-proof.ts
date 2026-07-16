// Real social proof — every number is computed live from the DB via the
// social_proof() RPC. Nothing here is hardcoded or invented; if a count is
// small, we show the small truth (or omit it) rather than fake a bigger one.
export interface SocialProof {
  startedTotal: number;    // students preparing on CareerRai
  mappedTotal: number;     // students who mapped their full syllabus
  plannedThisWeek: number; // students with a study plan this week
  loggedThisWeek: number;  // students who logged study this week
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSocialProof(admin: any): Promise<SocialProof> {
  try {
    const { data } = await admin.rpc('social_proof').single();
    return {
      startedTotal: data?.started_total ?? 0,
      mappedTotal: data?.mapped_total ?? 0,
      plannedThisWeek: data?.planned_week ?? 0,
      loggedThisWeek: data?.logged_week ?? 0,
    };
  } catch {
    return { startedTotal: 0, mappedTotal: 0, plannedThisWeek: 0, loggedThisWeek: 0 };
  }
}
