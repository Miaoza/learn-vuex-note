import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
  constructor(rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  /**
   *
   * @param {*} path 的父模块的 path
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
   *
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
      // 根据路径获取到父模块，再调用父模块的 addChild 方法建立父子关系
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    if (rawModule.modules) {
      // 遍历当前模块定义中的所有 modules，根据 key 作为 path，递归调用 register 方法
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  unregister(path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    if (!parent.getChild(key).runtime) return

    parent.removeChild(key)
  }
}

function update(path, targetModule, newModule) {
  if (process.env.NODE_ENV !== 'production') {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
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

function makeAssertionMessage(path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
