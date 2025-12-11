const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const crypto = require("crypto");
const tcb = require("@cloudbase/node-sdk");

const app = express();
const logger = morgan("tiny");

// ================== 配置区 ==================

// 微信支付 APIv3 密钥（32 字符）
// 在云托管「服务设置 → 环境变量」里配置：WECHAT_API_V3_KEY=你的密钥
const WECHAT_API_V3_KEY = process.env.WECHAT_API_V3_KEY || "";

// ================== 初始化云开发（TCB） ==================

// 云托管一般会注入 TCB_ENV 或 WX_ENV，二选一兜底
const tcbEnvId = process.env.TCB_ENV || process.env.WX_ENV;

if (!tcbEnvId) {
  console.error("[tcb] missing env id, TCB_ENV / WX_ENV not set");
}

// 这里不强制 SecretId/SecretKey，走环境内默认身份
const tcbApp = tcb.init({
  env: tcbEnvId,
});

const db = tcbApp.database();
const ORDERS = db.collection("orders");

// ================== 中间件 ==================

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// ================== 首页 ==================

app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ================== 解密工具函数 ==================

function decryptNotifyResource(resource) {
  if (!resource || !resource.ciphertext) return null;

  if (!WECHAT_API_V3_KEY) {
    console.error("[pay notify] missing WECHAT_API_V3_KEY env");
    return null;
  }

  const { associated_data, nonce, ciphertext } = resource;

  const key = Buffer.from(WECHAT_API_V3_KEY, "utf8");
  const iv = Buffer.from(nonce, "utf8");
  const aad = associated_data ? Buffer.from(associated_data, "utf8") : null;
  const buf = Buffer.from(ciphertext, "base64");

  // AES-256-GCM: 密文 = data + tag(16 字节)
  const authTag = buf.slice(buf.length - 16);
  const data = buf.slice(0, buf.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  let decoded = decipher.update(data, undefined, "utf8");
  decoded += decipher.final("utf8");
  return JSON.parse(decoded);
}

// ================== 微信支付回调 ==================

app.post("/pay/notify", async (req, res) => {
  try {
    console.log("[pay notify] raw body:", JSON.stringify(req.body || {}));

    const { resource, event_type } = req.body || {};

    // 1. 解密
    const plain = decryptNotifyResource(resource);
    console.log(
      "[pay notify] decrypted:",
      JSON.stringify(plain || {}, null, 2)
    );

    // 2. 只处理支付成功的通知
    if (
      event_type === "TRANSACTION.SUCCESS" &&
      plain &&
      plain.trade_state === "SUCCESS"
    ) {
      const outTradeNo = plain.out_trade_no;
      const transactionId = plain.transaction_id;
      const successTime = plain.success_time;

      console.log(
        "[pay notify] paid order:",
        outTradeNo,
        "transactionId:",
        transactionId
      );

      // 3. 更新云开发 orders 集合里的订单状态为 PAID
      try {
        const now = Date.now();

        console.log("[pay notify] start update DB, outTradeNo =", outTradeNo);

        const result = await ORDERS.where({ outTradeNo }).update({
          // ✅ TCB 正确写法：必须是 data: {...}
          data: {
            status: "PAID",
            transactionId,
            successTime,
            updatedAt: now,
          },
        });

        console.log("[pay notify] DB update result:", result);

        // node-sdk 一般返回 { requestId, updated }
        if (!result || !result.updated) {
          console.warn(
            "[pay notify] DB update finished but no doc updated, outTradeNo:",
            outTradeNo
          );
        }
      } catch (dbErr) {
        console.error("[pay notify] DB update error:", dbErr);
      }
    } else {
      console.warn("[pay notify] not success event:", event_type);
    }

    // 4. 按微信要求：无论业务是否成功，都返回 200 + SUCCESS，避免重复推送
    res.status(200).json({
      code: "SUCCESS",
      message: "成功",
    });
  } catch (err) {
    console.error("[pay notify] handle error:", err);
    // 出错也不要返回非 2xx，避免微信疯狂重试
    res.status(200).json({
      code: "SUCCESS",
      message: "成功",
    });
  }
});

// ================== 启动服务 ==================

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log("wxcloudrun-express-p listening on port", port);
});

module.exports = app;
