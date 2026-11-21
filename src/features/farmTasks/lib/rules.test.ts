import type { FarmActivityCounters } from "./rules";
import {
  applyAutoPlay,
  claimStage,
  createTaskState,
  FARM_TASK_STAGES,
  getGoalProgress,
  isAttemptComplete,
  isAttemptExpired,
  normalizeTaskState,
  setAutoPlay,
  startStage,
} from "./rules";

const NOW = Date.UTC(2026, 10, 20, 9, 0, 0);

const activity = (counters: FarmActivityCounters) => counters;

describe("farmTasks rules", () => {
  it("starts stage one with a baseline snapshot", () => {
    const state = startStage(createTaskState(NOW), NOW, activity({}));

    expect(state.attempt?.stage).toBe(1);
    expect(state.attempt?.endsAt).toBe(NOW + FARM_TASK_STAGES[0].durationMs);
  });

  it("counts only growth that happened after the stage started", () => {
    const baseline = { "Sunflower Harvested": 10 };
    const started = startStage(createTaskState(NOW), NOW, baseline);

    const progress = getGoalProgress(started, {
      ...baseline,
      "Sunflower Harvested": 18,
    });

    expect(progress.find((goal) => goal.kind === "harvest")?.current).toBe(8);
  });

  it("completes when every goal is met before the timer runs out", () => {
    const started = startStage(createTaskState(NOW), NOW, {});

    expect(
      isAttemptComplete(
        started,
        { "Sunflower Planted": 8, "Sunflower Harvested": 8 },
        NOW + 1000,
      ),
    ).toBe(true);
  });

  it("does not complete after the timer has expired", () => {
    const started = startStage(createTaskState(NOW), NOW, {});
    const afterDeadline = NOW + FARM_TASK_STAGES[0].durationMs + 1000;

    expect(
      isAttemptComplete(
        started,
        { "Sunflower Planted": 8, "Sunflower Harvested": 8 },
        afterDeadline,
      ),
    ).toBe(false);
    expect(isAttemptExpired(started, afterDeadline)).toBe(true);
  });

  it("claims the reward once and unlocks the next stage", () => {
    const started = startStage(createTaskState(NOW), NOW, {});
    const completed = {
      "Sunflower Planted": 8,
      "Sunflower Harvested": 8,
    };

    const claimed = claimStage(started, completed, NOW + 1000);

    expect(claimed.stars).toBe(FARM_TASK_STAGES[0].reward);
    expect(claimed.stage).toBe(2);
    expect(claimed.claimed).toEqual([1]);
    expect(claimed.attempt).toBeNull();
  });

  it("does not claim an incomplete or expired stage", () => {
    const started = startStage(createTaskState(NOW), NOW, {});

    expect(claimStage(started, {}, NOW + 1000)).toBe(started);
    expect(
      claimStage(started, {}, NOW + FARM_TASK_STAGES[0].durationMs + 1000),
    ).toBe(started);
  });

  it("retries the same stage after it expires", () => {
    const started = startStage(createTaskState(NOW), NOW, {});
    const retryAt = NOW + FARM_TASK_STAGES[0].durationMs + 1000;
    const retried = startStage(started, retryAt, {});

    expect(retried.stage).toBe(1);
    expect(retried.attempt?.startedAt).toBe(retryAt);
  });

  it("auto-play starts the current stage", () => {
    const tasks = setAutoPlay(createTaskState(NOW), true);
    const next = applyAutoPlay(tasks, {}, NOW);

    expect(next.attempt?.stage).toBe(1);
    expect(next.attempt?.endsAt).toBe(NOW + FARM_TASK_STAGES[0].durationMs);
  });

  it("auto-play claims a completed stage and starts the next one", () => {
    const tasks = startStage(setAutoPlay(createTaskState(NOW), true), NOW, {});
    const completed = { "Sunflower Planted": 8, "Sunflower Harvested": 8 };
    const next = applyAutoPlay(tasks, completed, NOW + 1000);

    expect(next.stage).toBe(2);
    expect(next.stars).toBe(FARM_TASK_STAGES[0].reward);
    expect(next.attempt?.stage).toBe(2);
  });

  it("auto-play retries an expired stage", () => {
    const tasks = startStage(setAutoPlay(createTaskState(NOW), true), NOW, {});
    const late = NOW + FARM_TASK_STAGES[0].durationMs + 1000;
    const next = applyAutoPlay(tasks, {}, late);

    expect(next.stage).toBe(1);
    expect(next.attempt?.startedAt).toBe(late);
  });

  it("does nothing while auto-play is off", () => {
    const tasks = createTaskState(NOW);

    expect(applyAutoPlay(tasks, {}, NOW)).toBe(tasks);
  });

  it("resets daily progress at UTC midnight but keeps stars and auto-play", () => {
    const claimed = {
      ...createTaskState(NOW),
      stage: 3,
      stars: 4,
      claimed: [1, 2],
      autoPlay: true,
    };

    const nextDay = normalizeTaskState(claimed, NOW + 24 * 60 * 60 * 1000);

    expect(nextDay.stage).toBe(1);
    expect(nextDay.claimed).toEqual([]);
    expect(nextDay.stars).toBe(4);
    expect(nextDay.autoPlay).toBe(true);
  });
});
