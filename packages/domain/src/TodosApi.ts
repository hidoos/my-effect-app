import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const TodoId = Schema.Number.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

export const TodoIdFromString = Schema.NumberFromString.pipe(Schema.brand("TodoId"))

export class Todo extends Schema.Class<Todo>("Todo")({
  id: TodoId,
  text: Schema.Trimmed.check(Schema.isNonEmpty()),
  done: Schema.Boolean
}) {}

export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()("TodoNotFound", {
  id: Schema.Number
}, { httpApiStatus: 404 }) {}

export class CreateTodoPayload extends Schema.Class<CreateTodoPayload>("CreateTodoPayload")({
  text: Schema.Trimmed.check(Schema.isNonEmpty())
}) {}

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("getAllTodos", "/todos", {
      success: Schema.Array(Todo)
    }),
    HttpApiEndpoint.get("getTodoById", "/todos/:id", {
      success: Todo,
      error: TodoNotFound,
      params: { id: TodoIdFromString }
    }),
    HttpApiEndpoint.post("createTodo", "/todos", {
      success: Todo,
      payload: CreateTodoPayload
    }),
    HttpApiEndpoint.patch("completeTodo", "/todos/:id", {
      success: Todo,
      error: TodoNotFound,
      params: { id: TodoIdFromString }
    }),
    HttpApiEndpoint.delete("removeTodo", "/todos/:id", {
      success: Schema.Void,
      error: TodoNotFound,
      params: { id: TodoIdFromString }
    })
  )
{}

export class TodosApi extends HttpApi.make("api").add(TodosApiGroup) {}
