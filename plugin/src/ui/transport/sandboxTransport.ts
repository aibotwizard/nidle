import type { ToCode, ToUI } from "../../code/messages.js";
import type {
  SandboxTransport,
  ToUIHandler,
  ToUIUnsubscribe,
} from "./types.js";

/**
 * Sole owner of `window.message` for the iframe. Multiple subscribers
 * (settings store, main UI loop) can register handlers; each gets every
 * message until it unsubscribes.
 */
export function createSandboxTransport(): SandboxTransport {
  const handlers = new Set<ToUIHandler>();

  window.addEventListener("message", (e) => {
    const msg = (e.data && e.data.pluginMessage) as ToUI | undefined;
    if (!msg) return;
    for (const h of handlers) h(msg);
  });

  return {
    postCode: (msg: ToCode) => parent.postMessage({ pluginMessage: msg }, "*"),
    addMessageListener: (handler: ToUIHandler): ToUIUnsubscribe => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
