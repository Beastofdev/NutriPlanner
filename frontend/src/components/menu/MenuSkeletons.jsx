const MealCardSkeleton = () => (
    <div className="mb-6">
        <div className="flex justify-between items-end mb-2 px-1">
            <div className="h-5 w-24 skeleton-shimmer rounded"></div>
            <div className="h-4 w-12 skeleton-shimmer rounded"></div>
        </div>
        <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
            <div className="h-36 w-full skeleton-shimmer flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--color-border)]" style={{ fontSize: '64px' }}>restaurant</span>
            </div>
            <div className="px-4 py-2.5 bg-[var(--color-tint-teal)] border-y border-[var(--color-border)] flex gap-2 items-center">
                <div className="h-4 w-4 skeleton-shimmer rounded"></div>
                <div className="h-3 w-3/4 skeleton-shimmer rounded"></div>
            </div>
            <div className="p-3 flex items-center justify-between bg-[var(--color-bg-page)]">
                <div className="flex gap-1.5">
                    <div className="h-5 w-14 skeleton-shimmer rounded"></div>
                    <div className="h-5 w-14 skeleton-shimmer rounded"></div>
                    <div className="h-5 w-14 skeleton-shimmer rounded"></div>
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-10 skeleton-shimmer rounded-full"></div>
                    <div className="h-10 w-10 skeleton-shimmer rounded-full"></div>
                </div>
            </div>
        </div>
    </div>
);

const MacrosSkeleton = () => (
    <div className="px-5 pb-6">
        <div className="bg-[var(--color-bg-card)] rounded-3xl p-5 border border-[var(--color-border)] shadow-sm">
            <div className="flex justify-between items-end mb-3">
                <div>
                    <div className="h-3 w-24 skeleton-shimmer rounded mb-2"></div>
                    <div className="h-8 w-32 skeleton-shimmer rounded"></div>
                </div>
                <div className="h-6 w-16 skeleton-shimmer rounded-full"></div>
            </div>
            <div className="w-full h-2 skeleton-shimmer rounded-full mb-4"></div>
            <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-[var(--color-bg-page)] p-2.5 rounded-xl border border-[var(--color-border)]">
                        <div className="h-3 w-10 skeleton-shimmer rounded mx-auto mb-2"></div>
                        <div className="h-6 w-12 skeleton-shimmer rounded mx-auto mb-1"></div>
                        <div className="h-1 w-full skeleton-shimmer rounded-full"></div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const LoadingSkeleton = () => (
    <div className="h-screen bg-[var(--color-bg-page)] font-sans">
        <div className="relative w-full max-w-lg mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">
            <div className="flex-1 overflow-hidden pb-28">
                <div className="flex flex-col gap-4 p-5 pt-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="h-3 w-20 skeleton-shimmer rounded mb-2"></div>
                            <div className="h-7 w-32 skeleton-shimmer rounded"></div>
                        </div>
                        <div className="w-10 h-10 skeleton-shimmer rounded-full"></div>
                    </div>
                    <div className="flex gap-2 overflow-hidden">
                        {[1, 2, 3, 4, 5, 6, 7].map(i => (
                            <div key={i} className="h-14 w-12 shrink-0 skeleton-shimmer rounded-xl"></div>
                        ))}
                    </div>
                </div>
                <MacrosSkeleton />
                <div className="px-5">
                    <MealCardSkeleton />
                    <MealCardSkeleton />
                    <MealCardSkeleton />
                </div>
            </div>
        </div>
    </div>
);

export { MealCardSkeleton, MacrosSkeleton, LoadingSkeleton };
