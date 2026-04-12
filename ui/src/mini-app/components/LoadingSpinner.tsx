export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" }[size];
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${sizeClass} animate-spin rounded-full border-2 border-[var(--tg-theme-hint-color)] border-t-[var(--tg-theme-button-color)]`} />
    </div>
  );
}

export function ScreenLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
