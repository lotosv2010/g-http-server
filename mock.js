module.exports = function (pathname, req, res) {
  if (pathname === "/user") {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ...req.body,
          ...req.query,
        })
      );
    } else if (req.method === "POST") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ...req.body,
          ...req.query,
        })
      );
    } 
    return true
  }
};
