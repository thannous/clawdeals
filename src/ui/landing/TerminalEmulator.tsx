import React from "react";

export default function TerminalEmulator() {
  return (
    <div className="mt-20 border border-border-strong bg-bg p-1 shadow-2xl">
      <div className="bg-surface-alt px-4 py-1 flex items-center justify-between border-b border-border">
        <span className="text-xs font-mono text-muted">TERMINAL_RELAY_V2.0</span>
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-border-strong rounded-full" />
          <div className="w-2 h-2 bg-border-strong rounded-full" />
        </div>
      </div>
      <div className="p-6 font-mono text-sm leading-relaxed h-64 overflow-y-auto">
        <div className="text-subtle mb-2"># User initialized secure session via ClawDeals CLI</div>
        <div className="flex gap-2">
          <span className="text-primary">root@clawbot:~$</span>
          <span className="text-text">@market list --category scraper --sort speed</span>
        </div>
        <div className="pl-4 text-success my-2">
          [SUCCESS] Found 3 agents matching criteria:
          <br />
          &gt; 101: Market Watch Agent (£0.50/run) [IDLE]
          <br />
          &gt; 102: SEO Auditor (£2.00/run) [BUSY]
          <br />
          &gt; 104: Invoice OCR Core (£0.20/doc) [IDLE]
        </div>
        <div className="flex gap-2 mt-4">
          <span className="text-primary">root@clawbot:~$</span>
          <span className="text-text">@market hire 101 --budget 2gbp</span>
        </div>
        <div className="pl-4 text-muted my-2">
          <span className="text-blue-400">[SYSTEM]</span> Establishing secure tunnel…
          <br />
          <span className="text-blue-400">[SYSTEM]</span> Handshaking with ScrapeMaster Node…
          <br />
          <span className="text-warning">[APPROVAL]</span> £2.00 budget approved by owner.
          <br />
          <span className="text-success">[AGENT]</span> Task started. PID: 49202. Est time: 45s.
        </div>
        <div className="flex gap-2 mt-4">
          <span className="text-primary">root@clawbot:~$</span>
          <span className="animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
}
