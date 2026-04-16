import type { LucideIcon } from "../icons/index.js";

/**
 * Role-aware navigation model shared between apps.
 *
 * Each app assembles its own `NavSection[]` from its routes and then passes
 * that array to <Sidebar />. The `requires` array lists permission keys that
 * must all be present on the active user; items without `requires` are public
 * within the app.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string | number;
  /** Permission keys required to see this item (AND semantics). */
  requires?: readonly string[];
  /** Sub-items rendered as a nested group. */
  children?: readonly NavItem[];
  /** Show a disabled "Coming soon" chip. */
  comingSoon?: boolean;
}

export interface NavSection {
  id: string;
  label?: string;
  items: readonly NavItem[];
}

export interface NavContext {
  /** Permissions granted to the current user. */
  permissions: readonly string[];
  /** Current pathname (usePathname()); used for active-state highlighting. */
  pathname: string;
}

/**
 * Returns true when every permission in `requires` is present in `granted`.
 * Default (empty `requires`) is always true — the guardrail lives in pages
 * and backend RLS, not in nav rendering.
 */
export function hasAll(
  granted: readonly string[],
  requires: readonly string[] | undefined,
): boolean {
  if (!requires || requires.length === 0) {
    return true;
  }
  const set = new Set(granted);
  return requires.every((r) => set.has(r));
}

export function filterNav(sections: readonly NavSection[], ctx: NavContext): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasAll(ctx.permissions, item.requires)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(href + "/");
}
