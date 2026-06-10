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
let _attrIdMap, _mainIdMap, _attrMap, _aliasData, _artiData, _mainAttrData, _usefulAttr
let _avgRollValue = {}   // 每个属性词条的平均成长值 (展示量级)
let _artiBuffs = {}     // artifact set buff configs from calc.js
let _pieceToSet = {}    // artifact piece name → set name mapping
let _charMeta = {}      // character data.json keyed by numeric ID
let _weaponById = {}    // weapon data keyed by numeric ID
let _weaponByName = {}  // weapon data keyed by name
let _weaponBuffs = {}   // weapon buff/passive configs from calc.js
let _dataLoaded = false

// ---- 武器 Buff 辅助函数 (照搬 miao-plugin resources/meta-gs/weapon/index.js) ----
// step(start, _step): 生成 6 元素的精炼数组 [r1..r5 + 1]
function step (start, _step = 0) {
  if (!_step) { _step = start / 4 }
  let ret = []
  for (let idx = 0; idx <= 5; idx++) {
    ret.push(start + _step * idx)
  }
  return ret
}
// staticStep(key, start, _step): 创建 isStatic 类型的 buff 条目
function staticStep (key, start, _step) {
  let refine = {}
  refine[key] = step(start, _step)
  return { title: `${key}提高[${key}]`, isStatic: true, refine }
}

// _applySetBuffs(ctx, buff, charElem): 应用圣遗物套装静态 Buff (照搬 miao-plugin Attr.setArtisAttr)
// 仅处理 isStatic=true 的 buff; 检查 elem 限制; 应用 data 值
function _applySetBuffs (ctx, buff, charElem) {
  const buffsArr = Array.isArray(buff) ? buff : [buff]
  for (const b of buffsArr) {
    if (!b || typeof b !== 'object' || !b.isStatic) continue
    if (b.elem && b.elem !== charElem) continue
    if (b.data) {
      for (const [key, val] of Object.entries(b.data)) {
        addAttr(ctx, key, val)
      }
    }
  }
}

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

    // 1.1 计算每个属性词条的平均成长值 (用于新词条数算法)
    // 使用 _attrMap 的 value/valueMin (5★最大/最小值) 取中点 = 四档均值
    // 不可从 _attrIdMap 取全量平均 (含1-4星低值, 会严重拉低)
    _avgRollValue = {}
    for (const [key, cfg] of Object.entries(_attrMap)) {
      if (cfg.value && cfg.valueMin) {
        _avgRollValue[key] = (cfg.value + cfg.valueMin) / 2
      }
    }

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

    // 5. 加载圣遗物评分权重 (照搬 miao-plugin artis-mark.js → usefulAttr)
    const artisMarkPath = path.join(_miaoPluginDir, 'resources/meta-gs/artifact/artis-mark.js')
    if (fs.existsSync(artisMarkPath)) {
      const artisMarkMod = await import(pathToFileURL(artisMarkPath))
      _usefulAttr = artisMarkMod.usefulAttr || {}
    } else {
      _usefulAttr = {}
    }

    // 6. 加载圣遗物套装 Buff (照搬 miao-plugin meta-gs/artifact/calc.js)
    const artiCalcPath = path.join(_miaoPluginDir, 'resources/meta-gs/artifact/calc.js')
    if (fs.existsSync(artiCalcPath)) {
      const artiCalcMod = await import(pathToFileURL(artiCalcPath))
      _artiBuffs = artiCalcMod.default || artiCalcMod.buffs || {}
    } else {
      _artiBuffs = {}
    }
    // 构建 piece name → set name 映射 (用于判断圣遗物所属套装)
    _pieceToSet = {}
    for (const [setId, setData] of Object.entries(_artiData)) {
      if (!setData.idxs || !setData.name) continue
      for (const [pos, piece] of Object.entries(setData.idxs)) {
        if (piece.name) _pieceToSet[piece.name] = setData.name
      }
    }

    // 7. 加载角色元数据 (按数字ID索引)
    _charMeta = {}
    const charMetaPath = path.join(_miaoPluginDir, 'resources/meta-gs/character/data.json')
    if (fs.existsSync(charMetaPath)) {
      _charMeta = JSON.parse(fs.readFileSync(charMetaPath, 'utf-8'))
    }

    // 8. 加载武器数据 (按ID & 名称索引)
    // 类型级 data.json (如 sword/data.json): 仅有 id/name/star — 用于获取武器列表
    // 单个武器 data.json (如 sword/雾切之回光/data.json): 有完整的 attr/bonusKey/bonusData/affixData
    _weaponById = {}
    _weaponByName = {}
    const weaponDir = path.join(_miaoPluginDir, 'resources/meta-gs/weapon')
    const weaponTypes = fs.readdirSync(weaponDir).filter(f => {
      return fs.statSync(path.join(weaponDir, f)).isDirectory()
    })
    for (const wt of weaponTypes) {
      const typeDir = path.join(weaponDir, wt)
      // 先读类型级汇总文件获取全量武器列表
      const typeDataPath = path.join(typeDir, 'data.json')
      const typeData = fs.existsSync(typeDataPath)
        ? JSON.parse(fs.readFileSync(typeDataPath, 'utf-8'))
        : {}
      // 建立 name → typeLevelInfo 的快速查找
      const typeInfoByName = {}
      for (const [, wData] of Object.entries(typeData)) {
        if (wData.name) typeInfoByName[wData.name] = wData
      }
      // 遍历子目录读取单个武器的详细数据
      let entries = []
      try { entries = fs.readdirSync(typeDir, { withFileTypes: true }) } catch (_) {}
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const detailPath = path.join(typeDir, entry.name, 'data.json')
        if (!fs.existsSync(detailPath)) continue
        try {
          const detailData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'))
          if (detailData.name) {
            const typeInfo = typeInfoByName[detailData.name] || {}
            const merged = { ...typeInfo, ...detailData, _type: wt }
            _weaponById[detailData.id] = merged
            _weaponByName[detailData.name] = merged
          }
        } catch (_) { /* 跳过解析失败的文件 */ }
      }
      // 补充仅存在于类型级但无详细数据的武器 (如 1-2 星武器)
      for (const [id, wData] of Object.entries(typeData)) {
        if (wData.name && !_weaponById[id]) {
          _weaponById[id] = { ...wData, _type: wt }
          _weaponByName[wData.name] = { ...wData, _type: wt }
        }
      }
    }

    // 9. 加载武器特效 Buff 配置 (照搬 miao-plugin resources/meta-gs/weapon/index.js)
    // 每个武器类型的 calc.js 导出 function(step, staticStep) → { 武器名: buffConfig }
    _weaponBuffs = {}
    const weaponTypeList = ['sword', 'claymore', 'polearm', 'bow', 'catalyst']
    for (const wt of weaponTypeList) {
      try {
        const calcPath = path.join(_miaoPluginDir, 'resources/meta-gs/weapon', wt, 'calc.js')
        if (!fs.existsSync(calcPath)) continue
        const calcMod = await import(pathToFileURL(calcPath))
        if (calcMod.default && typeof calcMod.default === 'function') {
          const typeBuffs = calcMod.default(step, staticStep)
          if (typeBuffs && typeof typeBuffs === 'object') {
            Object.assign(_weaponBuffs, typeBuffs)
          }
        }
      } catch (_) { /* calc.js 加载失败则跳过该类型 */ }
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

// ---- 角色详细属性加载 (照搬 miao-plugin Character.getDetail) ----
let _charDetailCache = {}
function loadCharDetailAttr (charName) {
  if (_charDetailCache[charName]) return _charDetailCache[charName]
  try {
    const detailPath = path.join(_miaoPluginDir, 'resources/meta-gs/character', charName, 'data.json')
    if (fs.existsSync(detailPath)) {
      const detailData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'))
      _charDetailCache[charName] = detailData.attr || null
      return _charDetailCache[charName]
    }
    // 尝试旅行者
    for (const elem of ['anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro']) {
      const travelerPath = path.join(_miaoPluginDir, 'resources/meta-gs/character', `旅行者/${elem}`, 'data.json')
      if (fs.existsSync(travelerPath)) {
        const td = JSON.parse(fs.readFileSync(travelerPath, 'utf-8'))
        if (td.attr) {
          _charDetailCache[`旅行者/${elem}`] = td.attr
        }
      }
    }
    return null
  } catch (e) {
    return null
  }
}

// ---- 判断元素属性键 (照搬 miao-plugin Format.isElem) ----
const _elemKeys = ['pyro', 'hydro', 'anemo', 'electro', 'cryo', 'geo', 'dendro', 'phy']
function isElemKey (key) {
  return _elemKeys.includes(key)
}

// ---- 天赋图标查找 (照搬 miao-plugin CharImg.getImgs) ----
function getTalentIcons (charName, talentIds, weaponType) {
  const icons = {}
  const charBase = `meta-gs/character/${charName}`
  const iconsDir = path.join(_miaoPluginDir, 'resources', charBase, 'icons')
  // talent-a: 使用武器类型图标 (照搬 miao-plugin: imgs.a = /common/item/atk-${weaponType}.webp)
  icons.a = `common/item/atk-${weaponType || 'sword'}.webp`
  // talent-e / talent-q: 角色专属天赋图标
  for (const key of ['e', 'q']) {
    const talentPath = path.join(iconsDir, `talent-${key}.webp`)
    if (fs.existsSync(talentPath)) {
      icons[key] = `${charBase}/icons/talent-${key}.webp`
    } else {
      // fallback: 尝试命之座图标 (照搬 miao-plugin)
      for (let ci = 1; ci <= 6; ci++) {
        const consPath = path.join(iconsDir, `cons-${ci}.webp`)
        if (fs.existsSync(consPath)) {
          icons[key] = `${charBase}/icons/cons-${ci}.webp`
          break
        }
      }
      if (!icons[key]) icons[key] = ''
    }
  }
  // 命座图标 (照搬 miao-plugin CharImg.getImgs)
  for (let i = 1; i <= 6; i++) {
    const consPath = path.join(iconsDir, `cons-${i}.webp`)
    if (fs.existsSync(consPath)) {
      icons[`cons${i}`] = `${charBase}/icons/cons-${i}.webp`
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
  const basePath = path.join(_miaoPluginDir, 'resources/meta-gs/weapon',
    weaponData._type, weaponData.name)
  // 武器图片直接在武器目录下 (非 imgs/ 子目录)
  for (const imgName of ['awaken.webp', 'icon.webp']) {
    const imgPath = path.join(basePath, imgName)
    if (fs.existsSync(imgPath)) {
      return `meta-gs/weapon/${weaponData._type}/${weaponData.name}/${imgName}`
    }
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

// ---- 格式化函数 (照搬 miao-plugin Format.comma / Format.pct) ----
function formatComma (num, fix = 0) {
  num = parseFloat((num * 1).toFixed(fix))
  let [integer, decimal] = String.prototype.split.call(num, '.')
  integer = integer.replace(/\d(?=(\d{3})+$)/g, '$&,')
  return fix > 0 ? `${integer}.${(decimal || '0'.repeat(fix))}` : integer
}
function formatPct (num, fix = 1) {
  return (num * 1).toFixed(fix) + '%'
}

// ---- AttrData 式属性计算 (照搬 miao-plugin models/attr/AttrData.js) ----
const _baseAttrKeys = ['atk', 'def', 'hp', 'mastery', 'recharge', 'cpct', 'cdmg', 'dmg', 'phy', 'heal', 'shield', 'coloringDmg']
const _attrReg = new RegExp(`^(${_baseAttrKeys.join('|')})(Base|Plus|Pct)$`)

function createAttrData () {
  const _attr = {}
  const _base = {}
  for (const key of _baseAttrKeys) {
    _attr[key] = { base: 0, plus: 0, pct: 0 }
    _base[key] = 0
  }
  return { _attr, _base }
}

/**
 * 添加属性值 (照搬 miao-plugin AttrData.addAttr)
 * @param {Object} ctx - {_attr, _base}
 * @param {string} key - 属性key，支持 Base/Pct/Plus 后缀
 * @param {number} val - 数值
 * @param {boolean} isBase - 是否计入基准值
 */
function addAttr (ctx, key, val, isBase = false) {
  const { _attr, _base } = ctx
  // 基础属性直接作为plus添加
  if (_baseAttrKeys.includes(key)) {
    _attr[key].plus += val * 1
    if (isBase) {
      _base[key] = (_base[key] || 0) + val * 1
    }
    return true
  }
  // 带后缀的属性 (xxxBase / xxxPct / xxxPlus)
  const match = _attrReg.exec(key)
  if (match && match[1] && match[2]) {
    const baseKey = match[1]
    const subKey = match[2].toLowerCase()
    _attr[baseKey][subKey] = (_attr[baseKey][subKey] || 0) + val * 1
    if (subKey === 'base' || isBase) {
      _base[baseKey] = (_base[baseKey] || 0) + val * 1
    }
    return true
  }
  return false
}

/**
 * 计算属性总值 (照搬 miao-plugin AttrData._get)
 * 公式: base × (1 + pct/100) + plus
 */
function getAttr (ctx, key) {
  const { _attr } = ctx
  if (_baseAttrKeys.includes(key)) {
    const a = _attr[key]
    return a.base * (1 + a.pct / 100) + a.plus
  }
  const match = _attrReg.exec(key)
  if (match && match[1] && match[2]) {
    const baseKey = match[1]
    const subKey = match[2].toLowerCase()
    return _attr[baseKey][subKey] || 0
  }
  return 0
}

function getBase (ctx, key) {
  return ctx._base[key] || 0
}

/**
 * 计算单条圣遗物词缀 (照搬 miao-plugin Attr.calcArtisAttr)
 * value 应为展示量级 (如 cpct: 3.9=3.9%, atk: 5.83=5.83%)
 * 主词条 calcMainValue / 副词条 toDisplayValue 已统一转为展示量级
 */
function calcArtisAttr (ctx, key, value, charElem) {
  if (!key) return
  // 元素伤害映射
  if (isElemKey(key)) {
    if (charElem === key) {
      key = 'dmg'
    } else if (['electro', 'pyro', 'hydro', 'cryo'].includes(key)) {
      key = 'coloringDmg'
    }
  }
  if (!key) return
  // 百分比攻击/生命/防御 → 添加 Pct 后缀
  if (['atk', 'hp', 'def'].includes(key)) {
    key = key + 'Pct'
  }
  addAttr(ctx, key, value * 1)
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

// ---- 将 attrIdMap 的十进制值转为展示量级 (照搬 miao-plugin ArtisAttr.getAttr) ----
// attrIdMap 中的 value 为十进制 (如 cpct: 0.039 = 3.9%, atk: 0.0583 = 5.83%)
// 百分比属性需 ×100 转为展示量级 (如 3.9, 5.83), 数值属性保持原值
// 武器 bonusData / 圣遗物主词条 calcMainValue 已为展示量级, 无需转换
function toDisplayValue (key, decimalValue) {
  const cfg = _attrMap[key]
  if (cfg?.format === 'pct') {
    return decimalValue * 100
  }
  return decimalValue
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

// 武器副词缀显示名映射 (照搬 miao-plugin)
const weaponAttrTitleMap = {
  atkPct: '攻击', mastery: '精通', dmg: '伤害', hpPct: '生命', defPct: '防御',
  cpct: '暴击', cdmg: '爆伤', phy: '物伤', recharge: '充能', heal: '治疗', shield: '护盾'
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
    talentIcons = getTalentIcons(charName, talentIds, charMeta?.weapon)
  }

  // ---- 武器数据 ----
  const weaponRaw = matchedAvatar.weapon || {}
  const weaponMeta = findWeaponData(weaponRaw.name)
  let weaponInfo = null
  if (weaponMeta && weaponRaw.name) {
    const wLevel = weaponRaw.level || 1
    const wPromote = weaponRaw.promote || 0
    // 突破等级key: 突破后等级为 20+, 40+, 50+, 60+, 70+, 80+ (照搬 miao-plugin)
    const ascBoundaries = [20, 40, 50, 60, 70, 80]
    const levelKey = (wPromote > 0 && ascBoundaries.includes(wLevel)) ? `${wLevel}+` : String(wLevel)

    const wAttr = weaponMeta.attr || {}
    // 基础攻击力 (在武器数据中键名为 'atk')
    const wBaseAtk = (wAttr.atk && wAttr.atk[levelKey]) ? wAttr.atk[levelKey] : 0
    // 副词缀 (bonusData 值为展示量级, 如 cpct: 22.05=22.05%, mastery: 165.38=165)
    const bonusKey = wAttr.bonusKey || ''
    const bonusVal = (wAttr.bonusData && wAttr.bonusData[levelKey]) ? wAttr.bonusData[levelKey] : 0

    // 精炼文本
    const affixText = weaponMeta.affixData?.text || ''
    const affixDatas = weaponMeta.affixData?.datas || {}
    const affix = weaponRaw.affix || 1
    // 展开精炼数值 (照搬 miao-plugin Weapon.getAffixDesc: while 循环替换所有 $[N])
    let desc = affixText
    const reg = /\$\[(\d)\]/g
    let match
    while ((match = reg.exec(desc)) !== null) {
      const idx = match[1]
      const value = affixDatas[idx]?.[affix - 1] || affixDatas[idx]?.[0] || ''
      desc = desc.replaceAll(match[0], value)
    }

    // 武器星级文本
    const starText = '★'.repeat(weaponMeta.star || 5)

    weaponInfo = {
      name: weaponMeta.name,
      sName: weaponMeta.name,
      level: wLevel,
      promote: wPromote,
      ascLevel: (wPromote > 0 && ascBoundaries.includes(wLevel)) ? `${wLevel}+` : String(wLevel),
      affix,
      star: weaponMeta.star || 5,
      starText,
      img: getWeaponImage(weaponMeta),
      baseAtk: wBaseAtk,
      bonusKey,
      bonusVal,
      bonusKeyName: weaponAttrTitleMap[bonusKey] || statLabelMap[bonusKey] || bonusKey,
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

  // ---- 初始化属性计算器 (照搬 miao-plugin Attr.calc) ----
  const attrCtx = createAttrData()

  // 角色基础值 (照搬 miao-plugin Attr.calc → setCharAttr)
  const charLevel = matchedAvatar.level || 1
  const charCons = matchedAvatar.cons || 0
  const charPromote = calcPromoteLevel(charLevel)
  const charDetailAttr = loadCharDetailAttr(charName)

  if (charDetailAttr) {
    const { keys, details } = charDetailAttr
    const lvStep = [1, 20, 40, 50, 60, 70, 80, 90, 100]
    let lvLeft = 0, lvRight = 0
    let currPromote = 0
    for (let idx = 0; idx < lvStep.length - 1; idx++) {
      if (currPromote === charPromote) {
        if (charLevel >= lvStep[idx] && charLevel <= lvStep[idx + 1]) {
          lvLeft = lvStep[idx]; lvRight = lvStep[idx + 1]; break
        }
      }
      currPromote++
    }
    const detailLeft = details[lvLeft + '+'] || details[lvLeft] || {}
    const detailRight = details[lvRight] || {}

    const getLvData = (idx, step = false) => {
      const vl = detailLeft[idx], vr = detailRight[idx]
      if (!step) {
        return vl * 1 + ((vr - vl) * (charLevel - lvLeft) / (lvRight - lvLeft))
      } else {
        return vl * 1 + ((vr - vl) * Math.floor((charLevel - lvLeft) / 5) / Math.round((lvRight - lvLeft) / 5))
      }
    }

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = getLvData(i, !/hp|atk|def/.test(k.replace('Base', '')) && k !== 'hpBase' && k !== 'atkBase' && k !== 'defBase')
      // 角色突破属性 (如 cdmg, cpct, dmg 等) 不加 isBase=true
      addAttr(attrCtx, k, v, /Base$/.test(k))
    }
  } else {
    // fallback: 使用 meta 中的 baseAttr (1级数值)
    const baseHp = charMeta?.baseAttr?.hp || 10000
    const baseAtk = charMeta?.baseAttr?.atk || 200
    const baseDef = charMeta?.baseAttr?.def || 600
    addAttr(attrCtx, 'hpBase', baseHp, true)
    addAttr(attrCtx, 'atkBase', baseAtk, true)
    addAttr(attrCtx, 'defBase', baseDef, true)
  }

  // 基础值: 充能100%, 暴击5%, 暴伤50% (照搬 miao-plugin)
  addAttr(attrCtx, 'recharge', 100, true)
  addAttr(attrCtx, 'cpct', 5, true)
  addAttr(attrCtx, 'cdmg', 50, true)

  // 武器属性 (照搬 miao-plugin Attr.setWeaponAttr)
  if (weaponInfo) {
    addAttr(attrCtx, 'atkBase', weaponInfo.baseAtk)
    if (weaponInfo.bonusKey) {
      addAttr(attrCtx, weaponInfo.bonusKey, weaponInfo.bonusVal)
    }

    // 武器特效静态 Buff (照搬 miao-plugin Attr.setWeaponAttr → Meta.getMeta('gs','weapon'))
    // 仅处理 isStatic=true 的 buff, 不处理非静态 buff (data函数/条件型)
    const wBuffs = _weaponBuffs[weaponInfo.name] || []
    const wBuffsArr = Array.isArray(wBuffs) ? wBuffs : [wBuffs]
    const affix = weaponInfo.affix || 1
    for (const buff of wBuffsArr) {
      if (!buff || typeof buff !== 'object' || !buff.isStatic) continue
      if (buff.refine) {
        for (const [key, r] of Object.entries(buff.refine)) {
          if (Array.isArray(r)) {
            addAttr(attrCtx, key, r[affix - 1] * (buff.buffCount || 1))
          }
        }
      }
    }
  }

  // 圣遗物套装静态 Buff (照搬 miao-plugin Attr.setArtisAttr → ArtifactSet.getArtisSetBuff)
  // 统计各套装件数, 激活 2/4 件套效果
  const setCounts = {}
  for (let pos = 1; pos <= 5; pos++) {
    const arti = artisData[pos]
    if (!arti || !arti.name) continue
    const setName = _pieceToSet[arti.name]
    if (setName) setCounts[setName] = (setCounts[setName] || 0) + 1
  }
  for (const [setName, count] of Object.entries(setCounts)) {
    const setBuffs = _artiBuffs[setName]
    if (!setBuffs) continue
    // 2件套 (count >= 2)
    if (count >= 2 && setBuffs[2]) {
      _applySetBuffs(attrCtx, setBuffs[2], elem)
    }
    // 4件套 (count >= 4)
    if (count >= 4 && setBuffs[4]) {
      _applySetBuffs(attrCtx, setBuffs[4], elem)
    }
  }

  // ---- 圣遗物列表处理 + 累加词条到属性 ----
  const artisList = []

  // 权重查找: 小词条(flat)映射到大词条(%)的权重
  const getWeightKey = (key) => {
    if (key === 'atkPlus') return 'atk'
    if (key === 'hpPlus') return 'hp'
    if (key === 'defPlus') return 'def'
    return key
  }
  const currWeights = _usefulAttr[charName] || {}

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

    // 主词条加入属性计算 (calcMainValue 已返回展示量级, 照搬 miao-plugin)
    calcArtisAttr(attrCtx, mainKey, mainVal, elem)

    // 副词条 (attrIdMap 为十进制, 需转为展示量级后加入属性计算)
    const subHistory = calcSubstatHistory(attrIds)
    for (const sh of subHistory) {
      calcArtisAttr(attrCtx, sh.key, toDisplayValue(sh.key, sh.totalValue), elem)
    }

    // ---- 新算法: 有效数 & 词条数 ----
    // 有效数: 权重>0的副词条种类数 (无重复, 取值范围 0-4)
    const effectiveCount = subHistory.filter(sh => (currWeights[getWeightKey(sh.key)] || 0) > 0).length
    // 词条数: 权重>0的副词条的最终展示值 / 该词条平均每次成长展示值 的总和
    // 小攻击/小防御/小生命: 先转为对应百分比 (除以角色基础属性) 再计算
    let upgradeCount = 0
    for (const sh of subHistory) {
      const weightKey = getWeightKey(sh.key)
      if ((currWeights[weightKey] || 0) > 0) {
        let displayTotal = toDisplayValue(sh.key, sh.totalValue)
        let avgVal = _avgRollValue[sh.key] || toDisplayValue(sh.key, 1)
        // 小攻击/小防御/小生命 → 等效大百分比 (乘以100对齐展示量级)
        if (sh.key === 'atkPlus') {
          displayTotal = displayTotal / getBase(attrCtx, 'atk') * 100
          avgVal = _avgRollValue.atk || toDisplayValue('atk', 1)
        } else if (sh.key === 'hpPlus') {
          displayTotal = displayTotal / getBase(attrCtx, 'hp') * 100
          avgVal = _avgRollValue.hp || toDisplayValue('hp', 1)
        } else if (sh.key === 'defPlus') {
          displayTotal = displayTotal / getBase(attrCtx, 'def') * 100
          avgVal = _avgRollValue.def || toDisplayValue('def', 1)
        }
        upgradeCount += displayTotal / avgVal
      }
    }
    upgradeCount = Math.round(upgradeCount * 100) / 100

    const img = findArtifactImage(name)

    artisList.push({
      pos, empty: false, name, level, star, img,
      mainKey, mainValText: formatMainValue(mainKey, mainVal),
      mainKeyName: mainKeyNameMap[mainKey] || mainKey,
      subHistory, upgradeCount, effectiveCount,
      posName: posNames[pos] || `位置${pos}`
    })
  }

  // ---- 有效词条汇总 (用于右侧表格: 跨圣遗物聚合每类副词条词条数) ----
  const summaryMap = {}
  const summaryOrder = []
  for (const arti of artisList) {
    if (arti.empty) continue
    for (const sh of arti.subHistory) {
      const weightKey = getWeightKey(sh.key)
      if ((currWeights[weightKey] || 0) <= 0) continue
      if (!summaryMap[sh.key]) {
        summaryMap[sh.key] = { key: sh.key, count: 0 }
        summaryOrder.push(sh.key)
      }
      let displayTotal = toDisplayValue(sh.key, sh.totalValue)
      let avgVal = _avgRollValue[sh.key] || toDisplayValue(sh.key, 1)
      if (sh.key === 'atkPlus') {
        displayTotal = displayTotal / getBase(attrCtx, 'atk') * 100
        avgVal = _avgRollValue.atk || toDisplayValue('atk', 1)
      } else if (sh.key === 'hpPlus') {
        displayTotal = displayTotal / getBase(attrCtx, 'hp') * 100
        avgVal = _avgRollValue.hp || toDisplayValue('hp', 1)
      } else if (sh.key === 'defPlus') {
        displayTotal = displayTotal / getBase(attrCtx, 'def') * 100
        avgVal = _avgRollValue.def || toDisplayValue('def', 1)
      }
      summaryMap[sh.key].count += displayTotal / avgVal
    }
  }
  // 按词条数降序
  const summaryItems = summaryOrder
    .map(key => ({
      key,
      shortName: subKeyShortName[key] || key,
      count: Math.round(summaryMap[key].count * 100) / 100
    }))
    .sort((a, b) => b.count - a.count)

  // 计算总计
  let totalWordCount = 0
  let totalEffectiveCount = 0
  for (const arti of artisList) {
    if (arti.empty) continue
    totalEffectiveCount += arti.effectiveCount
    totalWordCount += arti.upgradeCount
  }

  const effectiveSummary = {
    totalEffectiveCount,
    totalWordCount: Math.round(totalWordCount * 100) / 100,
    items: summaryItems.length > 0 ? summaryItems : [{ key: '', shortName: '无有效词条', count: 0 }]
  }

  // ---- 构建角色面板数值 (照搬 miao-plugin ProfileDetail.render) ----
  // 权重来自 miao-plugin artis-mark.js → usefulAttr (默认: atk 75, cpct/cdmg/dmg/phy 100)
  const charWeights = _usefulAttr[charName]
    || { atk: 75, cpct: 100, cdmg: 100, dmg: 100, phy: 100 }

  const charStats = []
  // 固定值属性 (hp, atk, def): 使用 Format.comma
  for (const key of ['hp', 'atk', 'def']) {
    const total = getAttr(attrCtx, key)
    const base = getBase(attrCtx, key)
    const plus = total - base
    charStats.push({
      key,
      label: statLabelMap[key] || key,
      base: formatComma(base, key === 'hp' ? 0 : 1),
      plus: '+' + formatComma(plus, key === 'hp' ? 0 : 1),
      total: formatComma(total, key === 'hp' ? 0 : 1),
      weight: charWeights[key] || 0,
      isEffective: !!charWeights[key], showWeight: false
    })
  }
  // 元素精通: 也是固定值
  {
    const key = 'mastery'
    const total = getAttr(attrCtx, key)
    const base = getBase(attrCtx, key)
    const plus = total - base
    charStats.push({
      key, label: statLabelMap[key] || key,
      base: formatComma(base, 0),
      plus: '+' + formatComma(plus, 0),
      total: formatComma(total, 0),
      weight: charWeights[key] || 0,
      isEffective: !!charWeights[key], showWeight: true
    })
  }
  // 百分比属性 (cpct, cdmg, recharge, dmg): 使用 Format.pct
  for (const key of ['cpct', 'cdmg', 'recharge', 'dmg']) {
    let dataKey = key
    if (key === 'dmg') {
      const phyVal = getAttr(attrCtx, 'phy')
      const dmgVal = getAttr(attrCtx, 'dmg')
      if (phyVal > dmgVal) dataKey = 'phy'
    }
    const total = getAttr(attrCtx, dataKey)
    const base = getBase(attrCtx, dataKey)
    const plus = total - base
    charStats.push({
      key,
      label: statLabelMap[key] || key,
      base: formatPct(base),
      plus: (plus >= 0 ? '+' : '') + formatPct(plus),
      total: formatPct(total),
      weight: charWeights[key] || 0,
      isEffective: !!charWeights[key], showWeight: true
    })
  }
  // 检查元素/物理伤害加成 (照搬 miao-plugin — 如果 elem dmg > dmg 则显示)
  for (const dk of _elemKeys) {
    const dkVal = getAttr(attrCtx, dk)
    const dmgVal = getAttr(attrCtx, 'dmg')
    if (dkVal > 0 && dkVal > dmgVal) {
      const base = getBase(attrCtx, dk)
      const plus = dkVal - base
      charStats.push({
        key: dk, label: mainKeyNameMap[dk] || dk,
        base: formatPct(base),
        plus: (plus >= 0 ? '+' : '') + formatPct(plus),
        total: formatPct(dkVal),
        weight: charWeights[dk] || 0,
        isEffective: false, showWeight: false
      })
    }
  }

  return {
    uid, charName, playerName: playerData.name || '',
    charLevel, charCons, elem, charSplash, charSide,
    talents, talentMap, talentIcons,
    weaponInfo,
    charStats,
    charWeights,
    artisList,
    effectiveSummary,
    effectiveStats: effectiveStats.join('、')
  }
}

// ---- 计算突破等阶 (照搬 miao-plugin Attr.calcPromote) ----
function calcPromoteLevel (lv) {
  const lvs = [1, 20, 40, 50, 60, 70, 80, 90, 100]
  let promote = 0
  for (let idx = 0; idx < lvs.length - 1; idx++) {
    if (lv >= lvs[idx] && lv <= lvs[idx + 1]) return promote
    promote++
  }
  return promote
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

    // 构建模板数据 — 使用 miao-plugin 的数据格式

    // 天赋数据: miao-plugin 格式 {a: {level, original}, e: {...}, q: {...}}
    const talentData = {}
    for (const [key, tName] of Object.entries(result.talentMap)) {
      const level = result.talents[key] || 0
      talentData[key] = { level, original: level }
    }

    // imgs (天赋+命座图标路径): miao-plugin 格式 {a: 'meta-gs/...', e: '...', q: '...', cons1: '...', ...cons6}
    const imgs = {}
    for (const [key, tName] of Object.entries(result.talentMap)) {
      imgs[key] = result.talentIcons[key] || ''
    }
    // 命座图标
    for (let i = 1; i <= 6; i++) {
      imgs[`cons${i}`] = result.talentIcons[`cons${i}`] || ''
    }

    // attr (角色属性面板值): miao-plugin 格式 attr[key], attr[key+'Base'], attr[key+'Plus']
    const attr = {}
    for (const stat of result.charStats) {
      attr[stat.key] = stat.total
      attr[stat.key + 'Base'] = stat.base
      attr[stat.key + 'Plus'] = stat.plus
    }
    // charWeight: miao-plugin 格式 {key: weight}
    // 照搬 miao-plugin ArtisMark.getMarkDetail → 直接从 usefulAttr 获取, 不通过 charStats 间接构建
    // 伤害加成(dmg/phy)不是副词条, 不在面板显示权重
    const charWeight = { ...result.charWeights }
    delete charWeight.dmg
    delete charWeight.phy

    // 武器数据: miao-plugin 格式
    let weaponData = null
    if (result.weaponInfo) {
      const wi = result.weaponInfo
      // 照搬 miao-plugin getWeaponDetail: 格式化 attrs
      const weaponAttrs = { atkBase: formatComma(wi.baseAtk, 1) }
      const attrTitleMap = {}
      if (wi.bonusKey) {
        // 根据属性类型选择格式化方式 (bonusVal 为展示量级)
        const isCommaKey = ['mastery'].includes(wi.bonusKey)
        weaponAttrs[wi.bonusKey] = isCommaKey
          ? formatComma(wi.bonusVal, 0)
          : formatPct(wi.bonusVal * 1, 1)
        attrTitleMap[wi.bonusKey] = wi.bonusKeyName
      }
      // 转换精炼文本为 nobr 格式 (照搬 miao-plugin: 数字不换行)
      const descHtml = wi.desc
        ? wi.desc.replace(/(\d+(?:\.\d+)?%?)/g, '<nobr>$1</nobr>')
        : ''
      weaponData = {
        name: wi.name,
        sName: wi.sName || wi.name,
        level: wi.level,
        ascLevel: wi.ascLevel || String(wi.level),
        affix: wi.affix,
        star: wi.star,
        starText: wi.starText || '',
        img: wi.img,
        attrs: weaponAttrs,
        attrTitleMap,
        desc: { desc: descHtml }
      }
    }

    // 圣遗物列表
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
          const weightKey = sh.key === 'atkPlus' ? 'atk' :
                             sh.key === 'hpPlus' ? 'hp' :
                             sh.key === 'defPlus' ? 'def' : sh.key
          const isEffective = (result.charWeights[weightKey] || 0) > 0
          return {
            key: sh.key,
            shortName: subKeyShortName[sh.key] || sh.key,
            formula,
            hitCount: sh.hitCount,
            isEffective
          }
        })
      }
    })

    const renderData = {
      uid: result.uid,
      name: result.charName,
      level: result.charLevel,
      cons: result.charCons,
      elem: result.elem,
      costumeSplash: result.charSplash,
      imgs,
      talent: talentData,
      talentMap: result.talentMap,
      talents: result.talents,
      talentIcons: result.talentIcons,
      attr,
      charWeight,
      charStats: result.charStats,
      weapon: weaponData,
      weaponInfo: result.weaponInfo,
      artis: artisForTemplate,
      effectiveStats: result.effectiveStats,
      summary: result.effectiveSummary,
      version: '1.10.1'
    }

    try {
      const img = await this.e.runtime.render(
        'artifacts-plugin',
        'artifact-init/artifact-init',
        renderData,
        {
          retType: 'base64',
          beforeRender ({ data }) {
            // 照搬 miao-plugin Render.js: 设置 elemLayout
            // runtime 已预设 _miao_path(相对URL) / defaultLayout(绝对路径), 但未设 elemLayout
            // elemLayout 需要绝对文件系统路径, 不能用相对 URL (否则模板引擎从 CWD 解析)
            const layoutPath = path.join(_miaoPluginDir, 'resources/common/layout/')
            return {
              ...data,
              elemLayout: layoutPath + 'elem.html',
              _layout_path: layoutPath,
              sys: { ...(data.sys || {}), scale: 1.6 },
              copyright: `Created By TRSS-Yunzai & Miao-Plugin & liangshi-calc · Artifacts-Plugin v1.10.1`
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
