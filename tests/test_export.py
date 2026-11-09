"""Run with: python3 tests/test_export.py (from the extension folder)."""

from pathlib import Path
from shutil import which

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "content.js").read_text()


with sync_playwright() as playwright:
    brave = which("brave")
    browser = playwright.chromium.launch(executable_path=brave, headless=True) if brave else playwright.chromium.launch(headless=True)
    page = browser.new_page(accept_downloads=True)
    page.goto("https://chatgpt.com/c/synthetic-test")
    page.set_content(
        '<title>Sample - ChatGPT</title>'
        '<article data-testid="conversation-turn-1">'
        '<div data-message-author-role="user"><div class="whitespace-pre-wrap">Question</div></div>'
        '</article>'
        '<article data-testid="conversation-turn-2">'
        '<div data-message-author-role="assistant">'
        '<div data-message-content-part><div class="markdown"><p>Part one</p></div></div>'
        '<div data-message-content-part><div class="markdown">'
        '<pre><code class="language-python">print(1)</code></pre><p>Part two</p>'
        '</div></div></div></article>'
    )
    with page.expect_download() as pending:
        assert page.evaluate(SCRIPT) == {"ok": True, "complete": False, "count": 2}
    content = Path(pending.value.path()).read_text()
    assert pending.value.suggested_filename == "Sample - visible only.md"
    assert content.count("Part one") == content.count("Part two") == 1
    assert "```python\nprint(1)\n```" in content

    page.set_content(
        '<title>Current shell - ChatGPT</title>'
        '<div data-turn-key="turn-1"><div data-user-message-bubble>New question</div>'
        '<div data-markdown-text-style="assistant-message"><p>New <strong>answer</strong></p></div>'
        '<div data-markdown-text-style="assistant-message"><pre><code>result = 2</code></pre></div>'
        '</div>'
        '<div data-turn-key="turn-1"><div data-user-message-bubble>Duplicate preview</div></div>'
    )
    with page.expect_download() as pending:
        assert page.evaluate(SCRIPT) == {"ok": True, "complete": False, "count": 2}
    content = Path(pending.value.path()).read_text()
    assert "New question" in content
    assert "New **answer**" in content
    assert "result = 2" in content
    assert "Duplicate preview" not in content

    page.route("**/api/auth/session", lambda route: route.fulfill(json={"accessToken": "test-token"}))
    mapping = {
        "root": {"parent": None, "message": None},
        "u1": {"parent": "root", "message": {"author": {"role": "user"}, "content": {"parts": ["Old question"]}}},
        "a1": {"parent": "u1", "message": {"author": {"role": "assistant"}, "content": {"parts": ['Old answer <Link url="https://example.com/paper" title="paper"/>.\n<WritingBlock id="1">Quoted reply</WritingBlock>\n<box><text>Foundation</text><icon name="arrow-down"/></box><Cite ref="source"/>']}}},
        "u2": {"parent": "a1", "message": {"author": {"role": "user"}, "content": {"parts": ["New question"]}}},
        "a2": {"parent": "u2", "message": {"author": {"role": "assistant"}, "content": {"parts": ["New answer"]}}},
        "other_branch": {"parent": "u1", "message": {"author": {"role": "assistant"}, "content": {"parts": ["Unselected branch"]}}},
    }
    page.route("**/backend-api/conversation/synthetic-test", lambda route: route.fulfill(json={"title": "Full chat", "current_node": "a2", "mapping": mapping}))
    with page.expect_download() as pending:
        assert page.evaluate(SCRIPT) == {"ok": True, "complete": True, "count": 4}
    content = Path(pending.value.path()).read_text()
    assert pending.value.suggested_filename == "Full chat.md"
    assert content.index("Old question") < content.index("Old answer") < content.index("New question") < content.index("New answer")
    assert "Unselected branch" not in content
    assert "[paper](https://example.com/paper)" in content
    assert "Quoted reply" in content and "Foundation↓" in content
    assert "<Link" not in content and "<WritingBlock" not in content and "<box" not in content

    mapping["root"]["parent"] = "missing-ancestor"
    with page.expect_download() as pending:
        assert page.evaluate(SCRIPT) == {"ok": True, "complete": False, "count": 2}
    assert pending.value.suggested_filename == "Current shell - visible only.md"

    page.unroute("**/api/auth/session")
    page.unroute("**/backend-api/conversation/synthetic-test")

    page.set_content("<title>Empty - ChatGPT</title>")
    assert page.evaluate(SCRIPT) == {"ok": False, "code": "NO_MESSAGES"}
    assert "no ChatGPT messages" in page.locator("#chatgpt-md-export-notice").inner_text()

    page.set_content('<article data-testid="conversation-turn-1"></article>')
    assert page.evaluate(SCRIPT) == {"ok": False, "code": "NO_TEXT"}
    browser.close()

print("synthetic Brave export and diagnostics passed")
