"use client";
import { useState, useEffect, useRef } from "react";
import Post from "@/app/types/post";
import Comment from "@/app/types/comment";
import Avatar from "./Avatar";
import MentionText from "./MentionText";
import { likePost } from "@/app/lib/post";
import { getPostComments, postComment, patchComment, deleteComment, likeComment } from "@/app/lib/comment";
import { loadGroupDirectory, getGroupName } from "@/app/lib/groupDirectory";
import { getGroupMembers } from "@/app/lib/group";
import { getUsersFriends } from "@/app/lib/friend";
import { mapMembersToMentionUsers, mapFriendsToMentionUsers, MentionUser } from "@/app/lib/mentionDirectory";
import MentionTextarea from "./MentionTextarea";
import { useAuth } from "@clerk/nextjs";
import { getUser } from "../lib/user";
import User from "../types/user";
import { getDisplayIdentity } from "@/app/lib/anonymity";
import { getSavedPostStatus, setSavedPost } from "@/app/lib/saved";

function timeAgo(date: Date | string) {

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Comment tree helpers — comments can nest replies arbitrarily deep, so
// counting/editing/inserting all need to walk the whole tree, not just the
// top level. ──────────────────────────────────────────────────────────────
function countAllComments(list: Comment[] | undefined | null): number {
  if (!list || list.length === 0) return 0;
  return list.reduce(
    (sum, c) => sum + 1 + countAllComments(c.replies),
    0,
  );
}

function insertReplyInTree(
  list: Comment[],
  parentId: number,
  reply: Comment,
): Comment[] {
  return list.map((c) => {
    if (c.id === parentId) {
      return { ...c, replies: [reply, ...(c.replies || [])] };
    }
    return { ...c, replies: insertReplyInTree(c.replies || [], parentId, reply) };
  });
}

// Finds the comment with the given id anywhere in the tree and replaces it
// with the result of `updater`. Returning null from `updater` deletes it.
function updateCommentInTree(
  list: Comment[],
  id: number,
  updater: (c: Comment) => Comment | null,
): Comment[] {
  return list
    .map((c) => {
      if (c.id === id) return updater(c);
      return { ...c, replies: updateCommentInTree(c.replies || [], id, updater) };
    })
    .filter((c): c is Comment => c !== null);
}

// ── Share modal ───────────────────────────────────────────────────────────────
function ShareModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/post/${post.id}`
      : "";
  const [copied, setCopied] = useState(false);
  const options = [
    {
      label2: copied ? "Copied!" : "Copy link",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
          />
        </svg>
      ),
      action: () => {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      },
      highlight: copied,
    },
    {
      label2: "Share to Facebook",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#1877F2">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.793-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971h-1.513c-1.491 0-1.956.93-1.956 1.887v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
        </svg>
      ),
      action: () =>
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          "_blank",
        ),
      highlight: false,
    },
    {
      label2: "Share to X",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      action: () =>
        window.open(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`,
          "_blank",
        ),
      highlight: false,
    },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)" }}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
            Share post
          </h3>
          <button onClick={onClose} style={{ color: "var(--fg-muted)" }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs truncate"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          <span className="flex-1 truncate">{url}</span>
        </div>
        {options.map((opt) => (
          <button
            key={opt.label2}
            onClick={opt.action}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors w-full text-left"
            style={{
              background: opt.highlight
                ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                : "var(--bg-subtle)",
              color: opt.highlight ? "var(--primary)" : "var(--fg)",
              border: "1px solid var(--border)",
            }}
          >
            {opt.icon}
            {opt.label2}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Small inline icons for comment actions ────────────────────────────────────
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
      />
    </svg>
  );
}
function ReplyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17 4 12m0 0 5-5m-5 5h11a4 4 0 0 1 4 4v1"
      />
    </svg>
  );
}
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-3.5 h-3.5 transition-transform"
      style={{ transform: expanded ? "rotate(180deg)" : "none" }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487a2.06 2.06 0 1 1 2.914 2.914L7.5 19.674 3 21l1.326-4.5L16.862 4.487Z"
      />
    </svg>
  );
}
function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.166L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.11 48.11 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

// ── Single Comment ────────────────────────────────────────────────────────────
function CommentItem({
  c,
  user,
  currentUserId,
  onReply,
  replyingTo,
  replyText,
  setReplyText,
  onSubmitReply,
  replySubmitting,
  setReplyingTo,
  replies,
  onEdit,
  onDelete,
  mentionUsers,
}: {
  c: Comment;
  user?: User;
  currentUserId?: string | null;
  onReply: (id: number) => void;
  replyingTo: number | null;
  replyText: string;
  setReplyText: (v: string) => void;
  onSubmitReply: (id: number) => void;
  replySubmitting: boolean;
  setReplyingTo: (v: number | null) => void;
  replies: Comment[];
  onEdit: (id: number, content: string) => void;
  onDelete: (id: number) => void;
  mentionUsers: MentionUser[];
}) {
  const { getToken } = useAuth();
  const [liked, setLiked] = useState(c.isLiked ?? false);
  const [count, setCount] = useState(c.likesCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(c.content);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwnComment = !!currentUserId && c.commenterId === currentUserId;

  useEffect(() => {
    if (!showMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setShowMenu(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === c.content) {
      setIsEditing(false);
      setEditText(c.content);
      return;
    }
    onEdit(c.id, trimmed);
    setIsEditing(false);
  }

  // Persist the like to the server — previously this only flipped local
  // state, so a heart on a comment/reply reset itself the next time the
  // comment tree was reloaded from the API instead of sticking.
  async function toggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    const next = !liked;
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    try {
      const token = await getToken();
      await likeComment({ type: next ? "LIKE" : "UNLIKE" }, token, c.id);
    } catch {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div className="flex gap-2.5 items-start pt-2">
      <a href={`/user/${c.commenterId}`}>
        <Avatar
          userName={c.commenter.userName}
          profileImg={c.commenter.profileImg}
          size="sm"
        />
      </a>
      <div className="flex-1 min-w-0">
        {/* Bubble */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditText(c.content);
                }
              }}
              className="flex-1 px-3 py-1.5 text-sm rounded-2xl focus:outline-none"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
            <button
              onClick={saveEdit}
              className="text-[11px] font-semibold"
              style={{ color: "var(--primary)" }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditText(c.content);
              }}
              className="text-[11px] font-semibold"
              style={{ color: "var(--fg-muted)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-1">
            <div
              className="inline-block max-w-full px-3 py-2 rounded-2xl rounded-tl-sm text-sm"
              style={{ background: "var(--bg-subtle)" }}
            >
              <a
                href={`/user/${c.commenterId}`}
                className="font-semibold text-xs hover:underline mr-1.5"
                style={{ color: "var(--fg)" }}
              >
                {c.commenter.userName}
              </a>
              <span style={{ color: "var(--fg)" }}>
                <MentionText text={c.content} />
              </span>
            </div>
            {/* Own comment — single kebab menu instead of separate pencil +
                trash icons cluttering the row below. */}
            {isOwnComment && (
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  onClick={() => setShowMenu((v) => !v)}
                  className="p-1 rounded-lg mt-0.5"
                  style={{ color: "var(--fg-muted)" }}
                  aria-label="Comment options"
                >
                  <KebabIcon />
                </button>
                {showMenu && (
                  <div
                    className="absolute left-0 top-full z-20 min-w-[110px] rounded-xl overflow-hidden shadow-lg"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setIsEditing(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                      style={{ color: "var(--fg)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-subtle)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <PencilIcon />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(c.id);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                      style={{ color: "#ef4444" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "color-mix(in srgb, #ef4444 10%, transparent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Meta row — icon-based actions */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-1 pl-1">
            <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
              {timeAgo(c.createdAt)}
            </span>
            {/* Like */}
            <button
              onClick={toggleLike}
              disabled={likeBusy}
              className="flex items-center gap-1 transition-colors disabled:opacity-60"
              style={{ color: liked ? "#ef4444" : "var(--fg-muted)" }}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <HeartIcon filled={liked} />
              {count > 0 && (
                <span className="text-[11px] font-medium">{count}</span>
              )}
            </button>
            {/* Reply */}
            <button
              onClick={() => onReply(c.id)}
              className="flex items-center gap-1 transition-colors"
              style={{
                color: replyingTo === c.id ? "var(--primary)" : "var(--fg-muted)",
              }}
              aria-label="Reply"
            >
              <ReplyIcon />
            </button>
            {/* Show/hide replies */}
            {replies.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1"
                style={{ color: "var(--fg-muted)" }}
                aria-label={expanded ? "Hide replies" : "Show replies"}
              >
                <ChevronIcon expanded={expanded} />
                <span className="text-[11px] font-medium">
                  {replies.length}
                </span>
              </button>
            )}
          </div>
        )}
        {/* Reply box */}
        {replyingTo === c.id && (
          <div className="flex gap-2 items-center mt-2">
            {user && (
              <Avatar
                userName={user.userName}
                profileImg={user.profileImg}
                size="sm"
              />
            )}
            <div
              className="flex-1 relative"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setReplyingTo(null);
                  setReplyText("");
                }
              }}
            >
              <MentionTextarea
                value={replyText}
                onChange={setReplyText}
                onSubmitKey={() => onSubmitReply(c.id)}
                multiline={false}
                scopedUsers={mentionUsers}
                placeholder={`Reply to @${c.commenter.userName}…`}
                className="w-full pl-3 pr-10 py-1.5 text-xs rounded-full focus:outline-none"
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
              <button
                onClick={() => onSubmitReply(c.id)}
                disabled={!replyText.trim() || replySubmitting}
                className="absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-40"
                style={{ color: "var(--primary)" }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {expanded &&
          replies &&
          replies.map((reply: Comment, i) => {
            return (
              <CommentItem
                key={reply.id ?? i}
                c={reply}
                user={user}
                currentUserId={currentUserId}
                onReply={(id) => setReplyingTo(replyingTo === id ? null : id)}
                replyingTo={replyingTo}
                replyText={replyText}
                setReplyText={setReplyText}
                onSubmitReply={onSubmitReply}
                replySubmitting={replySubmitting}
                setReplyingTo={setReplyingTo}
                replies={reply.replies || []}
                onEdit={onEdit}
                onDelete={onDelete}
                mentionUsers={mentionUsers}
              />
            );
          })}
      </div>
    </div>
  );
}

// ── Comment section ───────────────────────────────────────────────────────────
function CommentSection({
  post,
  onCommentCountChange,
}: {
  post: Post;
  onCommentCountChange: (n: number) => void;
}) {
  const { getToken, userId } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<User>();
  // @mentions in comments are scoped to the post's group members plus the
  // commenter's own friends — not the whole platform, and not just people
  // already visible in the thread.
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const token = await getToken();
        const [data, userRes] = await Promise.all([
          getPostComments(String(post.id), token),
          getUser(userId),
        ]);
        setUser(userRes ?? undefined);
        const arr = Array.isArray(data) ? data : [];
        setComments(arr);
      } catch (e: any) {
        if (!e?.message?.includes("not found")) console.error(e);
        setComments([]);
      } finally {
        setLoading(false);
      }
    })();
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    // @mentions in comments should reach the post's group members AND the
    // commenter's own friends — not just group members, and not the whole
    // platform.
    let cancelled = false;
    (async () => {
      const token = await getToken().catch(() => null);
      const [rawMembers, rawFriends] = await Promise.all([
        post.groupId ? getGroupMembers(String(post.groupId), token) : Promise.resolve([]),
        getUsersFriends(token).catch(() => []),
      ]);
      if (cancelled) return;
      const merged = new Map<string, MentionUser>();
      [...mapMembersToMentionUsers(rawMembers), ...mapFriendsToMentionUsers(rawFriends)].forEach(
        (u) => merged.set(u.id, u),
      );
      setMentionUsers([...merged.values()]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.groupId]);

  // Keep the parent's comment-count badge in sync with the local comment
  // tree through its own effect, instead of calling onCommentCountChange
  // (which updates PostCard's state) from inside a setComments() updater.
  // Doing it inside the updater runs it during CommentSection's render and
  // triggers React's "Cannot update a component while rendering a different
  // component" warning/error.
  useEffect(() => {
    onCommentCountChange(countAllComments(comments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments]);

  async function submitComment(content: string, _parentId?: number) {
    if (!content.trim() || !userId || !user) return;
    const isReply = !!_parentId;
    if (isReply) setReplySubmitting(true);
    else setSubmitting(true);

    const optimistic: Comment = {
      id: Date.now(),
      postId: post.id,
      commenterId: userId,
      commenter: { userName: user.userName, profileImg: user.profileImg },
      content: content.trim(),
      createdAt: new Date().toISOString(),
      likesCount: 0,
      parentId: _parentId ?? null,
      replies: [],
      isLiked: false,
    };
    // Replies nest under their parent so the count and "N replies" toggle
    // both reflect the real tree instead of a flat list.
    setComments((prev) =>
      isReply
        ? insertReplyInTree(prev, _parentId!, optimistic)
        : [optimistic, ...prev],
    );
    if (!isReply) setText("");
    else {
      setReplyText("");
      setReplyingTo(null);
    }

    try {
      const token = await getToken();
      const request: {
        content: string;
        commenterId: string;
        postId: number;
        parentId?: number;
      } = {
        content: optimistic.content,
        commenterId: userId,
        postId: post.id,
      };
      if (_parentId != null) request.parentId = _parentId;
      const created = await postComment(request, token);
      setComments((prev) =>
        updateCommentInTree(prev, optimistic.id, () => ({
          ...created,
          replies: created?.replies || [],
        })),
      );
    } catch {
      setComments((prev) => updateCommentInTree(prev, optimistic.id, () => null));
      if (!isReply) setText(optimistic.content);
      else setReplyText(optimistic.content);
    } finally {
      if (isReply) setReplySubmitting(false);
      else setSubmitting(false);
    }
  }

  async function handleEditComment(id: number, newContent: string) {
    const prevComments = comments;
    setComments((prev) =>
      updateCommentInTree(prev, id, (c) => ({ ...c, content: newContent })),
    );
    try {
      const token = await getToken();
      await patchComment({ content: newContent }, String(id), token);
    } catch (e) {
      console.error(e);
      setComments(prevComments);
    }
  }

  async function handleDeleteComment(id: number) {
    const prevComments = comments;
    setComments((prev) => updateCommentInTree(prev, id, () => null));
    try {
      const token = await getToken();
      await deleteComment(id, token);
    } catch (e) {
      console.error(e);
      setComments(prevComments);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Composer — inline Twitter style */}
      <div className="flex gap-2.5 items-center">
        {user ? (
          <Avatar
            userName={user.userName}
            profileImg={user.profileImg}
            size="sm"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full shrink-0"
            style={{ background: "var(--bg-subtle)" }}
          />
        )}
        <div className="flex-1 relative">
          <MentionTextarea
            value={text}
            onChange={setText}
            onSubmitKey={() => submitComment(text)}
            multiline={false}
            scopedUsers={mentionUsers}
            placeholder="Write a comment… use @ to mention"
            className="w-full pl-4 pr-10 py-2 text-sm rounded-full focus:outline-none transition-colors"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
          {text.trim() && (
            <button
              onClick={() => submitComment(text)}
              disabled={submitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 disabled:opacity-40 transition-opacity"
              style={{ color: "var(--primary)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-2 pl-9">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-8 rounded-2xl animate-pulse"
              style={{ background: "var(--bg-subtle)" }}
            />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs pl-9" style={{ color: "var(--fg-muted)" }}>
          No comments yet — be the first!
        </p>
      ) : (
        <div className="flex flex-col gap-3 pl-9">
          {comments
            .filter((c) => c?.commenter)
            .map((c) => (
              <div key={c.id} className="flex flex-col gap-2">
                <CommentItem
                  c={c}
                  user={user}
                  currentUserId={userId}
                  onReply={(id) => setReplyingTo(replyingTo === id ? null : id)}
                  replyingTo={replyingTo}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  onSubmitReply={(id) => submitComment(replyText, id)}
                  replySubmitting={replySubmitting}
                  setReplyingTo={setReplyingTo}
                  replies={c.replies || []}
                  onEdit={handleEditComment}
                  onDelete={handleDeleteComment}
                  mentionUsers={mentionUsers}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Image grid — layout adapts per image count so a partial set (e.g. 3 of a
// 4-slot grid) never leaves an awkward empty cell ───────────────────────────
function ImageGrid({
  images,
  onImageClick,
}: {
  images: string[];
  onImageClick: (i: number) => void;
}) {
  const count = images.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <div className="rounded-xl overflow-hidden">
        <img
          src={images[0]}
          alt=""
          onClick={() => onImageClick(0)}
          className="w-full max-h-[520px] object-cover cursor-pointer"
        />
      </div>
    );
  }

  if (count === 2) {
    // Weighted split instead of a plain 50/50 grid — one image leads, the
    // other trails, so it reads as a pair rather than two grid cells.
    return (
      <div
        className="grid gap-1 rounded-xl overflow-hidden h-72"
        style={{ gridTemplateColumns: "3fr 2fr" }}
      >
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            onClick={() => onImageClick(i)}
            className="w-full h-full object-cover cursor-pointer"
          />
        ))}
      </div>
    );
  }

  if (count === 3) {
    // One large image on the left, two stacked on the right, weighted
    // wider on the left so it doesn't read as three equal grid cells.
    return (
      <div
        className="grid grid-rows-2 gap-1 rounded-xl overflow-hidden h-80"
        style={{ gridTemplateColumns: "3fr 2fr" }}
      >
        <img
          src={images[0]}
          alt=""
          onClick={() => onImageClick(0)}
          className="row-span-2 w-full h-full object-cover cursor-pointer"
        />
        <img
          src={images[1]}
          alt=""
          onClick={() => onImageClick(1)}
          className="w-full h-full object-cover cursor-pointer"
        />
        <img
          src={images[2]}
          alt=""
          onClick={() => onImageClick(2)}
          className="w-full h-full object-cover cursor-pointer"
        />
      </div>
    );
  }

  // 4 or more — one hero image leads, the rest form a filmstrip below it so
  // extra photos never get cropped into identical little squares. Anything
  // beyond the 4th gets a "+N" overlay on the last visible tile.
  const displayed = images.slice(1, 4);
  const remaining = count - 4;
  return (
    <div className="flex flex-col gap-1 rounded-xl overflow-hidden">
      <img
        src={images[0]}
        alt=""
        onClick={() => onImageClick(0)}
        className="w-full h-56 object-cover cursor-pointer"
      />
      <div className="grid grid-cols-3 gap-1 h-24">
        {displayed.map((src, i) => {
          const actualIndex = i + 1;
          const showOverlay = i === 2 && remaining > 0;
          return (
            <div key={actualIndex} className="relative w-full h-full">
              <img
                src={src}
                alt=""
                onClick={() => onImageClick(actualIndex)}
                className="w-full h-full object-cover cursor-pointer"
              />
              {showOverlay && (
                <div
                  onClick={() => onImageClick(actualIndex)}
                  className="absolute inset-0 flex items-center justify-center text-lg font-semibold cursor-pointer"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                >
                  +{remaining}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Image lightbox — enlarged image + carousel with likes/comments below,
// Reddit-style (image pane + a details/comments pane alongside it) ─────────
function ImageLightbox({
  post,
  images,
  initialIndex,
  onClose,
  liked,
  likeCount,
  likeLoading,
  onLike,
  commentCount,
  onCommentCountChange,
}: {
  post: Post;
  images: string[];
  initialIndex: number;
  onClose: () => void;
  liked: boolean;
  likeCount: number;
  likeLoading: boolean;
  onLike: () => void;
  commentCount: number;
  onCommentCountChange: (n: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const identity = getDisplayIdentity(post as any);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")
        setIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.9)" }} />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
        aria-label="Close"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-5 h-5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col md:flex-row rounded-2xl overflow-hidden"
        style={{ background: "var(--bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image pane */}
        <div
          className="relative flex items-center justify-center flex-shrink-0 md:flex-1"
          style={{ background: "#000", minHeight: "42vh" }}
        >
          <img
            src={images[index]}
            alt=""
            className="max-w-full max-h-[42vh] md:max-h-[92vh] object-contain"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={() =>
                  setIndex((i) => (i - 1 + images.length) % images.length)
                }
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-lg"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-lg"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                aria-label="Next image"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: i === index ? "#fff" : "rgba(255,255,255,0.4)",
                    }}
                  />
                ))}
              </div>
              <div
                className="absolute top-3 left-3 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
              >
                {index + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {/* Details + comments pane */}
        <div
          className="flex flex-col w-full md:w-[380px] flex-shrink-0 overflow-y-auto"
          style={{ borderLeft: "1px solid var(--border)", maxHeight: "92vh" }}
        >
          <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <Avatar
                userName={identity.userName}
                profileImg={identity.profileImg}
                size="sm"
              />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                  {identity.userName}
                </p>
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {timeAgo(post.createdAt)}
                </p>
              </div>
            </div>
            <h3 className="text-sm font-semibold mt-3" style={{ color: "var(--fg)" }}>
              {post.title}
            </h3>
            {post.content && (
              <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
                <MentionText text={post.content} />
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={onLike}
                disabled={likeLoading}
                className="flex items-center gap-1.5 text-sm disabled:opacity-60"
                style={{ color: liked ? "#ef4444" : "var(--fg-muted)" }}
                aria-label={liked ? "Unlike" : "Like"}
              >
                <HeartIcon filled={liked} />
                {likeCount > 0 && (
                  <span className="text-xs font-medium">{likeCount}</span>
                )}
              </button>
              <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                {commentCount > 0 ? `${commentCount} comments` : "No comments yet"}
              </span>
            </div>
          </div>
          <div className="p-4 flex-1">
            <CommentSection post={post} onCommentCountChange={onCommentCountChange} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────
export default function PostCard({
  post,
  onDelete,
  onEdit,
  showOwnerActions,
}: {
  post: Post;
  onDelete?: (id: number) => void;
  onEdit?: (post: Post) => void;
  showOwnerActions?: boolean;
}) {
  const { getToken, userId } = useAuth();
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentsCount ?? 0);
  const [showShare, setShowShare] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDotMenu, setShowDotMenu] = useState(false);
  const dotMenuRef = useRef<HTMLDivElement>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isOwner = userId && (post as any).authorId === userId;
  const canShowActions = showOwnerActions && isOwner;
  const identity = getDisplayIdentity(post as any);

  useEffect(() => {
    if (!post.groupId) return;
    let cancelled = false;
    (async () => {
      const token = await getToken().catch(() => null);
      const map = await loadGroupDirectory(token);
      let name = map.get(post.groupId as number) ?? null;
      // Not in the bulk directory (private group, newly created, etc) —
      // try a direct lookup before giving up and showing the raw id.
      if (!name) name = await getGroupName(post.groupId as number, token);
      if (!cancelled) setGroupName(name);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.groupId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getSavedPostStatus(post.id)
      .then(({ isSaved }) => {
        if (!cancelled) setSaved(isSaved);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [userId, post.id]);

  // Comment count previously only became accurate once the user opened the
  // comment panel (it relied on post.commentsCount, which the feed API
  // doesn't reliably populate, and didn't include nested replies). Fetch
  // the real total up front so the badge is correct immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const data = await getPostComments(String(post.id), token);
        const arr = Array.isArray(data) ? data : [];
        if (!cancelled) setCommentCount(countAllComments(arr));
      } catch {
        // keep whatever count we already have
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  useEffect(() => {
    if (!showDotMenu) return;
    function handler(e: MouseEvent) {
      if (dotMenuRef.current && !dotMenuRef.current.contains(e.target as Node))
        setShowDotMenu(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDotMenu]);

  async function handleLike() {
    if (likeLoading) return;
    setLikeLoading(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const token = await getToken();
      await likePost({ type: next ? "LIKE" : "UNLIKE" }, token, post.id);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleSave() {
    if (!userId) return;
    const next = !saved;
    setSaved(next);
    try {
      await setSavedPost(post.id, next);
    } catch (error) {
      setSaved(!next);
      console.error(error);
    }
  }

  // Action button style
  function actionBtn(active: boolean, activeColor: string) {
    return {
      color: active ? activeColor : "var(--fg-muted)",
    } as React.CSSProperties;
  }

  return (
    <>
      {showShare && (
        <ShareModal post={post} onClose={() => setShowShare(false)} />
      )}

      {lightboxIndex !== null && post.images?.length > 0 && (
        <ImageLightbox
          post={post}
          images={post.images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          liked={liked}
          likeCount={likeCount}
          likeLoading={likeLoading}
          onLike={handleLike}
          commentCount={commentCount}
          onCommentCountChange={setCommentCount}
        />
      )}

      <article
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          {identity.isAnonymous ? (
            <Avatar userName={identity.userName} profileImg={identity.profileImg} />
          ) : (
            <a href={`/user/${(post as any).authorId}`}>
              <Avatar
                userName={identity.userName}
                profileImg={identity.profileImg}
              />
            </a>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {identity.isAnonymous ? (
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  {identity.userName}
                </span>
              ) : (
                <a
                  href={`/user/${(post as any).authorId}`}
                  className="text-sm font-semibold hover:underline"
                  style={{ color: "var(--fg)" }}
                >
                  {identity.userName}
                </a>
              )}
              {post.groupId && (
                <>
                  <span
                    className="text-xs"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    in
                  </span>
                  <a
                    href={`/groups/${post.groupId}`}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "var(--primary)" }}
                  >
                    {groupName ?? `group #${post.groupId}`}
                  </a>
                </>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {timeAgo(post.createdAt)}
            </span>
          </div>
          {/* 3-dot owner menu */}
          {canShowActions && (
            <div className="relative" ref={dotMenuRef}>
              <button
                onClick={() => setShowDotMenu((v) => !v)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--fg-muted)" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {showDotMenu && (
                <div
                  className="absolute right-0 top-8 z-20 min-w-[130px] rounded-xl overflow-hidden shadow-lg"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {onEdit && (
                    <button
                      onClick={() => {
                        setShowDotMenu(false);
                        onEdit(post);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left"
                      style={{ color: "var(--fg)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-subtle)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 4.487 18.55 2.8a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                        />
                      </svg>
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        setShowDotMenu(false);
                        onDelete(post.id);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left"
                      style={{ color: "#ef4444" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "color-mix(in srgb, #ef4444 10%, transparent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-0.5 rounded-full"
                style={{
                  background:
                    "color-mix(in srgb, var(--primary) 12%, transparent)",
                  color: "var(--primary)",
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div>
          <h2
            className="text-base font-semibold leading-snug"
            style={{ color: "var(--fg)" }}
          >
            {post.title}
          </h2>
          {post.content && (
            <p
              className="text-sm leading-relaxed mt-1 line-clamp-4"
              style={{ color: "var(--fg-muted)" }}
            >
              <MentionText text={post.content} />
            </p>
          )}
        </div>

        {/* Images */}
        {post.images?.length > 0 && (
          <ImageGrid
            images={post.images}
            onImageClick={(i) => setLightboxIndex(i)}
          />
        )}

        {/* ── Action bar — Twitter style ── */}
        <div
          className="flex items-center gap-0 pt-0.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {/* Like */}
          <button
            onClick={handleLike}
            disabled={likeLoading}
            className="group flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors disabled:opacity-60"
            style={actionBtn(liked, "#ef4444")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = liked
                ? "color-mix(in srgb, #ef4444 10%, transparent)"
                : "color-mix(in srgb, var(--fg-muted) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-[18px] h-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
            {likeCount > 0 && (
              <span className="text-xs font-medium">{likeCount}</span>
            )}
          </button>

          {/* Comment */}
          <button
            onClick={() => setShowComments((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors"
            style={actionBtn(showComments, "var(--primary)")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = showComments
                ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                : "color-mix(in srgb, var(--fg-muted) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill={showComments ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-[18px] h-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
              />
            </svg>
            {/* Always show count if >0, else nothing — no "Comment" label */}
            {commentCount > 0 && (
              <span className="text-xs font-medium">{commentCount}</span>
            )}
          </button>

          {/* Share */}
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--fg-muted) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-[18px] h-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
              />
            </svg>
          </button>

          {/* Save — pushed to the right */}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors ml-auto"
            style={actionBtn(saved, "var(--primary)")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = saved
                ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                : "color-mix(in srgb, var(--fg-muted) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            aria-label={saved ? "Unsave" : "Save"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={saved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-[18px] h-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
              />
            </svg>
          </button>
        </div>

        {/* Comments panel */}
        {showComments && (
          <div
            className="pt-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <CommentSection
              post={post}
              onCommentCountChange={setCommentCount}
            />
          </div>
        )}
      </article>
    </>
  );
}
