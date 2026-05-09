# Effect v4 完全指南

> 本指南基于一个真实的 Todo API 项目（CLI + Server），系统讲解 Effect v4 的核心概念与 API。
>
> 涵盖：Schema、Context.Service、Layer、HttpApi、HttpApiClient、CLI、Effect.fn、错误处理、运行时启动，以及 v3 → v4 的关键变化。

---

## 目录

1. [Schema — 类型安全的数据建模](#1-schema--类型安全的数据建模)
2. [Context.Service — 服务定义模式](#2-contextservice--服务定义模式)
3. [Layer — 依赖注入与组合](#3-layer--依赖注入与组合)
4. [HttpApi — 类型安全的 HTTP API](#4-httpapi--类型安全的-http-api)
5. [HttpApiClient — 类型安全的 HTTP 客户端](#5-httpapiclient--类型安全的-http-客户端)
6. [CLI — 命令行接口](#6-cli--命令行接口)
7. [Effect 核心模式](#7-effect-核心模式)
8. [运行时启动](#8-运行时启动)
9. [v3 → v4 关键变化总结](#9-v3--v4-关键变化总结)

---

## 1. Schema — 类型安全的数据建模

Effect v4 的 Schema 系统是整个生态的基石。**所有数据形状都应该先用 Schema 定义**，再用于 HTTP 接口、数据库模型、配置解析等。

### 1.1 Schema.Class — 命名数据模型

用 `Schema.Class` 定义具有名称的结构化数据，支持 `instanceof` 判别和构造函数实例化。

```ts
// packages/domain/src/TodosApi.ts
export class Todo extends Schema.Class<Todo>("Todo")({
  id: TodoId,
  text: Schema.Trimmed.check(Schema.isNonEmpty()),
  done: Schema.Boolean
}) {}
```

**要点：**
- `Schema.Class<Name>("Name")({ fields })` 创建一个**类构造函数**
- 可以用 `new Todo({ id, text, done })` 直接实例化
- 支持 `instanceof` 判别，在 `Schema.Union` 中特别有用
- **用于所有解码形状**：HTTP 响应体、API payload、领域模型等

### 1.2 Schema.TaggedErrorClass — 带标签的 HTTP 错误

为业务错误定义带 `_tag` 的类，可附加 HTTP 状态码。

```ts
export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.Number },
  { httpApiStatus: 404 }
) {}
```

**要点：**
- 自动附加 `_tag: "TodoNotFound"` 字段
- `{ httpApiStatus: 404 }` 让 HTTP API 层自动映射为 404 状态码
- 在 Effect 错误通道中使用：`yield* new TodoNotFound({ id })`

### 1.3 Brand — Branded Types 防止参数混淆

通过 branding 在编译时区分语义上不同的同构类型。

```ts
export const TodoId = Schema.Number.pipe(Schema.brand("TodoId"))
export type TodoId = typeof TodoId.Type

export const TodoIdFromString = Schema.NumberFromString.pipe(Schema.brand("TodoId"))
```

**要点：**
- `Schema.brand("TodoId")` 让 `number` 变成编译时区分的 `TodoId` 类型
- `TodoId.make(1)` 创建 branded 值
- `NumberFromString` 自动处理字符串→数字解码（用于 URL 参数 `:id`）

### 1.4 校验、组合与常用类型

```ts
Schema.Trimmed.check(Schema.isNonEmpty())  // 非空且去除首尾空白
Schema.Array(Todo)                         // Todo 数组
Schema.Void                                // 无返回值
Schema.Boolean / Schema.String / Schema.Number  // 基础类型
Schema.OptionFromNullishOr(Schema.String)  // null/undefined → Option
```

### 1.5 JSON 边界处理

Effect 项目中不要用原生 `JSON.parse`/`JSON.stringify`。

```ts
import * as Schema from "effect/Schema"

// 未知 JSON 字符串
const UnknownJson = Schema.UnknownFromJsonString

// 已知类型 JSON 字符串
const UserJson = Schema.fromJsonString(User)

const decode = Schema.decodeUnknownEffect(UserJson)
const encode = Schema.encodeUnknownEffect(UserJson)
```

---

## 2. Context.Service — 服务定义模式

Effect v4 中，`Effect.Service` 已被移除，统一使用 `Context.Service`。

### 2.1 定义服务

```ts
// packages/server/src/TodosRepository.ts
export class TodosRepository extends Context.Service<TodosRepository>()(
  "api/TodosRepository",
  {
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

      // ... create, complete, remove

      return { getAll, getById, create, complete, remove }
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
```

**三要素：**
1. **类型** — `Context.Service<Self>()`
2. **唯一 key** — `"api/TodosRepository"`
3. **构造函数** — `{ make: Effect }`

**要点：**
- `make` 是一个 `Effect`，可以 `yield*` 依赖其他服务
- v3 的 `accessors: true` 已移除，通过 `yield* TodosRepository` 获取实例
- 显式定义 `static readonly layer` 供外部组合使用

### 2.2 获取服务实例

```ts
const todos = yield* TodosRepository
```

### 2.3 在 Effect 中使用服务

```ts
TodosClient.use((client) => client.create(todo))
```

等价于：

```ts
Effect.gen(function*() {
  const client = yield* TodosClient
  return yield* client.create(todo)
})
```

---

## 3. Layer — 依赖注入与组合

Layer 是 Effect 的依赖注入系统，相当于**带类型的构造函数**。

### 3.1 Layer 类型签名

```
Layer<Output, Error, Input>
//   提供什么    可能失败   需要什么
```

### 3.2 创建 Layer

```ts
// 直接提供（无依赖）
Layer.succeed(ServiceTag, implementation)

// Effect 构造（有依赖）
Layer.effect(ServiceTag, Effect.gen(function*() {
  const dep = yield* OtherService
  return { ... }
}))
```

### 3.3 Layer 组合

```ts
// packages/server/src/server.ts
const HttpLive = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(TodosRepository.layer),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// packages/cli/src/bin.ts
const MainLive = TodosClient.layer.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeServices.layer)
)
```

**要点：**
- `Layer.provide(that)` — `self` 需要 `that` 提供的东西
- `Layer.merge` — 合并两个 Layer 的输出
- 类型系统会追踪所有未满足的需求，直到 `R = never`

### 3.4 隔离性

当需要隔离（而非共享）Layer 实例时：

```ts
const runIsolated = program.pipe(
  Effect.provide(Layer.fresh(AppLayer), { local: true })
)
```

### 3.5 运行 Layer

```ts
NodeRuntime.runMain(Layer.launch(HttpLive))
```

`Layer.launch` 将 Layer 启动为一个长期运行的 Effect。

---

## 4. HttpApi — 类型安全的 HTTP API

Effect v4 的 HTTP API 是 **schema-first** 的，定义和实现完全分离。

### 4.1 定义 API

```ts
// packages/domain/src/TodosApi.ts
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
```

**配置项：**
- `success` — 成功响应的 schema
- `error` — 错误响应的 schema（必须是用 `Schema.TaggedErrorClass` 定义且带 `httpApiStatus`）
- `params` — URL 参数（如 `:id`）的解码 schema
- `payload` — 请求体的解码 schema（必须是 schema 值，如 `Schema.Class`）

> ⚠️ v4 中 `del` 被重命名为 `delete`

### 4.2 实现 API（Server）

```ts
// packages/server/src/Api.ts
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
```

**要点：**
- `HttpApiBuilder.group(Api, "groupName", handler)` 注册路由组
- 回调接收 `handlers`，通过 `.handle("endpointName", fn)` 绑定处理函数
- 处理函数参数解构：
  - `{ params: { id } }` — URL 参数
  - `{ payload: { text } }` — 请求体
- `yield* TodosRepository` 获取仓库服务

### 4.3 启动 Server

```ts
// packages/server/src/server.ts
import { createServer } from "node:http"

const HttpLive = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(TodosRepository.layer),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

NodeRuntime.runMain(Layer.launch(HttpLive))
```

---

## 5. HttpApiClient — 类型安全的 HTTP 客户端

从同一个 API Schema 可以**自动生成**类型安全的客户端，零额外代码。

```ts
// packages/cli/src/TodosClient.ts
export class TodosClient extends Context.Service<TodosClient>()(
  "cli/TodosClient",
  {
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
        return yield* client.todos.getAllTodos()
      })

      const complete = Effect.fn("TodosClient.complete")(function*(id: TodoId) {
        return yield* client.todos.completeTodo({ params: { id } })
      })

      const remove = Effect.fn("TodosClient.remove")(function*(id: TodoId) {
        yield* client.todos.removeTodo({ params: { id } })
      })

      return { create, list, complete, remove }
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
```

**要点：**
- `HttpApiClient.make(TodosApi, { baseUrl })` 自动生成客户端
- 访问方式：`client.todos.createTodo({ payload: { text } })`
- 参数与 server handler 对应：`payload` / `params`
- 返回类型完全由 schema 推导，零运行时类型风险

---

## 6. CLI — 命令行接口

Effect v4 的 CLI 模块位于 `effect/unstable/cli`。

### 6.1 参数与选项

```ts
// packages/cli/src/Cli.ts
const todoArg = Argument.string("todo").pipe(
  Argument.withDescription("The message associated with a todo")
)

const todoId = Flag.withSchema(Flag.integer("id"), TodoId).pipe(
  Flag.withDescription("The identifier of the todo")
)
```

**要点：**
- `Argument.string("name")` — 位置参数
- `Flag.integer("id")` — 整数选项（如 `--id 1`）
- `Flag.withSchema(flag, Schema)` — 用 schema 校验/转换选项值（这里将 `number` 转为 `TodoId`）

### 6.2 命令定义

```ts
const add = Command.make("add", { todo: todoArg }).pipe(
  Command.withDescription("Add a new todo"),
  Command.withHandler(({ todo }) =>
    TodosClient.use((client) => client.create(todo).pipe(Effect.asVoid))
  )
)
```

**要点：**
- `Command.make("name", { args })` 创建命令
- `Command.withHandler(fn)` 绑定处理函数
- 处理函数参数自动解构为 `{ todo }`

### 6.3 组合与运行

```ts
const command = Command.make("todo").pipe(
  Command.withSubcommands([add, done, list, remove])
)

export const cli = Command.run(command, { version: "0.0.0" })
```

```ts
// packages/cli/src/bin.ts
NodeRuntime.runMain(cli.pipe(Effect.provide(MainLive)))
```

---

## 7. Effect 核心模式

### 7.1 Effect.fn — 命名的 Effect 函数

```ts
const create = Effect.fn("TodosRepository.create")(function*(text: string) {
  const map = yield* Ref.get(todos)
  const maxId = HashMap.reduce(map, 0, (max, todo) => todo.id > max ? todo.id : max)
  const id = TodoId.make(maxId + 1)
  const todo = new Todo({ id, text, done: false })
  yield* Ref.update(todos, HashMap.set(id, todo))
  return todo
})
```

**要点：**
- `Effect.fn("Name")` 为 Effect 命名，用于追踪、调试、日志和 metrics
- 内部用 `function*` + `yield*` 写异步 / effectful 逻辑
- 等价于 `Effect.gen(function*() { ... })` 的简写形式

### 7.2 错误处理 — 精确捕获

```ts
const todo = HashMap.get(id)(map)
if (Option.isNone(todo)) {
  return yield* new TodoNotFound({ id })
}
return todo.value
```

**要点：**
- `HashMap.get` 返回 `Option<Todo>`（不是 `Todo | undefined`）
- `Option.isNone` / `Option.isSome` 检查
- 业务错误用 `yield* new TaggedErrorClass(...)` 进入错误通道
- **不要用 `throw`，不要用 `try/catch`**

### 7.3 恢复策略

```ts
const findUserOptional = (id: string) =>
  findUser(id).pipe(
    Effect.map(Option.some),
    Effect.catchTag("UserNotFoundError", () => Effect.succeed(Option.none()))
  )
```

**要点：**
- `Effect.catchTag` — 按错误标签精确捕获
- `Effect.catchFilter` — 按条件捕获
- 不要用宽泛的 fallback 隐藏不相关的失败

### 7.4 Ref — 可变引用

```ts
const todos = yield* Ref.make(HashMap.empty<TodoId, Todo>())

yield* Ref.update(todos, HashMap.set(id, todo))
```

**要点：**
- `Ref.make` 创建可变引用
- `Ref.get` / `Ref.set` / `Ref.update` 操作引用
- 在并发环境下是安全的

### 7.5 Option — 处理可能不存在的值

```ts
import * as Option from "effect/Option"

const fromNullableName = (name: string | null | undefined) =>
  pipe(
    Option.fromNullishOr(name),
    Option.filter((value) => value.length > 0)
  )
```

**要点：**
- 领域内避免 `| null` 和 `| undefined`
- 边界处用 `Option.fromNullishOr` 转换
- 消费时用 `Option.map`、`Option.flatMap`、`Option.match`、`Option.getOrElse`
- **不要用 `Option.getOrThrow`**

### 7.6 Match — 穷举分支

```ts
import { Match } from "effect"

const phaseLabel = (phase: "draft" | "running" | "done") =>
  Match.value(phase).pipe(
    Match.when("draft", () => "draft"),
    Match.when("running", () => "running"),
    Match.when("done", () => "done"),
    Match.exhaustive
  )
```

**要点：**
- 替换脆弱的 if/else 和 switch
- `Match.exhaustive` 确保所有分支都被处理
- 数组空判断用 `Arr.match`

---

## 8. 运行时启动

### 8.1 Server 入口

```ts
// packages/server/src/server.ts
NodeRuntime.runMain(Layer.launch(HttpLive))
```

### 8.2 CLI 入口

```ts
// packages/cli/src/bin.ts
const MainLive = TodosClient.layer.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeServices.layer)
)

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLive)))
```

**要点：**
- `NodeRuntime.runMain` 运行 Effect 程序，处理信号和优雅退出
- 必须确保所有依赖都被满足（`R = never`）
- `NodeServices.layer` 提供 CLI 所需的平台服务（`FileSystem`, `Path`, `Terminal`, `Stdio`, `ChildProcessSpawner`）
- `NodeHttpClient.layerUndici` 提供 HTTP 客户端实现

---

## 9. v3 → v4 关键变化总结

| 概念 | v3 | v4 |
|------|-----|-----|
| 服务定义 | `Effect.Service` / `Context.Tag` | `Context.Service<Self>()("key", { make })` |
| accessor | `accessors: true` 自动生成 | 移除，用 `yield* Service` 或 `Service.use` |
| Layer | 常隐式生成 | 显式 `static readonly layer` |
| HTTP API | `@effect/platform` + `@effect/http` | `effect/unstable/httpapi` |
| endpoint delete | `del` | `delete` |
| endpoint payload | 直接传对象 | 传 `Schema.Class` / `Schema.Struct` 值 |
| 客户端参数 | `path` | `params` |
| CLI | `@effect/cli` | `effect/unstable/cli` |
| CLI args | `Args` | `Argument` |
| CLI options | `Options` | `Flag` |
| vitest | `@effect/vitest@0.x` | `@effect/vitest@4.x-beta` |

---

## 参考

- [Effect 官方文档](https://effect.website/docs)
- [Effect v4 GitHub](https://github.com/Effect-TS/effect)
- [Effect Schema 文档](https://effect.website/docs/schema/introduction)
