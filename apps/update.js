/**
 * 圣遗物成长值插件更新指令
 *
 * 参考 b_updates-plugin 的更新机制实现
 */

import plugin from '../../../lib/plugins/plugin.js'
import fs from 'node:fs'
import path from 'node:path'
import { Restart } from '../../other/restart.js'

const _pluginDir = path.resolve(process.cwd(), 'plugins/artifacts-plugin')

/** 插件版本号 */
const PLUGIN_VERSION = '1.9.0'

function getVersion () {
  try {
    const pkgPath = path.join(_pluginDir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '未知'
  } catch {
    return '未知'
  }
}

export class artifactUpdate extends plugin {
  constructor () {
    super({
      name: '圣遗物成长值插件更新',
      dsc: '更新圣遗物成长值插件并自动重启Bot',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: /^#圣遗物成长值插件更新$/,
          fnc: 'handleUpdate',
          permission: 'master',
        },
        {
          reg: /^#圣遗物成长值插件强制更新$/,
          fnc: 'handleForceUpdate',
          permission: 'master',
        },
      ],
    })
  }

  /**
   * 处理更新指令：拉取远程仓库最新代码
   */
  async handleUpdate () {
    await this.reply('正在拉取更新...', false, { at: true })

    const oldVersion = getVersion()

    try {
      const ret = await Bot.exec('git pull', {
        cwd: 'plugins/artifacts-plugin',
      })

      if (ret.error) {
        logger.warn(`[artifacts-plugin] 更新失败: ${ret.stderr}`)
        return await this.reply(
          `更新失败: ${ret.stderr || ret.error.message}`,
          false,
          { at: true },
        )
      }

      const stdout = ret.stdout || ''
      if (/Already up|已经是最新|up to date/i.test(stdout)) {
        return await this.reply('圣遗物成长值插件已是最新版本~', false, { at: true })
      }

      const newVersion = getVersion()
      let msg = `圣遗物成长值插件更新成功！\n版本: ${oldVersion} → ${newVersion}`

      // 获取最近更新内容
      try {
        const logRet = await Bot.exec(
          'git log -5 --oneline --format="%s"',
          { cwd: 'plugins/artifacts-plugin' },
        )
        if (!logRet.error && logRet.stdout) {
          const lines = logRet.stdout.trim().split('\n').filter(Boolean)
          if (lines.length > 0) {
            msg += '\n\n最近更新内容:'
            for (const line of lines.slice(0, 5)) {
              if (!line.includes('Co-Authored-By')) {
                msg += `\n  · ${line}`
              }
            }
          }
        }
      } catch (_) {}

      msg += '\n\n即将重启Bot以应用更新...'
      logger.mark(`[artifacts-plugin] 更新成功: ${stdout}`)
      await this.reply(msg, false, { at: true })

      new Restart(this.e).restart()
      return true
    } catch (err) {
      logger.error(`[artifacts-plugin] 更新异常: ${err.message}`)
      return await this.reply(`更新异常: ${err.message}`, false, { at: true })
    }
  }

  /**
   * 处理强制更新指令：强制同步远程仓库并重启
   */
  async handleForceUpdate () {
    await this.reply('正在强制更新...', false, { at: true })

    try {
      await Bot.exec('git fetch', {
        cwd: 'plugins/artifacts-plugin',
      })

      const ret = await Bot.exec('git reset --hard origin/master', {
        cwd: 'plugins/artifacts-plugin',
      })

      if (ret.error) {
        logger.warn(`[artifacts-plugin] 强制更新失败: ${ret.stderr}`)
        return await this.reply(
          `强制更新失败: ${ret.stderr || ret.error.message}`,
          false,
          { at: true },
        )
      }

      const stdout = ret.stdout || ''
      logger.mark(`[artifacts-plugin] 强制更新成功: ${stdout}`)
      await this.reply(
        '圣遗物成长值插件强制更新完成，即将重启Bot...',
        false,
        { at: true },
      )

      new Restart(this.e).restart()
      return true
    } catch (err) {
      logger.error(`[artifacts-plugin] 强制更新异常: ${err.message}`)
      return await this.reply(`强制更新异常: ${err.message}`, false, { at: true })
    }
  }
}
