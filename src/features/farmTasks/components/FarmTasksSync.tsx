import { type FC, useContext, useEffect, useRef } from "react";
import { useSelector } from "@xstate/react";

import { Context } from "features/game/GameProvider";
import { CONFIG } from "lib/config";
import type { MachineState } from "features/game/lib/gameMachine";
import { getActiveTaskStorageKey, loadTaskState } from "../lib/storage";
import { saveFarm } from "../lib/persistFarm";

const _farm = (state: MachineState) => state.context.state;
const _username = (state: MachineState) => state.context.state.username;

/**
 * Always-mounted helper (rendered by the HUD, above the panels):
 *
 * - autosaves the offline demo so a page refresh resumes where the player left
 *   (the farm itself is rebuilt from scratch on every load)
 * - renews the delivery board every time a Farm Tasks stage starts, since
 *   offline carts would otherwise stay spent after the first stages
 *
 * Both behaviours are for the class demo only (no API); a real session is
 * saved and renewed by the server.
 */
export const FarmTasksSync: FC = () => {
  const { gameService } = useContext(Context);
  const farm = useSelector(gameService, _farm);
  const username = useSelector(gameService, _username);

  // Autosave after every successful game event. The farm state object is
  // replaced by the machine on each change, so this covers plants, harvests,
  // deliveries, purchases and so on. It also saves once on boot, even while
  // the machine is still showing its one-off popups, so a refresh can never
  // lose the restored farm.
  useEffect(() => {
    if (CONFIG.API_URL || !farm?.crops) return;

    saveFarm(farm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, gameService]);

  // Flush on refresh/close, in case the last event landed between renders.
  useEffect(() => {
    if (CONFIG.API_URL) return;

    const flush = () => {
      const snapshot = gameService.getSnapshot();
      if (snapshot.context.state?.crops) saveFarm(snapshot.context.state);
    };

    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [gameService]);

  // Delivery board: rewind it once per stage attempt. Polling localStorage
  // keeps this independent of the panel being open and retries until the game
  // machine accepts the event.
  const refillKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (CONFIG.API_URL) return;

    const id = setInterval(() => {
      if (!gameService.getSnapshot().matches("playing")) return;

      const attempt = loadTaskState(
        getActiveTaskStorageKey(username),
        Date.now(),
      )?.attempt;
      const key = attempt ? `${attempt.stage}:${attempt.startedAt}` : undefined;

      if (!key || key === refillKey.current) return;

      gameService.send("tasks.refillDeliveries");
      refillKey.current = key;
    }, 1000);

    return () => clearInterval(id);
  }, [gameService, username]);

  return null;
};
