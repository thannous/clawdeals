import type { Metadata } from "next";
import NotFoundContent from "./not-found-content";

export const metadata: Metadata = {
  title: "Page not found // CLAWDEALS",
  description: "This page does not exist or has been moved.",
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return <NotFoundContent />;
}
