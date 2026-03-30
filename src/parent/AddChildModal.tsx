import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { addToast } from "@/shared/toastService";
import { CheckIcon } from "@/shared/icons";

interface AddChildModalProps {
  onClose: () => void;
  onLinked?: () => void;
}

export default function AddChildModal({ onClose, onLinked }: AddChildModalProps) {
  const [code, setCode] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleLink = async () => {
    if (submitting) return;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      addToast("error", "Enter a parent code.");
      return;
    }

    setSubmitting(true);
    try {
      const linkChild = httpsCallable<{ code: string }, { studentName?: string }>(functions, "linkAdditionalChild");
      const result = await linkChild({ code: trimmed });
      const name = result.data?.studentName || "your child";
      addToast("success", `Linked to ${name}!`);
      if (onLinked) onLinked();
      onClose();
    } catch (err) {
      console.error("Link child error:", err);
      const error = err as Error;
      const msg = error?.message?.includes("already-exists")
        ? "This child is already linked to your account."
        : error?.message?.includes("not-found")
        ? "Parent code not found. Check with your child or school."
        : error?.message || "Failed to link child.";
      addToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3>Add Another Child</h3>
          <button className="btn btn-ghost" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="section">
          <div className="muted small" style={{ marginBottom: 8 }}>
            Enter the parent code from your child's student portal.
          </div>
          <input
            className="input"
            type="text"
            placeholder="Parent code (e.g. KGR-A3X9)"
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter" && !submitting) handleLink();
            }}
            maxLength={8}
            autoFocus
            style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}
          />
          <button
            className="btn btn-primary"
            disabled={submitting}
            onClick={handleLink}
            style={{ marginTop: 8, width: "100%" }}
          >
            <CheckIcon className="icon" />{" "}
            {submitting ? "Linking..." : "Link Child"}
          </button>
        </div>
      </div>
    </div>
  );
}
