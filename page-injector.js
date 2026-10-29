// page-injector.js (main world)
// Patches window.fetch so we can tee SSE response streams from Claude.ai's
// chat completion endpoints and read the `message_limit` event without
// disturbing the page's own consumption of the stream.
//
// v1.2.6: fix the strip sticking below 100% after a real lockout. When the cap
//   is hit, the completion request returns an HTTP 429 (or 403) with a JSON
//   error body — not an SSE stream — so the SSE scanner never saw it and no
//   "reached" signal fired, leaving the strip at the polled ~98% utilization.
//   We now treat that error status as the authoritative lockout: read a clone
//   of the body (page keeps the original), pull a reset time from the body or
//   the Retry-After header, and emit reached=true so the session pins to 100%.
//   Also broadened the SSE "reached" hints (rate_limit / usage_limit / too_many).
//
// v1.3.6: when a reply stream ENDS, post { kind: "completion_done", uuid } so
//   the strip can re-measure that chat's size. The content script handles it
//   locally — it is not forwarded to background as a message_limit payload.
//
// v1.4.5: on claude.ai/code, also read the exact per-message token usage
//   (input / output / cache read / cache write) that Claude Code sessions
//   report, and post it as { kind: "code_usage", records }. See the block
//   above patchedFetch for how it finds and counts them.
//
// v1.4.6: also read usage from claude.ai's newer Connect-RPC transport
//   (ConversationService/StreamTimeline, binary protobuf). Accounts on it never
//   call /completion, so the meter saw no usage at all there. Decoded readings
//   are posted in the SSE `windows` shape, tagged with their org. Every
//   message_limit now also carries orgId (from the URL or x-organization-uuid).

(function () {
  if (window.__claudeUsageMeterInjected) return;
  window.__claudeUsageMeterInjected = true;

  const ORIGINAL_FETCH = window.fetch.bind(window);

  function postToContent(payload) {
    window.postMessage(
      { source: "claude-usage-meter", payload },
      window.location.origin
    );
  }

  // v1.2.9 FIX: claude.ai is a same-origin SPA and calls fetch() with a
  // RELATIVE path ("/api/organizations/<org>/chat_conversations/<id>/completion").
  // The old test required the literal "claude.ai/api/" in the string, so a
  // relative URL never matched and this injector never fired at all — no usage
  // from the stream, and only intermittent lockout detection. Normalise first,
  // and accept Request/URL objects as well as strings.
  function normalizeUrl(input) {
    try {
      let url =
        typeof input === "string" ? input :
        (typeof URL !== "undefined" && input instanceof URL) ? input.href :
        (input && typeof input.url === "string") ? input.url : "";
      if (!url) return "";
      if (url.startsWith("//")) return window.location.protocol + url;
      if (url.startsWith("/")) return window.location.origin + url;
      if (!/^https?:/i.test(url)) return new URL(url, window.location.href).href;
      return url;
    } catch (_) { return ""; }
  }

  function isCompletionUrl(url) {
    if (!url || typeof url !== "string") return false;
    return /claude\.ai\/api\/.*\/(completion|retry_completion)(\?|$)/.test(url);
  }

  // v1.4.6: the org a completion belongs to, from its URL. Background keys the
  // Free-plan stream snapshot by org, so a reading is never filed under (or
  // shown for) a different account than the one that produced it.
  function orgIdFrom(url) {
    const m = /\/api\/organizations\/([0-9a-f-]{36})\//i.exec(url || "");
    return m ? m[1] : null;
  }

  // Opt-in tracing: run  localStorage.cum_debug = "1"  on claude.ai and reload.
  // Silent otherwise, so this can ship.
  const DEBUG = (() => {
    try { return localStorage.getItem("cum_debug") === "1"; } catch (_) { return false; }
  })();
  function dlog() {
    if (!DEBUG) return;
    try { console.log("[CUM inject]", ...arguments); } catch (_) {}
  }

  // Recursively look through any parsed JSON object for fields that look like
  // a remaining-message count. Claude's SSE payloads embed message-limit info
  // in a few different shapes depending on the event type, so we scan loosely.
  const REMAINING_KEYS = [
    "remaining", "messages_remaining", "messages_left",
    "remainingMessages", "remaining_messages", "n_remaining"
  ];

  function findRemaining(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return null;
    for (const k of Object.keys(obj)) {
      if (REMAINING_KEYS.includes(k) && typeof obj[k] === "number") return obj[k];
      const v = obj[k];
      if (v && typeof v === "object") {
        const r = findRemaining(v, depth + 1);
        if (r != null) return r;
      }
    }
    return null;
  }

  function findResetAt(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return null;
    for (const k of Object.keys(obj)) {
      const lower = k.toLowerCase();
      if ((lower.includes("reset") || lower.includes("resetsat")) && typeof obj[k] === "string") {
        return obj[k];
      }
      const v = obj[k];
      if (v && typeof v === "object") {
        const r = findResetAt(v, depth + 1);
        if (r != null) return r;
      }
    }
    return null;
  }

  function looksLikeMessageLimit(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (obj.type && typeof obj.type === "string" &&
        obj.type.toLowerCase().includes("message_limit")) return true;
    if (obj.message_limit && typeof obj.message_limit === "object") return true;
    if (obj.event && typeof obj.event === "string" &&
        obj.event.toLowerCase().includes("limit")) return true;
    return false;
  }

  // Detect whether a message_limit payload signals the limit is actually
  // *reached* (hard lockout), as opposed to just reporting a remaining count.
  // Claude's lockout bar ("Usage limit reached") is driven by this event, not
  // by the /usage poll — which can still read ~0% for the fresh window at the
  // moment the cap is hit. Field names vary, so scan loosely for a status/type
  // string like "reached"/"exceeded"/"exhausted" or a truthy *_reached flag.
  const REACHED_HINTS = [
    "reached", "exceeded", "exhausted", "limit_hit", "out_of_messages",
    // v1.2.6: Claude's lockout error bodies phrase it differently depending on
    // plan/endpoint — free-tier session lockouts commonly surface as a
    // rate_limit_error / usage_limit_reached rather than the words above.
    "rate_limit", "usage_limit", "too_many"
  ];
  function detectReached(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return false;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const lk = k.toLowerCase();
      if (typeof v === "string") {
        const lv = v.toLowerCase();
        if ((lk.includes("type") || lk.includes("status") || lk.includes("event") || lk.includes("reason")) &&
            REACHED_HINTS.some((h) => lv.includes(h))) return true;
      }
      if (v === true && (lk.includes("reached") || lk.includes("exceeded") || lk.includes("exhausted"))) {
        return true;
      }
      if (v && typeof v === "object") {
        if (detectReached(v, depth + 1)) return true;
      }
    }
    return false;
  }

  // v1.2.9: the actual usage percentages. The message_limit event carries a
  // `windows` map that claude.ai keeps emitting on Free accounts even though
  // /usage reports nothing for them — so on Free this is the ONLY place usage
  // is ever reported.
  //
  //   windows: { "5h": { status, resets_at, utilization },
  //              "7d": { ... }, "7d_oi": { ... }, "overage": { ... } }
  //
  // Passed through RAW and converted in background.js. Two conventions differ
  // from /usage and getting either wrong is silently catastrophic:
  //   * utilization is a 0-1 FRACTION here (0.98 = 98%), not /usage's 0-100
  //     integer percent.
  //   * resets_at is unix SECONDS, not an ISO string.
  // `7d_oi` and `overage` are deliberately not forwarded: the former is scoped
  // to whichever model served the request and the stream never says which, and
  // the latter is extra-usage spend, which a Free account cannot have.
  function findWindows(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return null;
    const w = obj.windows;
    if (w && typeof w === "object" && (w["5h"] || w["7d"])) {
      const out = {};
      for (const key of ["5h", "7d"]) {
        const win = w[key];
        if (!win || typeof win !== "object") continue;
        if (typeof win.utilization !== "number") continue;
        out[key] = {
          utilization: win.utilization,
          resets_at: win.resets_at,
          status: typeof win.status === "string" ? win.status : null
        };
      }
      if (Object.keys(out).length) return out;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object") {
        const r = findWindows(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  function inspectJsonChunk(jsonStr, orgId) {
    try {
      const obj = JSON.parse(jsonStr);
      if (DEBUG && obj && obj.type) {
        if (String(obj.type).includes("limit")) dlog("SSE event:", obj.type, obj);
      }
      // Two cases worth emitting:
      // (a) The object explicitly references message_limit
      // (b) The object has a remaining-messages-shaped number somewhere
      const windows = findWindows(obj);
      if (looksLikeMessageLimit(obj) || findRemaining(obj) != null || windows) {
        const remaining = findRemaining(obj);
        const resetsAt = findResetAt(obj);
        const reached = detectReached(obj) || remaining === 0;
        if (remaining != null || resetsAt || reached || windows) {
          dlog("emitting message_limit:", { remaining, resetsAt, reached, windows });
          postToContent({
            kind: "message_limit",
            remaining,
            resetsAt: resetsAt || null,
            reached,
            windows,
            orgId: orgId || null,
            ts: Date.now()
          });
        }
      }
    } catch (_) { /* not JSON or partial */ }
  }

  // v1.3.6: /chat_conversations/<uuid>/completion -> <uuid>
  function conversationIdFrom(url) {
    const m = /\/chat_conversations\/([0-9a-f-]{36})\//i.exec(url || "");
    return m ? m[1] : null;
  }

  async function teeAndScanSSE(stream, convoId, orgId) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by a blank line.
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const eventBlock = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          // Concatenate all `data:` payload lines within the event.
          const dataLines = [];
          for (const rawLine of eventBlock.split("\n")) {
            if (rawLine.startsWith("data:")) {
              dataLines.push(rawLine.slice(5).replace(/^ /, ""));
            }
          }
          if (dataLines.length === 0) continue;
          inspectJsonChunk(dataLines.join("\n"), orgId);
        }
      }
    } catch (_) { /* stream cancelled or aborted — fine */ }
    // Stopped or finished, the branch changed either way.
    postToContent({ kind: "completion_done", uuid: convoId, ts: Date.now() });
  }

  // ===== v1.4.6: claude.ai's newer chat transport (Connect-RPC StreamTimeline) =====
  //
  // Some accounts no longer POST /completion at all. Messages go out through
  //   /claudeai-rpc/anthropic.bard.api.v1alpha.ConversationService/PerformAction
  // and the reply — including the message_limit usage report — streams back on
  //   /claudeai-rpc/anthropic.bard.api.v1alpha.ConversationService/StreamTimeline
  // which the page keeps open (and re-opens every few seconds while idle).
  // isCompletionUrl() never matches it, so on those accounts the meter never saw
  // a single usage report. On Free that meant no data, ever.
  //
  // Wire format (observed, not documented — re-verify if readings stop):
  //   body   = Connect frames: flags(1) | length(4, big-endian) | payload
  //            flags 0x01 = payload gzipped, 0x02 = end-of-stream trailer
  //   payload (protobuf) StreamTimelineResponse { 1: event }
  //            event       { 4: message_limit, ...other oneof members }
  //            MessageLimit { 1: status(enum), 2: resets_at(Timestamp),
  //                           13: windows map<string, Window> }
  //            Window      { 1: status(enum, 3 = EXCEEDED),
  //                          2: resets_at(Timestamp{1: seconds}),
  //                          3: utilization(double, 0-1 fraction) }
  // Window keys are the same "5h" / "7d" names the SSE stream uses, so the
  // decoded result is re-shaped into the SSE `windows` form and goes down the
  // exact same path to background (parseSseWindow etc.) — no second parser.
  //
  // Passive and detached: we read a clone, only the top two message levels of
  // each frame are walked (conversation updates are skipped as opaque bytes),
  // and any failure just means no reading. Kill switch for A/B testing:
  //   localStorage.cum_timeline_off = "1"
  const TIMELINE_RE = /\/claudeai-rpc\/[^?#]*ConversationService\/StreamTimeline(?:[?#]|$)/;
  const PB_STATUS_EXCEEDED = 3;
  const MAX_FRAME_BYTES = 16 * 1024 * 1024;   // larger frames are skipped, never buffered

  function isTimelineUrl(url) {
    return typeof url === "string" && TIMELINE_RE.test(url);
  }

  function timelineOff() {
    try { return localStorage.getItem("cum_timeline_off") === "1"; } catch (_) { return false; }
  }

  // Org id rides a request header on the RPC transport, not the URL.
  function requestHeader(input, init, name) {
    try {
      const h = (init && init.headers) || (input && typeof input === "object" && input.headers);
      if (!h) return null;
      return new Headers(h).get(name);
    } catch (_) { return null; }
  }

  // --- minimal protobuf reader: top-level fields of one message ---
  // Returns [{ no, wt, v }] where v is a Number (varint), a Uint8Array view
  // (length-delimited), or a Float64 (fixed64, read as double — the only
  // fixed64 we care about is `utilization`). Throws on malformed input.
  function pbFields(buf) {
    const out = [];
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let i = 0;
    const varint = () => {
      let result = 0, mul = 1, b;
      for (let n = 0; n < 10; n++) {
        if (i >= buf.length) throw new Error("pb: eof");
        b = buf[i++];
        result += (b & 0x7f) * mul;
        if (!(b & 0x80)) return result;
        mul *= 128;
      }
      throw new Error("pb: varint");
    };
    while (i < buf.length) {
      const key = varint();
      const no = Math.floor(key / 8), wt = key & 7;
      if (wt === 0) out.push({ no, wt, v: varint() });
      else if (wt === 1) {
        if (i + 8 > buf.length) throw new Error("pb: eof");
        out.push({ no, wt, v: dv.getFloat64(i, true) }); i += 8;
      } else if (wt === 2) {
        const len = varint();
        if (i + len > buf.length) throw new Error("pb: eof");
        out.push({ no, wt, v: buf.subarray(i, i + len) }); i += len;
      } else if (wt === 5) {
        if (i + 4 > buf.length) throw new Error("pb: eof");
        i += 4;
      } else throw new Error("pb: wiretype " + wt);
    }
    return out;
  }
  const pbFirst = (fields, no, wt) => {
    for (const f of fields) if (f.no === no && f.wt === wt) return f.v;
    return undefined;
  };

  function pbTimestampSeconds(bytes) {
    if (!bytes) return null;
    const s = pbFirst(pbFields(bytes), 1, 0);
    return typeof s === "number" && s > 0 ? s : null;
  }

  // MessageLimit bytes -> the SSE-shaped payload background already understands.
  function decodeMessageLimit(bytes) {
    const ml = pbFields(bytes);
    const windows = {};
    let any = false;
    for (const f of ml) {
      if (f.no !== 13 || f.wt !== 2) continue;       // map entry
      const entry = pbFields(f.v);
      const keyBytes = pbFirst(entry, 1, 2);
      const val = pbFirst(entry, 2, 2);
      if (!keyBytes || !val) continue;
      const key = new TextDecoder().decode(keyBytes);
      const w = pbFields(val);
      const utilization = pbFirst(w, 3, 1);
      const resetsAt = pbTimestampSeconds(pbFirst(w, 2, 2));
      if (typeof utilization !== "number" || !isFinite(utilization) || !resetsAt) continue;
      windows[key] = {
        status: pbFirst(w, 1, 0) === PB_STATUS_EXCEEDED ? "exceeded_limit" : "within_limit",
        resets_at: resetsAt,
        utilization
      };
      any = true;
    }
    if (!any) return null;
    const reached = pbFirst(ml, 1, 0) === PB_STATUS_EXCEEDED;
    const topReset = pbTimestampSeconds(pbFirst(ml, 2, 2));
    return {
      kind: "message_limit",
      reached,
      resetsAt: reached && topReset ? new Date(topReset * 1000).toISOString() : null,
      windows
    };
  }

  // One frame's payload (already inflated) -> message_limit payload or null.
  function messageLimitFromProtoFrame(payload) {
    const event = pbFirst(pbFields(payload), 1, 2);          // StreamTimelineResponse.event
    if (!event) return null;
    const ml = pbFirst(pbFields(event), 4, 2);               // event.message_limit
    return ml ? decodeMessageLimit(ml) : null;
  }

  // Same thing for a connect+json stream, should claude.ai ever switch codecs.
  function messageLimitFromJsonFrame(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (_) { return null; }
    const ml = obj && obj.event && (obj.event.message_limit || obj.event.messageLimit);
    if (!ml || !ml.windows) return null;
    const secs = (v) => {
      if (v == null) return null;
      if (typeof v === "object" && v.seconds != null) return Number(v.seconds);
      const t = Date.parse(v);
      return isNaN(t) ? null : t / 1000;
    };
    const exceeded = (s) => s === 3 || /EXCEEDED/i.test(String(s || ""));
    const windows = {};
    let any = false;
    for (const [key, w] of Object.entries(ml.windows)) {
      const r = secs(w && (w.resets_at || w.resetsAt));
      if (!w || typeof w.utilization !== "number" || !r) continue;
      windows[key] = { status: exceeded(w.status) ? "exceeded_limit" : "within_limit", resets_at: r, utilization: w.utilization };
      any = true;
    }
    if (!any) return null;
    const reached = exceeded(ml.status);
    const top = secs(ml.resets_at || ml.resetsAt);
    return { kind: "message_limit", reached, resetsAt: reached && top ? new Date(top * 1000).toISOString() : null, windows };
  }

  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // The stream re-opens every few seconds and may replay the last report;
  // identical readings inside this window are posted once.
  let lastTimelineSig = null, lastTimelineAt = 0;

  async function scanTimeline(response, orgId) {
    if (!response || !response.body) return;
    const json = /json/i.test((response.headers && response.headers.get("content-type")) || "");
    const reader = response.body.getReader();
    let buf = new Uint8Array(0);
    let skip = 0;                       // bytes left of an oversized frame we're discarding
    const append = (chunk) => {
      const next = new Uint8Array(buf.length + chunk.length);
      next.set(buf, 0); next.set(chunk, buf.length);
      buf = next;
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = value;
        if (skip) {
          const n = Math.min(skip, chunk.length);
          skip -= n; chunk = chunk.subarray(n);
          if (!chunk.length) continue;
        }
        append(chunk);
        while (buf.length >= 5) {
          const flags = buf[0];
          const len = ((buf[1] << 24) >>> 0) + (buf[2] << 16) + (buf[3] << 8) + buf[4];
          if (len > MAX_FRAME_BYTES) {
            const have = buf.length - 5;
            skip = Math.max(0, len - have);
            buf = buf.subarray(Math.min(buf.length, 5 + len));
            continue;
          }
          if (buf.length < 5 + len) break;
          let payload = buf.slice(5, 5 + len);
          buf = buf.subarray(5 + len);
          if (flags & 0x02) continue;   // end-of-stream trailer (JSON), no usage in it
          try {
            if (flags & 0x01) payload = await gunzip(payload);
            const ml = json
              ? messageLimitFromJsonFrame(new TextDecoder().decode(payload))
              : messageLimitFromProtoFrame(payload);
            if (!ml) continue;
            ml.orgId = orgId || null;
            ml.ts = Date.now();
            const sig = JSON.stringify([ml.orgId, ml.reached, ml.windows]);
            if (sig === lastTimelineSig && ml.ts - lastTimelineAt < 60 * 1000) continue;
            lastTimelineSig = sig; lastTimelineAt = ml.ts;
            dlog("timeline message_limit:", ml);
            postToContent(ml);
          } catch (e) {
            dlog("timeline frame skipped:", e && e.message);
          }
        }
      }
    } catch (_) { /* stream closed/aborted by the page — normal */ }
  }

  // ===== v1.4.5: Claude Code session tokens (claude.ai/code) =====
  //
  // Claude Code reports exact per-message token counts — the Anthropic API's
  // `usage` block: input_tokens, output_tokens, cache_read_input_tokens,
  // cache_creation_input_tokens — and claude.ai/code's web UI receives those
  // messages to draw the transcript. Unlike claude.ai chat, nothing here has to
  // be estimated: we only have to SEE the messages.
  //
  // Which transport carries them (REST history, SSE, NDJSON, WebSocket) is not
  // documented and can change, so we don't bind to an endpoint. On /code pages
  // every same-site JSON/stream payload is scanned for the SHAPE of a message
  // with usage, the same strategy as findWindows() above. Passive only: the
  // page always gets the original response (clone/tee), sockets get an extra
  // listener, nothing is ever sent.
  //
  // Counting rules (the totals are only worth showing if they're exact):
  //   * one entry per message id, fields merged by MAX — the same assistant
  //     message arrives several times (one event per content block, streaming
  //     deltas, history reload, our own persisted copy) and must count once.
  //   * `message_delta` events carry usage with no id; they belong to the
  //     message_start that opened that stream.
  //   * `type: "result"` objects are turn TOTALS of messages we already
  //     counted — skipped, or every turn would count twice.
  //   * subagent (sidechain) messages carry their own ids and are real spend
  //     in the same session, so they count.
  function isCodePage() {
    return /^\/code(\/|$)/.test(window.location.pathname || "");
  }
  function codeSessionFrom(str) {
    const m = /(session_[A-Za-z0-9]{8,})/.exec(str || "");
    return m ? m[1] : null;
  }
  function pageCodeSession() {
    return codeSessionFrom(window.location.pathname);
  }

  function readUsage(u) {
    if (!u || typeof u !== "object") return null;
    const n = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
    const has = ["input_tokens", "output_tokens",
                 "cache_read_input_tokens", "cache_creation_input_tokens"]
      .some((k) => typeof u[k] === "number");
    if (!has) return null;
    return {
      in: n(u.input_tokens),
      out: n(u.output_tokens),
      cr: n(u.cache_read_input_tokens),
      cw: n(u.cache_creation_input_tokens)
    };
  }

  let codePending = [];
  let codeFlushTimer = 0;
  function queueCodeRecord(rec) {
    codePending.push(rec);
    if (codeFlushTimer) return;
    codeFlushTimer = setTimeout(() => {
      codeFlushTimer = 0;
      const records = codePending;
      codePending = [];
      if (records.length) {
        dlog("code usage:", records.length, "record(s)", records);
        postToContent({ kind: "code_usage", records, ts: Date.now() });
      }
    }, 250);
  }

  // ctx: { sid, lastMsgId } — lastMsgId is per stream, so a message_delta is
  // tied to the message_start of the SAME stream, never another socket's.
  function scanForUsage(obj, ctx, depth) {
    if (!obj || typeof obj !== "object" || depth > 10) return;
    if (Array.isArray(obj)) {
      for (const item of obj) scanForUsage(item, ctx, depth + 1);
      return;
    }
    const type = typeof obj.type === "string" ? obj.type : "";
    if (type === "result") return;
    const sid =
      (typeof obj.session_id === "string" && codeSessionFrom(obj.session_id)) ||
      (typeof obj.sessionId === "string" && codeSessionFrom(obj.sessionId)) ||
      ctx.sid;
    const local = sid === ctx.sid ? ctx : { ...ctx, sid };

    const usage = readUsage(obj.usage);
    if (usage) {
      let id = typeof obj.id === "string" && /^msg_/.test(obj.id) ? obj.id : null;
      if (id && type !== "message_delta") ctx.lastMsgId = id;
      if (!id && type === "message_delta") id = ctx.lastMsgId;
      if (id && local.sid) {
        queueCodeRecord({ id, sid: local.sid, ...usage });
      }
    }
    for (const k of Object.keys(obj)) {
      if (k === "usage") continue;
      const v = obj[k];
      if (v && typeof v === "object") scanForUsage(v, local, depth + 1);
    }
  }

  // A payload may be one JSON document, NDJSON, or SSE `data:` lines.
  function scanText(text, ctx) {
    if (!text || text.length < 20 || text.indexOf("_tokens") === -1) return;
    try { scanForUsage(JSON.parse(text), ctx, 0); return; } catch (_) {}
    for (let line of text.split("\n")) {
      line = line.trim();
      if (line.startsWith("data:")) line = line.slice(5).trim();
      if (!line || (line[0] !== "{" && line[0] !== "[")) continue;
      if (line.indexOf("_tokens") === -1 && line.indexOf("msg_") === -1) continue;
      try { scanForUsage(JSON.parse(line), ctx, 0); } catch (_) {}
    }
  }

  function codeCtxFor(url) {
    return { sid: codeSessionFrom(url) || pageCodeSession(), lastMsgId: null };
  }

  function sameSite(url) {
    return /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com)\//i.test(url || "");
  }

  async function scanStreamForUsage(stream, ctx) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          scanText(line, ctx);
        }
        if (buffer.length > 4e6) buffer = "";   // never hoard a runaway line
      }
      scanText(buffer, ctx);
    } catch (_) { /* aborted — fine */ }
  }

  // Returns the response the page should get (the original, or a tee'd copy).
  function inspectCodeResponse(url, response) {
    try {
      if (!isCodePage() || !sameSite(url) || isCompletionUrl(url)) return response;
      if (!response || !response.ok) return response;
      const ct = (response.headers && response.headers.get("content-type")) || "";
      const ctx = codeCtxFor(url);
      if (/event-stream|ndjson|x-ndjson|jsonl/i.test(ct) && response.body) {
        dlog("code: scanning stream", url, ct);
        const [forPage, forScan] = response.body.tee();
        scanStreamForUsage(forScan, ctx);
        const wrapped = new Response(forPage, {
          status: response.status, statusText: response.statusText, headers: response.headers
        });
        try { Object.defineProperty(wrapped, "url", { value: response.url }); } catch (_) {}
        return wrapped;
      }
      if (/json/i.test(ct)) {
        response.clone().text().then((t) => scanText(t, ctx)).catch(() => {});
      }
    } catch (_) {}
    return response;
  }

  // WebSocket / EventSource: an extra passive listener on each new instance.
  function watchSocketLike(Orig, name) {
    if (typeof Orig !== "function") return;
    const Patched = function (url, opts) {
      const inst = opts === undefined ? new Orig(url) : new Orig(url, opts);
      try {
        const href = normalizeUrl(String(url).replace(/^ws/i, "http"));
        if (sameSite(href)) {
          const ctx = codeCtxFor(String(url));
          dlog("code: watching", name, String(url));
          inst.addEventListener("message", (ev) => {
            if (!isCodePage()) return;
            const d = ev && ev.data;
            if (typeof d === "string") {
              // The page may move between sessions on one long-lived socket.
              if (!codeSessionFrom(String(url))) ctx.sid = pageCodeSession();
              scanText(d, ctx);
            }
          });
        }
      } catch (_) {}
      return inst;
    };
    Patched.prototype = Orig.prototype;
    for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      if (k in Orig) try { Object.defineProperty(Patched, k, { value: Orig[k] }); } catch (_) {}
    }
    try { window[name] = Patched; } catch (_) {}
  }
  watchSocketLike(window.WebSocket, "WebSocket");
  watchSocketLike(window.EventSource, "EventSource");

  // XHR: some clients still poll history this way.
  try {
    const OrigOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        const href = normalizeUrl(url);
        if (isCodePage() && sameSite(href)) {
          this.addEventListener("load", () => {
            try {
              const ct = this.getResponseHeader("content-type") || "";
              if (/json|event-stream|ndjson/i.test(ct) &&
                  (this.responseType === "" || this.responseType === "text")) {
                scanText(this.responseText, codeCtxFor(href));
              }
            } catch (_) {}
          });
        }
      } catch (_) {}
      return OrigOpen.apply(this, arguments);
    };
  } catch (_) {}

  window.fetch = async function patchedFetch(input, init) {
    let response = await ORIGINAL_FETCH(input, init);
    try {
      const url = normalizeUrl(input);
      // v1.4.6: newer transport. Read a clone, hand the page its original.
      if (isTimelineUrl(url) && sameSite(url) && response.ok && !timelineOff()) {
        dlog("timeline stream matched:", url);
        scanTimeline(response.clone(), requestHeader(input, init, "x-organization-uuid")).catch(() => {});
        return response;
      }
      if (!isCompletionUrl(url)) {
        // v1.4.5: claude.ai/code traffic (no-op everywhere else).
        return isCodePage() ? inspectCodeResponse(url, response) : response;
      }
      dlog("completion request matched:", url, "status", response.status,
           "content-type", response.headers && response.headers.get("content-type"));

      // v1.2.6: hard-lockout via HTTP status. When the session/weekly cap is
      // hit, the completion request comes back as an ERROR (429 Too Many
      // Requests, occasionally 403) carrying a JSON body — NOT an SSE stream.
      // The scanner below only understands SSE, so this response would slip
      // through, and the polled /usage utilization can sit at ~98% at this exact
      // moment — which is why the strip could stick below 100% after a real
      // lockout. Treat this status as the authoritative "maxed out" signal.
      // We read a *clone* so the page still consumes the untouched original.
      if (response.status === 429 || response.status === 403) {
        try {
          const text = await response.clone().text();
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (_) {}
          // 429 is unconditionally rate/limit related. Only treat 403 as a
          // lockout when the body actually references a limit, so we don't
          // misread generic auth/permission errors as "you're maxed out".
          const limitish = response.status === 429 ||
            /limit|exceed|exhaust|quota|too\s*many/i.test(text || "");
          if (limitish) {
            // Reset time: prefer an explicit timestamp in the body; otherwise
            // fall back to the standard Retry-After header (seconds from now).
            let resetsAt = (parsed && findResetAt(parsed)) || null;
            if (!resetsAt) {
              const ra = response.headers && response.headers.get("retry-after");
              const secs = ra != null ? parseInt(ra, 10) : NaN;
              if (!isNaN(secs) && secs > 0) {
                resetsAt = new Date(Date.now() + secs * 1000).toISOString();
              }
            }
            // v1.2.9: a refused send answers with JSON rather than a stream,
            // and buries the same message_limit payload one level deeper AND
            // double-encoded: { error: { message: "<JSON string>" } }. On Free
            // this is the LAST usage report of the window — claude.ai then
            // blocks the composer and issues no further requests — so losing it
            // means the meter sits below the cap until the window rolls over.
            let windows = findWindows(parsed);
            if (!windows) {
              try {
                const inner = parsed && parsed.error && parsed.error.message;
                const decoded = typeof inner === "string" ? JSON.parse(inner) : inner;
                windows = findWindows(decoded);
                if (!resetsAt && decoded) resetsAt = findResetAt(decoded);
              } catch (_) { /* not the nested shape — carry on */ }
            }
            postToContent({
              kind: "message_limit",
              remaining: 0,
              resetsAt: resetsAt || null,
              reached: true,
              windows,
              orgId: orgIdFrom(url),
              ts: Date.now()
            });
          }
        } catch (_) { /* body not readable — ignore, page is unaffected */ }
        return response;
      }

      if (!response.body) return response;

      // Tee the body so the page gets one branch and we scan the other.
      const [forPage, forScan] = response.body.tee();
      teeAndScanSSE(forScan, conversationIdFrom(url), orgIdFrom(url));

      // Re-wrap with the page-bound stream. Preserve all other response metadata.
      const wrapped = new Response(forPage, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      // Preserve URL field where possible
      try { Object.defineProperty(wrapped, "url", { value: response.url }); } catch (_) {}
      return wrapped;
    } catch (e) {
      // Never let interception break the page.
      return response;
    }
  };
})();
