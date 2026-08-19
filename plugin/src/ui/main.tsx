import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createSandboxTransport } from "./io/transport.js";
import { createPostMessageStorage } from "./io/settingsIO.js";

// Module-level singletons: the transport owns window.message and the
// storage owns clientStorage round-trips; both outlive any React render.
const transport = createSandboxTransport();
const storage = createPostMessageStorage(transport);

createRoot(document.getElementById("root")!).render(
  <App transport={transport} storage={storage} />,
);
