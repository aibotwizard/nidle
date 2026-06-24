import type { ToCode, ToUI } from "../../code/messages.js";

export type PostCode = (msg: ToCode) => void;

export type ToUIHandler = (msg: ToUI) => void;

export type ToUIUnsubscribe = () => void;

/**
 * Two-way bus between the UI and the sandbox. Wraps the raw
 * `parent.postMessage` + `window.message` plumbing so subscribers don't
 * fight over a single global listener.
 */
export type SandboxTransport = {
  postCode: PostCode;
  addMessageListener(handler: ToUIHandler): ToUIUnsubscribe;
};
