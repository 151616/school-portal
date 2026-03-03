import React, { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, update } from "firebase/database";
import { db } from "./firebase";
import { BellIcon } from "./icons";

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

export default function NotificationsMenu({ currentUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!currentUser) return undefined;

    const notificationsRef = ref(db, `notifications/${currentUser.uid}`);
    const unsubscribe = onValue(
      notificationsRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.val() : {};
        const list = Object.entries(data)
          .map(([id, item]) => ({ id, ...item }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setNotifications(list);
      },
      (error) => {
        console.error("Notifications read error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClick = (event) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target)) return;
      setIsOpen(false);
    };

    const handleKey = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const markNotificationRead = async (notificationId) => {
    if (!currentUser || !notificationId) return;

    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
    );

    try {
      await update(ref(db, `notifications/${currentUser.uid}/${notificationId}`), {
        read: true,
      });
    } catch (error) {
      console.error("Notification read update error:", error);
    }
  };

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  if (!currentUser) return null;

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        className="header-menu-button icon-only"
        type="button"
        onClick={toggleMenu}
        aria-label="Notifications"
        title="Notifications"
      >
        <BellIcon className="icon" />
        {unreadCount > 0 && (
          <span className="header-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="header-popover notifications-popover">
          <div className="popover-title-row">
            <h3>Notifications</h3>
            <span className="small">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
          </div>

          {notifications.length === 0 ? (
            <div className="small">No notifications yet.</div>
          ) : (
            <div className="popover-list">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  className={`popover-list-item popover-list-item-button${
                    item.read ? "" : " is-unread"
                  }`}
                  type="button"
                  onClick={() => {
                    if (!item.read) {
                      markNotificationRead(item.id);
                    }
                  }}
                >
                  <div className="popover-item-title">{item.title}</div>
                  <div className="small">{item.body}</div>
                  <div className="small popover-item-time">{formatRelativeTime(item.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
