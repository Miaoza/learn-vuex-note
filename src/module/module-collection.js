import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
  constructor(rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  /**
   * 获取对应的模块模块
   * @param {*} path 父模块的 path
   */
  get(path) {
    // 从根模块开始，通过 reduce 方法一层层去找到对应的模块，
    // 查找的过程中，执行的是 module.getChild(key) 方法
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  getNamespace(path) {
    // 从 root module 开始，
    // 通过 reduce 方法一层层找子模块，
    // 如果发现该模块配置了 namespaced 为 true，
    // 则把该模块的 key 拼到 namesapce 中，
    // 最终返回完整的 namespace 字符串
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update(rawRootModule) {
    update([], this.root, rawRootModule)
  }

  /**
   * 递归注册module
   * @param {*} path 在构建树的过程中维护的路径
   * @param {*} rawModule 定义模块的原始配置
   * @param {*} runtime 是否是一个运行时创建的模块
   */
  register(path, rawModule, runtime = true) {
    if (process.env.NODE_ENV !== 'production') {
      assertRawModule(path, rawModule)
    }

    const newModule = new Module(rawModule, runtime) // 创建一个 Module 的实例(./module.js)
    if (path.length === 0) {
      // path 的长度如果为 0，则说明它是一个根模块
      this.root = newModule
    } else {
      // 根据路径获取到父模块
      const parent = this.get(path.slice(0, -1))
      // 调用父模块的 addChild 方法建立父子关系
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    if (rawModule.modules) {
      // 遍历当前模块定义中的所有 modules，根据 key 作为 path，递归调用 register 方法，
      // 逐个注册，最终形成一个树
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  /**
   * 模块注销
   * @param {*} path
   */
  unregister(path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    if (!parent.getChild(key).runtime) return

    parent.removeChild(key)
  }
}

/**
 * 更新模块树
 * @param {*} path 路径
 * @param {*} targetModule 模板模块
 * @param {*} newModule 更新后的模块
 */
function update(path, targetModule, newModule) {
  if (process.env.NODE_ENV !== 'production') {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)
  // Module update方法更新当前模块

  // update nested(嵌套的) modules
  if (newModule.modules) {
    // for start
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        // 子模块不存在直接返回
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
              'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
    // for end
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value =>
    typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

/**
 * 在非生产环境下检测options中getters,mutations，actions的定义是否符合规范，
 * 不符合会给出提示
 * @param {*} path
 * @param {*} rawModule
 */
function assertRawModule(path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

// 生成断言的msg
function makeAssertionMessage(path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
