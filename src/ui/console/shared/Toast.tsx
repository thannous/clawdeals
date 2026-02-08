import type { Toast as ToastType } from "./useToast";

const VARIANT_CLASSES: Record<string, string> = {
  success: "border-secondary/40 text-secondary bg-secondary/10",
  error: "border-red-400/40 text-red-400 bg-red-400/10",
  info: "border-primary/40 text-primary bg-primary/10",
};

interface Props {
  toasts: ToastType[];
}

export default function Toast({ toasts }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-2.5 text-xs font-mono font-bold border rounded shadow-lg backdrop-blur-sm ${VARIANT_CLASSES[toast.variant] || VARIANT_CLASSES.info}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
