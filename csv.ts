import Papa from "papaparse";

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return Papa.unparse({ fields: header, data: rows.map((r) => r.map((v) => (v == null ? "" : v))) });
}

/** Browser download of generated text (web only). */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type: mime }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsvFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}
