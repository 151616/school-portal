import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const getSavedTheme = () => localStorage.getItem("theme") || "system";

const applyTheme = (theme) => {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem("theme", theme);
};

export default function Settings() {
  const [theme, setTheme] = useState(() => getSavedTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="app-container">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Settings</h2>
            <div className="muted">Personalize your experience.</div>
          </div>
        </div>

        <div className="section">
          <div className="small">Theme</div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <button
              className={`btn ${theme === "system" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTheme("system")}
            >
              System
            </button>
            <button
              className={`btn ${theme === "light" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              className={`btn ${theme === "dark" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
        </div>

        <div className="section">
          <div className="small">Legal</div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <Link className="btn btn-ghost" to="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
