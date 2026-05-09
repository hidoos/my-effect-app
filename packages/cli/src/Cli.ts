import { TodoId } from "@template/domain/TodosApi"
import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { TodosClient } from "./TodosClient.js"

const todoArg = Argument.string("todo").pipe(
  Argument.withDescription("The message associated with a todo")
)

const todoId = Flag.withSchema(Flag.integer("id"), TodoId).pipe(
  Flag.withDescription("The identifier of the todo")
)

const add = Command.make("add", { todo: todoArg }).pipe(
  Command.withDescription("Add a new todo"),
  Command.withHandler(({ todo }) => TodosClient.use((client) => client.create(todo).pipe(Effect.asVoid)))
)

const done = Command.make("done", { id: todoId }).pipe(
  Command.withDescription("Mark a todo as done"),
  Command.withHandler(({ id }) => TodosClient.use((client) => client.complete(id).pipe(Effect.asVoid)))
)

const list = Command.make("list").pipe(
  Command.withDescription("List all todos"),
  Command.withHandler(() => TodosClient.use((client) => client.list().pipe(Effect.asVoid)))
)

const remove = Command.make("remove", { id: todoId }).pipe(
  Command.withDescription("Remove a todo"),
  Command.withHandler(({ id }) => TodosClient.use((client) => client.remove(id).pipe(Effect.asVoid)))
)

const command = Command.make("todo").pipe(
  Command.withSubcommands([add, done, list, remove])
)

export const cli = Command.run(command, {
  version: "0.0.0"
})
