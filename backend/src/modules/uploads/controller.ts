import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import * as programsRepo from "../programs/repository.js";
import { createUploadSignature, IMAGE_UPLOAD_FORMATS, VIDEO_UPLOAD_FORMATS } from "./service.js";

export async function programUploadSignatureHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  // `?kind=image` or `?kind=video` narrows what Cloudinary accepts (item photos and videos on an order page).
  const { kind } = request.query as { kind?: string };
  const formats = kind === "video" ? VIDEO_UPLOAD_FORMATS : kind === "image" ? IMAGE_UPLOAD_FORMATS : undefined;
  const signature = createUploadSignature(`programs/${programId}${kind === "video" ? "/videos" : ""}`, formats);
  return sendSuccess(reply, signature);
}

export async function publicUploadSignatureHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.query as { slug?: string };
  // Only for a program that exists and is taking registrations, and only a plain slug is used in the
  // folder name (no slashes or dots), so nobody can mint upload signatures for arbitrary folders.
  if (!slug || !/^[a-z0-9-]{1,200}$/.test(slug)) throw AppError.validation("Unknown program");
  const program = await programsRepo.findProgramBySlug(slug);
  if (!program || program.status !== "published") throw AppError.notFound("Program not found");
  const signature = createUploadSignature(`registrations/${slug}`);
  return sendSuccess(reply, signature);
}
