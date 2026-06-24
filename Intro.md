# artifacts-plugin 架构说明

## 概述

圣遗物成长值面板插件，基于 Miao-Yunzai（TRSS-Yunzai）Bot 框架，用于展示角色圣遗物的**初始值**及**副词条成长历史**。

**作者：** [@世奥致意](https://gitee.com/ji20101333)

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **运行时** | Node.js（ES Module，`"type": "module"`） |
| **Bot 框架** | TRSS-Yunzai / Miao-Yunzai（QQ Bot 框架） |
| **模板引擎** | 类 art-template 语法（`{{extend}}`、`{{block}}`、`{{each}}`），由 miao-plugin 提供 |
| **渲染输出** | HTML + CSS → Puppeteer 截图 → PNG 图片 |
| **数据来源** | Enka.Network / Mihomo API（通过 miao-plugin 的 `#更新面板` 指令获取） |
| **版本控制** | Git，托管于 [Gitee](https://gitee.com/ji20101333/artifacts-plugin) |
| **包管理** | 无外部 npm 依赖（`dependencies: {}`），完全依赖 miao-plugin 和 liangshi-calc |

---

## 目录结构

```
artifacts-plugin/
├── index.js                          # 插件入口：动态加载 apps/ 下所有 JS，初始化 & 重启消息检测
├── package.json                      # 版本号、元信息
├── LICENSE                           # MIT 许可证
├── README.md / README.en.md          # 双语文档
├── Intro.md                          # 本文件：架构说明
├── apps/
│   ├── artifact.js                   # 核心逻辑（~1600 行，单文件）
│   └── update.js                     # 自更新指令（git pull / force update）
├── resources/
│   └── artifact-init/
│       ├── artifact-init.html        # 面板 HTML 模板（art-template 语法）
│       └── artifact-init.css         # 面板样式（参考 miao-plugin profile-detail.css）
└── memory/                           # Claude Code 持久记忆文件
    └── MEMORY.md
```

---

## 核心架构

### 请求流程

```
用户发送 QQ 消息
    ↓
Miao-Yunzai Bot 框架（message 事件分发）
    ↓
plugin 基类正则匹配 → artifactInitPanel.showArtifactInitPanel()
    ↓
┌─ processArtifacts(uid, charName) ──────────────────────────────┐
│                                                                │
│  1. 读取玩家数据                                                 │
│     PlayerData/{uid}.json  ←  Mihomo API 返回的圣遗物数据        │
│                                                                │
│  2. 加载静态元数据                                               │
│     miao-plugin/resources/meta-gs/                             │
│     ├── character/{name}/data.json   — 角色属性曲线 + 突破加成   │
│     ├── artifact/extra.js            — 词条 ID → key/value 映射  │
│     ├── artifact/artis-mark.js       — 角色有效词条权重           │
│     ├── artifact/calc.js             — 圣遗物套装 Buff           │
│     ├── weapon/index.js              — 武器 Buff 配置            │
│     └── character/alias.js           — 角色别名映射               │
│                                                                │
│  3. _getAdjustedWeights()                                       │
│     ─ 加载角色专属 artis.js（如有）                               │
│     ─ 武器精炼加成（磐岩结绿→生命, 薙刀→充能, 护摩→生命）         │
│     ─ 套装修正（绝缘4→充能, 西风→暴击100）                        │
│                                                                │
│  4. _buildCharMarkTable()                                       │
│     ─ 普通词条: mark = weight / maxRollValue                    │
│     ─ 小词条:   mark = weight / pctMaxRoll / (base+520) × 100   │
│     ─ fixWeight: 用于 posMaxMark 计算                            │
│                                                                │
│  5. calcSubstatHistory(attrIds)                                 │
│     ─ 将 attrIds 数组还原为初始值 + 成长步骤                      │
│     ─ 兼容两种编码格式（顺序式 / 分组式）                          │
│                                                                │
│  6. 逐件圣遗物评分                                               │
│     ─ subScore = Σ(mark × displayValue)                        │
│     ─ mainScore = mark × mainValue / 4                         │
│     ─ fixPct = min(1, weight[mainKey] / maxWeightByPos)        │
│     ─ score = (mainScore + subScore) × (1+fixPct) / 2          │
│              / posMaxMark × 66                                  │
│                                                                │
│  7. 构建面板数据                                                 │
│     ─ 角色属性: hp/atk/def/mastery/cpct/cdmg/recharge/dmg      │
│     ─ 武器详情: 名称/星级/精炼/基础攻击/副词条/特效               │
│     ─ 有效词条汇总表: 7 类副词条分类计数                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
    ↓
模板数据注入 → artifact-init.html（art-template 渲染为 HTML）
    ↓
Puppeteer 截图（miao-plugin 的 elemLayout 渲染管道）
    ↓
返回图片 Buffer → Bot 发送 QQ 图片消息给用户
```

---

## 关键模块详解

### index.js — 插件入口

- 使用 `Promise.allSettled` 动态 `import()` `apps/` 目录下所有 JS 文件
- 将导出的 class 按文件名注册到 `apps` 对象，供 Bot 框架加载
- `init()` 函数在启动时执行，通过 Redis 检测是否有重启后待发送的通知消息

### apps/artifact.js — 核心逻辑

**数据加载（`loadStaticData`）**

所有静态数据在首次请求时加载并缓存到模块级变量：
- `_attrIdMap`：6 位数字 ID → `{key, value}` 映射（如 `501064` → `{key: 'cdmg', value: 0.0544}`）
- `_mainIdMap`：主词条 ID → key 映射
- `_attrMap`：词条属性配置（标题、格式化方式）
- `_usefulAttr`：角色有效词条权重（从 artis-mark.js 加载）
- `_avgRollValue`：每种词条的平均成长值（用于词条数计算）
- `_weaponBuffs`：武器特效静态 Buff 配置
- `_artiBuffs`：圣遗物套装 Buff 配置

**角色解析（`resolveCharacter`）**

支持别名、简称、模糊匹配 → 返回 miao-plugin 标准角色名

**UID 解析（`resolveUid`）**

优先级：`#绑定xxx` 的红包数据 → Redis → profileDB → 私聊绑定

**AttrData 属性计算器**

模拟 miao-plugin 的 `Attr.js` 属性系统：
- `createAttrData()`：创建 `{_attr, _base}` 结构
- `addAttr(ctx, key, val, isBase)`：添加属性值，自动拆解 Base/Plus/Pct 后缀
- `getAttr(ctx, key)`：计算属性总值
- `getBase(ctx, key)`：获取基础值（白值）

**calcSubstatHistory**

将 `attrIds` 数组还原为副词条成长历史。兼容两种编码格式：
- **格式1**（顺序式）：前 4 个 = 初始值，后续 = 成长值
- **格式2**（分组式）：每种副词条的值分组排列，每组首次 = 初始值

返回：`[{key, initialValue, growthSteps, totalValue, hitCount}]`

**评分系统**

完全参考 miao-plugin 的 `ArtisMark.js` + `ArtisMarkCfg.js`：
- `mark = weight / maxRollValue`（核心原理：权重 100 的词条一次最大强化 = 100 原始分）
- 小词条（小攻击/小生命/小防御）的 mark 经过等效百分比转换
- `posMaxMark`：每个部位的理论最高分（最佳主词条 ×2 + 最佳副词条 ×6 + ...）
- `fixPct`：主词条适配惩罚（如攻击杯而非元素杯则打折）
- 充能沙漏 fixPct 恒为 1（特殊规则）
- 攻/生/防主词条权重 ≥75 时 fixPct 恒为 1（特殊规则）

### apps/update.js — 自更新

- `git pull` 拉取最新代码 → 显示版本变化和更新日志 → 重启 Bot
- `git fetch + git reset --hard origin/master` 强制同步 → 丢弃本地修改 → 重启
- 更新前将通知消息存入 Redis，重启后由 `index.js` 的 `init()` 发送

### resources/artifact-init/ — 渲染模板

**artifact-init.html**

继承 miao-plugin 的 `elemLayout` 模板，包含以下区域：
- 角色头部区（立绘、UID、等级、命座、天赋等级）
- 角色属性面板（8 项属性：白值+绿值，标注有效词条权重）
- 武器卡片（图标、名称、星级、精炼、基础攻击、副词条、特效描述）
- 圣遗物成长值（5 部位横向排列，显示初始值+成长历史）
- 有效词条汇总表（7 类副词条分类计数）

**artifact-init.css**

参考 miao-plugin 的 `profile-detail.css`，复用其 CSS 变量体系（`--bg-color` 等），保持视觉风格一致。

---

## 数据流与协议

| 环节 | 协议/格式 |
|------|-----------|
| 用户输入 | QQ 消息文本，正则匹配 `#xx圣遗物成长值面板` |
| 角色数据 | Mihomo API JSON（`data/PlayerData/gs/{uid}.json`），由 miao-plugin 的 `#更新面板` 获取 |
| 静态元数据 | 文件系统读取（JSON），来自 miao-plugin 的 `resources/meta-gs/` |
| 模板渲染 | art-template 语法，注入数据后生成 HTML 字符串 |
| 图片输出 | miao-plugin 的 Puppeteer 截图管道 → PNG Buffer → QQ 图片消息 |
| 插件更新 | `git` CLI（HTTPS）→ `child_process.exec` 执行 → 进程重启 |
| 重启通知 | Redis（`artifacts:restart-msg` key）→ 启动时检测并发送私聊消息 |

---

## 依赖关系

```
artifacts-plugin
  │
  ├── miao-plugin（必须）
  │   ├── resources/meta-gs/character/*/data.json  — 角色属性曲线 + 突破加成 (growAttr)
  │   ├── resources/meta-gs/artifact/extra.js       — 词条 ID → key/value 映射 (attrIdMap)
  │   ├── resources/meta-gs/artifact/artis-mark.js  — 角色有效词条权重 (usefulAttr)
  │   ├── resources/meta-gs/artifact/calc.js        — 圣遗物套装 Buff 配置
  │   ├── resources/meta-gs/weapon/index.js         — 武器 Buff 配置
  │   ├── models/artis/ArtisMark.js                 — 评分公式（参考实现）
  │   ├── models/artis/ArtisMarkCfg.js              — 权重调整逻辑（参考实现）
  │   └── 渲染基础设施（Puppeteer + art-template + elemLayout）
  │
  ├── liangshi-calc（必须）
  │   └── 角色有效词条定义（mainAttr.js）
  │
  └── TRSS-Yunzai / Miao-Yunzai（Bot 框架）
      ├── lib/plugins/plugin.js                     — plugin 基类
      ├── lib/common/common.js                      — 消息发送
      └── lib/puppeteer.js                          — 截图渲染
```

---

## 设计理念

artifacts-plugin 本质上是 **miao-plugin 圣遗物面板的一个"成长历史视图"**：

1. **复用而非重造**：数据层（词条映射、属性曲线）和渲染管道（模板引擎、Puppeteer）完全复用 miao-plugin，仅在其上层新增"成长历史还原"和"初始值展示"逻辑
2. **公式对齐**：评分公式严格参考 miao-plugin，确保同一圣遗物在两个插件中评分一致
3. **零外部依赖**：`package.json` 中 `dependencies: {}`，所有功能通过读取 miao-plugin 的文件系统和复用其基础设施实现
4. **单文件核心**：除入口和更新指令外，~1600 行的核心逻辑集中在 `apps/artifact.js`，便于维护

---

## 版本历史

| 版本 | 关键变更 |
|------|----------|
| v1.12.0 | 照搬 miao-plugin 评分公式重写评分系统 |
| v1.12.1 | 修正 fixPct 三处偏差 |
| v1.12.2 | 从角色独立 data.json 加载 baseAttr（修复小攻击评分偏高） |
| v1.12.3 | 照搬武器/套装权重调整（修复评分偏差） |
| v1.12.4 | 加载 artis.js 角色专属规则，全面公式对齐校验 |
| v1.12.5 | 修复 posMaxMark 平局决胜逻辑（`>` → `>=`） |
| v1.12.6 | 修复 attrIds 格式2 解析（分组排列兼容） |
| v1.12.7 | 修复角色突破属性未计入基础值（白值） |
| v1.12.10 | 修复 getEffectiveStats fallback — 从 artis-mark.js 补充有效词条 |
| v1.12.9 | 强制红框内词条统计不换行显示 |
| v1.12.8 | 总词条数保留三位有效数字 |

---

## 许可证

MIT License · Copyright (c) 2026 世奥致意
