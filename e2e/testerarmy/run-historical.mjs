// Preserve the documented historical entry; one implementation owns output,
// app/worker preload isolation, signals and source/input receipts.
import { execute } from "./run.mjs";
await execute({ historical: true });
