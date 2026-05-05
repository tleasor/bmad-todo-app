import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import "virtual:uno.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LiveRegion } from "./components/LiveRegion";
import { registerGlobalErrorHandlers } from "./errors/reporting";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/layout.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root mount node missing");

const queryClient = new QueryClient();
registerGlobalErrorHandlers();

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <LiveRegion />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  ),
  root,
);
