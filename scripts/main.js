// main.js – Robust Chest‑Sorting Script for BDS / Single‑player 1.21.90+
// -----------------------------------------------------------------------------
// Sneak‑click any inventory block (chest, barrel, etc.) while crouching to
// stack + alphabetise its contents. No cheats are required.
//
// Features & Improvements:
// • Uses next‑tick scheduling (system.run) so writes persist.
// • Stacks up to each item’s own maxAmount (64 for most items, 1 for tools, etc.).
// • Verifies integrity **by total item counts only** (slot order obviously changes!),
//   preventing false roll‑backs.
// • If counts differ, rolls back and prints a *precise* diff of missing/extra items.
// • Single VERBOSE flag to toggle chat spam.
// • Visual feedback: happy villager particles and level-up sound on successful sort.
// • Performance: optimized array operations and preallocation for large containers.
// • Sorting modes: /sortmode <alpha|count|type> (operator-only) to change sorting order.
// • Operator-only commands: /sortanywhere and /sortmode require operator status (hasTag("operator")).
// • /sortanywhere toggles whether sneaking is required for sorting.
// -----------------------------------------------------------------------------
//
// Commands:
//   /sortanywhere
//     - Toggle global sorting without sneaking (operator only).
//   /sortmode <alpha|count|type>
//     - Change sorting mode: alphabetical (default), by item count, or by typeId (operator only).
//
// Visual Feedback:
//   - Sorting triggers happy villager particles and a level-up sound at the chest location.
//
// Performance:
//   - Sorting is optimized for large containers using preallocated arrays and efficient sorting.
//
// Permissions:
//   - Only players with the 'operator' tag can use /sortanywhere and /sortmode.
//
// See CATALOGUE.md for a full feature list and usage guide.

import {
  world,
  system,
  BlockComponentTypes,
  ItemStack,
} from "@minecraft/server";

const INV_ID = BlockComponentTypes.Inventory; // "minecraft:inventory"
let VERBOSE = true; // flip to false once you trust it, can be toggled by command
const log = (p, msg, c = "7") => VERBOSE && p.sendMessage(`§${c}${msg}`);

// Global flag to allow sorting without sneaking
let allowSortWithoutSneak = false;

// Sorting mode: 'alpha' (alphabetical), 'count' (by count), 'type' (by typeId)
let sortingMode = 'alpha';

// Helper to check if a player is an operator or in singleplayer
function isOperator(player) {
  // Singleplayer: only one player in the world
  try {
    if (world.getPlayers().length === 1) return true;
  } catch {}
  // Multiplayer: must be OP
  return typeof player.hasTag === 'function' && player.hasTag('operator');
}

// ───────── Event hook ────────────────────────────────────────────────────────
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!allowSortWithoutSneak && !ev.player.isSneaking) return; // Only require sneaking if not globally enabled
  // ev.cancel = true; // stop vanilla GUI from opening
  // Performance: batch system.run if many events (not needed for single chest, but ready for future multi-chest)
  system.run(() => sortContainer(ev.player, ev.block)); // run next tick
});

// Register commands for operators or singleplayer only
world.afterEvents.chatSend.subscribe(ev => {
  const msg = ev.message.trim();
  const sender = ev.sender;
  if (!sender || typeof sender.sendMessage !== 'function') return;

  // /sortanywhere command
  if (msg === "/sortanywhere") {
    if (!isOperator(sender)) {
      sender.sendMessage("§c[ChestSort] Only operators or singleplayer can use this command.");
      ev.cancel = true;
      return;
    }
    allowSortWithoutSneak = !allowSortWithoutSneak;
    world.sendMessage(`§e[ChestSort] Sorting without sneaking is now ${allowSortWithoutSneak ? "§aENABLED" : "§cDISABLED"}§e.`);
    ev.cancel = true;
    return;
  }

  // /sortmode <alpha|count|type>
  if (msg.startsWith("/sortmode ")) {
    if (!isOperator(sender)) {
      sender.sendMessage("§c[ChestSort] Only operators or singleplayer can use this command.");
      ev.cancel = true;
      return;
    }
    const mode = msg.split(" ")[1]?.toLowerCase();
    if (["alpha", "count", "type"].includes(mode)) {
      sortingMode = mode;
      world.sendMessage(`§e[ChestSort] Sorting mode set to §b${mode}§e.`);
    } else {
      sender.sendMessage("§c[ChestSort] Invalid mode. Use /sortmode alpha|count|type");
    }
    ev.cancel = true;
    return;
  }

  // /sortverbose <on|off>
  if (msg.startsWith("/sortverbose ")) {
    if (!isOperator(sender)) {
      sender.sendMessage("§c[ChestSort] Only operators or singleplayer can use this command.");
      ev.cancel = true;
      return;
    }
    const arg = msg.split(" ")[1]?.toLowerCase();
    if (arg === "on") {
      VERBOSE = true;
      world.sendMessage("§e[ChestSort] Verbose mode is now §aON§e.");
    } else if (arg === "off") {
      VERBOSE = false;
      world.sendMessage("§e[ChestSort] Verbose mode is now §cOFF§e.");
    } else {
      sender.sendMessage("§c[ChestSort] Invalid usage. Use /sortverbose on|off");
    }
    ev.cancel = true;
    return;
  }
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

  // Performance: Preallocate final array
  const final = new Array(size);
  let idx = 0;

  // Sorting modes
  let sortedKeys;
  if (sortingMode === 'count') {
    sortedKeys = [...merged.keys()].sort((a, b) => merged.get(b).qty - merged.get(a).qty || a.localeCompare(b));
  } else if (sortingMode === 'type') {
    sortedKeys = [...merged.keys()].sort((a, b) => merged.get(a).proto.typeId.localeCompare(merged.get(b).proto.typeId) || a.localeCompare(b));
  } else {
    // Default: alphabetical by key
    sortedKeys = [...merged.keys()].sort();
  }

  for (const k of sortedKeys) {
    const { proto, qty, max } = merged.get(k);
    let left = qty;
    while (left > 0 && idx < size) {
      const s = proto.clone();
      s.amount = Math.min(left, max);
      final[idx++] = s;
      left -= s.amount;
    }
  }
  while (idx < size) final[idx++] = null;

  // Write new order
  cont.clearAll();
  for (let i = 0; i < size; ++i) {
    const stk = final[i];
    if (stk) cont.setItem(i, stk);
  }

  // Visual feedback: particles and sound
  try {
    player.dimension.runCommandAsync(`particle minecraft:happy_villager ${clickedBlock.location.x + 0.5} ${clickedBlock.location.y + 1.2} ${clickedBlock.location.z + 0.5} 0.3 0.5 0.3 0 20`);
    player.dimension.runCommandAsync(`playsound random.levelup @a ${clickedBlock.location.x + 0.5} ${clickedBlock.location.y + 1.2} ${clickedBlock.location.z + 0.5} 1 1`);
  } catch (e) {}

  // Verify counts (ignore slot order)
  const after = snapshot(cont);
  const diffMsg = compareCounts(before, after);

  if (diffMsg) {
    log(player, `§c❌ Sorting failed – ${diffMsg}`);
    // Roll back
    cont.clearAll();
    for (let i = 0; i < size; ++i) {
      const stk = before[i];
      if (stk) cont.setItem(i, stk);
    }
  } else {
    log(player, `§aChest sorted! [mode: ${sortingMode}]`);
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
// Now uses canonical, order-independent serialization for potion effects and enchantments
function getStackKey(stk) {
  let key = `${stk.typeId}:${stk.data ?? 0}`;

  // Helper: canonicalize and sort arrays of objects by a key
  function canonicalArray(arr, sortKey) {
    if (!Array.isArray(arr)) return arr;
    return arr.slice().sort((a, b) => {
      if (a[sortKey] < b[sortKey]) return -1;
      if (a[sortKey] > b[sortKey]) return 1;
      return 0;
    });
  }

  // Helper: canonicalize objects recursively
  function sortObject(obj) {
    if (Array.isArray(obj)) return obj.map(sortObject);
    if (obj && typeof obj === "object") {
      return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = sortObject(obj[k]);
        return acc;
      }, {});
    }
    return obj;
  }

  // Special handling for potions, tipped arrows, suspicious stew
  if (["minecraft:potion","minecraft:splash_potion","minecraft:lingering_potion","minecraft:tipped_arrow","minecraft:suspicious_stew"].includes(stk.typeId)) {
    const pot = stk.getComponent("potion_effects") || stk.getComponent("minecraft:potion_effects");
    if (pot && Array.isArray(pot.effects)) {
      // Sort effects by effect id for canonical key
      const sorted = canonicalArray(pot.effects, "effect");
      key += ":pot=" + JSON.stringify(sorted);
    }
  }

  // Special handling for enchanted books and enchanted items
  if (stk.typeId === "minecraft:enchanted_book" || stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments")) {
    const ench = stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments");
    if (ench && Array.isArray(ench.enchantments)) {
      // Sort enchantments by id for canonical key
      const sorted = canonicalArray(ench.enchantments, "id");
      key += ":ench=" + JSON.stringify(sorted);
    }
  }

  // Fireworks
  if (stk.typeId === "minecraft:firework_rocket" || stk.typeId === "minecraft:firework_star") {
    const fw = stk.getComponent("fireworks") || stk.getComponent("minecraft:fireworks");
    if (fw) key += ":fw=" + JSON.stringify(sortObject(fw));
  }

  // Written books
  if (stk.typeId === "minecraft:writable_book" || stk.typeId === "minecraft:written_book") {
    const book = stk.getComponent("written_book_contents") || stk.getComponent("minecraft:written_book_contents");
    if (book) key += ":book=" + JSON.stringify(sortObject(book));
  }

  // Banners
  if (stk.typeId === "minecraft:banner") {
    const banner = stk.getComponent("banner_patterns") || stk.getComponent("minecraft:banner_patterns");
    if (banner) key += ":banner=" + JSON.stringify(sortObject(banner));
  }

  // Player heads
  if (stk.typeId === "minecraft:player_head") {
    const head = stk.getComponent("player_head_owner") || stk.getComponent("minecraft:player_head_owner");
    if (head) key += ":head=" + JSON.stringify(sortObject(head));
  }

  // Maps
  if (stk.typeId === "minecraft:map") {
    const map = stk.getComponent("map_id") || stk.getComponent("minecraft:map_id");
    if (map) key += ":map=" + JSON.stringify(sortObject(map));
  }

  // Shulker boxes
  if (stk.typeId.endsWith("shulker_box")) {
    const shulker = stk.getComponent("container") || stk.getComponent("minecraft:container");
    if (shulker) key += ":shulker=" + JSON.stringify(sortObject(shulker));
  }

  // Custom name and lore (for all items)
  const name = stk.getComponent("custom_name") || stk.getComponent("minecraft:custom_name");
  if (name) key += ":name=" + JSON.stringify(name);
  const lore = stk.getComponent("lore") || stk.getComponent("minecraft:lore");
  if (lore) key += ":lore=" + JSON.stringify(lore);

  return key;
}
