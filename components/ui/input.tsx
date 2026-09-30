import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-lg border border-stone-300 bg-white px-4 text-base outline-none transition-colors placeholder:text-stone-400 focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
