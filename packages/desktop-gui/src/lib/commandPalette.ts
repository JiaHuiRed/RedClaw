import type { CommandEntry } from "../gateway/client";

export type PaletteItem =
  | { kind: "header"; category: string; count: number }
  | { kind: "command"; command: CommandEntry };

const OTHER_CATEGORY = "其他";
const MAX_RESULTS = 15;

function categoryOf(cmd: CommandEntry): string {
  return cmd.category?.trim() || OTHER_CATEGORY;
}

function matches(cmd: CommandEntry, query: string): boolean {
  return cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query);
}

function toCommandItem(command: CommandEntry): PaletteItem {
  return { kind: "command", command };
}

function commandsInCategory(commands: CommandEntry[], category: string): CommandEntry[] {
  return commands.filter((c) => categoryOf(c) === category);
}

function distinctCategories(commands: CommandEntry[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const cmd of commands) {
    const cat = categoryOf(cmd);
    if (!seen.has(cat)) {
      seen.add(cat);
      order.push(cat);
    }
  }
  return order;
}

// `filter` is the raw textarea value, always starting with "/" while the
// palette is open. `category` is the currently drilled-into category, or
// null at root. Grouping (headers) only ever shows when there's no search
// text typed - the moment the user types past the bare "/", it's a flat
// substring search scoped to wherever they currently are.
export function getVisibleItems(
  commands: CommandEntry[],
  filter: string,
  category: string | null,
): PaletteItem[] {
  const query = filter.slice(1).trim().toLowerCase();
  const scoped = category ? commandsInCategory(commands, category) : commands;

  if (query) {
    return scoped
      .filter((c) => matches(c, query))
      .slice(0, MAX_RESULTS)
      .map(toCommandItem);
  }

  if (category) {
    return scoped.slice(0, MAX_RESULTS).map(toCommandItem);
  }

  const categories = distinctCategories(commands);
  if (categories.length <= 1) {
    // Nothing meaningful to group by (backend hasn't populated `category`
    // on these commands, or everything is one bucket) - fall back to a
    // flat list instead of forcing a pointless single-header drill-down.
    return commands.slice(0, MAX_RESULTS).map(toCommandItem);
  }

  return categories.map((cat) => ({
    kind: "header" as const,
    category: cat,
    count: commandsInCategory(commands, cat).length,
  }));
}
