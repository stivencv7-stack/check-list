export type ChecklistTask = {
  id: string;
  name: string;
  done: boolean;
};

export type ChecklistModule = {
  id: string;
  name: string;
  tasks: ChecklistTask[];
};
