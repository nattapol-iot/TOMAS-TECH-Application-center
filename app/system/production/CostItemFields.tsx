"use client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import type { BootstrapData, CostItemInput } from "../api-client";
import { Field } from "../ui";
export const COST_CATEGORIES = [
  ["01", "Hardware"], ["02", "Software"], ["03", "Electrical"], ["04", "Mechanical"], ["05", "Robot"],
  ["06", "Engineering"], ["07", "Outsource"], ["08", "Transportation"], ["09", "Accommodation"], ["10", "Other Cost"],
] as const;
export const UNITS = ["Set", "Pcs", "Lot", "Unit", "Meter", "Day", "Month", "Service", "Trip", "Night", "Person", "Km"];
export const PRICE_SOURCES = ["Supplier Quotation", "Price Library", "Previous Project", "Budgetary", "Previous Estimate", "Previous Project Cost", "Purchase Price", "Master Price", "Manual Estimate", "Budgetary Price", "Master Template"];
export type CostItemFieldsValue = Pick<CostItemInput, "categoryCode" | "category" | "subcategory" | "itemCode" | "description" | "brand" | "model" | "specification" | "supplierId" | "quantity" | "unit" | "unitCost" | "priceSource" | "priceDate" | "remark">;
const formatMoney = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB" }).format(Number.isFinite(value) ? value : 0);
export const COST_ITEM_TABLE_COLUMNS = [
  { title: "Category / Subcategory", labels: ["Category *", "Subcategory"] },
  { title: "Item code *", labels: ["Item code *"] },
  { title: "Description / Specification *", labels: ["Description *", "Specification"] },
  { title: "Brand / Model", labels: ["Brand", "Model"] },
  { title: "Supplier", labels: ["Supplier"] },
  { title: "Qty / 1 set *", labels: ["Quantity / 1 set *", "Quantity *"] },
  { title: "Unit *", labels: ["Unit *"] },
  { title: "Unit cost (THB) *", labels: ["Unit cost (THB) *"] },
  { title: "Line total", labels: ["Line total"] },
  { title: "Price source / Date", labels: ["Price source *", "Price date"] },
  { title: "Remark", labels: ["Remark"] },
];
export function CostItemFields({ form, onChange, suppliers, allowedCategories = COST_CATEGORIES, perSet = false, layout = "form", moduleField, ownerField, referenceNumberField, referenceProjectField, statusField }: {
  form: CostItemFieldsValue;
  onChange: (patch: Partial<CostItemFieldsValue>) => void;
  suppliers: BootstrapData["suppliers"];
  allowedCategories?: ReadonlyArray<readonly [string, string]>;
  perSet?: boolean;
  layout?: "form" | "table";
  moduleField?: ReactNode; ownerField?: ReactNode; referenceNumberField?: ReactNode; referenceProjectField?: ReactNode; statusField?: ReactNode;
}) {
  const update = <K extends keyof CostItemFieldsValue>(key: K, value: CostItemFieldsValue[K]) => onChange({ [key]: value });
  const content = <div className="form-grid four">
      <Field label="Category *"><select value={form.categoryCode} onChange={(event) => { const selected = COST_CATEGORIES.find(([code]) => code === event.target.value); onChange({ categoryCode: event.target.value, category: selected?.[1] ?? form.category }); }}>{allowedCategories.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select></Field>
      <Field label="Subcategory"><input maxLength={100} value={form.subcategory ?? ""} onChange={(event) => update("subcategory", event.target.value)} /></Field>
      {moduleField}
      <Field label="Item code *"><input required maxLength={100} value={form.itemCode} onChange={(event) => update("itemCode", event.target.value)} /></Field>
      <Field label="Description *" span={2}><input required maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
      <Field label="Brand"><input maxLength={100} value={form.brand ?? ""} onChange={(event) => update("brand", event.target.value)} /></Field>
      <Field label="Model"><input maxLength={200} value={form.model ?? ""} onChange={(event) => update("model", event.target.value)} /></Field>
      <Field label="Specification" span={2}><textarea maxLength={20000} rows={3} value={form.specification ?? ""} onChange={(event) => update("specification", event.target.value)} /></Field>
      <Field label="Supplier"><select value={form.supplierId ?? ""} onChange={(event) => update("supplierId", event.target.value ? Number(event.target.value) : undefined)}><option value=""><LocalizedText text={"No supplier"} /></option>{form.supplierId && !suppliers.some((supplier) => supplier.id === form.supplierId) ? <option value={form.supplierId}><LocalizedText text={"Supplier #"} />{form.supplierId} <LocalizedText text={"(inactive)"} /></option> : null}{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}</select></Field>
      {ownerField}
      <Field label={perSet ? "Quantity / 1 set *" : "Quantity *"}><input type="number" min="0.0001" required max="999999999.9999" step="0.0001" value={Number.isFinite(form.quantity) ? form.quantity : ""} onChange={(event) => update("quantity", event.target.valueAsNumber)} /></Field>
      <Field label="Unit *"><select value={form.unit} onChange={(event) => update("unit", event.target.value)}>{!UNITS.includes(form.unit) && form.unit ? <option>{form.unit}</option> : null}{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
      <Field label="Unit cost (THB) *"><input type="number" min="0" required max="999999999.9999" step="0.0001" value={Number.isFinite(form.unitCost) ? form.unitCost : ""} onChange={(event) => update("unitCost", event.target.valueAsNumber)} /></Field>
      <Field label="Line total" hint={perSet ? "Reference total / 1 set" : "Calculated by SQL Server"}><input className="calculated" readOnly value={formatMoney(form.quantity * form.unitCost)} /></Field>
      <Field label="Price source *"><select value={form.priceSource} onChange={(event) => update("priceSource", event.target.value)}>{!PRICE_SOURCES.includes(form.priceSource) ? <option value={form.priceSource}>{form.priceSource || "Select price source"}</option> : null}{PRICE_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></Field>
      {referenceNumberField}
      {referenceProjectField}
      <Field label="Price date"><input type="date" value={form.priceDate ?? ""} onChange={(event) => update("priceDate", event.target.value || undefined)} /></Field>
      <Field label="Remark" span={4}><textarea maxLength={20000} rows={2} value={form.remark ?? ""} onChange={(event) => update("remark", event.target.value)} /></Field>
      {statusField}
    </div>;
  if (layout === "table") {
    const fields = Children.toArray(content.props.children).filter((child) => isValidElement<ComponentProps<typeof Field>>(child) && child.type === Field);
    return <>{COST_ITEM_TABLE_COLUMNS.map((column) => <td key={column.title}>{fields.filter((child) => isValidElement<ComponentProps<typeof Field>>(child) && column.labels.includes(child.props.label)).map((child) => {
      if (!isValidElement<ComponentProps<typeof Field>>(child)) return child;
      const control = child.props.children;
      if (!isValidElement<{ "aria-label"?: string; placeholder?: string }>(control)) return child;
      return cloneElement(child, { span: undefined, hint: undefined, children: cloneElement(control, {
        "aria-label": child.props.label,
        ...(control.type === "input" || control.type === "textarea" ? { placeholder: child.props.label.replace(" *", "") } : {}),
      }) });
    })}</td>)}</>;
  }
  return content;
}
