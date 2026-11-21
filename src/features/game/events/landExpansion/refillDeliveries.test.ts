import type { GameState } from "features/game/types/game";
import { INITIAL_FARM } from "features/game/lib/constants";
import { getActiveTaskStorageKey } from "features/farmTasks/lib/storage";

import { refillDeliveries } from "./refillDeliveries";

describe("tasks.refillDeliveries", () => {
  const game = {
    ...INITIAL_FARM,
    npcs: { betty: { deliveryCompletedAt: 123 } },
    delivery: {
      ...INITIAL_FARM.delivery,
      orders: INITIAL_FARM.delivery.orders.map((order) => ({
        ...order,
        completedAt: order.createdAt,
      })),
    },
  } as unknown as GameState;

  it("renews every order and resets the NPC bonus", () => {
    const next = refillDeliveries({
      state: game,
      action: { type: "tasks.refillDeliveries" },
    });

    expect(next.delivery.orders.every((order) => !order.completedAt)).toBe(
      true,
    );
    expect(
      next.delivery.orders.every((order) => order.items.Sunflower === 5),
    ).toBe(true);
    expect(next.npcs?.betty?.deliveryCompletedAt).toBeUndefined();
  });

  it("uses a stable offline task key", () => {
    expect(getActiveTaskStorageKey("random-name")).toBe("farmTasks:v1:local");
  });
});
