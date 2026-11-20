import React, { useContext, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import playIcon from "assets/icons/play.png";
import { PIXEL_SCALE } from "features/game/lib/constants";
import { RoundButton } from "components/ui/RoundButton";
import { Context } from "features/game/GameProvider";
import { useNow } from "lib/utils/hooks/useNow";
import { readLocalStorageJSON, writeLocalStorageJSON } from "lib/localStorage";

import { getNextAutoFarmAction } from "../lib/autoFarm";

const STORAGE_KEY = "farmTasks:autoFarm:v1";

/**
 * HUD toggle that visibly plays the farm: every tick it harvests the first
 * ready crop, otherwise plants an owned seed on the first empty plot, so the
 * changes happen on the board in front of the player.
 */
export const AutoFarmButton: React.FC = () => {
  const { gameService } = useContext(Context);
  const [enabled, setEnabled] = useState(
    () => readLocalStorageJSON<boolean>(STORAGE_KEY) ?? false,
  );

  const now = useNow({ live: enabled, intervalMs: 1000 });

  useEffect(() => {
    if (!enabled) return;

    // Farm events are only handled while the machine is in `playing`; sending
    // them from the boot gates (terms, referrals, ...) would be ignored.
    if (!gameService.getSnapshot().matches("playing")) return;

    const game = gameService.getSnapshot().context.state;
    const action = getNextAutoFarmAction(game, now);
    if (!action) return;

    try {
      if (action.type === "harvest") {
        gameService.send("crop.harvested", { index: action.index });
      } else {
        gameService.send("seed.planted", {
          index: action.index,
          item: action.seed,
          cropId: uuidv4().slice(0, 8),
        });
      }
    } catch {
      // The reducer rejected this step (e.g. the plot is not fertile).
      // Leave it alone and let the next tick pick another plot.
    }
  }, [enabled, now, gameService]);

  const onClick = () => {
    setEnabled((previous) => {
      const next = !previous;
      writeLocalStorageJSON(STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <RoundButton onClick={onClick}>
      <img
        src={playIcon}
        className="absolute group-active:translate-y-[2px]"
        style={{
          top: `${PIXEL_SCALE * 2.6}px`,
          left: `${PIXEL_SCALE * 3.4}px`,
          width: `${PIXEL_SCALE * 15.5}px`,
        }}
      />
      {enabled && (
        <span
          className="absolute rounded-full animate-pulse"
          style={{
            top: `${PIXEL_SCALE * 1}px`,
            right: `${PIXEL_SCALE * 1}px`,
            width: `${PIXEL_SCALE * 5}px`,
            height: `${PIXEL_SCALE * 5}px`,
            backgroundColor: "#8bc34a",
          }}
        />
      )}
    </RoundButton>
  );
};
