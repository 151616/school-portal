import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { get, onValue, ref, remove, update } from "firebase/database";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import type { Thread, Message, User, UserRole } from "@/types";
import Combobox from "@/shared/components/Combobox";

interface AdminAuditProps {
  user: FirebaseUser;
  mySchoolId: string | null;
}

interface UserLite {
  uid: string;
  email?: string;
  firstName?: string;
  lastInitial?: string;
  role?: UserRole;
  schoolId?: string;
}

interface AuditThread extends Thread {
  id: string;
  otherA: UserLite | undefined;
  otherB: UserLite | undefined;
  displayLabel: string;
  searchBlob: string;
}

interface AuditMessage extends Message {
  id: string;
  deletedAt?: number;
  deletedBy?: string;
  flaggedAt?: number;
  flaggedBy?: string;
}

const getUserLabel = (u: UserLite | undefined): string => {
  if (!u) return "Unknown user";
  return (
    `${u.firstName || ""} ${u.lastInitial ? `${u.lastInitial}.` : ""}`.trim() ||
    u.email ||
    "User"
  );
};

const getInitials = (u: UserLite | undefined): string => {
  if (!u) return "?";
  const first = (u.firstName || u.email || "?").charAt(0).toUpperCase();
  const last = (u.lastInitial || "").charAt(0).toUpperCase();
  return `${first}${last}` || "?";
};

const formatFullTimestamp = (ts: number): string => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatRelativeShort = (ts: number): string => {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const csvEscape = (value: string): string => {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export default function AdminAudit({ user, mySchoolId }: AdminAuditProps) {
  const [users, setUsers] = useState<Record<string, UserLite>>({});
  const [threadIds, setThreadIds] = useState<string[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [threadsLoading, setThreadsLoading] = useState<boolean>(false);

  // Load all users (for rendering names)
  useEffect(() => {
    const usersRef = ref(db, "Users");
    const unsub = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const map: Record<string, UserLite> = {};
      Object.entries(data).forEach(([uid, u]) => {
        map[uid] = { uid, ...(u as User) };
      });
      setUsers(map);
    });
    return () => unsub();
  }, []);

  // Load thread IDs scoped to current school via adminThreadIndex
  useEffect(() => {
    if (!mySchoolId) {
      setThreadIds([]);
      return;
    }
    setThreadsLoading(true);
    const idxRef = ref(db, `adminThreadIndex/${mySchoolId}`);
    const unsub = onValue(
      idxRef,
      (snapshot) => {
        const ids = snapshot.exists() ? Object.keys(snapshot.val()) : [];
        setThreadIds(ids);
        setThreadsLoading(false);
      },
      (error) => {
        console.error("Admin thread index error:", error);
        setThreadsLoading(false);
      }
    );
    return () => unsub();
  }, [mySchoolId]);

  // Load thread metadata for each id
  useEffect(() => {
    if (threadIds.length === 0) {
      setThreads({});
      return;
    }
    let active = true;
    (async () => {
      try {
        const entries = await Promise.all(
          threadIds.map(async (id) => {
            try {
              const snap = await get(ref(db, `threads/${id}`));
              return snap.exists() ? ([id, snap.val() as Thread] as const) : null;
            } catch {
              return null;
            }
          })
        );
        if (!active) return;
        const next: Record<string, Thread> = {};
        entries.forEach((e) => {
          if (e) next[e[0]] = e[1];
        });
        setThreads(next);
      } catch (err) {
        console.error("Error loading threads:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [threadIds]);

  // Load messages of selected thread
  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    const msgRef = ref(db, `messages/${selectedThreadId}`);
    const unsub = onValue(msgRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list: AuditMessage[] = Object.entries(data)
        .map(([id, m]) => ({ id, ...(m as Message & { deletedAt?: number; deletedBy?: string; flaggedAt?: number; flaggedBy?: string }) }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(list);
    });
    return () => unsub();
  }, [selectedThreadId]);

  const auditThreads = useMemo<AuditThread[]>(() => {
    return Object.entries(threads)
      .map(([id, thread]) => {
        const a = users[thread.userA];
        const b = users[thread.userB];
        const aLabel = getUserLabel(a);
        const bLabel = getUserLabel(b);
        const displayLabel = `${aLabel} ↔ ${bLabel}`;
        const searchBlob = [
          aLabel,
          bLabel,
          a?.email || "",
          b?.email || "",
          thread.lastMessage || "",
          thread.roleA || "",
          thread.roleB || "",
        ]
          .join(" ")
          .toLowerCase();
        return {
          id,
          ...thread,
          otherA: a,
          otherB: b,
          displayLabel,
          searchBlob,
        } as AuditThread;
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [threads, users]);

  const filteredThreads = useMemo<AuditThread[]>(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : 0;
    return auditThreads.filter((t) => {
      if (q && !t.searchBlob.includes(q)) return false;
      if (roleFilter !== "all") {
        const [r1, r2] = roleFilter.split("-");
        const pair = [t.roleA, t.roleB].sort().join("-");
        const wanted = [r1, r2].sort().join("-");
        if (pair !== wanted) return false;
      }
      const updated = Number(t.updatedAt || 0);
      if (fromTs && updated < fromTs) return false;
      if (toTs && updated > toTs) return false;
      return true;
    });
  }, [auditThreads, search, roleFilter, dateFrom, dateTo]);

  const selectedThread = useMemo<AuditThread | null>(
    () => auditThreads.find((t) => t.id === selectedThreadId) || null,
    [auditThreads, selectedThreadId]
  );

  const handleDeleteMessage = async (msg: AuditMessage) => {
    if (!selectedThreadId) return;
    const confirmed = window.confirm(
      `Delete this message?\n\n"${msg.text.slice(0, 100)}${msg.text.length > 100 ? "..." : ""}"\n\nThis cannot be undone.`
    );
    if (!confirmed) return;
    try {
      // Soft-delete: keep the record but mark as deleted + blank out text
      await update(ref(db, `messages/${selectedThreadId}/${msg.id}`), {
        text: "[message removed by admin]",
        deletedAt: Date.now(),
        deletedBy: user.uid,
      });
      addToast("success", "Message deleted");
    } catch (err) {
      console.error("Delete message error:", err);
      addToast("error", "Unable to delete message");
    }
  };

  const handleFlagMessage = async (msg: AuditMessage) => {
    if (!selectedThreadId) return;
    try {
      if (msg.flaggedAt) {
        await update(ref(db, `messages/${selectedThreadId}/${msg.id}`), {
          flaggedAt: null,
          flaggedBy: null,
        });
        addToast("success", "Flag removed");
      } else {
        await update(ref(db, `messages/${selectedThreadId}/${msg.id}`), {
          flaggedAt: Date.now(),
          flaggedBy: user.uid,
        });
        addToast("success", "Message flagged");
      }
    } catch (err) {
      console.error("Flag message error:", err);
      addToast("error", "Unable to flag message");
    }
  };

  const handleDeleteThread = async () => {
    if (!selectedThreadId || !selectedThread) return;
    const confirmed = window.confirm(
      `Delete entire thread between ${selectedThread.displayLabel}?\n\nAll ${messages.length} messages will be removed. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await remove(ref(db, `messages/${selectedThreadId}`));
      await remove(ref(db, `threads/${selectedThreadId}`));
      if (mySchoolId) {
        await remove(ref(db, `adminThreadIndex/${mySchoolId}/${selectedThreadId}`));
      }
      await remove(ref(db, `threadIndex/${selectedThread.userA}/${selectedThreadId}`));
      await remove(ref(db, `threadIndex/${selectedThread.userB}/${selectedThreadId}`));
      setSelectedThreadId("");
      addToast("success", "Thread deleted");
    } catch (err) {
      console.error("Delete thread error:", err);
      addToast("error", "Unable to delete thread");
    }
  };

  const handleExportCsv = () => {
    if (!selectedThread || messages.length === 0) return;
    const rows: string[] = [];
    rows.push(["Timestamp", "From UID", "From Name", "From Email", "Text", "Flagged", "Deleted"].map(csvEscape).join(","));
    messages.forEach((m) => {
      const sender = users[m.from];
      rows.push(
        [
          formatFullTimestamp(m.createdAt || 0),
          m.from,
          getUserLabel(sender),
          sender?.email || "",
          m.text,
          m.flaggedAt ? "yes" : "",
          m.deletedAt ? "yes" : "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${selectedThread.id}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="audit-page">
      <div className="audit-banner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <strong>Message Audit</strong> — This page shows private communications between users
          in your school. Access is logged. Use only for legitimate oversight and safety reviews.
        </div>
      </div>

      <div className="audit-filters">
        <input
          type="text"
          className="input"
          placeholder="Search by name, email, or last message..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          style={{ flex: 2, minWidth: 200 }}
        />
        <Combobox
          options={[
            { value: "all", label: "All role pairs" },
            { value: "student-teacher", label: "Student ↔ Teacher" },
            { value: "parent-teacher", label: "Parent ↔ Teacher" },
            { value: "admin-teacher", label: "Admin ↔ Teacher" },
            { value: "admin-student", label: "Admin ↔ Student" },
            { value: "admin-parent", label: "Admin ↔ Parent" },
          ]}
          value={roleFilter}
          onChange={setRoleFilter}
          style={{ minWidth: 180 }}
        />
        <input
          type="date"
          className="input"
          value={dateFrom}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)}
          style={{ maxWidth: 160 }}
          title="From date"
        />
        <input
          type="date"
          className="input"
          value={dateTo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)}
          style={{ maxWidth: 160 }}
          title="To date"
        />
        {(search || roleFilter !== "all" || dateFrom || dateTo) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="audit-layout">
        <aside className="audit-sidebar">
          <div className="audit-sidebar-header">
            <span>Threads</span>
            <span className="audit-count">{filteredThreads.length}</span>
          </div>
          <div className="audit-thread-list">
            {threadsLoading ? (
              <div className="msg-empty-note">Loading…</div>
            ) : filteredThreads.length === 0 ? (
              <div className="msg-empty-note">
                {mySchoolId ? "No threads match your filters." : "School ID not set."}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const aInitials = getInitials(thread.otherA);
                const bInitials = getInitials(thread.otherB);
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`audit-thread-item${
                      selectedThreadId === thread.id ? " is-active" : ""
                    }`}
                    onClick={() => setSelectedThreadId(thread.id)}
                  >
                    <div className="audit-avatar-pair">
                      <div className="msg-avatar msg-avatar-sm">{aInitials}</div>
                      <div className="msg-avatar msg-avatar-sm audit-avatar-overlap">{bInitials}</div>
                    </div>
                    <div className="audit-thread-body">
                      <div className="audit-thread-title">{thread.displayLabel}</div>
                      <div className="audit-thread-meta">
                        <span className="audit-role-chip">
                          {thread.roleA} ↔ {thread.roleB}
                        </span>
                        <span>·</span>
                        <span>{formatRelativeShort(Number(thread.updatedAt || 0))}</span>
                      </div>
                      <div className="audit-thread-preview">
                        {thread.lastMessage || "No messages"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="audit-viewer">
          {selectedThread ? (
            <>
              <header className="audit-viewer-header">
                <div className="audit-viewer-title">
                  <div className="audit-viewer-name">{selectedThread.displayLabel}</div>
                  <div className="audit-viewer-sub">
                    {selectedThread.otherA?.email} · {selectedThread.otherB?.email}
                  </div>
                </div>
                <div className="audit-viewer-actions">
                  <button className="btn btn-ghost btn-sm" onClick={handleExportCsv} disabled={messages.length === 0}>
                    Export CSV
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleDeleteThread}>
                    Delete thread
                  </button>
                </div>
              </header>

              <div className="audit-message-list">
                {messages.length === 0 ? (
                  <div className="msg-empty-note">No messages in this thread.</div>
                ) : (
                  messages.map((m) => {
                    const sender = users[m.from];
                    return (
                      <div
                        key={m.id}
                        className={`audit-message${m.flaggedAt ? " is-flagged" : ""}${m.deletedAt ? " is-deleted" : ""}`}
                      >
                        <div className="msg-avatar msg-avatar-sm">{getInitials(sender)}</div>
                        <div className="audit-message-body">
                          <div className="audit-message-header">
                            <span className="audit-message-sender">{getUserLabel(sender)}</span>
                            <span className="audit-message-role">{sender?.role}</span>
                            <span className="audit-message-time">
                              {formatFullTimestamp(m.createdAt || 0)}
                            </span>
                            {m.flaggedAt && <span className="audit-message-badge flagged">Flagged</span>}
                            {m.deletedAt && <span className="audit-message-badge deleted">Deleted</span>}
                          </div>
                          <div className="audit-message-text">{m.text}</div>
                          <div className="audit-message-actions">
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleFlagMessage(m)}
                            >
                              {m.flaggedAt ? "Unflag" : "Flag"}
                            </button>
                            {!m.deletedAt && (
                              <button
                                className="btn btn-danger btn-xs"
                                onClick={() => handleDeleteMessage(m)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="msg-placeholder">
              <div className="msg-placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <div className="msg-placeholder-title">Select a thread to audit</div>
              <div className="msg-placeholder-sub">
                Pick a conversation from the left to view its full history.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
