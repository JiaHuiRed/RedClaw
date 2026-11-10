// Gateway 连接信息的 localStorage key（此前 App 与 OperationsWorkspace 各写一份）。
// v2：旧 key 里可能存着过期的 URL（如 ws://127.0.0.1:19001），带版本后缀防旧值覆盖
export const GATEWAY_URL_KEY = "redclaw:gatewayUrl:v2";
export const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";
