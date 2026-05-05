import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import "virtual:uno.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("#root mount node missing");

const queryClient = new QueryClient();

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  ),
  root,
);
