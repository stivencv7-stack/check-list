import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";
import { destroyImages } from "@/lib/cloudinary";
import { parseImages, parseLinks } from "@/lib/task-json";
import type { ChecklistModule } from "@/lib/types";

// --- Helpers de scope -------------------------------------------------------
async function requireModuleProfile(moduleId: string): Promise<string> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { profileId: true },
  });
  if (!mod) throw new HttpError("El módulo no existe.", 404);
  return mod.profileId;
}

async function requireTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      name: true,
      done: true,
      description: true,
      images: true,
      links: true,
      moduleId: true,
      module: { select: { profileId: true } },
    },
  });
  if (!task) throw new HttpError("La tarea no existe.", 404);
  return task;
}

// --- Lectura ----------------------------------------------------------------
export async function getChecklist(profileId: string): Promise<ChecklistModule[]> {
  const modules = await prisma.module.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
    include: {
      tasks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          done: true,
          description: true,
          images: true,
          links: true,
        },
      },
    },
  });

  return modules.map((mod) => ({
    id: mod.id,
    name: mod.name,
    tasks: mod.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      done: task.done,
      description: task.description ?? null,
      images: parseImages(task.images),
      links: parseLinks(task.links),
    })),
  }));
}

// Índice de perfiles -> módulos (solo nombres), para el menú "mover tarea".
export async function getModulesIndex() {
  return prisma.profile.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      modules: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
    },
  });
}

// --- Módulos ----------------------------------------------------------------
export async function createModule(input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const profileId = String(input.profileId ?? "").trim();
  if (!profileId) throw new HttpError("Falta el perfil.", 400);

  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) throw new HttpError("El perfil no existe.", 404);

  const name = String(input.name ?? "").trim();
  if (!name) throw new HttpError("El nombre del módulo es requerido.", 400);

  const firstTask = String(input.firstTask ?? "").trim();
  await prisma.module.create({
    data: {
      profileId,
      name,
      tasks: firstTask ? { create: { name: firstTask, position: 0 } } : undefined,
    },
  });

  return getChecklist(profileId);
}

export async function updateModule(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const sourceProfileId = await requireModuleProfile(id);

  // ¿Mover el módulo completo (con sus tareas) a otro perfil?
  const targetProfileId = typeof input.profileId === "string" ? input.profileId.trim() : "";
  if (targetProfileId && targetProfileId !== sourceProfileId) {
    const target = await prisma.profile.findUnique({ where: { id: targetProfileId }, select: { id: true } });
    if (!target) throw new HttpError("El perfil destino no existe.", 404);
    await prisma.module.update({ where: { id }, data: { profileId: targetProfileId } });
    return getChecklist(sourceProfileId);
  }

  const name = String(input.name ?? "").trim() || "Módulo sin nombre";
  await prisma.module.update({ where: { id }, data: { name } });
  return getChecklist(sourceProfileId);
}

export async function deleteModule(id: string): Promise<ChecklistModule[]> {
  const profileId = await requireModuleProfile(id);
  // Junta los publicId de imágenes antes de borrar (para limpiarlas en Cloudinary).
  const tasks = await prisma.task.findMany({ where: { moduleId: id }, select: { images: true } });
  const publicIds = tasks.flatMap((t) => parseImages(t.images).map((im) => im.publicId));

  await prisma.module.delete({ where: { id } });
  await destroyImages(publicIds);
  return getChecklist(profileId);
}

// --- Tareas -----------------------------------------------------------------
export async function createTask(moduleId: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const profileId = await requireModuleProfile(moduleId);
  const name = String(input.name ?? "").trim();
  if (!name) throw new HttpError("El nombre de la tarea es requerido.", 400);

  const last = await prisma.task.findFirst({
    where: { moduleId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  await prisma.task.create({ data: { moduleId, name, position } });
  return getChecklist(profileId);
}

export async function updateTask(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const task = await requireTask(id);
  const sourceProfileId = task.module.profileId;

  // ¿Mover la tarea a otro módulo (posiblemente de otro perfil)?
  const targetModuleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
  if (targetModuleId && targetModuleId !== task.moduleId) {
    const target = await prisma.module.findUnique({ where: { id: targetModuleId }, select: { id: true } });
    if (!target) throw new HttpError("El módulo destino no existe.", 404);

    const last = await prisma.task.findFirst({
      where: { moduleId: targetModuleId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;

    await prisma.task.update({ where: { id }, data: { moduleId: targetModuleId, position } });
    return getChecklist(sourceProfileId);
  }

  const name =
    typeof input.name === "string" ? input.name.trim() || "Tarea sin nombre" : task.name;
  const done = typeof input.done === "boolean" ? input.done : task.done;

  const description =
    input.description === null
      ? null
      : typeof input.description === "string"
        ? input.description.trim() || null
        : (task.description ?? null);

  const links = Array.isArray(input.links) ? parseLinks(input.links) : parseLinks(task.links);

  let images = parseImages(task.images);
  if (Array.isArray(input.images)) {
    const next = parseImages(input.images);
    const nextIds = new Set(next.map((im) => im.publicId));
    // Las imágenes que ya no están: se borran de Cloudinary.
    const removed = images.filter((im) => !nextIds.has(im.publicId)).map((im) => im.publicId);
    if (removed.length) await destroyImages(removed);
    images = next;
  }

  await prisma.task.update({
    where: { id },
    data: { name, done, description, images, links },
  });
  return getChecklist(sourceProfileId);
}

export async function deleteTask(id: string): Promise<ChecklistModule[]> {
  const task = await requireTask(id);
  const publicIds = parseImages(task.images).map((im) => im.publicId);

  await prisma.task.delete({ where: { id } });
  await destroyImages(publicIds);
  return getChecklist(task.module.profileId);
}

// Reordena las tareas de un módulo según el array de ids recibido.
export async function reorderTasks(moduleId: string, taskIds: unknown): Promise<ChecklistModule[]> {
  const profileId = await requireModuleProfile(moduleId);
  if (!Array.isArray(taskIds)) throw new HttpError("Orden inválido.", 400);

  const existing = await prisma.task.findMany({ where: { moduleId }, select: { id: true } });
  const existingIds = new Set(existing.map((t) => t.id));
  const ordered = taskIds.filter((x): x is string => typeof x === "string" && existingIds.has(x));

  await prisma.$transaction(
    ordered.map((taskId, index) =>
      prisma.task.update({ where: { id: taskId }, data: { position: index } })
    )
  );

  return getChecklist(profileId);
}
