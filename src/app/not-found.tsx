import Link from "next/link";

export default function NotFound() {
  return (
    <main className="status-shell" data-code="404">
      <p className="eyebrow">Off the map</p>
      <h1>That track isn&apos;t hidden here.</h1>
      <p className="status-copy">The link may be old or mistyped. The newest Fresh Cuts are one tap away.</p>
      <Link className="primary-button" href="/">Back to Fresh Cuts</Link>
    </main>
  );
}
