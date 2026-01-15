import React from "react";

function SidebarNav({ navItems, expandedGroups, toggleGroup, setActiveNav, activeNav, isMobile, setSidebarOpen }) {
  return (
    <nav style={{display: "flex", flexDirection: "column", gap: "0.5rem"}}>
      {navItems.map((group, groupIdx) => (
        <div key={group.id || groupIdx} style={{borderRadius: "0.75rem", backgroundColor: "rgba(71, 85, 105, 0.3)", border: "1px solid #475569", overflow: "hidden"}}>
          <button type="button" onClick={() => toggleGroup(group.id)} style={{width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "#cbd5e1", backgroundColor: "transparent", border: "none", cursor: "pointer"}}>
            <div style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>
              {group.icon && React.createElement(group.icon, { size: 16 })} {group.label}
            </div>
            <svg width="14" height="14" style={{transition: "transform 150ms", transform: expandedGroups[group.id] ? "rotate(0deg)" : "rotate(-90deg)"}}><path d="M4 6l4 4 4-4" stroke="#cbd5e1" strokeWidth="2" fill="none"/></svg>
          </button>
          {expandedGroups[group.id] && (
            <div style={{display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem"}}>
              {group.children.map((item, itemIdx) => (
                <button key={item.id || itemIdx} type="button" onClick={() => {
                  setActiveNav(item.id);
                  localStorage.setItem('lucia_activeNav', item.id);
                  if (isMobile) setSidebarOpen(false);
                }} style={{margin: "0 0.5rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: "500", transition: "all 150ms", whiteSpace: "nowrap", backgroundColor: activeNav === item.id ? "#4f46e5" : "transparent", color: activeNav === item.id ? "white" : "#e2e8f0", border: "none", cursor: "pointer"}}>
                  <span style={{display: "inline-block", height: "0.5rem", width: "0.5rem", borderRadius: "9999px", backgroundColor: "#818cf8", marginTop: "0.25rem", flexShrink: 0}} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export default SidebarNav;