// src/hooks/useReportCards.ts

import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "@/firebase";
import type { AcademicConfig, ReportCard } from "@/types";

interface UseReportCardsResult {
  reportCards: ReportCard[];
  allSessionCards: ReportCard[];
  showAllSessions: boolean;
  setShowAllSessions: (show: boolean) => void;
  loading: boolean;
}

/**
 * Load report cards for a student — single session (by selected session) and all sessions.
 */
export function useReportCards(
  studentUid: string | null,
  selectedSession: string,
  academicConfig: AcademicConfig | null
): UseReportCardsResult {
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [allSessionCards, setAllSessionCards] = useState<ReportCard[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load report cards for selected session
  useEffect(() => {
    if (!studentUid || !selectedSession || !academicConfig) {
      setReportCards([]);
      setLoading(false);
      return;
    }
    const session = academicConfig.sessions?.[selectedSession];
    if (!session) {
      setReportCards([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const termKeys = Object.keys(session.terms);
    Promise.all(
      termKeys.map(async (tk) => {
        const snap = await get(ref(db, `reportCards/${selectedSession}/${tk}/${studentUid}`));
        return snap.exists() ? (snap.val() as ReportCard) : null;
      })
    ).then((cards) => {
      if (cancelled) return;
      const nextCards = cards.filter((c): c is ReportCard => c !== null);
      nextCards.sort(
        (left, right) => termKeys.indexOf(left.termId) - termKeys.indexOf(right.termId)
      );
      setReportCards(nextCards);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [studentUid, selectedSession, academicConfig]);

  // Load report cards across ALL sessions
  useEffect(() => {
    if (!showAllSessions || !studentUid || !academicConfig) {
      setAllSessionCards([]);
      return;
    }
    let cancelled = false;
    const allCards: ReportCard[] = [];
    const sessionKeys = Object.keys(academicConfig.sessions || {});

    Promise.all(
      sessionKeys.flatMap((sk) => {
        const session = academicConfig.sessions?.[sk];
        if (!session) return [];
        return Object.keys(session.terms).map(async (tk) => {
          const snap = await get(ref(db, `reportCards/${sk}/${tk}/${studentUid}`));
          if (snap.exists()) allCards.push(snap.val() as ReportCard);
        });
      })
    ).then(() => {
      if (cancelled) return;
      allCards.sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
        const sessionTerms = Object.keys(academicConfig.sessions?.[a.sessionId]?.terms || {});
        return sessionTerms.indexOf(a.termId) - sessionTerms.indexOf(b.termId);
      });
      setAllSessionCards(allCards);
    });

    return () => {
      cancelled = true;
    };
  }, [showAllSessions, studentUid, academicConfig]);

  return { reportCards, allSessionCards, showAllSessions, setShowAllSessions, loading };
}
