import type { TranslationKeys } from "lib/i18n/dictionaries/types";
import type { FarmActivityName } from "features/game/types/farmActivity";

/**
 * Farm Tasks is a Sunflower-styled port of MeadowFarm's staged daily challenge.
 * Progress is derived from Sunflower's lifetime `farmActivity` counters, and
 * the state is stored locally per farm, so no game events or server changes
 * are required.
 */

export type FarmActivityCounters = Partial<Record<FarmActivityName, number>>;

export type FarmTaskKind = "plant" | "harvest" | "cook" | "deliver";

export interface FarmTaskGoal {
  kind: FarmTaskKind;
  target: number;
}

export interface FarmTaskStage {
  stage: number;
  nameKey: TranslationKeys;
  durationMs: number;
  reward: number;
  goals: FarmTaskGoal[];
}

export interface FarmTaskAttempt {
  stage: number;
  startedAt: number;
  endsAt: number;
  baseline: FarmActivityCounters;
}

export interface FarmTaskState {
  version: 1;
  day: string;
  /** 1-5 while a stage is in progress, 6 when all five are claimed. */
  stage: number;
  stars: number;
  claimed: number[];
  attempt: FarmTaskAttempt | null;
  autoPlay: boolean;
}

const MINUTE = 60_000;

/**
 * Durations and targets are tuned for Sunflower's crop/cook timers, which are
 * much slower than MeadowFarm's. Keep them here so balance can be adjusted in
 * one place.
 */
export const FARM_TASK_STAGES: FarmTaskStage[] = [
  {
    stage: 1,
    nameKey: "farmTasks.stage.1",
    durationMs: 15 * MINUTE,
    reward: 1,
    goals: [
      { kind: "plant", target: 8 },
      { kind: "harvest", target: 8 },
    ],
  },
  {
    stage: 2,
    nameKey: "farmTasks.stage.2",
    durationMs: 20 * MINUTE,
    reward: 2,
    goals: [
      { kind: "harvest", target: 20 },
      { kind: "cook", target: 4 },
    ],
  },
  {
    stage: 3,
    nameKey: "farmTasks.stage.3",
    durationMs: 20 * MINUTE,
    reward: 3,
    goals: [
      { kind: "deliver", target: 2 },
      { kind: "harvest", target: 25 },
    ],
  },
  {
    stage: 4,
    nameKey: "farmTasks.stage.4",
    durationMs: 30 * MINUTE,
    reward: 5,
    goals: [
      { kind: "cook", target: 10 },
      { kind: "deliver", target: 3 },
    ],
  },
  {
    stage: 5,
    nameKey: "farmTasks.stage.5",
    durationMs: 45 * MINUTE,
    reward: 8,
    goals: [
      { kind: "harvest", target: 50 },
      { kind: "cook", target: 15 },
      { kind: "deliver", target: 5 },
    ],
  },
];

const ACTIVITY_SUFFIX: Record<FarmTaskKind, string> = {
  plant: " Planted",
  harvest: " Harvested",
  cook: " Cooked",
  deliver: " Delivered",
};

export const getTaskDay = (now: number): string =>
  new Date(now).toISOString().slice(0, 10);

export const createTaskState = (now: number): FarmTaskState => ({
  version: 1,
  day: getTaskDay(now),
  stage: 1,
  stars: 0,
  claimed: [],
  attempt: null,
  autoPlay: false,
});

/** Resets the challenge at UTC midnight while keeping lifetime Task Stars. */
export const normalizeTaskState = (
  state: FarmTaskState,
  now: number,
): FarmTaskState => {
  // Older saves predate auto-play, so default it explicitly.
  const autoPlay = typeof state.autoPlay === "boolean" ? state.autoPlay : false;
  const today = getTaskDay(now);

  if (state.day === today) {
    return state.autoPlay === autoPlay ? state : { ...state, autoPlay };
  }

  return { ...createTaskState(now), stars: state.stars, autoPlay };
};

export const getActiveStage = (
  state: FarmTaskState,
): FarmTaskStage | undefined => FARM_TASK_STAGES[state.stage - 1];

const countDelta = (
  activity: FarmActivityCounters | undefined,
  baseline: FarmActivityCounters,
  kind: FarmTaskKind,
): number => {
  const suffix = ACTIVITY_SUFFIX[kind];
  let total = 0;

  for (const [key, value] of Object.entries(activity ?? {})) {
    if (!key.endsWith(suffix)) continue;

    const current = value ?? 0;
    const start = baseline[key as FarmActivityName] ?? 0;
    total += Math.max(0, current - start);
  }

  return total;
};

export interface FarmTaskGoalProgress extends FarmTaskGoal {
  current: number;
}

export const getGoalProgress = (
  state: FarmTaskState,
  activity: FarmActivityCounters | undefined,
): FarmTaskGoalProgress[] => {
  if (!state.attempt) return [];

  const stage = FARM_TASK_STAGES[state.attempt.stage - 1];
  if (!stage) return [];

  return stage.goals.map((goal) => ({
    ...goal,
    current: Math.min(
      goal.target,
      countDelta(activity, state.attempt!.baseline, goal.kind),
    ),
  }));
};

export const isAttemptExpired = (state: FarmTaskState, now: number): boolean =>
  !!state.attempt && now > state.attempt.endsAt;

export const isAttemptComplete = (
  state: FarmTaskState,
  activity: FarmActivityCounters | undefined,
  now: number,
): boolean => {
  if (!state.attempt || now > state.attempt.endsAt) return false;

  const progress = getGoalProgress(state, activity);
  return (
    progress.length > 0 && progress.every((goal) => goal.current >= goal.target)
  );
};

export const startStage = (
  state: FarmTaskState,
  now: number,
  activity: FarmActivityCounters | undefined,
): FarmTaskState => {
  const stage = getActiveStage(state);
  if (!stage) return state;

  // A running or completed attempt must be claimed (or expire) first.
  if (state.attempt && now <= state.attempt.endsAt) return state;

  return {
    ...state,
    attempt: {
      stage: state.stage,
      startedAt: now,
      endsAt: now + stage.durationMs,
      baseline: { ...activity },
    },
  };
};

export const claimStage = (
  state: FarmTaskState,
  activity: FarmActivityCounters | undefined,
  now: number,
): FarmTaskState => {
  const stage = getActiveStage(state);
  if (!stage) return state;
  if (!isAttemptComplete(state, activity, now)) return state;

  return {
    ...state,
    stars: state.stars + stage.reward,
    claimed: [...state.claimed, state.stage],
    stage: state.stage + 1,
    attempt: null,
  };
};

export const isAllStagesClaimed = (state: FarmTaskState): boolean =>
  state.stage > FARM_TASK_STAGES.length;

export const setAutoPlay = (
  state: FarmTaskState,
  enabled: boolean,
): FarmTaskState => ({ ...state, autoPlay: enabled });

/**
 * Advances the challenge automatically when auto-play is on: claims a
 * completed stage, then starts the next (or retries an expired) stage.
 */
export const applyAutoPlay = (
  state: FarmTaskState,
  activity: FarmActivityCounters | undefined,
  now: number,
): FarmTaskState => {
  if (!state.autoPlay || isAllStagesClaimed(state)) return state;

  let next = state;

  if (next.attempt && isAttemptComplete(next, activity, now)) {
    next = claimStage(next, activity, now);
  }

  if (
    !isAllStagesClaimed(next) &&
    (!next.attempt || isAttemptExpired(next, now))
  ) {
    next = startStage(next, now, activity);
  }

  return next;
};
