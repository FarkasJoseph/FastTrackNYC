"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocationSearchOption } from "@/lib/location-search/types";

export function LocationAutocompleteField({
  label,
  icon,
  selectedOption,
  demoOptions,
  onSelect,
  className,
}: {
  label: string;
  icon: ReactNode;
  selectedOption: LocationSearchOption;
  demoOptions: LocationSearchOption[];
  onSelect: (option: LocationSearchOption) => void;
  className?: string;
}) {
  const inputId = useId();
  const blurTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState(selectedOption.label);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LocationSearchOption[]>([]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);

      void fetch(`/api/search/autocomplete?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(payload?.error ?? "Failed to load suggestions.");
          }

          return response.json() as Promise<{ options?: LocationSearchOption[] }>;
        })
        .then((payload) => {
          setResults(payload.options ?? []);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }

          setResults([]);
          setLoading(false);
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  const shownOptions = query.trim().length < 2 ? demoOptions : results;

  function handleBlur() {
    blurTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    setQuery(selectedOption.label);
    setOpen(true);
  }

  function handleSelect(option: LocationSearchOption) {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    onSelect(option);
    setQuery(option.label);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(selectedOption.label);
      return;
    }

    if (event.key === "Enter" && shownOptions.length > 0) {
      event.preventDefault();
      handleSelect(shownOptions[0]);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <label
        htmlFor={inputId}
        className="mb-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]"
      >
        {label}
      </label>
      <div className="planner-search-field rounded-[0.95rem] border border-[var(--border-soft)] bg-white px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-soft)]">
            {icon}
          </div>
          <input
            id={inputId}
            value={open ? query : selectedOption.label}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={`Search ${label.toLowerCase()}`}
            className="min-w-0 flex-1 border-0 bg-transparent text-[0.92rem] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
            autoComplete="off"
          />
          {loading ? (
            <LoaderCircle className="size-4 animate-spin text-[var(--text-soft)]" />
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-[0.95rem] border border-[var(--border-soft)] bg-white shadow-[0_16px_36px_rgba(18,32,51,0.1)]">
          <div className="border-b border-[var(--border-soft)] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
            {query.trim().length < 2 ? "Suggested places" : "Search results"}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {shownOptions.length > 0 ? (
              shownOptions.map((option) => (
                <button
                  key={`${option.source}:${option.id}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(option)}
                  className="w-full px-3 py-2 text-left transition hover:bg-[var(--surface-muted)]"
                >
                  <div className="text-sm font-medium text-[var(--text)]">
                    {option.label}
                  </div>
                  {option.subtitle ? (
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {option.subtitle}
                    </div>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-[var(--text-muted)]">
                {loading ? "Loading" : "No matches yet"}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
