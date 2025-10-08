import { App, Modal, Notice, Plugin, TFile } from 'obsidian';
import { parseTasks } from './taskUtils';

const VIEW_TYPE = "next-project-tasks-view";

export default class NextProjectTasksPlugin extends Plugin {
  async onload() {
    // await this.loadSettings();

    // Register the sidebar view
    this.registerView(VIEW_TYPE, (leaf) => new NextTasksView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon("check-circle", "Show Next Tasks Panel", () => {
      this.activateView();
    });

    // Add command (Command Palette)
    this.addCommand({
      id: "show-next-project-tasks",
      name: "Show next tasks from #projects",
      callback: () => this.activateView()
    });
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE).first();

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  // ✅ Here's where getNextTasks() goes:
  async getNextTasks() {
    const files = this.app.vault.getMarkdownFiles();
    const tag = "#projects";
    // Add priority to the result
    const results: { file: TFile; task: string; priority: number }[] = [];

    // Helper to extract priority from a string
    function extractPriority(str: string): number {
      const match = str.match(/#p([1-7])\b/i);
      if (match) return parseInt(match[1], 10);
      return 4; // default priority
    }

    // Helper to get local YMD as string
    function toLocalYMD(date) {
      return date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0') + '-' + date.getDate().toString().padStart(2, '0');
    }
    const now = new Date();
    const todayYMD = toLocalYMD(now);
    // Parse a date string (YYYY-MM-DD or today+Nd) and return YMD string
    function parseYMD(str) {
      if (!str) return null;
      // Accept YYYY-MM-DD or YYYY-MM-DDThh:mm
      const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      // Accept today+Nd
      const rel = str.match(/^today\+(\d+)d$/i);
      if (rel) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(rel[1], 10));
        return toLocalYMD(d);
      }
      return null;
    }

    for (const file of files) {
      const content = await this.app.vault.read(file);
      if (!content.includes(tag)) continue;

      // Get project-level priority
      const projectPriority = extractPriority(content);

      const tasks = parseTasks(content); // from your taskUtils.ts
      // Only consider tasks that are not done and not in the future
      const nextTask = tasks.find((t) => {
        if (t.done) return false;
        if (t.start) {
          const startYMD = parseYMD(t.start);
          if (startYMD && startYMD > todayYMD) return false;
        }
        return true;
      });

      if (nextTask) {
        // Check for priority in the task text, else use project, else default
        let taskPriority = extractPriority(nextTask.text);
        if (!nextTask.text.match(/#p[1-7]\b/i)) {
          taskPriority = projectPriority;
        }
        if (!taskPriority) taskPriority = 4;
        console.log(`[Priority Debug] File: ${file.basename}, Task: ${nextTask.text}, Priority: #p${taskPriority}`);
        results.push({ file, task: nextTask.text, priority: taskPriority });
      }
    }
    return results;
  }

  async markTaskUndone(file: TFile, taskText: string) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const updated = lines.map((line) => {
      if (line.trim().startsWith("- [x]") && line.includes(taskText)) {
        return line.replace("- [x]", "- [ ]");
      }
      return line;
    });

    await this.app.vault.modify(file, updated.join("\n"));
    new Notice(`Marked task as undone in ${file.basename}`);
  }

  async openFileInMain(file: TFile) {
    const workspace = this.app.workspace;
    let leaf: WorkspaceLeaf | null = null;

    // Try to find an existing markdown leaf in the main workspace
    const leaves = workspace.getLeavesOfType("markdown");
    if (leaves.length > 0) {
      leaf = leaves[0];
    }

    // If none exist, create a new one in the main workspace
    if (!leaf) {
      leaf = workspace.getLeaf(true); // true = force main area
    }

    if (leaf) {
      await leaf.openFile(file);
      console.log("🟢 Opened file in main:", file.path);
    } else {
      new Notice("Couldn't open file — no editable leaf found.");
    }
  }


  // ✅ Optional helper for marking done
  async markTaskDone(file: TFile, taskText: string) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // Regexes for decorations
    const RECUR_REGEX = /@recur\(([^)]+)\)/i;
    const START_REGEX = /@start\(([^)]+)\)/i;

    let updated = lines.map((line) => {
      if (line.trim().startsWith("- [ ]") && line.includes(taskText)) {
        // Check for recurrence
        const recurMatch = line.match(RECUR_REGEX);
        if (recurMatch) {
          let nextStart = null;
          // Recurrence pattern matches
          const interval = recurMatch[1].match(/^(\d+)([dwmy])$/i);
          const monthlyDay = recurMatch[1].match(/^monthly,\s*day=(\d+|last)$/i);
          const yearlyDay = recurMatch[1].match(/^yearly,\s*month=(\d{1,2}|[a-z]{3}),\s*day=(\d+|last)$/i);
          const weekdayRecur = recurMatch[1].match(/^((?:mon|tue|wed|thu|fri|sat|sun)(?:,(?:mon|tue|wed|thu|fri|sat|sun))*)$/i);

          if (interval) {
            // ...existing code for interval...
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
            const n = parseInt(interval[1], 10);
            switch (interval[2].toLowerCase()) {
              case 'd': startDate.setDate(startDate.getDate() + n); break;
              case 'w': startDate.setDate(startDate.getDate() + n * 7); break;
              case 'm': startDate.setMonth(startDate.getMonth() + n); break;
              case 'y': startDate.setFullYear(startDate.getFullYear() + n); break;
            }
            nextStart = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
          } else if (monthlyDay) {
            // ...existing code for monthlyDay...
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
            let year = startDate.getFullYear();
            let month = startDate.getMonth() + 1;
            if (month === 12) {
              year += 1;
              month = 1;
            } else {
              month += 1;
            }
            let day = 1;
            if (monthlyDay[1] === 'last') {
              day = new Date(year, month, 0).getDate();
            } else {
              day = Math.min(parseInt(monthlyDay[1], 10), new Date(year, month, 0).getDate());
            }
            nextStart = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          } else if (yearlyDay) {
            // ...existing code for yearlyDay...
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
            let year = startDate.getFullYear() + 1; // always next year
            let monthStr = yearlyDay[1];
            let monthNum: number;
            if (/^\d+$/.test(monthStr)) {
              monthNum = parseInt(monthStr, 10);
            } else {
              const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              monthNum = monthNames.indexOf(monthStr.toLowerCase()) + 1;
            }
            let day = 1;
            if (yearlyDay[2] === 'last') {
              day = new Date(year, monthNum, 0).getDate();
            } else {
              day = Math.min(parseInt(yearlyDay[2], 10), new Date(year, monthNum, 0).getDate());
            }
            nextStart = `${year}-${monthNum.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          } else if (weekdayRecur) {
            // ...new code for weekday recurrence...
            // Parse weekdays
            const weekdays = weekdayRecur[1].split(',').map(w => w.trim().toLowerCase());
            const weekdayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
            // Find current start date (or use today)
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
            // Find the soonest next weekday
            let minDiff = 8; // max days in week + 1
            let nextDate = null;
            const currentDay = startDate.getDay(); // 0=Sun, 1=Mon, ...
            for (const w of weekdays) {
              const targetDay = weekdayMap[w];
              if (typeof targetDay === 'number') {
                let diff = (targetDay - currentDay + 7) % 7;
                if (diff === 0) diff = 7; // always go to next occurrence
                if (diff < minDiff) {
                  minDiff = diff;
                  nextDate = new Date(startDate);
                  nextDate.setDate(startDate.getDate() + diff);
                }
              }
            }
            if (nextDate) {
              nextStart = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, '0')}-${nextDate.getDate().toString().padStart(2, '0')}`;
            }
          }
          // Mark as uncompleted and update @start
          let newLine = line.replace("- [ ]", "- [ ]"); // keep as uncompleted
          // Replace or add @start(...)
          if (nextStart) {
            if (line.match(START_REGEX)) {
              newLine = newLine.replace(START_REGEX, `@start(${nextStart})`);
            } else {
              newLine = newLine.trimEnd() + ` @start(${nextStart})`;
            }
          }
          return newLine;
        } else {
          // Not recurring: mark as done
          return line.replace("- [ ]", "- [x]");
        }
      }
      return line;
    });

    await this.app.vault.modify(file, updated.join("\n"));
    new Notice(`Marked task as done in ${file.basename}`);
  }
}

class NextTasksModal extends Modal {
  plugin: NextProjectTasksPlugin; // ✅ Works fine even in same file
  results: { file: TFile; task: string }[];

  constructor(app: App, plugin: NextProjectTasksPlugin, results: { file: TFile; task: string }[]) {
    super(app);
    this.plugin = plugin;
    this.results = results;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Next Tasks in #projects' });

    const ul = contentEl.createEl('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';

    this.results.forEach(({ file, task }) => {
      const li = ul.createEl('li', { cls: 'next-task-item' });

      // Create checkbox
      const checkbox = li.createEl('input', { type: 'checkbox' });
      checkbox.addClass('next-task-checkbox');
      checkbox.checked = false;

      // Task label
      const label = li.createEl("label", { cls: "next-task-label" });
      label.createEl("strong", { text: file.basename + ": " });
      label.appendText(task);

      // ✅ add click listener directly to the label
      label.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log("✅ Label clicked", file.path);

        await this.plugin.openFileInMain(file);
      });

      // On checkbox click — mark done in file
      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) {
          await this.markTaskDone(file, task);
          label.style.textDecoration = 'line-through';
        }
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }


  async markTaskDone(file: TFile, taskText: string) {
    const vault = this.app.vault;
    const content = await vault.read(file);
    const lines = content.split('\n');

    const updated = lines.map(line => {
      if (line.trim().startsWith('- [ ]') && line.includes(taskText)) {
        return line.replace('- [ ]', '- [x]');
      }
      return line;
    });

    await vault.modify(file, updated.join('\n'));
    new Notice(`Marked task as done in ${file.basename}`);
  }

}

import { ItemView, WorkspaceLeaf } from "obsidian";

class NextTasksView extends ItemView {
  plugin: NextProjectTasksPlugin; // ✅ declare plugin reference

  constructor(leaf: WorkspaceLeaf, plugin: NextProjectTasksPlugin) {
    super(leaf);
    this.plugin = plugin; // ✅ assign it
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Next Project Tasks";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    // Title and refresh button
    const header = container.createEl("div", { cls: "next-tasks-header" });
    header.createEl("h2", { text: "Next Tasks (#projects)" });

    const refreshBtn = header.createEl("button", { text: "🔄 Refresh" });
    refreshBtn.addEventListener("click", () => this.renderTasks());

    // Render the first time
    await this.renderTasks();
  }

  async renderTasks() {
    console.log("rendertasks called");
    const container = this.containerEl.children[1];
    const existingList = container.querySelector("ul");
    if (existingList) existingList.remove();

    let results = await this.plugin.getNextTasks();

    // Sort by priority (lower number = higher priority)
    results = results.sort((a, b) => a.priority - b.priority);

    const ul = container.createEl("ul");

    results.forEach(({ file, task, priority }) => {
      const li = ul.createEl("li", { cls: "next-task-item" });
      const checkbox = li.createEl("input", { type: "checkbox" });
      const label = li.createEl("label", { text: `${file.basename}: ${task}` });

      // Optionally, add a visual indicator for priority (e.g., tooltip)
      label.setAttr("title", `Priority: #p${priority}`);

      // Add click event to label to open the file in main area
      label.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log("✅ Sidebar label clicked", file.path);
        await this.plugin.openFileInMain(file);
      });

      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) {
          await this.plugin.markTaskDone(file, task);
        } else {
          await this.plugin.markTaskUndone(file, task);
        }
        await this.renderTasks(); // Refresh regardless of state
      });
    });
  }

  async onClose() {
    // cleanup if needed
  }
}

