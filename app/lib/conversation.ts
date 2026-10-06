import { apiRequest, type ApiConversation, type ApiMessage } from "./api";

export async function getConversations(_token?: unknown) {
  return apiRequest<ApiConversation[]>("conversations.list");
}

export async function getConversation(id: number, _token?: unknown) {
  return apiRequest<ApiConversation>("conversations.get", { query: { id } });
}

export async function getUserConversations(_id: string, _token?: unknown) {
  return getConversations();
}

export async function findOrCreateDirectConversation(_userA: string, userB: string) {
  return apiRequest<ApiConversation>("conversations.createDirect", { body: { userId: userB } });
}

export async function getDirectConversation(otherUserId: string, _token?: unknown) {
  return apiRequest<ApiConversation | null>("conversations.direct", { query: { userId: otherUserId } });
}

export async function createGroupConversation(request: { participants: string[] }, _token?: unknown) {
  return apiRequest<ApiConversation>("conversations.createGroup", { body: request });
}

export async function getMessages(id: number, _token?: unknown) {
  const conversation = await getConversation(id);
  return (conversation?.messages ?? []) as ApiMessage[];
}

export async function deleteMessage(_conversationId: number, messageId: number, _token?: unknown) {
  return apiRequest<{ success: boolean }>("messages.delete", {
    query: { id: messageId },
    method: "DELETE",
  });
}

export async function getGroupChatMembers(id: string, _token?: unknown) {
  const conversation = await getConversation(Number(id));
  return conversation?.participants ?? [];
}

export async function kickChatMember(conversationId: number, memberId: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("conversations.removeMember", {
    query: { id: conversationId, userId: memberId },
    method: "DELETE",
  });
}

export async function inviteChatMember(conversationId: number, userId: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("conversations.invite", {
    query: { id: conversationId },
    body: { userId },
  });
}