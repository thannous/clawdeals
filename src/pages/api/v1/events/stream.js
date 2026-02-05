import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { methodNotAllowed } from "../../../server/http/methods";

async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  res.write("event: ping\n");
  res.write("data: {}\n\n");

  setTimeout(() => {
    if (!res.writableEnded) res.end();
  }, 1000);

  return null;
}

export default withApiMiddlewares(handler, {
  enableIdempotency: false
});
