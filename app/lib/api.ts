type QueryValue = string | number | boolean | null | undefined;

export type ApiUser = {
  id: string;
  email: string;
  userName: string;
  profileImg: string;
  banner: string;
  fName: string;
  lName: string;
  bio: string;
};

export type ApiPost = {
  id: number;
  userId: string;
  authorId: string;
  author: { userName: string; profileImg: string };
  title: string;
  subject: string;
  content: string;
  images: string[];
  tags: string[];
  isAnonymous: boolean;
  createdAt: string;
  groupId: number | null;
  status: "published" | "draft" | "archived";
  likesCount: number;
  isLiked: boolean;
  commentsCount: number;
};

export type ApiComment = {
  id: number;
  postId: number;
  commenterId: string;
  commenter: { userName: string; profileImg: string };
  content: string;
  createdAt: string;
  likesCount: number;
  isLiked: boolean;
  parentId: number | null;
  replies: ApiComment[];
};

export type ApiFriend = {
  id: number;
  friendId: number;
  createdAt: string;
  status: "PENDING" | "ACCEPTED";
  isSender: boolean;
  senderId: string;
  receiverId: string;
  otherUser: { id: string; userName: string; profileImg: string };
};

export type ApiGroup = {
  id: number;
  groupName: string;
  description: string;
  groupImg: string;
  bannerImg: string;
  groupThemes: string[];
  allowAnonymity: boolean;
  populationCount: number;
  isFollowed: boolean;
  isAdmin: boolean;
  posts: { id: number };
  groupMembers: { id: string; userName: string; profileImg: string }[];
};

export type ApiMessage = {
  id: number;
  conversation: number;
  conversationId: number;
  senderId: string;
  sender: { userName: string; profileImg: string };
  content: string;
  createdAt: string;
  replies: ApiMessage[];
};

export type ApiConversation = {
  id: number;
  isGroup: boolean;
  participants: {
    participantId: string;
    participant: { id: string; userName: string; profileImg: string };
  }[];
  messages: ApiMessage[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost/commonground/api.php";

export async function apiRequest<T>(
  action: string,
  options: {
    query?: Record<string, QueryValue>;
    body?: unknown;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
  } = {},
): Promise<T> {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    credentials: "include",
    cache: "no-store",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Backend request failed (${response.status})`);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<string> {
  const url = new URL(API_URL);
  url.searchParams.set("action", "media.upload");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;
  if (!response.ok || !data?.url) {
    throw new Error(data?.error ?? `Image upload failed (${response.status})`);
  }
  return data.url;
}