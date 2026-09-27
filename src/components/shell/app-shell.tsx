"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Classes, Icon, InputGroup, Menu, MenuItem, Popover, Tag, Tooltip } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { useView, type ViewData } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ShellContext } from "./shell-context";

type Shell = ViewData<"shell">;
type NavItem = {
  label: string;
  icon: IconName;
  href?: string;
  match?: (p: string) => boolean;
  badge?: number;
  show?: boolean;
};

const COLLAPSED_KEY = "loura.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shell = useView("shell", undefined, { poll: 5000 });
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  return (
    <ShellContext.Provider value={shell.data ?? null}>
      <div className="flex min-h-screen flex-col bg-background">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
          Skip to content
        </a>

        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-3 md:px-5">
          <Button className="lg:hidden" variant="minimal" icon="menu" aria-label="Open navigation" onClick={() => setNavOpen(true)} />
          <Link href="/" className="flex items-center gap-2" aria-label="Loura home">
            <Image src="/Loura%20Symbol.png" alt="" width={22} height={22} unoptimized />
            <span className="text-[22px] font-medium leading-none tracking-tight">loura</span>
          </Link>
          <div className="flex-1" />
          <HeaderSearch />
          <HelpMenu model={shell.data?.model} />
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r bg-background transition-[width] duration-200 lg:flex",
              collapsed ? "w-[68px]" : "w-60",
            )}
          >
            <Sidebar shell={shell.data} pathname={pathname} collapsed={collapsed} onToggle={toggleCollapsed} />
          </aside>

          {navOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <div className="relative flex w-72 border-r bg-background">
                <Sidebar shell={shell.data} pathname={pathname} collapsed={false} onToggle={() => setNavOpen(false)} />
              </div>
              <button className="flex-1 bg-black/60" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
            </div>
          )}

          <main id="main" className="min-w-0 flex-1 px-4 py-8 md:px-8 md:py-10">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

function Sidebar({ shell, pathname, collapsed, onToggle }: { shell?: Shell; pathname: string; collapsed: boolean; onToggle: () => void }) {
  const me = shell?.me;
  const work: NavItem[] = [
    {
      href: "/",
      label: "Home",
      icon: "home",
      match: (p) => p === "/" || p.startsWith("/inbox") || p.startsWith("/requests"),
      badge: shell?.counts.needsResponse,
    },
    {
      href: "/recents",
      label: "Recents",
      icon: "history",
      match: (p) => ["/recents", "/my-work", "/tasks", "/outputs", "/assignments", "/conversations"].some((x) => p.startsWith(x)),
    },
  ];
  const setup: NavItem[] = [
    { href: "/control-room", label: "Control Room", icon: "timeline-bar-chart", match: (p) => p.startsWith("/control-room") },
    // Studio has no screen in this prototype yet.
    { label: "Studio", icon: "clean" },
    { href: "/connections", label: "External connections", icon: "graph", match: (p) => p.startsWith("/connections") || p.startsWith("/sources") },
    { href: "/admin", label: "Administration", icon: "shield", match: (p) => p.startsWith("/admin"), show: Boolean(me?.is_admin) },
  ];

  return (
    <div className="flex w-full flex-col">
      <div className={cn("flex px-4 pb-3 pt-4", collapsed ? "justify-center" : "justify-end")}>
        <Button
          variant="minimal"
          icon="menu"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="!text-muted-foreground"
        />
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <ul className="space-y-1">
          {work.map((i) => (
            <NavLink key={i.label} item={i} active={Boolean(i.match?.(pathname))} collapsed={collapsed} />
          ))}
        </ul>

        <div className="mx-1 my-4 border-t" />

        {!collapsed && <p className="px-3 pb-2 text-xs text-muted-foreground">Oversight &amp; setup</p>}
        <ul className="space-y-1">
          {setup
            .filter((t) => t.show !== false)
            .map((i) => (
              <NavLink key={i.label} item={i} active={Boolean(i.match?.(pathname))} collapsed={collapsed} />
            ))}
        </ul>
      </nav>

      <div className="border-t px-3 py-3">{me && <AccountMenu me={me} collapsed={collapsed} />}</div>
    </div>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const inner = (
    <>
      <Icon icon={item.icon} size={15} className={active ? "text-foreground" : "text-muted-foreground"} aria-hidden />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular",
            active ? "bg-card text-foreground ring-1 ring-border" : "bg-secondary text-foreground",
            collapsed ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]" : "ml-auto",
          )}
          aria-label={`${item.badge} need a response`}
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "relative flex items-center gap-3 rounded-xl text-sm transition-colors",
    collapsed ? "h-10 w-10 justify-center self-center" : "px-3 py-2.5",
  );

  const el = item.href ? (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(cls, active ? "bg-secondary font-medium text-foreground" : "text-foreground/80 hover:bg-accent/70 hover:text-foreground")}
    >
      {inner}
    </Link>
  ) : (
    <span aria-disabled="true" title={`${item.label} isn't available yet`} className={cn(cls, "cursor-not-allowed text-foreground/80 opacity-60")}>
      {inner}
    </span>
  );

  return (
    <li className={cn(collapsed && "flex justify-center")}>
      {collapsed ? (
        <Tooltip content={item.label} placement="right" minimal>
          {el}
        </Tooltip>
      ) : (
        el
      )}
    </li>
  );
}

function ModelStatus({ model }: { model?: { available: boolean; name: string } }) {
  if (!model) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={model.available ? `Live model: ${model.name}` : "No model key configured"}>
      <span className={cn("h-1.5 w-1.5 rounded-full", model.available ? "bg-ready" : "bg-risk")} aria-hidden />
      {model.available ? (
        <span className="truncate">
          Agent live · <span className="font-mono">{model.name}</span>
        </span>
      ) : (
        "Agent simulated — no model key"
      )}
    </p>
  );
}

function HelpMenu({ model }: { model?: { available: boolean; name: string } }) {
  return (
    <Popover
      placement="bottom-end"
      minimal
      content={
        <div className="w-72 space-y-3 p-4">
          <p className="text-sm font-medium">About this workspace</p>
          <p className={cn(Classes.TEXT_MUTED, "text-xs leading-relaxed")}>
            Ask Loura a question or describe a task from Home. Requests that need your response — approvals, reviews, and questions — collect in your inbox.
          </p>
          <ModelStatus model={model} />
        </div>
      }
    >
      <Button variant="minimal" icon={<Icon icon="help" size={18} />} aria-label="Help" />
    </Popover>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function AccountMenu({ me, collapsed }: { me: Shell["me"]; collapsed: boolean }) {
  return (
    <Popover
      placement="top-start"
      minimal
      content={
        <div className="w-72 space-y-3 p-3">
          <div>
            <p className="text-sm font-medium">{me.full_name}</p>
            <p className={cn(Classes.TEXT_MUTED, "text-xs")}>{me.title} · {me.email}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {me.is_admin && <Tag minimal data-pill data-tone="neutral">Administrator</Tag>}
            {me.is_creator && <Tag minimal data-pill data-tone="neutral">Creator</Tag>}
            {me.is_supervisor && <Tag minimal data-pill data-tone="neutral">Supervisor</Tag>}
          </div>
          <p className={cn(Classes.TEXT_MUTED, "text-[11px] leading-snug")}>
            Test accounts share one organization. To act as someone else, sign out and sign in with their account.
          </p>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="minimal" size="small" icon="log-out" text="Sign out" fill alignText="start" />
          </form>
        </div>
      }
    >
      <button
        type="button"
        className={cn("flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left hover:bg-accent/70", collapsed && "justify-center px-0")}
        aria-label="Account"
      >
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground" aria-hidden>
          {initials(me.full_name)}
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-background" />
        </span>
        {!collapsed && <span className="min-w-0 flex-1 truncate text-sm">{me.full_name}</span>}
      </button>
    </Popover>
  );
}

/** The header's Search button expands into a search field; ⌘K opens it from anywhere. */
function HeaderSearch() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useView("search", { q: debounced }, { enabled: debounced.trim().length > 1, poll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setExpanded(true);
        requestAnimationFrame(() => ref.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setQ("");
    setExpanded(false);
  };

  if (!expanded)
    return (
      <Button
        variant="minimal"
        icon={<Icon icon="search" size={18} />}
        text={<span className="hidden text-[15px] sm:inline">Search</span>}
        aria-label="Search records you can access"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => ref.current?.focus());
        }}
      />
    );

  const items = debounced.trim().length > 1 ? (results.data?.results ?? []) : [];
  return (
    <Popover
      isOpen={q.trim().length > 1}
      onInteraction={(next) => !next && close()}
      autoFocus={false}
      enforceFocus={false}
      placement="bottom-end"
      minimal
      content={
        <Menu className="w-[min(90vw,380px)]">
          {results.isFetching && !items.length && <MenuItem disabled text="Searching…" />}
          {!results.isFetching && !items.length && <MenuItem disabled text="No permitted records match." />}
          {items.map((r, i) => (
            <MenuItem
              key={`${r.href}-${i}`}
              text={r.title}
              label={r.kind}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                close();
                router.push(r.href);
              }}
            />
          ))}
        </Menu>
      }
    >
      <InputGroup
        inputRef={ref}
        type="search"
        leftIcon="search"
        placeholder="Search"
        rightElement={<kbd className="mr-2 mt-[7px] font-mono text-[10px] text-muted-foreground">⌘K</kbd>}
        aria-label="Search records you can access"
        className="w-[min(60vw,320px)]"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        onBlur={() => !q && setExpanded(false)}
      />
    </Popover>
  );
}
