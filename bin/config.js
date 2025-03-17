const config = {
  port: {
    option: '-p,--port <port>',
    description: 'set your server port',
    usage: 'g-http-server --port 3000',
    defaultValue: 3000
  },
  directory: {
    option: '-d,--directory <dir>',
    description: 'set your start directory',
    usage: 'g-http-server --directory 3000',
    defaultValue: process.cwd()
  },
  host: {
    option: '-s,--host <host>',
    description: 'set your server hostname',
    usage: 'g-http-server --host 172.0.0.1',
    defaultValue: 'localhost'
  }
}
module.exports = config