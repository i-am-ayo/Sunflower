import Decimal from "decimal.js-light";

import type { GameState } from "../types/game";
import { ISLAND_MAX_EXPANSION } from "../expansion/lib/expansionRequirements";
import { getDynamicIsland } from "./landDataDynamic";

/**
 * The farm loaded when the game runs without the API (offline / local dev and
 * the portal example — see gameMachine.ts and portalMachine.ts).
 *
 * Local play uses the basic island with its canonical starter plots, plus a
 * small seed/coin float so the farm can actually be farmed offline. Built once
 * so the generated node ids stay stable across the ART_MODE boot assigns.
 *
 * Other development farms (see the imports below):
 *
 * - INITIAL_FARM (./constants) — the untouched farm a brand-new player starts
 *   with; it has no crop plots or seeds, so nothing can be planted.
 * - STATIC_OFFLINE_FARM (./landDataStatic) — a hand-authored snapshot to edit
 *   directly.
 * - DYNAMIC_OFFLINE_FARM (./landDataDynamic) — a maxed volcano farm used for
 *   ascension testing.
 */

const PLAYABLE_OFFLINE_FARM: GameState = getDynamicIsland(
  "basic",
  ISLAND_MAX_EXPANSION.basic,
);

export const OFFLINE_FARM: GameState = {
  ...PLAYABLE_OFFLINE_FARM,
  coins: 1000,
  inventory: {
    ...PLAYABLE_OFFLINE_FARM.inventory,
    "Sunflower Seed": new Decimal(100),
  },
};

// import { STATIC_OFFLINE_FARM } from "./landDataStatic";
// export const OFFLINE_FARM: GameState = STATIC_OFFLINE_FARM;

// import { DYNAMIC_OFFLINE_FARM } from "./landDataDynamic";
// export const OFFLINE_FARM: GameState = DYNAMIC_OFFLINE_FARM;
