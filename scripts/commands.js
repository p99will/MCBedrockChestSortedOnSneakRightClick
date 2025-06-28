// commands.js – Handles chat commands and operator checks
import { world } from "@minecraft/server";
import { isOperator, log, VERBOSE, setVerbose } from "./utils.js";
import { sortingMode, setSortingMode } from "./sorter.js";

export let allowSortWithoutSneak = false;
export const setAllowSortWithoutSneak = (v) => { allowSortWithoutSneak = v; };

export function registerCommands(INV_ID) {
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
        setSortingMode(mode);
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
        setVerbose(true);
        world.sendMessage("§e[ChestSort] Verbose mode is now §aON§e.");
      } else if (arg === "off") {
        setVerbose(false);
        world.sendMessage("§e[ChestSort] Verbose mode is now §cOFF§e.");
      } else {
        sender.sendMessage("§c[ChestSort] Invalid usage. Use /sortverbose on|off");
      }
      ev.cancel = true;
      return;
    }
  });
}
