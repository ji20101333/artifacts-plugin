# artifacts-plugin

[![Gitee](https://img.shields.io/badge/Gitee-artifacts--plugin-orange)](https://gitee.com/ji20101333/artifacts-plugin)
[![中文](https://img.shields.io/badge/README-中文-orange)](./README.md)
[![Version](https://img.shields.io/badge/version-1.12.5-brightgreen)]()

Artifact Initial Value Panel Plugin for Miao-Yunzai (TRSS-Yunzai). Displays character artifact initial values and substat growth history.

**Author:** [@世奥致意](https://gitee.com/ji20101333)

---

## Features

### 1. Artifact Growth Panel

Command: `#<character>圣遗物成长值面板` (supports character aliases)

Examples:
- `#甘雨圣遗物成长值面板` (Ganyu)
- `#胡桃圣遗物成长值面板` (Hu Tao)
- `#雷电将军圣遗物成长值面板` (Raiden Shogun)

Returns an image showing the character's artifact set with detailed growth history:

- **Character Header**: Splash art, UID, level, constellation, talent levels
- **Attribute Panel**: HP/ATK/DEF/EM/CR/CD/ER/DMG totals (base + bonus), with effective stat weights highlighted (≥80 in gold)
- **Weapon Card**: Weapon icon, name, rarity, refinement rank, base ATK, secondary stat, passive description
- **Artifact Growth** (5 pieces, horizontal layout):
  - Artifact icon + level
  - Slot name + main stat name + main stat value
  - Substat growth history (format: `initial+roll1+...+rollN=total`)
  - Enhancement hit count (line break at ≥4 hits)
  - Initial count / effective count / total upgrade count
- **Artifact Score & Rating** (SSS/ACE/MAX, matching miao-plugin scoring formula)
- **Effective Substat Summary Table**: Total effective count + per-stat breakdown (based on liangshi-calc character definitions, only 7 actual substat types: ATK/HP/DEF/EM/ER/CR/CD)

If no artifact data is bound to the character/UID, an appropriate error message is returned.

### 2. Scoring Formula

Since v1.12.0, the scoring formula references [miao-plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git)'s `ArtisMark.js` / `ArtisMarkCfg.js`:

- **Core principle**: `mark = weight / maxRollValue` — one max roll of a 100-weight stat = 100 raw points
- **Substat score**: `Σ(mark × displayValue)` per effective substat
- **Main stat score**: `mark × mainValue / 4` (positions 3-5 only)
- **fixPct**: `min(1, weight[mainKey] / maxWeightByPos)` — penalizes off-piece main stats (e.g., ATK% goblet instead of Elemental DMG)
- **Position normalization**: `(mainScore + subScore) × (1 + fixPct) / 2 / posMaxMark × 66`
- **Character adaptation**: Auto-loads character-specific weights (`artis.js`), weapon refinement bonuses, and set bonuses (Emblem 4pc, Favonius, etc.)

**Rating Thresholds** (single piece → 5-piece total):

| Rating | Single | Total |
|--------|--------|-------|
| D      | < 7    | < 35  |
| C      | < 14   | < 70  |
| B      | < 21   | < 105 |
| A      | < 28   | < 140 |
| S      | < 35   | < 175 |
| SS     | < 42   | < 210 |
| SSS    | < 49   | < 245 |
| ACE    | < 56   | < 280 |
| MAX    | ≥ 56   | ≥ 280 |

### 3. Plugin Update

Commands: `#圣遗物成长值插件更新` (normal) / `#圣遗物成长值插件强制更新` (force)

Performs `git pull` and auto-restarts the bot after a successful update. Bot master only.

- **Normal update**: `git pull` latest code, shows version diff and recent changelog
- **Force update**: `git fetch + git reset --hard origin/master`, discards local changes

---

## Installation

1. Ensure `miao-plugin` and `liangshi-calc` are installed (data dependencies)
2. Run the install command from the Yunzai-Bot root directory
3. Restart the bot

```bash
git clone --depth=1 https://gitee.com/ji20101333/artifacts-plugin.git ./plugins/artifacts-plugin/
```

---

## Dependencies

- **miao-plugin**: Artifact stat mapping data, character base attributes, rendering infrastructure, UID binding queries
- **liangshi-calc**: Character effective stat definitions
- **TRSS-Yunzai** (Miao-Yunzai): Bot framework

---

## License

This project is licensed under the MIT License.

### Third-party Dependencies & Licenses

This plugin references and uses data from the following open-source projects:

- **[miao-plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git)** — MIT License, Copyright (c) 2023 Yoimiya
  - Artifact stat mapping data (`attrIdMap`, `mainIdMap`, `attrMap`)
  - Character alias data
  - Artifact scoring formula (`ArtisMark.js`, `ArtisMarkCfg.js`)
  - Rendering infrastructure

- **[liangshi-calc](https://gitee.com/liangshi233/liangshi-calc.git)** — MIT License, Copyright (c) 2024 liangshi
  - Character effective stat definitions (`mainAttr.js`)
  - Character effective stat weight references

All of the above projects are MIT-licensed, permitting free use, copying, modification, merging, publishing, distribution, sublicensing, and/or sale of copies, provided the original copyright notice and permission notice are retained.

This plugin is a non-commercial project for educational and communication purposes only.

---
