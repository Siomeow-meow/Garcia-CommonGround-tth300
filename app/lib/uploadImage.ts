import { uploadFile } from "./api";

export async function uploadImage(
  fileOrDataUrl: File | string,
  _bucket = "images",
  _folder = "uploads",
): Promise<string> {
  if (typeof fileOrDataUrl === "string") {
    if (!fileOrDataUrl.startsWith("data:")) return fileOrDataUrl;
    const response = await fetch(fileOrDataUrl);
    const blob = await response.blob();
    const extension = blob.type.split("/")[1] || "png";
    return uploadFile(new File([blob], `upload.${extension}`, { type: blob.type }));
  }
  return uploadFile(fileOrDataUrl);
}