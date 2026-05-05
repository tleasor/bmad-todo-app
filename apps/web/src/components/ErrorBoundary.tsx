import { ErrorBoundary as SolidErrorBoundary, type JSX } from "solid-js";

export function ErrorBoundary(props: { children: JSX.Element }): JSX.Element {
  return (
    <SolidErrorBoundary
      fallback={() => <div role="alert">Something went wrong. Refresh to try again.</div>}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
