//NOTE(@jimmylee)
//Numbered section index. Each item links to its section, and the item for the section crossing the
//top of the viewport is marked. The list is taller than the screen, so it scrolls with that mark.

import * as React from 'react';
import styles from '@engine/components/MainSidebar.module.css';

const JUMP_SETTLE_MS = 1500;
const SCROLL_INPUT_EVENTS = ['wheel', 'touchmove', 'keydown'];

function MainSidebar({ sections }) {
  const [activeId, setActiveId] = React.useState(sections[0]?.id);
  const sidebarRef = React.useRef(null);
  const activeRef = React.useRef(null);

  React.useEffect(() => {
    const crossing = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target.id);
          else crossing.delete(entry.target.id);
        }
        const first = sections.find((section) => crossing.has(section.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: '0px 0px -99% 0px' }
    );
    for (const section of sections) {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [sections]);

  //NOTE(@jimmylee)
  //A jump lands next to sections that mount only once they near the screen, and they are far taller
  //than their placeholders, so the target is held at the top until the page stops growing. Any scroll
  //input from the reader ends the hold.
  React.useEffect(() => {
    let stop = null;

    const onHashChange = () => {
      stop?.();
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) return;
      const resize = new ResizeObserver(() => target.scrollIntoView());
      const timer = setTimeout(() => stop?.(), JUMP_SETTLE_MS);
      const end = () => {
        resize.disconnect();
        clearTimeout(timer);
        for (const name of SCROLL_INPUT_EVENTS) window.removeEventListener(name, end);
        stop = null;
      };
      stop = end;
      resize.observe(target.parentElement);
      for (const name of SCROLL_INPUT_EVENTS) window.addEventListener(name, end, { passive: true });
    };

    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => {
      stop?.();
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  React.useEffect(() => {
    const sidebar = sidebarRef.current;
    const item = activeRef.current;
    if (!sidebar || !item) return;
    if (item.offsetTop < sidebar.scrollTop) sidebar.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > sidebar.scrollTop + sidebar.clientHeight) sidebar.scrollTop = item.offsetTop + item.offsetHeight - sidebar.clientHeight;
  }, [activeId]);

  return (
    <nav className={styles.sidebar} aria-label="Sections" ref={sidebarRef}>
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <a className={active ? styles.itemActive : styles.item} key={section.id} href={`#${section.id}`} title={section.title} aria-label={`${section.id} ${section.title}`} aria-current={active ? 'location' : undefined} ref={active ? activeRef : undefined}>
            {active ? '► ' : '  '}
            {section.id}
          </a>
        );
      })}
    </nav>
  );
}

export default MainSidebar;
