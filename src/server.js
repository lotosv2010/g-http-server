const http = require('http');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const zlib = require('zlib');
const crypto = require('crypto');
// 第三方模块
const chalk = require('chalk');
const internalIp = require('internal-ip');
// 这是一个在控制台输出的模块，名称特点为：第一部分为项目名，第二部分为模块名
// 每个debug实例都有一个名字，是否在控制台打印取决于环境变量中的DEBUG是否等于static:server
const debug = require('debug')('static:server');
const mime = require('mime');
const Handlebars = require('handlebars');
const config = require('./config');

// 设置环境变量的值
process.env.DEBUG = 'static:*';

// 编译模版，得到一个渲染的方法，然后传入实际数据就可以得到渲染后的html
const list = () => {
  const template = fs.readFileSync(path.resolve(__dirname, 'template', 'list.html'), 'utf8');
  return Handlebars.compile(template);
}

class Server {
  constructor(argv) {
    this.list = list();
    this.config = Object.assign({}, config, argv)
  }
  start() {
    const {port, host, directory} = this.config;
    const server = http.createServer();
    server.on('request', this.request.bind(this));
    server.listen(port, host, async () => {
      console.log(chalk.yellowBright(`Starting up http-server, serving ./${directory.split('\/').pop()}\r\n`));
      console.log(chalk.yellowBright(`Available on:`));
      console.log(` http://${host}:${chalk.green(port)}`);
      console.log(` http://${await internalIp.v4()}:${chalk.green(port)}`);
      console.log(`Hit CTRL-C to stop the server`);
    })
  }
  // 静态服务器
  async request(req, res) {
    const {directory} = this.config;
    // 先取到客户端想要的文件或文件路径
    const {pathname} = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(directory, pathname);
    try {
      const statObj = await stat(filePath);
      if(statObj.isFile()) {
        // 文件
        this.sendFile(req, res, filePath, statObj);
      } else {
        // 文件夹
        try {
          const concatFilePath = path.join(filePath, 'index.html');
          const statObj = await stat(concatFilePath);
          this.sendFile(req, res, concatFilePath, statObj);
        } catch (e) {
          try {
            const concatFilePath = path.join(filePath, 'public', 'index.html');
            const statObj = await stat(concatFilePath);
            this.sendFile(req, res, concatFilePath, statObj);
          } catch (error) {
            this.showList(req, res, filePath, statObj, pathname);
          }
        }
      }
    } catch (error) {
      const url = new URL(`${req.headers.referer}`);
      const filePath = path.join(directory, url.pathname, './public', pathname);
      try {
        const statObj = await stat(filePath);
        if(statObj.isFile()) {
          this.sendFile(req, res, filePath, statObj);
        }
      } catch (error) {
        this.sendError(req, res, error);
      }
    }
  }
  // todo 显示文件目录和所有内容
  async showList(req, res, filePath, statObj, pathname) {
    try {
      let files = await readdir(filePath);
      files = files.map(file => ({
        name: file,
        url: path.join(pathname, file)
      }));
      const html = this.list({
        title: pathname,
        files
      });
      res.setHeader('Content-Type', 'text/html;charset=utf-8;')
      res.end(html)
    } catch (error) {
      this.sendError(req, res, error);
    }
  }
  sendFile(req, res, filePath, statObj) {
    try {
      // 缓存, 如果走缓存，直接返回
      if(this.handleCache(req, res, filePath, statObj)) return;
      res.setHeader('Content-Type', `${mime.getType(filePath)};charset=utf-8;`);
      const encoding = this.gerEncoding(req, res);
      if(encoding) {
        fs.createReadStream(filePath).pipe(encoding).pipe(res);
      } else {
        fs.createReadStream(filePath).pipe(res);
      }
      
    } catch (error) {
      this.sendError(req, res, error);
    }
  }
  // todo压缩
  gerEncoding(req, res) {
    const encoding = req.headers['accept-encoding'];
    if(encoding.match(/\bgzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip');
      return zlib.createGzip();
    } else if (encoding.match(/\bdeflate\b/)) {
      res.setHeader('Content-Encoding', 'deflate');
      return zlib.createDeflate();
    } else {
      return null;
    }
  }
  // todo缓存
  handleCache(req, res, filePath, statObj) {
    // todo强缓存
    // Expires
    res.setHeader('Expires', new Date(Date.now() + 10 * 1000).toGMTString());
    // Cache-Control
    res.setHeader('Cache-Control', 'max-age=10');
    // todo协商缓存
    // if-modified-since
    const ifModifiedSince = req.headers['if-modified-since'];
    const ctime = statObj.ctime.toGMTString();
    res.setHeader('Last-Modified', ctime);
    // ETag
    const ifNoneMatch = req.headers['if-none-match'];
    const fileSize = Buffer.from(statObj.size.toString());
    const etag = crypto.createHash('md5').update(fileSize).digest('base64');
    res.setHeader('Etag', etag);
    if((ifNoneMatch && ifNoneMatch == etag) || (ifModifiedSince && ifModifiedSince == ctime)) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    return false;
  }
  sendError(req, res, error) {
    debug(error);
    res.statusCode = 500;
    res.end(error.toString() || `there is something wrong in server! please try later!`);
  }
}

module.exports = Server;