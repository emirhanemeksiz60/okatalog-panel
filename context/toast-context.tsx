"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

type ToastType = "success" | "error";
type ToastState = { id: number; type: ToastType; message: string } | null;

const ToastContext = createContext<{
  show: (type: ToastType, message: string) => void;
} | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  const show = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "success" ? "#15803d" : "#b91c1c",
            color: "#fff",
          }}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
