import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "size-4", md: "size-6", lg: "size-8" }[size];
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className={cn(sizeClass, "animate-spin text-muted-foreground")} />
    </div>
  );
}

export function ScreenLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
