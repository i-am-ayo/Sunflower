import Decimal from "decimal.js-light";

import type { GameState } from "features/game/types/game";
import { INITIAL_FARM } from "features/game/lib/constants";

import { loadFarm, saveFarm } from "./persistFarm";

describe("offline farm autosave", () => {
  it("restores coins, crops, inventory and counters after a reload", () => {
    localStorage.clear();

    const saved = {
      ...INITIAL_FARM,
      coins: 1234,
      crops: {
        "3": {
          crop: { name: "Sunflower", plantedAt: 1 },
          amount: 1,
          plantedAt: 1,
        },
      },
      inventory: { ...INITIAL_FARM.inventory, Sunflower: new Decimal(7) },
      farmActivity: { "Sunflower Harvested": 9 },
    } as unknown as GameState;

    saveFarm(saved);

    const reloaded = loadFarm({ ...INITIAL_FARM, coins: 1000 });

    expect(reloaded.coins).toBe(1234);
    expect(Object.keys(reloaded.crops)).toEqual(["3"]);
    expect(reloaded.inventory.Sunflower?.toString()).toBe("7");
    expect(reloaded.farmActivity["Sunflower Harvested"]).toBe(9);
  });
});
