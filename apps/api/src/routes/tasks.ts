import { Elysia, t } from "elysia";
import { MAX_TASK_TEXT_LENGTH } from "../constants";
import { AppError } from "../errors/AppError";
import { taskRepo } from "../storage/tasks";

const TaskCreateBodySchema = t.Object({
  id: t.String(),
  text: t.String({ minLength: 1, maxLength: MAX_TASK_TEXT_LENGTH }),
});

const TaskResponseSchema = t.Object({
  id: t.String(),
  text: t.String(),
  completed: t.Boolean(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

export const tasksRoute = new Elysia()
  .get("/api/tasks", () => taskRepo.list(), {
    response: t.Array(TaskResponseSchema),
  })
  .post(
    "/api/tasks",
    ({ body, set }) => {
      const { task, created } = taskRepo.create(body);
      if (!created && task.text !== body.text) {
        throw new AppError("id_conflict", "Task id already exists with different text");
      }
      set.status = created ? 201 : 200;
      return task;
    },
    {
      body: TaskCreateBodySchema,
      response: TaskResponseSchema,
    },
  );
