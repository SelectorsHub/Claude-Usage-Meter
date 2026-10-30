// i18n.js — Claude Usage Meter translations runtime (v1.5.5)
//
// Loaded after the i18n/strings/*.js files in every context: content script
// (manifest), popup and options (<script>), background (importScripts). Each
// strings file adds one language to globalThis.CUM_STRINGS.
//
// Which language:
//   1. settings.language, when the user picked one (anything but "auto");
//   2. otherwise Claude's own interface language: the <html lang> of claude.ai.
//      The content script reads it and stores it as CLAUDE_LANG_KEY, so the
//      popup, options page and background follow the same language even when
//      no claude.ai tab is focused;
//   3. otherwise the browser language;
//   4. English.
//
// API (globalThis.CUM_I18N):
//   t(key, vars)      plain text; {name} placeholders filled from vars
//   th(key, vars)     same, HTML-escaped (text and vars), for innerHTML/attrs
//   tp(key, n, vars)  plural: key_one / key_other … chosen by Intl.PluralRules;
//                     {n} is available to the string
//   lang()            current language code ("en", "ja", "pt-BR", "es-419" …)
//   locale()          BCP-47 tag for Intl / toLocale*String()
//   dur(mins)         compact duration ("1h 20m" / "1時間20分")
//   ready()           Promise: language resolved from storage (popup/options/bg)
//   setPageLang(tag)  content script: Claude's <html lang>
//   setPref(code)     apply a settings.language value
//   onChange(fn)      called after the language changes
//   applyDom(root)    translate data-i18n* attributes in static HTML
//   LANGS             [{code, name}] for the language picker
(function (g) {
  "use strict";
  const STRINGS = (g.CUM_STRINGS = g.CUM_STRINGS || {});
  const CLAUDE_LANG_KEY = "claude_ui_lang";

  // Languages we ship (Claude.ai offers these and more). `name` is each language's
  // own name, shown as-is in the picker.
  const LANGS = [
    { code: "en", name: "English" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "hi", name: "हिन्दी" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "it", name: "Italiano" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "es-419", name: "Español (Latinoamérica)" },
    { code: "es-ES", name: "Español (España)" },
    { code: "zh-CN", name: "简体中文" },
    { code: "zh-TW", name: "繁體中文" }
  ];
  const CODES = new Set(LANGS.map((l) => l.code));

  // Any BCP-47 tag -> one of our codes, or null.
  function match(tag) {
    if (!tag || typeof tag !== "string") return null;
    const t = tag.trim().replace(/_/g, "-");
    if (!t) return null;
    if (CODES.has(t)) return t;
    const parts = t.toLowerCase().split("-");
    const base = parts[0];
    const region = parts[1] || "";
    if (base === "pt") return "pt-BR";
    // Chinese: Traditional for zh-Hant / Taiwan / Hong Kong / Macau, else Simplified.
    if (base === "zh") return /^(hant|tw|hk|mo)$/.test(region) || parts.includes("hant") ? "zh-TW" : "zh-CN";
    if (base === "es") return region === "es" || region === "" ? "es-ES" : "es-419";
    for (const c of CODES) if (c.toLowerCase() === base) return c;
    return null;
  }

  let pref = "auto";
  let pageLang = null;     // claude.ai <html lang> (content script) or stored copy
  let current = "en";
  const listeners = [];

  function browserLangs() {
    try {
      const nav = g.navigator;
      if (nav && Array.isArray(nav.languages) && nav.languages.length) return nav.languages;
      if (nav && nav.language) return [nav.language];
    } catch (_) {}
    return [];
  }

  function resolve() {
    if (pref && pref !== "auto" && CODES.has(pref)) return pref;
    const fromPage = match(pageLang);
    if (fromPage) return fromPage;
    for (const l of browserLangs()) { const m = match(l); if (m) return m; }
    return "en";
  }

  function update() {
    const next = resolve();
    if (next === current) return false;
    current = next;
    pluralRules = null;
    for (const fn of listeners.slice()) { try { fn(current); } catch (_) {} }
    return true;
  }

  function lookup(key) {
    const own = STRINGS[current];
    if (own && Object.prototype.hasOwnProperty.call(own, key)) return own[key];
    const en = STRINGS.en;
    if (en && Object.prototype.hasOwnProperty.call(en, key)) return en[key];
    return key;
  }

  function fill(s, vars, escape) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, (m, name) => {
      if (!Object.prototype.hasOwnProperty.call(vars, name)) return m;
      const v = vars[name] == null ? "" : String(vars[name]);
      return escape ? esc(v) : v;
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function t(key, vars) { return fill(lookup(key), vars, false); }
  function th(key, vars) { return fill(esc(lookup(key)), vars, true); }

  let pluralRules = null;
  function category(n) {
    try {
      if (!pluralRules) pluralRules = new Intl.PluralRules(current);
      return pluralRules.select(Number(n));
    } catch (_) { return Number(n) === 1 ? "one" : "other"; }
  }
  function pluralKey(key, n) {
    const cat = category(n);
    const own = STRINGS[current] || {};
    if (Object.prototype.hasOwnProperty.call(own, key + "_" + cat)) return key + "_" + cat;
    if (Object.prototype.hasOwnProperty.call(own, key + "_other")) return key + "_other";
    const en = STRINGS.en || {};
    const enCat = Number(n) === 1 ? "one" : "other";
    if (Object.prototype.hasOwnProperty.call(en, key + "_" + enCat)) return key + "_" + enCat;
    return key + "_other";
  }
  function tp(key, n, vars) { return t(pluralKey(key, n), { n, ...(vars || {}) }); }

  function locale() { return current; }

  // Compact duration from minutes: "45m", "1h 20m", "3d". Units come from the
  // strings so each language can write them its own way.
  function dur(mins) {
    mins = Math.max(0, Math.round(Number(mins) || 0));
    if (mins < 60) return t("unit.m", { n: mins });
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 48) return m ? t("unit.hm", { h, m }) : t("unit.h", { n: h });
    return t("unit.d", { n: Math.floor(h / 24) });
  }

  function setPref(p) { pref = p && CODES.has(p) ? p : "auto"; return update(); }
  function setPageLang(tag) {
    pageLang = tag || null;
    const changed = update();
    // Remember Claude's language for the popup / options / background.
    try {
      if (tag && g.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(CLAUDE_LANG_KEY, (r) => {
          void (chrome.runtime && chrome.runtime.lastError);
          if (!r || r[CLAUDE_LANG_KEY] !== tag) chrome.storage.local.set({ [CLAUDE_LANG_KEY]: tag });
        });
      }
    } catch (_) {}
    return changed;
  }

  let readyP = null;
  function ready() {
    if (readyP) return readyP;
    readyP = new Promise((resolveP) => {
      try {
        chrome.storage.local.get(["settings", CLAUDE_LANG_KEY], (r) => {
          void (chrome.runtime && chrome.runtime.lastError);
          r = r || {};
          pref = (r.settings && r.settings.language) || "auto";
          if (!CODES.has(pref)) pref = "auto";
          if (pageLang == null && r[CLAUDE_LANG_KEY]) pageLang = r[CLAUDE_LANG_KEY];
          update();
          resolveP(current);
        });
      } catch (_) { update(); resolveP(current); }
    });
    return readyP;
  }

  // Keep every context in step when the setting or Claude's language changes.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let touched = false;
      if (changes.settings) {
        const nv = changes.settings.newValue || {};
        const p = CODES.has(nv.language) ? nv.language : "auto";
        if (p !== pref) { pref = p; touched = true; }
      }
      // Only contexts without a page of their own take Claude's language from
      // storage; a claude.ai tab reads its own <html lang>.
      if (changes[CLAUDE_LANG_KEY] && !isClaudePage()) {
        pageLang = changes[CLAUDE_LANG_KEY].newValue || null;
        touched = true;
      }
      if (touched) update();
    });
  } catch (_) {}

  function isClaudePage() {
    try { return !!(g.location && /(^|\.)claude\.ai$/.test(g.location.hostname)); } catch (_) { return false; }
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  // Static HTML: <span data-i18n="key">English</span>; also data-i18n-html,
  // -title, -aria (aria-label), -placeholder. The English text stays in the
  // HTML as the first paint and as a fallback.
  function applyDom(root) {
    root = root || (g.document && g.document);
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.getAttribute("data-i18n-title")); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"))); });
    try { if (root.documentElement) root.documentElement.lang = current; } catch (_) {}
  }

  update();
  g.CUM_I18N = {
    t, th, tp, esc, dur, lang: () => current, locale, ready, setPref, setPageLang,
    onChange, applyDom, match, LANGS, CLAUDE_LANG_KEY,
    pref: () => pref, detected: () => {
      const p = match(pageLang); if (p) return p;
      for (const l of browserLangs()) { const m = match(l); if (m) return m; }
      return "en";
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
