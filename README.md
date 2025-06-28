# MCBedrockChestSortedOnSneakRightClick

Robust, cheat-free chest sorting for Minecraft Bedrock Dedicated Server (BDS) and single-player 1.21.90+.

## Features & Improvements

- **Sneak-Click Sorting:** Sneak (crouch) and right-click any inventory block (chest, barrel, etc.) to sort and stack its contents.
- **Global Sorting Toggle:** Operators can use `/sortanywhere` to allow sorting without sneaking.
- **Sorting Modes:** Operators can use `/sortmode <alpha|count|type>` to change sorting order:
  - `alpha`: Alphabetical (default)
  - `count`: By item count (descending)
  - `type`: By item typeId
- **Visual Feedback:** Sorting triggers happy villager particles and a level-up sound at the chest.
- **Performance Optimized:** Efficient array operations and preallocation for large containers.
- **Special Item Handling:** Correctly distinguishes potions, tipped arrows, suspicious stew, fireworks, books, banners, player heads, maps, enchanted books, shulker boxes, and any item with enchantments, custom names, or lore.
- **Rollback on Error:** If sorting fails (e.g., due to item loss), the chest is rolled back and a precise diff is shown.
- **Operator-Only Commands:** Only players with the `operator` tag can use `/sortanywhere` and `/sortmode`.

## Commands

### /sortanywhere
Toggles whether sneaking is required to trigger sorting. Only available to operators.

**Usage:**
```
/sortanywhere
```
Toggles between requiring sneaking and allowing sorting on any right-click.

### /sortmode <alpha|count|type>
Changes the sorting mode for all players. Only available to operators.

**Usage:**
```
/sortmode alpha   # Alphabetical (default)
/sortmode count   # By item count (descending)
/sortmode type    # By item typeId
```

## Visual Feedback
- Sorting a chest triggers happy villager particles and a level-up sound at the chest location.

## Permissions
- Only players with the `operator` tag can use `/sortanywhere` and `/sortmode`.

## Error Handling
- If sorting fails (e.g., due to item loss or mismatch), the chest is rolled back to its previous state and a detailed error is shown in chat.

## Performance
- Sorting is optimized for large containers using preallocated arrays and efficient sorting algorithms.

## Extending
- The script is designed to be maintainable and extensible. See `getStackKey` in `main.js` for how special items are handled.

---
For a full feature list and usage guide, see [CATALOGUE.md](./CATALOGUE.md).

## License

MIT
- Windows 10/11, Dedicated Server (BDS)
- Singleplayer + local multiplayer

---

## 📜 License

MIT License — use, modify, and share freely. Attribution appreciated!

---

## 💡 Idea by

@p99will — Minecraft tooling for builders, modders, and pack-makers.
