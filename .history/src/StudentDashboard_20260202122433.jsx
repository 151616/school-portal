import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db, auth } from "./firebase";

export default function StudentDashboard() {
  const [grades, setGrades] = useState([]);

  useEffect(() => {
    const studentUid = auth.currentUser.uid;
    const gradesRef = ref(db, `grades/${studentUid}`);

    // Listen to all classes for this student
    const unsubscribe = onValue(gradesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const allGrades = [];

      // Loop through classes
      for (const classId in data) {
        const classData = data[classId];
        const className = classData.className || classId;

        // Loop through assignments
        const assignments = classData.assignments || {};
        for (const assignmentId in assignments) {
          const g = assignments[assignmentId];
          allGrades.push({
            classId,
            className,
            assignmentName: g.name,
            score: g.score,
            maxScore: g.maxScore,
            createdAt: g.createdAt
          });
        }
      }

      // Sort by date newest first
      allGrades.sort((a, b) => b.createdAt - a.createdAt);

      setGrades(allGrades);
    });

    return () => unsubscribe(); // clean up listener
  }, []);

  return (
    <div style={{ maxWidth: 500, margin: "50px auto" }}>
      <h2>Your Grades</h2>
      {grades.length === 0 && <p>No grades yet</p>}
      <ul>
        {grades.map((g, i) => (
          <li key={i}>
            <strong>{g.className}</strong> | {g.assignmentName}: {g.score}/{g.maxScore} |{" "}
            {new Date(g.createdAt).toLocaleDateString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
