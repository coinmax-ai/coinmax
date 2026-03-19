import { useState, useEffect, useRef } from "react";
import i18n from "@/lib/i18n";

const LANGUAGES = [
  { code: "en", flag: "🇺🇸", label: "English", short: "EN" },
  { code: "zh", flag: "🇨🇳", label: "简体中文", short: "中文" },
  { code: "zh-TW", flag: "🇹🇼", label: "繁體中文", short: "繁體" },
  { code: "ja", flag: "🇯🇵", label: "日本語", short: "JP" },
  { code: "ko", flag: "🇰🇷", label: "한국어", short: "KR" },
  { code: "es", flag: "🇪🇸", label: "Español", short: "ES" },
  { code: "fr", flag: "🇫🇷", label: "Français", short: "FR" },
  { code: "de", flag: "🇩🇪", label: "Deutsch", short: "DE" },
  { code: "ru", flag: "🇷🇺", label: "Русский", short: "RU" },
  { code: "ar", flag: "🇸🇦", label: "العربية", short: "AR" },
  { code: "pt", flag: "🇧🇷", label: "Português", short: "PT" },
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt", short: "VI" },
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
      {/* Trigger button — flag + code, compact for mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg transition-all active:scale-95"
        style={{
          background: open ? "rgba(10,186,181,0.12)" : "rgba(255,255,255,0.05)",
          border: open ? "1px solid rgba(10,186,181,0.25)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span className="text-[15px] leading-none">{currentLang.flag}</span>
        <span className="text-[11px] font-semibold text-foreground/60 hidden sm:inline">{currentLang.short}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`text-foreground/30 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {/* Dropdown — mobile fullscreen bottom sheet, desktop dropdown */}
      {open && (
        <>
          {/* Mobile overlay */}
          <div className="lg:hidden fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Mobile bottom sheet */}
          <div className="lg:hidden fixed left-0 right-0 bottom-0 z-[100] animate-in slide-in-from-bottom duration-200">
            <div
              className="mx-auto max-w-lg rounded-t-2xl overflow-hidden"
              style={{
                background: "linear-gradient(180deg, #1a1d22 0%, #14161a 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "none",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
              }}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Title */}
              <div className="px-5 pb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-foreground/70">Language</span>
                <button onClick={() => setOpen(false)} className="text-xs text-foreground/30 hover:text-foreground/60 px-2 py-1">
                  Done
                </button>
              </div>

              {/* Language grid — 3 columns */}
              <div className="px-4 pb-6 grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => select(lang.code)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all active:scale-95"
                    style={{
                      background: lang.code === current
                        ? "rgba(10,186,181,0.12)"
                        : "rgba(255,255,255,0.03)",
                      border: lang.code === current
                        ? "1px solid rgba(10,186,181,0.3)"
                        : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: lang.code === current
                        ? "0 0 12px rgba(10,186,181,0.1)"
                        : "none",
                    }}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className={`text-[11px] font-semibold ${lang.code === current ? "text-primary" : "text-foreground/50"}`}>
                      {lang.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Safe area padding for iOS */}
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </div>

          {/* Desktop dropdown */}
          <div
            className="hidden lg:block absolute right-0 top-full mt-2 w-64 rounded-xl overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: "linear-gradient(180deg, #1a1d22 0%, #14161a 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[11px] font-semibold text-foreground/30 uppercase tracking-wider">Language</span>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => select(lang.code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${
                    lang.code === current
                      ? "bg-primary/8"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <div className="flex-1 text-left">
                    <span className={`text-[13px] font-medium ${lang.code === current ? "text-primary" : "text-foreground/70"}`}>
                      {lang.label}
                    </span>
                  </div>
                  {lang.code === current && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(10,186,181,0.2)" }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8 3" stroke="#0abab5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
