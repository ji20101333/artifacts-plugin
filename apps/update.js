/**
 * 圣遗物成长值插件更新指令
 *
 * 参考 miao-plugin 的 #喵喵更新 实现 (MIT License, Copyright (c) 2023 Yoimiya)
 */

import plugin from '../../../lib/plugins/plugin.js'
import { exec } from 'node:child_process'
import path from 'node:path'

const _cwd = process.cwd()
const _pluginDir = path.resolve(_cwd, 'plugins/artifacts-plugin')

export class artifactUpdate extends plugin {
  constructor () {
    super({
      name: '圣遗物成长值插件更新',
      dsc: '更新圣遗物成长值插件并自动重启Bot',
      event: 'message',
      priority: 10,
      rule: [
        { reg: /^#圣遗物成长值插件更新$/, fnc: 'updatePlugin' }
      ]
    })
  }

  async updatePlugin (e) {
    const event = e || this.e

    if (!event.isMaster) {
      await event.reply('仅Bot主人可使用更新命令')
      return true
    }

    const isForce = event.msg?.includes?.('强制') || false
    const command = isForce
      ? 'git checkout . && git pull'
      : 'git pull'

    await event.reply('正在执行圣遗物成长值插件更新操作，请稍等...')

    try {
      exec(command, { cwd: _pluginDir }, (error, stdout, stderr) => {
        if (error) {
          event.reply(
            `圣遗物成长值插件更新失败！\n${error.message}\n请稍后重试。`
          ).catch(() => {})
          return
        }

        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
          event.reply('目前已经是最新版圣遗物成长值插件了~').catch(() => {})
          return
        }

        event.reply(
          '圣遗物成长值插件更新成功，正在尝试重新启动Yunzai以应用更新...'
        ).catch(() => {})

        setTimeout(() => {
          let restartCmd = 'npm run start'
          if (process.argv[1]?.includes?.('pm2')) {
            restartCmd = 'npm run restart'
          }
          exec(restartCmd, (err) => {
            if (err && logger?.error) {
              logger.error(`[artifacts-plugin] 自动重启失败\n${err.stack}`)
            }
            process.exit()
          })
        }, 1500)
      })
    } catch (err) {
      logger?.error?.('[artifacts-plugin] 更新执行异常:', err)
      await event.reply('更新执行异常: ' + err.message)
    }

    return true
  }
}
