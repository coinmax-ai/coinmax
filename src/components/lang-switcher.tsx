import { useState, useEffect, useRef } from "react";
import i18n from "@/lib/i18n";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "zh-TW", label: "繁體" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "vi", label: "Tiếng Việt" },
];

export default function LangSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("en");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("coinmax-lang") || i18n.language || "en";
    setCurrent(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (code: string) => {
    setCurrent(code);
    i18n.changeLanguage(code);
    localStorage.setItem("coinmax-lang", code);
    setOpen(false);
  };

  const currentLang = LANGUAGES.find(l => l.code === current) || LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 h-8 px-2 rounded-md transition-all active:scale-95"
        style={{
          background: open ? "rgba(255,255,255,0.08)" : "transparent",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/40 shrink-0">
          <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">{current.split("-")[0]}</span>
      </button>

      {open && (
        <>
          {/* Mobile: bottom sheet */}
          <div className="lg:hidden fixed inset-0 z-[90] bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="lg:hidden fixed left-0 right-0 bottom-0 z-[100] animate-in slide-in-from-bottom duration-200"
          >
            <div
              className="mx-auto max-w-lg rounded-t-2xl"
              style={{ background: "#15171b", borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-8 h-[3px] rounded-full bg-white/10" />
              </div>
              <div className="px-5 pb-2">
                <span className="text-[11px] font-semibold text-foreground/25 uppercase tracking-widest">Language</span>
              </div>
              <div className="px-3 pb-5 grid grid-cols-3 gap-1.5 max-h-[55vh] overflow-y-auto">
                {LANGUAGES.map(lang => {
                  const active = lang.code === current;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => select(lang.code)}
                      className="py-3 rounded-xl text-center transition-all active:scale-95"
                      style={{
                        background: active ? "rgba(10,186,181,0.08)" : "rgba(255,255,255,0.02)",
                        border: active ? "1px solid rgba(10,186,181,0.2)" : "1px solid transparent",
                      }}
                    >
                      <span className={`text-[13px] font-semibold ${active ? "text-primary" : "text-foreground/55"}`}>
                        {lang.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </div>

          {/* Desktop: dropdown */}
          <div
            className="hidden lg:block absolute right-0 top-full mt-1.5 w-44 rounded-xl overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: "#15171b",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            }}
          >
            <div className="py-1">
              {LANGUAGES.map(lang => {
                const active = lang.code === current;
                return (
                  <button
                    key={lang.code}
                    onClick={() => select(lang.code)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 transition-colors ${active ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}
                  >
                    <span className={`text-[13px] font-medium ${active ? "text-primary" : "text-foreground/60"}`}>
                      {lang.label}
                    </span>
                    {active && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
