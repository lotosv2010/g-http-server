const http = require("http");
const fs = require("fs").promises;
const {
  createReadStream,
  createWriteStream,
  readFileSync,
  existsSync,
} = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
// 引入第三方模块
const ejs = require("ejs");
const mime = require("mime");
const chalk = require("chalk");
const internalIp = require("internal-ip");
const dayjs = require("dayjs");
// 这是一个在控制台输出的模块，名称特点为：第一部分为项目名，第二部分为模块名
// 每个debug实例都有一个名字，是否在控制台打印取决于环境变量中的DEBUG是否等于static:server
const debug = require('debug')('static:server');
// 引入自定义的工具函数
const { getPermissionString, byteToSize } = require("./utils");

// 设置调试模式为开启
debug.enabled = true;
// 设置环境变量的值
process.env.DEBUG = 'static:server';

/**
 * Server类用于创建和管理HTTP服务器
 */
class Server {
  /**
   * 构造函数，初始化服务器配置
   * @param {Object} config - 服务器配置对象，包含端口(port)、目录(directory)和主机(host)
   */
  constructor(config) {
    this.port = config.port;
    this.directory = config.directory;
    this.host = config.host;
  }

  /**
   * 解析URL
   * @param {Object} request - HTTP请求对象
   * @returns {URL} 解析后的URL对象
   */
  parseUrl(request) {
    return new URL(request.url, `http://${request.headers.host}`);
  }

  /**
   * 处理资源请求，区分文件和目录进行不同处理
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {URL} url - 解析后的URL对象
   */
  async processAsset(request, response, url) {
    const requestUrl = path.join(this.directory, url.pathname); // 获取请求的文件路径

    try {
      const stat = await fs.stat(requestUrl); // 获取文件状态
      if (stat.isFile()) {
        // 文件
        await this.sendFile(request, response, requestUrl, stat);
      } else {
        // 目录
        const concatFilePath = path.join(requestUrl, "index.html");
        try {
          const concatStat = await fs.stat(concatFilePath);
          await this.sendFile(request, response, concatFilePath, concatStat);
        } catch (error) {
          this.showList(request, response, requestUrl, stat, url.pathname);
        }
      }
    } catch (error) {
      this.sendError(request, response, error);
    }
  }

  /**
   * 处理查询参数
   * @param {Object} searchParams - 查询参数对象
   * @returns {Object} 解析后的查询参数键值对
   */
  async processParams(searchParams) {
    const params = {};
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }
    return params;
  }

  /**
   * 处理Mock数据请求
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {URL} url - 解析后的URL对象
   * @returns {Boolean} 是否处理了Mock数据请求
   */
  async processMock(request, response, url) {
    if (!url.pathname.startsWith("/mock/")) return; // 不是mock请求

    const mockPath = path.join(this.directory, "mock", "index.js"); // mock文件路径

    // query
    request.query = await this.processParams(url.searchParams);

    // body
    request.body = await new Promise((resolve, reject) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        let body = Buffer.concat(chunks).toString() || "{}";
        switch (request.headers["content-type"]) {
          case "application/json":
            body = JSON.parse(body);
            break;
          case "application/x-www-form-urlencoded":
            body = this.processParams(new URLSearchParams(body));
            break;
          default:
            break;
        }
        resolve(body);
      });
    });

    try {
      if (existsSync(mockPath)) {
        const mockFn = require(mockPath);
        return mockFn(url.pathname, request, response);
      }
    } catch (error) {
      debug(error);
      this.sendError(request, response, error);
    }
    return false;
  }

  /**
   * 处理跨域请求
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @returns {Boolean} 是否处理了跨域请求
   */
  async processCors(request, response) {
    if (request.headers.origin) {
      response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      response.setHeader("Access-Control-Max-Age", 86400);
      // 处理预检请求
      if (request.method === "OPTIONS") {
        // response.statusCode = 204;
        response.end();
        return true;
      }
    }
    return false;
  }

  /**
   * 处理HTTP请求的主函数
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   */
  handleRequest = async (request, response) => {
    try {
      const url = this.parseUrl(request);

      // 处理跨域
      if (await this.processCors(request, response)) return;
      // 处理mock数据
      if (await this.processMock(request, response, url)) return;
      // 处理静态资源
      await this.processAsset(request, response, url);
    } catch (error) {
      this.sendError(request, response, error);
    }
  };

  /**
   * 显示目录列表
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {String} filePath - 目录路径
   * @param {Object} statObj - 目录状态对象
   * @param {String} pathname - 请求的路径名
   */
  async showList(request, response, filePath, statObj, pathname) {
    // 读取目录包含的信息
    try {
      const dirs = await fs.readdir(filePath); // 获取目录包含的信息
      // 获取文件信息
      const parseFiles = await Promise.all(
        dirs.map(async (item) => {
          const dirStat = await fs.stat(path.join(filePath, item)); // 获取文件状态
          return {
            dir: item,
            href: path.join(pathname, item),
            isFile: dirStat.isFile(),
            permission: getPermissionString(dirStat.mode),
            size: dirStat.isFile() ? byteToSize(dirStat.size) : "",
            time: dayjs(dirStat.mtime).format("YYYY-MM-DD HH:mm:ss"),
          };
        })
      );
      const footer = `Node.js ${process.version}/ ecstatic server running @ ${this.host}:${this.port}`;
      const template = await fs.readFile(
        path.join(__dirname, "template.ejs"),
        "utf-8"
      );
      const templateStr = await ejs.render(
        template,
        { dirs: parseFiles, footer },
        { async: true }
      );

      response.writeHead(200, { "Content-Type": "text/html;charset=utf-8;" });
      response.end(templateStr);
    } catch (error) {
      this.sendError(request, response, error);
    }
  }

  /**
   * 处理响应压缩
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @returns {Object|Boolean} 压缩流对象或false
   */
  async processCompress(request, response) {
    const encoding = request.headers["accept-encoding"];
    if (encoding?.includes("gzip")) {
      response.setHeader("Content-Encoding", "gzip");
      return zlib.createGzip(); // 创建转化流
    } else if (encoding?.includes("br")) {
      response.setHeader("Content-Encoding", "br");
      return zlib.createBrotliCompress();
    } else if (encoding?.includes("deflate")) {
      response.setHeader("Content-Encoding", "deflate");
      return zlib.createDeflate();
    }
    return false;
  }

  /**
   * 处理缓存
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {String} filePath - 文件路径
   * @param {Object} statObj - 文件状态对象
   * @returns {Boolean} 是否命中缓存
   */
  async processCache(request, response, filePath, statObj) {
    // 1. 设置强制缓存
    response.setHeader('Expires', new Date(Date.now() + 10 * 1000).toGMTString()); // 设置过期时间
    response.setHeader('Cache-Control', 'max-age=10'); // 缓存10秒

    // 2. 设置协商缓存
    // 2.1 Last-Modified
    const ifModifiedSince = request.headers["if-modified-since"];
    const ctime = statObj.ctime.toGMTString();
    response.setHeader("Last-Modified", ctime);
    if (ifModifiedSince !== ctime) {
      return false;
    }
    // 2.2 Etag
    const ifNoneMatch = request.headers["if-none-match"];
    // const fileContent = await fs.readFile(filePath); // 优化etag，不再使用文件内容，使用文件大小和修改时间
    const etag = crypto.createHash("md5").update(`${statObj.size}-${statObj.ctime}`).digest("base64");
    response.setHeader("Etag", etag);
    if (ifNoneMatch !== etag) {
      return false;
    }
    return true;
  }

  /**
   * 处理防盗链
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {String} filePath - 文件路径
   * @returns {Boolean} 是否允许请求
   */
  async processReferer(request, response, filePath) {
    const mimeType = mime.getType(filePath);
    if (/image/.test(mimeType)) {
      const referrer = request.headers.referer || request.headers.referrer;
      if (referrer) {
        const referer = new URL(referrer).host;
        const host = request.headers.host;
        if (referer !== host) {
          response.statusCode = 403;
          response.end("Forbidden");
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 发送文件
   * @param {Object} request - HTTP请求对象
   * @param {Object} response - HTTP响应对象
   * @param {String} filePath - 文件路径
   * @param {Object} statObj - 文件状态对象
   */
  async sendFile(request, response, filePath, statObj) {
    try {
      // 缓存
      let cache = await this.processCache(request, response, filePath, statObj);
      if (cache) {
        response.statusCode = 304;
        return response.end();
      }
      // 防盗链
      if (await this.processReferer(request, response, filePath)) {
        return;
      }
      // 压缩
      const gzip = await this.processCompress(request, response);
      const mimeType = mime.getType(filePath);
      response.setHeader("Content-Type", `${mimeType};charset=utf-8;`);

      if (gzip) {
        createReadStream(filePath).pipe(gzip).pipe(response);
      } else {
        createReadStream(filePath).pipe(response);
      }
    } catch (e) {
      debug(error);
      this.sendError(request, response, error);
    }
  }
  /**
   * 发送错误响应给客户端
   * 当请求的资源不存在时调用此函数
   * @param {Object} request - 请求对象，包含请求相关信息
   * @param {Object} response - 响应对象，用于发送响应给客户端
   * @param {Error} error - 错误对象，包含错误详情
   */
  sendError(request, response, error) {
    // 调用debug函数记录错误信息
    debug(error);
    // 设置响应状态码为404，表示资源未找到
    response.statusCode = 404;
    // 结束响应，发送'Not Found'消息给客户端
    response.end("Not Found");
  }

  /**
   * 启动HTTP服务器
   * 创建HTTP服务器并监听指定的主机和端口
   * @returns {void}
   */
  start() {
    // 创建HTTP服务器，处理请求时调用handleRequest方法
    const server = http.createServer(this.handleRequest.bind(this));

    // 服务器监听指定的主机和端口
    server.listen(this.port, this.host, async () => {
      // 打印启动信息，包括服务的目录
      console.log(
        chalk.yellowBright(
          `Starting up http-server, serving ./${this.directory
            .split("/")
            .pop()}\r\n`
        )
      );
      // 打印服务可用的URL
      console.log(chalk.yellowBright(`Available on:`));
      console.log(` http://${this.host}:${chalk.green(this.port)}`);
      console.log(` http://${await internalIp.v4()}:${chalk.green(this.port)}`);
      // 提示用户如何停止服务器
      console.log(chalk.blueBright(`Hit CTRL-C to stop the server`));
    });

    // 监听服务器错误事件，如果端口被占用，则尝试使用下一个端口
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(
          chalk.red(
            `Port ${this.port} is already in use. Trying another port...`
          )
        );
        server.listen(++this.port);
      }
    });
  }
}
module.exports = Server;
