// Monthly Theme — a calendar-month label + 30-day progress ring on the
// homepage HeroCard. Deliberately NOT "Mission": that name belongs to
// mission-engine.ts, the deterministic per-student engine that picks which
// task Today's Routine leads with. This is a much simpler, unrelated
// concept — a fixed monthly theme shown to every student regardless of
// their own phase or archetype, purely to give the streak ring a label.

export interface MonthlyTheme {
  name: string;
  focus: string;
}

// Edit here to rename monthly themes — no component changes needed.
const MONTHLY_THEME_MAP: Record<number, MonthlyTheme> = {
  0:  { name: 'Foundation January',   focus: 'Lock the daily habit'             },
  1:  { name: 'Momentum February',    focus: 'Build consistency streaks'         },
  2:  { name: 'Accuracy March',       focus: 'Cut silly mistakes'                },
  3:  { name: 'Speed April',          focus: 'Improve time-per-section'          },
  4:  { name: 'Mock May',             focus: 'Full mocks + debrief loop'         },
  5:  { name: 'Deep June',            focus: 'Strengthen weak sections'          },
  6:  { name: 'Consolidate July',     focus: 'Solidify concepts, cut errors'     },
  7:  { name: 'Sharpen August',       focus: 'Mock mode + time management'       },
  8:  { name: 'Strategy September',   focus: 'Lock your CAT exam strategy'       },
  9:  { name: 'Accuracy October',     focus: 'Zero mistakes on easy Qs'          },
  10: { name: 'Final November',       focus: 'Peak form · CAT month'             },
  11: { name: 'Review December',      focus: 'Analyse, reflect, plan'            },
};

export const MONTHLY_THEME_TARGET = 30;

export function getCurrentMonthlyTheme(month: number = new Date().getMonth()): MonthlyTheme {
  return MONTHLY_THEME_MAP[month] ?? MONTHLY_THEME_MAP[0];
}
