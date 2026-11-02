//NOTE(jimmylee)
//Main layout component with sidebar and media container.

import styles from '@engine/components/MainLayout.module.css';
import * as React from 'react';

function MainLayout(props) {
  return (
    <div className={styles.body}>
      {props.sidebar ? props.sidebar : null}
      <main className={styles.media}>{props.children}</main>
    </div>
  );
}

export default MainLayout;
