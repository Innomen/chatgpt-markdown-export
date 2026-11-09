chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const status = async (code, message, good = false) => {
    await Promise.all([
      chrome.action.setBadgeText({ tabId: tab.id, text: code }),
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: good ? "#438a69" : "#a0543f" }),
      chrome.action.setTitle({ tabId: tab.id, title: message })
    ]);
  };
  const valid = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\//.test(tab.url || "");
  if (!valid) {
    await status("SITE", "Open a ChatGPT conversation at chatgpt.com/c/ before exporting.");
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    if (result?.ok) {
      await status("MD", `Markdown download started for ${result.count} messages.`, true);
    } else if (result?.code === "NO_MESSAGES") {
      await status("DOM", "No ChatGPT message containers were found. Check that the conversation finished loading.");
    } else if (result?.code === "NO_TEXT") {
      await status("TEXT", "Message containers were found, but no text could be extracted.");
    } else if (result?.code === "DOWNLOAD") {
      await status("DL", "The browser could not start the Markdown download.");
    } else {
      await status("CODE", "The exporter failed while reading the page.");
    }
  } catch {
    await status("INJ", "Brave could not inject the exporter. Reload this tab and try again.");
  }
});
