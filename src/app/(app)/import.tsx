import { router } from "expo-router";
import readExcelFile from "read-excel-file/web-worker";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useOwnerOptions } from "@/components/leads";
import { Badge, Button, Card, Checkbox, DataTable, ErrorBox, Grid, Label, Muted, Notice, Row, Screen, Select } from "@/components/ui";
import { findExisting, importLeads } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseCsvFile } from "@/lib/csv";
import { useRefData } from "@/lib/data";
import { money } from "@/lib/format";
import {
  TARGET_LABELS,
  dupKeys,
  findHeaderRow,
  guessMapping,
  pickSheet,
  prepareRows,
  type Cell,
  type MapTarget,
  type PreparedRow,
} from "@/lib/importer";
import { colors, font } from "@/theme";

const MAX_ROWS = 5000;

interface Workbook {
  fileName: string;
  sheets: { sheet: string; data: Cell[][] }[];
}

export default function ImportScreen() {
  const { profile, isManager } = useAuth();
  const { stages, profiles } = useRefData();
  const owners = useOwnerOptions();
  const [book, setBook] = useState<Workbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<MapTarget[]>([]);
  const [defaultStage, setDefaultStage] = useState<string>("");
  const [defaultOwner, setDefaultOwner] = useState<string>(profile?.id ?? "");
  const [dups, setDups] = useState<Map<string, string> | null>(null);
  const [importDups, setImportDups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const rows = book?.sheets[sheetIdx]?.data ?? [];
  const firstOpen = stages.find((s) => !s.is_closed);
  const stageId = Number(defaultStage || firstOpen?.id || 0);

  const prepared: PreparedRow[] = useMemo(
    () =>
      book && mapping.length
        ? prepareRows(rows, headerRow, mapping, {
            stages,
            profiles,
            defaultStageId: stageId,
            defaultOwnerId: defaultOwner || profile!.id,
            allowOwnerColumn: isManager,
          })
        : [],
    [book, rows, headerRow, mapping, stages, profiles, stageId, defaultOwner, profile, isManager]
  );

  const selectSheet = (b: Workbook, i: number) => {
    const data = b.sheets[i].data;
    const h = Math.max(0, findHeaderRow(data));
    setSheetIdx(i);
    setHeaderRow(h);
    setMapping(guessMapping(data[h] ?? []));
    setDups(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setBook(null);
    try {
      const name = file.name.toLowerCase();
      let sheets: Workbook["sheets"];
      if (name.endsWith(".csv") || name.endsWith(".txt")) {
        sheets = [{ sheet: file.name, data: await parseCsvFile(file) }];
      } else if (name.endsWith(".xlsx")) {
        sheets = (await readExcelFile(file)) as Workbook["sheets"];
      } else {
        throw new Error("Use a .csv or .xlsx file. For older .xls files, open in Excel and Save As .xlsx first.");
      }
      if (!sheets.some((s) => s.data.length > 1)) throw new Error("That file looks empty.");
      const b = { fileName: file.name, sheets };
      setBook(b);
      selectSheet(b, pickSheet(sheets));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const checkDuplicates = async () => {
    setBusy(true);
    setError(null);
    try {
      const emails = [...new Set(prepared.map((p) => p.lead.email).filter((e): e is string => !!e))];
      const companies = [...new Set(prepared.map((p) => p.lead.company))];
      setDups(await findExisting(emails, companies));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dupOf = (p: PreparedRow) => {
    if (!dups) return undefined;
    for (const k of dupKeys(p.lead)) if (dups.has(k)) return { key: k, owner: dups.get(k)! };
    return undefined;
  };
  const toImport = prepared.filter((p) => importDups || !dupOf(p));

  const runImport = async () => {
    if (toImport.length > MAX_ROWS) return setError(`Import up to ${MAX_ROWS} rows at a time.`);
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const n = await importLeads(toImport.map((p) => p.lead), setProgress);
      setDone(n);
      setBook(null);
    } catch (e) {
      setError(`Stopped after ${progress} rows: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const hasCompany = mapping.includes("company") || mapping.includes("contact_name");
  const header = rows[headerRow] ?? [];
  const samples = (i: number) =>
    rows
      .slice(headerRow + 1, headerRow + 4)
      .map((r) => fmtCell(r?.[i]))
      .filter(Boolean)
      .join(" · ");

  return (
    <Screen title="Import leads" subtitle="Upload a CSV or Excel file. Columns are matched automatically; adjust anything that's off.">
      <ErrorBox message={error} />
      {done != null ? (
        <Card>
          <View style={{ gap: 12 }}>
            <Notice tone="good">Imported {done} leads.</Notice>
            <Row>
              <Button label="View leads" variant="primary" onPress={() => router.push("/leads")} />
              <Button label="Import another file" onPress={() => setDone(null)} />
            </Row>
          </View>
        </Card>
      ) : null}

      {done == null ? (
        <Card title="1. Choose a file">
          <View style={{ gap: 8 }}>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Spreadsheet file"
              onChange={(e) => onFile(e.target.files?.[0])}
              style={{ font: `14px ${font.family}` }}
            />
            {book ? (
              <Row gap={12}>
                {book.sheets.length > 1 ? (
                  <Select
                    label="Sheet"
                    value={String(sheetIdx)}
                    onChange={(v) => selectSheet(book, Number(v))}
                    options={book.sheets.map((s, i) => ({ value: String(i), label: s.sheet }))}
                    style={{ width: 200 }}
                  />
                ) : null}
                <Select
                  label="Header row"
                  value={String(headerRow)}
                  onChange={(v) => {
                    const h = Number(v);
                    setHeaderRow(h);
                    setMapping(guessMapping(rows[h] ?? []));
                    setDups(null);
                  }}
                  options={rows.slice(0, 15).map((r, i) => ({ value: String(i), label: `Row ${i + 1}: ${(r ?? []).map(fmtCell).filter(Boolean).slice(0, 3).join(", ")}` }))}
                  style={{ width: 340 }}
                />
              </Row>
            ) : (
              <Muted>Your existing pipeline tracker works as-is: the Pipeline tab and its columns are detected automatically.</Muted>
            )}
          </View>
        </Card>
      ) : null}

      {book && done == null ? (
        <>
          <Card title="2. Match columns" padded={false}>
            <DataTable
              rows={header.map((h, i) => ({ i, h }))}
              rowKey={(r) => String(r.i)}
              columns={[
                { key: "h", label: "Column in your file", width: 200, render: (r) => fmtCell(r.h) || `(column ${r.i + 1})` },
                {
                  key: "s",
                  label: "Sample values",
                  width: 260,
                  flex: 2,
                  render: (r) => (
                    <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {samples(r.i) || "—"}
                    </Text>
                  ),
                },
                {
                  key: "t",
                  label: "Import as",
                  width: 220,
                  render: (r) => (
                    <Select
                      value={mapping[r.i] ?? "ignore"}
                      onChange={(v) => {
                        const next = [...mapping];
                        // a field can only come from one column
                        next.forEach((t, j) => {
                          if (t === v && j !== r.i && v !== "ignore") next[j] = "ignore";
                        });
                        next[r.i] = v as MapTarget;
                        setMapping(next);
                        setDups(null);
                      }}
                      options={(Object.keys(TARGET_LABELS) as MapTarget[])
                        .filter((t) => t !== "owner" || isManager)
                        .map((t) => ({ value: t, label: TARGET_LABELS[t] }))}
                    />
                  ),
                },
              ]}
            />
            <View style={{ padding: 16, gap: 12 }}>
              <Grid min={220} gap={12}>
                <Select
                  label="Stage when a row has none"
                  value={String(stageId)}
                  onChange={setDefaultStage}
                  options={stages.map((s) => ({ value: String(s.id), label: s.name }))}
                />
                {isManager ? <Select label="Owner when a row has none" value={defaultOwner} onChange={setDefaultOwner} options={owners} /> : null}
              </Grid>
              {!hasCompany ? <Notice tone="warn">Match at least a Company or Contact Name column.</Notice> : null}
            </View>
          </Card>

          <Card title={`3. Review (${prepared.length} rows)`}>
            <View style={{ gap: 12 }}>
              {!dups ? (
                <Row>
                  <Button label="Check for duplicates" variant="primary" onPress={checkDuplicates} busy={busy} disabled={!hasCompany || !prepared.length} />
                  <Muted>Matches on email or company name against everything already in the CRM.</Muted>
                </Row>
              ) : (
                <>
                  <Row gap={16}>
                    <Badge text={`${prepared.filter((p) => !dupOf(p)).length} new`} tone="good" />
                    <Badge text={`${prepared.filter((p) => dupOf(p)).length} already in CRM`} tone={prepared.some((p) => dupOf(p)) ? "warn" : "neutral"} />
                    <Badge text={`${prepared.filter((p) => p.warnings.length).length} with warnings`} tone={prepared.some((p) => p.warnings.length) ? "warn" : "neutral"} />
                  </Row>
                  {prepared.some((p) => dupOf(p)) ? <Checkbox label="Import duplicates anyway" checked={importDups} onChange={setImportDups} /> : null}
                  <Row>
                    <Button
                      label={busy ? `Importing ${progress} of ${toImport.length}…` : `Import ${toImport.length} leads`}
                      variant="primary"
                      onPress={runImport}
                      busy={busy}
                      disabled={!toImport.length}
                    />
                  </Row>
                </>
              )}
            </View>
          </Card>

          <Card title="Preview" padded={false}>
            <DataTable
              rows={prepared.slice(0, 200)}
              rowKey={(p) => String(p.rowNumber)}
              columns={[
                { key: "n", label: "Row", width: 60, align: "right", render: (p) => p.rowNumber },
                { key: "c", label: "Company", width: 180, flex: 2, render: (p) => p.lead.company },
                { key: "ct", label: "Contact", width: 140, render: (p) => p.lead.contact_name ?? "—" },
                { key: "a", label: "Price", width: 110, align: "right", render: (p) => money(p.lead.amount) },
                { key: "s", label: "Stage", width: 140, render: (p) => stages.find((s) => s.id === p.lead.stage_id)?.name ?? "" },
                {
                  key: "st",
                  label: "Status",
                  width: 220,
                  render: (p) => {
                    const d = dupOf(p);
                    return (
                      <View style={{ gap: 2 }}>
                        {d ? <Badge text={`Exists (${d.owner})`} tone="warn" /> : dups ? <Badge text="New" tone="good" /> : null}
                        {p.warnings.map((w) => (
                          <Text key={w} style={{ color: colors.warn, fontSize: 12 }}>
                            {w}
                          </Text>
                        ))}
                      </View>
                    );
                  },
                },
              ]}
            />
            {prepared.length > 200 ? (
              <View style={{ padding: 12 }}>
                <Label>Showing the first 200 of {prepared.length} rows</Label>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function fmtCell(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}
