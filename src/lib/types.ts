export type ChecklistImage = { url: string; publicId: string };
export type ChecklistLink = { url: string; label: string };

export type ChecklistTask = {
  id: string;
  name: string;
  done: boolean;
  description: string | null;
  images: ChecklistImage[];
  links: ChecklistLink[];
};

export type ChecklistModule = {
  id: string;
  name: string;
  tasks: ChecklistTask[];
};
