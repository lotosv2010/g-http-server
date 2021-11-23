const http = require('http');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const stat = promisify(fs.stat);
// 第三方模块
const chalk = require('chalk');
const internalIp = require('internal-ip');
// 这是一个在控制台输出的模块，名称特点为：第一部分为项目名，第二部分为模块名
// 每个debug实例都有一个名字，是否在控制台打印取决于环境变量中的DEBUG是否等于static:server
const debug = require('debug')('static:server');
const mime = require('mime');
const config = require('./config');

// 设置环境变量的值
process.env.DEBUG = 'static:*';

class Server {
  constructor() {}
  start() {
    const server = http.createServer();
    server.on('request', this.request.bind(this));
    server.listen(config.port, config.host, async () => {
      console.log(chalk.yellowBright(`Starting up http-server, serving ./${config.directory.split('\/').pop()}\r\n`));
      console.log(chalk.yellowBright(`Available on:`));
      console.log(` http://${config.host}:${chalk.green(config.port)}`);
      console.log(` http://${await internalIp.v4()}:${chalk.green(config.port)}`);
      console.log(`Hit CTRL-C to stop the server`);
    })
  }
  // 静态服务器
  async request(req, res) {
    // 先取到客户端想要的文件或文件路径
    const {pathname} = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(config.directory, pathname);
    try {
      const statObj = await stat(filePath);
      if(statObj.isFile()) {
        // 文件
        this.sendFile(req, res, filePath, statObj);
      } else {
        // 文件夹
        const concatFilePath = path.join(filePath, 'index.html');
        const statObj = await stat(concatFilePath);
        this.sendFile(req, res, concatFilePath, statObj);
      }
    } catch (error) {
      this.sendError(req, res, error)
    }
  }
  sendFile(req, res, filePath, statObj) {
    try {
      res.setHeader('Content-Type', `${mime.getType(filePath)};charset=utf-8;`);
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      
    }
  }
  sendError(req, res, error) {
    debug(error);
    res.statusCode = 500;
    res.end(`there is something wrong in server! please try later!`);
  }
}

const server = new Server()
server.start()