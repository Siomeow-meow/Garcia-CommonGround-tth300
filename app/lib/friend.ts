import { apiRequest, type ApiFriend } from "./api";

export async function getFriends(_token?: unknown) {
  return apiRequest<ApiFriend[]>("friends.list");
}

export async function getFriend(id: string, _token?: unknown) {
  const friends = await getFriends();
  const friend = friends.find((item) => String(item.id) === String(id));
  if (!friend) throw new Error("Friend not found");
  return friend;
}

export async function getUsersFriends(_token?: unknown) {
  return getFriends();
}

export async function getUserFriendRequests(_token?: unknown) {
  return apiRequest<ApiFriend[]>("friends.requests");
}

export async function getSentFriendRequests(_token?: unknown) {
  return apiRequest<ApiFriend[]>("friends.sent");
}

export async function sendFriendRequest(request: { receiverId: string; status: "PENDING" }, _token?: unknown) {
  return apiRequest<ApiFriend>("friends.send", { body: request });
}

export async function acceptFriendRequest(
  _request: { receiverId: string; status: "ACCEPTED" },
  id: number,
  _token?: unknown,
) {
  return apiRequest<{ success: boolean }>("friends.accept", { query: { id }, body: {}, method: "PATCH" });
}

export async function deleteFriend(id: number, _token?: unknown) {
  return apiRequest<{ success: boolean }>("friends.delete", { query: { id }, method: "DELETE" });
}