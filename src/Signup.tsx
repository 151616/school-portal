import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { auth, db, functions } from "./firebase";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import Toasts from "@/shared/components/Toasts";
import { addToast } from "@/shared/toastService";
import { CheckIcon } from "@/shared/icons";
import { ref, get } from "firebase/database";
import type { Invite, AssignRoleData, AssignRoleResult } from "./types";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastInitial, setLastInitial] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const lastInitialRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const inviteId = searchParams.get("inviteId");

  useEffect(() => {
    if (!inviteId) {
      addToast("error", "No invite ID provided");
      navigate("/");
      return;
    }

    const fetchInvite = async () => {
      const inviteSnap = await get(ref(db, `invites/${inviteId}`));
      const inviteData = inviteSnap.val();
      if (!inviteData) {
        addToast("error", "Invalid invite");
        navigate("/");
        return;
      }
      if (inviteData.used) {
        addToast("error", "This invite has already been used");
        navigate("/");
        return;
      }
      setInvite(inviteData);
      setEmail(inviteData.email);
      setLoading(false);
    };

    fetchInvite();
  }, [inviteId, navigate]);

  const handleSignup = async () => {
    if (submitting) return;
    if (!password) {
      addToast("error", "Enter a password!");
      return;
    }
    if (password.length < 8) {
      addToast("error", "Password must be at least 8 characters.");
      return;
    }
    if (!firstName.trim()) {
      addToast("error", "Enter your first name!");
      return;
    }
    if (!lastInitial.trim()) {
      addToast("error", "Enter your last initial!");
      return;
    }

    const lastInitialClean = lastInitial.trim().charAt(0).toUpperCase();
    const assignRole = httpsCallable<AssignRoleData, AssignRoleResult>(functions, "assignRoleFromInvite");
    const signupPayload: AssignRoleData = {
      inviteId: inviteId!,
      firstName: firstName.trim(),
      lastInitial: lastInitialClean,
    };

    const provisionAccount = async () => {
      await assignRole(signupPayload);
      if (!auth.currentUser) {
        throw new Error("Signup session expired before setup completed.");
      }
      await auth.currentUser.getIdToken(true);
    };

    setSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      let provisioningComplete = false;

      try {
        await provisionAccount();
        provisioningComplete = true;
      } catch (provisionError) {
        console.error("Signup provisioning error:", provisionError);

        try {
          await provisionAccount();
          provisioningComplete = true;
        } catch (retryError) {
          console.error("Signup recovery failed:", retryError);

          if (auth.currentUser && auth.currentUser.uid === userCredential.user.uid) {
            try {
              await deleteUser(userCredential.user);
              addToast(
                "error",
                "Signup failed before setup completed. Your new account was removed. Please try again."
              );
            } catch (rollbackError) {
              console.error("Signup rollback failed:", rollbackError);
              try {
                await signOut(auth);
              } catch (signOutError) {
                console.error("Signup sign-out failed:", signOutError);
              }
              addToast(
                "error",
                "Signup failed after account creation. We signed you out. Please try again or contact an administrator."
              );
            }
          } else {
            addToast("error", "Signup failed before setup completed. Please try again.");
          }
          return;
        }
      }

      if (!provisioningComplete) {
        addToast("error", "Signup failed before setup completed. Please try again.");
        return;
      }

      try {
        if (auth.currentUser) {
          await sendEmailVerification(auth.currentUser);
        }
        addToast("success", "Signup successful! Check your email to verify your address.");
      } catch (verificationError) {
        console.error("Verification email error:", verificationError);
        addToast(
          "info",
          "Signup completed, but we could not send the verification email. Use the resend option after logging in."
        );
      }

      navigate("/");
    } catch (error) {
      console.error("Signup error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      addToast("error", "Signup failed: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Loading invite...</p>;

  return (
    <div className="app-container">
      <div className="card">
        <Toasts />
        <div className="card-header">
          <h2>Signup</h2>
          <div className="muted">Complete your account setup. Password must be at least 8 characters.</div>
        </div>

        <div className="section">
          <div className="auth-form-stack">
            <div className="small">Email: <strong>{email}</strong></div>
            {invite?.role && (
              <div className="small">
                Invited role: <strong>{invite.role}</strong>
              </div>
            )}
            <input
              className="input auth-field"
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") lastInitialRef.current?.focus(); }}
              autoComplete="given-name"
            />
            <input
              ref={lastInitialRef}
              className="input auth-field"
              type="text"
              placeholder="Last initial"
              value={lastInitial}
              onChange={(e) => setLastInitial(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") passwordRef.current?.focus(); }}
              maxLength={1}
              autoComplete="family-name"
            />
            <input
              ref={passwordRef}
              className="input auth-field"
              type="password"
              placeholder="Set your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !submitting) handleSignup(); }}
              autoComplete="new-password"
            />
            <button
              className="btn btn-primary auth-form-submit auth-action"
              disabled={submitting}
              onClick={(e) => {
                const icon = e.currentTarget.querySelector(".icon");
                if (icon) {
                  icon.classList.add("pulse");
                  setTimeout(() => icon.classList.remove("pulse"), 260);
                }
                handleSignup();
              }}
            >
              <CheckIcon className="icon" /> {submitting ? "Signing Up..." : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
