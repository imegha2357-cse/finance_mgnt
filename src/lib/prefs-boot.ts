/** Server-safe: the preference keys and the inline script that applies them before first paint. */
export const PREF_KEYS = { theme: "ledgerly-theme", density: "ledgerly-density" } as const;

export const PREFS_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${PREF_KEYS.theme}")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var h=document.documentElement;h.classList.toggle("dark",d);h.dataset.density=localStorage.getItem("${PREF_KEYS.density}")||"comfortable";}catch(e){}})()`;
