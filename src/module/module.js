import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
// 用来描述单个模块的类
export default class Module {
  constructor(rawModule, runtime) {
    this.runtime = runtime
    // Store some children item
    this._children = Object.create(null) // 所有子模块
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule // 模块的配置
    const rawState = rawModule.state

    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {} // 这个模块定义的 state
  }

  get namespaced() {
    return !!this._rawModule.namespaced
  }

  /**
   * 添加模块的 _children
   * 每个子模块通过路径找到它的父模块，
   * 然后通过父模块的 addChild 方法建立父子关系，
   * 递归执行这样的过程，最终就建立一颗完整的模块树
   */
  addChild(key, module) {
    this._children[key] = module
  }

  removeChild(key) {
    delete this._children[key]
  }

  // 返回当前模块的 _children 中对应 key 的模块
  getChild(key) {
    return this._children[key]
  }

  update(rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  forEachChild(fn) {
    forEachValue(this._children, fn)
  }

  forEachGetter(fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  forEachAction(fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  forEachMutation(fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
