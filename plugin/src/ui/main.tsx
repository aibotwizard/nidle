import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createSandboxTransport } from "./transport/sandboxTransport.js";
import { createSettingsStore } from "./settings/settingsStore.js";
import { createPostMessageStorage } from "./settings/postMessageStorage.js";

// Module-level singletons: the transport owns window.message and the
// store owns clientStorage round-trips; both outlive any React render.
const transport = createSandboxTransport();
const settingsStore = createSettingsStore(createPostMessageStorage(transport));

createRoot(document.getElementById("root")!).render(
  <App transport={transport} settingsStore={settingsStore} />,
);
