import { setUser } from "../store/user";
import { apiRequest, type ApiUser } from "./api";

export type PatchUserRequest = {
  fName?: string;
  lName?: string;
  bio?: string;
  profileImg?: string;
  bannerImg?: string;
  userName?: string;
};

export async function getUsers(_token?: string | null) {
  return apiRequest<ApiUser[]>("users.list");
}

export async function getUser(id: string, _token?: string | null) {
  return apiRequest<ApiUser | null>("users.get", { query: { id } });
}

export async function postUser(request: {
  id: string;
  email: string;
  fName: string | null;
  lName: string | null;
  profileImg: string | null;
  userName: string;
}) {
  return getUser(request.id);
}

export async function patchUser(
  request: PatchUserRequest,
  _id: string,
  dispatch: any,
  _token?: string | null,
) {
  const data = await apiRequest<ApiUser>("users.update", { body: request, method: "PATCH" });
  if (typeof dispatch === "function") dispatch(setUser(data));
  return data;
}