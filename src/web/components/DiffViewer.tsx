import React, { useState, useEffect } from "react";
import { diffLines, type Change } from "diff";

interface FileOperation {
  path: string;
  operation: 'read' | 'write' | 'edit';
  timestamp: string;
  toolUseId: string;
  oldContent?: string;
  newContent?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface Theme {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  success: string;
}

interface DiffViewerProps {
  fileOp: FileOperation;
  theme: Theme;
}

const formatFilePath = (fullPath: string, maxLength: number = 60): string => {
  let path = fullPath.replace(/^\/Users\/[^/]+\/projects\//, '/');

  if (path.length > maxLength) {
    const start = path.substring(0, 20);
    const end = path.substring(path.length - (maxLength - 23));
    path = `${start}...${end}`;
  }

  return path;
};

export const DiffViewer = ({ fileOp, theme }: DiffViewerProps) => {
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    if (fileOp.oldContent || fileOp.newContent) {
      const diff = diffLines(fileOp.oldContent || "", fileOp.newContent || "");
      setChanges(diff);
    }
  }, [fileOp]);

  if (!fileOp.oldContent && !fileOp.newContent) return null;

  let oldLineNumber = 1;
  let newLineNumber = 1;

  return (
    <div style={{ background: "#151515", borderRadius: "4px", overflow: "hidden", fontFamily: "monospace", fontSize: "12px", border: `1px solid ${theme.dim}`, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", background: "#202020", borderBottom: `1px solid ${theme.dim}`, display: "flex", justifyContent: "space-between", color: "#ccc", alignItems: "center" }}>
        <span style={{ fontWeight: "bold", color: theme.accent }}>{fileOp.path.split('/').pop()}</span>
        <span style={{ fontSize: "10px", opacity: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatFilePath(fileOp.path)}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
         <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
               <col style={{ width: "40px" }} />
               <col style={{ width: "40px" }} />
               <col style={{ width: "20px" }} />
               <col style={{ width: "auto" }} />
            </colgroup>
            <tbody>
               {changes.map((part, i) => {
                  const color = part.added ? theme.success : part.removed ? theme.warn : "#888";
                  const bg = part.added ? "rgba(0, 255, 136, 0.1)" : part.removed ? "rgba(255, 68, 68, 0.1)" : "transparent";
                  const lines = part.value.replace(/\n$/, '').split('\n');

                  return lines.map((line, lineIndex) => {
                     const showOld = !part.added;
                     const showNew = !part.removed;
                     const oNum = showOld ? oldLineNumber++ : "";
                     const nNum = showNew ? newLineNumber++ : "";
                     const symbol = part.added ? "+" : part.removed ? "-" : " ";

                     return (
                        <tr key={`${i}-${lineIndex}`} style={{ backgroundColor: bg }}>
                           <td style={{ textAlign: "right", paddingRight: "8px", color: "#555", userSelect: "none", borderRight: "1px solid #333" }}>{oNum}</td>
                           <td style={{ textAlign: "right", paddingRight: "8px", color: "#555", userSelect: "none", borderRight: "1px solid #333" }}>{nNum}</td>
                           <td style={{ textAlign: "center", color: color, userSelect: "none" }}>{symbol}</td>
                           <td style={{ paddingLeft: "8px", color: color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{line}</td>
                        </tr>
                     );
                  });
               })}
            </tbody>
         </table>
      </div>
    </div>
  );
};
