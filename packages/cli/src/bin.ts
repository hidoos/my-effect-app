import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { cli } from "./Cli.js"
import { TodosClient } from "./TodosClient.js"

const MainLive = TodosClient.layer.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeServices.layer)
)

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLive)))
