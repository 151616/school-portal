import { useState, useEffect } from "react";
import { ref, onValue, query, orderByChild, limitToLast } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "@/firebase";
import { addToast } from "@/shared/toastService";
import Combobox from "@/shared/components/Combobox";
import ConfirmModal from "@/shared/components/ConfirmModal";
import { formatAuditTime } from "@/shared/utils/dateUtils";
import { parseCSV, downloadCSV } from "@/shared/utils/csvUtils";
import { logAudit } from "@/shared/utils/auditUtils";
import { CopyIcon, DeleteIcon, PlusIcon, LinkIcon } from "@/shared/icons";

// ---- shared types for this module ----

interface UserRecord {
  uid: string;
  email?: string;
  role?: string;
  studentId?: string;
  firstName?: string;
  lastInitial?: string;
  schoolId?: string;
  [key: string]: unknown;
}

interface InviteRecord {
  id: string;
  email?: string;
  role?: string;
  studentId?: string;
  used?: boolean;
  [key: string]: unknown;
}

interface AuditLogEntry {
  id: string;
  action?: string;
  createdAt?: number;
  actorUid?: string;
  actorEmail?: string;
  targetEmail?: string;
  classId?: string;
  studentUid?: string;
  targetUid?: string;
  inviteId?: string;
  [key: string]: unknown;
}

export interface AdminUsersProps {
  users: UserRecord[];
  invites: InviteRecord[];
  classes: Array<{ id: string; [key: string]: unknown }>;
  mySchoolId: string | null;
}

// ---- helpers ----

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---- component ----

export default function AdminUsers({ users, invites, classes: _classes, mySchoolId }: AdminUsersProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSection, setUserSection] = useState("students");
  const [userLimits, setUserLimits] = useState({ students: 50, teachers: 50, admins: 50 });
  const [userSort, setUserSort] = useState("email");
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [userSearchActive, setUserSearchActive] = useState(-1);
  const [inviteSchoolId, setInviteSchoolId] = useState("");
  const [confirm, setConfirm] = useState<{ open: boolean; uid: string | null; email: string }>({
    open: false,
    uid: null,
    email: "",
  });
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Persist sort/limits across reloads
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin_user_limits");
      if (saved) setUserLimits(JSON.parse(saved));
      const savedUserSort = localStorage.getItem("admin_user_sort");
      if (savedUserSort) setUserSort(savedUserSort);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin_user_limits", JSON.stringify(userLimits));
      localStorage.setItem("admin_user_sort", userSort);
    } catch {
      // ignore storage errors
    }
  }, [userLimits, userSort]);

  // Audit logs listener
  useEffect(() => {
    const logsRef = query(ref(db, "auditLogs"), orderByChild("createdAt"), limitToLast(50));
    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list: AuditLogEntry[] = Object.entries(data)
        .map(([id, entry]): AuditLogEntry => ({ id, ...(entry as Omit<AuditLogEntry, "id">) }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAuditLogs(list);
    });
    return () => unsubscribe();
  }, []);

  // ---- derived data ----

  const schoolScopedUsers = mySchoolId ? users.filter((u) => u.schoolId === mySchoolId) : users;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = (value: unknown) =>
    !normalizedQuery || String(value || "").toLowerCase().includes(normalizedQuery);

  const filteredUsers = schoolScopedUsers.filter(
    (u) =>
      matchesQuery(u.email) ||
      matchesQuery(u.role) ||
      matchesQuery(u.studentId) ||
      matchesQuery(u.uid)
  );

  const filteredInvites = invites.filter(
    (i) =>
      matchesQuery(i.email) ||
      matchesQuery(i.role) ||
      matchesQuery(i.studentId) ||
      matchesQuery(i.id)
  );

  const sortUsers = (list: UserRecord[]) => {
    const sorted = [...list];
    if (userSort === "name") {
      sorted.sort((a, b) => {
        const an = `${a.firstName || ""} ${a.lastInitial || ""}`.trim().toLowerCase();
        const bn = `${b.firstName || ""} ${b.lastInitial || ""}`.trim().toLowerCase();
        return an.localeCompare(bn) || String(a.email || "").localeCompare(String(b.email || ""));
      });
    } else if (userSort === "studentId") {
      sorted.sort((a, b) => String(a.studentId || "").localeCompare(String(b.studentId || "")));
    } else {
      sorted.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    }
    return sorted;
  };

  const userStudents = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "student"));
  const userTeachers = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "teacher"));
  const userAdmins = sortUsers(filteredUsers.filter((u) => (u.role || "").toLowerCase() === "admin"));
  const visibleStudents = userStudents.slice(0, userLimits.students);
  const visibleTeachers = userTeachers.slice(0, userLimits.teachers);
  const visibleAdmins = userAdmins.slice(0, userLimits.admins);

  const userSuggestions =
    userSection === "students"
      ? userStudents
      : userSection === "teachers"
      ? userTeachers
      : userAdmins;

  const inviteStudents = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "student");
  const inviteTeachers = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "teacher");
  const inviteAdmins = filteredInvites.filter((i) => !i.used && (i.role || "").toLowerCase() === "admin");

  // ---- handlers ----

  const callCreateInvite = async (payload: Record<string, unknown>) => {
    const createInvite = httpsCallable(functions, "createInvite");
    const result = await createInvite(payload);
    return result.data as Record<string, unknown>;
  };

  const handleAddUser = async () => {
    if (!email) {
      addToast("error", "Enter email!");
      return;
    }
    if (!isValidEmail(email)) {
      addToast("error", "Invalid email format");
      return;
    }
    if (!auth.currentUser) {
      addToast("error", "Not logged in!");
      return;
    }

    try {
      const token = await auth.currentUser.getIdTokenResult();
      if (!token.claims || !token.claims.admin) {
        addToast("error", "You need admin privileges to create invites.");
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Error checking admin claim:", err);
      addToast("error", "Unable to verify admin privileges");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const emailLower = email.toLowerCase();
      const inviteResult = await callCreateInvite({
        email: emailLower,
        role,
        ...(mySchoolId ? { schoolId: mySchoolId } : inviteSchoolId ? { schoolId: inviteSchoolId } : {}),
      });

      await logAudit("invite_created", {
        inviteId: inviteResult.inviteId,
        targetEmail: inviteResult.email,
        role: inviteResult.role,
        studentId: inviteResult.studentId,
      });

      const idSuffix = inviteResult.studentId ? ` Student ID: ${inviteResult.studentId}` : "";
      addToast("success", `Invite created for ${inviteResult.email}!${idSuffix}`);
      setEmail("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error creating invite:", error);
      addToast("error", "Error creating invite: " + message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportInvitesCSV = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        addToast("error", "CSV has no rows");
        return;
      }
      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const emailLower = String(row.email || "").toLowerCase();
        const roleValue = String(row.role || "").toLowerCase() || "student";
        if (!emailLower) {
          skipped += 1;
          continue;
        }
        try {
          await callCreateInvite({
            email: emailLower,
            role: roleValue,
            studentId: row.studentId || "",
            firstName: row.firstName || "",
            lastInitial: row.lastInitial || "",
            ...(mySchoolId ? { schoolId: mySchoolId } : inviteSchoolId ? { schoolId: inviteSchoolId } : {}),
          });
          created += 1;
        } catch (err: unknown) {
          const code = String((err as { code?: string })?.code || "").replace("functions/", "");
          if (
            code === "already-exists" ||
            code === "invalid-argument" ||
            code === "failed-precondition"
          ) {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }

      addToast("success", `Imported invites: ${created}, skipped: ${skipped}`);
    } catch (err) {
      console.error("Import invites error:", err);
      addToast("error", "Failed to import invites");
    }
  };

  const handleExportUsersCSV = () => {
    const list =
      userSection === "students"
        ? userStudents
        : userSection === "teachers"
        ? userTeachers
        : userAdmins;
    const rows: string[][] = [
      ["uid", "email", "role", "studentId", "firstName", "lastInitial"],
      ...list.map((u) => [
        u.uid || "",
        u.email || "",
        u.role || "",
        u.studentId || "",
        u.firstName || "",
        u.lastInitial || "",
      ]),
    ];
    downloadCSV(`${userSection}-users.csv`, rows);
    addToast("success", "User export ready");
  };

  const openDeleteConfirm = (uid: string, email: string) =>
    setConfirm({ open: true, uid, email });
  const closeConfirm = () => setConfirm({ open: false, uid: null, email: "" });

  const performDeleteUser = async (uid: string | null) => {
    if (!uid) return;
    closeConfirm();
    setDeleting(uid);
    try {
      const deleteUser = httpsCallable(functions, "deleteUserByAdmin");
      await deleteUser({ uid });
      await logAudit("user_deleted", { targetUid: uid });
      addToast("success", "User deleted from Auth and DB!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error deleting user:", error);
      addToast("error", "Error deleting user: " + message);
    } finally {
      setDeleting(null);
    }
  };

  // ---- render ----

  return (
    <>
      <div className="section">
        <div className="form-row">
          <button
            className={`tab-btn ${userSection === "students" ? "active" : ""}`}
            onClick={() => {
              setUserSection("students");
              setRole("student");
            }}
          >
            Students
          </button>
          <button
            className={`tab-btn ${userSection === "teachers" ? "active" : ""}`}
            onClick={() => {
              setUserSection("teachers");
              setRole("teacher");
            }}
          >
            Teachers
          </button>
          <button
            className={`tab-btn ${userSection === "admins" ? "active" : ""}`}
            onClick={() => {
              setUserSection("admins");
              setRole("admin");
            }}
          >
            Admins
          </button>
        </div>
      </div>

      {/* Add Invite */}
      <div className="section">
        <div className="instructions">
          Tip: Enter an email and choose a role. Student IDs are generated automatically and
          checked for uniqueness.
        </div>

        <div className="form-row">
          <input
            className="input"
            type="email"
            placeholder="User Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleAddUser();
            }}
            autoComplete="off"
          />
          {!mySchoolId && (
            <input
              className="input"
              type="text"
              placeholder="School ID (optional)"
              value={inviteSchoolId}
              onChange={(e) => setInviteSchoolId(e.target.value)}
              autoComplete="off"
            />
          )}
          <button
            className="btn btn-primary"
            onClick={(e) => {
              const btn = e.currentTarget;
              btn.classList.add("pulse");
              setTimeout(() => btn.classList.remove("pulse"), 260);
              handleAddUser();
            }}
            disabled={loading}
          >
            {loading ? (
              "Creating..."
            ) : (
              <>
                <PlusIcon className="icon" /> Create Invite
              </>
            )}
          </button>
        </div>
      </div>

      <div className="section">
        <h3>Bulk Import (Invites)</h3>
        <div className="small">
          CSV columns: email, role, studentId (optional), firstName (optional), lastInitial
          (optional).
        </div>
        <div className="form-row" style={{ marginTop: 8 }}>
          <label className="small" htmlFor="bulk-invite-csv-upload">
            Upload CSV file
          </label>
          <input
            id="bulk-invite-csv-upload"
            className="input"
            type="file"
            accept=".csv"
            onChange={(e) => handleImportInvitesCSV((e.target as HTMLInputElement).files?.[0])}
          />
        </div>
      </div>

      {/* Search */}
      <div className="section">
        <div className="instructions">
          Search users and pending invites by email, role, student ID, or UID.
        </div>
        <div className="form-row">
          <div className="autocomplete">
            <input
              className="input"
              type="text"
              placeholder="Search users or invites..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowUserSuggestions(true);
                setUserSearchActive(-1);
              }}
              onFocus={() => setShowUserSuggestions(true)}
              onBlur={() => setTimeout(() => setShowUserSuggestions(false), 120)}
              onKeyDown={(e) => {
                if (!showUserSuggestions || userSuggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setUserSearchActive((i) => (i < userSuggestions.length - 1 ? i + 1 : 0));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setUserSearchActive((i) => (i > 0 ? i - 1 : userSuggestions.length - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const idx = userSearchActive;
                  const u = idx >= 0 ? userSuggestions[idx] : userSuggestions[0];
                  if (u) {
                    setSearchQuery(u.email || "");
                    setShowUserSuggestions(false);
                  }
                }
              }}
            />
            {showUserSuggestions && userSuggestions.length > 0 && (
              <div className="autocomplete-menu" role="listbox">
                {userSuggestions.map((u, idx) => (
                  <button
                    key={u.uid}
                    type="button"
                    className={`autocomplete-item${userSearchActive === idx ? " active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearchQuery(u.email || "");
                      setShowUserSuggestions(false);
                    }}
                  >
                    <span className="autocomplete-primary">
                      {u.firstName || "User"} {u.lastInitial ? `${u.lastInitial}.` : ""}
                    </span>
                    <span className="autocomplete-secondary">
                      {u.email}
                      {u.studentId ? ` - ${u.studentId}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 6 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setSearchQuery("")}
            disabled={!searchQuery}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Existing Users */}
      <div className="section">
        <h3>Existing Users</h3>
        <div className="small">You can remove users here. Deleting is permanent.</div>
        <div className="form-row" style={{ marginTop: 8 }}>
          <Combobox
            options={[
              { value: "email", label: "Sort by Email" },
              { value: "name", label: "Sort by Name" },
              { value: "studentId", label: "Sort by Student ID" },
            ]}
            value={userSort}
            onChange={(v) => setUserSort(v)}
          />
          <button className="btn btn-ghost" onClick={handleExportUsersCSV}>
            Export {userSection}
          </button>
        </div>

        {userSection === "students" && (
          <>
            <ul className="card-list">
              {visibleStudents.map((u) => (
                <li key={u.uid}>
                  <div>
                    <div>{u.email}</div>
                    <div className="meta">
                      student{u.studentId ? ` - ID: ${u.studentId}` : ""}
                    </div>
                  </div>
                  <div>
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        const b = e.currentTarget;
                        b.classList.add("pulse");
                        setTimeout(() => b.classList.remove("pulse"), 260);
                        openDeleteConfirm(u.uid, u.email || "");
                      }}
                      disabled={deleting === u.uid}
                    >
                      <DeleteIcon className="icon" />{" "}
                      {deleting === u.uid ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
              {userStudents.length === 0 && (
                <li className="small">No students match this filter.</li>
              )}
            </ul>
            {userStudents.length > visibleStudents.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, students: prev.students + 50 }))
                }
              >
                Show more ({visibleStudents.length}/{userStudents.length})
              </button>
            )}
            {userStudents.length > visibleStudents.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, students: userStudents.length }))
                }
              >
                Show all
              </button>
            )}
          </>
        )}

        {userSection === "teachers" && (
          <>
            <ul className="card-list">
              {visibleTeachers.map((u) => (
                <li key={u.uid}>
                  <div>
                    <div>{u.email}</div>
                    <div className="meta">teacher</div>
                  </div>
                  <div>
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        const b = e.currentTarget;
                        b.classList.add("pulse");
                        setTimeout(() => b.classList.remove("pulse"), 260);
                        openDeleteConfirm(u.uid, u.email || "");
                      }}
                      disabled={deleting === u.uid}
                    >
                      <DeleteIcon className="icon" />{" "}
                      {deleting === u.uid ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
              {userTeachers.length === 0 && (
                <li className="small">No teachers match this filter.</li>
              )}
            </ul>
            {userTeachers.length > visibleTeachers.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, teachers: prev.teachers + 50 }))
                }
              >
                Show more ({visibleTeachers.length}/{userTeachers.length})
              </button>
            )}
            {userTeachers.length > visibleTeachers.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, teachers: userTeachers.length }))
                }
              >
                Show all
              </button>
            )}
          </>
        )}

        {userSection === "admins" && (
          <>
            <ul className="card-list">
              {visibleAdmins.map((u) => (
                <li key={u.uid}>
                  <div>
                    <div>{u.email}</div>
                    <div className="meta">admin</div>
                  </div>
                  <div>
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        const b = e.currentTarget;
                        b.classList.add("pulse");
                        setTimeout(() => b.classList.remove("pulse"), 260);
                        openDeleteConfirm(u.uid, u.email || "");
                      }}
                      disabled={deleting === u.uid}
                    >
                      <DeleteIcon className="icon" />{" "}
                      {deleting === u.uid ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
              {userAdmins.length === 0 && (
                <li className="small">No admins match this filter.</li>
              )}
            </ul>
            {userAdmins.length > visibleAdmins.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, admins: prev.admins + 50 }))
                }
              >
                Show more ({visibleAdmins.length}/{userAdmins.length})
              </button>
            )}
            {userAdmins.length > visibleAdmins.length && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setUserLimits((prev) => ({ ...prev, admins: userAdmins.length }))
                }
              >
                Show all
              </button>
            )}
          </>
        )}
      </div>

      {/* Pending Invites */}
      <div className="section">
        <h3>Pending Invites</h3>
        <div className="small">Active invites can be copied and shared with students.</div>
        <ul className="card-list">
          {(userSection === "students"
            ? inviteStudents
            : userSection === "teachers"
            ? inviteTeachers
            : inviteAdmins
          ).map((i) => {
            const signupUrl = `${window.location.origin}/signup?inviteId=${i.id}`;
            return (
              <li key={i.id}>
                <div>
                  <div>{i.email}</div>
                  <div className="meta">
                    {i.role} | Student ID: {i.studentId}
                  </div>
                </div>

                <div>
                  <a href={signupUrl} target="_blank" rel="noreferrer" className="small">
                    <LinkIcon className="icon" /> Signup Link
                  </a>
                  <button
                    className="btn btn-ghost"
                    style={{ marginLeft: 10 }}
                    onClick={async (e) => {
                      const icon = e.currentTarget.querySelector(".icon");
                      if (icon) {
                        icon.classList.add("pulse");
                        setTimeout(() => icon.classList.remove("pulse"), 260);
                      }
                      try {
                        await navigator.clipboard.writeText(signupUrl);
                        addToast("success", "Signup link copied");
                      } catch {
                        addToast("error", "Copy failed");
                      }
                    }}
                  >
                    <CopyIcon className="icon" /> Copy Link
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ marginLeft: 10 }}
                    onClick={async (e) => {
                      const icon = e.currentTarget.querySelector(".icon");
                      if (icon) {
                        icon.classList.add("pulse");
                        setTimeout(() => icon.classList.remove("pulse"), 260);
                      }
                      try {
                        await navigator.clipboard.writeText(i.studentId || "");
                        addToast("success", "Student ID copied");
                      } catch {
                        addToast("error", "Copy failed");
                      }
                    }}
                  >
                    <CopyIcon className="icon" /> Copy ID
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Audit Log */}
      <div className="section">
        <h3>Audit Log</h3>
        <div className="small">Recent admin actions and system changes.</div>
        <ul className="card-list" style={{ marginTop: 8 }}>
          {auditLogs.length === 0 ? (
            <li className="small">No audit events yet.</li>
          ) : (
            auditLogs.map((log) => {
              const parts: string[] = [];
              if (log.targetEmail) parts.push(log.targetEmail);
              if (log.classId) parts.push(`class ${log.classId}`);
              if (log.studentUid) parts.push(`student ${log.studentUid}`);
              if (log.targetUid) parts.push(`user ${log.targetUid}`);
              if (log.inviteId) parts.push(`invite ${log.inviteId}`);
              const detailText = parts.join(" | ");
              return (
                <li key={log.id}>
                  <div>
                    <div>{log.action || "action"}</div>
                    <div className="meta">
                      {formatAuditTime(log.createdAt)} |{" "}
                      {log.actorEmail || log.actorUid || "system"}
                      {detailText ? ` | ${detailText}` : ""}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <ConfirmModal
        open={confirm.open}
        title={`Delete ${confirm.email}?`}
        description={`Are you sure you want to permanently delete this user (${confirm.email})? This action cannot be undone.`}
        onCancel={closeConfirm}
        onConfirm={() => performDeleteUser(confirm.uid)}
      />
    </>
  );
}
