import React, { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";
import Toasts from './Toasts';
import { addToast } from './toastService';
import { CheckIcon } from './icons';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showReset, setShowReset] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return addToast('error', 'Fill both fields!');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
     console.error("Full Firebase error:", error);
      addToast('error', 'Login failed: ' + (error.message || error));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google login error:", error);
      addToast('error', 'Google sign-in failed: ' + (error.message || error));
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
      console.error("Reset error:", error);
      addToast('error', 'Reset failed: ' + (error.message || error));
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <Toasts />
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
            />
            <input
              className="input auth-field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                onClick={() => setShowReset((s) => !s)}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {showReset && (
            <div className="auth-form-stack" style={{ marginTop: 10 }}>
              <input
                className="input auth-field"
                type="email"
                placeholder="Enter your email to reset"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <button className="btn btn-ghost auth-form-submit auth-action" onClick={handleReset}>
                Send reset email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
