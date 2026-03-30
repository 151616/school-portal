import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/firebase";
import type { AcademicConfig } from "@/types";

interface ActiveTerm {
  sessionId: string;
  sessionLabel: string;
  termId: string;
  termLabel: string;
}

interface UseAcademicConfigResult {
  academicConfig: AcademicConfig | null;
  activeTerm: ActiveTerm | null;
  selectedSession: string;
  setSelectedSession: (session: string) => void;
  selectedTerm: string;
  setSelectedTerm: (term: string) => void;
  loading: boolean;
}

/**
 * Subscribe to academicConfig/default and manage session/term selection state.
 * Automatically selects the current session and active term on load.
 */
export function useAcademicConfig(): UseAcademicConfigResult {
  const [academicConfig, setAcademicConfig] = useState<AcademicConfig | null>(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const configRef = ref(db, "academicConfig/default");
    const unsub = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const c = snap.val() as AcademicConfig;
        setAcademicConfig(c);
        if (!initialized && c.currentSession) {
          setSelectedSession(c.currentSession);
          const session = c.sessions?.[c.currentSession];
          if (session?.activeTerm) setSelectedTerm(session.activeTerm);
          setInitialized(true);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [initialized]);

  const activeTerm = useMemo((): ActiveTerm | null => {
    if (!academicConfig) return null;
    const sessionKey = academicConfig.currentSession;
    const session = academicConfig.sessions?.[sessionKey];
    if (!session) return null;
    const termKey = session.activeTerm;
    const term = session.terms?.[termKey];
    if (!term) return null;
    return {
      sessionId: sessionKey,
      sessionLabel: session.label,
      termId: termKey,
      termLabel: term.label,
    };
  }, [academicConfig]);

  return {
    academicConfig,
    activeTerm,
    selectedSession,
    setSelectedSession,
    selectedTerm,
    setSelectedTerm,
    loading,
  };
}
