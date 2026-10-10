import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  /** The only file types Cloudinary will accept with this signature. */
  allowedFormats: string;
}

// Pictures and the usual documents. Anything else (scripts, web pages, SVG, executables) is refused by
// Cloudinary itself, because the list is part of what the signature covers.
export const ALLOWED_UPLOAD_FORMATS = "jpg,jpeg,png,webp,gif,heic,pdf,doc,docx";

// Voice notes: what phones and browsers record in.
export const VOICE_UPLOAD_FORMATS = "webm,weba,ogg,oga,opus,mp3,m4a,mp4,aac,wav";

/**
 * Generates parameters for a signed, direct-to-Cloudinary upload from the browser.
 * The API server never proxies the file bytes -- the client uploads straight to
 * Cloudinary using this signature, then reports back the resulting secure_url.
 */
export function createUploadSignature(subfolder: string, formats: string = ALLOWED_UPLOAD_FORMATS): UploadSignature {
  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${subfolder}`;
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: formats },
    env.CLOUDINARY_API_SECRET,
  );

  return {
    allowedFormats: formats,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
  };
}
