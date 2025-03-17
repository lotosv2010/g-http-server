module.exports = function (pathname, req, res) {
  if (pathname === "/user") {
    if (req.method === "GET") {
      console.log(req.query, req.body)
      res.end(
        JSON.stringify({
          name: "zhangsan",
          age: 18,
        })
      );
    } else if (req.method === "POST") {
      console.log(req.query, req.body)
      res.end(
        JSON.stringify({
          name: "lisi",
          age: 20,
        })
      );
    }
    return true
  }
};
