import type { GameState } from "features/game/types/game";

export type RefillDeliveriesAction = { type: "tasks.refillDeliveries" };

/**
 * Offline demo helper: the delivery board is normally renewed by the server
 * once a day. With no backend the board would stay spent after the first
 * stage, so every Farm Tasks stage start rewinds it locally - orders become
 * deliverable again, each NPC's daily bonus resets and the requirements are
 * swapped for cheap Sunflower orders so three deliveries fit inside a stage.
 * Only dispatched while running without an API (see FarmTasksSync).
 */
export function refillDeliveries({
  state,
}: {
  state: GameState;
  action: RefillDeliveriesAction;
}): GameState {
  const now = Date.now();

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
        // Instantly available again: the demo cannot wait for the daily cart.
        createdAt: now,
        readyAt: now,
        completedAt: undefined,
        // Farm-grown Sunflowers keep every order fulfillable within a stage
        // (the original Wood order needed a chopped tree).
        items: { Sunflower: 5 },
      })),
    },
  };
}
