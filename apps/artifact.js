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
import { pathToFileURL } from 'node:url'

const _cwd = process.cwd()
const _miaoPluginDir = path.resolve(_cwd, 'plugins/miao-plugin')

// ---- 静态数据缓存 ----
let _attrIdMap, _mainIdMap, _attrMap, _aliasData, _artiData, _mainAttrData
let _charMeta = {}      // character data.json keyed by numeric ID
let _weaponById = {}    // weapon data keyed by numeric ID
let _weaponByName = {}  // weapon data keyed by name
let _dataLoaded = false

async function loadStaticData () {
  if (_dataLoaded) return
  try {
    // 1. 圣遗物词条映射
    const extraMod = await import(
      pathToFileURL(path.join(_miaoPluginDir, 'resources/meta-gs/artifact/extra.js'))
    )
    _attrIdMap = extraMod.attrIdMap
    _mainIdMap = extraMod.mainIdMap
    _attrMap = extraMod.attrMap

    // 2. 圣遗物名称映射
    const dataPath = path.join(_miaoPluginDir, 'resources/meta-gs/artifact/data.json')
    _artiData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    // 3. 角色别名
    const aliasMod = await import(
      pathToFileURL(path.join(_miaoPluginDir, 'resources/meta-gs/character/alias.js'))
    )
    _aliasData = aliasMod.alias

    // 4. 角色有效词条
    const liangshiDir = path.resolve(_cwd, 'plugins/liangshi-calc')
    const mainAttrMod = await import(
      pathToFileURL(path.join(liangshiDir, 'damage/liangshi-gs/data/mainAttr.js'))
    )
    _mainAttrData = mainAttrMod.mainAttrData

    // 5. 加载角色元数据 (按数字ID索引)
    _charMeta = {}
    const charMetaPath = path.join(_miaoPluginDir, 'resources/meta-gs/character/data.json')
    if (fs.existsSync(charMetaPath)) {
      _charMeta = JSON.parse(fs.readFileSync(charMetaPath, 'utf-8'))
    }

    // 6. 加载武器数据 (按ID & 名称索引)
    _weaponById = {}
    _weaponByName = {}
    const weaponDir = path.join(_miaoPluginDir, 'resources/meta-gs/weapon')
    const weaponTypes = fs.readdirSync(weaponDir).filter(f => {
      return fs.statSync(path.join(weaponDir, f)).isDirectory()
    })
    for (const wt of weaponTypes) {
      const typeDataPath = path.join(weaponDir, wt, 'data.json')
      if (fs.existsSync(typeDataPath)) {
        const typeData = JSON.parse(fs.readFileSync(typeDataPath, 'utf-8'))
        for (const [id, wData] of Object.entries(typeData)) {
          if (wData.name) {
            _weaponById[id] = { ...wData, _type: wt }
            _weaponByName[wData.name] = { ...wData, _type: wt }
          }
        }
      }
    }

    _dataLoaded = true
  } catch (e) {
    if (logger?.error) {
      logger.error('[artifacts-plugin] 加载静态数据失败:', e.message)
    }
  }
}

// ---- 角色查找辅助 ----
function findCharMetaByName (charName) {
  for (const [id, meta] of Object.entries(_charMeta)) {
    if (meta.name === charName) return meta
  }
  return null
}

function findCharMetaById (charId) {
  return _charMeta[String(charId)] || null
}

function getCharElement (charName) {
  const meta = findCharMetaByName(charName)
  return meta?.elem || 'hydro'
}

function getCharImage (charName, type = 'splash') {
  const imgPath = path.join(_miaoPluginDir, 'resources/meta-gs/character', charName, 'imgs', `${type}.webp`)
  if (fs.existsSync(imgPath)) {
    return `meta-gs/character/${charName}/imgs/${type}.webp`
  }
  const sidePath = path.join(_miaoPluginDir, 'resources/meta-gs/character', charName, 'imgs', 'side.webp')
  if (fs.existsSync(sidePath)) {
    return `meta-gs/character/${charName}/imgs/side.webp`
  }
  return ''
}

// ---- 天赋图标查找 ----
function getTalentIcons (charName, talentIds) {
  const icons = {}
  const iconsDir = path.join(_miaoPluginDir, 'resources/meta-gs/character', charName, 'icons')
  // 尝试从角色icons目录获取
  for (const [key, tid] of Object.entries(talentIds)) {
    const iconPath = path.join(iconsDir, `talent-${key}.webp`)
    if (fs.existsSync(iconPath)) {
      icons[key] = `meta-gs/character/${charName}/icons/talent-${key}.webp`
    } else {
      icons[key] = ''
    }
  }
  return icons
}

// ---- 武器数据查找 ----
function findWeaponData (weaponName) {
  // 首先按名称精确匹配
  if (_weaponByName[weaponName]) return _weaponByName[weaponName]

  // 模糊匹配
  for (const [name, data] of Object.entries(_weaponByName)) {
    if (name.includes(weaponName) || weaponName.includes(name)) {
      return data
    }
  }
  return null
}

function getWeaponImage (weaponData) {
  if (!weaponData || !weaponData._type) return ''
  const imgPath = path.join(_miaoPluginDir, 'resources/meta-gs/weapon',
    weaponData._type, weaponData.name, 'imgs', 'awaken.webp')
  if (fs.existsSync(imgPath)) {
    return `meta-gs/weapon/${weaponData._type}/${weaponData.name}/imgs/awaken.webp`
  }
  // fallback
  const fPath = path.join(_miaoPluginDir, 'resources/meta-gs/weapon',
    weaponData._type, weaponData.name, 'imgs', 'icon.webp')
  if (fs.existsSync(fPath)) {
    return `meta-gs/weapon/${weaponData._type}/${weaponData.name}/imgs/icon.webp`
  }
  return ''
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
// 返回展示量级的数值 (如 46.62 for ATK% = 46.6%)
function calcMainValue (mainKey, level, star) {
  const posEff = ['hpPlus', 'atkPlus', 'defPlus'].includes(mainKey) ? 2 : 1
  const starEff = { 1: 0.21, 2: 0.36, 3: 0.6, 4: 0.9, 5: 1 }
  const attrCfg = _attrMap[mainKey] || _attrMap['dmg'] || { value: 1 }
  return attrCfg.value * (1.2 + 0.34 * level) * posEff * (starEff[star || 5] || 1)
}

// ---- 获取属性的标准化值 (十进制, 可与副词条累加) ----
// 百分比属性: calcMainValue 返回展示量级 (46.62=46.6%), 需除以100转为十进制
// 数值属性: 保持原值
function getNormalizedValue (key, displayValue) {
  const cfg = _attrMap[key]
  if (cfg?.format === 'pct') {
    return displayValue / 100
  }
  return displayValue
}

// ---- 属性值格式化 ----
function formatSubValue (key, value) {
  const cfg = _attrMap[key]
  if (!cfg) return String(Math.round(value * 100) / 100)
  if (cfg.format === 'pct') {
    return (value * 100).toFixed(1) + '%'
  } else if (cfg.format === 'comma') {
    return String(Math.round(value))
  }
  return String(Math.round(value * 100) / 100)
}

// ---- 主词条值格式化 (calcMainValue 已返回展示量级的百分比值, 不可再乘100) ----
function formatMainValue (key, value) {
  const cfg = _attrMap[key]
  if (!cfg) return String(Math.round(value * 100) / 100)
  if (cfg.format === 'pct') {
    // calcMainValue 已经返回展示量级 (如 46.62 = 46.6%)
    return value.toFixed(1) + '%'
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
    const initialVal = g.entries.filter(e => e.isInitial).reduce((s, e) => s + e.value, 0)
    const growthSteps = g.entries.filter(e => !e.isInitial).map(e => e.value)

    return {
      key, initialValue: initialVal,
      growthSteps, totalValue: g.total,
      hitCount: g.entries.length
    }
  })
}

// ---- 获取角色有效词条 ----
function getEffectiveStats (charName) {
  if (!_mainAttrData) return ['atk', 'cpct', 'cdmg']
  if (_mainAttrData[charName]) return _mainAttrData[charName].split(',')
  for (const key of Object.keys(_mainAttrData)) {
    if (key.startsWith(charName + '/')) return _mainAttrData[key].split(',')
  }
  return ['atk', 'cpct', 'cdmg']
}

// ---- 属性名称映射 ----
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

const statLabelMap = {
  hp: '生命值', atk: '攻击力', def: '防御力', mastery: '元素精通',
  cpct: '暴击率', cdmg: '暴击伤害', recharge: '元素充能', dmg: '伤害加成'
}

const posNames = { 1: '生之花', 2: '死之羽', 3: '时之沙', 4: '空之杯', 5: '理之冠' }

// ---- 主处理函数 ----
async function processArtifacts (uid, charName) {
  await loadStaticData()

  const playerDataPath = path.resolve(_cwd, 'data/PlayerData/gs', `${uid}.json`)
  if (!fs.existsSync(playerDataPath)) {
    return { error: `未找到UID ${uid} 的角色数据，请先使用【#更新面板】` }
  }

  let playerData
  try { playerData = JSON.parse(fs.readFileSync(playerDataPath, 'utf-8')) } catch (e) {
    return { error: `读取UID ${uid} 数据失败: ${e.message}` }
  }

  const avatars = playerData.avatars || {}

  // ---- 查找匹配角色 ----
  let matchedAvatar = null
  for (const [id, avatar] of Object.entries(avatars)) {
    if (avatar.name === charName) { matchedAvatar = avatar; break }
  }
  if (!matchedAvatar) {
    for (const [id, avatar] of Object.entries(avatars)) {
      if ((avatar.name || '').includes(charName) || charName.includes(avatar.name || '')) {
        matchedAvatar = avatar; break
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

  // ---- 角色基础信息 ----
  const elem = matchedAvatar.elem || getCharElement(charName) || 'hydro'
  const charSplash = getCharImage(charName, 'splash') || getCharImage(charName, 'gacha') || ''
  const charSide = getCharImage(charName, 'side') || getCharImage(charName, 'face') || ''
  const charMeta = findCharMetaByName(charName)

  // ---- 角色基础属性 (来自meta) ----
  const baseAttr = charMeta?.baseAttr || { hp: 10000, atk: 200, def: 600 }

  // ---- 天赋数据 ----
  const talents = matchedAvatar.talent || {}
  const talentMap = { a: '普攻', e: '战技', q: '爆发' }
  let talentIds = {}
  let talentIcons = {}
  if (charMeta?.talentId) {
    // talentId is like {"10024": "a", "10018": "e", "10019": "q"}
    for (const [tid, key] of Object.entries(charMeta.talentId)) {
      talentIds[key] = tid
    }
    talentIcons = getTalentIcons(charName, talentIds)
  }

  // ---- 武器数据 ----
  const weaponRaw = matchedAvatar.weapon || {}
  const weaponMeta = findWeaponData(weaponRaw.name)
  let weaponInfo = null
  if (weaponMeta && weaponRaw.name) {
    const levelKey = String(weaponRaw.level || 1)
    const wAttr = weaponMeta.attr || {}
    // 基础攻击力 (在武器数据中键名为 'atk')
    const wBaseAtk = (wAttr.atk && wAttr.atk[levelKey]) ? wAttr.atk[levelKey] : 0
    // 副词缀
    const bonusKey = wAttr.bonusKey || ''
    const bonusVal = (wAttr.bonusData && wAttr.bonusData[levelKey]) ? wAttr.bonusData[levelKey] : 0
    // 精炼文本
    const affixText = weaponMeta.affixData?.text || ''
    const affixDatas = weaponMeta.affixData?.datas || {}
    const affix = weaponRaw.affix || 1
    // 展开精炼数值
    let desc = affixText
    if (affixDatas['0'] && affixDatas['1']) {
      desc = affixText
        .replace('$[0]', affixDatas['0'][affix - 1] || affixDatas['0'][0] || '')
        .replace('$[1]', affixDatas['1'][affix - 1] || affixDatas['1'][0] || '')
    }
    weaponInfo = {
      name: weaponMeta.name,
      level: weaponRaw.level || 1,
      affix,
      star: weaponMeta.star || 5,
      img: getWeaponImage(weaponMeta),
      baseAtk: wBaseAtk,
      bonusKey,
      bonusVal,
      bonusKeyName: statLabelMap[bonusKey] || bonusKey,
      desc,
      type: weaponMeta._type || ''
    }
  }

  // ---- 圣遗物处理 ----
  const artisData = matchedAvatar.artis || {}
  if (Object.keys(artisData).length === 0) {
    return { error: `角色「${charName}」暂无圣遗物数据` }
  }

  const effectiveStats = getEffectiveStats(charName)

  // 汇总圣遗物词条贡献 (用于角色面板数值)
  const artiStatTotals = {}  // key -> {mainSum, subSum}
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

    // 累加主词条到汇总 (使用标准化值, 与副词条同量纲)
    if (!artiStatTotals[mainKey]) artiStatTotals[mainKey] = { mainSum: 0, subSum: 0 }
    artiStatTotals[mainKey].mainSum += getNormalizedValue(mainKey, mainVal)

    // 副词条
    const subHistory = calcSubstatHistory(attrIds)
    for (const sh of subHistory) {
      if (!artiStatTotals[sh.key]) artiStatTotals[sh.key] = { mainSum: 0, subSum: 0 }
      artiStatTotals[sh.key].subSum += sh.totalValue
    }

    // 升级次数 & 有效词条数
    const upgradeCount = Math.max(0, attrIds.length - 4)
    const upgrades = attrIds.slice(4)
    const effectiveCount = upgrades.filter(id => {
      const cfg = _attrIdMap[id]
      return cfg && effectiveStats.includes(cfg.key)
    }).length

    const img = findArtifactImage(name)

    artisList.push({
      pos, empty: false, name, level, star, img,
      mainKey, mainValText: formatMainValue(mainKey, mainVal),
      mainKeyName: mainKeyNameMap[mainKey] || mainKey,
      subHistory, upgradeCount, effectiveCount,
      posName: posNames[pos] || `位置${pos}`
    })
  }

  // ---- 构建角色面板数值 ----
  // 辅助函数: 获取属性汇总 (decimal scale)
  const getStatTotal = (key) => {
    const t = artiStatTotals[key] || { mainSum: 0, subSum: 0 }
    return t.mainSum + t.subSum
  }

  // 角色基础值
  const charBaseHp = baseAttr.hp || 0
  const charBaseAtk = baseAttr.atk || 0
  const charBaseDef = baseAttr.def || 0
  const weaponBaseAtk = weaponInfo?.baseAtk || 0

  // 圣遗物贡献
  const artiFlatHp = getStatTotal('hpPlus')    // flat HP (comma scale)
  const artiHpPct = getStatTotal('hp')          // HP% (decimal scale)
  const artiFlatAtk = getStatTotal('atkPlus')   // flat ATK (comma scale)
  const artiAtkPct = getStatTotal('atk')        // ATK% (decimal scale)
  const artiFlatDef = getStatTotal('defPlus')   // flat DEF (comma scale)
  const artiDefPct = getStatTotal('def')        // DEF% (decimal scale)

  // 计算实际面板值
  const hpBaseDisplay = charBaseHp
  const hpPlusVal = artiFlatHp + (charBaseHp * artiHpPct)
  const hpTotal = hpBaseDisplay + hpPlusVal

  const atkBaseDisplay = charBaseAtk + weaponBaseAtk
  const atkPlusVal = artiFlatAtk + ((charBaseAtk + weaponBaseAtk) * artiAtkPct)
  const atkTotal = atkBaseDisplay + atkPlusVal

  const defBaseDisplay = charBaseDef
  const defPlusVal = artiFlatDef + (charBaseDef * artiDefPct)
  const defTotal = defBaseDisplay + defPlusVal

  // 权重计算 (基于有效词条)
  const weightMap = {}
  for (const es of effectiveStats) { weightMap[es] = 100 }

  // 构建展示属性列表
  const charStats = [
    {
      key: 'hp', label: '生命值',
      base: String(Math.round(hpBaseDisplay)),
      plus: '+' + String(Math.round(hpPlusVal)),
      total: String(Math.round(hpTotal)),
      weight: weightMap['hp'] || 0,
      isEffective: !!weightMap['hp'], showWeight: false
    },
    {
      key: 'atk', label: '攻击力',
      base: String(Math.round(atkBaseDisplay)),
      plus: '+' + String(Math.round(atkPlusVal)),
      total: String(Math.round(atkTotal)),
      weight: weightMap['atk'] || 0,
      isEffective: !!weightMap['atk'], showWeight: false
    },
    {
      key: 'def', label: '防御力',
      base: String(Math.round(defBaseDisplay)),
      plus: '+' + String(Math.round(defPlusVal)),
      total: String(Math.round(defTotal)),
      weight: weightMap['def'] || 0,
      isEffective: !!weightMap['def'], showWeight: false
    },
    {
      key: 'mastery', label: '元素精通',
      base: '0',
      plus: '+' + String(Math.round(getStatTotal('mastery'))),
      total: String(Math.round(getStatTotal('mastery'))),
      weight: weightMap['mastery'] || 0,
      isEffective: !!weightMap['mastery'], showWeight: true
    },
    {
      key: 'cpct', label: '暴击率',
      base: '5.0%',
      plus: '+' + (getStatTotal('cpct') * 100).toFixed(1) + '%',
      total: (5 + getStatTotal('cpct') * 100).toFixed(1) + '%',
      weight: weightMap['cpct'] || 0,
      isEffective: !!weightMap['cpct'], showWeight: true
    },
    {
      key: 'cdmg', label: '暴击伤害',
      base: '50.0%',
      plus: '+' + (getStatTotal('cdmg') * 100).toFixed(1) + '%',
      total: (50 + getStatTotal('cdmg') * 100).toFixed(1) + '%',
      weight: weightMap['cdmg'] || 0,
      isEffective: !!weightMap['cdmg'], showWeight: true
    },
    {
      key: 'recharge', label: '元素充能',
      base: '100.0%',
      plus: '+' + (getStatTotal('recharge') * 100).toFixed(1) + '%',
      total: (100 + getStatTotal('recharge') * 100).toFixed(1) + '%',
      weight: weightMap['recharge'] || 0,
      isEffective: !!weightMap['recharge'], showWeight: true
    },
    {
      key: 'dmg', label: '伤害加成',
      base: '0.0%',
      plus: '+' + (getStatTotal('dmg') * 100).toFixed(1) + '%',
      total: (getStatTotal('dmg') * 100).toFixed(1) + '%',
      weight: weightMap['dmg'] || 0,
      isEffective: !!weightMap['dmg'], showWeight: false
    }
  ]

  // 检查是否有元素/物理伤害加成替代 dmg
  const dmgKeys = ['pyro', 'hydro', 'anemo', 'electro', 'cryo', 'geo', 'dendro', 'phy']
  for (const dk of dmgKeys) {
    const dkTotal = getStatTotal(dk)
    if (dkTotal > 0) {
      charStats.push({
        key: dk, label: mainKeyNameMap[dk] || dk,
        base: '0.0%',
        plus: '+' + (dkTotal * 100).toFixed(1) + '%',
        total: (dkTotal * 100).toFixed(1) + '%',
        weight: weightMap[dk] || 0,
        isEffective: false, showWeight: false
      })
    }
  }

  return {
    uid, charName, playerName: playerData.name || '',
    charLevel: matchedAvatar.level || '',
    elem, charSplash, charSide,
    talents, talentMap, talentIcons,
    baseAttr: { hp: baseAttr.hp, atk: baseAttr.atk + (weaponInfo?.baseAtk || 0), def: baseAttr.def },
    weaponInfo,
    charStats,
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

    const charName = await resolveCharacter(nameInput)
    if (!charName) {
      await this.e.reply('无法识别角色名，请检查输入格式，示例：#甘雨圣遗物成长值面板')
      return true
    }

    const uid = await resolveUid(this.e)
    if (!uid) {
      await this.e.reply('请先使用【#绑定+你的UID】来绑定查询目标')
      return true
    }

    const result = await processArtifacts(uid, charName)
    if (result.error) {
      await this.e.reply(result.error + (result.hint ? '\n' + result.hint : ''))
      return true
    }

    // 构建模板数据
    const artisForTemplate = result.artisList.map(a => {
      if (a.empty) return { empty: true, posName: a.posName }
      return {
        ...a,
        subStats: a.subHistory.map(sh => {
          const totalText = formatSubValue(sh.key, sh.totalValue)
          const initialText = formatSubValue(sh.key, sh.initialValue)
          const growthTexts = sh.growthSteps.map(v => formatSubValue(sh.key, v))
          const formula = sh.growthSteps.length > 0
            ? initialText + '+' + growthTexts.join('+') + '=' + totalText
            : initialText
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
      elem: result.elem,
      charSplash: result.charSplash,
      charSide: result.charSide,
      talents: result.talents,
      talentMap: result.talentMap,
      talentIcons: result.talentIcons,
      baseAttr: result.baseAttr,
      weaponInfo: result.weaponInfo,
      charStats: result.charStats,
      artis: artisForTemplate,
      effectiveStats: result.effectiveStats
    }

    try {
      const img = await this.e.runtime.render(
        'artifacts-plugin',
        'artifact-init/artifact-init',
        renderData,
        {
          retType: 'base64',
          beforeRender ({ data }) {
            return {
              ...data,
              sys: { scale: 1.6, ...(data.sys || {}) },
              copyright: `Created By Miao-Plugin & liangshi-calc · artifacts-plugin v1.3.0`
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
