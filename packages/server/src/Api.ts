import { TodosApi } from "@template/domain/TodosApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { TodosRepository } from "./TodosRepository.js"

const TodosApiLive = HttpApiBuilder.group(
  TodosApi,
  "todos",
  Effect.fn(function*(handlers) {
    const todos = yield* TodosRepository
    return handlers
      .handle("getAllTodos", () => todos.getAll)
      .handle("getTodoById", ({ params: { id } }) => todos.getById(id))
      .handle("createTodo", ({ payload: { text } }) => todos.create(text))
      .handle("completeTodo", ({ params: { id } }) => todos.complete(id))
      .handle("removeTodo", ({ params: { id } }) => todos.remove(id))
  })
)

export const ApiLive = Layer.provide(HttpApiBuilder.layer(TodosApi), TodosApiLive)
