import * as React from "react";
import { LazyOutlet } from "@/components/PageLoading";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicFormFooter } from "@/features/legal/SiteFooter";

type Theme = "light" | "dark";

/** What a full-width page (see `wide`) gets, so it can put the light/dark switch in its own header. */
export interface BareThemeContext {
  theme: Theme;
  toggleTheme: () => void;
}

/**
 * Used for pages meant to be shared as standalone links (the registration form
 * itself, and its confirmation screen) -- no admin/marketing chrome, just the
 * page content on the app's background.
 *
 * Theming here is intentionally local and independent of the admin app's
 * ThemeContext/localStorage: an external registrant's light/dark choice has
 * nothing to do with the admin's own remembered preference, and this page can
 * be opened on a completely different device/browser than any admin session.
 * It defaults to (and follows live changes to) the device's system
 * preference, but a manual toggle click always wins from then on.
 */
export function BareLayout({ wide = false }: { wide?: boolean }) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const userOverriddenRef = React.useRef(false);

  // A single effect (not split across several) so each apply/cleanup pair is
  // self-contained: whenever `theme` changes, React tears down the previous
  // instance (reverting to whatever was on the page right before it ran) and
  // sets up the new one from that clean baseline. That telescopes correctly
  // through StrictMode's dev-only mount -> cleanup -> re-mount replay and
  // through every later toggle, always restoring the true original on unmount.
  React.useEffect(() => {
    const root = document.documentElement;
    const previousIsDark = root.classList.contains("dark");
    const previousDataTheme = root.getAttribute("data-theme");

    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);

    return () => {
      root.classList.toggle("dark", previousIsDark);
      if (previousDataTheme) root.setAttribute("data-theme", previousDataTheme);
      else root.removeAttribute("data-theme");
    };
  }, [theme]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (!userOverriddenRef.current) setThemeState(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    userOverriddenRef.current = true;
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  };

  // A full-width page, like a business's order storefront, draws its own header with the theme switch in it.
  // No entrance animation here: its leftover transform would break the page's sticky header and floating bar.
  if (wide) {
    return (
      <div className="min-h-screen bg-transparent">
        <main id="main-content" tabIndex={-1} className="focus:outline-none">
          <LazyOutlet context={{ theme, toggleTheme } satisfies BareThemeContext} />
        </main>
        <PublicFormFooter />
      </div>
    );
  }

  return (
    <div className="page-enter min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-4 sm:pt-6">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-6 focus:outline-none sm:pb-10">
        <LazyOutlet />
      </main>
      <PublicFormFooter />
    </div>
  );
}
