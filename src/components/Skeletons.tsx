import React from 'react';

export function HomeSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-3.5 w-28 bg-[var(--bg-subtle)] rounded" />
          <div className="h-7 w-48 bg-[var(--bg-elevated)] rounded" />
          <div className="h-3.5 w-36 bg-[var(--bg-subtle)] rounded" />
        </div>
        <div className="w-20 h-20 rounded-full border-4 border-[var(--border-hairline)]" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[68px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl px-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)]" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-[var(--bg-elevated)] rounded" />
                <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded" />
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)]" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-28 bg-[var(--bg-elevated)] rounded" />
              <div className="h-3 w-40 bg-[var(--bg-subtle)] rounded" />
            </div>
          </div>
          <div className="h-14 w-full bg-[var(--bg-subtle)] rounded-xl" />
        </div>
      ))}
    </div>
  );
}
