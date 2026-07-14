import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";
import type { ChecklistModule } from "@/lib/types";

// Devuelve todos los módulos con sus tareas, en el mismo formato que consume el frontend.
export async function getChecklist(): Promise<ChecklistModule[]> {
  const modules = await prisma.module.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      tasks: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, done: true },
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
    })),
  }));
}

export async function createModule(input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new HttpError("El nombre del módulo es requerido.", 400);

  const firstTask = String(input.firstTask ?? "").trim();

  await prisma.module.create({
    data: {
      name,
      tasks: firstTask ? { create: { name: firstTask } } : undefined,
    },
  });

  return getChecklist();
}

export async function updateModule(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const name = String(input.name ?? "").trim() || "Módulo sin nombre";

  try {
    await prisma.module.update({ where: { id }, data: { name } });
  } catch {
    throw new HttpError("El módulo no existe.", 404);
  }

  return getChecklist();
}

export async function deleteModule(id: string): Promise<ChecklistModule[]> {
  try {
    // onDelete: Cascade en el schema borra las tareas asociadas automáticamente.
    await prisma.module.delete({ where: { id } });
  } catch {
    throw new HttpError("El módulo no existe.", 404);
  }

  return getChecklist();
}

export async function createTask(moduleId: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new HttpError("El nombre de la tarea es requerido.", 400);

  const moduleExists = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!moduleExists) throw new HttpError("El módulo no existe.", 404);

  await prisma.task.create({ data: { moduleId, name } });

  return getChecklist();
}

export async function updateTask(id: string, input: Record<string, unknown>): Promise<ChecklistModule[]> {
  const current = await prisma.task.findUnique({ where: { id } });
  if (!current) throw new HttpError("La tarea no existe.", 404);

  const name =
    typeof input.name === "string" ? input.name.trim() || "Tarea sin nombre" : current.name;
  const done = typeof input.done === "boolean" ? input.done : current.done;

  await prisma.task.update({ where: { id }, data: { name, done } });

  return getChecklist();
}

export async function deleteTask(id: string): Promise<ChecklistModule[]> {
  try {
    await prisma.task.delete({ where: { id } });
  } catch {
    throw new HttpError("La tarea no existe.", 404);
  }

  return getChecklist();
}
