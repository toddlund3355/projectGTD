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
@recur(after:due,14d)
```
- Repeats N days/weeks/months/years after completion or an anchor date.
- Interval suffixes: `d` (days), `w` (weeks), `m` (months), `y` (years)
- Anchors: `start`, `due`, `done` (default)

---

### 2. Fixed start + interval
```
@recur(from:2025-10-07,every:14d)
```
- Repeats at a fixed cadence regardless of completion.

---

### 3. Weekday-based (absolute)
```
@recur(mon)
@recur(mon,thu)
@recur(weekly,mon)
@recur(every:mon)
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

## 📆 Date Forms

All date decorations (`@start`, `@due`, `@recur(from:...)`) accept:

```
YYYY-MM-DD
YYYY-MM-DDThh:mm
today+3d
```

---

## 🧠 Parsing Notes

Suggested regex matchers:

```typescript
const PRIORITY_REGEX = /#p([1-7])/;
const START_REGEX = /@start\(([^)]+)\)/;
const DUE_REGEX = /@due\(([^)]+)\)/;
const RECUR_REGEX = /@recur\(([^)]+)\)/;
```

Then interpret the recurrence value with patterns like:

- `^(\d+)([dwmy])$` → interval
- `^after:(start|due|done),(\d+)([dwmy])$` → anchored interval
- `^(?:every:|weekly,)?(mon|tue|wed|thu|fri|sat|sun)(?:,(mon|tue|wed|thu|fri|sat|sun))*$` → weekdays
- `^monthly,?day=(\d+|last)$` → monthly
- `^yearly,?month=(\d+|[a-z]{3}),?day=(\d+|last)$` → yearly

---

## 🧩 Example Tasks

```
- [ ] Pay rent #p1 @due(2025-11-01) @recur(1m)
- [ ] Review project plan #p3 @start(2025-10-10) @due(2025-10-15)
- [x] Submit report #p2 @due(2025-09-15) @recur(after:due,30d)
- [ ] Take out trash #p5 @recur(mon,thu)
- [ ] Pay credit card #p2 @recur(monthly,day=15)
- [ ] File taxes #p1 @recur(yearly,month=4,day=15)
```

---

## 🧮 Suggested Normalized JSON Schema

```json
{
  "title": "Take out trash",
  "completed": false,
  "priority": 5,
  "start": null,
  "due": null,
  "recur": {
    "mode": "weekly",
    "days": ["mon", "thu"]
  }
}
```

---

This file fully documents the TDSL specification for your plugin.
You can save it as `TASK_DECORATION_SPEC.md` or feed it to Copilot to assist in parsing logic, syntax highlighting, or autocomplete development.
