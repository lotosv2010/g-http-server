#! /usr/bin/env node
const { program } = require('commander')
const { version } = require('../package.json')
const config = require('./config')
const Server = require('../src/server')
program.name('g-http-server')
program.usage('-h [args]')
program.version(version)

Object.values(config).forEach(val => {
  const { option, description, defaultValue } = val
  if(option) {
    program.option(option, description, defaultValue)
  }
})

program.on('--help', () => {
  console.log('\r\nExample:')
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

const server = new Server(resultConfig)
server.start()