// Markdown for model answers, styled like the website chat. Raw HTML in an answer is not rendered.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "./WalletProvider";

export function Markdown({ text }: { text: string }) {
  const app = useApp();
  const components: Components = {
    p: (props) => <p className="mb-3 last:mb-0" {...props} />,
    ul: (props) => <ul className="mb-3 list-disc pl-5 last:mb-0" {...props} />,
    ol: (props) => <ol className="mb-3 list-decimal pl-5 last:mb-0" {...props} />,
    h1: (props) => <h1 className="mb-2 text-base font-bold" {...props} />,
    h2: (props) => <h2 className="mb-2 text-base font-bold" {...props} />,
    h3: (props) => <h3 className="mb-2 font-bold" {...props} />,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-keryx-bright underline"
        onClick={(e) => {
          e.preventDefault();
          if (href && /^https?:\/\//i.test(href)) void app.openLink(href);
        }}
      >
        {children}
      </a>
    ),
    pre: (props) => (
      <pre className="mb-3 overflow-x-auto rounded border border-keryx-border bg-black/40 p-3 text-xs last:mb-0" {...props} />
    ),
    code: (props) => <code className="break-words text-keryx-bright" {...props} />,
    table: (props) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="border-collapse text-xs" {...props} />
      </div>
    ),
    th: (props) => <th className="border border-keryx-border px-2 py-1 text-left" {...props} />,
    td: (props) => <td className="border border-keryx-border px-2 py-1" {...props} />,
  };
  return (
    <div className="break-words text-sm text-keryx-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
