# g-http-server

仿 http-server

1.开发

```shell
    npm install
    nodemon
```

2.使用

```shell
g-http-server -p 3000 
# 或
ghs -p 3000 
```

3.mock 数据

```shell
curl -X POST -d name=test\&\age=18 http://localhost:3000/mock/user\?id\=\1\&\a\=\2
```
