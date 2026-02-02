import React, { useState } from "react";
import { ref, set } from "firebase/database";
import { db, auth } from "./firebase";

export default function TeacherDashboard() {
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [score, setScore] = useState("");

  const handleAddGrade = async () => {
    if (!studentId || !classId || !score) return alert("Fill all fields!");
    const gradeId = `${studentId}_${Date.now()}`;
    await set(ref(db, `schools/school_01/classes/${classId}/grades/${gradeId}`), {
      studentId,
      score: Number(score),
      createdBy: auth.currentUser.uid,
      createdAt: Date.now(),
    });
    alert("Grade added!");
    setStudentId(""); setClassId(""); setScore("");
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto" }}>
      <h2>Teacher Dashboard</h2>
      <input placeholder="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
      <input placeholder="Class ID" value={classId} onChange={(e) => setClassId(e.target.value)} />
      <input placeholder="Score" type="number" value={score} onChange={(e) => setScore(e.target.value)} />
      <button onClick={handleAddGrade}>Add Grade</button>
    </div>
  );
}
