import { useState, useCallback, useRef } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 4000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}-${Date.now()}`;
    const toast: Toast = { id, message, variant };
    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return { toasts, show };
}
