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

// ---- 插件初始化 + 重启消息检测 (照搬 miao-plugin tools/index.js) ----
async function init () {
  if (Bot?.logger?.info) {
    Bot.logger.info('[artifacts-plugin] 圣遗物成长值面板插件初始化~')
  } else {
    console.log('[artifacts-plugin] 圣遗物成长值面板插件初始化~')
  }

  // 检查是否有重启后需要发送的消息
  try {
    if (typeof redis !== 'undefined' && redis?.get) {
      const msgStr = await redis.get('artifacts:restart-msg')
      if (msgStr) {
        const data = JSON.parse(msgStr)
        if (data.qq && data.msg) {
          // 发送私聊消息告知用户更新完成
          try {
            const commonMod = await import('../../../lib/common/common.js')
            if (commonMod?.default?.relpyPrivate) {
              await commonMod.default.relpyPrivate(data.qq, data.msg)
            } else if (Bot?.sendPrivateMsg) {
              await Bot.sendPrivateMsg(data.qq, data.msg)
            }
          } catch (e) {
            // 发送失败静默处理
          }
        }
        await redis.del('artifacts:restart-msg')
      }
    }
  } catch (e) {
    // redis 不可用时忽略
  }
}

init()
