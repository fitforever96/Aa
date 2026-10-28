"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Card, MoneyField, NumberField, SectionTitle, Select, TextArea, TextField, Callout } from "@/components/ui";
import { db } from "@/lib/db";
import { DEFAULT_MODEL_PROFILES } from "@/lib/engine/assumptions";
import { kindForModel } from "@/lib/factories";
import type { PropertyModel, ProposalKind } from "@/lib/types";
import type { StepProps } from "./types";
import { nowISO } from "@/lib/ids";

export const KIND_LABELS: Record<ProposalKind, string> = {
  small_commercial: "Commercial service proposal",
  multifamily_rotation: "Multifamily rotation program",
  intensive_treatment: "Intensive infestation treatment",
  industrial: "Industrial facility agreement",
  government: "Government procurement proposal",
  rfp: "Formal RFP response",
  portfolio: "Multi-property portfolio",
  consulting: "Institutional consulting engagement",
};

export function StepCustomer({ proposal: p, update }: StepProps) {
  const customers = useLiveQuery(() => db().customers.orderBy("name").toArray(), []);
  const c = p.customer;
  const pr = p.property;
  const setC = (k: keyof typeof c, v: string) => update((d) => void ((d.customer as unknown as Record<string, unknown>)[k] = v));
  const setA = (k: keyof typeof pr.address, v: string) => update((d) => void (d.property.address[k] = v));

  const saveCustomer = async () => {
    if (!p.customer.name.trim()) return;
    await db().customers.put({ ...p.customer, updatedAt: nowISO() });
    update((d) => void (d.customerId = d.customer.id));
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Proposal</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          <TextField label="Proposal title" value={p.title} onChange={(v) => update((d) => void (d.title = v))} className="sm:col-span-2" />
          <TextField label="Subtitle (optional)" value={p.subtitle} onChange={(v) => update((d) => void (d.subtitle = v))} placeholder="e.g. Portfolio proposal" />
          <Select label="Proposal type" value={p.kind} onChange={(v) => update((d) => void (d.kind = v))} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value: value as ProposalKind, label }))} />
        </Card>
      </div>

      <div>
        <SectionTitle>Customer</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          {customers && customers.length > 0 && (
            <Select
              label="Existing customer"
              className="sm:col-span-2"
              value={p.customerId ?? ""}
              onChange={(id) => {
                const found = customers.find((x) => x.id === id);
                if (found) update((d) => void ((d.customer = { ...found }), (d.customerId = found.id)));
              }}
              options={[{ value: "", label: "— New customer —" }, ...customers.map((x) => ({ value: x.id, label: x.name }))]}
            />
          )}
          <div className="sm:col-span-2" onBlur={saveCustomer}>
            <TextField label="Customer name" value={c.name} onChange={(v) => setC("name", v)} autoComplete="organization" />
          </div>
          <div onBlur={saveCustomer}>
            <TextField label="Contact" value={c.contactName} onChange={(v) => setC("contactName", v)} autoComplete="name" />
          </div>
          <div onBlur={saveCustomer}>
            <TextField label="Contact title" value={c.contactTitle} onChange={(v) => setC("contactTitle", v)} autoComplete="organization-title" />
          </div>
          <div onBlur={saveCustomer}>
            <TextField label="Email" type="email" value={c.email} onChange={(v) => setC("email", v)} autoComplete="email" />
          </div>
          <div onBlur={saveCustomer}>
            <TextField label="Phone" type="tel" value={c.phone} onChange={(v) => setC("phone", v)} autoComplete="tel" />
          </div>
          <MoneyField
            label="Customer-specific labor rate (per hour)"
            hint="Leave blank to use your default estimating rate. Internal only."
            cents={c.laborRateOverrideCents}
            onChange={(v) => update((d) => void (d.customer.laborRateOverrideCents = v))}
            placeholder="Default"
          />
        </Card>
      </div>

      <div>
        <SectionTitle>Property</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          <TextField label="Property name" value={pr.name} onChange={(v) => update((d) => void (d.property.name = v))} className="sm:col-span-2" />
          <TextField label="Street address" value={pr.address.line1} onChange={(v) => setA("line1", v)} autoComplete="street-address" className="sm:col-span-2" hint="Address autocomplete requires a configured location provider; enter the address exactly as confirmed." />
          <TextField label="City" value={pr.address.city} onChange={(v) => setA("city", v)} autoComplete="address-level2" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="State" value={pr.address.state} onChange={(v) => setA("state", v.toUpperCase().slice(0, 2))} autoComplete="address-level1" />
            <TextField label="ZIP" value={pr.address.zip} onChange={(v) => setA("zip", v)} inputMode="numeric" autoComplete="postal-code" />
          </div>
          <TextField label="Property type" value={pr.propertyType} onChange={(v) => update((d) => void (d.property.propertyType = v))} placeholder="Distribution warehouse, Class A office…" />
          <Select
            label="Estimating model"
            value={pr.model}
            hint={DEFAULT_MODEL_PROFILES[pr.model].description}
            onChange={(v: PropertyModel) =>
              update((d) => {
                d.property.model = v;
                if (d.kind === kindForModel(p.property.model)) d.kind = kindForModel(v);
              })
            }
            options={Object.entries(DEFAULT_MODEL_PROFILES).map(([value, m]) => ({ value: value as PropertyModel, label: m.label }))}
          />
          <NumberField label="Approx. square feet" value={pr.squareFeet} allowNull onChange={(v) => update((d) => void (d.property.squareFeet = v))} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Buildings" value={pr.buildingCount} min={1} stepper onChange={(v) => update((d) => void (d.property.buildingCount = v ?? 1))} />
            <NumberField label="Floors" value={pr.floorCount} min={1} stepper onChange={(v) => update((d) => void (d.property.floorCount = v ?? 1))} />
          </div>
          {(pr.model === "multifamily" || p.kind === "multifamily_rotation" || p.kind === "portfolio") && <NumberField label="Apartment count" value={pr.apartmentCount} allowNull onChange={(v) => update((d) => void (d.property.apartmentCount = v))} />}
          <TextField label="Operating environment" value={pr.operatingEnvironment} onChange={(v) => update((d) => void (d.property.operatingEnvironment = v))} placeholder="24/7 distribution, two shifts…" />
          <TextArea label="Relevant facility information" className="sm:col-span-2" rows={3} value={pr.facilityNotes} onChange={(v) => update((d) => void (d.property.facilityNotes = v))} placeholder="Only confirmed facts — these may inform the written proposal." />
        </Card>
        <Callout className="mt-3">The app never invents addresses or contacts. Leave fields blank if unknown; QC will flag missing customer information before export.</Callout>
      </div>
    </div>
  );
}
