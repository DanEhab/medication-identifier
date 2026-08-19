import React from 'react';

interface MarkdownTextProps {
  text: string;
  inline?: boolean;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ text, inline = false }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const parseInline = (line: string, keyPrefix: string) => {
    // split by **
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong className="font-semibold text-brand-dark dark:text-white" key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>;
    });
  };

  if (inline) {
    return <>{parseInline(text, 'inline-root')}</>;
  }

  lines.forEach((line, index) => {
    const isList = line.trim().match(/^[-*]\s+(.*)$/);
    if (isList) {
      inList = true;
      listItems.push(<li key={`li-${index}`}>{parseInline(isList[1], `inline-${index}`)}</li>);
    } else {
      if (inList) {
        elements.push(
          <ul key={`ul-${index}`} className="list-disc list-inside space-y-1 my-2 ps-2">
            {listItems}
          </ul>
        );
        inList = false;
        listItems = [];
      }
      if (line.trim()) {
        elements.push(
          <p key={`p-${index}`} className="my-1">
            {parseInline(line, `inline-${index}`)}
          </p>
        );
      }
    }
  });

  if (inList) {
    elements.push(
      <ul key="ul-end" className="list-disc list-inside space-y-1 my-2 ps-2">
        {listItems}
      </ul>
    );
  }

  return <div className="space-y-1">{elements}</div>;
};
