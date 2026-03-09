# 腾讯云短信接入指南（Supabase 手机号登录）

本文档说明如何将 **腾讯云短信** 接入 Supabase 手机号登录，替代 Twilio 以支持国内 +86 号码的短信送达。

---

## 一、架构说明

```
用户点击「获取验证码」
        │
        ▼
Supabase Auth 调用 signInWithOtp
        │
        ▼
Supabase 触发 Send SMS Hook（HTTP）
        │
        ▼
Next.js API 路由 /api/auth/send-sms
  ├── 验证 webhook 签名
  ├── 提取 user.phone、sms.otp
  └── 调用腾讯云短信 API 发送
        │
        ▼
用户收到验证码短信
```

---

## 二、腾讯云准备

### 2.1 开通短信服务

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入 **短信** 产品
3. 开通短信服务，创建应用并获取 **SdkAppId**
4. 购买国内短信套餐包（按条计费）

### 2.2 创建签名与模板

1. **短信签名**：在 [国内短信 - 签名管理](https://console.cloud.tencent.com/smsv2/csms-sign) 创建并申请签名，审核通过后使用
2. **短信模板**：在 [国内短信 - 正文模板](https://console.cloud.tencent.com/smsv2/csms-template) 创建验证码模板

**模板示例**（单变量 `{1}` 为验证码）：

```
您的验证码是{1}，5分钟内有效，如非本人操作请忽略。
```

审核通过后记录 **模板 ID**。

### 2.3 获取 API 密钥

1. 进入 [访问管理 - API 密钥](https://console.cloud.tencent.com/cam/capi)
2. 创建或使用已有密钥，获取 **SecretId** 和 **SecretKey**

---

## 三、环境变量

在 `.env.local` 中新增：

```env
# ─── Supabase Send SMS Hook ────────────────────────────
# 在 Supabase Dashboard → Authentication → Hooks 中创建 Send SMS Hook 时生成
SEND_SMS_HOOK_SECRETS=v1,whsec_<base64-secret>

# ─── 腾讯云短信 ────────────────────────────────────────
TENCENTCLOUD_SECRET_ID=你的SecretId
TENCENTCLOUD_SECRET_KEY=你的SecretKey
TENCENTCLOUD_SMS_SDK_APP_ID=你的SdkAppId
TENCENTCLOUD_SMS_SIGN_NAME=你的签名名称
TENCENTCLOUD_SMS_TEMPLATE_ID=你的模板ID
```

> **注意**：部署到 Vercel 等平台时，需在项目设置中配置上述环境变量。

---

## 四、Supabase 配置

### 4.1 创建 Send SMS Hook

1. 在 Supabase Dashboard 进入 **Authentication → Hooks**
2. 找到 **Send SMS**，选择 **HTTP 类型**
3. 填写 **Hook URL**：
    - 生产环境：`https://你的域名/api/auth/send-sms`
    - 本地测试：需使用 ngrok 等工具暴露 `http://localhost:3000/api/auth/send-sms`
4. 创建或复制 **Hook Secret**（格式 `v1,whsec_xxx`），填入应用的 `SEND_SMS_HOOK_SECRETS`

### 4.2 关闭 Twilio 或保留

- 若启用 Send SMS Hook，Supabase 会**优先使用 Hook** 发送短信
- 可保留 Twilio 配置作为备用：Hook 失败时，Supabase 可能回退到 Twilio（具体行为以官方文档为准）
- 建议：启用 Hook 后，可关闭 Phone Provider 中的 Twilio（或保留，仅用于非 +86 号码）

---

## 五、模板参数说明

当前实现假设腾讯云模板**只有一个变量**，即验证码，对应 `TemplateParamSet: [otp]`。

若模板有多个变量，例如：

```
您的验证码是{1}，{2}分钟内有效。
```

需修改 `app/api/auth/send-sms/route.ts` 中的 `TemplateParamSet`：

```ts
TemplateParamSet: [otp, '5'],  // 验证码、有效期分钟数
```

---

## 六、本地测试

1. 运行 `pnpm install` 安装依赖
2. 配置 `.env.local` 中的环境变量
3. 启动服务：`pnpm --filter faqs-web dev`
4. 使用 ngrok 暴露本地端口：`ngrok http 3000`
5. 在 Supabase Hooks 中，将 Hook URL 设为 ngrok 提供的 HTTPS 地址（如 `https://xxx.ngrok.io/api/auth/send-sms`）
6. 在登录页尝试手机号登录

---

## 七、常见问题

| 问题          | 排查                                                            |
| ------------- | --------------------------------------------------------------- |
| 收不到短信    | 检查腾讯云控制台发送记录、签名/模板是否审核通过、套餐是否充足   |
| Hook 返回 403 | 检查 `SEND_SMS_HOOK_SECRETS` 是否与 Supabase 中配置一致         |
| Hook 返回 500 | 查看 API 路由日志，确认腾讯云密钥、SdkAppId、签名、模板 ID 正确 |
| 模板未审批    | 国内短信模板需审核，通常 1–2 个工作日内完成                     |

---

## 八、参考文档

- [Supabase Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)
- [腾讯云短信 API - 发送短信](https://cloud.tencent.com/document/product/382/55981)
- [腾讯云短信 Node.js SDK](https://www.npmjs.com/package/tencentcloud-sdk-nodejs-sms)
