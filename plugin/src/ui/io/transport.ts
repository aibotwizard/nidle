import type { ToCode, ToUI } from "../../code/messages.js";

export type ToUIHandler = (msg: ToUI) => void;

/**
 * Two-way bus between the UI and the sandbox, and the sole owner of the
 * iframe's `window.message` listener. Subscribers each get every message
 * until they unsubscribe.
 */
export type SandboxTransport = {
  postCode(msg: ToCode): void;
  addMessageListener(handler: ToUIHandler): () => void;
};

export function createSandboxTransport(): SandboxTransport {
  const handlers = new Set<ToUIHandler>();

  window.addEventListener("message", (e) => {
    const msg = (e.data && e.data.pluginMessage) as ToUI | undefined;
    if (!msg) return;
    for (const h of handlers) h(msg);
  });

  return {
    postCode: (msg: ToCode) => parent.postMessage({ pluginMessage: msg }, "*"),
    addMessageListener: (handler: ToUIHandler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
