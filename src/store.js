import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install

// Store: Vuex 提供的状态存储类
// Store 构造函数
// Store 的实例化过程拆成 3 个部分，分别是初始化模块，安装模块和初始化 store._vm
export class Store {
  constructor(options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue) // 安装 Vue 对象
    }

    if (process.env.NODE_ENV !== 'production') {
      // 断言：确保 Vue 存在
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      // 断言：确保 Promsie 可以使用
      assert(
        typeof Promise !== 'undefined',
        `vuex requires a Promise polyfill in this browser.`
      )
      // 断言：必须被 new 操作符调用
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      )
    }

    const { plugins = [], strict = false } = options

    // store internal state
    this._committing = false // 判断严格模式下是否是通过 mutation 改变 state
    this._actions = Object.create(null) // 存放用户定义的所有的 actions
    this._actionSubscribers = [] // 存放所有 action 的订阅
    this._mutations = Object.create(null) // 存放所有的 mutation
    this._wrappedGetters = Object.create(null) // 存放所有包装后的 getter
    // 从数据结构上来看，模块的设计就是一个树型结构，
    // store 本身可以理解为一个 root module，它下面的 modules 就是子模块，
    // Vuex 需要完成这颗树的构建，构建过程的入口就是：ModuleCollection
    this._modules = new ModuleCollection(options) // 初始化模块:存放 module 树(./module/module-collection)
    this._modulesNamespaceMap = Object.create(null) // 存放 namespaced 的模块
    this._subscribers = [] // 存放所有 mutation 变化的订阅
    this._watcherVM = new Vue() // Vue 对象的实例，响应式地监测一个 getter 方法的返回值

    // bind commit and dispatch to self
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    // 安装模块
    // 对模块中的 state、getters、mutations、actions 做初始化工作
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 初始化
    // 执行初始化 store._vm 的逻辑
    resetStoreVM(this, state)

    // apply plugins
    // Vuex 的 store 接受 plugins 选项，
    // 我们在实例化 Store 的时候可以传入插件，它是一个数组
    plugins.forEach(plugin => plugin(this))

    const useDevtools =
      options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  get state() {
    return this._vm._data.$$state
  }

  set state(v) {
    if (process.env.NODE_ENV !== 'production') {
      // 非生产环境，修改state会打印错误信息
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  /**
   * 分发 mutation
   * @param {*} _type mutation 的 type
   * @param {*} _payload 额外的参数
   * @param {*} _options 一些配置
   */
  commit(_type, _payload, _options) {
    // check object-style commit
    const { type, payload, options } = unifyObjectStyle(
      _type,
      _payload,
      _options
    )

    const mutation = { type, payload }
    // 获取当前 type 对应保存下来的 mutations 数组
    const entry = this._mutations[type]
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }

    this._withCommit(() => {
      // 遍历它们执行获取到每个 handler 然后执行，
      // 实际上就是执行了 wrappedMutationHandler(playload)
      entry.forEach(function commitIterator(handler) {
        handler(payload)
      })
    })

    this._subscribers.forEach(sub => sub(mutation, this.state))

    if (process.env.NODE_ENV !== 'production' && options && options.silent) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
          'Use the filter functionality in the vue-devtools'
      )
    }
  }

  /**
   * 调用 action 的 dispatch 方法
   * @param {*} _type  action 的 type
   * @param {*} _payload 额外的参数
   */
  dispatch(_type, _payload) {
    // check object-style dispatch
    const { type, payload } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type]
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      this._actionSubscribers
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    const result =
      entry.length > 1
        ? Promise.all(entry.map(handler => handler(payload)))
        : entry[0](payload)

    return result.then(res => {
      try {
        this._actionSubscribers
          .filter(sub => sub.after)
          .forEach(sub => sub.after(action, this.state))
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[vuex] error in after action subscribers: `)
          console.error(e)
        }
      }
      return res
    })
  }

  subscribe(fn) {
    return genericSubscribe(fn, this._subscribers)
  }

  subscribeAction(fn) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers)
  }

  watch(getter, cb, options) {
    if (process.env.NODE_ENV !== 'production') {
      assert(
        typeof getter === 'function',
        `store.watch only accepts a function.`
      )
    }
    return this._watcherVM.$watch(
      () => getter(this.state, this.getters),
      cb,
      options
    )
  }

  replaceState(state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  registerModule(path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(
        path.length > 0,
        'cannot register the root module by using registerModule.'
      )
    }

    this._modules.register(path, rawModule)
    installModule(
      this,
      this.state,
      path,
      this._modules.get(path),
      options.preserveState
    )
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  unregisterModule(path) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)

    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })

    resetStore(this)
  }

  hotUpdate(newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  /**
   * 对 fn 包装了一个环境，确保在 fn 中执行任何逻辑的时候 this._committing = true
   * 外部任何非通过 Vuex 提供的接口直接操作修改 state 的行为都会在开发阶段触发警告
   * @param {*} fn
   */
  _withCommit(fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe(fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore(store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}

/**
 * 实际上是想建立 getters 和 state 的联系
 * @param {*} store
 * @param {*} state
 * @param {*} hot
 */
function resetStoreVM(store, state, hot) {
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  // 首先遍历了 _wrappedGetters 获得每个 getter 的函数 fn 和 key，
  // 然后定义了 computed[key] = () => fn(store)
  forEachValue(wrappedGetters, (fn, key) => {
    /**
     * fn(store) 相当于执行:
     * store._wrappedGetters[type] = function wrappedGetter (store) {
     *   return rawGetter(
     *     local.state, // local state
     *     local.getters, // local getters
     *     store.state, // root state
     *     store.state, // root state
     *     store.getters // root getters
     *   )
     * }
     */
    computed[key] = () => fn(store)
    Object.defineProperty(store.getters, key, {
      // 当我根据 key 访问 store.getters 的某一个 getter 的时候，
      // 实际上就是访问了 store._vm[key]，也就是 computed[key]
      // 在执行 computed[key] 对应的函数的时候，会执行 rawGetter(local.state,...) 方法，
      // 那么就会访问到 store.state，
      // 进而访问到 store._vm._data.$$state，这样就建立了一个依赖关系
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  Vue.config.silent = true
  // 实例化一个 Vue 实例 store._vm，并把 computed 传入
  // 访问 store.state 的时候，
  // 实际上会访问 Store 类上定义的 state 的 get 方法，
  // 实际上访问了 store._vm._data.$$state
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  if (store.strict) {
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}

/**
 * 完成了模块下的 state、getters、actions、mutations 的初始化工作，
 * 并且通过递归遍历的方式，完成了所有子模块的安装工作
 * @param {*} store
 * @param {*} rootState
 * @param {*} path 模块的访问路径
 * @param {*} module 当前的模块
 * @param {*} hot 是否是热更新
 */
function installModule(store, rootState, path, module, hot) {
  const isRoot = !path.length
  // 根据 path 获取 namespace
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  if (module.namespaced) {
    // 把 namespace 对应的模块保存下来，为了方便以后能根据 namespace 查找模块
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      // Vue.set( target, key, value )
      // {Object | Array} target
      // {string | number} key
      // {any} value
      // 向响应式对象中添加一个属性，并确保这个新属性同样是响应式的，且触发视图更新。
      // 它必须用于向响应式对象上添加新属性，
      // 因为 Vue 无法探测普通的新增属性 (比如 this.myObject.newProperty = 'hi')
      // 注意对象不能是 Vue 实例，或者 Vue 实例的根数据对象
      Vue.set(parentState, moduleName, module.state)
    })
  }

  // 构造了一个本地上下文环境
  const local = (module.context = makeLocalContext(store, namespace, path))

  // 注册 mutation
  // 遍历模块中的 mutations 的定义，拿到每一个 mutation 和 key
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key // 把 key 拼接上 namespace
    registerMutation(store, namespacedType, mutation, local) // 执行 registerMutation 方法
  })

  // 注册 action
  // 历模块中的 actions 的定义，拿到每一个 action 和 key
  module.forEachAction((action, key) => {
    // 判断 action.root，如果否的情况把 key 拼接上 namespace
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local) // 执行 registerAction 方法
  })

  // 注册 getter
  // 遍历模块中的 getters 的定义，拿到每一个 getter 和 key
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key // 把 key 拼接上 namespace
    registerGetter(store, namespacedType, getter, local) // 执行 registerGetter 方法
  })

  // 安装模块
  // 遍历模块中的所有子 modules，递归执行 installModule 方法
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
/**
 * 构造 local 上下文
 * @param {*} store root store
 * @param {*} namespace 模块的命名空间
 * @param {*} path 模块的 path
 */
function makeLocalContext(store, namespace, path) {
  const noNamespace = namespace === ''

  // 定义了 local 对象
  const local = {
    // 如果没有 namespace，直接指向 root store 的 dispatch 和 commit 方法
    // 否则会创建方法，把 type 自动拼接上 namespace，然后执行 store 上对应的方法
    dispatch: noNamespace
      ? store.dispatch
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._actions[type]
            ) {
              console.error(
                `[vuex] unknown local action type: ${
                  args.type
                }, global type: ${type}`
              )
              return
            }
          }

          return store.dispatch(type, payload)
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._mutations[type]
            ) {
              console.error(
                `[vuex] unknown local mutation type: ${
                  args.type
                }, global type: ${type}`
              )
              return
            }
          }

          store.commit(type, payload, options)
        }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 对于 getters 而言，如果没有 namespace，
  // 则直接返回 root store 的 getters，
  // 否则返回 makeLocalGetters(store, namespace) 的返回值
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

function makeLocalGetters(store, namespace) {
  const gettersProxy = {}

  // 首先获取了 namespace 的长度
  const splitPos = namespace.length
  // 然后遍历 root store 下的所有 getters
  Object.keys(store.getters).forEach(type => {
    // skip if the target getter is not match this namespace
    // 先判断它的类型是否匹配 namespace
    if (type.slice(0, splitPos) !== namespace) return

    // extract local getter type
    // 匹配的时候我们从 namespace 的位置截取后面的字符串得到 localType
    const localType = type.slice(splitPos)

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    // 定义了 gettersProxy
    // 获取 localType 实际上是访问了 store.getters[type]
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true
    })
  })

  return gettersProxy
}

// 实际上就是给 root store 上的 _mutations[types] 添加 wrappedMutationHandler 方法
function registerMutation(store, type, handler, local) {
  // 同一 type 的 _mutations 可以对应多个方法
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler(payload) {
    handler.call(store, local.state, payload)
  })
}

// 实际上就是给 root store 上的 _actions[types] 添加 wrappedActionHandler 方法
function registerAction(store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler(payload, cb) {
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
      },
      payload,
      cb
    )
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

// 实际上就是给 root store 上的 _wrappedGetters[key] 指定 wrappedGetter 方法
function registerGetter(store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter(store) {
    // rawGetter 就是用户定义的 getter 函数
    return rawGetter(
      local.state, // local state 当前 module 下的 state
      local.getters, // local getters 当前 module 下的 getters
      store.state, // root state 全局的 state
      store.getters // root getters 全局的 getters
    )
  }
}

/**
 * 严格模式下，store._vm 会添加一个 wathcer 来观测 this._data.$$state 的变化
 * @param {*} store
 */
function enableStrictMode(store) {
  store._vm.$watch(
    function() {
      return this._data.$$state
    },
    () => {
      if (process.env.NODE_ENV !== 'production') {
        // 当 store.state 被修改的时候, store._committing 必须为 true，否则在开发阶段会报警告
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        )
      }
    },
    { deep: true, sync: true }
  )
}

function getNestedState(state, path) {
  // 从 root state 开始，通过 path.reduce 方法一层层查找子模块 state，最终找到目标模块的 state
  return path.length ? path.reduce((state, key) => state[key], state) : state
}

function unifyObjectStyle(type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(
      typeof type === 'string',
      `expects string as the type, but found ${typeof type}.`
    )
  }

  return { type, payload, options }
}

/**
 * Vue.use(Vuex):调用了 install 方法并传入 Vue 的引用
 */
export function install(_Vue) {
  if (Vue && _Vue === Vue) {
    // 防止重复安装
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue // _Vue 对象赋值给 Vue 变量，不需要额外import Vue from 'vue'
  applyMixin(Vue) // ./mixin.js
}
