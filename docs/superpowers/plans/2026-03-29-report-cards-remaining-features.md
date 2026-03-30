# Report Cards Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 5 remaining spec items: principal comment entry, bulk ZIP download, "View all sessions" trend history, subject-level trend drilldown, and term-based grade filtering.

**Architecture:** All changes are frontend-only. Principal comments use the existing `reportComments` Firebase path. Bulk ZIP uses `jszip` to bundle individual PDFs. Trend enhancements expand the existing bar chart with a `showAllSessions` toggle and a subject drill-down view. Grade filtering adds a `selectedTerm`/`selectedSession` filter to the existing `classGrades` useMemo and `renderGrades` function.

**Tech Stack:** React 19, TypeScript, Firebase RTDB, jsPDF, html2canvas, jszip (new dependency)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/admin/AdminReportCards.tsx` | Modify | Add principal comment UI per student, add "Download All as ZIP" button |
| `src/ParentDashboard.tsx` | Modify | Add "View all sessions" toggle to trend chart, add subject trend drilldown, filter grades by selected term |
| `src/StudentDashboard.tsx` | Modify | Same trend and grade filtering changes as ParentDashboard |
| `package.json` | Modify | Add `jszip` dependency |

---

### Task 1: Install jszip dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jszip**

```bash
npm install jszip
```

- [ ] **Step 2: Verify it installed**

```bash
npm ls jszip
```

Expected: `jszip@3.x.x` appears in the tree.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jszip dependency for bulk PDF download"
```

---

### Task 2: Add principal comment entry to Admin Report Cards

**Files:**
- Modify: `src/admin/AdminReportCards.tsx`

The file already has `principalComments` state and `handleSavePrincipalComments` function (lines 44, 166-182) but they're suppressed with `void` statements and the UI is missing. We need to: load existing principal comments when session/term changes, render a per-student comment input section, and wire up the save button.

- [ ] **Step 1: Remove the void suppressions and add principal comment loading**

In `src/admin/AdminReportCards.tsx`, remove these two lines:

```typescript
  // Suppress unused variable warning — principalComments setter used in UI below
  void setPrincipalComments;
  void handleSavePrincipalComments;
```

Then, inside the existing readiness `useEffect` (the one starting at line 64 with `checkReadiness`), after the `setReadiness(results)` call and before `setLoadingReadiness(false)`, add code to load existing principal comments:

```typescript
      // Load existing principal comments
      const allStudentUids = classes.flatMap(
        (cls) => (cls.students ? Object.keys(cls.students) : [])
      );
      const uniqueUids = [...new Set(allStudentUids)];
      const commentMap: Record<string, string> = {};
      for (const uid of uniqueUids) {
        const snap = await get(
          ref(db, `reportComments/${selectedSession}/${selectedTerm}/${uid}/principalComment`)
        );
        if (snap.exists()) commentMap[uid] = snap.val() as string;
      }
      setPrincipalComments(commentMap);
```

- [ ] **Step 2: Add the principal comments UI section**

In the JSX, after the action buttons `<div>` (the one with the "Publish All Report Cards" button, ending around line 275) and before the preview modal, add:

```tsx
      {/* Principal Comments */}
      {selectedSession && selectedTerm && readiness.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4>Principal Comments</h4>
          {classes.map((cls) => {
            const studentUids = cls.students ? Object.keys(cls.students) : [];
            if (studentUids.length === 0) return null;
            return (
              <div key={cls.id} style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>{cls.name || cls.id}</strong>
                {studentUids.map((uid) => (
                  <div key={uid} className="form-row" style={{ marginTop: 6, alignItems: "center" }}>
                    <span className="small" style={{ minWidth: 80 }}>{uid}</span>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="Principal comment..."
                      value={principalComments[uid] || ""}
                      onChange={(e) => setPrincipalComments((prev) => ({ ...prev, [uid]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          <button className="btn btn-primary" onClick={handleSavePrincipalComments} style={{ marginTop: 8 }}>
            Save Principal Comments
          </button>
        </div>
      )}
```

- [ ] **Step 3: Run typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: Both pass with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminReportCards.tsx
git commit -m "feat: add principal comment entry UI to Admin Report Cards"
```

---

### Task 3: Add "Download All as ZIP" to Admin Report Cards

**Files:**
- Modify: `src/admin/AdminReportCards.tsx`

This adds a button that iterates over all students in all classes for the selected session/term, loads each published report card, renders it to PDF via a hidden `ReportCardView`, and bundles all PDFs into a ZIP download.

- [ ] **Step 1: Add the handleDownloadAllZip function**

In `src/admin/AdminReportCards.tsx`, after the existing `handleSavePrincipalComments` function (around line 182), add a new state variable and handler. First, add a state variable after the existing `previewCard` state (line 43):

```typescript
  const [downloadingZip, setDownloadingZip] = useState(false);
```

Then add the handler function after `handleSavePrincipalComments`:

```typescript
  const handleDownloadAllZip = async () => {
    if (!selectedSession || !selectedTerm) return;
    setDownloadingZip(true);
    try {
      const JSZip = (await import("jszip")).default;
      const html2canvasMod = (await import("html2canvas")).default;
      const { default: jsPDFMod } = await import("jspdf");
      const zip = new JSZip();

      // Collect all student UIDs
      const allStudentUids = classes.flatMap(
        (cls) => (cls.students ? Object.keys(cls.students) : [])
      );
      const uniqueUids = [...new Set(allStudentUids)];

      // Create a hidden container for rendering
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      document.body.appendChild(container);

      for (const uid of uniqueUids) {
        const snap = await get(ref(db, `reportCards/${selectedSession}/${selectedTerm}/${uid}`));
        if (!snap.exists()) continue;
        const card = snap.val() as ReportCard;

        // Render the report card into the hidden container
        const el = document.createElement("div");
        el.id = "report-card-zip-render";
        container.innerHTML = "";
        container.appendChild(el);

        // Use ReactDOM to render the report card
        const { createRoot } = await import("react-dom/client");
        const root = createRoot(el);
        await new Promise<void>((resolve) => {
          root.render(
            <ReportCardView reportCard={card} />
          );
          // Allow a frame for React to paint
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const canvas = await html2canvasMod(el, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDFMod("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pageWidth - 20;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);

        const fileName = `${card.studentName || uid}-${card.className || "class"}.pdf`;
        zip.file(fileName, pdf.output("arraybuffer"));

        root.unmount();
      }

      document.body.removeChild(container);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-cards-${selectedSession}-${selectedTerm}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("success", `Downloaded ${uniqueUids.length} report cards as ZIP`);
    } catch (err) {
      addToast("error", "ZIP download failed: " + (err as Error).message);
    }
    setDownloadingZip(false);
  };
```

- [ ] **Step 2: Remove the old static html2canvas/jsPDF imports**

Remove these lines at the top of the file (lines 8-11):

```typescript
// @ts-ignore
import html2canvas from "html2canvas";
// @ts-ignore
import jsPDF from "jspdf";
```

Update the existing `handleDownloadPdf` to also use dynamic imports:

```typescript
  const handleDownloadPdf = async () => {
    const element = document.getElementById("report-card-content");
    if (!element) return;
    const html2canvasMod = (await import("html2canvas")).default;
    const { default: jsPDFMod } = await import("jspdf");
    const canvas = await html2canvasMod(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDFMod("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`report-card-${previewCard?.studentName || "student"}.pdf`);
  };
```

- [ ] **Step 3: Add the "Download All as ZIP" button to the UI**

In the action buttons section (the `<div>` containing "Publish All Report Cards"), add the ZIP download button next to it:

```tsx
      {selectedSession && selectedTerm && readiness.length > 0 && (
        <div className="form-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publishing..." : "Publish All Report Cards"}
          </button>
          <button className="btn btn-ghost" onClick={handleDownloadAllZip} disabled={downloadingZip}>
            {downloadingZip ? "Generating ZIP..." : "Download All as ZIP"}
          </button>
        </div>
      )}
```

- [ ] **Step 4: Add the `React` import needed for JSX in dynamic rendering**

At the top of the file, make sure `React` is imported (needed for the JSX inside `handleDownloadAllZip`):

```typescript
import React from "react";
```

Add this as the first import if not already present.

- [ ] **Step 5: Run typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: Both pass with zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminReportCards.tsx
git commit -m "feat: add bulk Download All as ZIP for report cards"
```

---

### Task 4: Add "View all sessions" trend and subject drilldown to ParentDashboard

**Files:**
- Modify: `src/ParentDashboard.tsx`

This task adds: (a) a "View all sessions" toggle that loads report cards across all sessions, (b) a subject-level trend drilldown view, and (c) filters the grades list by the selected term.

- [ ] **Step 1: Add new state variables**

After the existing `activeReportCard` state declaration, add:

```typescript
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [allSessionCards, setAllSessionCards] = useState<ReportCard[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
```

- [ ] **Step 2: Add useEffect to load all-sessions report cards**

After the existing "Load report cards for trend" useEffect (around line 117), add:

```typescript
  // Load report cards across ALL sessions for full history
  useEffect(() => {
    if (!showAllSessions || !activeChildUid || !academicConfig) return;
    const allCards: ReportCard[] = [];
    const sessionKeys = Object.keys(academicConfig.sessions || {});

    Promise.all(
      sessionKeys.flatMap((sk) => {
        const session = academicConfig.sessions?.[sk];
        if (!session) return [];
        return Object.keys(session.terms).map(async (tk) => {
          const snap = await get(ref(db, `reportCards/${sk}/${tk}/${activeChildUid}`));
          if (snap.exists()) allCards.push(snap.val() as ReportCard);
        });
      })
    ).then(() => {
      // Sort by session then term order
      allCards.sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
        const sessionTerms = Object.keys(academicConfig.sessions?.[a.sessionId]?.terms || {});
        return sessionTerms.indexOf(a.termId) - sessionTerms.indexOf(b.termId);
      });
      setAllSessionCards(allCards);
    });
  }, [showAllSessions, activeChildUid, academicConfig]);
```

- [ ] **Step 3: Replace the trend chart section with enhanced version**

Find the existing trend chart block in the JSX. It starts with:
```tsx
          {/* Trend Chart */}
          {reportCards.length > 0 && (
```

Replace the entire trend chart section (from `{/* Trend Chart */}` through the closing `)}` of that block) with:

```tsx
          {/* Trend Chart */}
          {(reportCards.length > 0 || allSessionCards.length > 0) && (
            <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Academic Trend</strong>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => { setShowAllSessions(!showAllSessions); setSelectedSubject(null); }}
                >
                  {showAllSessions ? "Current session only" : "View all sessions"}
                </button>
              </div>

              {/* Subject selector for drilldown */}
              {(() => {
                const cards = showAllSessions ? allSessionCards : reportCards;
                const subjectNames = [...new Set(cards.flatMap((c) => Object.values(c.subjects).map((s) => s.name)))];
                if (subjectNames.length === 0) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <select
                      className="input"
                      style={{ fontSize: 12 }}
                      value={selectedSubject || ""}
                      onChange={(e) => setSelectedSubject(e.target.value || null)}
                    >
                      <option value="">Overall Average</option>
                      {subjectNames.sort().map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12, padding: "0 20px" }}>
                {(() => {
                  const cards = showAllSessions ? allSessionCards : reportCards;
                  if (cards.length === 0) return <span className="muted small">No data yet.</span>;

                  const getAvg = (card: ReportCard): number => {
                    if (!selectedSubject) return card.overallAverage;
                    const subj = Object.values(card.subjects).find((s) => s.name === selectedSubject);
                    if (!subj || subj.totalMax === 0) return 0;
                    return (subj.total / subj.totalMax) * 100;
                  };

                  const maxAvg = Math.max(...cards.map(getAvg), 100);
                  return cards.map((card, i) => {
                    const avg = getAvg(card);
                    const height = avg > 0 ? (avg / maxAvg) * 100 : 0;
                    return (
                      <div key={`${card.sessionId}-${card.termId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                        <div style={{ background: "#1a365d", width: "100%", borderRadius: "4px 4px 0 0", height, minHeight: 4 }} />
                        <span style={{ fontSize: 9, marginTop: 4, color: "#999" }}>
                          {showAllSessions ? `${card.session}` : ""}
                        </span>
                        <span style={{ fontSize: 10, color: "#666" }}>{card.term.split(" ")[0]}</span>
                        <span style={{ fontSize: 11, fontWeight: "bold" }}>{avg > 0 ? `${Math.round(avg)}%` : "—"}</span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Change indicator */}
              {(() => {
                const cards = showAllSessions ? allSessionCards : reportCards;
                if (cards.length < 2) return null;
                const getAvg = (card: ReportCard): number => {
                  if (!selectedSubject) return card.overallAverage;
                  const subj = Object.values(card.subjects).find((s) => s.name === selectedSubject);
                  if (!subj || subj.totalMax === 0) return 0;
                  return (subj.total / subj.totalMax) * 100;
                };
                const latest = cards[cards.length - 1]!;
                const previous = cards[cards.length - 2]!;
                const change = getAvg(latest) - getAvg(previous);
                return (
                  <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: change >= 0 ? "#2ecc71" : "#e74c3c" }}>
                    {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% {change >= 0 ? "improvement" : "decline"} from last term
                  </div>
                );
              })()}
            </div>
          )}
```

- [ ] **Step 4: Filter grades by selected term**

In the `classGrades` useMemo (around line 211), the existing code builds a `list` from all assignments. Add term filtering right after the `list` is built and sorted:

Find this line:
```typescript
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
```

After it, add:

```typescript
      // Filter by selected term if set
      const filtered = selectedTerm && selectedSession
        ? list.filter((a) => a.termId === selectedTerm && a.sessionId === selectedSession)
        : list;
```

Then replace every subsequent reference to `list` in that same block with `filtered`. Specifically, change:

- `const caAssignments = list.filter(...)` → `const caAssignments = filtered.filter(...)`
- `const examAssignments = list.filter(...)` → `const examAssignments = filtered.filter(...)`
- `const untyped = list.filter(...)` → `const untyped = filtered.filter(...)`
- In the `result[classId]` assignment: `assignments: list` → `assignments: filtered`
- The `totalScore` and `totalMax` lines: change `list.reduce(...)` → `filtered.reduce(...)`

Also add `selectedTerm` and `selectedSession` to the useMemo dependency array:

```typescript
  }, [grades, schoolSettings, selectedTerm, selectedSession]);
```

- [ ] **Step 5: Run typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: Both pass with zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/ParentDashboard.tsx
git commit -m "feat: add all-sessions trend, subject drilldown, and term grade filter to ParentDashboard"
```

---

### Task 5: Add "View all sessions" trend, subject drilldown, and term grade filter to StudentDashboard

**Files:**
- Modify: `src/StudentDashboard.tsx`

Same changes as Task 4 but adapted for StudentDashboard which uses `user.uid` instead of `activeChildUid` and has a different grade rendering structure.

- [ ] **Step 1: Fix static imports to dynamic**

Remove the static imports at the top (lines 8-9):

```typescript
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
```

Update `handleDownloadPdf` (around line 100) to use dynamic imports:

```typescript
  const handleDownloadPdf = async () => {
    const element = document.getElementById("report-card-content");
    if (!element) return;
    const html2canvas = (await import("html2canvas")).default;
    const { default: jsPDF } = await import("jspdf");
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    const name = activeReportCard?.studentName || "student";
    pdf.save(`report-card-${name}-${activeReportCard?.term || ""}.pdf`);
  };
```

- [ ] **Step 2: Add new state variables**

After the existing `activeReportCard` state declaration, add:

```typescript
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [allSessionCards, setAllSessionCards] = useState<ReportCard[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
```

- [ ] **Step 3: Add useEffect to load all-sessions report cards**

After the existing "Load report cards for trend" useEffect (around line 98), add:

```typescript
  // Load report cards across ALL sessions for full history
  useEffect(() => {
    if (!showAllSessions || !user || !academicConfig) return;
    const allCards: ReportCard[] = [];
    const sessionKeys = Object.keys(academicConfig.sessions || {});

    Promise.all(
      sessionKeys.flatMap((sk) => {
        const session = academicConfig.sessions?.[sk];
        if (!session) return [];
        return Object.keys(session.terms).map(async (tk) => {
          const snap = await get(ref(db, `reportCards/${sk}/${tk}/${user.uid}`));
          if (snap.exists()) allCards.push(snap.val() as ReportCard);
        });
      })
    ).then(() => {
      allCards.sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
        const sessionTerms = Object.keys(academicConfig.sessions?.[a.sessionId]?.terms || {});
        return sessionTerms.indexOf(a.termId) - sessionTerms.indexOf(b.termId);
      });
      setAllSessionCards(allCards);
    });
  }, [showAllSessions, user, academicConfig]);
```

- [ ] **Step 4: Replace the trend chart section with enhanced version**

Find the existing trend chart block in the JSX. It starts with:
```tsx
            {reportCards.length > 0 && (
              <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <strong>Academic Trend</strong>
```

Replace the entire block (from `{reportCards.length > 0 && (` through its closing `)}`) with the same enhanced chart as ParentDashboard (identical code):

```tsx
            {(reportCards.length > 0 || allSessionCards.length > 0) && (
              <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Academic Trend</strong>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => { setShowAllSessions(!showAllSessions); setSelectedSubject(null); }}
                  >
                    {showAllSessions ? "Current session only" : "View all sessions"}
                  </button>
                </div>

                {/* Subject selector for drilldown */}
                {(() => {
                  const cards = showAllSessions ? allSessionCards : reportCards;
                  const subjectNames = [...new Set(cards.flatMap((c) => Object.values(c.subjects).map((s) => s.name)))];
                  if (subjectNames.length === 0) return null;
                  return (
                    <div style={{ marginTop: 8 }}>
                      <select
                        className="input"
                        style={{ fontSize: 12 }}
                        value={selectedSubject || ""}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSubject(e.target.value || null)}
                      >
                        <option value="">Overall Average</option>
                        {subjectNames.sort().map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12, padding: "0 20px" }}>
                  {(() => {
                    const cards = showAllSessions ? allSessionCards : reportCards;
                    if (cards.length === 0) return <span className="muted small">No data yet.</span>;

                    const getAvg = (card: ReportCard): number => {
                      if (!selectedSubject) return card.overallAverage;
                      const subj = Object.values(card.subjects).find((s) => s.name === selectedSubject);
                      if (!subj || subj.totalMax === 0) return 0;
                      return (subj.total / subj.totalMax) * 100;
                    };

                    const maxAvg = Math.max(...cards.map(getAvg), 100);
                    return cards.map((card) => {
                      const avg = getAvg(card);
                      const height = avg > 0 ? (avg / maxAvg) * 100 : 0;
                      return (
                        <div key={`${card.sessionId}-${card.termId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                          <div style={{ background: "#1a365d", width: "100%", borderRadius: "4px 4px 0 0", height, minHeight: 4 }} />
                          <span style={{ fontSize: 9, marginTop: 4, color: "#999" }}>
                            {showAllSessions ? `${card.session}` : ""}
                          </span>
                          <span style={{ fontSize: 10, color: "#666" }}>{card.term.split(" ")[0]}</span>
                          <span style={{ fontSize: 11, fontWeight: "bold" }}>{avg > 0 ? `${Math.round(avg)}%` : "—"}</span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Change indicator */}
                {(() => {
                  const cards = showAllSessions ? allSessionCards : reportCards;
                  if (cards.length < 2) return null;
                  const getAvg = (card: ReportCard): number => {
                    if (!selectedSubject) return card.overallAverage;
                    const subj = Object.values(card.subjects).find((s) => s.name === selectedSubject);
                    if (!subj || subj.totalMax === 0) return 0;
                    return (subj.total / subj.totalMax) * 100;
                  };
                  const latest = cards[cards.length - 1]!;
                  const previous = cards[cards.length - 2]!;
                  const change = getAvg(latest) - getAvg(previous);
                  return (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: change >= 0 ? "#2ecc71" : "#e74c3c" }}>
                      {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% {change >= 0 ? "improvement" : "decline"} from last term
                    </div>
                  );
                })()}
              </div>
            )}
```

- [ ] **Step 5: Filter grades by selected term**

In `renderGrades()` (around line 131), after the `assignments` array is built from `Object.values(classData.assignments)`, add term filtering:

Find:
```typescript
      const assignments: Assignment[] = classData?.assignments
        ? Object.values(classData.assignments)
        : [];
```

Replace with:
```typescript
      const allAssignments: Assignment[] = classData?.assignments
        ? Object.values(classData.assignments)
        : [];
      const assignments = selectedTerm && selectedSession
        ? allAssignments.filter((a) => a.termId === selectedTerm && a.sessionId === selectedSession)
        : allAssignments;
```

- [ ] **Step 6: Run typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: Both pass with zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/StudentDashboard.tsx
git commit -m "feat: add all-sessions trend, subject drilldown, and term grade filter to StudentDashboard"
```

---

### Task 6: Final build verification and deploy

**Files:**
- All modified files from Tasks 1-5

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: Zero errors.

- [ ] **Step 2: Run frontend build**

```bash
npm run build
```

Expected: Build succeeds, output in `dist/`.

- [ ] **Step 3: Run functions build**

```bash
cd functions && npm run build && cd ..
```

Expected: Build succeeds.

- [ ] **Step 4: Deploy**

```bash
npx firebase deploy --only functions,database,hosting
```

Expected: All deploy targets succeed, site live at https://kgrades.web.app.

- [ ] **Step 5: Commit if any fixes were needed**

If any typecheck or build issues were fixed during this task, commit them:

```bash
git add -A
git commit -m "fix: resolve build issues from remaining features implementation"
```
