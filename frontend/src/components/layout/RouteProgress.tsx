"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function isModifiedEvent(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button !== 0;
}

export default function RouteProgress() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const startTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  // Begin progress after a short delay to avoid flashing on fast navigations
  const start = () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
    startTimerRef.current = window.setTimeout(() => {
      setVisible(true);
      setWidth(0);
      // allow mount paint
      requestAnimationFrame(() => setWidth(60));
    }, 180);
  };

  const stop = () => {
    if (startTimerRef.current) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    if (!inFlightRef.current) return;
    // Finish bar and then hide
    setWidth(100);
    window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
      inFlightRef.current = false;
    }, 200);
  };

  // Detect internal link clicks to start progress immediately
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isModifiedEvent(e)) return;
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el instanceof HTMLAnchorElement) {
          const a = el as HTMLAnchorElement;
          const url = a.getAttribute("href") || "";
          if (!url || url.startsWith("#") || a.target === "_blank") return;
          const sameOrigin = a.host === window.location.host;
          const isInternal = sameOrigin && url.startsWith("/");
          if (isInternal) {
            start();
          }
          return;
        }
        el = el.parentElement;
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Stop when the pathname changes (new route committed)
  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      stop();
    }
    prevPathRef.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: 2,
        width: visible ? `${width}%` : 0,
        transition: visible ? "width 200ms ease-out, opacity 200ms" : "none",
        opacity: visible ? 1 : 0,
        background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );
}

