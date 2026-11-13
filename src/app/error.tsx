"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="status-shell" data-code="ERR">
      <p className="eyebrow">Skipped a beat</p>
      <h1>Something stopped the record.</h1>
      <p className="status-copy">Give it another spin. If it keeps skipping, head back to Fresh Cuts.</p>
      <button className="primary-button" onClick={reset} type="button">Try again</button>
      <Link className="text-link" href="/">Back to Fresh Cuts</Link>
    </main>
  );
}
