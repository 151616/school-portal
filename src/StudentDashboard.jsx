import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set, get, update } from "firebase/database";
import { auth, db } from "./firebase";

export default function StudentSignup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteId, setInviteId] = useState("");

  useEffect(() => {
    // Read inviteId from URL query param
    const params = new URLSearchParams(window.location.search);
    const id = params.get("inviteId");
    if (id) setInviteId(id);
  }, []);

  const handleSignup = async () => {
    if (!email || !password || !inviteId) return alert("Fill all fields!");

    try {
      const inviteSnap = await get(ref(db, `invites/${inviteId}`));
      if (!inviteSnap.exists()) return alert("Invalid invite ID.");

      const invite = inviteSnap.val();
      if (invite.used) return alert("Invite already used.");
      if (invite.email !== email) return alert("Email does not match invite.");

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await set(ref(db, `Users/${cred.user.uid}`), {
        email,
        role: invite.role,
        studentId: invite.studentId,
        createdAt: Date.now()
      });

      await update(ref(db, `invites/${inviteId}`), { used: true });

      alert("Signup successful! You can now log in.");
      setEmail("");
      setPassword("");
      setInviteId("");
    } catch (error) {
      alert("Signup failed: " + error.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto", textAlign: "center" }}>
      <h2>Student Signup</h2>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", margin: "10px auto", width: "100%" }}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", margin: "10px auto", width: "100%" }}
      />
      <input
        placeholder="Invite ID"
        value={inviteId}
        readOnly
        style={{ display: "block", margin: "10px auto", width: "100%", backgroundColor: "#f0f0f0" }}
      />
      <button onClick={handleSignup} style={{ marginTop: 10 }}>
        Sign Up
      </button>
    </div>
  );
}
