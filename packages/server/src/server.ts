import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { createServer } from "node:http"
import { ApiLive } from "./Api.js"
import { TodosRepository } from "./TodosRepository.js"

const HttpLive = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(TodosRepository.layer),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

NodeRuntime.runMain(Layer.launch(HttpLive))
