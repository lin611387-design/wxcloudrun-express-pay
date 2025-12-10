const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
// const { init: initDB, Counter } = require("./db");

const logger = morgan("tiny");

const app = express();
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

  // 先让微信认为成功，后面再慢慢补验签/解密/更新订单逻辑
  res.status(200).json({
    code: "SUCCESS",
    message: "成功",
  });
});


// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log("wxcloudrun-express-p listening on port", port);
});


bootstrap();
