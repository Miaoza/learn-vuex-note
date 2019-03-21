const target =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : {}
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__
// 如果浏览器装了 Vue 开发者工具，在 window 上就会有一个 __VUE_DEVTOOLS_GLOBAL_HOOK__ 的引用

export default function devtoolPlugin(store) {
  if (!devtoolHook) return // 判断是否安装Vue工具

  store._devtoolHook = devtoolHook

  // 派发一个 Vuex 初始化的事件，开发者工具可以拿到 store 实例
  devtoolHook.emit('vuex:init', store)

  // 监听 Vuex 的 traval-to-state 事件
  devtoolHook.on('vuex:travel-to-state', targetState => {
    // 把当前 state 替换成目标 state
    store.replaceState(targetState)
  })

  // 订阅 store 的 state 的变化
  store.subscribe((mutation, state) => {
    devtoolHook.emit('vuex:mutation', mutation, state)
  })
}
