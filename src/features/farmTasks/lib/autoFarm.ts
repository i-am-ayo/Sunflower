import type { GameState } from "features/game/types/game";
import { CROPS } from "features/game/types/crops";
import { isReadyToHarvest } from "features/game/events/landExpansion/harvest";
import { isPlotFertile } from "features/game/events/landExpansion/plant";
import { getSnakeOrder } from "features/island/plots/lib/tutorialPlots";
import { isCropSeed, type SeedName } from "features/game/types/seeds";
import { getKeys } from "lib/object";

export type AutoFarmAction =
  | { type: "harvest"; index: string }
  | { type: "plant"; index: string; seed: SeedName };

/**
 * One visible step for the auto-farmer: harvest the first ready crop in the
 * plot walk, otherwise plant an owned crop seed on the first empty plot.
 * Returns undefined when there is nothing to do.
 */
export const getNextAutoFarmAction = (
  game: GameState,
  now: number,
): AutoFarmAction | undefined => {
  const orderedIds = getSnakeOrder(game.crops);

  const isReady = (id: string) => {
    const { crop, fertiliser } = game.crops[id];

    return (
      !!crop && isReadyToHarvest(now, crop, CROPS[crop.name], game, fertiliser)
    );
  };

  const readyId = orderedIds.find(isReady);
  if (readyId) return { type: "harvest", index: readyId };

  const ownedCropSeeds = getKeys(game.inventory).filter(
    (name) => isCropSeed(name as SeedName) && name !== "Sunflower Seed",
  ) as SeedName[];

  // Sunflower first (cheap and usually the tutorial seed), then any other
  // crop seed the player owns.
  const seed = ["Sunflower Seed" as SeedName, ...ownedCropSeeds].find((name) =>
    game.inventory[name]?.greaterThan(0),
  );

  if (!seed) return;

  // `plant` rejects plots beyond the Water Well's coverage, so skip those here
  // instead of retrying the same plot forever.
  const emptyId = orderedIds.find(
    (id) =>
      !game.crops[id].crop &&
      isPlotFertile({
        plotIndex: id,
        crops: game.crops,
        wellLevel: game.waterWell.level,
        buildings: game.buildings,
        upgradeReadyAt: game.waterWell.upgradeReadyAt ?? 0,
        createdAt: now,
        island: game.island.type,
      }),
  );
  if (!emptyId) return;

  return { type: "plant", index: emptyId, seed };
};
