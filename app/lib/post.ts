import { apiRequest, type ApiPost } from "./api";

export async function getPosts(_token?: unknown) {
  return apiRequest<ApiPost[]>("posts.list");
}

export async function getPost(id: string, _token?: unknown) {
  return apiRequest<ApiPost>("posts.get", { query: { id } });
}

export async function getPostsByAuthor(id: string, _token?: unknown) {
  return apiRequest<ApiPost[]>("posts.list", { query: { authorId: id } });
}

export async function postPost(
  request: {
    title: string;
    content: string;
    tags: string[];
    images: string[];
    status: string;
    authorId: string;
    groupId?: number;
    parentId?: number;
    isAnonymous?: boolean;
  },
  _token?: unknown,
) {
  return apiRequest<ApiPost>("posts.create", { body: request });
}

export async function deletePost(id: number, _token?: unknown) {
  return apiRequest<{ success: boolean }>("posts.delete", { query: { id }, method: "DELETE" });
}

export async function patchPost(
  request: {
    title?: string;
    content?: string;
    tags?: string[];
    images?: string[];
    status?: string;
    authorId: string;
    isAnonymous?: boolean;
  },
  id: number,
  _token?: unknown,
) {
  return apiRequest<ApiPost>("posts.update", { query: { id }, body: request, method: "PATCH" });
}

export async function likePost(request: { type: string }, _token: unknown, id: number) {
  return apiRequest<ApiPost>("posts.like", { query: { id }, body: request });
}