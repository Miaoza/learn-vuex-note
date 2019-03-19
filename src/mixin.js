/**
 * 给 Vue 的实例注入一个 $store 的属性
 * @param {*} Vue Vue 对象
 */
export default function(Vue) {
  const version = Number(Vue.version.split('.')[0])
  // 判断版本号是否>2
  if (version >= 2) {
    // 将 vuexInit 混入 beforeCreated
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    // 将 vuexInit 放入 Vue 的 _init 方法中
    const _init = Vue.prototype._init
    Vue.prototype._init = function(options = {}) {
      options.init = options.init ? [vuexInit].concat(options.init) : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */
  // 把 options.store 保存在所有组件的 this.$store 中
  // Vuex 初始化代码，根组件从这里拿到 store，子组件从父组件拿到 store
  function vuexInit() {
    const options = this.$options
    // store injection
    // 如果当前组件是根组件，会从 Vue 的 options 获取 store
    // 如果不是 root，会从父组件获取 store
    // 所有组件的 store 实例指向了同一个内存地址
    if (options.store) {
      this.$store =
        typeof options.store === 'function' ? options.store() : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}

/**
 * 在 import Vuex 之后，
 * 实例化其中的 Store 对象，
 * 返回 store 实例并传入 new Vue 的 options 中，
 * 也就是 options.store
  export default new Vuex.Store({
  actions,
  getters,
  state,
  mutations,
  modules
  // ...
  })
 */
