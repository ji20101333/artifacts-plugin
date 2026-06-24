# artifacts-plugin

[![Gitee](https://img.shields.io/badge/Gitee-artifacts--plugin-orange)](https://gitee.com/ji20101333/artifacts-plugin)
[![中文](https://img.shields.io/badge/README-中文-orange)](./README.md)
[![Version](https://img.shields.io/badge/version-1.12.13-brightgreen)]()

Artifact Growth Value Panel Plugin - Based on Miao-Yunzai (TRSS-Yunzai). Displays character artifact initial values and substat growth history.

**Author:** [@世奥致意](https://gitee.com/ji20101333)

---

## Features

### 1. Artifact Growth Value Panel

Command: `#<character>圣遗物成长值面板` (`<character>` is the character name, supports aliases)

Examples:
- `#甘雨圣遗物成长值面板`
- `#胡桃圣遗物成长值面板`
- `#雷电将军圣遗物成长值面板`

Returns an image showing the character panel and all artifact initial values and growth history:

- **Character Header**: Character splash art, UID, level, constellation, talent levels
- **Character Attribute Panel**: HP/ATK/DEF/EM/CR/CD/ER/DMG Bonus, with effective stat weights highlighted
- **Weapon Card**: Weapon icon, name, rarity, refinement rank, base ATK, secondary stat, weapon passive description
- **Artifacts**:
  - Artifact basic info
  - Substat growth history (format: `initial+first roll+...+last roll=final value`, compatible with both attrIds encoding formats)
  - Enhancement hit count (line break at ≥4 hits)
  - Initial substat count / Effective substat type count / Total roll count (3 significant figures)
- **Artifact Score & Rating** (referencing Miao-Plugin scoring and rating rules)
- **Effective Substat Summary Table**: Total effective substat count + per-substat count (based on liangshi-calc character effective stat definitions)

If no artifact data is bound to the character/UID, an appropriate error message is returned.

### 2. Artifact Scoring Formula

The scoring formula references [Miao-Plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git)'s `ArtisMark.js` / `ArtisMarkCfg.js`:

- **Core Principle**: `mark = weight / maxRollValue` — one max roll of a 100-weight stat = 100 raw points
- **Substat Score**: `Σ(mark × displayValue)`, accumulated per effective substat
- **Main Stat Score**: `mark × mainValue / 4` (positions 3-5 only)
- **fixPct**: `min(1, weight[mainStat] / maxWeightByPosition)`, penalizes non-standard main stats (e.g., ATK% goblet instead of Elemental DMG goblet)
- **Position Normalization**: `(mainScore + subScore) × (1 + fixPct) / 2 / posMaxMark × 66`
- **Character Adaptation**: Auto-loads character-specific weights (`artis.js`), weapon refinement bonuses, Emblem 4pc / Favonius and other set corrections

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

Commands: `#圣遗物成长值插件更新` / `#圣遗物成长值插件强制更新`

Performs `git pull` to update the plugin itself, and auto-restarts the Bot after a successful update.

- **Normal Update**: `git pull` fetches the latest code, displays version changes and recent update content
- **Force Update**: `git fetch + git reset --hard origin/master` forcefully syncs with the remote repository, discarding local changes

Bot master only.

---

## Installation

1. Ensure `Miao-Plugin` and `liangshi-calc` plugins are installed (as data dependencies)
2. Run the install command from the Yunzai-Bot root directory
3. Restart the Bot

```bash
git clone --depth=1 https://gitee.com/ji20101333/artifacts-plugin.git ./plugins/artifacts-plugin/
```

---

## Dependencies

- **TRSS-Yunzai** (Miao-Yunzai): Bot framework
- **Miao-Plugin**: Provides artifact stat mapping data, character base attributes, rendering infrastructure, UID binding queries
- **liangshi-calc**: Provides character effective stat definitions

---

## License

This project is licensed under the MIT License.

### Third-party Dependencies & Licenses

This plugin references and uses data from the following open-source projects:

- **[Miao-Plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git)** — MIT License, Copyright (c) 2023 Yoimiya
  - Artifact stat mapping data (`attrIdMap`, `mainIdMap`, `attrMap`)
  - Character alias data
  - Artifact scoring formula (`ArtisMark.js`, `ArtisMarkCfg.js`)
  - Rendering infrastructure

- **[liangshi-calc](https://gitee.com/liangshi233/liangshi-calc.git)** — MIT License, Copyright (c) 2024 liangshi
  - Character effective stat definitions (`mainAttr.js`)
  - Character effective stat weight references

All of the above projects are MIT-licensed, permitting free use, copying, modification, merging, publishing, distribution, sublicensing, and/or sale of copies, provided the original copyright notice and permission notice are retained.

This plugin is a non-commercial project for educational and communication purposes only.
