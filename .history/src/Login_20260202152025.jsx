import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return alert("Fill both fields!");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
     console.error("Full Firebase error:", error);
    alert("Error logging in: " + error.message + " (" + error.code + ")");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto", textAlign: "center" }}>
      <h2>Login</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", margin: "10px auto", width: "100%" }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", margin: "10px auto", width: "100%" }}
      />
      <button onClick={handleLogin} style={{ marginTop: 10 }}>
        Login
      </button>
    </div>
  );
}
