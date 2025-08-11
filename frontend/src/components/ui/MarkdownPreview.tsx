import React from 'react';

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Very small, safe-ish markdown renderer for headings, bold, italic, lists, and newlines.
function renderMarkdownLite(md: string): string {
  const escaped = escapeHtml(md || '');
  let html = escaped;
  // Headings (#, ##, ###)
  html = html.replace(/^###\s?(.*)$/gm, '<h3 class="text-sm font-semibold mb-1">$1</h3>');
  html = html.replace(/^##\s?(.*)$/gm, '<h2 class="text-base font-semibold mb-1">$1</h2>');
  html = html.replace(/^#\s?(.*)$/gm, '<h1 class="text-lg font-semibold mb-1">$1</h1>');
  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Simple lists: lines starting with - or *
  html = html.replace(/^(?:-|\*)\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(?:<li>.*<\/li>\n?)+/g, (m) => `<ul class="list-disc pl-5 space-y-1">${m}</ul>`);
  // Line breaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function MarkdownPreview({ value }: { value: string }) {
  const html = renderMarkdownLite(value || '');
  return (
    <div
      className="prose prose-sm max-w-none text-gray-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

