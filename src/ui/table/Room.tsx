import { memo } from "react";
import styles from "./Room.module.css";

/**
 * The dark room behind the plane and the near continuation of the felt and rails (2D polygons
 * that line up with the plane's projection): the felt runs under the own hand and off the stage,
 * and the near rail is never seen. Static: no per-step work.
 */
export const Room = memo(function Room() {
  return (
    <div className={styles.room} aria-hidden="true">
      <span className={styles.rail} />
      <span className={styles.rtop} />
      <span className={styles.edge} />
      <span className={styles.lip} />
      <span className={styles.felt} />
    </div>
  );
});
