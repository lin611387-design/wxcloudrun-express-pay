const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const logger = morgan("tiny");

// 中间件
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 微信支付回调
app.post("/pay/notify", async (req, res) => {
  console.log("pay notify body:", JSON.stringify(req.body || {}));

  // 先固定返回 SUCCESS，后面再补验签/解密/更新订单
  res.status(200).json({
    code: "SUCCESS",
    message: "成功"
  });
});

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log("wxcloudrun-express-p listening on port", port);
});

module.exports = app;
