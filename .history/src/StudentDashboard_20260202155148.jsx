import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set, get, update } from "firebase/database";
import { auth, db } from "./firebase";
import Toasts from './Toasts';
import { addToast } from './toastService';
import { CheckIcon } from './icons';

export default function StudentSignup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteId, setInviteId] = useState(() => new URLSearchParams(window.location.search).get("inviteId") || "");

  const handleSignup = async () => {
    if (!email || !password || !inviteId) {
      addToast('error', 'Fill all fields!');
      return;
    }

    try {
      const inviteSnap = await get(ref(db, `invites/${inviteId}`));
      if (!inviteSnap.exists()) {
        addToast('error', 'Invalid invite ID.');
        return;
      }

      const invite = inviteSnap.val();
      if (invite.used) return addToast('error', 'Invite already used.');
      if (invite.email !== email) return addToast('error', 'Email does not match invite.');

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await set(ref(db, `Users/${cred.user.uid}`), {
        email,
        role: invite.role,
        studentId: invite.studentId,
        createdAt: Date.now()
      });

      await update(ref(db, `invites/${inviteId}`), { used: true });

      addToast('success', 'Signup successful! You can now log in.');
      setEmail("");
      setPassword("");
      setInviteId("");
    } catch (error) {
      addToast('error', 'Signup failed: ' + (error.message || error));
    }
  };

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-header">
          <h2>Student Signup</h2>
          <div className="muted">Use the invite you received to complete signup. Email must match invite.</div>
        </div>

        <div className="section">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginTop: 10 }}
          />

          <input
            className="input"
            placeholder="Invite ID"
            value={inviteId}
            readOnly
            style={{ marginTop: 10, backgroundColor: '#f8f7f4' }}
          />

          <button className="btn btn-primary" onClick={handleSignup} style={{ marginTop: 12 }}>
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
