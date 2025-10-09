# projectGTD

A powerful Obsidian plugin for managing next actions, project tasks, and individual to-do lists using Markdown task decorations and configurable tags. 

- Focus on the next actionable task in each project note (using the #projects tag).
- See all eligible tasks from individual task notes (using the #individualtasks tag).
- Supports priority, start dates, due dates, and flexible recurrence syntax.
- Sidebar view for quick access and completion of tasks across your vault.

---

# Project Tag and Individual Task Tag Usage

This plugin uses two configurable tags to control which tasks appear in the sidebar:

- **Project Tag** (default: `#projects`):
  - If a note contains this tag, it is treated as a project note.
  - Only the next eligible task from each project note will appear in the sidebar. The next eligible task in a project note is the first task in the note that is not completed. So re-ordering of tasks involves just moving them around. No task dependencies are needed.
  - Project notes are ideal for managing sequential or grouped tasks where you want to focus on the next actionable item.

- **Individual Task Tag** (default: `#individualtasks`):
  - If a note contains this tag, it is treated as an individual task list.
  - All eligible tasks from these notes will appear in the sidebar (not just the next one).
  - This is useful for general to-do lists or notes where you want to see every actionable item at once.

**Eligibility:**
- A task is eligible if it is not completed and its start date (if present) is today or earlier.
- Recurring tasks will be rescheduled with a future start date when checked, and will disappear from the sidebar until their new start date arrives.

**Example:**

- Project note (shows only the next eligible task):
  ```
  #projects
  - [ ] Write draft @start(2025-10-08)
  - [ ] Edit draft
  ```
- Individual task note (shows all eligible tasks):
  ```
  #individualtasks
  - [ ] Buy groceries
  - [ ] Call mom @start(2025-10-10)
  ```

---

## 🆕 Individual Task Notes

You can configure a second tag (default: `#individualtasks`) in the plugin settings. If a note contains this tag, all eligible tasks in that note will appear in the sidebar, regardless of project status. Tasks are still filtered by start date.

**Settings:**
- `Project Tag`: Only the next task from each note with this tag will appear.
- `Individual Task Tag`: All eligible tasks from notes with this tag will appear.

**Example:**
```
- [ ] Buy groceries #individualtasks
- [ ] Call mom #individualtasks @start(2025-10-10)
```
If the note contains `#individualtasks`, both tasks will show (unless filtered by start date).
# Task Decoration Syntax (TDSL) — Summary

A lightweight syntax for decorating Markdown tasks in Obsidian with metadata
such as priority, recurrence, start dates, and due dates.

---

## ✅ Basic Task Format

```
- [ ] Task description ... decorations ...
```

Decorations can appear anywhere in the line (usually at the end).

Example:
```
- [ ] Replace air filter #p3 @start(2025-10-10) @due(2025-10-14) @recur(7d)
```

---

## 🏷️ Decorations

| Decoration | Syntax | Meaning | Example |
|-------------|---------|----------|----------|
| **Priority** | `#p1`–`#p7` | Task importance (1=highest, 7=lowest) | `#p2` |
| **Start date** | `@start(YYYY-MM-DD)` | When the task becomes active | `@start(2025-10-07)` |
| **Due date** | `@due(YYYY-MM-DD)` | Deadline for the task | `@due(2025-10-14)` |
| **Tags** | `#tag` | User-defined labels | `#work`, `#home` |
| **Recurrence** | `@recur(...)` | Defines how and when a task repeats | see below |

---

## 🔁 Recurrence Forms (`@recur(...)`)

### 1. Interval-based (relative to completion)
```
@recur(7d)
@recur(3w)
@recur(1m)

### 3. Weekday-based (absolute)
```
@recur(mon)
@recur(mon,thu)
```
- Repeats on specified weekdays.
- Valid tokens: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`

---

### 4. Monthly (day-of-month)
```
@recur(monthly,day=15)
@recur(monthly,day=last)
```
- Repeats on the Nth or last day of each month.

---

### 5. Yearly (month + day)
```
@recur(yearly,month=4,day=15)
@recur(yearly,month=12,day=31)
```
- Repeats on a specific day of a specific month every year.

---



## 🧩 Example Tasks

```
- [ ] Pay rent #p1 @due(2025-11-01) @recur(1m)
- [ ] Review project plan #p3 @start(2025-10-10) @due(2025-10-15)
- [ ] Take out trash #p5 @recur(mon,thu)
- [ ] Pay credit card #p2 @recur(monthly,day=15)
- [ ] File taxes #p1 @recur(yearly,month=4,day=15)
```

# Important Note on Recurring Tasks with Future Start Dates

If you complete (check off) a recurring task that has a future start date (e.g., `@start(YYYY-MM-DD)` where the date is after today), the plugin will immediately uncheck the task and reschedule its start date according to the recurrence rule. This means the task will remain unchecked and its @start will be advanced, so it will disappear from the sidebar until its new start date arrives.

This behavior ensures that recurring tasks are always scheduled for the next eligible date, even if completed early. If you want a different behavior, please adjust your workflow or let us know your use case.

---

