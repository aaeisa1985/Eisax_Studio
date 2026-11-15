"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the PWA Service Worker cleanly in background for standalone fullscreen installability. */
export function PwaRegistry() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration error in restricted environments
    });
  }, []);

  return null;
}

/** Displays a crisp Install App button when Chromium fires `beforeinstallprompt` outside standalone mode. */
export function PwaInstallButton({ locale = "en" }: { locale?: "en" | "ar" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const ar = locale === "ar";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
      onClick={async () => {
        try {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        } catch {
          setDeferred(null);
        }
      }}
      title={ar ? "تثبيت EISAX Studio كتطبيق ملء الشاشة" : "Install EISAX Studio as full-screen app"}
    >
      📲 {ar ? "تثبيت التطبيق" : "Install App"}
    </button>
  );
}

/** Toggles true browser Fullscreen API + distraction-free workspace view. */
export function FullscreenButton({
  locale = "en",
  onFullscreenChange,
}: {
  locale?: "en" | "ar";
  onFullscreenChange?: (isFull: boolean) => void;
}) {
  const [isFull, setIsFull] = useState(false);
  const ar = locale === "ar";

  useEffect(() => {
    const onChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFull(fs);
      onFullscreenChange?.(fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [onFullscreenChange]);

  async function toggle() {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else {
          const next = !isFull;
          setIsFull(next);
          onFullscreenChange?.(next);
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      const next = !isFull;
      setIsFull(next);
      onFullscreenChange?.(next);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={`btn !px-2.5 !py-1.5 text-xs ${isFull ? "btn-primary" : "btn-ghost"}`}
      title={isFull ? (ar ? "إنهاء ملء الشاشة" : "Exit fullscreen") : ar ? "ملء الشاشة" : "Fullscreen"}
      aria-label={ar ? "ملء الشاشة" : "Toggle fullscreen"}
      data-testid="fullscreen-toggle"
    >
      {isFull ? "🗗" : "⛶"}{" "}
      <span className="hidden md:inline">
        {isFull ? (ar ? "إنهاء" : "Exit Fullscreen") : ar ? "ملء الشاشة" : "Fullscreen"}
      </span>
    </button>
  );
}
