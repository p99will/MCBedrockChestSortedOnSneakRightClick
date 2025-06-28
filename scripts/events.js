// events.js – Event subscriptions and wiring
import { world, system, BlockComponentTypes } from "@minecraft/server";
import { allowSortWithoutSneak } from "./commands.js";
import { sortContainer } from "./sorter.js";

export function registerEvents() {
  const INV_ID = BlockComponentTypes.Inventory;
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!allowSortWithoutSneak && !ev.player.isSneaking) return;
    system.run(() => sortContainer(ev.player, ev.block, INV_ID));
  });
}
