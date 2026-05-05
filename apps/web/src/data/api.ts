import { treaty } from "@elysiajs/eden";
import type { App } from "@bmad-todo-app/api";

export const api = treaty<App>("/");
