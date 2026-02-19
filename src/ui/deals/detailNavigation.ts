export const DEAL_DETAIL_FROM_BROWSE_DEALS = "browse-deals";

function resolveQueryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function resolveDealBackHref(from: string | string[] | undefined): string {
  if (resolveQueryValue(from) === DEAL_DETAIL_FROM_BROWSE_DEALS) {
    return "/browse/deals";
  }
  return "/deals";
}
