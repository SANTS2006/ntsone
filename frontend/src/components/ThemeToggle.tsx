import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/ThemeContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, showLabel }: { className?: string; showLabel?: boolean }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "default" : "icon"}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(showLabel && "justify-start", className)}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel && (theme === "dark" ? "Light mode" : "Dark mode")}
    </Button>
  );
}
