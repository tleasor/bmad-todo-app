type ErrorLog = {
  level: "error";
  msg: string;
  ts: number;
  message?: string;
  stack?: string;
};

type ErrorTarget = Pick<Window, "addEventListener" | "removeEventListener">;
type ErrorLogger = (entry: string) => void;
type RegisteredHandlers = {
  error: EventListener;
  unhandledrejection: EventListener;
};

const registeredTargets = new WeakMap<object, RegisteredHandlers>();

const errorDetails = (error: unknown): Pick<ErrorLog, "message" | "stack"> => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error == null) {
    return { message: "unknown error" };
  }
  return { message: String(error) };
};

const emitErrorLog = (logger: ErrorLogger, msg: string, error: unknown): void => {
  logger(
    JSON.stringify({
      level: "error",
      msg,
      ts: Date.now(),
      ...errorDetails(error),
    } satisfies ErrorLog),
  );
};

export const registerGlobalErrorHandlers = (
  target: ErrorTarget = window,
  logger: ErrorLogger = console.error,
): void => {
  if (registeredTargets.has(target)) return;

  const handlers: RegisteredHandlers = {
    error: (event) => {
      const errorEvent = event as ErrorEvent;
      emitErrorLog(logger, "window error", errorEvent.error ?? errorEvent.message);
    },
    unhandledrejection: (event) => {
      emitErrorLog(logger, "unhandled rejection", (event as PromiseRejectionEvent).reason);
    },
  };

  registeredTargets.set(target, handlers);
  target.addEventListener("error", handlers.error);
  target.addEventListener("unhandledrejection", handlers.unhandledrejection);
};

export const __resetGlobalErrorHandlersForTests = (target: ErrorTarget = window): void => {
  const handlers = registeredTargets.get(target);
  if (!handlers) return;
  target.removeEventListener("error", handlers.error);
  target.removeEventListener("unhandledrejection", handlers.unhandledrejection);
  registeredTargets.delete(target);
};
