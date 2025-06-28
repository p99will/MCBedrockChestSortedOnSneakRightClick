// main.js – Robust Chest‑Sorting Script for BDS / Single‑player 1.21.90+
// -----------------------------------------------------------------------------
// Sneak‑click any inventory block (chest, barrel, etc.) while crouching to
// stack + alphabetise its contents. No cheats are required.
//
// Key improvements in this version
// • Uses next‑tick scheduling (system.run) so writes persist.
// • Stacks up to each item’s own maxAmount (64 for most items, 1 for tools, etc.).
// • Verifies integrity **by total item counts only** (slot order obviously changes!),
//   preventing false roll‑backs.
// • If counts differ, rolls back and prints a *precise* diff of missing/extra items.
// • Single VERBOSE flag to toggle chat spam.
// -----------------------------------------------------------------------------

import {
  world,
  system,
  BlockComponentTypes,
  ItemStack,
} from "@minecraft/server";

const INV_ID = BlockComponentTypes.Inventory; // "minecraft:inventory"
const VERBOSE = false; // flip to false once you trust it
const log = (p, msg, c = "7") => VERBOSE && p.sendMessage(`§${c}${msg}`);

// ───────── Event hook ────────────────────────────────────────────────────────
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!ev.player.isSneaking) return; // trigger only when crouching
  // ev.cancel = true; // stop vanilla GUI from opening
  system.run(() => sortContainer(ev.player, ev.block)); // run next tick
});

// ───────── Main sorter ────────────────────────────────────────────────────────
function sortContainer(player, clickedBlock) {
  const chest = player.dimension.getBlock(clickedBlock.location);
  const inv = chest.getComponent(INV_ID);
  if (!inv) {
    log(player, "§cNo inventory component!");
    return;
  }
  const cont = inv.container;
  if (!cont?.isValid) {
    log(player, "§cContainer invalid / chunk not loaded");
    return;
  }

  const size = cont.size;
  const before = snapshot(cont);

  // Build merged stacks keyed by id:data:custom (respecting un‑stackables)
  const merged = new Map();
  for (const stk of before) {
    if (!stk) continue;
    const key = getStackKey(stk);
    if (!merged.has(key))
      merged.set(key, { proto: stk.clone(), qty: 0, max: stk.maxAmount });
    merged.get(key).qty += stk.amount;
  }

  // Produce alphabetically sorted array of stacks, split by max stack size
  const final = [];
  [...merged.keys()].sort().forEach((k) => {
    const { proto, qty, max } = merged.get(k);
    let left = qty;
    while (left > 0 && final.length < size) {
      const s = proto.clone();
      s.amount = Math.min(left, max);
      final.push(s);
      left -= s.amount;
    }
  });
  while (final.length < size) final.push(null);

  // Write new order
  cont.clearAll();
  final.forEach((stk, i) => stk && cont.setItem(i, stk));

  // Verify counts (ignore slot order)
  const after = snapshot(cont);
  const diffMsg = compareCounts(before, after);

  if (diffMsg) {
    log(player, `§c❌ Sorting failed – ${diffMsg}`);
    // Roll back
    cont.clearAll();
    before.forEach((stk, i) => stk && cont.setItem(i, stk));
  } else {
    log(player, "§aChest sorted!");
  }
}

// ───────── Helpers ───────────────────────────────────────────────────────────
function snapshot(container) {
  return Array.from({ length: container.size }, (_, i) =>
    container.getItem(i)?.clone() || null
  );
}

// Returns null if counts identical, otherwise a human diff string
function compareCounts(before, after) {
  const tally = new Map(); // id:data:custom -> net count
  const add = (m, stk, delta) => {
    const k = getStackKey(stk);
    m.set(k, (m.get(k) || 0) + delta * stk.amount);
  };
  for (const s of before) if (s) add(tally, s, 1);
  for (const s of after) if (s) add(tally, s, -1);

  const problems = [...tally.entries()].filter(([, v]) => v !== 0);
  if (problems.length === 0) return null;
  return problems
    .map(([k, v]) => `${k} net ${v > 0 ? "+" : ""}${v}`)
    .join(", ");
}

// Returns a string key for an ItemStack that includes typeId, data, and relevant custom components
function getStackKey(stk) {
  // Basic key
  let key = `${stk.typeId}:${stk.data ?? 0}`;

  // List of typeIds that need special handling
  const customTypes = [
    "minecraft:potion",
    "minecraft:splash_potion",
    "minecraft:lingering_potion",
    "minecraft:tipped_arrow",
    "minecraft:suspicious_stew",
    "minecraft:firework_rocket",
    "minecraft:firework_star",
    "minecraft:writable_book",
    "minecraft:written_book",
    "minecraft:banner",
    "minecraft:player_head",
    "minecraft:map",
    "minecraft:enchanted_book",
    "minecraft:shulker_box",
    // Add more as needed
  ];

  if (customTypes.includes(stk.typeId)) {
    // Try to get all components and stringify them for comparison
    // Only include relevant components for each type
    let custom = "";
    try {
      if (stk.typeId.includes("potion") || stk.typeId === "minecraft:tipped_arrow" || stk.typeId === "minecraft:suspicious_stew") {
        // Potions, tipped arrows, suspicious stew: effects
        const eff = stk.getComponent("potion_effects")?.effects || stk.getComponent("minecraft:potion_effects")?.effects;
        if (eff) custom += JSON.stringify(eff);
      }
      if (stk.typeId.startsWith("minecraft:firework_")) {
        // Fireworks: explosion, flight, etc.
        const fw = stk.getComponent("fireworks") || stk.getComponent("minecraft:fireworks");
        if (fw) custom += JSON.stringify(fw);
      }
      if (stk.typeId === "minecraft:writable_book" || stk.typeId === "minecraft:written_book") {
        const book = stk.getComponent("minecraft:written_book_contents") || stk.getComponent("written_book_contents");
        if (book) custom += JSON.stringify(book);
      }
      if (stk.typeId === "minecraft:banner") {
        const banner = stk.getComponent("minecraft:banner_patterns") || stk.getComponent("banner_patterns");
        if (banner) custom += JSON.stringify(banner);
      }
      if (stk.typeId === "minecraft:player_head") {
        const head = stk.getComponent("minecraft:player_head_owner") || stk.getComponent("player_head_owner");
        if (head) custom += JSON.stringify(head);
      }
      if (stk.typeId === "minecraft:map") {
        const map = stk.getComponent("minecraft:map_id") || stk.getComponent("map_id");
        if (map) custom += JSON.stringify(map);
      }
      if (stk.typeId === "minecraft:enchanted_book" || stk.getComponent("enchantments")) {
        const ench = stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments");
        if (ench) custom += JSON.stringify(ench);
      }
      if (stk.typeId.endsWith("shulker_box")) {
        const shulker = stk.getComponent("minecraft:container") || stk.getComponent("container");
        if (shulker) custom += JSON.stringify(shulker);
      }
      // Add more as needed
    } catch (e) {
      custom += "[err]";
    }
    key += ":" + custom;
  } else {
    // For all other items, also check for enchantments, name, and lore
    try {
      const ench = stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments");
      if (ench) key += ":" + JSON.stringify(ench);
      const name = stk.getComponent("minecraft:custom_name") || stk.getComponent("custom_name");
      if (name) key += ":" + JSON.stringify(name);
      const lore = stk.getComponent("minecraft:lore") || stk.getComponent("lore");
      if (lore) key += ":" + JSON.stringify(lore);
    } catch (e) {
      key += ":[err]";
    }
  }
  return key;
}
