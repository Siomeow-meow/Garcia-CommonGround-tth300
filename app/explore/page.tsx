"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import PageShell from "@/app/components/PageShell";
import Avatar from "@/app/components/Avatar";
import { getUsers } from "@/app/lib/user";
import {
  sendFriendRequest,
  getUsersFriends,
  getUserFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  deleteFriend,
} from "@/app/lib/friend";
import { getGroups, getUserMemberships, followGroup } from "@/app/lib/group";
import Link from "next/link";
import User from "@/app/types/user";
import Friend from "@/app/types/friend";
import Group from "@/app/types/group";

type Tab = "people" | "groups";

export default function ExplorePage() {
  const { getToken, userId } = useAuth();
  const [tab, setTab] = useState<Tab>("groups");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingSent, setPendingSent] = useState<Map<string, number>>(
    new Map(),
  );
  const [incomingRequests, setIncomingRequests] = useState<Map<string, Friend>>(
    new Map(),
  );

  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<number | undefined>>(
    new Set(),
  );
  const [joiningId, setJoiningId] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const token = await getToken();
        const [u, f, fr, fs, g, m] = await Promise.allSettled([
          getUsers(token),
          getUsersFriends(token).catch(() => []),
          getUserFriendRequests(token).catch(() => []),
          getSentFriendRequests(token).catch(() => []),
          getGroups(token),
          getUserMemberships(userId, token).catch(() => []),
        ]);

        let newFriendIds = new Set<string>();
        let newPendingSent = new Map<string, number>();

        if (u.status === "fulfilled") {
          const all = Array.isArray(u.value) ? u.value : [];
          setUsers(all.filter((u: User) => u.id !== userId));
        }

        if (f.status === "fulfilled") {
          newFriendIds = new Set<string>(
            (Array.isArray(f.value) ? f.value : [])
              .map((fr: Friend) => fr.otherUser?.id)
              .filter(Boolean),
          );
          setFriendIds(newFriendIds);
        }

        if (fr.status === "fulfilled") {
          const incoming = new Map<string, Friend>();
          (Array.isArray(fr.value) ? fr.value : []).forEach((req: Friend) => {
            if (req.otherUser?.id) incoming.set(req.otherUser.id, req);
          });
          setIncomingRequests(incoming);
        }

        if (fs.status === "fulfilled") {
          newPendingSent = new Map(
            (Array.isArray(fs.value) ? fs.value : [])
              .map((request: Friend) => [request.otherUser?.id, request.id] as const)
              .filter(([id]) => Boolean(id)),
          );
        }

        // Anyone who is now an accepted friend shouldn't still read as
        // "Requested" (covers the case where the other person accepted
        // since we last checked).
        if (newFriendIds.size && newPendingSent.size) {
          for (const id of [...newPendingSent.keys()]) {
            if (newFriendIds.has(id)) newPendingSent.delete(id);
          }
        }
        setPendingSent(newPendingSent);

        if (g.status === "fulfilled")
          setAllGroups(Array.isArray(g.value) ? g.value : []);
        if (m.status === "fulfilled") {
          setJoinedIds(
            new Set(
              (Array.isArray(m.value) ? m.value : []).map((g: Group) => g.id),
            ),
          );
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, getToken]);

  async function handleAddFriend(user: User) {
    setPendingSent((prev) => {
      return new Map([...prev, [user.id, -1]]);
    });
    try {
      const token = await getToken();
      const result = await sendFriendRequest(
        { receiverId: user.id, status: "PENDING" },
        token,
      );
      const reqId = result?.id ?? result?.friendId ?? -1;
      setPendingSent((prev) => {
        return new Map([...prev, [user.id, reqId]]);
      });
    } catch (e) {
      console.error(e);
      setPendingSent((prev) => {
        const next = new Map(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function handleCancelRequest(user: User) {
    const reqId = pendingSent.get(user.id);
    // Optimistically remove — do NOT revert on cancel, user explicitly cancelled
    setPendingSent((prev) => {
      const next = new Map(prev);
      next.delete(user.id);
      return next;
    });
    if (reqId == null || reqId === -1) return;
    try {
      const token = await getToken();
      await deleteFriend(reqId, token);
    } catch (e) {
      console.error(e);
      // Only rollback on network error, not on user-initiated cancel
      setPendingSent((prev) => {
        return new Map([...prev, [user.id, reqId]]);
      });
    }
  }

  async function handleAccept(user: User) {
    const req = incomingRequests.get(user.id);
    if (!req || !userId) return;
    try {
      const token = await getToken();
      await acceptFriendRequest(
        { receiverId: userId, status: "ACCEPTED" },
        req.id,
        token,
      );
      setFriendIds((prev) => {
        return new Set([...prev, user.id]);
      });
      setIncomingRequests((prev) => {
        const next = new Map(prev);
        next.delete(user.id);
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDecline(user: User) {
    const req = incomingRequests.get(user.id);
    if (!req) return;
    try {
      const token = await getToken();
      await deleteFriend(req.id, token);
      setIncomingRequests((prev) => {
        const next = new Map(prev);
        next.delete(user.id);
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleJoinGroup(group: Group) {
    if (!group.id) return;
    setJoiningId(group.id);
    try {
      const token = await getToken();
      await followGroup({ role: "MEMBER" }, token, group.id);
      setJoinedIds((prev) => new Set([...prev, group.id]));
    } catch (e) {
      console.error(e);
    } finally {
      setJoiningId(null);
    }
  }

  const rawQ = search.trim();
  const q = rawQ.startsWith("@")
    ? rawQ.slice(1).toLowerCase()
    : rawQ.toLowerCase();

  const filteredUsers = users.filter(
    (u) =>
      !q ||
      u.userName.toLowerCase().includes(q) ||
      `${u.fName ?? ""} ${u.lName ?? ""}`.toLowerCase().includes(q),
  );
  const filteredGroups = allGroups.filter(
    (g) =>
      !q ||
      (g.groupName ?? "").toLowerCase().includes(q) ||
      g.description?.toLowerCase().includes(q) ||
      g.groupThemes?.some((t) => t.toLowerCase().includes(q)),
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "groups", label: "Groups" },
    { key: "people", label: "People" },
  ];

  return (
    <PageShell
      title="Explore"
      description="Find groups and people that match your interests"
    >
      {/* Search */}
      <div className="relative mb-5">
        <div
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--fg-muted)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            tab === "groups" ? "Search groups…" : "Search by @username or name…"
          }
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl focus:outline-none"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderColor: tab === t.key ? "var(--primary)" : "transparent",
              color: tab === t.key ? "var(--primary)" : "var(--fg-muted)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl animate-pulse"
              style={{ background: "var(--bg-subtle)" }}
            />
          ))}
        </div>
      ) : tab === "groups" ? (
        filteredGroups.length === 0 ? (
          <EmptyState
            message={q ? `No groups matching "${rawQ}"` : "No groups found."}
            sub="Try a different search or create your own group."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredGroups.map((group, idx) => (
              <GroupRow
                key={group.id ?? `g-${idx}`}
                group={group}
                isMember={joinedIds.has(group.id)}
                joining={joiningId === group.id}
                onJoin={() => handleJoinGroup(group)}
              />
            ))}
          </div>
        )
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          message={q ? `No people matching "${rawQ}"` : "No users found."}
          sub="Try searching by @username."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredUsers.map((user) => (
            <PersonRow
              key={user.id}
              user={user}
              isFriend={friendIds.has(user.id)}
              isPending={pendingSent.has(user.id)}
              hasIncoming={incomingRequests.has(user.id)}
              onAdd={() => handleAddFriend(user)}
              onCancel={() => handleCancelRequest(user)}
              onAccept={() => handleAccept(user)}
              onDecline={() => handleDecline(user)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ── Group card — entire card is a link, join button stops propagation ─────────
function GroupRow({
  group,
  isMember,
  joining,
  onJoin,
}: {
  group: Group;
  isMember: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="flex items-center gap-4 p-4 rounded-2xl transition-all group/card"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        display: "flex",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-strong)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")
      }
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
        style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}
      >
        {group.groupImg ? (
          <img
            src={group.groupImg}
            alt={group.groupName ?? ""}
            className="w-full h-full object-cover"
          />
        ) : (
          (group.groupName ?? "").slice(0, 2).toUpperCase() || "GR"
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--fg)" }}
          >
            {group.groupName ?? "Unnamed Group"}
          </span>
          {isMember && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: "var(--primary-subtle)",
                color: "var(--primary)",
              }}
            >
              Joined
            </span>
          )}
          {group.isAdmin && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                color: "var(--primary)",
              }}
            >
              Admin
            </span>
          )}
        </div>
        {group.description && (
          <p
            className="text-xs mt-0.5 line-clamp-1"
            style={{ color: "var(--fg-muted)" }}
          >
            {group.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
            {(group.populationCount ?? 0).toLocaleString()} members
          </span>
          {group.groupThemes?.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg-muted)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      {!isMember && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onJoin();
          }}
          disabled={joining}
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
        >
          {joining ? "…" : "Join"}
        </button>
      )}
    </Link>
  );
}

// ── Person row — "Requested" button is only a cancel, never reverts to "Add" ──
function PersonRow({
  user,
  isFriend,
  isPending,
  hasIncoming,
  onAdd,
  onCancel,
  onAccept,
  onDecline,
}: {
  user: User;
  isFriend: boolean;
  isPending: boolean;
  hasIncoming: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        background: hasIncoming ? "var(--primary-subtle)" : "var(--bg)",
        border: `1px solid ${hasIncoming ? "var(--primary)" : "var(--border)"}`,
      }}
    >
      <a href={`/user/${user.id}`}>
        <Avatar
          userName={user.userName}
          profileImg={user.profileImg}
          size="md"
        />
      </a>
      <div className="flex-1 min-w-0">
        <a href={`/user/${user.id}`} className="hover:underline">
          <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
            @{user.userName}
          </p>
        </a>
        {(user.fName || user.lName) && (
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {`${user.fName ?? ""} ${user.lName ?? ""}`.trim()}
          </p>
        )}
        {hasIncoming && (
          <p
            className="text-[10px] mt-0.5 font-medium"
            style={{ color: "var(--primary)" }}
          >
            Sent you a friend request
          </p>
        )}
      </div>

      {isFriend ? (
        <span
          className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--fg-muted)",
            border: "1px solid var(--border)",
          }}
        >
          Friends ✓
        </span>
      ) : hasIncoming ? (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onAccept}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            Decline
          </button>
        </div>
      ) : isPending ? (
        // "Requested" — same button sends the cancel action, but on hover it
        // relabels itself to "Cancel" (in red) so the action is obvious
        // before the click, instead of a separate button sitting there
        // permanently. Twitter/LinkedIn use this pattern for
        // Following → Unfollow.
        <button
          onClick={onCancel}
          className="group text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 w-[92px] transition-colors"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ef4444";
            e.currentTarget.style.borderColor = "#ef4444";
            e.currentTarget.style.background =
              "color-mix(in srgb, #ef4444 8%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--fg-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.background = "var(--bg-subtle)";
          }}
          title="Cancel friend request"
        >
          <span className="inline group-hover:hidden">Requested ✓</span>
          <span className="hidden group-hover:inline">Cancel</span>
        </button>
      ) : (
        <button
          onClick={onAdd}
          className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
          style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
        >
          Add
        </button>
      )}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
        {message}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
