import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StageBadge, useOwnerOptions } from "@/components/leads";
import { Button, Card, DataTable, ErrorBox, Field, Loading, Row, Screen, Select, type Column } from "@/components/ui";
import { getLeads } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toCsv, downloadText } from "@/lib/csv";
import { useData, useRefData } from "@/lib/data";
import { isoDate, money, pct, shortDate } from "@/lib/format";
import { probabilityOf } from "@/lib/metrics";
import type { Lead } from "@/lib/types";
import { colors } from "@/theme";

export default function LeadsScreen() {
  const { isManager } = useAuth();
  const { stages, stagesById, profileName } = useRefData();
  const owners = useOwnerOptions(true);
  const { data: leads, error, loading } = useData(getLeads);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("open");
  const [owner, setOwner] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      const s = stagesById.get(l.stage_id);
      if (stageFilter === "open" && s?.is_closed) return false;
      if (stageFilter === "won" && !s?.is_won) return false;
      if (stageFilter === "lost" && !(s?.is_closed && !s.is_won)) return false;
      if (/^\d+$/.test(stageFilter) && l.stage_id !== Number(stageFilter)) return false;
      if (owner && l.owner_id !== owner) return false;
      if (!needle) return true;
      return [l.company, l.contact_name, l.email, l.equipment, l.quote_number, l.phone].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [leads, q, stageFilter, owner, stagesById]);

  const total = rows.reduce((sum, l) => sum + (l.amount ?? 0), 0);

  const columns: Column<Lead>[] = [
    {
      key: "company",
      label: "Company",
      width: 200,
      flex: 2,
      render: (l) => (
        <View>
          <Text style={{ color: colors.primaryDark, fontWeight: "600" }} numberOfLines={1}>
            {l.company}
          </Text>
          {l.contact_name ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{l.contact_name}</Text> : null}
        </View>
      ),
      sortValue: (l) => l.company.toLowerCase(),
    },
    { key: "equipment", label: "Equipment", width: 150, render: (l) => l.equipment ?? "—", sortValue: (l) => l.equipment?.toLowerCase() ?? null },
    { key: "amount", label: "Price", width: 120, align: "right", render: (l) => money(l.amount), sortValue: (l) => l.amount },
    { key: "stage", label: "Stage", width: 150, render: (l) => <StageBadge stage={stagesById.get(l.stage_id)} />, sortValue: (l) => stagesById.get(l.stage_id)?.sort_order ?? 0 },
    { key: "prob", label: "Prob.", width: 70, align: "right", render: (l) => pct(probabilityOf(l, stagesById)), sortValue: (l) => probabilityOf(l, stagesById) },
    { key: "close", label: "Exp. close", width: 120, render: (l) => shortDate(l.expected_close), sortValue: (l) => l.expected_close },
    ...(isManager
      ? [{ key: "owner", label: "Owner", width: 140, render: (l: Lead) => profileName(l.owner_id), sortValue: (l: Lead) => profileName(l.owner_id) }]
      : []),
    { key: "updated", label: "Updated", width: 110, render: (l) => shortDate(l.updated_at), sortValue: (l) => l.updated_at },
  ];

  const exportCsv = () => {
    const header = ["Customer Name", "Contact Name", "Email", "Phone", "Equipment", "Price ($)", "Stage", "Probability", "Expected Close Date",
      "Weighted Revenue ($)", "Quote #", "Lead Source", "Owner", "Notes", "Lost Reason", "Created", "Closed"];
    const data = rows.map((l) => {
      const p = probabilityOf(l, stagesById);
      return [l.company, l.contact_name, l.email, l.phone, l.equipment, l.amount, stagesById.get(l.stage_id)?.name, p,
        l.expected_close, l.amount != null ? Math.round(l.amount * p * 100) / 100 : null, l.quote_number, l.source,
        profileName(l.owner_id), l.notes, l.lost_reason, l.created_at.slice(0, 10), l.closed_at?.slice(0, 10)];
    });
    downloadText(`leads-${isoDate()}.csv`, toCsv(header, data));
  };

  return (
    <Screen
      title="Leads"
      subtitle={isManager ? "Every lead across the team" : "Your leads"}
      actions={
        <>
          <Button label="Export CSV" onPress={exportCsv} disabled={!rows.length} />
          <Button label="Import" onPress={() => router.push("/import")} />
          <Button label="New lead" variant="primary" onPress={() => router.push("/leads/new")} />
        </>
      }
    >
      <ErrorBox message={error} />
      <Card padded={false}>
        <Row style={{ padding: 12, gap: 12 }}>
          <Field value={q} onChangeText={setQ} placeholder="Search company, contact, email, quote #…" style={{ flexGrow: 1, minWidth: 220 }} />
          <Select
            value={stageFilter}
            onChange={setStageFilter}
            style={{ minWidth: 170 }}
            options={[
              { value: "open", label: "All open leads" },
              { value: "all", label: "All leads" },
              { value: "won", label: "Closed won" },
              { value: "lost", label: "Closed lost" },
              ...stages.map((s) => ({ value: String(s.id), label: `Stage: ${s.name}` })),
            ]}
          />
          {isManager ? <Select value={owner} onChange={setOwner} options={owners} style={{ minWidth: 160 }} /> : null}
          <Text style={{ color: colors.textSecondary }}>
            {rows.length} leads · {money(total)}
          </Text>
        </Row>
        {loading && !leads ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(l) => l.id}
            onRowPress={(l) => router.push(`/leads/${l.id}`)}
            empty={leads?.length ? "No leads match these filters." : "No leads yet. Add one or import a spreadsheet."}
          />
        )}
      </Card>
    </Screen>
  );
}
