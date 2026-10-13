import type { ToCode, ToUI } from "../../code/messages.js";
import type { SandboxTransport, ToUIHandler } from "./types.js";

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
