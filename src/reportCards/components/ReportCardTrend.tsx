import type { ReportCard } from "@/types";

interface ReportCardTrendProps {
  reportCards: ReportCard[];
  allSessionCards: ReportCard[];
  showAllSessions: boolean;
  onToggleAllSessions: () => void;
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
}

export default function ReportCardTrend({
  reportCards,
  allSessionCards,
  showAllSessions,
  onToggleAllSessions,
  selectedSubject,
  onSelectSubject,
}: ReportCardTrendProps) {
  const cards = showAllSessions ? allSessionCards : reportCards;
  if (cards.length === 0) return null;

  const subjectNames = [
    ...new Set(cards.flatMap((card) => Object.values(card.subjects).map((subject) => subject.name))),
  ];

  const getAverage = (card: ReportCard): number => {
    if (!selectedSubject) return card.overallAverage;
    const subject = Object.values(card.subjects).find((entry) => entry.name === selectedSubject);
    if (!subject || subject.totalMax === 0) return 0;
    return (subject.total / subject.totalMax) * 100;
  };

  const maxAverage = Math.max(...cards.map(getAverage), 100);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Academic Trend</strong>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={onToggleAllSessions}
        >
          {showAllSessions ? "Current session only" : "View all sessions"}
        </button>
      </div>

      {subjectNames.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <select
            className="input"
            style={{ fontSize: 12 }}
            value={selectedSubject || ""}
            onChange={(event) => onSelectSubject(event.target.value || null)}
          >
            <option value="">Overall Average</option>
            {subjectNames.sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 120,
          marginTop: 12,
          padding: "0 20px",
        }}
      >
        {cards.map((card) => {
          const average = getAverage(card);
          const height = average > 0 ? (average / maxAverage) * 100 : 0;
          return (
            <div
              key={`${card.sessionId}-${card.termId}`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
            >
              <div
                style={{
                  background: "#1a365d",
                  width: "100%",
                  borderRadius: "4px 4px 0 0",
                  height,
                  minHeight: 4,
                }}
              />
              <span style={{ fontSize: 9, marginTop: 4, color: "#999" }}>
                {showAllSessions ? card.session : ""}
              </span>
              <span style={{ fontSize: 10, color: "#666" }}>{card.term.split(" ")[0]}</span>
              <span style={{ fontSize: 11, fontWeight: "bold" }}>
                {average > 0 ? `${Math.round(average)}%` : "N/A"}
              </span>
            </div>
          );
        })}
      </div>

      {cards.length >= 2 &&
        (() => {
          const latest = cards[cards.length - 1]!;
          const previous = cards[cards.length - 2]!;
          const change = getAverage(latest) - getAverage(previous);
          return (
            <div
              style={{
                textAlign: "center",
                marginTop: 8,
                fontSize: 12,
                color: change >= 0 ? "#2ecc71" : "#e74c3c",
              }}
            >
              {change >= 0 ? "+" : "-"} {Math.abs(change).toFixed(1)}%{" "}
              {change >= 0 ? "improvement" : "decline"} from last term
            </div>
          );
        })()}
    </div>
  );
}
