import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export const ThemeToggle = () => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const theme = document.documentElement.dataset["theme"];
      setDark(theme ? theme === "dark" : system.matches);
    };

    syncTheme();
    system.addEventListener("change", syncTheme);
    return () => system.removeEventListener("change", syncTheme);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    const theme = next ? "dark" : "light";
    document.documentElement.dataset["theme"] = theme;
    try {
      localStorage.setItem("docs-theme", theme);
    } catch {
      // The current page can still change themes when storage is unavailable.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Dark mode"
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      <Moon className="dark:hidden" aria-hidden="true" />
      <Sun className="hidden dark:block" aria-hidden="true" />
    </Button>
  );
};
