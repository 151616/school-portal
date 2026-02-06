import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import Toasts from "./Toasts";
import { addToast } from "./toastService";
import { CheckIcon } from "./icons";
import { ref, get } from "firebase/database";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [loading, setLoading] = useState(true);

  const inviteId = searchParams.get("inviteId");

  useEffect(() => {
    if (!inviteId) {
      addToast("error", "No invite ID provided");
      navigate("/"); // redirect
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
      setEmail(inviteData.email); // pre-fill email
      setLoading(false);
    };

    fetchInvite();
  }, [inviteId, navigate]);

  const handleSignup = async () => {
    if (!password) {
      addToast("error", "Enter a password!");
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

    try {
      // 1️⃣ Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2️⃣ Call Cloud Function to assign role + mark invite
      const functions = getFunctions();
      const assignRole = httpsCallable(functions, "assignRoleFromInvite");
      await assignRole({
        inviteId,
        firstName: firstName.trim(),
        lastInitial: lastInitialClean,
      });

      // 3️⃣ Refresh ID token so new claims appear
      await auth.currentUser.getIdToken(true);

      await sendEmailVerification(auth.currentUser);

      addToast("success", "Signup successful! Check your email to verify your address.");
      navigate("/"); // redirect to dashboard or login
    } catch (error) {
      console.error("Signup error:", error);
      addToast("error", "Signup failed: " + (error.message || error));
    }
  };

  if (loading) return <p>Loading invite...</p>;

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 420 }}>
        <Toasts />
        <div className="card-header">
          <h2>Signup</h2>
          <div className="muted">Complete your account setup. Password must be at least 6 characters.</div>
        </div>

        <div className="section">
          <div className="small">Email: <strong>{email}</strong></div>
          <div style={{ height: 12 }} />
          <input
            className="input"
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <div style={{ height: 12 }} />
          <input
            className="input"
            type="text"
            placeholder="Last initial"
            value={lastInitial}
            onChange={(e) => setLastInitial(e.target.value)}
            maxLength={1}
          />
          <div style={{ height: 12 }} />
          <input
            className="input"
            type="password"
            placeholder="Set your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div style={{ height: 12 }} />
          <button
            className="btn btn-primary"
            onClick={(e) => {
              const icon = e.currentTarget.querySelector(".icon");
              if (icon) {
                icon.classList.add("pulse");
                setTimeout(() => icon.classList.remove("pulse"), 260);
              }
              handleSignup();
            }}
          >
            <CheckIcon className="icon" /> Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
