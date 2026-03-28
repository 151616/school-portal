import { useState, useEffect } from "react";
import { ref, set, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { addToast } from "../toastService";

export default function AdminSettings() {
  const [caWeight, setCaWeight] = useState<number>(40);
  const [examWeight, setExamWeight] = useState<number>(60);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    const settingsRef = ref(db, "schoolSettings/default");
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setCaWeight(data.caWeight ?? 40);
        setExamWeight(data.examWeight ?? 60);
      }
      setSettingsLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSaveSchoolSettings = async () => {
    const ca = Number(caWeight);
    const exam = Number(examWeight);
    if (isNaN(ca) || isNaN(exam) || ca < 0 || exam < 0) {
      addToast("error", "Weights must be positive numbers.");
      return;
    }
    if (ca + exam !== 100) {
      addToast("error", "CA + Exam weights must equal 100%.");
      return;
    }
    try {
      await set(ref(db, "schoolSettings/default"), {
        caWeight: ca,
        examWeight: exam,
        updatedAt: Date.now(),
      });
      addToast("success", "School settings saved.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Save settings error:", err);
      addToast("error", "Failed to save settings: " + message);
    }
  };

  if (settingsLoading) {
    return <div className="small">Loading settings...</div>;
  }

  return (
    <>
      <div className="section">
        <h3>Grading Weights</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>
          Configure how CA and Exam scores are weighted for grade calculations.
        </div>
        <div className="form-row" style={{ gap: 12, alignItems: "center" }}>
          <label className="small">
            CA Weight (%):
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              value={caWeight}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCaWeight(val);
                setExamWeight(100 - val);
              }}
              style={{ width: 80, marginLeft: 8 }}
            />
          </label>
          <label className="small">
            Exam Weight (%):
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              value={examWeight}
              onChange={(e) => {
                const val = Number(e.target.value);
                setExamWeight(val);
                setCaWeight(100 - val);
              }}
              style={{ width: 80, marginLeft: 8 }}
            />
          </label>
          <button className="btn btn-primary" onClick={handleSaveSchoolSettings}>
            Save
          </button>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Current: CA {caWeight}% + Exam {examWeight}% = {Number(caWeight) + Number(examWeight)}%
        </div>
      </div>

      <div className="section">
        <h3>Parent Portal</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>
          Generate parent codes for existing students who don't have one yet. New students get codes automatically.
        </div>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            try {
              const backfill = httpsCallable<void, { generated: number; skipped: number }>(functions, "backfillParentCodes");
              const result = await backfill();
              addToast(
                "success",
                `Parent codes: ${result.data.generated} generated, ${result.data.skipped} already had codes.`
              );
            } catch (err: unknown) {
              console.error("Backfill error:", err);
              addToast("error", "Failed to backfill parent codes.");
            }
          }}
        >
          Generate Parent Codes for Existing Students
        </button>
      </div>
    </>
  );
}
