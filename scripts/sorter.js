// sorter.js – Main sorting logic and helpers
import { log } from "./utils.js";

export let sortingMode = 'alpha';
export const setSortingMode = (mode) => { sortingMode = mode; };

// Main sorter
export function sortContainer(player, clickedBlock, INV_ID) {
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

// Helpers
export function snapshot(container) {
  return Array.from({ length: container.size }, (_, i) =>
    container.getItem(i)?.clone() || null
  );
}

export function compareCounts(before, after) {
  const tally = new Map();
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
export function getStackKey(stk) {
  let key = `${stk.typeId}:${stk.data ?? 0}`;
  function canonicalArray(arr, sortKey) {
    if (!Array.isArray(arr)) return arr;
    return arr.slice().sort((a, b) => {
      if (a[sortKey] < b[sortKey]) return -1;
      if (a[sortKey] > b[sortKey]) return 1;
      return 0;
    });
  }
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
  if (["minecraft:potion","minecraft:splash_potion","minecraft:lingering_potion","minecraft:tipped_arrow","minecraft:suspicious_stew"].includes(stk.typeId)) {
    const pot = stk.getComponent("potion_effects") || stk.getComponent("minecraft:potion_effects");
    if (pot && Array.isArray(pot.effects)) {
      const sorted = canonicalArray(pot.effects, "effect");
      key += ":pot=" + JSON.stringify(sorted);
    }
  }
  if (stk.typeId === "minecraft:enchanted_book" || stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments")) {
    const ench = stk.getComponent("enchantments") || stk.getComponent("minecraft:enchantments");
    if (ench && Array.isArray(ench.enchantments)) {
      const sorted = canonicalArray(ench.enchantments, "id");
      key += ":ench=" + JSON.stringify(sorted);
    }
  }
  if (stk.typeId === "minecraft:firework_rocket" || stk.typeId === "minecraft:firework_star") {
    const fw = stk.getComponent("fireworks") || stk.getComponent("minecraft:fireworks");
    if (fw) key += ":fw=" + JSON.stringify(sortObject(fw));
  }
  if (stk.typeId === "minecraft:writable_book" || stk.typeId === "minecraft:written_book") {
    const book = stk.getComponent("written_book_contents") || stk.getComponent("minecraft:written_book_contents");
    if (book) key += ":book=" + JSON.stringify(sortObject(book));
  }
  if (stk.typeId === "minecraft:banner") {
    const banner = stk.getComponent("banner_patterns") || stk.getComponent("minecraft:banner_patterns");
    if (banner) key += ":banner=" + JSON.stringify(sortObject(banner));
  }
  if (stk.typeId === "minecraft:player_head") {
    const head = stk.getComponent("player_head_owner") || stk.getComponent("minecraft:player_head_owner");
    if (head) key += ":head=" + JSON.stringify(sortObject(head));
  }
  if (stk.typeId === "minecraft:map") {
    const map = stk.getComponent("map_id") || stk.getComponent("minecraft:map_id");
    if (map) key += ":map=" + JSON.stringify(sortObject(map));
  }
  if (stk.typeId.endsWith("shulker_box")) {
    const shulker = stk.getComponent("container") || stk.getComponent("minecraft:container");
    if (shulker) key += ":shulker=" + JSON.stringify(sortObject(shulker));
  }
  const name = stk.getComponent("custom_name") || stk.getComponent("minecraft:custom_name");
  if (name) key += ":name=" + JSON.stringify(name);
  const lore = stk.getComponent("lore") || stk.getComponent("minecraft:lore");
  if (lore) key += ":lore=" + JSON.stringify(lore);
  return key;
}
