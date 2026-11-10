// 工具型 RPC（TTS 语音合成 / 生图启动，从 client.ts 拆出，经 DomainRpc 解耦）
import type { DomainRpc } from "./protocol";

export async function ttsConvert(rpc: DomainRpc, text: string, provider?: string): Promise<string> {
  try {
    const res = await rpc.call("tts.convert", { text, provider });
    if (!res.payload?.audioPath) {
      throw new Error("TTS 无音频返回");
    }
    return res.payload.audioPath as string;
  } catch (err) {
    console.error("[Gateway] ttsConvert failed:", err);
    rpc.notifyError(`语音合成失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// 生图：请求发出后由 agent 调 image_generate 工具，图片随 final 消息送达
export async function generateImage(
  rpc: DomainRpc,
  prompt: string,
  size?: string,
  sessionKey?: string,
) {
  try {
    const res = await rpc.call("tools.invoke", {
      name: "image_generate",
      args: {
        action: "generate",
        prompt,
        ...(size ? { size } : {}),
      },
      sessionKey,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!res.ok) {
      throw new Error(res.error?.message || "生图启动失败");
    }
    return res.payload;
  } catch (err) {
    console.error("[Gateway] generateImage failed:", err);
    rpc.notifyError(`生图启动失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
