import Link from "next/link";
import type { ComponentProps } from "react";

type MarketingLinkProps = ComponentProps<typeof Link>;

/**
 * Marketing pages often expose many links at once; disabling automatic prefetch by default
 * avoids noisy chunk prefetch failures on edge-proxied hosts.
 */
export default function MarketingLink({ prefetch = false, ...props }: MarketingLinkProps) {
  return <Link prefetch={prefetch} {...props} />;
}
