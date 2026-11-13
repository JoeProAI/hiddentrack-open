import { store } from "@/lib/store";
import styles from "./album.module.css";

export function CdBlock() {
  return (
    <div className={styles.cd}>
      <p className={styles.cdHead}>The CD</p>
      <p className={styles.cdLine}>
        <strong>{store.cdPrice}</strong> plus {store.cdShipping}. Pre-order. {store.cdShips}, once the test pressing checks out.
      </p>
      {store.cdPreorderUrl ? (
        <a className={styles.buy} href={store.cdPreorderUrl} rel="noopener">Pre-order the CD</a>
      ) : (
        <p className={styles.soon}>CD pre-orders open here soon.</p>
      )}
      <p className={styles.cdNote}>Every song stays free. The CD is for the shelf.</p>
    </div>
  );
}

// Pay what you want, $1 minimum. Renders nothing until the Stripe link is set.
export function TipLink({ className, prefix }: { className?: string; prefix?: string }) {
  if (!store.tipUrl) return null;
  return <>{prefix}<a className={className} href={store.tipUrl} rel="noopener">KEEP HIDDEN TRACK FREE</a></>;
}
