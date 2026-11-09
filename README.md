# ChatGPT Markdown Export

Export the open ChatGPT conversation as a local Markdown file. The extension has no network code and requests access only to the tab where you click its icon.

## Install in Brave

1. Open `brave://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the folder containing this `manifest.json` file.
3. Open a conversation at `chatgpt.com/c/...`, wait for it to load, and click the extension icon. Brave downloads a `.md` file to your normal Downloads folder.

After changing these extension files, click **Reload** on its card at `brave://extensions` before trying again.

## If export fails

The icon badge and a notice on the page show a short diagnostic code. Hover over the icon for more detail. `DOM` means no message containers were found, `TEXT` means containers were found but no message text was extracted, `DL` means the download could not start, and `INJ` means Brave could not inject the script. `SITE` means the current tab is not a conversation URL. The extension reports only these fixed codes and message counts; it does not log conversation content.

The exporter reads messages currently rendered in the page. For a long conversation, scroll to the beginning and wait for older messages to load before exporting. It preserves common headings, links, lists, tables, quotes and code blocks. Attachments that are not rendered as text cannot be embedded in the Markdown file.

The extractor supports both the older `conversation-turn`/`data-message-author-role` layout and the newer `data-turn-key` layout with user bubbles and assistant Markdown blocks. The newer selectors were added after a real `DOM` failure; `tests/test_export.py` exercises both layouts and the empty-page diagnostics.
