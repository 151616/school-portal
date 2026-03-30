import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, functions } from "@/firebase";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import Toasts from "@/shared/components/Toasts";
import { addToast } from "@/shared/toastService";
import { CheckIcon } from "@/shared/icons";
import type { ClaimParentCodeData, ClaimParentCodeResult } from "@/types";

export default function ParentSignup() {
  const navigate = useNavigate();
  const [parentCode, setParentCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastInitial, setLastInitial] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const lastInitialRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const handleSignup = async () => {
    if (submitting) return;

    const code = parentCode.trim().toUpperCase();
    if (!code) {
      addToast("error", "Enter your child's parent code.");
      return;
    }
    if (!email.trim()) {
      addToast("error", "Enter your email address.");
      return;
    }
    if (password.length < 8) {
      addToast("error", "Password must be at least 8 characters.");
      return;
    }
    if (!firstName.trim()) {
      addToast("error", "Enter your first name.");
      return;
    }
    if (!lastInitial.trim()) {
      addToast("error", "Enter your last initial.");
      return;
    }

    setSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      try {
        const claimParentCode = httpsCallable<ClaimParentCodeData, ClaimParentCodeResult>(functions, "claimParentCode");
        await claimParentCode({
          code,
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
        });

        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true);
        }

        try {
          if (auth.currentUser) await sendEmailVerification(auth.currentUser);
        } catch (verifyErr) {
          console.error("Verification email error:", verifyErr);
        }

        addToast("success", "Account created! You are now linked to your child.");
        navigate("/");
      } catch (claimErr) {
        console.error("Parent code claim error:", claimErr);

        if (
          auth.currentUser &&
          auth.currentUser.uid === userCredential.user.uid
        ) {
          try {
            await deleteUser(userCredential.user);
          } catch (rollbackErr) {
            console.error("Rollback failed:", rollbackErr);
          }
        }

        const claimErrMsg = claimErr instanceof Error ? claimErr.message : "";
        const msg = claimErrMsg.includes("not-found")
          ? "Parent code not found. Check with your child or school."
          : claimErrMsg || "Signup failed. Please try again.";
        addToast("error", msg);
      }
    } catch (authErr) {
      console.error("Signup auth error:", authErr);
      const authErrCode = (authErr as { code?: string }).code;
      const authErrMsg = authErr instanceof Error ? authErr.message : "Signup failed.";
      const msg =
        authErrCode === "auth/email-already-in-use"
          ? "This email already has an account. Try logging in instead."
          : authErrMsg;
      addToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <Toasts />
        <div className="card-header">
          <h2>Parent Signup</h2>
          <div className="muted">
            Create your parent account using the code from your child's student
            portal.
          </div>
        </div>

        <div className="section">
          <div className="auth-form-stack">
            <input
              ref={codeRef}
              className="input auth-field"
              type="text"
              placeholder="Parent code (e.g. KGR-A3X9)"
              value={parentCode}
              onChange={(e) => setParentCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  document.getElementById("parent-email")?.focus();
              }}
              maxLength={8}
              autoComplete="off"
              style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}
            />
            <input
              id="parent-email"
              className="input auth-field"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  document.getElementById("parent-fname")?.focus();
              }}
              autoComplete="email"
            />
            <input
              id="parent-fname"
              className="input auth-field"
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lastInitialRef.current?.focus();
              }}
              autoComplete="given-name"
            />
            <input
              ref={lastInitialRef}
              className="input auth-field"
              type="text"
              placeholder="Last initial"
              value={lastInitial}
              onChange={(e) => setLastInitial(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") passwordRef.current?.focus();
              }}
              maxLength={1}
              autoComplete="family-name"
            />
            <input
              ref={passwordRef}
              className="input auth-field"
              type="password"
              placeholder="Set your password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) handleSignup();
              }}
              autoComplete="new-password"
            />
            <button
              className="btn btn-primary auth-form-submit auth-action"
              disabled={submitting}
              onClick={handleSignup}
            >
              <CheckIcon className="icon" />{" "}
              {submitting ? "Creating Account..." : "Create Parent Account"}
            </button>
            <div className="small muted" style={{ textAlign: "center" }}>
              Already have an account?{" "}
              <a href="/" style={{ color: "var(--accent)" }}>
                Log in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
