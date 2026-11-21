import Decimal from "decimal.js-light";

import type { GameState, Inventory } from "features/game/types/game";

const KEY = "farmTasks:farm:v1";

/**
 * Offline demo autosave. The farm is rebuilt from scratch on every page load,
 * so the parts that carry across reloads (coins, planted crops, inventory and
 * today's counters) are snapshotted locally. Only used when running without an
 * API - real sessions are saved by the game itself. Cleared by the final
 * "restart game" button, since every key lives under `farmTasks:`.
 */
type PersistedFarm = {
  coins: number;
  crops: GameState["crops"];
  inventory: Record<string, string>;
  farmActivity: Record<string, number>;
};

export const saveFarm = (state: GameState) => {
  if (!state?.crops || !state.inventory) return;

  try {
    const inventory: Record<string, string> = {};
    Object.entries(state.inventory).forEach(([name, amount]) => {
      if (amount) inventory[name] = amount.toString();
    });

    const farmActivity: Record<string, number> = {};
    Object.entries(state.farmActivity ?? {}).forEach(([name, value]) => {
      if (value !== undefined) farmActivity[name] = Number(value);
    });

    const data: PersistedFarm = {
      coins: state.coins,
      crops: state.crops,
      inventory,
      farmActivity,
    };

    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode); the farm then keeps running
    // in memory and simply restarts on the next load.
  }
};

/** Overlay the last autosave onto a freshly built offline farm. */
export const loadFarm = (farm: GameState): GameState => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return farm;

    const data = JSON.parse(raw) as PersistedFarm;
    if (!data.crops || !data.inventory) return farm;

    const inventory = {} as Inventory;
    Object.entries(data.inventory).forEach(([name, amount]) => {
      (inventory as Record<string, Decimal>)[name] = new Decimal(amount);
    });

    return {
      ...farm,
      coins: data.coins ?? farm.coins,
      crops: data.crops,
      inventory,
      farmActivity: {
        ...farm.farmActivity,
        ...(data.farmActivity ?? {}),
      } as GameState["farmActivity"],
    };
  } catch {
    return farm;
  }
};
