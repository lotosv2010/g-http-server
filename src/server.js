const http = require('http')
const fs = require('fs').promises
const { createReadStream, createWriteStream, readFileSync, existsSync } = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
// 第三方模块
const ejs = require('ejs')
const debug = require('debug')('server')
const mime = require('mime')
const chalk = require('chalk')
const internalIp = require('internal-ip')
const esj = require('ejs')
const dayjs = require('dayjs')
const { getPermissionString, byteToSize } = require('./utils')

class Server {
  constructor(config) {
    this.port = config.port
    this.directory = config.directory
    this.host = config.host
  }
  parseUrl(request) {
    return new URL(request.url, `http://${request.headers.host}`)
  }
  async processAsset(request, response, url) {
    const requestUrl = path.join(this.directory, url.pathname);
    const stat = await fs.stat(requestUrl);
    if (stat.isFile()) { // 文件
      await this.sendFile(request, response, requestUrl, stat)
    } else { // 目录
      try {
        const concatFilePath = path.join(requestUrl, 'index.html');
        const concatStat = await fs.stat(concatFilePath);
        await this.sendFile(request, response, concatFilePath, concatStat)
      } catch (error) {
        this.showList(request, response, requestUrl, stat, url.pathname);
      }
    }
  }
  processParams(searchParams) {
    const params = {}
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }
    return params;
  }
  async processMock(request, response, url) {
    let flag = false;
    const mockPath = path.join(this.directory, 'mock.js');
    request.query = this.processParams(url.searchParams);
    // body
    request.body = await new Promise((resolve, reject) => {
      const chunks = []
      request.on('data', (chunk) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        let body = Buffer.concat(chunks).toString() || '{}';
        switch (request.headers['content-type']) {
          case 'application/json':
            body = JSON.parse(body);
            break;
          case 'application/x-www-form-urlencoded':
            body = this.processParams(new URLSearchParams(body))
            break;
          default:
            break;
        }
        resolve(body);
      })
    });
    if (existsSync(mockPath)) {
      const mockFn = require(mockPath);
      flag = mockFn(url.pathname, request, response);
    }
    return flag;
  }
  // 处理跨域
  async cors(request, response) {
    if(request.headers.origin) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin)
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      response.setHeader('Access-Control-Max-Age', 86400)
      // 处理预检请求
      if(request.method === 'OPTIONS') {
        // response.statusCode = 204;
        response.end();
        return true;
      }
    }
  }
  handleRequest = async (request, response) => {
    try {
      const url = this.parseUrl(request);
      // 处理跨域
      if(await this.cors(request, response)) {
        return;
      }
      // 处理mock数据
      const isMock = await this.processMock(request, response, url);
      if (isMock) return;
      // 处理静态资源
      await this.processAsset(request, response, url);
    } catch (error) {
      this.sendError(request, response, error);
    }
  }
  async showList(request, response, filePath, statObj, pathname) {
    // 读取目录包含的信息
    try {
      const dirs = await fs.readdir(filePath);
      const parseFiles = await await Promise.all(dirs.map(async item => {
        const dirStat = await fs.stat(path.join(filePath, item));
        return {
          dir: item,
          href: path.join(pathname, item),
          isFile: dirStat.isFile(),
          permission: getPermissionString(dirStat.mode),
          size: byteToSize(dirStat.size),
          time: dayjs(dirStat.mtime).format('YYYY-MM-DD HH:mm:ss')
        }
      }));
      const footer = `Node.js ${process.version}/ ecstatic server running @ ${this.host}:${this.port}`
      const template = await fs.readFile(path.join(__dirname, 'template.ejs'), 'utf-8');
      const templateStr = await ejs.render(template, { dirs: parseFiles, footer }, { async: true});
      response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8;'});
      response.end(templateStr);
    } catch (error) {
      this.sendError(request, response, error);
    }
  }
  gzip(request, response) {
    const encoding = request.headers['accept-encoding'];
    if(encoding?.includes('gzip')) {
      response.setHeader('Content-Encoding', 'gzip');
      return zlib.createGzip() // 创建转化流
    } else if(encoding?.includes('br')) {
      response.setHeader('Content-Encoding', 'br')
      return zlib.createBrotliCompress()
    } else if(encoding?.includes('deflate')) {
      response.setHeader('Content-Encoding', 'deflate')
      return zlib.createDeflate()
    } else {
      return false
    }
  }
  async cache(request, response, filePath, statObj) {
    response.setHeader('Expires', new Date(Date.now() + 10 * 1000).toGMTString())
    response.setHeader('Cache-Control', 'max-age=10')

    const fileContent = await fs.readFile(filePath)
    // Last-Modified
    const ifModifiedSince = request.headers['if-modified-since']
    const ctime = statObj.ctime.toGMTString()
    // Etag
    const ifNoneMatch = request.headers['if-none-match']
    const etag = crypto.createHash('md5').update(fileContent).digest('base64')

    response.setHeader('Last-Modified', ctime)
    response.setHeader('Etag', etag)

    if(ifModifiedSince !== ctime) {
      return false
    }
    if(ifNoneMatch !== etag) {
      return false
    }
    return true
  }
  async sendFile(request, response, filePath, statObj) {
    // 缓存
    try {
      let cache = await this.cache(request, response, filePath, statObj)
      if(cache) {
        response.statusCode = 304
        return response.end()
      }
      const gzip = this.gzip(request, response);
      response.setHeader('Content-Type', `${mime.getType(filePath)};charset=utf-8;`)
      if(gzip) {
        createReadStream(filePath).pipe(gzip).pipe(response)
      } else {
        createReadStream(filePath).pipe(response)
      }
    } catch (e) {
      console.log(e)
    }
  }
  sendError(request, response, error) {
    debug(error)
    response.statusCode = 404
    response.end('Not Found')
  }
  start() {
    const server = http.createServer(this.handleRequest.bind(this))

    server.listen(this.port, this.host, async () => {
      console.log(chalk.yellowBright(`Starting up http-server, serving ./${this.directory.split('\/').pop()}\r\n`))
      console.log(chalk.yellowBright(`Available on:`))
      console.log(` http://${this.host}:${chalk.green(this.port)}`)
      console.log(` http://${await internalIp.v4()}:${chalk.green(this.port)}`)
      console.log(chalk.blueBright(`Hit CTRL-C to stop the server`))
    })
  }
}
module.exports = Server