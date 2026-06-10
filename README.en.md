# artifacts-plugin

Artifact Initial Value Panel Plugin for Miao-Yunzai (TRSS-Yunzai). Displays character artifact initial values and substat growth history.

## Features

### 1. Artifact Initial Value Panel

Command: `#<character>圣遗物成长值面板`

Example: `#Ganyu圣遗物成长值面板`

Returns an image showing each artifact's initial values and growth history:
- Artifact icon + level
- Main stat
- Substat growth history (format: `initial+growth1+...+growthN=total`)
- Current substat count
- Effective substat count (based on liangshi-calc character definitions)

### 2. Plugin Update

Command: `#圣遗物成长值插件更新`

Performs `git pull` and auto-restarts the bot (following miao-plugin's update pattern). Bot master only.

## Dependencies

- miao-plugin (MIT, Copyright (c) 2023 Yoimiya)
- liangshi-calc (MIT, Copyright (c) 2024 liangshi)
- TRSS-Yunzai (Miao-Yunzai)

## License

MIT License. See LICENSE file for details.

This plugin references data from:
- [miao-plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git) - MIT License
- [liangshi-calc](https://gitee.com/liangshi233/liangshi-calc.git) - MIT License
