import { apiRequest, type ApiPost } from "./api";

export async function getSavedPosts() {
  return apiRequest<ApiPost[]>("saved.list");
}

export async function getSavedPostStatus(postId: number) {
  return apiRequest<{ isSaved: boolean }>("saved.status", { query: { postId } });
}

export async function setSavedPost(postId: number, isSaved: boolean) {
  return apiRequest<{ success: boolean; isSaved: boolean }>("saved.set", {
    body: { postId, isSaved },
  });
}