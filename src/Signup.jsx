import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ref, get, set, push } from "firebase/database";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  const inviteId = searchParams.get("inviteId");

  useEffect(() => {
    if (!inviteId) {
      alert("No invite ID provided");
      navigate("/"); // redirect
      return;
    }

    const fetchInvite = async () => {
      const inviteSnap = await get(ref(db, `invites/${inviteId}`));
      const inviteData = inviteSnap.val();
      if (!inviteData) {
        alert("Invalid invite");
        navigate("/");
        return;
      }
      if (inviteData.used) {
        alert("This invite has already been used");
        navigate("/");
        return;
      }
      setInvite(inviteData);
      setEmail(inviteData.email); // pre-fill email
      setLoading(false);
    };

    fetchInvite();
  }, [inviteId, navigate]);

  const sanitizeEmail = (email) => email.replace(/\./g, ",");

  const handleSignup = async () => {
    if (!password) return alert("Enter a password!");

    try {
      const emailKey = sanitizeEmail(email);

      // Check if email already exists
      const emailSnap = await get(ref(db, `emails/${emailKey}`));
      if (emailSnap.exists()) return alert("This email already has an account!");

      // 1️⃣ Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2️⃣ Add user to database
      await set(ref(db, `Users/${uid}`), {
        email,
        role: invite.role,
        studentId: invite.studentId,
        createdAt: Date.now()
      });

      // 3️⃣ Map email to UID to prevent duplicates
      await set(ref(db, `emails/${emailKey}`), uid);

      // 4️⃣ Mark invite as used
      await set(ref(db, `invites/${inviteId}/used`), true);

      alert("Signup successful!");
      navigate("/"); // redirect to login or dashboard
    } catch (error) {
      console.error("Signup error:", error);
      alert("Signup failed: " + error.message);
    }
  };

  if (loading) return <p>Loading invite...</p>;

  return (
    <div style={{ maxWidth: 400, margin: "50px auto" }}>
      <h2>Signup</h2>
      <p>Email: {email}</p>
      <input
        type="password"
        placeholder="Set your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleSignup} style={{ marginLeft: 10 }}>
        Sign Up
      </button>
    </div>
  );
}
