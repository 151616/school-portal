import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db, auth } from "./firebase";

export default function StudentDashboard() {
  const [grades, setGrades] = useState([]);

  useEffect(() => {
    const classesRef = ref(db, "schools/school_01/classes");
    onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      const allGrades = [];
      for (const classId in data) {
        const classGrades = data[classId].grades || {};
        Object.values(classGrades).forEach(g => {
          if (g.studentId === auth.currentUser.uid) {
            allGrades.push({ ...g, classId });
          }
        });
      }
      setGrades(allGrades);
    });
  }, []);

  return (
    <div style={{ maxWidth: 400, margin: "50px auto" }}>
      <h2>Your Grades</h2>
      {grades.length === 0 && <p>No grades yet</p>}
      <ul>
        {grades.map((g, i) => (
          <li key={i}>Class: {g.classId} | Score: {g.score} | Date: {new Date(g.createdAt).toLocaleDateString()}</li>
        ))}
      </ul>
    </div>
  );
}
