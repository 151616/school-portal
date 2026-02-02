import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set, get, child, update } from "firebase/database";
import { auth, db } from "./firebase";

async function handleSignup(email, password, inviteId) {
  const inviteSnap = await get(ref(db, `invites/${inviteId}`));
  if (!inviteSnap.exists()) return alert("Invalid invite");

  const invite = inviteSnap.val();
  if (invite.used) return alert("Invite already used");

  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await set(ref(db, `Users/${cred.user.uid}`), {
    email,
    role: invite.role,
    studentId: invite.studentId
  });

  await update(ref(db, `invites/${inviteId}`), { used: true });
}
