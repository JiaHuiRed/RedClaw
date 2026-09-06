import { NodeRegistry, type SerializedEventPayload } from "./node-registry.js";
import {
  createSessionEventSubscriberRegistry,
  createSessionMessageSubscriberRegistry,
} from "./server-chat-state.js";
import { createNodeSubscriptionManager } from "./server-node-subscriptions.js";

export function createGatewayNodeSessionRuntime() {
  const nodeRegistry = new NodeRegistry();
  const nodePresenceTimers = new Map<string, ReturnType<typeof setInterval>>();
  const nodeSubscriptions = createNodeSubscriptionManager();
  const sessionEventSubscribers = createSessionEventSubscriberRegistry();
  const sessionMessageSubscribers = createSessionMessageSubscriberRegistry();
  const nodeSendEvent = (opts: {
    nodeId: string;
    event: string;
    payloadJSON?: SerializedEventPayload | null;
  }) => {
    nodeRegistry.sendEventRaw(opts.nodeId, opts.event, opts.payloadJSON ?? null);
  };
  const nodeSendToSession = (sessionKey: string, event: string, payload: unknown) =>
    nodeSubscriptions.sendToSession(sessionKey, event, payload, nodeSendEvent);
  const nodeSendToAllSubscribed = (event: string, payload: unknown) =>
    nodeSubscriptions.sendToAllSubscribed(event, payload, nodeSendEvent);
  return {
    nodeRegistry,
    nodePresenceTimers,
    sessionEventSubscribers,
    sessionMessageSubscribers,
    nodeSendToSession,
    nodeSendToAllSubscribed,
    nodeSubscribe: nodeSubscriptions.subscribe,
    nodeUnsubscribe: nodeSubscriptions.unsubscribe,
    nodeUnsubscribeAll: nodeSubscriptions.unsubscribeAll,
  };
}
