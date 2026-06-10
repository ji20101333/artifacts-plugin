/**
 * 圣遗物成长值插件更新指令
 *
 * 参考 miao-plugin 的 #喵喵更新 实现 (MIT License, Copyright (c) 2023 Yoimiya)
 */

import plugin from '../../../lib/plugins/plugin.js'
import { exec } from 'child_process'
import path from 'node:path'

const _cwd = process.cwd()
const _pluginDir = path.resolve(_cwd, 'plugins/artifacts-plugin')

export class artifactUpdate extends plugin {
  constructor () {
    super({
      name: '圣遗物成长值插件更新',
      dsc: '更新圣遗物成长值插件并自动重启Bot',
      event: 'message',
      priority: 200,
      rule: [
        { reg: /^#圣遗物成长值插件更新$/, fnc: 'updatePlugin' }
      ]
    })
  }

  async updatePlugin () {
    if (!this.e.isMaster) {
      await this.e.reply('仅Bot主人可使用更新命令')
      return true
    }

    const isForce = this.e.msg?.includes?.('强制') || false
    const command = isForce
      ? 'git checkout . && git pull'
      : 'git pull'

    await this.e.reply('正在执行圣遗物成长值插件更新操作，请稍等...')

    exec(command, { cwd: _pluginDir }, async (error, stdout, stderr) => {
      if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
        await this.e.reply('目前已经是最新版圣遗物成长值插件了~')
        return
      }

      if (error) {
        await this.e.reply(
          `圣遗物成长值插件更新失败！\nError code: ${error.code}\n${error.stack}\n请稍后重试。`
        )
        return
      }

      await this.e.reply(
        '圣遗物成长值插件更新成功，正在尝试重新启动Yunzai以应用更新...'
      )

      // 存储重启信息（使用Redis Data，如果可用）
      try {
        // miao-plugin 的 Data 模块可能带有 `#miao` 导入别名，这里用动态导入尝试
        const dataMod = await import('../../miao-plugin/components/Data.js')
        const Data = dataMod.default
        if (Data?.setCacheJSON) {
          Data.setCacheJSON('artifacts-plugin:restart-msg', {
            msg: '重启成功，新版圣遗物成长值插件已生效',
            qq: this.e.user_id
          }, 30)
        }
      } catch (_) {
        // 如果 Data 模块不可用，跳过缓存消息
      }

      setTimeout(() => {
        let restartCmd = 'npm run start'
        if (process.argv[1]?.includes?.('pm2')) {
          restartCmd = 'npm run restart'
        }
        exec(restartCmd, (err) => {
          if (err) {
            if (logger?.error) {
              logger.error(`[artifacts-plugin] 自动重启失败\n${err.stack}`)
            }
          } else if (logger?.mark) {
            logger.mark('重启成功，运行已转为后台')
          }
          process.exit()
        })
      }, 1500)
    })

    return true
  }
}
