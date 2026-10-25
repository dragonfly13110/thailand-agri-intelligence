'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import styles from './api-snippets.module.css';

const PLACEHOLDER_ORIGIN = 'https://<โดเมนของคุณ>';

type TabId = 'curl' | 'javascript' | 'requests' | 'urllib';

type Tab = {
  id: TabId;
  label: string;
  filename: string;
  language: string;
};

const TABS: readonly Tab[] = [
  { id: 'curl', label: 'cURL', filename: 'request.sh', language: 'shell' },
  { id: 'javascript', label: 'JavaScript', filename: 'request.mjs', language: 'javascript' },
  { id: 'requests', label: 'Python · requests', filename: 'request.py', language: 'python' },
  { id: 'urllib', label: 'Python · urllib', filename: 'request.py', language: 'python' },
];

function shellLiteral(value: string): string {
  return value.replace(/[\\"$`]/g, (token) => `\\${token}`);
}

function pythonLiteral(value: string): string {
  return value
    .replace(/\\/g, () => '\\\\')
    .replace(/"/g, () => '\\"')
    .replace(/\r/g, () => '\\r')
    .replace(/\n/g, () => '\\n');
}

function buildSnippets(target: string): Record<TabId, string> {
  const shellTarget = shellLiteral(target);
  const pythonTarget = pythonLiteral(target);
  const javascriptTarget = JSON.stringify(target);

  return {
    curl: [
      'curl -sS -H "Accept: application/json" \\',
      `  "${shellTarget}"`,
    ].join('\n'),
    javascript: [
      `const response = await fetch(${javascriptTarget}, {`,
      `  headers: { Accept: "application/json" },`,
      '});',
      '',
      'if (!response.ok) {',
      '  const error = await response.json();',
      '  throw new Error(`${error.error?.code ?? response.status}: ${error.error?.message ?? "request failed"}`);',
      '}',
      '',
      'const payload = await response.json();',
      'console.log(payload);',
    ].join('\n'),
    requests: [
      'import requests',
      '',
      'response = requests.get(',
      `    "${pythonTarget}",`,
      '    headers={"Accept": "application/json"},',
      '    timeout=30,',
      ')',
      'response.raise_for_status()',
      'payload = response.json()',
      'print(payload)',
    ].join('\n'),
    urllib: [
      'import json',
      'import urllib.request',
      '',
      `url = "${pythonTarget}"`,
      'request = urllib.request.Request(url, headers={"Accept": "application/json"})',
      '',
      'with urllib.request.urlopen(request, timeout=30) as response:',
      '    payload = json.load(response)',
      '',
      'print(payload)',
    ].join('\n'),
  };
}

function copyWithTextarea(value: string): boolean {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  return copied;
}

async function copyText(value: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection-based fallback.
    }
  }
  return copyWithTextarea(value);
}

export function ApiSnippets({ url, origin }: { url: string; origin?: string }) {
  const [activeTabId, setActiveTabId] = useState<TabId>('curl');
  const [feedback, setFeedback] = useState<{ state: 'copied' | 'failed'; key: string } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const path = url.trim() || '/api/v1';
  const target = (origin ?? PLACEHOLDER_ORIGIN) + path;
  const snippets = buildSnippets(target);
  const activeTab = TABS.find((tab) => tab.id === activeTabId) ?? TABS[0];
  const snippet = snippets[activeTab.id];
  const feedbackKey = `${activeTab.id}:${target}`;
  const copyState = feedback?.key === feedbackKey ? feedback.state : 'idle';

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setActiveTabId(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  async function handleCopy() {
    const copied = await copyText(snippet);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFeedback({ state: copied ? 'copied' : 'failed', key: feedbackKey });
    if (copied) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setFeedback((current) => (current?.key === feedbackKey ? null : current));
      }, 2000);
    }
  }

  return <section className={styles.root} aria-label="ตัวอย่างโค้ดสำหรับเรียก API">
    <div className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>ตัวอย่างโค้ด</span>
        <p className={styles.target} title={target}>{target}</p>
      </div>
      <button className={styles.copyButton} type="button" onClick={handleCopy}>
        {copyState === 'copied' ? 'คัดลอกแล้ว' : 'คัดลอก'}
      </button>
    </div>

    <p className={styles.status} data-state={copyState} role="status" aria-live="polite">
      {copyState === 'failed'
        ? 'คัดลอกไม่สำเร็จ — เลือกโค้ดแล้วกด Ctrl+C'
        : copyState === 'copied'
          ? <span className={styles.srOnly}>คัดลอกแล้ว</span>
          : null}
    </p>

    <div className={styles.tabs} role="tablist" aria-label="ภาษาและไลบรารีของตัวอย่างโค้ด">
      {TABS.map((tab, index) => {
        const selected = tab.id === activeTab.id;
        return <button
          key={tab.id}
          ref={(node) => { tabRefs.current[index] = node; }}
          id={`${baseId}-tab-${tab.id}`}
          className={styles.tab}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={`${baseId}-panel`}
          tabIndex={selected ? 0 : -1}
          onClick={() => setActiveTabId(tab.id)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
        >
          {tab.label}
        </button>;
      })}
    </div>

    <div
      className={styles.panel}
      id={`${baseId}-panel`}
      role="tabpanel"
      aria-labelledby={`${baseId}-tab-${activeTab.id}`}
      tabIndex={0}
    >
      <div className={styles.codeHeader}>
        <span className={styles.fileChip}>{activeTab.filename}</span>
        <span className={styles.languageChip}>{activeTab.language}</span>
      </div>
      <pre className={styles.code}><code>{snippet}</code></pre>
    </div>

    <div className={styles.notes}>
      <p>ไม่ต้องใช้ API key · ทุก endpoint เป็น GET และอ่านอย่างเดียว</p>
      <p>เรียกจากเบราว์เซอร์ต่างโดเมนอาจติด CORS — ใช้ server-side proxy หากต้องเรียกข้าม origin</p>
    </div>
  </section>;
}
