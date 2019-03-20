###

learn vuex code some notes
vuex v3.1.0

###

Vuex 最终存储的数据是在 state 上

###

import Vue from 'vue';

###

import Vuex from 'vuex';

###

Vue.use(Vuex); // 调用插件的 install 方法，传入 Vue 对象

###

Vue.js 提供 Vue.use 方法来给 Vue.js 安装插件，

###

通过调用插件的 install 方法安装插件

###

将 store 放入 Vue 创建时的 option 中

###

new Vue({
el: '#app',
store // 在 beforeCreated 钩子中会用到
});

###
