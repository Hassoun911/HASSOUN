"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const appPath = (path: string) => `${BASE_PATH}${path}`;
const TV_MODE_KEY = "hassoun-web-masjid-tv-mode-v4";
const OLD_KEYS = ["hassoun-web-masjid-tv-mode","hassoun-web-masjid-tv-mode-v2","hassoun-web-masjid-tv-mode-v3"];

export default function WebMasjidTvMenuEnhancer() {
  const pathname = usePathname();
  useEffect(() => {
    const localPath = BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) || "/" : pathname;
    const tvHref = appPath("/masjid-tv/?mode=tv&activate=1");
    const tabletHref = appPath("/masjid-tv/?mode=tablet");
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");

    // Retire legacy automatic TV mode. A user must explicitly select a display route.
    try {
      [...OLD_KEYS, TV_MODE_KEY].forEach(key => window.localStorage.removeItem(key));
    } catch {}

    if (localPath.startsWith("/masjid-tv")) {
      if (params.has("activate")) {
        params.delete("activate");
        const cleanQuery = params.toString();
        window.history.replaceState({}, "", `${appPath("/masjid-tv/")}${cleanQuery ? `?${cleanQuery}` : ""}`);
      }
      return;
    }

    const enterMode = async (href: string) => {
      try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch {}
      window.location.href = href;
    };

    const makeEntry = (kind: "tv"|"tablet") => {
      const a = document.createElement("a");
      const tablet = kind === "tablet";
      a.href = tablet ? tabletHref : tvHref;
      a.dataset.hassounDisplayModeLink = kind;
      a.setAttribute("aria-label", tablet ? "Open Tablet Wall Display Mode" : "Open TV Display Mode");
      a.innerHTML = tablet
        ? '<span aria-hidden="true" style="font-size:22px">▯</span><span><strong style="display:block;font-size:14px">Tablet Wall Display</strong><small style="display:block;margin-top:3px;color:#71827c;font-size:11px">Vertical rotating prayer cards for tablets and iPads</small></span><span aria-hidden="true" style="margin-left:auto;font-size:20px">›</span>'
        : '<span aria-hidden="true" style="font-size:22px">▣</span><span><strong style="display:block;font-size:14px">TV Display Mode</strong><small style="display:block;margin-top:3px;color:#71827c;font-size:11px">Landscape Masjid display for TVs and large screens</small></span><span aria-hidden="true" style="margin-left:auto;font-size:20px">›</span>';
      Object.assign(a.style,{display:"flex",alignItems:"center",gap:"12px",margin:"10px 0 0",padding:"15px 16px",border:"1px solid #c8d8d0",borderRadius:"15px",background:tablet?"#f2f7f5":"#edf5f1",color:"#17362e",textDecoration:"none",boxShadow:"0 8px 24px rgba(11,91,71,.08)"});
      a.addEventListener("click", e => { e.preventDefault(); void enterMode(tablet ? tabletHref : tvHref); });
      return a;
    };

    const addLinks = (container: Element) => {
      if (!container.querySelector('[data-hassoun-display-mode-link="tablet"]')) container.appendChild(makeEntry("tablet"));
      if (!container.querySelector('[data-hassoun-display-mode-link="tv"]')) container.appendChild(makeEntry("tv"));
    };
    const cleanup = () => document.querySelectorAll('[data-hassoun-display-mode-link]').forEach(el => el.remove());
    const enhance = () => {
      const candidates = Array.from(document.querySelectorAll(".sheet-panel, aside, [role=dialog], [class*=drawer], [class*=sidebar], [class*=menu-panel], [class*=slide-menu]"));
      candidates.forEach(el => {
        const value=(el.textContent||"").toLowerCase();
        if(value.includes("setting")||value.includes("qur")||value.includes("install")||value.includes("alert")||value.includes("menu")) addLinks(el);
      });
    };
    enhance();
    const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();cleanup()};
  },[pathname]);
  return null;
}
