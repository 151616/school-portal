import { useState, useRef } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";
import Toasts from "@/shared/components/Toasts";
import { addToast } from '@/shared/toastService';
import { CheckIcon } from '@/shared/icons';

export default function Login() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [resetEmail, setResetEmail] = useState<string>("");
  const [showReset, setShowReset] = useState<boolean>(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const resetEmailRef = useRef<HTMLInputElement>(null);

  const handleLogin = async () => {
    if (!email || !password) return addToast('error', 'Fill both fields!');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Login error:", error);
      addToast('error', 'Login failed. Please check your email and password.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Google login error:", error);
      addToast('error', 'Google sign-in failed. Please try again.');
    }
  };

  const handleReset = async () => {
    const target = (resetEmail || email || "").trim();
    if (!target) return addToast('error', 'Enter your email to reset password.');
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);
    if (!isValidEmail) return addToast('error', 'Enter a valid email address.');
    try {
      await sendPasswordResetEmail(auth, target);
      addToast('success', 'Password reset email sent. Check your inbox.');
      setShowReset(false);
      setResetEmail("");
    } catch (error) {
      if (import.meta.env.DEV) console.error("Reset error:", error);
      addToast('error', 'Unable to send reset email. Please try again.');
    }
  };

  return (
    <div className="app-container">
      <div className="card login-card">
        <Toasts />

        <div className="login-form-side">
          <div className="card-header">
            <h2>Login</h2>
            <div className="muted">Sign in with your email and password.</div>
          </div>

          <div className="section">
            <div className="auth-form-stack">
              <input
                className="input auth-field"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") passwordRef.current?.focus(); }}
                autoComplete="email"
              />
              <input
                ref={passwordRef}
                className="input auth-field"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
                autoComplete="current-password"
              />

              <button
                className="btn btn-primary auth-form-submit auth-action"
                onClick={(e) => {
                  const icon = e.currentTarget.querySelector(".icon");
                  if (icon) {
                    icon.classList.add("pulse");
                    setTimeout(() => icon.classList.remove("pulse"), 260);
                  }
                  handleLogin();
                }}
              >
                <CheckIcon className="icon" /> Login
              </button>

              <div className="auth-form-row">
                <button className="btn btn-ghost auth-form-row-button auth-action" onClick={handleGoogleLogin}>
                  Continue with Google
                </button>
                <button
                  className="btn btn-ghost auth-form-row-button auth-action"
                  onClick={() => setShowReset((s) => { if (!s) setTimeout(() => resetEmailRef.current?.focus(), 0); return !s; })}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <div className="small muted" style={{ textAlign: "center", marginTop: 12 }}>
              Are you a parent?{" "}
              <a href="/parent-signup" style={{ color: "var(--accent)" }}>
                Sign up here
              </a>
            </div>

            {showReset && (
              <div className="auth-form-stack" style={{ marginTop: 10 }}>
                <input
                  ref={resetEmailRef}
                  className="input auth-field"
                  type="email"
                  placeholder="Enter your email to reset"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleReset(); }}
                  autoComplete="email"
                />
                <button className="btn btn-ghost auth-form-submit auth-action" onClick={handleReset}>
                  Send reset email
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="login-brand-side">
          <div className="login-brand-name">KGrades</div>
          <div className="login-brand-tagline">
            School management built for classrooms that matter — across the world.
          </div>
          <ul className="login-feature-list">
            <li><span className="login-feature-dot" />Grade tracking &amp; rubrics</li>
            <li><span className="login-feature-dot" />Attendance &amp; tardiness</li>
            <li><span className="login-feature-dot" />Student progress reports</li>
            <li><span className="login-feature-dot" />Secure, invite-only access</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
