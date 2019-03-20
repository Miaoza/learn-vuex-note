// Credits: borrowed code from fcomb/redux-logger

import { deepCopy } from '../util'

// Logger 插件
export default function createLogger({
  collapsed = true,
  filter = (mutation, stateBefore, stateAfter) => true,
  transformer = state => state,
  mutationTransformer = mut => mut,
  logger = console
} = {}) {
  return store => {
    let prevState = deepCopy(store.state) // 之前的 state

    // 往 this._subscribers 去添加一个函数，
    // 并返回一个 unsubscribe 的方法
    store.subscribe((mutation, state) => {
      if (typeof logger === 'undefined') {
        return
      }
      const nextState = deepCopy(state) // 提交 mutation 后的 state

      if (filter(mutation, prevState, nextState)) {
        const time = new Date()
        const formattedTime = ` @ ${pad(time.getHours(), 2)}:${pad(
          time.getMinutes(),
          2
        )}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`
        const formattedMutation = mutationTransformer(mutation)
        const message = `mutation ${mutation.type}${formattedTime}`
        const startMessage = collapsed ? logger.groupCollapsed : logger.group

        // render
        try {
          startMessage.call(logger, message)
        } catch (e) {
          console.log(message)
        }

        logger.log(
          '%c prev state',
          'color: #9E9E9E; font-weight: bold',
          transformer(prevState)
        )
        logger.log(
          '%c mutation',
          'color: #03A9F4; font-weight: bold',
          formattedMutation
        )
        logger.log(
          '%c next state',
          'color: #4CAF50; font-weight: bold',
          transformer(nextState)
        )

        try {
          logger.groupEnd()
        } catch (e) {
          logger.log('—— log end ——')
        }
      }

      prevState = nextState // 更新 prevState = nextState，为下一次提交 mutation 输出日志做准备
    })
  }
}

/**
 * 重复对应时间值前的0
 * @param {*} str '0'
 * @param {*} times 重复次数
 */
function repeat(str, times) {
  // new Array(3+1).join('0):'000'
  return new Array(times + 1).join(str)
}

/**
 * 格式化对应时间值
 * @param {*} num 值
 * @param {*} maxLength 值最大长度
 */
function pad(num, maxLength) {
  // num.toString().length 值长度
  return repeat('0', maxLength - num.toString().length) + num
}
