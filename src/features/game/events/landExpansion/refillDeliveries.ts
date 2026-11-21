import type { GameState } from "features/game/types/game";

export type RefillDeliveriesAction = { type: "tasks.refillDeliveries" };

/**
 * Offline demo helper: the delivery board is normally renewed by the server
 * once a day. With no backend the board would stay spent after the first
 * stage, so every Farm Tasks stage start rewinds it locally - orders become
 * deliverable again and each NPC's daily bonus resets. Only dispatched while
 * running without an API (see AutoFarm/FarmTasks panel).
 */
export function refillDeliveries({
  state,
}: {
  state: GameState;
  action: RefillDeliveriesAction;
}): GameState {
  const npcs = Object.fromEntries(
    Object.entries(state.npcs ?? {}).map(([name, npc]) => [
      name,
      { ...npc, deliveryCompletedAt: undefined },
    ]),
  ) as GameState["npcs"];

  return {
    ...state,
    npcs,
    delivery: {
      ...state.delivery,
      orders: state.delivery.orders.map((order) => ({
        ...order,
        completedAt: undefined,
      })),
    },
  };
}
