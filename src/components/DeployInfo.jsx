import React from "react";

const commit = import.meta.env.VITE_GIT_COMMIT || "-";
const version = import.meta.env.VITE_APP_VERSION || "1.0.3";
const branch = import.meta.env.VITE_GIT_BRANCH || "main";
const date = import.meta.env.VITE_DEPLOY_TIME || "-";

export default function DeployInfo() {
  return (
    <div style={{
      fontSize: "0.75em",
      color: "#889",
      padding: "8px 12px 4px 12px",
      borderTop: "1px solid #222",
      background: "#151a24",
      textAlign: "left"
    }}>
      <div>Версія: <b>{version}</b></div>
      <div>Деплой: <b>{branch}</b></div>
      <div>Commit: <span style={{fontFamily:'monospace'}}>{commit.slice(0,8)}</span></div>
      <div style={{fontSize:"0.7em"}}>{date}</div>
    </div>
  );
}
