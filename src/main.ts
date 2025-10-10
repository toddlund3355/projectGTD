import { App, Modal, Notice, Plugin, TFile, MarkdownView } from 'obsidian';
import { parseTasks } from './taskUtils';
import { NextProjectTasksSettingTab, DEFAULT_SETTINGS, NextProjectTasksSettings } from './settings';

const VIEW_TYPE = "next-project-tasks-view";

export default class NextProjectTasksPlugin extends Plugin {
  private isProcessingRecurrence = false;
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
        if (this.isProcessingRecurrence) return;
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const content = await this.app.vault.read(file);
        const tag = (this.settings.projectTag || "#projects").toLowerCase();
        const individualTag = (this.settings.individualTaskTag || "#individualtasks").toLowerCase();
        const contentLower = content.toLowerCase();
        const tagRegex = new RegExp(`\\b${tag}\\b`, 'i');
        const individualTagRegex = new RegExp(`\\b${individualTag}\\b`, 'i');
        if (!tagRegex.test(contentLower) && !individualTagRegex.test(contentLower)) return;
        const tasks = parseTasks(content);
        const lines = content.split('\n');
        let didProcess = false;
        for (const task of tasks) {
          if (task.done && task.recur) {
            const line = lines[task.line];
            if (line && line.trim().startsWith('- [x]')) {
              this.isProcessingRecurrence = true;
              await this.markTaskDone(file, line);
              this.isProcessingRecurrence = false;
              didProcess = true;
            }
          }
        }
        // Always refresh sidebar if a relevant file is modified
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
      const view = leaf.view;
      // Type guard: check if view is NextTasksView
      if (view instanceof NextTasksView) {
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
    const tagRegex = new RegExp(`\\b${tag}\\b`, 'i');
    const individualTagRegex = new RegExp(`\\b${individualTag}\\b`, 'i');
    // Add priority to the result
    const results: { file: TFile; task: string; priority: number; isProject: boolean }[] = [];

    // Use user-configurable priority tags from settings
    const priorityTags = (this.settings.priorityTags && this.settings.priorityTags.length > 0)
      ? this.settings.priorityTags.map(t => t.trim().toLowerCase())
      : ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];

    // Helper to extract priority from a string using priorityTags
    function extractPriority(str: string): number {
      for (let i = 0; i < priorityTags.length; i++) {
        const tag = priorityTags[i];
        // Match as whole word, case-insensitive
        const regex = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (regex.test(str)) return i + 1;
      }
      return Math.ceil(priorityTags.length / 2) || 4; // default to middle priority if not found
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
      const hasProjectTag = tagRegex.test(contentLower);
      const hasIndividualTag = individualTagRegex.test(contentLower);
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

      // Helper to check if a string contains any priority tag
      function containsPriorityTag(str: string): boolean {
        return priorityTags.some(tag => {
          const regex = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          return regex.test(str);
        });
      }

      if (hasIndividualTag) {
        // Show all eligible tasks
        tasks.filter(eligible).forEach((task) => {
          let taskPriority = extractPriority(task.text);
          if (!containsPriorityTag(task.text)) {
            taskPriority = projectPriority;
          }
          if (!taskPriority) taskPriority = Math.ceil(priorityTags.length / 2) || 4;
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
          if (!containsPriorityTag(nextTask.text)) {
            taskPriority = projectPriority;
          }
          if (!taskPriority) taskPriority = Math.ceil(priorityTags.length / 2) || 4;
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
    // Try to find an existing leaf with this file open
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      // Check if the view is a MarkdownView and has the file open
      const view = leaf.view;
      if (view && typeof view === 'object' && 'file' in view && (view as any).file?.path === file.path) {
        this.app.workspace.revealLeaf(leaf);
        return;
      }
    }

    // Try to get the active leaf first (normal Obsidian behavior)
    let targetLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;

    // If no active markdown leaf, try to get any available leaf
    if (!targetLeaf) {
      targetLeaf = this.app.workspace.getLeaf(false); // Try to reuse existing leaf
    }

    // If still no leaf, create a new one
    if (!targetLeaf) {
      targetLeaf = this.app.workspace.getLeaf(true);
    }

    if (targetLeaf) {
      await targetLeaf.openFile(file);
      // Force activation of the leaf - critical for Android
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
    } else {
      new Notice("Couldn't open file — no leaf available.");
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
      // Accept both checked and unchecked lines for recurrence
      if ((line.trim().startsWith("- [ ]") || line.trim().startsWith("- [x]")) && line.includes(taskText)) {
        // Check for recurrence
        const recurMatch = line.match(RECUR_REGEX);
        if (recurMatch) {
          let nextStart = null;
          // Recurrence pattern matches
          const fixedStart = recurMatch[1].match(/^from:(\d{4}-\d{2}-\d{2}),\s*every:(\d+)([dwmy])$/i);
          const interval = recurMatch[1].match(/^(\d+)([dwmy])$/i);
          const monthlyDay = recurMatch[1].match(/^monthly,\s*day=(\d+|last)$/i);
          const yearlyDay = recurMatch[1].match(/^yearly,\s*month=(\d{1,2}|[a-z]{3}),\s*day=(\d+|last)$/i);
          const weekdayRecur = recurMatch[1].match(/^((?:mon|tue|wed|thu|fri|sat|sun)(?:,(?:mon|tue|wed|thu|fri|sat|sun))*)$/i);

          function toUTCMidnight(d: Date) {
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          }

          if (fixedStart) {
            // Fixed start + interval: from:YYYY-MM-DD,every:Nd
            let startDate = new Date(`${fixedStart[1]}T00:00:00Z`);
            startDate = toUTCMidnight(startDate);
            const n = parseInt(fixedStart[2], 10);
            const unit = fixedStart[3].toLowerCase();
            const now = new Date();
            const today = toUTCMidnight(now);
            while (startDate <= today) {
              switch (unit) {
                case 'd': startDate.setUTCDate(startDate.getUTCDate() + n); break;
                case 'w': startDate.setUTCDate(startDate.getUTCDate() + n * 7); break;
                case 'm': startDate.setUTCMonth(startDate.getUTCMonth() + n); break;
                case 'y': startDate.setUTCFullYear(startDate.getUTCFullYear() + n); break;
              }
            }
            nextStart = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${startDate.getUTCDate().toString().padStart(2, '0')}`;
          } else if (interval) {
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                // Parse as local date, not UTC
                startDate = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
              }
            }

            const n = parseInt(interval[1], 10);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Normalize startDate to local midnight
            startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

            // Add the interval to get the next occurrence
            switch (interval[2].toLowerCase()) {
              case 'd': startDate.setDate(startDate.getDate() + n); break;
              case 'w': startDate.setDate(startDate.getDate() + n * 7); break;
              case 'm': startDate.setMonth(startDate.getMonth() + n); break;
              case 'y': startDate.setFullYear(startDate.getFullYear() + n); break;
            }

            nextStart = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
          } else if (monthlyDay) {
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
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
            let year = startDate.getFullYear() + 1;
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
            const weekdays = weekdayRecur[1].split(',').map(w => w.trim().toLowerCase());
            const weekdayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
            let startDate = new Date();
            const startMatch = line.match(START_REGEX);
            if (startMatch) {
              const iso = startMatch[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                startDate = new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);
              }
            }
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
          // Mark as uncompleted and update @start
          let newLine = line.replace("- [ ]", "- [ ]").replace("- [x]", "- [ ]"); // always reset to unchecked
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
          return line.replace("- [ ]", "- [x]").replace("- [x]", "- [x]");
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

    const ul = contentEl.createEl('ul', { cls: 'next-task-list' });

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
          label.classList.add('next-task-done');
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
    header.createEl("h2", { text: "Next Actions" });
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

