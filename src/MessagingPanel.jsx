import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue, get, set, push } from "firebase/database";
import { db } from "./firebase";
import { addToast } from "./toastService";

const roleTargets = {
  student: ["teacher"],
  teacher: ["student", "teacher", "admin"],
  admin: ["teacher", "admin"],
};

const threadIdFor = (a, b) => [a, b].sort().join("_");

const formatRelativeTime = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
};

export default function MessagingPanel({ currentUser, currentRole }) {
  const [users, setUsers] = useState([]);
  const [threads, setThreads] = useState({});
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState([]);
  const [threadUnread, setThreadUnread] = useState({});
  const [threadNames, setThreadNames] = useState({});
  const [messageText, setMessageText] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelActive, setPanelActive] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const panelRef = React.useRef(null);
  const panelBoxRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  const [caretLeft, setCaretLeft] = useState(40);

  useEffect(() => {
    if (!currentUser) return;
    const usersRef = ref(db, "Users");
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUsers(Object.entries(data).map(([uid, u]) => ({ uid, ...u })));
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const idxRef = ref(db, `threadIndex/${currentUser.uid}`);
    const unsubscribe = onValue(idxRef, async (snapshot) => {
      const ids = snapshot.exists() ? Object.keys(snapshot.val()) : [];
      const next = {};
      await Promise.all(
        ids.map(async (id) => {
          const snap = await get(ref(db, `threads/${id}`));
          if (snap.exists()) next[id] = snap.val();
        })
      );
      setThreads(next);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const seenKey = `thread_seen_${currentUser.uid}`;
    let seen = {};
    try {
      seen = JSON.parse(localStorage.getItem(seenKey) || "{}");
    } catch {
      seen = {};
    }

    const compute = async () => {
      const unreadMap = {};
      const names = {};
      const ids = Object.keys(threads);
      await Promise.all(
        ids.map(async (id) => {
          const t = threads[id];
          const otherUid = t.userA === currentUser.uid ? t.userB : t.userA;
          const other = users.find((u) => u.uid === otherUid);
          names[id] = other
            ? `${other.firstName || "User"} ${other.lastInitial ? `${other.lastInitial}.` : ""} - ${other.email}`
            : otherUid;

          const msgsSnap = await get(ref(db, `messages/${id}`));
          const msgs = msgsSnap.exists() ? Object.values(msgsSnap.val()) : [];
          const lastSeen = seen[id] || 0;
          const count = msgs.filter(
            (m) => (m.createdAt || 0) > lastSeen && m.from !== currentUser.uid
          ).length;
          unreadMap[id] = count;
        })
      );
      setThreadUnread(unreadMap);
      setThreadNames(names);
    };

    compute();
  }, [threads, users, currentUser]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    const msgRef = ref(db, `messages/${selectedThreadId}`);
    const unsubscribe = onValue(msgRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(list);
    });
    return () => unsubscribe();
  }, [selectedThreadId]);

  const contacts = useMemo(() => {
    if (!currentUser || !currentRole) return [];
    const allowed = roleTargets[currentRole] || [];
    const q = contactSearch.trim().toLowerCase();
    return users
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => allowed.includes((u.role || "").toLowerCase()))
      .filter((u) => {
        if (!q) return true;
        return (
          String(u.email || "").toLowerCase().includes(q) ||
          String(u.firstName || "").toLowerCase().includes(q) ||
          String(u.lastInitial || "").toLowerCase().includes(q)
        );
      });
  }, [users, currentUser, currentRole, contactSearch]);

  const hasContactResults = showContacts && (contactOpen || contactSearch.trim()) && contacts.length > 0;

  const openThreadWith = async (other) => {
    if (!currentUser || !other) return;
    const id = threadIdFor(currentUser.uid, other.uid);
    const threadRef = ref(db, `threads/${id}`);
    const existing = await get(threadRef);
    if (!existing.exists()) {
      await set(threadRef, {
        userA: currentUser.uid,
        userB: other.uid,
        roleA: currentRole,
        roleB: other.role,
        updatedAt: Date.now(),
      });
      await set(ref(db, `threadIndex/${currentUser.uid}/${id}`), true);
      await set(ref(db, `threadIndex/${other.uid}/${id}`), true);
    }
    setSelectedThreadId(id);
    markThreadRead(id);
  };

  const sendMessage = async () => {
    if (!selectedThreadId) return addToast("error", "Select a conversation");
    if (!messageText.trim()) return;
    const msgRef = push(ref(db, `messages/${selectedThreadId}`));
    await set(msgRef, {
      from: currentUser.uid,
      text: messageText.trim(),
      createdAt: Date.now(),
    });
    await set(ref(db, `threads/${selectedThreadId}/updatedAt`), Date.now());
    await set(ref(db, `threads/${selectedThreadId}/lastMessage`), messageText.trim());
    setMessageText("");
  };

  const markThreadRead = (id) => {
    if (!currentUser || !id) return;
    const seenKey = `thread_seen_${currentUser.uid}`;
    let seen = {};
    try {
      seen = JSON.parse(localStorage.getItem(seenKey) || "{}");
    } catch {
      seen = {};
    }
    seen[id] = Date.now();
    localStorage.setItem(seenKey, JSON.stringify(seen));
    setThreadUnread((prev) => ({ ...prev, [id]: 0 }));
  };

  const threadList = useMemo(() => {
    return Object.entries(threads)
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [threads]);

  const totalUnread = useMemo(
    () => Object.values(threadUnread).reduce((sum, n) => sum + (n || 0), 0),
    [threadUnread]
  );

  useEffect(() => {
    if (isOpen) {
      setPanelVisible(true);
      const t = setTimeout(() => setPanelActive(true), 10);
      return () => clearTimeout(t);
    }
    setPanelActive(false);
    const t = setTimeout(() => setPanelVisible(false), 180);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!panelVisible) return;
    const handleClick = (event) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target)) return;
      setIsOpen(false);
      setShowContacts(false);
    };
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      setShowContacts(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [panelVisible]);

  useEffect(() => {
    if (!panelVisible) return;
    const updateCaret = () => {
      if (!panelBoxRef.current || !buttonRef.current) return;
      const panelRect = panelBoxRef.current.getBoundingClientRect();
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const center = buttonRect.left + buttonRect.width / 2;
      const rawLeft = center - panelRect.left;
      const clamped = Math.max(18, Math.min(panelRect.width - 18, rawLeft));
      setCaretLeft(clamped);
    };
    updateCaret();
    window.addEventListener("resize", updateCaret);
    return () => window.removeEventListener("resize", updateCaret);
  }, [panelVisible]);

  return (
    <div className="section">
      <div style={{ position: "relative", display: "inline-block" }} ref={panelRef}>
        <button
          className="btn btn-secondary"
          ref={buttonRef}
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (isOpen) setShowContacts(false);
          }}
        >
          Messages
          {totalUnread > 0 && (
            <span
              style={{
                marginLeft: 8,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                background: "#d14343",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                padding: "0 4px",
              }}
            >
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>

        {panelVisible && (
          <div
            ref={panelBoxRef}
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: "min(880px, 92vw)",
              background: "var(--msg-panel-surface)",
              color: "var(--text)",
              border: "1px solid var(--msg-panel-border)",
              borderRadius: 12,
              boxShadow: "var(--msg-panel-shadow)",
              padding: 16,
              zIndex: 50,
              opacity: panelActive ? 1 : 0,
              transform: panelActive ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
              transition: "opacity 160ms ease, transform 160ms ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -6,
                left: caretLeft,
                width: 12,
                height: 12,
                background: "var(--msg-panel-caret)",
                borderLeft: "1px solid var(--msg-panel-border)",
                borderTop: "1px solid var(--msg-panel-border)",
                transform: "translateX(-50%) rotate(45deg)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Messages</h3>
              <button
                className="btn btn-ghost"
                onClick={() => setShowContacts((prev) => !prev)}
              >
                {showContacts ? "Hide contacts" : "Add new contact"}
              </button>
            </div>

            <div className="form-row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                <div className="small" style={{ marginBottom: 6 }}>Conversations</div>
                <div style={{ marginBottom: 8, maxHeight: 180, overflow: "auto" }}>
                  {threadList.length === 0 ? (
                    <div className="small">No conversations yet.</div>
                  ) : (
                    threadList.map((t) => (
                      <button
                        key={t.id}
                        className="btn btn-ghost"
                        style={{ width: "100%", textAlign: "left", marginBottom: 6 }}
                        onClick={() => {
                          setSelectedThreadId(t.id);
                          markThreadRead(t.id);
                        }}
                      >
                        <div>
                          <strong>{threadNames[t.id] || "Conversation"}</strong>
                        </div>
                        <div className="small">
                          {t.lastMessage ? t.lastMessage.slice(0, 60) : "No messages yet"}
                        </div>
                        {threadUnread[t.id] > 0 && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              color: "#b43333",
                              marginTop: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#d14343",
                                display: "inline-block",
                              }}
                            />
                            {threadUnread[t.id]} unread
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {showContacts && (
                  <>
                    <div className="autocomplete">
                      <input
                        className="input"
                        type="text"
                        placeholder="Search contacts..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        onFocus={() => setContactOpen(true)}
                        onBlur={() => setTimeout(() => setContactOpen(false), 120)}
                      />
                      {hasContactResults && (
                        <div className="autocomplete-menu" style={{ marginTop: 6 }}>
                          {contacts.map((u) => (
                            <button
                              key={u.uid}
                              type="button"
                              className="autocomplete-item"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                openThreadWith(u);
                                setContactSearch("");
                                setContactOpen(false);
                              }}
                            >
                              <span className="autocomplete-primary">
                                {u.firstName || "User"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                              </span>
                              <span className="autocomplete-secondary">{u.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {showContacts && contactSearch.trim() && contacts.length === 0 && (
                        <div className="small" style={{ marginTop: 6 }}>No contacts found.</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div style={{ flex: "2 1 420px", minWidth: 260 }}>
                {selectedThreadId ? (
                  <>
                    <div
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 8,
                        padding: 10,
                        maxHeight: 260,
                        overflow: "auto",
                        background: "var(--msg-panel-inner)",
                      }}
                    >
                      {messages.length === 0 ? (
                        <div className="small">No messages yet.</div>
                      ) : (
                        messages.map((m) => (
                          <div key={m.id} className="small" style={{ marginBottom: 6 }}>
                            <strong>{m.from === currentUser.uid ? "You" : "Them"}:</strong> {m.text}
                            <span style={{ marginLeft: 8, color: "#777" }}>
                              {formatRelativeTime(m.createdAt)}
                            </span>
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
                        onChange={(e) => setMessageText(e.target.value)}
                      />
                      <button className="btn btn-primary" onClick={sendMessage}>Send</button>
                    </div>
                  </>
                ) : (
                  <div className="small">Select a contact to start messaging.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
