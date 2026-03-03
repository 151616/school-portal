import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2>Privacy Policy</h2>
            <div className="muted">Last updated: February 5, 2026</div>
          </div>
          <Link className="btn btn-ghost" to="/settings">Back to Settings</Link>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Home / Settings / Privacy Policy
        </div>

        <div className="section">
          <p className="small">
            We collect the minimum information needed to operate the school portal. This includes
            account email, role (student/teacher/admin), and profile details (first name and last
            initial). Student IDs are used for class enrollment and reporting.
          </p>
          <p className="small">
            We do not sell personal data. Access is limited to authorized school staff. You can
            request corrections or deletion through an administrator.
          </p>
        </div>

        <div className="section">
          <div className="form-row">
            <Link className="btn btn-ghost" to="/">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
