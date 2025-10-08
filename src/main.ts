import { App, Modal, Notice, Plugin, TFile } from 'obsidian';
import { parseTasks } from './taskUtils';
import { NextProjectTasksSettingTab, DEFAULT_SETTINGS, NextProjectTasksSettings } from './settings';

const VIEW_TYPE = "next-project-tasks-view";

export default class NextProjectTasksPlugin extends Plugin {
  private refreshDebounceTimeout: any = null;
  settings: NextProjectTasksSettings;
  async onload() {
    await this.loadSettings();

    // Register the sidebar view
    this.registerView(VIEW_TYPE, (leaf) => new NextTasksView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon("check-circle", "Show Next Tasks Panel", () => {
      this.activateView();
    });

    // Add command (Command Palette)
    this.addCommand({
      id: "show-next-project-tasks",
      name: `Show next tasks from ${this.settings.projectTag}`,
      callback: () => this.activateView()
    });

    // Add settings tab
    this.addSettingTab(new NextProjectTasksSettingTab(this.app, this));

    // Listen for file changes to handle recurrence when tasks are checked in the note
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const content = await this.app.vault.read(file);
        const tag = (this.settings.projectTag || "#projects").toLowerCase();
        const individualTag = (this.settings.individualTaskTag || "#individualtasks").toLowerCase();
        const contentLower = content.toLowerCase();
        if (!contentLower.includes(tag) && !contentLower.includes(individualTag)) return;
        const tasks = parseTasks(content);
        const lines = content.split('\n');
        let changed = false;
        const today = new Date();
        const ymd = today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
        for (const task of tasks) {
          if (task.done && task.recur) {
            const line = lines[task.line];
            if (line && line.trim().startsWith('- [x]')) {
              let shouldProcess = true;
              const startMatch = line.match(/@start\(([^)]+)\)/i);
              if (startMatch) {
                const startDate = startMatch[1];
                if (startDate > ymd) shouldProcess = false;
              }
              if (shouldProcess) {
                const RECUR_REGEX = /@recur\(([^)]+)\)/i;
                const START_REGEX = /@start\(([^)]+)\)/i;
                const recurMatch = line.match(RECUR_REGEX);
                let nextStart = null;
                if (recurMatch) {
                  const interval = recurMatch[1].match(/^(\d+)([dwmy])$/i);
                  const monthlyDay = recurMatch[1].match(/^monthly,\s*day=(\d+|last)$/i);
                  const yearlyDay = recurMatch[1].match(/^yearly,\s*month=(\d{1,2}|[a-z]{3}),\s*day=(\d+|last)$/i);
                  const weekdayRecur = recurMatch[1].match(/^((?:mon|tue|wed|thu|fri|sat|sun)(?:,(?:mon|tue|wed|thu|fri|sat|sun))*)$/i);
                  let startDate = new Date();
                  const startMatch = line.match(START_REGEX);
                  if (startMatch) {
                    const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
                    if (iso) {
                      startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
                    }
                  }
                  if (interval) {
                    const n = parseInt(interval[1], 10);
                    switch (interval[2].toLowerCase()) {
                      case 'd': startDate.setDate(startDate.getDate() + n); break;
                      case 'w': startDate.setDate(startDate.getDate() + n * 7); break;
                      case 'm': startDate.setMonth(startDate.getMonth() + n); break;
                      case 'y': startDate.setFullYear(startDate.getFullYear() + n); break;
                    }
                    nextStart = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
                  } else if (monthlyDay) {
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
                    let year = startDate.getFullYear() + 1;
                    let monthStr = yearlyDay[1];
                    let monthNum;
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
                    const weekdays = weekdayRecur[1].split(',').map(w => w.trim().toLowerCase());
                    const weekdayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
                    let minDiff = 8;
                    let nextDate = null;
                    const currentDay = startDate.getDay();
                    for (const w of weekdays) {
                      const targetDay = weekdayMap[w];
                      if (typeof targetDay === 'number') {
                        let diff = (targetDay - currentDay + 7) % 7;
                        if (diff === 0) diff = 7;
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
                  let newLine = line.replace("- [x]", "- [ ]");
                  if (nextStart) {
                    if (line.match(START_REGEX)) {
                      newLine = newLine.replace(START_REGEX, `@start(${nextStart})`);
                    } else {
                      newLine = newLine.trimEnd() + ` @start(${nextStart})`;
                    }
                  }
                  lines[task.line] = newLine;
                  changed = true;
                }
              }
            }
          }
        }
        if (changed) {
          await this.app.vault.modify(file, lines.join('\n'));
        }
        // Debounce sidebar refresh to avoid duplicate tasks from rapid file changes
        if (this.refreshDebounceTimeout) {
          clearTimeout(this.refreshDebounceTimeout);
        }
        this.refreshDebounceTimeout = setTimeout(() => {
          this.refreshAllViews?.();
        }, 100);
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshAllViews() {
    // Refresh all sidebar views
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      // Cast to NextTasksView to access renderTasks
      const view = leaf.view as any;
      if (view && typeof view.renderTasks === 'function') {
        view.renderTasks();
      }
    }
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
    const tag = (this.settings.projectTag || "#projects").toLowerCase();
    const individualTag = (this.settings.individualTaskTag || "#individualtasks").toLowerCase();
    // Add priority to the result
    const results: { file: TFile; task: string; priority: number; isProject: boolean }[] = [];

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

    const seen = new Set();
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const contentLower = content.toLowerCase();
      const hasProjectTag = contentLower.includes(tag);
      const hasIndividualTag = contentLower.includes(individualTag);
      if (!hasProjectTag && !hasIndividualTag) continue;

      // Get project-level priority
      const projectPriority = extractPriority(content);
      const tasks = parseTasks(content); // from your taskUtils.ts

      // Helper: eligible (not done, not future)
      const eligible = (t) => {
        if (t.done) return false;
        if (t.start) {
          const startYMD = parseYMD(t.start);
          if (startYMD && startYMD > todayYMD) return false;
        }
        return true;
      };

      if (hasIndividualTag) {
        // Show all eligible tasks
        tasks.filter(eligible).forEach((task) => {
          let taskPriority = extractPriority(task.text);
          if (!task.text.match(/#p[1-7]\b/i)) {
            taskPriority = projectPriority;
          }
          if (!taskPriority) taskPriority = 4;
          const key = file.path + '|' + task.text;
          if (!seen.has(key)) {
            results.push({ file, task: task.text, priority: taskPriority, isProject: false });
            seen.add(key);
          }
        });
      } else if (hasProjectTag) {
        // Show only the next eligible task
        const nextTask = tasks.find(eligible);
        if (nextTask) {
          let taskPriority = extractPriority(nextTask.text);
          if (!nextTask.text.match(/#p[1-7]\b/i)) {
            taskPriority = projectPriority;
          }
          if (!taskPriority) taskPriority = 4;
          const key = file.path + '|' + nextTask.text;
          if (!seen.has(key)) {
            results.push({ file, task: nextTask.text, priority: taskPriority, isProject: true });
            seen.add(key);
          }
        }
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
    // Render the first time
    await this.renderTasks();
  }

  async renderTasks() {
    console.log("rendertasks called");
    const container = this.containerEl.children[1];
    container.empty();

    // Title and refresh button (always update header)
    const header = container.createEl("div", { cls: "next-tasks-header" });
    header.createEl("h2", { text: `Next Tasks (${this.plugin.settings.projectTag})` });
    const refreshBtn = header.createEl("button", { text: "🔄 Refresh" });
    refreshBtn.addEventListener("click", () => this.renderTasks());

    let results = await this.plugin.getNextTasks();

    // Sort by priority (lower number = higher priority)
    results = results.sort((a, b) => a.priority - b.priority);

    const ul = container.createEl("ul");

    results.forEach(({ file, task, priority, isProject }) => {
      const li = ul.createEl("li", { cls: "next-task-item" });
      const checkbox = li.createEl("input", { type: "checkbox" });
      const labelText = isProject ? `${file.basename}: ${task}` : task;
      const label = li.createEl("label", { text: labelText });

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

