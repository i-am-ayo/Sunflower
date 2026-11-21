import { getTaskDay } from "./rules";

/**
 * Daily snapshot of the farm's activity counters. The offline demo farm is
 * rebuilt from INITIAL_FARM on every page load, so without this the derived
 * Farm Tasks progress would look reset even though the task state itself is
 * saved. Keyed by UTC day so yesterday's counters never leak into today.
 */
const KEY_PREFIX = "farmTasks:activity:v1";

export const loadActivitySnapshot = (
  now = Date.now(),
): Record<string, number> | undefined => {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}:${getTaskDay(now)}`);
    if (!raw) return undefined;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;

    return parsed as Record<string, number>;
  } catch {
    return undefined;
  }
};

export const saveActivitySnapshot = (
  activity: Record<string, number>,
  now = Date.now(),
): void => {
  try {
    localStorage.setItem(
      `${KEY_PREFIX}:${getTaskDay(now)}`,
      JSON.stringify(activity),
    );
  } catch {
    // Storage may be unavailable; progress then simply lives in memory.
  }
};
