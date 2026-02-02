import React, { useState } from "react";
import { ref, set, push } from "firebase/database";
import { db, auth } from "./firebase";

export default function TeacherDashboard() {
  const [studentUid, setStudentUid] = useState("");
  const [classId, setClassId] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  const handleAddGrade = async () => {
    if (!studentUid || !classId || !assignmentName || !score || !maxScore) {
      return alert("Fill all fields!");
    }

    // auto-generate assignment ID
    const assignmentRef = push(
      ref(db, `grades/${studentUid}/${classId}/assignments`)
    );

    await set(assignmentRef, {
      name: assignmentName,
      score: Number(score),
      maxScore: Number(maxScore),
      teacherUid: auth.currentUser.uid,
      createdAt: Date.now()
    });

    alert("Grade added!");

    setStudentUid("");
    setClassId("");
    setAssignmentName("");
    setScore("");
    setMaxScore("");
  };

  return (
    <div style={{ maxWidth: 420, margin: "50px auto" }}>
      <h2>Teacher Dashboard</h2>

      <input
        placeholder="Student UID"
        value={studentUid}
        onChange={(e) => setStudentUid(e.target.value)}
      />

      <input
        placeholder="Class ID (e.g. math101)"
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
      />

      <input
        placeholder="Assignment Name"
        value={assignmentName}
        onChange={(e) => setAssignmentName(e.target.value)}
      />

      <input
        placeholder="Score"
        type="number"
        value={score}
        onChange={(e) => setScore(e.target.value)}
      />

      <input
        placeholder="Max Score"
        type="number"
        value={maxScore}
        onChange={(e) => setMaxScore(e.target.value)}
      />

      <button onClick={handleAddGrade}>Add Grade</button>
    </div>
  );
}
