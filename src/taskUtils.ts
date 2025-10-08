export interface Task {
  text: string;
  line: number;
  done: boolean;
}

export function parseTasks(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  const taskRegex = /^[-*]\s+\[( |x|X)\]\s+(.*)$/;

  lines.forEach((line, i) => {
    const match = line.match(taskRegex);
    if (match) {
      tasks.push({
        text: match[2].trim(),
        done: match[1].toLowerCase() === 'x',
        line: i
      });
    }
  });
  return tasks;
}
