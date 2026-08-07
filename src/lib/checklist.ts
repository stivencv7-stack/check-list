import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";
import { destroyImages } from "@/lib/cloudinary";
import { parseImages, parseLinks, parseComments } from "@/lib/task-json";
import type {
  ChecklistModule,
  ChecklistImage,
  ChecklistLink,
  ChecklistComment,
  TaskStatus,
  ModuleType,
} from "@/lib/types";

const STATUSES: TaskStatus[] = ["pendiente", "ejecutando", "hecho", "fallo", "error", "aprobado"];
// Estados que el usuario puede fijar a mano. "error" y "aprobado" SOLO los pone el sistema.
const CLIENT_STATUSES: TaskStatus[] = ["pendiente", "ejecutando", "hecho", "fallo"];
const PROBAR_MARK = "🧪 Probar.";
const FALLO_COMMENT = "⚠️ La prueba falló.";

function normalizeStatus(value: unknown, fallback: TaskStatus): TaskStatus {
  return typeof value === "string" && STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : fallback;
}

function normalizeInputStatus(value: unknown, fallback: TaskStatus): TaskStatus {
  return typeof value === "string" && CLIENT_STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : fallback;
}

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
      status: true,
      description: true,
      images: true,
      links: true,
      comments: true,
      moduleId: true,
      sourceTaskId: true,
      module: { select: { profileId: true, name: true, type: true } },
    },
  });
  if (!task) throw new HttpError("La tarea no existe.", 404);
  return task;
}

// Busca un módulo por (perfil, nombre, tipo); si no existe, lo crea.
async function findOrCreateModule(profileId: string, name: string, type: ModuleType) {
  const existing = await prisma.module.findFirst({ where: { profileId, name, type } });
  if (existing) return existing;
  return prisma.module.create({ data: { profileId, name, type } });
}

async function nextPosition(moduleId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { moduleId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
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
          status: true,
          description: true,
          images: true,
          links: true,
          comments: true,
          sourceTaskId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  // Refleja los comentarios de una tarea enlazada (QA) hacia su tarea de origen (Dev).
  const reflected = new Map<string, ChecklistComment[]>();
  const qaStatusMap = new Map<string, TaskStatus>();
  for (const mod of modules) {
    for (const task of mod.tasks) {
      if (!task.sourceTaskId) continue;
      qaStatusMap.set(task.sourceTaskId, normalizeStatus(task.status, "pendiente"));
      const cs = parseComments(task.comments);
      if (!cs.length) continue;
      const list = reflected.get(task.sourceTaskId) ?? [];
      list.push(...cs);
      reflected.set(task.sourceTaskId, list);
    }
  }

  return modules.map((mod) => ({
    id: mod.id,
    name: mod.name,
    type: (mod.type === "qa" ? "qa" : "dev") as ModuleType,
    tasks: mod.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      status: normalizeStatus(task.status, "pendiente"),
      description: task.description ?? null,
      images: parseImages(task.images),
      links: parseLinks(task.links),
      comments: parseComments(task.comments),
      qaComments: reflected.get(task.id) ?? [],
      qaStatus: qaStatusMap.get(task.id) ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
  }));
}

// Índice de perfiles -> módulos (para el menú "mover tarea").
export async function getModulesIndex() {
  return prisma.profile.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      modules: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true } },
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

  const type: ModuleType = input.type === "qa" ? "qa" : "dev";
  const firstTask = String(input.firstTask ?? "").trim();

  await prisma.module.create({
    data: {
      profileId,
      name,
      type,
      tasks: firstTask ? { create: { name: firstTask, position: 0 } } : undefined,
    },
  });

  return getChecklist(profileId);
}

export async function updateModule(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const sourceProfileId = await requireModuleProfile(id);

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

  // Se puede crear ya con detalle (así createdAt === updatedAt y no aparece "editada").
  const description = typeof input.description === "string" ? input.description.trim() || null : null;
  const images = Array.isArray(input.images) ? parseImages(input.images) : [];
  const links = Array.isArray(input.links) ? parseLinks(input.links) : [];

  await prisma.task.create({
    data: { moduleId, name, description, images, links, position: await nextPosition(moduleId) },
  });
  return getChecklist(profileId);
}

// Crea la tarea "espejo" en el módulo del tipo destino (dev->qa o qa->dev).
async function spawnLinkedTask(params: {
  sourceTaskId: string;
  profileId: string;
  moduleName: string;
  targetType: ModuleType;
  name: string;
  images: ChecklistImage[];
  links: ChecklistLink[];
  description: string;
}): Promise<void> {
  // No duplicar: si ya nació una tarea de esta, no crear otra.
  const existing = await prisma.task.findFirst({ where: { sourceTaskId: params.sourceTaskId }, select: { id: true } });
  if (existing) return;

  const targetModule = await findOrCreateModule(params.profileId, params.moduleName, params.targetType);
  await prisma.task.create({
    data: {
      moduleId: targetModule.id,
      name: params.name,
      description: params.description || null,
      images: params.images,
      links: params.links,
      status: "pendiente",
      sourceTaskId: params.sourceTaskId,
      position: await nextPosition(targetModule.id),
    },
  });
}

export async function updateTask(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const task = await requireTask(id);
  const sourceProfileId = task.module.profileId;

  // ¿Mover la tarea a otro módulo?
  const targetModuleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
  if (targetModuleId && targetModuleId !== task.moduleId) {
    const target = await prisma.module.findUnique({ where: { id: targetModuleId }, select: { id: true } });
    if (!target) throw new HttpError("El módulo destino no existe.", 404);
    await prisma.task.update({
      where: { id },
      data: { moduleId: targetModuleId, position: await nextPosition(targetModuleId) },
    });
    return getChecklist(sourceProfileId);
  }

  const name = typeof input.name === "string" ? input.name.trim() || "Tarea sin nombre" : task.name;
  const prevStatus = normalizeStatus(task.status, "pendiente");
  const nextStatus = normalizeInputStatus(input.status, prevStatus);

  const description =
    input.description === null
      ? null
      : typeof input.description === "string"
        ? input.description.trim() || null
        : (task.description ?? null);

  const links = Array.isArray(input.links) ? parseLinks(input.links) : parseLinks(task.links);
  const comments = Array.isArray(input.comments) ? parseComments(input.comments) : parseComments(task.comments);

  let images = parseImages(task.images);
  if (Array.isArray(input.images)) {
    const next = parseImages(input.images);
    const nextIds = new Set(next.map((im) => im.publicId));
    const removed = images.filter((im) => !nextIds.has(im.publicId)).map((im) => im.publicId);
    if (removed.length) await destroyImages(removed);
    images = next;
  }

  await prisma.task.update({
    where: { id },
    data: { name, status: nextStatus, done: nextStatus === "hecho", description, images, links, comments },
  });

  // --- Flujo automático (solo al CAMBIAR de estado) ---
  if (nextStatus !== prevStatus) {
    if (nextStatus === "hecho" && task.module.type === "dev" && input.createQa === true) {
      // Dev terminada Y confirmada -> nace la prueba de QA (misma info + "🧪 Probar.").
      const qaDescription = ((description ?? "") + (description ? "\n\n" : "") + PROBAR_MARK).trim();
      await spawnLinkedTask({
        sourceTaskId: id,
        profileId: sourceProfileId,
        moduleName: task.module.name,
        targetType: "qa",
        name,
        images,
        links,
        description: qaDescription,
      });
    } else if (
      task.module.type === "qa" &&
      task.sourceTaskId &&
      (nextStatus === "fallo" || nextStatus === "hecho")
    ) {
      // La prueba QA cambió -> sincroniza la tarea de desarrollo de origen.
      const dev = await prisma.task.findUnique({
        where: { id: task.sourceTaskId },
        select: { id: true, comments: true },
      });
      if (dev) {
        if (nextStatus === "fallo") {
          // Falló -> Dev pasa a "Error" y se agrega un COMENTARIO (no en la descripción).
          const devComments = parseComments(dev.comments);
          devComments.push({ text: FALLO_COMMENT, createdAt: new Date().toISOString(), kind: "system" });
          await prisma.task.update({
            where: { id: dev.id },
            data: { status: "error", done: false, comments: devComments },
          });
        } else {
          // Prueba pasó (Hecho) -> Dev queda "Aprobado" (verificado por QA).
          await prisma.task.update({
            where: { id: dev.id },
            data: { status: "aprobado", done: true },
          });
        }
      }
    }
  }

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
