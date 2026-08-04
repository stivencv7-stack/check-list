import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";
import { destroyImages } from "@/lib/cloudinary";
import { parseImages } from "@/lib/task-json";

export const MAX_PROFILES = 6;

// Paleta de colores para los avatares (se asigna al crear el perfil).
const PALETTE = ["#4ade80", "#38bdf8", "#f59e0b", "#f472b6", "#a78bfa", "#2dd4bf"];

export type ProfileSummary = { id: string; name: string; color: string };

export async function getProfiles(): Promise<ProfileSummary[]> {
  return prisma.profile.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function createProfile(input: Record<string, unknown>): Promise<ProfileSummary[]> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new HttpError("El nombre del perfil es requerido.", 400);

  const count = await prisma.profile.count();
  if (count >= MAX_PROFILES) {
    throw new HttpError(`Máximo ${MAX_PROFILES} perfiles.`, 400);
  }

  const color = PALETTE[count % PALETTE.length];
  await prisma.profile.create({ data: { name, color } });
  return getProfiles();
}

export async function updateProfile(id: string, input: Record<string, unknown>): Promise<ProfileSummary[]> {
  const name = String(input.name ?? "").trim() || "Perfil sin nombre";
  try {
    await prisma.profile.update({ where: { id }, data: { name } });
  } catch {
    throw new HttpError("El perfil no existe.", 404);
  }
  return getProfiles();
}

export async function deleteProfile(id: string): Promise<ProfileSummary[]> {
  // Junta las imágenes de todas las tareas del perfil para limpiarlas en Cloudinary.
  const tasks = await prisma.task.findMany({
    where: { module: { profileId: id } },
    select: { images: true },
  });
  const publicIds = tasks.flatMap((t) => parseImages(t.images).map((im) => im.publicId));

  try {
    // onDelete: Cascade borra los módulos y tareas del perfil.
    await prisma.profile.delete({ where: { id } });
  } catch {
    throw new HttpError("El perfil no existe.", 404);
  }

  await destroyImages(publicIds);
  return getProfiles();
}
