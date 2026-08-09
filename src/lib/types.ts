export type ChecklistImage = { url: string; publicId: string };
export type ChecklistLink = { url: string; label: string };
export type ChecklistComment = { text: string; createdAt: string; kind: "system" | "user" };

export type TaskStatus = "pendiente" | "ejecutando" | "hecho" | "fallo" | "error" | "aprobado";
export type ModuleType = "dev" | "qa";

export type ChecklistTask = {
  id: string;
  name: string;
  status: TaskStatus;
  description: string | null;
  images: ChecklistImage[];
  links: ChecklistLink[];
  comments: ChecklistComment[];
  qaComments: ChecklistComment[]; // reflejados desde la prueba QA enlazada (solo lectura)
  qaStatus: TaskStatus | null; // estado de la prueba QA enlazada (para tareas Dev); null = sin QA
  createdAt: string;
  updatedAt: string;
};

export type ChecklistModule = {
  id: string;
  name: string;
  type: ModuleType;
  createdAt: string;
  tasks: ChecklistTask[];
};
