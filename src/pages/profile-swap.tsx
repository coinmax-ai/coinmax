import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

export default function ProfileSwapPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen pb-24" style={{ background: "#0a0a0a" }}>
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-center relative mb-4">
          <button
            onClick={() => navigate("/profile")}
            className="absolute left-0 w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/80" />
          </button>
          <h1 className="text-[17px] font-bold tracking-wide">{t("profile.swap")}</h1>
        </div>
      </div>

      <div className="px-4">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(74, 222, 128, 0.15)", background: "rgba(10, 15, 10, 0.6)" }}
        >
          <iframe
            src="https://thirdweb.com/bridge/widget?showThirdwebBranding=false"
            width="100%"
            height="750"
            style={{ border: 0, display: "block" }}
            title="Swap"
            allow="clipboard-write"
          />
        </div>
      </div>
    </div>
  );
}
