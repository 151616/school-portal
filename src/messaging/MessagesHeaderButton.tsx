import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { get, onValue, ref } from "firebase/database";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/firebase";
import { MessageIcon } from "@/shared/icons";
import type { Thread } from "@/types";
import { isAllowedRolePair } from "@/shared/utils/roleUtils";

interface Props {
  currentUser: FirebaseUser;
}

/**
 * Lightweight header button that shows the unread-message badge and
 * navigates to the full Messages page. Keeps its own subscription to
 * threadIndex so the badge updates even when the Messages page isn't open.
 */
export default function MessagesHeaderButton({ currentUser }: Props) {
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === "/messages";

  useEffect(() => {
    if (!currentUser) {
      setThreads({});
      return undefined;
    }
    let active = true;
    const idxRef = ref(db, `threadIndex/${currentUser.uid}`);
    const unsubscribe = onValue(idxRef, async (snapshot) => {
      const ids = snapshot.exists() ? Object.keys(snapshot.val()) : [];
      const next: Record<string, Thread> = {};
      await Promise.all(
        ids.map(async (id) => {
          const snap = await get(ref(db, `threads/${id}`));
          if (snap.exists()) next[id] = snap.val() as Thread;
        })
      );
      if (active) setThreads(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser]);

  const totalUnread = useMemo(() => {
    if (!currentUser) return 0;
    let count = 0;
    Object.values(threads).forEach((thread) => {
      if (!thread) return;
      if (!isAllowedRolePair(thread.roleA, thread.roleB)) return;
      const readBy = thread.readBy || {};
      const readAt = Number(readBy[currentUser.uid] || 0);
      if (
        thread.lastSender &&
        thread.lastSender !== currentUser.uid &&
        Number(thread.updatedAt || 0) > readAt
      ) {
        count += 1;
      }
    });
    return count;
  }, [threads, currentUser]);

  return (
    <button
      className={`header-menu-button icon-only${isActive ? " is-active" : ""}`}
      type="button"
      onClick={() => navigate(isActive ? "/" : "/messages")}
      aria-label="Messages"
      title="Messages"
    >
      <MessageIcon className="icon" />
      {totalUnread > 0 && (
        <span className="header-badge" aria-hidden="true">
          {totalUnread > 9 ? "9+" : totalUnread}
        </span>
      )}
    </button>
  );
}
