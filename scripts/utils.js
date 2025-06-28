// utils.js – Utility functions for ChestSort
import { world } from "@minecraft/server";

export let VERBOSE = true;
export const setVerbose = (v) => { VERBOSE = v; };
export const log = (p, msg, c = "7") => VERBOSE && p.sendMessage(`§${c}${msg}`);

// Helper to check if a player is an operator or in singleplayer
export function isOperator(player) {
  try {
    if (world.getPlayers().length === 1) return true;
  } catch {}
  return typeof player.hasTag === 'function' && player.hasTag('operator');
}
