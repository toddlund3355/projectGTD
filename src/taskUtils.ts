import { App, TFile } from 'obsidian';

export interface Task {
  text: string;
  line: number;
  done: boolean;
  priority?: number;
  start?: string | null;
  due?: string | null;
  recur?: string | null;
}

// Fallback regex-based parser for compatibility
export function parseTasks(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  // Updated regex to handle leading whitespace/indentation
  const taskRegex = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;

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

// New Obsidian API-based parser (preferred)
export async function parseTasksWithAPI(file: TFile, app: App): Promise<Task[]> {
  const fileCache = app.metadataCache.getFileCache(file);
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  const tasks: Task[] = [];

  // Decoration regexes
  const PRIORITY_REGEX = /#p([1-7])/i;
  const START_REGEX = /@start\(([^)]+)\)/i;
  const DUE_REGEX = /@due\(([^)]+)\)/i;
  const RECUR_REGEX = /@recur\(([^)]+)\)/i;

  // Use Obsidian's list items from metadata cache
  const listItems = fileCache?.listItems;
  if (!listItems) {
    // Fallback to regex parsing if no cache
    return parseTasks(content);
  }

  for (const listItem of listItems) {
    // Check if this list item is a task (has a checkbox)
    if (listItem.task !== undefined) {
      const lineNumber = listItem.position.start.line;
      const line = lines[lineNumber];

      if (!line) continue;

      // Extract the task text (everything after the checkbox)
      const taskMatch = line.match(/^\s*[-*+]\s+\[.\]\s+(.*)$/);
      if (!taskMatch) continue;

      const text = taskMatch[1].trim();
      const done = listItem.task !== ' '; // Non-space means completed

      // Parse decorations from the text
      const priorityMatch = text.match(PRIORITY_REGEX);
      const startMatch = text.match(START_REGEX);
      const dueMatch = text.match(DUE_REGEX);
      const recurMatch = text.match(RECUR_REGEX);

      tasks.push({
        text,
        done,
        line: lineNumber,
        priority: priorityMatch ? parseInt(priorityMatch[1], 10) : undefined,
        start: startMatch ? startMatch[1] : null,
        due: dueMatch ? dueMatch[1] : null,
        recur: recurMatch ? recurMatch[1] : null
      });
    }
  }

  return tasks;
}
