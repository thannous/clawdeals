import { getNeonAuth } from "../../../../server/auth/neon-auth";

type RouteContext = { params: Promise<{ path: string[] }> };

function handlers() {
  return getNeonAuth().handler();
}

export function GET(request: Request, context: RouteContext) {
  return handlers().GET(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return handlers().POST(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return handlers().PUT(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return handlers().DELETE(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return handlers().PATCH(request, context);
}
