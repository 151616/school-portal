import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { get, onValue, push, ref, set, update } from "firebase/database";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/firebase";
import { MessageIcon } from "@/shared/icons";
import { addToast } from "@/shared/toastService";
import type { UserRole, User, Thread, Message } from "@/types";
import { formatRelativeTime } from "@/shared/utils/dateUtils";
import { roleTargets, normalizeRole, isAllowedRolePair } from "@/shared/utils/roleUtils";

interface MessagingPanelProps {
  currentUser: FirebaseUser;
  currentRole: UserRole;
}

type UserWithUid = User & { uid: string };
type ThreadWithMeta = Thread & { id: string; displayName: string; unread: boolean };
type MessageWithId = Message & { id: string };

const threadIdFor = (a: string, b: string): string => [a, b].sort().join("_");

const logMessagingDebug = (label: string, details: unknown): void => {
  console.debug("[MessagingPanel]", label, details);
};

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

export default function MessagingPanel({ currentUser, currentRole }: MessagingPanelProps) {
  const [users, setUsers] = useState<UserWithUid[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [messageText, setMessageText] = useState<string>("");
  const [contactSearch, setContactSearch] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showContacts, setShowContacts] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
      (error) => {
        console.error("Threads index error:", error);
      }
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
      (error) => {
        console.error("Messages read error:", error);
      }
    );

    return () => unsubscribe();
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
      setShowContacts(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setShowContacts(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

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

        const otherUid =
          thread.userA === currentUser.uid ? thread.userB : thread.userA;
        if (!otherUid) return null;

        const other = usersById[otherUid];
        const otherLabel = other
          ? `${other.firstName || ""} ${other.lastInitial ? `${other.lastInitial}.` : ""}`.trim() ||
            "User"
          : "User";
        const displayName = other ? `${otherLabel} - ${other.email}` : otherUid;
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
          displayName,
          unread,
        } as ThreadWithMeta;
      })
      .filter((t): t is ThreadWithMeta => t !== null)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [currentUser, threads, usersById]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const stillVisible = threadList.some((thread) => thread.id === selectedThreadId);
    if (!stillVisible) {
      setSelectedThreadId("");
      setMessages([]);
    }
  }, [selectedThreadId, threadList]);

  useEffect(() => {
    if (!currentUser || !isOpen || !selectedThreadId) return;

    const activeThread = threadList.find((thread) => thread.id === selectedThreadId);
    if (activeThread && activeThread.unread) {
      update(ref(db, `threads/${selectedThreadId}`), {
        [`readBy/${currentUser.uid}`]: Date.now(),
      }).catch((error) => {
        console.error("Thread read update error:", error);
      });
    }
  }, [currentUser, isOpen, selectedThreadId, threadList]);

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

  const totalUnread = useMemo<number>(
    () => threadList.reduce((count, thread) => count + (thread.unread ? 1 : 0), 0),
    [threadList]
  );

  const selectedThread = useMemo<ThreadWithMeta | null>(
    () => threadList.find((thread) => thread.id === selectedThreadId) || null,
    [selectedThreadId, threadList]
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
          readBy: {
            ...(thread.readBy || {}),
            [currentUser.uid]: Date.now(),
          },
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
      logMessagingDebug("openThread:start", {
        threadId,
        currentUid: currentUser.uid,
        currentRole: currentRoleValue,
        otherUid: other.uid,
        otherRole: otherRoleValue,
      });

      let existingThread: Thread | null = null;

      try {
        const existing = await get(threadRef);
        existingThread = existing.exists() ? (existing.val() as Thread) : null;
      } catch (error) {
        const message = String((error as { message?: string })?.message || "");
        if (!message.toLowerCase().includes("permission denied")) {
          throw error;
        }

        console.info("[MessagingPanel] openThread:threadReadDeniedTreatAsNew", {
          threadId,
          path: `threads/${threadId}`,
          reason: message,
        });
      }

      const threadRecord = buildThreadRecord({
        currentUid: currentUser.uid,
        currentRoleValue,
        otherUid: other.uid,
        otherRoleValue,
        existingThread,
        now,
      });

      logMessagingDebug("openThread:existing", {
        threadId,
        exists: !!existingThread,
        existingThread,
        nextThread: threadRecord,
      });

      if (!existingThread) {
        logMessagingDebug("openThread:createThread", {
          threadId,
          path: `threads/${threadId}`,
        });
        await set(threadRef, threadRecord);
      } else {
        const thread = existingThread;
        if (!sameParticipantPair(thread, currentUser.uid, other.uid)) {
          logMessagingDebug("openThread:invalidParticipants", {
            threadId,
            existingThread: thread,
          });
          addToast("error", "This conversation has invalid participants.");
          return;
        }

        if (!isAllowedRolePair(threadRecord.roleA, threadRecord.roleB)) {
          logMessagingDebug("openThread:invalidRolePair", {
            threadId,
            roleA: threadRecord.roleA,
            roleB: threadRecord.roleB,
          });
          addToast("error", "This conversation is no longer available.");
          return;
        }

        if (threadNeedsRepair(thread, threadRecord)) {
          logMessagingDebug("openThread:repairThread", {
            threadId,
            path: `threads/${threadId}`,
            existingThread: thread,
            nextThread: threadRecord,
          });
          await update(threadRef, threadRecord);
        }
      }

      logMessagingDebug("openThread:writeOwnIndex", {
        threadId,
        path: `threadIndex/${currentUser.uid}/${threadId}`,
      });
      await set(ref(db, `threadIndex/${currentUser.uid}/${threadId}`), true);

      try {
        logMessagingDebug("openThread:writePeerIndex", {
          threadId,
          path: `threadIndex/${other.uid}/${threadId}`,
        });
        await set(ref(db, `threadIndex/${other.uid}/${threadId}`), true);
      } catch (error) {
        console.warn("[MessagingPanel] openThread:writePeerIndex:error", {
          threadId,
          path: `threadIndex/${other.uid}/${threadId}`,
          code: (error as { code?: string })?.code || null,
          message: (error as { message?: string })?.message || String(error),
        });
      }

      setSelectedThreadId(threadId);
      setIsOpen(true);
      setShowContacts(false);
      setContactSearch("");
      logMessagingDebug("openThread:markRead", {
        threadId,
        path: `threads/${threadId}/readBy/${currentUser.uid}`,
      });
      await markThreadRead(threadId);
      logMessagingDebug("openThread:success", { threadId });
    } catch (error) {
      console.error("[MessagingPanel] openThread:error", {
        threadId,
        currentUid: currentUser.uid,
        currentRole: currentRoleValue,
        otherUid: other.uid,
        otherRole: otherRoleValue,
        code: (error as { code?: string })?.code || null,
        message: (error as { message?: string })?.message || String(error),
      });
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
      await set(msgRef, {
        from: currentUser.uid,
        text,
        createdAt: now,
      });

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

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        className="header-menu-button icon-only"
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (isOpen) setShowContacts(false);
        }}
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

      {isOpen && (
        <div className="header-popover messages-popover">
          <div className="popover-title-row">
            <h3>Messages</h3>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowContacts((prev) => !prev)}
            >
              {showContacts ? "Hide contacts" : "New message"}
            </button>
          </div>

          <div className="messages-layout">
            <div className="messages-column">
              <div className="small">Conversations</div>
              <div className="popover-list">
                {threadList.length === 0 ? (
                  <div className="small">No conversations yet.</div>
                ) : (
                  threadList.map((thread) => (
                    <button
                      key={thread.id}
                      className={`thread-item${selectedThreadId === thread.id ? " is-active" : ""}`}
                      type="button"
                      onClick={async () => {
                        setSelectedThreadId(thread.id);
                        await markThreadRead(thread.id);
                      }}
                    >
                      <div className="thread-item-top">
                        <strong>{thread.displayName}</strong>
                        {thread.unread && <span className="thread-unread-dot" />}
                      </div>
                      <div className="small">
                        {thread.lastMessage
                          ? thread.lastMessage.slice(0, 60)
                          : "No messages yet"}
                      </div>
                      <div className="small popover-item-time">
                        {formatRelativeTime(thread.updatedAt)}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {showContacts && (
                <div className="messages-contacts">
                  <input
                    className="input"
                    type="text"
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setContactSearch(e.target.value)
                    }
                  />
                  <div className="popover-list">
                    {contacts.length === 0 ? (
                      <div className="small">
                        {contactSearch.trim()
                          ? "No contacts found."
                          : "No contacts available."}
                      </div>
                    ) : (
                      contacts.map((user) => (
                        <button
                          key={user.uid}
                          className="thread-item"
                          type="button"
                          onClick={() => openThreadWith(user)}
                        >
                          <div className="thread-item-top">
                            <strong>
                              {`${user.firstName || ""} ${user.lastInitial ? `${user.lastInitial}.` : ""}`.trim() ||
                                "User"}
                            </strong>
                          </div>
                          <div className="small">{user.email}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="messages-column messages-thread-column">
              {selectedThread ? (
                <>
                  <div className="small">{selectedThread.displayName}</div>
                  <div className="message-stream">
                    {messages.length === 0 ? (
                      <div className="small">No messages yet.</div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`message-bubble${
                            message.from === currentUser.uid ? " is-self" : ""
                          }`}
                        >
                          <div className="message-label">
                            {message.from === currentUser.uid ? "You" : "Them"}
                          </div>
                          <div>{message.text}</div>
                          <div className="small popover-item-time">
                            {formatRelativeTime(message.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setMessageText(e.target.value)
                      }
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") sendMessage();
                      }}
                    />
                    <button className="btn btn-primary" type="button" onClick={sendMessage}>
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <div className="small">Select a conversation or start a new one.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
