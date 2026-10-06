import { apiRequest, type ApiGroup } from "./api";

export type PatchGroupRequest = {
  groupName?: string;
  description?: string;
  groupImg?: string;
  bannerImg?: string;
  groupThemes?: string[];
  allowAnonymity?: boolean;
};

export async function getGroups(_token?: unknown) {
  return apiRequest<ApiGroup[]>("groups.list");
}

export async function getGroup(id: string, _token?: unknown) {
  return apiRequest<ApiGroup>("groups.get", { query: { id } });
}

export async function getUserMemberships(_id: string, _token?: unknown) {
  return apiRequest<ApiGroup[]>("groups.mine");
}

export async function createGroup(
  request: { groupName: string; description: string; groupImg: string; bannerImg: string },
  _token?: unknown,
) {
  return apiRequest<ApiGroup>("groups.create", { body: request });
}

export async function patchGroup(request: PatchGroupRequest, id: number, _token?: unknown) {
  return apiRequest<ApiGroup>("groups.update", { query: { id }, body: request, method: "PATCH" });
}

export async function followGroup(_request: { role: string }, _token: unknown, id: number) {
  return apiRequest<{ success: boolean; isFollowed: boolean }>("groups.toggleMember", {
    query: { id },
    body: {},
  });
}

export async function getGroupPosts(id: string, _token?: unknown) {
  return apiRequest<any[]>("posts.list", { query: { groupId: id } });
}

export async function deleteGroup(id: number, _token?: unknown) {
  return apiRequest<{ success: boolean }>("groups.delete", { query: { id }, method: "DELETE" });
}

export async function getGroupMembers(id: string, _token?: unknown) {
  return apiRequest<any[]>("groups.members", { query: { id } });
}

export async function kickMember(groupId: number, memberId: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("groups.removeMember", {
    query: { id: groupId, userId: memberId },
    method: "DELETE",
  });
}

export async function updateMemberRole(groupId: number, memberId: string, role: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("groups.role", {
    query: { id: groupId, userId: memberId },
    body: { role },
    method: "PATCH",
  });
}

export async function inviteMember(groupId: number, userId: string, _token?: unknown) {
  return apiRequest<{ success: boolean }>("groups.invite", {
    query: { id: groupId },
    body: { userId },
  });
}