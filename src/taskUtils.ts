export interface Task {
  text: string;
  line: number;
  done: boolean;
  priority?: number;
  start?: string | null;
  due?: string | null;
  recur?: string | null;
}

export function parseTasks(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  const taskRegex = /^[-*]\s+\[( |x|X)\]\s+(.*)$/;

  // Decoration regexes from readme.md
  const PRIORITY_REGEX = /#p([1-7])/i;
  const START_REGEX = /@start\(([^)]+)\)/i;
  const DUE_REGEX = /@due\(([^)]+)\)/i;
  const RECUR_REGEX = /@recur\(([^)]+)\)/i;

  lines.forEach((line, i) => {
    const match = line.match(taskRegex);
    if (match) {
      const text = match[2].trim();
      const done = match[1].toLowerCase() === 'x';

      // Decorations
      const priorityMatch = text.match(PRIORITY_REGEX);
      const startMatch = text.match(START_REGEX);
      const dueMatch = text.match(DUE_REGEX);
      const recurMatch = text.match(RECUR_REGEX);

      tasks.push({
        text,
        done,
        line: i,
        priority: priorityMatch ? parseInt(priorityMatch[1], 10) : undefined,
        start: startMatch ? startMatch[1] : null,
        due: dueMatch ? dueMatch[1] : null,
        recur: recurMatch ? recurMatch[1] : null
      });
    }
  });
  return tasks;
}
