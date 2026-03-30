import { useState } from "react";
import { ref, set, get } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions, firebaseConfig } from "@/firebase";
import { addToast } from "@/shared/toastService";

interface DiagnosticsState {
  loading: boolean;
  authUser: { uid: string; email: string | null } | null;
  claims: Record<string, unknown> | null;
  usersRead: unknown;
  usersReadError: string | null;
  diagWriteError: string | null;
  inviteCreateError: string | null;
  deployedRules: unknown;
  deployedRulesError: string | null;
  note: string;
}

interface AdminDiagnosticsProps {
  mySchoolId: string | null;
}

const initialDiagnostics: DiagnosticsState = {
  loading: false,
  authUser: null,
  claims: null,
  usersRead: null,
  usersReadError: null,
  diagWriteError: null,
  inviteCreateError: null,
  deployedRules: null,
  deployedRulesError: null,
  note: "",
};

export default function AdminDiagnostics({ mySchoolId: _mySchoolId }: AdminDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(initialDiagnostics);

  const callCreateInvite = async (payload: Record<string, unknown>) => {
    const createInvite = httpsCallable(functions, "createInvite");
    const result = await createInvite(payload);
    return result.data as { inviteId?: string };
  };

  const runDiagnostics = async () => {
    setDiagnostics((s) => ({ ...s, loading: true, note: "" }));

    if (!auth || !auth.currentUser) {
      setDiagnostics({ ...initialDiagnostics, note: "Not authenticated" });
      addToast("error", "Not authenticated - sign in and retry diagnostics");
      return;
    }

    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;

    let claims: Record<string, unknown> | null = null;
    try {
      const idRes = await auth.currentUser.getIdTokenResult(true);
      claims = (idRes.claims as Record<string, unknown>) || {};
    } catch (err) {
      console.error("Failed to getIdTokenResult:", err);
    }

    let usersRead: unknown = null;
    let usersReadError: string | null = null;
    try {
      const usersSnap = await get(ref(db, "Users"));
      usersRead = usersSnap.exists() ? usersSnap.val() : null;
    } catch (err: unknown) {
      usersReadError = err instanceof Error ? err.message : String(err);
      console.error("Error reading /Users:", err);
    }

    let diagWriteErr: string | null = null;
    try {
      const diagRef = ref(db, `Users/${uid}/_diagnostics_test`);
      await set(diagRef, { ts: Date.now(), by: uid });
      await set(diagRef, null);
    } catch (err: unknown) {
      diagWriteErr = err instanceof Error ? err.message : String(err);
      console.error("Write to diagnostics/testWrite failed:", err);
    }

    let inviteCreateErr: string | null = null;
    try {
      const inviteEmail = `diag+${Date.now()}@example.com`;
      const inviteResult = await callCreateInvite({
        email: inviteEmail,
        role: "student",
      });

      if (inviteResult?.inviteId) {
        await set(ref(db, `invites/${inviteResult.inviteId}`), null);
      } else {
        throw new Error("createInvite returned no inviteId");
      }
    } catch (err: unknown) {
      inviteCreateErr = err instanceof Error ? err.message : String(err);
      console.error("createInvite diagnostics failed:", err);
    }

    setDiagnostics({
      loading: false,
      authUser: { uid, email },
      claims,
      usersRead,
      usersReadError,
      diagWriteError: diagWriteErr,
      inviteCreateError: inviteCreateErr,
      deployedRules: null,
      deployedRulesError: null,
      note: "Diagnostics complete",
    });

    addToast("info", "Diagnostics complete - see the panel below");
  };

  const refreshTokenAndRun = async () => {
    if (!auth || !auth.currentUser) {
      addToast("error", "Not signed in");
      return;
    }
    try {
      addToast("info", "Refreshing token...");
      await auth.currentUser.getIdTokenResult(true);
      addToast("info", "Token refreshed");
      await runDiagnostics();
    } catch (err) {
      console.error("Error refreshing token:", err);
      addToast("error", "Token refresh failed");
    }
  };

  const checkDeployedRules = async () => {
    setDiagnostics((s) => ({ ...s, note: "Checking deployed rules..." }));
    try {
      const dbUrl = (firebaseConfig.databaseURL ?? "").replace(/\/$/, "");
      const url = `${dbUrl}/.settings/rules.json`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      setDiagnostics((s) => ({
        ...s,
        deployedRules: json,
        deployedRulesError: null,
        note: "Deployed rules fetched",
      }));
      addToast("success", "Deployed rules fetched (see panel)");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error fetching deployed rules:", err);
      setDiagnostics((s) => ({
        ...s,
        deployedRules: null,
        deployedRulesError: message,
        note: "Error fetching deployed rules",
      }));
      addToast("error", "Unable to fetch deployed rules - check Console or deploy rules");
    }
  };

  return (
    <>
      {diagnostics && diagnostics.note && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "var(--accent-2, #fff7e6)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Diagnostics</strong>
            <div className="small">{diagnostics.loading ? "Running..." : diagnostics.note}</div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div>
                <strong>Auth:</strong>{" "}
                {diagnostics.authUser
                  ? `${diagnostics.authUser.email} (${diagnostics.authUser.uid})`
                  : "Not signed in"}
              </div>
              <button
                className="btn btn-ghost"
                onClick={(e) => {
                  const b = e.currentTarget;
                  b.classList.add("pulse");
                  setTimeout(() => b.classList.remove("pulse"), 260);
                  refreshTokenAndRun();
                }}
                style={{ marginLeft: 8 }}
              >
                Refresh Token & Re-run
              </button>
            </div>

            <div>
              <strong>Admin claim:</strong>{" "}
              {diagnostics.claims && (diagnostics.claims as Record<string, unknown>).admin ? "Yes" : "No"}
            </div>
            <div>
              <strong>/Users read:</strong>{" "}
              {diagnostics.usersReadError
                ? `Error: ${diagnostics.usersReadError}`
                : diagnostics.usersRead
                ? "OK"
                : "Empty"}
            </div>
            <div>
              <strong>Diagnostics write:</strong>{" "}
              {diagnostics.diagWriteError ? `Error: ${diagnostics.diagWriteError}` : "OK"}
            </div>
            <div>
              <strong>Invite create:</strong>{" "}
              {diagnostics.inviteCreateError
                ? `Error: ${diagnostics.inviteCreateError}`
                : "OK (callable path)"}
            </div>

            <div style={{ marginTop: 10 }}>
              <strong>Deploy helper:</strong>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const cmd = "firebase deploy --only database";
                    navigator.clipboard.writeText(cmd);
                    addToast("success", "Deploy command copied");
                  }}
                >
                  Copy deploy command
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    window.open(
                      `https://console.firebase.google.com/project/${firebaseConfig.projectId}/database/rules`,
                      "_blank"
                    )
                  }
                >
                  Open Rules Console
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={(e) => {
                    const b = e.currentTarget;
                    b.classList.add("pulse");
                    setTimeout(() => b.classList.remove("pulse"), 260);
                    checkDeployedRules();
                  }}
                >
                  Check deployed rules
                </button>
              </div>
              {diagnostics.deployedRulesError && (
                <div
                  className="small"
                  style={{ color: "var(--danger,#b33)", marginTop: 8 }}
                >
                  Error fetching deployed rules: {diagnostics.deployedRulesError}
                </div>
              )}
              {diagnostics.deployedRules != null && (
                <pre
                  style={{
                    marginTop: 8,
                    maxHeight: 200,
                    overflow: "auto",
                    background: "#fff",
                    padding: 8,
                    borderRadius: 6,
                  }}
                >
                  {JSON.stringify(diagnostics.deployedRules, null, 2)}
                </pre>
              )}
            </div>

            {(!diagnostics.claims || !(diagnostics.claims as Record<string, unknown>).admin) &&
              diagnostics.inviteCreateError && (
                <div style={{ marginTop: 8, color: "#7a3" }}>
                  <em>
                    Hint: Invite creation requires a live admin claim. Sign out and back in if
                    this user was promoted recently.
                  </em>
                </div>
              )}
          </div>
        </div>
      )}

      <div
        className="section"
        style={{ marginTop: 28, display: "flex", justifyContent: "center" }}
      >
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            const b = e.currentTarget;
            b.classList.add("pulse");
            setTimeout(() => b.classList.remove("pulse"), 260);
            runDiagnostics();
          }}
        >
          Having a problem? Report it!
        </button>
      </div>
    </>
  );
}
