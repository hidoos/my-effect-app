import type { TodoId } from "@template/domain/TodosApi"
import { TodosApi } from "@template/domain/TodosApi"
import { Context, Effect, Layer } from "effect"
import { HttpApiClient } from "effect/unstable/httpapi"

export class TodosClient extends Context.Service<TodosClient>()("cli/TodosClient", {
  make: Effect.gen(function*() {
    const client = yield* HttpApiClient.make(TodosApi, {
      baseUrl: "http://localhost:3000"
    })

    const create = Effect.fn("TodosClient.create")(function*(text: string) {
      const todo = yield* client.todos.createTodo({ payload: { text } })
      yield* Effect.logInfo("Created todo: ", todo)
      return todo
    })

    const list = Effect.fn("TodosClient.list")(function*() {
      const todos = yield* client.todos.getAllTodos()
      yield* Effect.logInfo(todos)
      return todos
    })

    const complete = Effect.fn("TodosClient.complete")(function*(id: TodoId) {
      const todo = yield* client.todos.completeTodo({ params: { id } })
      yield* Effect.logInfo("Marked todo completed: ", todo)
      return todo
    })

    const remove = Effect.fn("TodosClient.remove")(function*(id: TodoId) {
      yield* client.todos.removeTodo({ params: { id } })
      yield* Effect.logInfo(`Deleted todo with id: ${id}`)
    })

    return { create, list, complete, remove }
  })
}) {
  static readonly layer = Layer.effect(this, this.make)
}
