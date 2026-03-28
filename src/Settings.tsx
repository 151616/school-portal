import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Theme = "system" | "light" | "dark";

interface Language {
  code: string;
  label: string;
}

const getSavedTheme = (): Theme => (localStorage.getItem("theme") as Theme) || "system";

const applyTheme = (theme: Theme): void => {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem("theme", theme);
};

const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "hi", label: "Hindi" },
  { code: "it", label: "Italian" },
  { code: "vi", label: "Vietnamese" },
  { code: "tl", label: "Filipino" },
  { code: "ur", label: "Urdu" },
];

const applyLanguage = (langCode: string): void => {
  localStorage.setItem("language", langCode);
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!combo) return;
  if (langCode === "en") {
    // Restore original (Google Translate "show original" equivalent)
    const bar = document.querySelector<HTMLIFrameElement>(".goog-te-banner-frame");
    if (bar) {
      const restoreLink = bar.contentDocument?.querySelector<HTMLButtonElement>(".goog-te-button button");
      if (restoreLink) restoreLink.click();
    }
    combo.value = "";
    combo.dispatchEvent(new Event("change"));
  } else {
    combo.value = langCode;
    combo.dispatchEvent(new Event("change"));
  }
};

export default function Settings() {
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme());
  const [language, setLanguage] = useState<string>(() => localStorage.getItem("language") || "en");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const code = e.target.value;
    setLanguage(code);
    applyLanguage(code);
  };

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
          <div className="small">Language</div>
          <div className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
            Translate the page using Google Translate.
          </div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <select
              className="select"
              style={{ width: 220 }}
              value={language}
              onChange={handleLanguageChange}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
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
