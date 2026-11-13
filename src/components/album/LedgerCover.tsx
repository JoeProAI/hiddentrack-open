import styles from "./album.module.css";

// Placeholder cover until the real art lands: a type-only page torn from a counting house ledger.
export default function LedgerCover({ count }: { count: number }) {
  return (
    <figure className={styles.cover} aria-label="Counting House cover, placeholder">
      <div className={styles.coverRules} aria-hidden="true" />
      <p className={styles.coverTop}>HIDDEN TRACK <span>LEDGER NO. 1</span></p>
      <p className={styles.coverTitle}>Counting<br /><em>House.</em></p>
      <ol className={styles.coverTally} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <li key={i}>{String(i + 1).padStart(2, "0")}</li>)}
      </ol>
      <p className={styles.coverFoot}><span>{count} ENTRIES</span><span className={styles.coverStamp}>EXPLICIT</span></p>
    </figure>
  );
}
