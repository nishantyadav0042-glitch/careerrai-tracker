export interface Mission {
  name: string;
  focus: string;
}

// Edit here to rename missions — no component changes needed.
const MISSION_MAP: Record<number, Mission> = {
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

export const MISSION_TARGET = 30;

export function getCurrentMission(month: number = new Date().getMonth()): Mission {
  return MISSION_MAP[month] ?? MISSION_MAP[0];
}
