import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";
export const ChannelsStatusParamsSchema = Type.Object(
  {
    probe: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    channel: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

// Channel docking: channels.status is intentionally schema-light so new
// channels can ship without protocol updates.
export const ChannelAccountSnapshotSchema = Type.Object(
  {
    accountId: NonEmptyString,
    name: Type.Optional(Type.String()),
    enabled: Type.Optional(Type.Boolean()),
    configured: Type.Optional(Type.Boolean()),
    linked: Type.Optional(Type.Boolean()),
    running: Type.Optional(Type.Boolean()),
    connected: Type.Optional(Type.Boolean()),
    reconnectAttempts: Type.Optional(Type.Integer({ minimum: 0 })),
    lastConnectedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastError: Type.Optional(Type.String()),
    healthState: Type.Optional(Type.String()),
    lastStartAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastStopAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastInboundAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastOutboundAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastTransportActivityAt: Type.Optional(Type.Integer({ minimum: 0 })),
    busy: Type.Optional(Type.Boolean()),
    activeRuns: Type.Optional(Type.Integer({ minimum: 0 })),
    lastRunActivityAt: Type.Optional(Type.Integer({ minimum: 0 })),
    lastProbeAt: Type.Optional(Type.Integer({ minimum: 0 })),
    mode: Type.Optional(Type.String()),
    dmPolicy: Type.Optional(Type.String()),
    allowFrom: Type.Optional(Type.Array(Type.String())),
    tokenSource: Type.Optional(Type.String()),
    botTokenSource: Type.Optional(Type.String()),
    appTokenSource: Type.Optional(Type.String()),
    baseUrl: Type.Optional(Type.String()),
    allowUnmentionedGroups: Type.Optional(Type.Boolean()),
    cliPath: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    dbPath: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    port: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    probe: Type.Optional(Type.Unknown()),
    audit: Type.Optional(Type.Unknown()),
    application: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: true },
);

export const ChannelUiMetaSchema = Type.Object(
  {
    id: NonEmptyString,
    label: NonEmptyString,
    detailLabel: NonEmptyString,
    systemImage: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChannelEventLoopHealthSchema = Type.Object(
  {
    degraded: Type.Boolean(),
    reasons: Type.Array(
      Type.Union([
        Type.Literal("event_loop_delay"),
        Type.Literal("event_loop_utilization"),
        Type.Literal("cpu"),
      ]),
    ),
    intervalMs: Type.Integer({ minimum: 0 }),
    delayP99Ms: Type.Number({ minimum: 0 }),
    delayMaxMs: Type.Number({ minimum: 0 }),
    utilization: Type.Number({ minimum: 0 }),
    cpuCoreRatio: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ChannelsStatusResultSchema = Type.Object(
  {
    ts: Type.Integer({ minimum: 0 }),
    channelOrder: Type.Array(NonEmptyString),
    channelLabels: Type.Record(NonEmptyString, NonEmptyString),
    channelDetailLabels: Type.Optional(Type.Record(NonEmptyString, NonEmptyString)),
    channelSystemImages: Type.Optional(Type.Record(NonEmptyString, NonEmptyString)),
    channelMeta: Type.Optional(Type.Array(ChannelUiMetaSchema)),
    channels: Type.Record(NonEmptyString, Type.Unknown()),
    channelAccounts: Type.Record(NonEmptyString, Type.Array(ChannelAccountSnapshotSchema)),
    channelDefaultAccountId: Type.Record(NonEmptyString, NonEmptyString),
    eventLoop: Type.Optional(ChannelEventLoopHealthSchema),
    partial: Type.Optional(Type.Boolean()),
    warnings: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const ChannelsLogoutParamsSchema = Type.Object(
  {
    channel: NonEmptyString,
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChannelsStopParamsSchema = Type.Object(
  {
    channel: NonEmptyString,
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChannelsStartParamsSchema = Type.Object(
  {
    channel: NonEmptyString,
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const WebLoginStartParamsSchema = Type.Object(
  {
    force: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    verbose: Type.Optional(Type.Boolean()),
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const QrDataUrlSchema = Type.String({
  maxLength: 16_384,
  pattern: "^data:image/png;base64,",
});

export const WebLoginWaitParamsSchema = Type.Object(
  {
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    accountId: Type.Optional(Type.String()),
    currentQrDataUrl: Type.Optional(QrDataUrlSchema),
  },
  { additionalProperties: false },
);
