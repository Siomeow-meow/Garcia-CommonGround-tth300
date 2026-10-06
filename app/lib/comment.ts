import { apiRequest, type ApiComment } from "./api";

export async function getComments(_token?: unknown) {
  return apiRequest<ApiComment[]>("comments.list");
}

export async function getComment(id: string, _token?: unknown) {
  return apiRequest<ApiComment>("comments.get", { query: { id } });
}

export async function postComment(
  request: { content: string; commenterId: string; postId: number; parentId?: number | null },
  _token?: unknown,
) {
  return apiRequest<ApiComment>("comments.create", { body: request });
}

export async function getPostComments(id: string, _token?: unknown) {
  return apiRequest<ApiComment[]>("comments.list", { query: { postId: id } });
}

export async function deleteComment(id: number, _token?: unknown) {
  return apiRequest<{ success: boolean }>("comments.delete", { query: { id }, method: "DELETE" });
}

export async function likeComment(
  request: { type: "LIKE" | "UNLIKE" },
  _token: unknown,
  id: number,
) {
  return apiRequest<{ success: boolean; likesCount: number }>("comments.like", {
    query: { id },
    body: request,
  });
}

export async function patchComment(request: { content: string }, id: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("comments.update", {
    query: { id },
    body: request,
    method: "PATCH",
  });
}