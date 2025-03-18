#! /usr/bin/env node

// 引入commander模块用于解析命令行参数
const { program } = require('commander')
// 引入package.json中的版本信息
const { version } = require('../package.json')
// 引入配置信息模块
const config = require('./config')
// 引入HTTP服务器主程序模块
const Server = require('../src/server')

// 设置命令行程序的名称
program.name('g-http-server')
// 设置程序的使用方法
program.usage('-h [args]')
// 设置程序的版本号
program.version(version)

// 遍历配置信息，为每个配置项添加命令行选项
Object.values(config).forEach(val => {
  const { option, description, defaultValue } = val
  if(option) {
    // 为commander程序对象添加选项
    program.option(option, description, defaultValue)
  }
})

// 当用户请求帮助信息时，执行该回调函数
program.on('--help', () => {
  console.log('\r\nExample:')
  // 打印每个配置项的使用示例
  Object.values(config).forEach(val => {
    const { usage } = val
    if(usage) {
      console.log('   ' + usage)
    }
  })
})

// 解析用户的参数
let parserObj = program.parse(process.argv)

// 最终用户拿到的数据
let resultConfig = program.opts()

// 创建HTTP服务器实例
const server = new Server(resultConfig)
// 启动HTTP服务器
server.start()