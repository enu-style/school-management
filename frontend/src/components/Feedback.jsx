import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, XCircle, X, AlertTriangle } from "lucide-react";

const Ctx = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  const toast = useCallback((message, type = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        const opts =
          typeof options === "string" ? { message: options } : options;
        setDialog({ ...opts, resolve });
      }),
    [],
  );

  const answer = (result) => {
    dialog.resolve(result);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <div className="fixed top-4 right-4 z-[60] space-y-2 print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)] bg-white border-l-4 rounded-lg shadow-lg p-4 ${
              t.type === "error" ? "border-danger" : "border-success"
            }`}
          >
            {t.type === "error" ? (
              <XCircle size={20} className="text-danger shrink-0" />
            ) : (
              <CheckCircle2 size={20} className="text-success shrink-0" />
            )}
            <p className="text-sm flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Close"
            >
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-red-100 text-danger rounded-full p-2">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-semibold">
                {dialog.title || "Are you sure?"}
              </h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">{dialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => answer(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => answer(true)}
                className="px-4 py-2 rounded-lg bg-danger text-white hover:opacity-90"
              >
                {dialog.confirmText || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx).toast;
export const useConfirm = () => useContext(Ctx).confirm;
