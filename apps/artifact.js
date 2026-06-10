/**
 * 圣遗物成长值面板插件
 *
 * 基于以下项目:
 * - miao-plugin: 面板渲染、圣遗物数据处理 (MIT License, Copyright (c) 2023 Yoimiya)
 * - liangshi-calc: 角色有效词条定义 (MIT License, Copyright (c) 2024 liangshi)
 *
 * 参考以上项目的圣遗物评分系统、有效词条定义及成长值逻辑
 */

import plugin from '../../../lib/plugins/plugin.js'
import fs from 'node:fs'
import path from 'node:path'

// ---- 静态数据 ----
// 这些从 miao-plugin 资源文件直接导入
const _cwd = process.cwd()
const _miaoPluginDir = path.resolve(_cwd, 'plugins/miao-plugin')

let _attrIdMap, _mainIdMap, _attrMap, _aliasData, _artiData, _mainAttrData
let _dataLoaded = false

async function loadStaticData () {
  if (_dataLoaded) return
  try {
    // 1. 圣遗物词条映射 (来自 miao-plugin)
    const extraMod = await import(
      pathToFileURL(path.join(_miaoPluginDir, 'resources/meta-gs/artifact/extra.js'))
    )
    _attrIdMap = extraMod.attrIdMap
    _mainIdMap = extraMod.mainIdMap
    _attrMap = extraMod.attrMap

    // 2. 圣遗物名称到套装/位置的映射
    const dataPath = path.join(_miaoPluginDir, 'resources/meta-gs/artifact/data.json')
    _artiData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    // 3. 角色别名 (来自 miao-plugin)
    const aliasMod = await import(
      pathToFileURL(path.join(_miaoPluginDir, 'resources/meta-gs/character/alias.js'))
    )
    _aliasData = aliasMod.alias

    // 4. 角色有效词条 (来自 liangshi-calc)
    const liangshiDir = path.resolve(_cwd, 'plugins/liangshi-calc')
    const mainAttrMod = await import(
      pathToFileURL(path.join(liangshiDir, 'damage/liangshi-gs/data/mainAttr.js'))
    )
    _mainAttrData = mainAttrMod.mainAttrData

    _dataLoaded = true
  } catch (e) {
    if (logger?.error) {
      logger.error('[artifacts-plugin] 加载静态数据失败:', e.message)
    }
  }
}

function pathToFileURL (p) {
  if (process.platform === 'win32') {
    p = p.replace(/\\/g, '/')
    if (!/^[a-zA-Z]:/.test(p)) p = '/' + p
    return 'file:///' + p
  }
  return 'file://' + p
}

// ---- 角色名解析 ----
async function resolveCharacter (nameInput) {
  await loadStaticData()
  if (!_aliasData) return nameInput
  for (const [key, aliases] of Object.entries(_aliasData)) {
    const aliasList = aliases.split(',')
    if (key === nameInput || aliasList.includes(nameInput)) {
      return key
    }
  }
  return nameInput
}

// ---- UID 解析 ----
async function resolveUid (e) {
  try {
    if (e.runtime?.getUid) {
      return await e.runtime.getUid()
    }
  } catch (_) { /* fallback */ }
  const match = e.msg?.match?.(/([1-9]\d{8})/)
  if (match) return match[1]
  return ''
}

// ---- 圣遗物图片查找 ----
function findArtifactImage (pieceName) {
  if (!_artiData || !pieceName) return ''
  for (const [setId, setData] of Object.entries(_artiData)) {
    if (!setData.idxs) continue
    for (const [pos, piece] of Object.entries(setData.idxs)) {
      if (piece.name === pieceName) {
        return `meta-gs/artifact/imgs/${setData.name}/${pos}.webp`
      }
    }
  }
  return ''
}

// ---- 主词条值计算 ----
function calcMainValue (mainKey, level, star) {
  const posEff = ['hpPlus', 'atkPlus', 'defPlus'].includes(mainKey) ? 2 : 1
  const starEff = { 1: 0.21, 2: 0.36, 3: 0.6, 4: 0.9, 5: 1 }
  const attrCfg = _attrMap[mainKey] || _attrMap['dmg'] || { value: 1 }
  return attrCfg.value * (1.2 + 0.34 * level) * posEff * (starEff[star || 5] || 1)
}

// ---- 格式化属性值 ----
function formatStatValue (key, value) {
  const cfg = _attrMap[key]
  if (!cfg) return String(Math.round(value * 100) / 100)
  if (cfg.format === 'pct') {
    return (value * 100).toFixed(1) + '%'
  } else if (cfg.format === 'comma') {
    return String(Math.round(value))
  }
  return String(Math.round(value * 100) / 100)
}

// ---- 副词条成长历史计算 ----
function calcSubstatHistory (attrIds) {
  if (!attrIds || attrIds.length === 0) return []

  const groups = {}
  const orderedKeys = []

  for (let i = 0; i < attrIds.length; i++) {
    const id = attrIds[i]
    const cfg = _attrIdMap[id]
    if (!cfg) continue
    const { key, value } = cfg
    if (!groups[key]) {
      groups[key] = { key, entries: [], total: 0 }
      orderedKeys.push(key)
    }
    groups[key].entries.push({ value, isInitial: i < 4 })
    groups[key].total += value
  }

  return orderedKeys.map(key => {
    const g = groups[key]
    const initialEntries = g.entries.filter(e => e.isInitial)
    const initialValue = initialEntries.reduce((sum, e) => sum + e.value, 0)
    const growthEntries = g.entries.filter(e => !e.isInitial)
    const totalValue = g.total

    return {
      key,
      initialValue,
      growthSteps: growthEntries.map(e => e.value),
      totalValue,
      hitCount: g.entries.length
    }
  })
}

// ---- 获取角色有效词条 ----
function getEffectiveStats (charName) {
  if (!_mainAttrData) return ['atk', 'cpct', 'cdmg']
  if (_mainAttrData[charName]) {
    return _mainAttrData[charName].split(',')
  }
  for (const key of Object.keys(_mainAttrData)) {
    if (key.startsWith(charName + '/')) {
      return _mainAttrData[key].split(',')
    }
  }
  return ['atk', 'cpct', 'cdmg']
}

// ---- 主词条中文名映射 ----
const mainKeyNameMap = {
  hpPlus: '生命值', hp: '生命值%', atkPlus: '攻击力', atk: '攻击力%',
  defPlus: '防御力', def: '防御力%', cpct: '暴击率', cdmg: '暴击伤害',
  mastery: '元素精通', recharge: '元素充能效率',
  pyro: '火伤加成', electro: '雷伤加成', cryo: '冰伤加成',
  hydro: '水伤加成', anemo: '风伤加成', geo: '岩伤加成', dendro: '草伤加成',
  dmg: '元素伤害加成', phy: '物理伤害加成', heal: '治疗加成'
}

const subKeyShortName = {
  hp: '大生命', hpPlus: '小生命', atk: '大攻击', atkPlus: '小攻击',
  def: '大防御', defPlus: '小防御', cpct: '暴击率', cdmg: '暴伤',
  mastery: '精通', recharge: '充能', dmg: '元素伤害', phy: '物伤', heal: '治疗'
}

const posNames = { 1: '生之花', 2: '死之羽', 3: '时之沙', 4: '空之杯', 5: '理之冠' }

// ---- 数据处理主函数 ----
async function processArtifacts (uid, charName) {
  await loadStaticData()

  // 1. 读取 PlayerData
  const playerDataPath = path.resolve(_cwd, 'data/PlayerData/gs', `${uid}.json`)
  if (!fs.existsSync(playerDataPath)) {
    return { error: `未找到UID ${uid} 的角色数据，请先使用【#更新面板】` }
  }

  let playerData
  try {
    playerData = JSON.parse(fs.readFileSync(playerDataPath, 'utf-8'))
  } catch (e) {
    return { error: `读取UID ${uid} 数据失败: ${e.message}` }
  }

  const avatars = playerData.avatars || {}

  // 2. 查找匹配的角色
  let matchedAvatar = null
  let matchedId = null
  for (const [id, avatar] of Object.entries(avatars)) {
    if (avatar.name === charName) {
      matchedAvatar = avatar; matchedId = id; break
    }
  }
  if (!matchedAvatar) {
    for (const [id, avatar] of Object.entries(avatars)) {
      const sn = avatar.name || ''
      if (sn.includes(charName) || charName.includes(sn)) {
        matchedAvatar = avatar; matchedId = id; break
      }
    }
  }
  if (!matchedAvatar) {
    const available = Object.values(avatars).map(a => a.name).filter(Boolean).join('、')
    return {
      error: `UID ${uid} 未找到角色「${charName}」的面板数据`,
      hint: available ? `当前可用角色：${available}` : '暂无任何角色数据，请先使用【#更新面板】'
    }
  }

  // 3. 圣遗物数据
  const artisData = matchedAvatar.artis || {}
  if (Object.keys(artisData).length === 0) {
    return { error: `角色「${charName}」暂无圣遗物数据` }
  }

  // 4. 有效词条定义
  const effectiveStats = getEffectiveStats(charName)

  // 5. 处理每个圣遗物
  const artisList = []
  for (let pos = 1; pos <= 5; pos++) {
    const arti = artisData[pos]
    if (!arti || !arti.name) {
      artisList.push({ pos, empty: true, posName: posNames[pos] || `位置${pos}` })
      continue
    }

    const { level = 0, star = 5, name, mainId, attrIds = [] } = arti

    // 主词条
    const mainKey = _mainIdMap[mainId] || '未知'
    const mainVal = calcMainValue(mainKey, level, star)

    // 副词条成长历史
    const subHistory = calcSubstatHistory(attrIds)

    // 当前词条数（升级次数）
    const upgradeCount = Math.max(0, attrIds.length - 4)

    // 有效词条数（升级中命中有效属性的次数）
    const upgrades = attrIds.slice(4)
    const effectiveCount = upgrades.filter(id => {
      const cfg = _attrIdMap[id]
      return cfg && effectiveStats.includes(cfg.key)
    }).length

    // 圣遗物图片
    const img = findArtifactImage(name)

    artisList.push({
      pos, empty: false, name, level, img,
      mainKey, mainValText: formatStatValue(mainKey, mainVal),
      mainKeyName: mainKeyNameMap[mainKey] || mainKey,
      subHistory, upgradeCount, effectiveCount,
      posName: posNames[pos] || `位置${pos}`
    })
  }

  return {
    uid, charName,
    playerName: playerData.name || '',
    charLevel: matchedAvatar.level || '',
    artisList,
    effectiveStats: effectiveStats.join('、')
  }
}

// ======================== Plugin Class ========================

export class artifactInitPanel extends plugin {
  constructor () {
    super({
      name: '圣遗物成长值面板',
      dsc: '展示角色圣遗物初始值及副词条成长历史',
      event: 'message',
      priority: 10,
      rule: [
        { reg: /^#([^#\s]+)圣遗物成长值面板$/, fnc: 'showArtifactInitPanel' }
      ]
    })
  }

  async showArtifactInitPanel () {
    const match = this.e.msg?.match?.(/^#([^#\s]+)圣遗物成长值面板$/)
    if (!match) return false
    const nameInput = match[1]

    // 1. 解析角色名
    const charName = await resolveCharacter(nameInput)
    if (!charName) {
      await this.e.reply('无法识别角色名，请检查输入格式，示例：#甘雨圣遗物成长值面板')
      return true
    }

    // 2. 解析 UID
    const uid = await resolveUid(this.e)
    if (!uid) {
      await this.e.reply('请先使用【#绑定+你的UID】来绑定查询目标')
      return true
    }

    // 3. 处理数据
    const result = await processArtifacts(uid, charName)
    if (result.error) {
      await this.e.reply(result.error + (result.hint ? '\n' + result.hint : ''))
      return true
    }

    // 4. 构建渲染数据
    const artisForTemplate = result.artisList.map(a => {
      if (a.empty) return { empty: true, posName: a.posName }
      return {
        ...a,
        subStats: a.subHistory.map(sh => {
          const totalText = formatStatValue(sh.key, sh.totalValue)
          const initialText = formatStatValue(sh.key, sh.initialValue)
          const growthTexts = sh.growthSteps.map(v => formatStatValue(sh.key, v))
          let formula
          if (sh.growthSteps.length > 0) {
            formula = initialText + '+' + growthTexts.join('+') + '=' + totalText
          } else {
            formula = initialText
          }
          return {
            key: sh.key,
            shortName: subKeyShortName[sh.key] || sh.key,
            formula,
            hitCount: sh.hitCount
          }
        })
      }
    })

    const renderData = {
      uid: result.uid,
      charName: result.charName,
      charLevel: result.charLevel,
      artis: artisForTemplate,
      effectiveStats: result.effectiveStats
    }

    // 5. 渲染
    try {
      const img = await this.e.runtime.render(
        'artifacts-plugin',
        'artifact-init/artifact-init',
        renderData,
        {
          retType: 'base64',
          beforeRender ({ data }) {
            const resPath = data.pluResPath || `../../../plugins/artifacts-plugin/resources/`
            return {
              ...data,
              _res_path: resPath,
              _miao_path: `../../../plugins/miao-plugin/resources/`,
              _layout_path: path.resolve(_miaoPluginDir, 'resources/common/layout/'),
              _tpl_path: path.resolve(_miaoPluginDir, 'resources/common/tpl/'),
              defaultLayout: path.resolve(_miaoPluginDir, 'resources/common/layout/default.html'),
              elemLayout: path.resolve(_miaoPluginDir, 'resources/common/layout/elem.html'),
              sys: { scale: 1.6 },
              copyright: `Created By Miao-Plugin & liangshi-calc · artifacts-plugin v1.0.8`
            }
          }
        }
      )
      if (img) {
        await this.e.reply(img)
      }
    } catch (err) {
      if (logger?.error) logger.error('[artifacts-plugin] 渲染失败:', err.message)
      await this.e.reply('图片生成失败: ' + err.message)
    }

    return true
  }
}
