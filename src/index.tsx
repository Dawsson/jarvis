import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App";
import { killExistingInstances } from "./utils/kill-existing";

// Kill any existing instances before starting
killExistingInstances();

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
});

createRoot(renderer).render(<App />);
