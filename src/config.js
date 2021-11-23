const path = require('path');
module.exports = {
  host: 'localhost',  // 主机
  port: '8088',       // 端口号
  directory: path.resolve(__dirname, '..', 'public')// process.cwd() // 根目录
}