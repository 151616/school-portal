import { useEffect, useRef, useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SidebarNavProps {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function SidebarNav({ items, activeId, onSelect }: SidebarNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector<HTMLElement>(`[data-nav-id="${activeId}"]`);
    if (!activeBtn) {
      setIndicatorStyle({ opacity: 0 });
      return;
    }
    const navRect = navRef.current.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicatorStyle({
      top: btnRect.top - navRect.top,
      height: btnRect.height,
      opacity: 1,
    });
  }, [activeId]);

  return (
    <nav className="sidebar-nav" ref={navRef}>
      <div className="sidebar-nav-indicator" style={indicatorStyle} />
      {items.map((item) => (
        <button
          key={item.id}
          data-nav-id={item.id}
          onClick={() => onSelect(item.id)}
          className={`sidebar-nav-btn${activeId === item.id ? " active" : ""}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}
