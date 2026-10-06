import { uploadFile } from "@/app/lib/api";

type UploadImageProps = {
  file: File;
  bucket?: string;
  path?: string;
};

type DeleteImageProps = {
  path: string;
  bucket?: string;
};

export const uploadImage = async ({ file }: UploadImageProps) => uploadFile(file);

export const deleteImage = async (_props: DeleteImageProps) => null;