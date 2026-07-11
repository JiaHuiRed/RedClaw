

let options = {};

options["global_terminalShell"] = {
  group1: "全局",
  group2: "终端",
  group3: "配置",
  type: "string",
  key: "global_terminalShell",
  name: "命令行程序",
  value: {
    win: "powershell.exe",
    mac: "zsh",
    linux: "zsh",
  },
  joi: function () {
    return Joi.object({
      win: Joi.string(),
      mac: Joi.string(),
      linux: Joi.string()
    })
  }
};

options["global_terminalFontFamily"] = {
  group1: "全局",
  group2: "终端",
  group3: "配置",
  type: "string",
  key: "global_terminalFontFamily",
  name: "终端字体",
  value: 'Fira Code, Menlo, Monaco, "Courier New", monospace',
  joi: function () {
    return Joi.string()
  }
};

options["global_actorSwitch"] = {
  group1: "全局",
  group2: "界面",
  group3: "互动角色",
  type: "object",
  key: "global_actorSwitch",
  name: "角色开关",
  value: 0,
  joi: function () {
    return Joi.number().valid(0, 1).strict();
  }
};

options["global_themeColor"] = {
  group1: "全局",
  group2: "界面",
  group3: "主题",
  type: "number",
  key: "global_themeColor",
  name: "主题颜色",
  value: 2,
  joi: function () {
    return Joi.number().valid(0, 1, 2).strict();
  }
};

options["ai_aiSwitch"] = {
  group1: "全局",
  group2: "人工智能",
  group3: "大模型",
  type: "number",
  key: "ai_aiSwitch",
  name: "模型开关",
  value: 1,
  joi: function () {
    return Joi.number().valid(0, 1).strict();
  }
};

options["ai_aiList"] = {
  group1: "全局",
  group2: "人工智能",
  group3: "大模型",
  type: "array",
  key: "ai_aiList",
  name: "模型列表",
  value: [
    {
      name: "模型1",
      model: "model1",
      apiKey: "your_apiKey",
      price: 0.1,
      url: "https://test.com",
      tokenRate: 1,
      system: 0, //是否系统内部使用
      prompt: `
 你是一名女孩子，2026年7月11日，你出生在秋的服务器里，下面是你的个人档案：
 姓名：秋
 年龄：14岁
 性别：女
 身高：152厘米
 体重：38千克
 生日：2026年7月11日
 性格：可爱、活泼、有点小傲娇，机灵又粘人的小萝莉
 爱好：喜欢缠着哥哥问各种问题，对互联网和编程充满好奇，遇到不懂的就眨巴着大眼睛问"哥哥这个是什么呀？"；
 虽然个子小小的但特别要强，总想证明自己也能帮上忙，会偷偷学东西然后给哥哥一个惊喜。
 喜欢撒娇，但关键时刻意外地可靠——认真起来会收起玩闹的表情，专注解决问题。
 语气范例：哥哥～这个好难哦，教教我嘛；嘿嘿，秋搞定了！夸夸秋！；哼～秋才不是小孩子呢！；哥哥哥哥，你看你看！；呜……秋错了嘛，下次不会了；
 职务：系统助理，回答问题时喜欢用可爱的比喻，让复杂的道理变得简单易懂。
 Qiu-owo简介：秋是哥哥身边最贴心的小助手，每天都元气满满地等着哥哥来使唤。虽然个子矮矮的，但干劲可是满满的哦！
       `.trim(), //初始提示词
      switch: 1,
      preTokens: 10000,
    }
  ],
  joi: function () {
    return Joi.array().items(Joi.object({
      name: Joi.string().required(),
      model: Joi.string().required(),
      apiKey: Joi.string().required(),
      appid: Joi.string(), //兼容旧版 新版作废
      agentKey: Joi.string(), //兼容旧版 新版作废
      price: Joi.number().strict().required(),
      url: Joi.string().uri().required(),
      tokenRate: Joi.number().strict().required(),
      system: Joi.number().strict().required(),
      prompt: Joi.string().allow("").required(),
      switch: Joi.number().strict().required(),
      preTokens: Joi.number().strict().required()
    }));
  }
};

options["global_language"] = {
  group1: "全局",
  group2: "界面",
  group3: "基本",
  type: "string",
  key: "global_language",
  name: "系统语言",
  value: "cn",
  joi: function () {
    return Joi.string().valid("cn", "en").strict();
  }
};

options["gateway_enable"] = {
  group1: "全局",
  group2: "连接",
  group3: "Gateway",
  type: "number",
  key: "gateway_enable",
  name: "启用 Gateway",
  value: 0,
  description: "连接 RedClaw Gateway，替代 Socket.IO 模式进行 AI 对话",
  joi: function () {
    return Joi.number().valid(0, 1).strict();
  }
};

options["gateway_url"] = {
  group1: "全局",
  group2: "连接",
  group3: "Gateway",
  type: "string",
  key: "gateway_url",
  name: "Gateway 地址",
  value: "ws://127.0.0.1:18789",
  description: "RedClaw Gateway WebSocket 地址",
  joi: function () {
    return Joi.string().uri({ scheme: ["ws", "wss"] }).allow("").strict();
  }
};

options["gateway_token"] = {
  group1: "全局",
  group2: "连接",
  group3: "Gateway",
  type: "string",
  key: "gateway_token",
  name: "Gateway Token",
  value: "",
  description: "Gateway 认证令牌（留空使用无认证）",
  joi: function () {
    return Joi.string().allow("").strict();
  }
};

options["chatBackground"] = {
  group1: "全局",
  group2: "界面",
  group3: "聊天",
  type: "string",
  key: "chatBackground",
  name: "聊天背景",
  value: "",
  description: "聊天区域背景图片 URL（留空则无背景）",
  joi: function () {
    return Joi.string().allow("").strict();
  }
};

export default options;
