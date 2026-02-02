import React, { useState } from "react";
import { ref, set, push } from "firebase/database";
import { db, auth } from "./firebase";
import Toasts from './Toasts';
import { addToast } from './toastService';
import { PlusIcon } from './icons';

export default function TeacherDashboard() {
  const [studentUid, setStudentUid] = useState("");
  const [classId, setClassId] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  const handleAddGrade = async () => {
    if (!studentUid || !classId || !assignmentName || !score || !maxScore) {
      addToast('error', 'Fill all fields!');
      return;
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

    addToast('success', 'Grade added!');

    setStudentUid("");
    setClassId("");
    setAssignmentName("");
    setScore("");
    setMaxScore("");
  };

  return (
    <div className="app-container">
      <div className="card" style={{ maxWidth: 520 }}>
        <Toasts />
        <div className="card-header">
          <h2>Teacher Dashboard</h2>
          <div className="muted">Add grades for students. All fields are required.</div>
        </div>

        <div className="section">
          <input className="input" placeholder="Student UID" value={studentUid} onChange={(e) => setStudentUid(e.target.value)} />
          <input className="input" placeholder="Class ID (e.g. math101)" value={classId} onChange={(e) => setClassId(e.target.value)} style={{ marginTop: 8 }} />
          <input className="input" placeholder="Assignment Name" value={assignmentName} onChange={(e) => setAssignmentName(e.target.value)} style={{ marginTop: 8 }} />
          <input className="input" placeholder="Score" type="number" value={score} onChange={(e) => setScore(e.target.value)} style={{ marginTop: 8 }} />
          <input className="input" placeholder="Max Score" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} style={{ marginTop: 8 }} />

          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={(e) => { const icon = e.currentTarget.querySelector('.icon'); if (icon) { icon.classList.add('pulse'); setTimeout(() => icon.classList.remove('pulse'), 260); } handleAddGrade(); }}>
              <PlusIcon className="icon" /> Add Grade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
