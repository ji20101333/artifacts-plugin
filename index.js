import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appDir = path.resolve(__dirname, 'apps')

let files = []
try {
  files = fs.readdirSync(appDir).filter(file => file.endsWith('.js'))
} catch (e) {
  if (Bot?.logger) {
    Bot.logger.error('[artifacts-plugin] 读取apps目录失败:', e.message)
  } else {
    console.error('[artifacts-plugin] 读取apps目录失败:', e.message)
  }
}

let ret = []
files.forEach(file => {
  ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    if (Bot?.logger) {
      Bot.logger.error(`[artifacts-plugin] 载入插件错误：${name}`)
      Bot.logger.error(ret[i].reason)
    } else {
      console.error(`[artifacts-plugin] 载入插件错误：${name}`, ret[i].reason)
    }
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }

if (Bot?.logger?.info) {
  Bot.logger.info('[artifacts-plugin] 圣遗物成长值面板插件初始化~')
} else {
  console.log('[artifacts-plugin] 圣遗物成长值面板插件初始化~')
}
