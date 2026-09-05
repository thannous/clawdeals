---
name: redis-js
description: Implement or diagnose JavaScript/TypeScript operations using the Upstash Redis SDK, including caching, rate limiting and Redis search.
---

# Upstash Redis

Check the installed SDK version and existing project usage before applying examples. Keep credentials in environment variables or the approved secret store; never print them. Load only the reference needed for the task.

| Task | Reference |
|---|---|
| Initialization, serialization and command overview | [SDK guide](./guide.md) |
| Data structures | [strings](./data-structures/strings.md), [hashes](./data-structures/hashes.md), [lists](./data-structures/lists.md), [sets](./data-structures/sets.md), [sorted sets](./data-structures/sorted-sets.md), [JSON](./data-structures/json.md), [streams](./data-structures/streams.md) |
| Caching and sessions | [caching](./patterns/caching.md), [sessions](./patterns/session-management.md) |
| Rate limits and locks | [rate limiting](./patterns/rate-limiting.md), [locks and limitations](./patterns/distributed-locks.md) |
| Pipelining and scripts | [auto pipeline](./advanced-features/auto-pipeline.md), [transactions](./advanced-features/pipeline-and-transactions.md), [Lua](./advanced-features/scripting.md) |
| Search | [overview](./search/overview.md), then the relevant command guide it identifies |
| Performance | [batching](./performance/batching-operations.md), [errors](./performance/error-handling.md), [TTL](./performance/ttl-expiration.md) |
| Migration | [ioredis](./migrations/from-ioredis.md), [node-redis](./migrations/from-redis-node.md) |

Examples explain SDK operations; they do not authorize production writes or installs. Verify changed behavior with isolated synthetic data within the task's scope.
