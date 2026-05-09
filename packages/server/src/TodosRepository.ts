import { Todo, TodoId, TodoNotFound } from "@template/domain/TodosApi"
import { Context, Effect, HashMap, Layer, Option, Ref } from "effect"

export class TodosRepository extends Context.Service<TodosRepository>()("api/TodosRepository", {
  make: Effect.gen(function*() {
    const todos = yield* Ref.make(HashMap.empty<TodoId, Todo>())

    const getAll = Ref.get(todos).pipe(
      Effect.map((todos) => Array.from(HashMap.values(todos)))
    )

    const getById = Effect.fn("TodosRepository.getById")(function*(id: TodoId) {
      const map = yield* Ref.get(todos)
      const todo = HashMap.get(id)(map)
      if (Option.isNone(todo)) {
        return yield* new TodoNotFound({ id })
      }
      return todo.value
    })

    const create = Effect.fn("TodosRepository.create")(function*(text: string) {
      const map = yield* Ref.get(todos)
      const maxId = HashMap.reduce(map, 0, (max, todo) => todo.id > max ? todo.id : max)
      const id = TodoId.make(maxId + 1)
      const todo = new Todo({ id, text, done: false })
      yield* Ref.update(todos, HashMap.set(id, todo))
      return todo
    })

    const complete = Effect.fn("TodosRepository.complete")(function*(id: TodoId) {
      const todo = yield* getById(id)
      const updated = new Todo({ ...todo, done: true })
      yield* Ref.update(todos, HashMap.set(id, updated))
      return updated
    })

    const remove = Effect.fn("TodosRepository.remove")(function*(id: TodoId) {
      yield* getById(id)
      yield* Ref.update(todos, HashMap.remove(id))
    })

    return { getAll, getById, create, complete, remove }
  })
}) {
  static readonly layer = Layer.effect(this, this.make)
}
