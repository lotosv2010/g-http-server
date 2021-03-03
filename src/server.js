const http = require('http')
const fs = require('fs').promises
const { createReadStream, createWriteStream, readFileSync } = require('fs')
const path = require('path')
const url = require('url')
const crypto = require('crypto')
// 第三方模块
const ejs = require('ejs')
const debug = require('debug')('server')
const mime = require('mime')
const chalk = require('chalk')
const internalIp = require('internal-ip')
const esj = require('ejs')

const template = readFileSync(path.resolve(__dirname, 'template.ejs'), 'utf-8')

class Server {
  constructor(config) {
    this.port = config.port
    this.directory = config.directory
    this.host = config.host
    this.template = template
  }
  async handleRequest(request, response) {
    const { pathname } = url.parse(decodeURIComponent(request.url))
    let filePath = path.join(this.directory, pathname)
    try {
      const statObj = await fs.stat(filePath)
      if(statObj.isFile()) {
        // 文件
        this.sendFile(request, response, filePath, statObj)
      } else {
        // 文件夹
        try {
          const concatFilePath = path.join(filePath, 'index.html')
          const statObj = await fs.stat(concatFilePath)
          this.sendFile(request, response, concatFilePath, statObj)
        } catch (e) {
          this.showList(request, response, filePath, statObj, pathname)
        }
      }
    } catch (error) {
      this.sendError(request, response, error)
    }
  }
  async showList(request, response, filePath, statObj, pathname) {
    // 读取目录包含的信息
    const dirs = await fs.readdir(filePath)
    try {
      const parseObj = dirs.map(item => ({
        dir: item,
        href: path.join(pathname, item)
      }))
      const templateStr = await ejs.render(this.template, {dirs: parseObj}, { async: true})
      response.setHeader('Content-Type', 'text/html;charset=utf-8;')
      response.end(templateStr)
    } catch (e) {
      this.sendError(request, response, e)
    }
  }
  gzip(request, response, filePath, statObj) {
    const ae = request.headers['accept-encoding']
    if(ae && ae.includes('gzip')) {
      response.setHeader('Content-Encoding', 'gzip')
      return require('zlib').createGzip() // 创建转化流
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
    } catch (e) {
      console.log(e)
    }
    const gzip = this.gzip(request, response, filePath, statObj)
    response.setHeader('Content-Type', `${mime.getType(filePath)};charset=utf-8;`)
    if(gzip) {
      createReadStream(filePath).pipe(gzip).pipe(response)
    } else {
      createReadStream(filePath).pipe(response)
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
    })
  }
}
module.exports = Server