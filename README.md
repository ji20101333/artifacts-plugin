# artifacts-plugin

[![Gitee](https://img.shields.io/badge/Gitee-artifacts--plugin-orange)](https://gitee.com/ji20101333/artifacts-plugin)
[![English](https://img.shields.io/badge/README-English-blue)](./README.en.md)
[![Version](https://img.shields.io/badge/version-1.8.0-brightgreen)]()

圣遗物成长值面板插件 - 基于 Miao-Yunzai（TRSS-Yunzai），展示角色圣遗物初始值及副词条成长历史。

**作者：** [@世奥致意](https://gitee.com/ji20101333)

---

## 功能

### 1. 圣遗物成长值面板

指令：`#xx圣遗物成长值面板`（xx 为角色名，支持别名）

示例：
- `#甘雨圣遗物成长值面板`
- `#胡桃圣遗物成长值面板`
- `#雷电将军圣遗物成长值面板`

返回一张图片，展示角色所有圣遗物的初始值及成长历史：
- 圣遗物图标 + 等级
- 主词条
- 副词条成长历史（格式：`初始值+第一次成长+...+最后一次成长=最终值`）
- 当前词条数
- 总有效词条数（基于 liangshi-calc 的角色有效词条定义）

若无角色/UID 绑定的圣遗物数据，返回相应错误提示。

### 2. 插件更新

指令：`#圣遗物成长值插件更新` / `#圣遗物成长值插件强制更新`

执行 `git pull` 更新插件自身，更新成功后自动重启 Bot。

- **普通更新**：`git pull` 拉取最新代码，显示版本变化和最近更新内容
- **强制更新**：`git fetch + git reset --hard origin/master` 强制同步远程仓库，丢弃本地修改

仅 Bot 主人可用。

## 安装

1. 确保已安装 `miao-plugin` 和 `liangshi-calc` 插件（作为数据依赖）
2. 在 Yunzai-Bot 根目录下执行安装命令
3. 重启 Bot

```bash
git clone --depth=1 https://gitee.com/ji20101333/artifacts-plugin.git ./plugins/artifacts-plugin/
```

## 依赖

- **miao-plugin**：提供圣遗物词条映射数据、渲染基础设施、UID 绑定查询
- **liangshi-calc**：提供角色有效词条定义
- **TRSS-Yunzai**（Miao-Yunzai）：Bot 框架

## 许可证

本项目采用 MIT 许可证。

### 第三方依赖及许可证

本插件参考并使用了以下开源项目的数据：

- **[miao-plugin](https://gitcode.com/TimeRainStarSky/miao-plugin.git)** — MIT License, Copyright (c) 2023 Yoimiya
  - 圣遗物词条映射数据（`attrIdMap`、`mainIdMap`、`attrMap`）
  - 角色别名数据
  - 渲染基础设施

- **[liangshi-calc](https://gitee.com/liangshi233/liangshi-calc.git)** — MIT License, Copyright (c) 2024 liangshi
  - 角色有效词条定义（`mainAttr.js`）
  - 角色有效词条权重参考

以上项目均为 MIT 许可证，允许自由使用、复制、修改、合并、发布、分发、再许可和/或销售副本，但须保留原始版权声明和许可声明。

本插件为非商业项目，仅供学习交流使用。

---
