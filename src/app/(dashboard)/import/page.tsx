'use client';

import { useState, useRef } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';

// ─── Types ───────────────────────────────────────────────
type ImportType = 'customers' | 'vehicles' | 'parts';
type Step = 'type' | 'map' | 'validate' | 'importing' | 'done';
type DupMode = 'skip' | 'update';

interface FieldDef { key: string; label: string; required: boolean }
interface Issue { row: number; issue: string }
interface ImportResult { imported: number; updated?: number; skipped: number; unmatched?: number; errors: { row: number; error: string }[] }

// ─── Field definitions per import type ───────────────────
const FIELDS: Record<ImportType, FieldDef[]> = {
  customers: [
    { key: 'name', label: 'Name', required: true },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'address', label: 'Address', required: false },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: false },
    { key: 'zip', label: 'Zip', required: false },
  ],
  vehicles: [
    { key: 'customer_name', label: 'Customer Name', required: true },
    { key: 'customer_email', label: 'Customer Email', required: false },
    { key: 'year', label: 'Year', required: false },
    { key: 'make', label: 'Make', required: true },
    { key: 'model', label: 'Model', required: true },
    { key: 'vin', label: 'VIN', required: false },
    { key: 'plate', label: 'Plate', required: false },
  ],
  parts: [
    { key: 'name', label: 'Part Name', required: true },
    { key: 'part_number', label: 'Part Number', required: false },
    { key: 'category', label: 'Category', required: false },
    { key: 'qty_on_hand', label: 'Qty on Hand', required: false },
    { key: 'cost', label: 'Cost', required: false },
    { key: 'price', label: 'Price', required: false },
  ],
};

// ─── Auto-detect aliases ─────────────────────────────────
const ALIASES: Record<string, string[]> = {
  name: ['name', 'customer name', 'full name', 'customer', 'client name', 'client', 'part name', 'item name', 'description'],
  phone: ['phone', 'phone number', 'phone #', 'tel', 'telephone', 'mobile', 'cell', 'cell phone'],
  email: ['email', 'e-mail', 'email address', 'e-mail address'],
  address: ['address', 'street', 'street address', 'address line 1', 'addr', 'address1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province'],
  zip: ['zip', 'zip code', 'zipcode', 'postal', 'postal code'],
  customer_name: ['customer name', 'customer', 'owner', 'owner name', 'client', 'client name'],
  customer_email: ['customer email', 'owner email', 'client email'],
  year: ['year', 'yr', 'vehicle year', 'model year'],
  make: ['make', 'vehicle make', 'manufacturer'],
  model: ['model', 'vehicle model'],
  vin: ['vin', 'vin number', 'vehicle identification number', 'vin #'],
  plate: ['plate', 'license plate', 'plate number', 'license', 'tag', 'plate #', 'license #'],
  part_number: ['part number', 'part #', 'part no', 'sku', 'p/n', 'item number', 'item #', 'item no', 'partno'],
  category: ['category', 'type', 'group', 'class', 'cat'],
  qty_on_hand: ['qty', 'quantity', 'qty on hand', 'on hand', 'stock', 'count', 'in stock', 'qty_on_hand'],
  cost: ['cost', 'unit cost', 'buy price', 'wholesale', 'our cost'],
  price: ['price', 'sell price', 'retail', 'retail price', 'unit price', 'sale price', 'selling price'],
};

// ─── CSV parser ──────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  // Split into lines respecting quoted newlines
  const lines: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '""'; i++; }
      else { inQ = !inQ; cur += ch; }
    } else if (ch === '\n' && !inQ) {
      if (cur.endsWith('\r')) cur = cur.slice(0, -1);
      if (cur.trim()) lines.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) lines.push(cur);

  if (lines.length === 0) return { headers: [], rows: [] };
  return {
    headers: parseLine(lines[0]),
    rows: lines.slice(1).map(parseLine),
  };
}

// ─── Auto-map headers to fields ──────────────────────────
function autoMap(csvHeaders: string[], fields: FieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const f of fields) {
    const aliases = ALIASES[f.key] || [f.key];
    for (const h of csvHeaders) {
      if (used.has(h)) continue;
      const norm = h.toLowerCase().replace(/[_#./]/g, ' ').trim();
      if (aliases.some(a => a === norm || norm.includes(a) || a.includes(norm))) {
        mapping[f.key] = h;
        used.add(h);
        break;
      }
    }
  }
  return mapping;
}

// ─── Validate mapped rows ────────────────────────────────
function validateRows(
  csvRows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  fields: FieldDef[],
): { mapped: Record<string, string>[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const mapped: Record<string, string>[] = [];

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const obj: Record<string, string> = {};
    for (const f of fields) {
      const csvCol = mapping[f.key];
      if (!csvCol) continue;
      const colIdx = headers.indexOf(csvCol);
      if (colIdx >= 0 && row[colIdx]) obj[f.key] = row[colIdx];
    }

    // Check required fields
    const missing = fields.filter(f => f.required && !obj[f.key]?.trim());
    if (missing.length > 0) {
      issues.push({ row: i + 1, issue: `Missing: ${missing.map(f => f.label).join(', ')}` });
    } else {
      mapped.push(obj);
    }
  }
  return { mapped, issues };
}

// ─── Styles ──────────────────────────────────────────────
const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

const STEP_LABELS = ['Select Type', 'Upload & Map', 'Validate', 'Import'];

// ═════════════════════════════════════════════════════════
function ImportWizard() {
  const [step, setStep] = useState<Step>('type');
  const [importType, setImportType] = useState<ImportType | null>(null);

  // CSV data
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');

  // Mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Validation
  const [mappedRows, setMappedRows] = useState<Record<string, string>[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dupMode, setDupMode] = useState<DupMode>('skip');

  // Import
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = importType ? FIELDS[importType] : [];
  const stepIdx = step === 'type' ? 0 : step === 'map' ? 1 : step === 'validate' ? 2 : 3;

  // ─── Handlers ────────────────────────────────────────
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setCsvRows(r);
      setFileName(file.name);
      // Auto-map
      if (importType) {
        setMapping(autoMap(h, FIELDS[importType]));
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  };

  const goToValidate = () => {
    const { mapped, issues: iss } = validateRows(csvRows, headers, mapping, fields);
    setMappedRows(mapped);
    setIssues(iss);
    setStep('validate');
  };

  const runImport = async () => {
    if (!importType) return;
    setStep('importing');
    setResult(null);

    const endpoint =
      importType === 'customers' ? '/api/import/customers' :
      importType === 'vehicles' ? '/api/import/vehicles' :
      '/api/import/parts-inventory';

    const body: Record<string, unknown> = { rows: mappedRows };
    if (importType !== 'vehicles') body.mode = dupMode;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ imported: 0, skipped: 0, errors: [{ row: 0, error: 'Network error' }] });
    }
    setStep('done');
  };

  const reset = () => {
    setStep('type');
    setImportType(null);
    setHeaders([]);
    setCsvRows([]);
    setFileName('');
    setMapping({});
    setMappedRows([]);
    setIssues([]);
    setResult(null);
  };

  // ─── Preview table from mapping ──────────────────────
  const previewRows = csvRows.slice(0, 5);
  const mappedFields = fields.filter(f => mapping[f.key]);

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl font-bold text-white tracking-wide">Import Data</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-px ${i <= stepIdx ? 'bg-accent' : 'bg-bdr'}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold uppercase tracking-wider ${
              i === stepIdx ? 'bg-accent/20 text-accent' :
              i < stepIdx ? 'bg-success/10 text-success' :
              'bg-card text-slate-600'
            }`}>
              {i < stepIdx ? <Icon d={icons.check} size={12} /> : null}
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Step 1: Select Type ═══ */}
      {step === 'type' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { type: 'customers' as ImportType, label: 'Customers', desc: 'Name, phone, email, address', icon: icons.users, sample: 'name,phone,email,address,city,state,zip' },
            { type: 'vehicles' as ImportType, label: 'Vehicles', desc: 'Linked to customers by name/email', icon: icons.truck, sample: 'customer_name,year,make,model,vin,plate' },
            { type: 'parts' as ImportType, label: 'Parts Inventory', desc: 'Stock, costs, pricing', icon: icons.box, sample: 'name,part_number,category,qty_on_hand,cost,price' },
          ]).map(opt => (
            <button
              key={opt.type}
              onClick={() => { setImportType(opt.type); setStep('map'); }}
              className={`bg-card border border-bdr rounded-xl p-6 text-left hover:border-accent/50 transition group`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Icon d={opt.icon} size={20} stroke="#f97316" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg tracking-wide group-hover:text-accent transition">{opt.label}</h3>
              </div>
              <p className="text-sm text-slate-400 mb-3">{opt.desc}</p>
              <div className="bg-bg rounded-lg p-2.5 border border-bdr">
                <div className="text-[10px] text-slate-600 font-heading uppercase tracking-wider mb-1">Sample CSV header</div>
                <code className="text-[11px] text-slate-400 font-mono break-all">{opt.sample}</code>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ═══ Step 2: Upload & Map ═══ */}
      {step === 'map' && importType && (
        <div className="space-y-5">
          {/* File upload */}
          {csvRows.length === 0 ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="bg-card border-2 border-dashed border-bdr rounded-xl p-12 text-center cursor-pointer hover:border-accent/50 transition"
            >
              <Icon d={icons.upload} size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-sm text-slate-300 font-medium mb-1">Drop a CSV file here or click to browse</p>
              <p className="text-xs text-slate-600">Accepts .csv files only</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          ) : (
            <>
              {/* File info */}
              <div className="bg-card border border-bdr rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon d={icons.file} size={18} className="text-accent" />
                  <div>
                    <span className="text-sm text-white font-medium">{fileName}</span>
                    <span className="text-xs text-slate-500 ml-3">{csvRows.length} rows, {headers.length} columns</span>
                  </div>
                </div>
                <button onClick={() => { setCsvRows([]); setHeaders([]); setFileName(''); setMapping({}); }} className="text-xs text-slate-500 hover:text-error transition">
                  Remove
                </button>
              </div>

              {/* Column mapping */}
              <div className="bg-card border border-bdr rounded-xl p-5">
                <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">Column Mapping</h3>
                <div className="space-y-3">
                  {fields.map(f => (
                    <div key={f.key} className="flex items-center gap-4">
                      <div className="w-36 shrink-0">
                        <span className="text-sm text-slate-300">{f.label}</span>
                        {f.required && <span className="text-error text-xs ml-1">*</span>}
                      </div>
                      <Icon d={icons.chevRight} size={14} className="text-slate-600 shrink-0" />
                      <select
                        value={mapping[f.key] || ''}
                        onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}
                        className={`${inp} max-w-xs`}
                      >
                        <option value="">— Skip —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {mapping[f.key] && (
                        <span className="text-[10px] text-success font-heading uppercase tracking-wider">Mapped</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {mappedFields.length > 0 && (
                <div className="bg-card border border-bdr rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-bdr">
                    <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Preview (first {previewRows.length} rows)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-bdr bg-surface/30">
                          {mappedFields.map(f => (
                            <th key={f.key} className="px-4 py-2 text-left text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-bdr/50">
                            {mappedFields.map(f => {
                              const colIdx = headers.indexOf(mapping[f.key]);
                              return <td key={f.key} className="px-4 py-2 text-slate-300">{colIdx >= 0 ? row[colIdx] || '' : ''}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Btn variant="secondary" onClick={() => { setStep('type'); setCsvRows([]); setHeaders([]); setMapping({}); setFileName(''); }}>Back</Btn>
                <Btn
                  onClick={goToValidate}
                  disabled={!fields.filter(f => f.required).every(f => mapping[f.key])}
                >
                  Validate & Continue
                </Btn>
                {!fields.filter(f => f.required).every(f => mapping[f.key]) && (
                  <span className="text-xs text-error self-center">Map all required fields to continue</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Step 3: Validate ═══ */}
      {step === 'validate' && importType && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-bdr rounded-xl p-4">
              <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Valid Rows</div>
              <div className="text-2xl font-heading font-bold text-success">{mappedRows.length}</div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4">
              <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Rows with Issues</div>
              <div className={`text-2xl font-heading font-bold ${issues.length > 0 ? 'text-error' : 'text-white'}`}>{issues.length}</div>
            </div>
            <div className="bg-card border border-bdr rounded-xl p-4">
              <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Total in CSV</div>
              <div className="text-2xl font-heading font-bold text-white">{csvRows.length}</div>
            </div>
          </div>

          {/* Dedup mode (not for vehicles) */}
          {importType !== 'vehicles' && (
            <div className="bg-card border border-bdr rounded-xl p-5">
              <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-3">Duplicate Handling</h3>
              <p className="text-xs text-slate-500 mb-3">
                {importType === 'customers'
                  ? 'Duplicates are detected by matching phone number (normalized) or email address.'
                  : 'Duplicates are detected by matching part number.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDupMode('skip')}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-heading font-bold uppercase tracking-wider transition ${
                    dupMode === 'skip'
                      ? 'bg-accent/10 border-accent/50 text-accent'
                      : 'bg-bg border-bdr text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Skip Duplicates
                </button>
                <button
                  onClick={() => setDupMode('update')}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-heading font-bold uppercase tracking-wider transition ${
                    dupMode === 'update'
                      ? 'bg-accent/10 border-accent/50 text-accent'
                      : 'bg-bg border-bdr text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Update Existing
                </button>
              </div>
            </div>
          )}

          {importType === 'vehicles' && (
            <div className="bg-surface border border-bdr rounded-lg p-3 flex items-start gap-2">
              <Icon d={icons.alert} size={14} className="text-accent shrink-0 mt-0.5" />
              <span className="text-xs text-slate-400">
                Vehicles are matched to existing customers by name or email. Rows without a customer match will be skipped. Import customers first if needed. Vehicles with duplicate VINs are also skipped.
              </span>
            </div>
          )}

          {/* Issues table */}
          {issues.length > 0 && (
            <div className="bg-card border border-bdr rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-bdr">
                <span className="font-heading font-bold text-sm text-error uppercase tracking-wider">Rows with Issues (will be skipped)</span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bdr bg-surface/30">
                      <th className="px-4 py-2 text-left text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider w-20">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.slice(0, 50).map((iss, i) => (
                      <tr key={i} className="border-b border-bdr/50">
                        <td className="px-4 py-2 text-slate-400">{iss.row}</td>
                        <td className="px-4 py-2 text-error">{iss.issue}</td>
                      </tr>
                    ))}
                    {issues.length > 50 && (
                      <tr><td colSpan={2} className="px-4 py-2 text-xs text-slate-600">...and {issues.length - 50} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {mappedRows.length > 0 && (
            <div className="bg-card border border-bdr rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-bdr">
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Ready to Import (showing first 10)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bdr bg-surface/30">
                      {fields.filter(f => mapping[f.key]).map(f => (
                        <th key={f.key} className="px-4 py-2 text-left text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 10).map((row, ri) => (
                      <tr key={ri} className="border-b border-bdr/50">
                        {fields.filter(f => mapping[f.key]).map(f => (
                          <td key={f.key} className="px-4 py-2 text-slate-300">{row[f.key] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Btn variant="secondary" onClick={() => setStep('map')}>Back</Btn>
            <Btn onClick={runImport} disabled={mappedRows.length === 0}>
              Import {mappedRows.length} {importType === 'parts' ? 'Parts' : importType === 'vehicles' ? 'Vehicles' : 'Customers'}
            </Btn>
          </div>
        </div>
      )}

      {/* ═══ Step 3.5: Importing ═══ */}
      {step === 'importing' && (
        <div className="bg-card border border-bdr rounded-xl p-12 text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-accent mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-300 font-medium">Importing {mappedRows.length} records...</p>
          <p className="text-xs text-slate-600 mt-1">This may take a moment for large files.</p>
        </div>
      )}

      {/* ═══ Step 4: Results ═══ */}
      {step === 'done' && result && (
        <div className="space-y-5">
          <div className="bg-card border border-bdr rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <Icon d={icons.check} size={20} stroke="#22c55e" />
              </div>
              <h3 className="font-heading font-bold text-lg text-white tracking-wide">Import Complete</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Imported</div>
                <div className="text-xl font-heading font-bold text-success">{result.imported}</div>
              </div>
              {result.updated !== undefined && result.updated > 0 && (
                <div className="bg-bg border border-bdr rounded-lg p-3">
                  <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Updated</div>
                  <div className="text-xl font-heading font-bold text-accent">{result.updated}</div>
                </div>
              )}
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Skipped</div>
                <div className="text-xl font-heading font-bold text-slate-400">{result.skipped + (result.unmatched || 0)}</div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-bg border border-bdr rounded-lg p-3">
                  <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Errors</div>
                  <div className="text-xl font-heading font-bold text-error">{result.errors.length}</div>
                </div>
              )}
            </div>

            {result.unmatched !== undefined && result.unmatched > 0 && (
              <div className="mt-4 bg-surface border border-bdr rounded-lg p-3 flex items-start gap-2">
                <Icon d={icons.alert} size={14} className="text-accent shrink-0 mt-0.5" />
                <span className="text-xs text-slate-400">
                  {result.unmatched} vehicle(s) skipped because no matching customer was found. Import customers first, then re-import vehicles.
                </span>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-heading font-semibold text-error uppercase tracking-wider mb-2">Errors</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-xs text-slate-400">
                      {err.row > 0 ? `Row ${err.row}: ` : ''}{err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Btn onClick={reset}>Import More Data</Btn>
            <Btn variant="secondary" onClick={() => window.location.href = importType === 'vehicles' ? '/customers' : importType === 'parts' ? '/inventory' : '/customers'}>
              View {importType === 'parts' ? 'Inventory' : 'Customers'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return <ImportWizard />;
}
