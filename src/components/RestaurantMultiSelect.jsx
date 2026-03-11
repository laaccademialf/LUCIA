import React from "react";

export default function RestaurantMultiSelect({ restaurants, value = [], onChange }) {
  return (
    <div style={{padding: "8px 0"}}>
      <label style={{fontWeight: 600, marginBottom: 4}}>Доступ до ресторанів:</label>
      <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
        {restaurants.map(r => (
          <label key={r.id} style={{display: "flex", alignItems: "center", gap: "4px"}}>
            <input
              type="checkbox"
              checked={value.includes(r.id)}
              onChange={e => {
                if (e.target.checked) {
                  onChange([...value, r.id]);
                } else {
                  onChange(value.filter(id => id !== r.id));
                }
              }}
            />
            {r.name}
          </label>
        ))}
      </div>
    </div>
  );
}
