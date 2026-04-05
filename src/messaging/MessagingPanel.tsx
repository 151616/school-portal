import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { get, onValue, push, ref, set, update } from "firebase/database";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/firebase";
import { addToast } from "@/shared/toastService";
import type { UserRole, User, Thread, Message } from "@/types";
import { roleTargets, normalizeRole, isAllowedRolePair } from "@/shared/utils/roleUtils";

interface MessagingPanelProps {
  currentUser: FirebaseUser;
  currentRole: UserRole;
}

type UserWithUid = User & { uid: string };
type ThreadWithMeta = Thread & {
  id: string;
  otherUid: string;
  displayName: string;
  initials: string;
  email: string;
  unread: boolean;
};
type MessageWithId = Message & { id: string };

const threadIdFor = (a: string, b: string): string => [a, b].sort().join("_");

const sameParticipantPair = (
  thread: Thread | null,
  currentUid: string,
  otherUid: string
): boolean => {
  if (!thread) return false;
  const participants = [thread.userA, thread.userB].filter(Boolean).sort();
  const expected = [currentUid, otherUid].sort();
  return (
    participants.length === 2 &&
    participants[0] === expected[0] &&
    participants[1] === expected[1]
  );
};

interface BuildThreadRecordParams {
  currentUid: string;
  currentRoleValue: string;
  otherUid: string;
  otherRoleValue: string;
  existingThread: Thread | null;
  now: number;
}

const buildThreadRecord = ({
  currentUid,
  currentRoleValue,
  otherUid,
  otherRoleValue,
  existingThread,
  now,
}: BuildThreadRecordParams): Thread => {
  const preserveExistingOrder = sameParticipantPair(existingThread, currentUid, otherUid);
  const userA = preserveExistingOrder ? existingThread!.userA : currentUid;
  const userB = preserveExistingOrder ? existingThread!.userB : otherUid;
  const roleA = (userA === currentUid ? currentRoleValue : otherRoleValue) as UserRole;
  const roleB = (userB === currentUid ? currentRoleValue : otherRoleValue) as UserRole;
  const existingReadBy = existingThread?.readBy || {};
  const existingUpdatedAt = Number(existingThread?.updatedAt || 0);

  return {
    userA,
    userB,
    roleA,
    roleB,
    updatedAt: existingUpdatedAt > 0 ? existingUpdatedAt : now,
    lastMessage:
      typeof existingThread?.lastMessage === "string" ? existingThread.lastMessage : "",
    lastSender:
      typeof existingThread?.lastSender === "string" ? existingThread.lastSender : "",
    readBy: {
      [userA]: Number(existingReadBy[userA] ?? (userA === currentUid ? now : 0)) || 0,
      [userB]: Number(existingReadBy[userB] ?? (userB === currentUid ? now : 0)) || 0,
    },
  };
};

const threadNeedsRepair = (existingThread: Thread, nextThread: Thread): boolean => {
  if (existingThread.userA !== nextThread.userA) return true;
  if (existingThread.userB !== nextThread.userB) return true;
  if (existingThread.roleA !== nextThread.roleA) return true;
  if (existingThread.roleB !== nextThread.roleB) return true;
  if (typeof existingThread.updatedAt !== "number") return true;
  if (typeof existingThread.lastMessage !== "string") return true;
  if (typeof existingThread.lastSender !== "string") return true;
  const existingReadBy = existingThread.readBy || {};
  if (typeof existingReadBy[nextThread.userA] !== "number") return true;
  if (typeof existingReadBy[nextThread.userB] !== "number") return true;
  return false;
};

/* ── Display helpers ── */
const getUserLabel = (user: UserWithUid | undefined): string => {
  if (!user) return "User";
  return (
    `${user.firstName || ""} ${user.lastInitial ? `${user.lastInitial}.` : ""}`.trim() || "User"
  );
};

const getInitials = (user: UserWithUid | undefined): string => {
  if (!user) return "?";
  const first = (user.firstName || "?").charAt(0).toUpperCase();
  const last = (user.lastInitial || "").charAt(0).toUpperCase();
  return `${first}${last}` || "?";
};

const formatTime = (ts: number): string => {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const formatDateSeparator = (ts: number): string => {
  if (!ts) return "";
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

const formatListTime = (ts: number): string => {
  if (!ts) return "";
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/* ── Grouped messages ── */
interface RenderedItem {
  kind: "separator" | "message";
  key: string;
  date?: string;
  message?: MessageWithId;
  isSelf?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
}

const buildRenderedItems = (
  messages: MessageWithId[],
  currentUid: string
): RenderedItem[] => {
  const items: RenderedItem[] = [];
  let lastDateKey = "";
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]!;
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const dateKey = new Date(m.createdAt || 0).toDateString();
    if (dateKey !== lastDateKey) {
      items.push({
        kind: "separator",
        key: `sep-${dateKey}-${i}`,
        date: formatDateSeparator(m.createdAt || 0),
      });
      lastDateKey = dateKey;
    }
    const isSelf = m.from === currentUid;
    const isGroupStart =
      !prev ||
      prev.from !== m.from ||
      new Date(prev.createdAt || 0).toDateString() !== dateKey ||
      (m.createdAt || 0) - (prev.createdAt || 0) > 5 * 60 * 1000;
    const isGroupEnd =
      !next ||
      next.from !== m.from ||
      new Date(next.createdAt || 0).toDateString() !== dateKey ||
      (next.createdAt || 0) - (m.createdAt || 0) > 5 * 60 * 1000;
    items.push({
      kind: "message",
      key: m.id,
      message: m,
      isSelf,
      isGroupStart,
      isGroupEnd,
    });
  }
  return items;
};

export default function MessagingPanel({ currentUser, currentRole }: MessagingPanelProps) {
  const [users, setUsers] = useState<UserWithUid[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [messageText, setMessageText] = useState<string>("");
  const [contactSearch, setContactSearch] = useState<string>("");
  const [showContacts, setShowContacts] = useState<boolean>(false);
  const [conversationSearch, setConversationSearch] = useState<string>("");
  const streamRef = useRef<HTMLDivElement>(null);
  const hasAutoSelected = useRef<boolean>(false);

  useEffect(() => {
    if (!currentUser) {
      setUsers([]);
      return undefined;
    }
    const usersRef = ref(db, "Users");
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const nextUsers: UserWithUid[] = Object.entries(data).map(([uid, user]) => ({
        uid,
        ...(user as User),
      }));
      setUsers(nextUsers);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setThreads({});
      return undefined;
    }
    let active = true;
    const idxRef = ref(db, `threadIndex/${currentUser.uid}`);
    const unsubscribe = onValue(
      idxRef,
      async (snapshot) => {
        const ids = snapshot.exists() ? Object.keys(snapshot.val()) : [];
        const nextThreads: Record<string, Thread> = {};
        await Promise.all(
          ids.map(async (id) => {
            const snap = await get(ref(db, `threads/${id}`));
            if (snap.exists()) nextThreads[id] = snap.val() as Thread;
          })
        );
        if (active) setThreads(nextThreads);
      },
      (error) => console.error("Threads index error:", error)
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return undefined;
    }
    const msgRef = ref(db, `messages/${selectedThreadId}`);
    const unsubscribe = onValue(
      msgRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const list: MessageWithId[] = Object.entries(data)
          .map(([id, message]) => ({ id, ...(message as Message) }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setMessages(list);
      },
      (error) => console.error("Messages read error:", error)
    );
    return () => unsubscribe();
  }, [selectedThreadId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedThreadId]);

  const usersById = useMemo<Record<string, UserWithUid>>(() => {
    const map: Record<string, UserWithUid> = {};
    users.forEach((user) => {
      map[user.uid] = user;
    });
    return map;
  }, [users]);

  const threadList = useMemo<ThreadWithMeta[]>(() => {
    if (!currentUser) return [];
    return Object.entries(threads)
      .map(([id, thread]) => {
        if (!thread || !isAllowedRolePair(thread.roleA, thread.roleB)) return null;
        const otherUid = thread.userA === currentUser.uid ? thread.userB : thread.userA;
        if (!otherUid) return null;
        const other = usersById[otherUid];
        const displayName = getUserLabel(other);
        const initials = getInitials(other);
        const readBy = thread.readBy || {};
        const readAt = Number(readBy[currentUser.uid] || 0);
        const unread = !!(
          thread.lastSender &&
          thread.lastSender !== currentUser.uid &&
          Number(thread.updatedAt || 0) > readAt
        );
        return {
          id,
          ...thread,
          otherUid,
          displayName,
          initials,
          email: other?.email || "",
          unread,
        } as ThreadWithMeta;
      })
      .filter((t): t is ThreadWithMeta => t !== null)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [currentUser, threads, usersById]);

  const filteredThreadList = useMemo<ThreadWithMeta[]>(() => {
    const q = conversationSearch.trim().toLowerCase();
    if (!q) return threadList;
    return threadList.filter(
      (t) =>
        t.displayName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.lastMessage || "").toLowerCase().includes(q)
    );
  }, [threadList, conversationSearch]);

  // Auto-select most recent thread on first load
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (threadList.length === 0) return;
    if (selectedThreadId) {
      hasAutoSelected.current = true;
      return;
    }
    setSelectedThreadId(threadList[0]!.id);
    hasAutoSelected.current = true;
  }, [threadList, selectedThreadId]);

  // If selected thread disappears, clear it
  useEffect(() => {
    if (!selectedThreadId) return;
    const stillVisible = threadList.some((thread) => thread.id === selectedThreadId);
    if (!stillVisible) {
      setSelectedThreadId("");
      setMessages([]);
    }
  }, [selectedThreadId, threadList]);

  // Mark thread as read when selected
  useEffect(() => {
    if (!currentUser || !selectedThreadId) return;
    const activeThread = threadList.find((t) => t.id === selectedThreadId);
    if (activeThread && activeThread.unread) {
      update(ref(db, `threads/${selectedThreadId}`), {
        [`readBy/${currentUser.uid}`]: Date.now(),
      }).catch((error) => console.error("Thread read update error:", error));
    }
  }, [currentUser, selectedThreadId, threadList]);

  const contacts = useMemo<UserWithUid[]>(() => {
    if (!currentUser || !currentRole) return [];
    const allowed = roleTargets[normalizeRole(currentRole)] || [];
    const query = contactSearch.trim().toLowerCase();
    return users
      .filter((user) => user.uid !== currentUser.uid)
      .filter((user) => allowed.includes(normalizeRole(user.role)))
      .filter((user) => {
        if (!query) return true;
        return (
          String(user.email || "").toLowerCase().includes(query) ||
          String(user.firstName || "").toLowerCase().includes(query) ||
          String(user.lastInitial || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
  }, [contactSearch, currentRole, currentUser, users]);

  const selectedThread = useMemo<ThreadWithMeta | null>(
    () => threadList.find((thread) => thread.id === selectedThreadId) || null,
    [selectedThreadId, threadList]
  );

  const selectedOther = useMemo<UserWithUid | undefined>(
    () => (selectedThread ? usersById[selectedThread.otherUid] : undefined),
    [selectedThread, usersById]
  );

  const markThreadRead = async (threadId: string): Promise<void> => {
    if (!currentUser || !threadId) return;
    setThreads((prev) => {
      const thread = prev[threadId];
      if (!thread) return prev;
      return {
        ...prev,
        [threadId]: {
          ...thread,
          readBy: { ...(thread.readBy || {}), [currentUser.uid]: Date.now() },
        },
      };
    });
    try {
      await update(ref(db, `threads/${threadId}`), {
        [`readBy/${currentUser.uid}`]: Date.now(),
      });
    } catch (error) {
      console.error("Thread read update error:", error);
    }
  };

  const openThreadWith = async (other: UserWithUid): Promise<void> => {
    if (!currentUser || !other) return;
    const currentRoleValue = normalizeRole(currentRole);
    const otherRoleValue = normalizeRole(other.role);
    if (!isAllowedRolePair(currentRoleValue, otherRoleValue)) {
      addToast("error", "That conversation is not allowed.");
      return;
    }
    const threadId = threadIdFor(currentUser.uid, other.uid);
    const threadRef = ref(db, `threads/${threadId}`);
    const now = Date.now();
    try {
      let existingThread: Thread | null = null;
      try {
        const existing = await get(threadRef);
        existingThread = existing.exists() ? (existing.val() as Thread) : null;
      } catch (error) {
        const message = String((error as { message?: string })?.message || "");
        if (!message.toLowerCase().includes("permission denied")) throw error;
      }
      const threadRecord = buildThreadRecord({
        currentUid: currentUser.uid,
        currentRoleValue,
        otherUid: other.uid,
        otherRoleValue,
        existingThread,
        now,
      });
      if (!existingThread) {
        await set(threadRef, threadRecord);
      } else {
        if (!sameParticipantPair(existingThread, currentUser.uid, other.uid)) {
          addToast("error", "This conversation has invalid participants.");
          return;
        }
        if (!isAllowedRolePair(threadRecord.roleA, threadRecord.roleB)) {
          addToast("error", "This conversation is no longer available.");
          return;
        }
        if (threadNeedsRepair(existingThread, threadRecord)) {
          await update(threadRef, threadRecord);
        }
      }
      await set(ref(db, `threadIndex/${currentUser.uid}/${threadId}`), true);
      try {
        await set(ref(db, `threadIndex/${other.uid}/${threadId}`), true);
      } catch {
        /* ignore peer index errors */
      }
      // Write to admin audit index (school-scoped) so admins can oversee.
      try {
        const currentUserRecord = usersById[currentUser.uid];
        const schoolId = currentUserRecord?.schoolId || other.schoolId || null;
        if (schoolId) {
          await set(ref(db, `adminThreadIndex/${schoolId}/${threadId}`), true);
        }
      } catch {
        /* ignore admin index errors */
      }
      setSelectedThreadId(threadId);
      setShowContacts(false);
      setContactSearch("");
      await markThreadRead(threadId);
    } catch (error) {
      console.error("[MessagingPanel] openThread:error", error);
      addToast("error", "Unable to open that conversation right now.");
    }
  };

  const sendMessage = async (): Promise<void> => {
    if (!selectedThreadId) {
      addToast("error", "Select a conversation");
      return;
    }
    const text = messageText.trim();
    if (!text) return;
    const now = Date.now();
    const msgRef = push(ref(db, `messages/${selectedThreadId}`));
    try {
      await set(msgRef, { from: currentUser.uid, text, createdAt: now });
      await update(ref(db, `threads/${selectedThreadId}`), {
        updatedAt: now,
        lastMessage: text,
        lastSender: currentUser.uid,
        [`readBy/${currentUser.uid}`]: now,
      });
      setMessageText("");
    } catch (error) {
      console.error("Send message error:", error);
      addToast("error", "Unable to send that message.");
    }
  };

  if (!currentUser) return null;

  const renderedItems = buildRenderedItems(messages, currentUser.uid);

  return (
    <div className="msg-page">
      {/* ── Sidebar: conversations ── */}
      <aside className="msg-sidebar">
        <div className="msg-sidebar-header">
          <h2>Messages</h2>
          <button
            type="button"
            className={`btn btn-ghost btn-sm${showContacts ? " is-active" : ""}`}
            onClick={() => setShowContacts((prev) => !prev)}
            title={showContacts ? "Hide contacts" : "New message"}
          >
            {showContacts ? (
              "Cancel"
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New
              </>
            )}
          </button>
        </div>

        {showContacts ? (
          <>
            <div className="msg-search-wrap">
              <input
                className="input msg-search-input"
                type="text"
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setContactSearch(e.target.value)
                }
              />
            </div>
            <div className="msg-thread-list">
              {contacts.length === 0 ? (
                <div className="msg-empty-note">
                  {contactSearch.trim() ? "No contacts found." : "No contacts available."}
                </div>
              ) : (
                contacts.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    className="msg-thread-item"
                    onClick={() => openThreadWith(user)}
                  >
                    <div className="msg-avatar">{getInitials(user)}</div>
                    <div className="msg-thread-body">
                      <div className="msg-thread-top">
                        <span className="msg-thread-name">{getUserLabel(user)}</span>
                      </div>
                      <div className="msg-thread-preview">{user.email}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="msg-search-wrap">
              <input
                className="input msg-search-input"
                type="text"
                placeholder="Search conversations..."
                value={conversationSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setConversationSearch(e.target.value)
                }
              />
            </div>
            <div className="msg-thread-list">
              {filteredThreadList.length === 0 ? (
                <div className="msg-empty-note">
                  {conversationSearch.trim()
                    ? "No conversations found."
                    : "No conversations yet. Click \"New\" to start one."}
                </div>
              ) : (
                filteredThreadList.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`msg-thread-item${
                      selectedThreadId === thread.id ? " is-active" : ""
                    }${thread.unread ? " is-unread" : ""}`}
                    onClick={async () => {
                      setSelectedThreadId(thread.id);
                      await markThreadRead(thread.id);
                    }}
                  >
                    <div className="msg-avatar">{thread.initials}</div>
                    <div className="msg-thread-body">
                      <div className="msg-thread-top">
                        <span className="msg-thread-name">{thread.displayName}</span>
                        <span className="msg-thread-time">
                          {formatListTime(Number(thread.updatedAt || 0))}
                        </span>
                      </div>
                      <div className="msg-thread-preview">
                        {thread.lastSender === currentUser.uid && thread.lastMessage ? "You: " : ""}
                        {thread.lastMessage || "No messages yet"}
                      </div>
                    </div>
                    {thread.unread && <span className="msg-unread-dot" aria-hidden />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Thread panel ── */}
      <section className="msg-thread">
        {selectedThread ? (
          <>
            <header className="msg-thread-header">
              <div className="msg-avatar msg-avatar-lg">{selectedThread.initials}</div>
              <div className="msg-thread-header-info">
                <div className="msg-thread-header-name">{selectedThread.displayName}</div>
                {selectedOther?.email && (
                  <div className="msg-thread-header-meta">{selectedOther.email}</div>
                )}
              </div>
            </header>

            <div className="msg-stream" ref={streamRef}>
              {renderedItems.length === 0 ? (
                <div className="msg-stream-empty">
                  <div className="msg-stream-empty-title">No messages yet</div>
                  <div className="msg-stream-empty-sub">Send a message to start the conversation.</div>
                </div>
              ) : (
                renderedItems.map((item) => {
                  if (item.kind === "separator") {
                    return (
                      <div key={item.key} className="msg-date-separator">
                        <span>{item.date}</span>
                      </div>
                    );
                  }
                  const m = item.message!;
                  const classes = [
                    "msg-bubble-row",
                    item.isSelf ? "is-self" : "is-other",
                    item.isGroupStart ? "group-start" : "",
                    item.isGroupEnd ? "group-end" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div key={item.key} className={classes}>
                      {!item.isSelf && (
                        <div className="msg-bubble-avatar">
                          {item.isGroupEnd && (
                            <div className="msg-avatar msg-avatar-sm">
                              {selectedThread.initials}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="msg-bubble-wrap">
                        <div className="msg-bubble">{m.text}</div>
                        {item.isGroupEnd && (
                          <div className="msg-bubble-time">{formatTime(m.createdAt || 0)}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="msg-compose">
              <input
                className="input msg-compose-input"
                type="text"
                placeholder={`Message ${selectedThread.displayName}...`}
                value={messageText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMessageText(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                className="btn btn-primary msg-compose-send"
                type="button"
                onClick={sendMessage}
                disabled={!messageText.trim()}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4z" />
                </svg>
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="msg-placeholder">
            <div className="msg-placeholder-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div className="msg-placeholder-title">Select a conversation</div>
            <div className="msg-placeholder-sub">
              Choose one from the list or start a new message.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
