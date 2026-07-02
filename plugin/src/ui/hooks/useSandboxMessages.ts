import { useEffect, type Dispatch } from "react";
import type { SandboxTransport } from "../transport/types.js";
import type { Action } from "../state/appState.js";

/**
 * Forward sandbox messages into the reducer. `settings` messages are
 * not handled here — createPostMessageStorage owns those.
 */
export function useSandboxMessages(
  transport: SandboxTransport,
  dispatch: Dispatch<Action>,
): void {
  useEffect(
    () =>
      transport.addMessageListener((msg) => {
        if (msg.type === "progress") {
          dispatch({ type: "progressReceived", pct: msg.pct, line: msg.line, tone: msg.tone });
        } else if (msg.type === "done") {
          dispatch({
            type: "doneReceived",
            created: msg.created,
            updated: msg.updated,
            errors: msg.errors,
          });
        } else if (msg.type === "error") {
          dispatch({ type: "errorReceived", message: msg.message });
        }
      }),
    [transport, dispatch],
  );
}
