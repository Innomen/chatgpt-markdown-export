(() => {
  const roles = new Set(["user", "assistant"]);
  const escapeText = (s) => s.replace(/\\/g, "\\\\").replace(/([*_`\[\]<>])/g, "\\$1");
  const clean = (s) => (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  const safeUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href.replace(/\)/g, "%29") : "";
    } catch { return ""; }
  };
  const ignored = (el) => el.matches("button,svg,script,style,[aria-hidden='true'],[hidden],.sr-only,[data-testid*='copy']");
  function inline(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE || ignored(node)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "img") {
      const src = safeUrl(node.getAttribute("src"));
      return src ? `![${escapeText(node.getAttribute("alt") || "image")}](${src})` : "";
    }
    if (tag === "code") return `\`${node.textContent.replace(/`/g, "\\`")}\``;
    if (tag === "a") {
      const label = [...node.childNodes].map(inline).join("").trim();
      const url = safeUrl(node.getAttribute("href"));
      return url ? `[${label || url}](${url})` : label;
    }
    const inner = [...node.childNodes].map(inline).join("");
    if (["strong", "b"].includes(tag)) return `**${inner}**`;
    if (["em", "i"].includes(tag)) return `*${inner}*`;
    if (tag === "s" || tag === "del") return `~~${inner}~~`;
    return inner;
  }
  function block(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return clean(node.nodeValue) ? escapeText(node.nodeValue) : "";
    if (node.nodeType !== Node.ELEMENT_NODE || ignored(node)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "pre") {
      const code = node.querySelector("code") || node;
      const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "";
      const source = code.textContent.replace(/\n$/, "");
      const fence = "`".repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map((m) => m[0].length + 1)));
      return `${fence}${lang}\n${source}\n${fence}`;
    }
    if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${clean([...node.childNodes].map(inline).join(""))}`;
    if (tag === "p") return clean([...node.childNodes].map(inline).join(""));
    if (tag === "hr") return "---";
    if (tag === "blockquote") return blockChildren(node, depth).split("\n").map((line) => `> ${line}`).join("\n");
    if (tag === "ul" || tag === "ol") {
      return [...node.children].filter((el) => el.tagName === "LI").map((li, i) => {
        const nested = [...li.children].filter((el) => /^(UL|OL)$/.test(el.tagName));
        const head = [...li.childNodes].filter((n) => !nested.includes(n)).map(inline).join("").trim();
        const marker = tag === "ol" ? `${i + (Number(node.getAttribute("start")) || 1)}.` : "-";
        return `${"  ".repeat(depth)}${marker} ${head}${nested.length ? "\n" + nested.map((n) => block(n, depth + 1)).join("\n") : ""}`;
      }).join("\n");
    }
    if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((tr) => [...tr.children].filter((c) => /^(TH|TD)$/.test(c.tagName)).map((c) => clean([...c.childNodes].map(inline).join(" ")).replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const format = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] || "").join(" | ")} |`;
      return [format(rows[0]), format(Array(width).fill("---")), ...rows.slice(1).map(format)].join("\n");
    }
    if (tag === "br") return "\n";
    if (tag === "img") return inline(node);
    if (["div", "section", "article", "main"].includes(tag)) return blockChildren(node, depth);
    return clean([...node.childNodes].map(inline).join(""));
  }
  function blockChildren(node, depth) {
    return [...node.childNodes].map((child) => block(child, depth)).filter((s) => s && s.trim()).join("\n\n");
  }
  function notice(message, good = false) {
    document.getElementById("chatgpt-md-export-notice")?.remove();
    const el = document.createElement("div");
    el.id = "chatgpt-md-export-notice";
    el.textContent = message;
    Object.assign(el.style, {
      position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
      zIndex: "2147483647", maxWidth: "min(90vw, 520px)", padding: "10px 14px",
      borderRadius: "8px", background: good ? "#214d39" : "#69362d",
      color: "white", font: "14px/1.4 system-ui, sans-serif", boxShadow: "0 4px 18px #0008"
    });
    document.body.append(el);
    setTimeout(() => el.remove(), 10000);
  }
  function currentShellMessages() {
    const messages = [];
    const seen = new Set();
    for (const turn of document.querySelectorAll("[data-turn-key]")) {
      const key = turn.getAttribute("data-turn-key");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const user = turn.querySelector("[data-user-message-bubble]");
      const userText = user && block(user).trim();
      if (userText) messages.push({ role: "user", markdown: userText });
      const assistantText = [...turn.querySelectorAll('[data-markdown-text-style="assistant-message"]')]
        .map((part) => block(part).trim()).filter(Boolean).join("\n\n");
      if (assistantText) messages.push({ role: "assistant", markdown: assistantText });
    }
    return messages;
  }
  function legacyMessages() {
    const turns = [...document.querySelectorAll("[data-testid^='conversation-turn']")];
    const containers = turns.length ? turns : [...document.querySelectorAll("[data-message-author-role]")];
    const messages = containers.flatMap((container) => {
      const roleNode = container.matches("[data-message-author-role]") ? container : container.querySelector("[data-message-author-role]");
      const role = roleNode?.getAttribute("data-message-author-role");
      if (!roles.has(role)) return [];
      const parts = [...roleNode.querySelectorAll("[data-message-content-part]")];
      const candidates = parts.length ? parts : [...roleNode.querySelectorAll(".markdown, .prose, .whitespace-pre-wrap")];
      const bodies = (candidates.length ? candidates : [roleNode]).filter((el) => !candidates.some((other) => other !== el && other.contains(el)));
      const markdown = bodies.map((body) => block(body).trim()).filter(Boolean).join("\n\n");
      return markdown ? [{ role, markdown }] : [];
    });
    return { messages, containers: containers.length };
  }
  try {
    const current = currentShellMessages();
    const legacy = current.length ? null : legacyMessages();
    const messages = current.length ? current : legacy.messages;
    if (!messages.length) {
      const code = document.querySelector("[data-turn-key]") || legacy.containers ? "NO_TEXT" : "NO_MESSAGES";
      notice(code === "NO_TEXT" ? "Export failed: message containers were found, but no text was extracted (TEXT)." : "Export failed: no ChatGPT messages were found. Wait for the chat to load (DOM).");
      return { ok: false, code };
    }
    const title = clean(document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, "")) || "ChatGPT conversation";
    const filename = (title.replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "ChatGPT conversation") + ".md";
    const markdown = `# ${title.replace(/\n/g, " ")}\n\nSource: ${location.href}\n\n` + messages.map(({ role, markdown }) => `## ${role === "user" ? "User" : "Assistant"}\n\n${markdown}`).join("\n\n---\n\n") + "\n";
    try {
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      notice("Export failed: Brave could not start the download (DL).");
      return { ok: false, code: "DOWNLOAD" };
    }
    notice(`Markdown download started for ${messages.length} messages.`, true);
    return { ok: true, count: messages.length };
  } catch {
    notice("Export failed while reading this page (CODE).");
    return { ok: false, code: "EXTRACT" };
  }
})();
