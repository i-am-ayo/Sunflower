import type { FarmTaskState } from "./rules";
import { normalizeTaskState } from "./rules";

const KEY_PREFIX = "farmTasks:v1";

export const getTaskStorageKey = (farmId: string | undefined): string =>
  `${KEY_PREFIX}:${farmId ?? "local"}`;

const isTaskState = (value: unknown): value is FarmTaskState => {
  const state = value as FarmTaskState;

  return (
    !!state &&
    state.version === 1 &&
    typeof state.day === "string" &&
    typeof state.stage === "number" &&
    typeof state.stars === "number" &&
    Array.isArray(state.claimed)
  );
};

export const loadTaskState = (
  key: string,
  now: number,
): FarmTaskState | undefined => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;

    const parsed: unknown = JSON.parse(raw);
    if (!isTaskState(parsed)) return undefined;

    return normalizeTaskState(parsed, now);
  } catch {
    return undefined;
  }
};

export const saveTaskState = (key: string, state: FarmTaskState): void => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode); the panel still works in memory.
  }
};
