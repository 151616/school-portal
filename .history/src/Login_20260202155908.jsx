import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import Toasts from './Toasts';
import { addToast } from './toastService';
import { CheckIcon } from './icons';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return addToast('error', 'Fill both fields!');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
     console.error("Full Firebase error:", error);
      addToast('error', 'Login failed: ' + (error.message || error));
    }
  };

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 420 }}>
        <Toasts />
        <div className="card-header">
          <h2>Login</h2>
          <div className="muted">Sign in with your email and password.</div>
        </div>

        <div className="section">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginTop: 10 }} />

          <button className="btn btn-primary" onClick={(e) => { const icon = e.currentTarget.querySelector('.icon'); if (icon) { icon.classList.add('pulse'); setTimeout(() => icon.classList.remove('pulse'), 260); } handleLogin(); }} style={{ marginTop: 12 }}>
            <CheckIcon className="icon" /> Login
          </button>
        </div>
      </div>
    </div>
  );
}
