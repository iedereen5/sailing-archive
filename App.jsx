import { useState, useEffect, useCallback } from "react";

// ============================================================
// CONFIGURATION — fill these in after setup
// ============================================================
const SUPABASE_URL = "https://opbsfyqnyymjdulitbln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wYnNmeXFueXltamR1bGl0YmxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzMzMTEsImV4cCI6MjA5MzE0OTMxMX0.fXEXoa0-b3GdiPM4Ioa69Rls1YUeOlA7Te2cVeqO9bQ";

// ============================================================
// SUPABASE HELPERS
// ============================================================
const sb = async (path, method = "GET", body = null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) throw new Error(await res.text());
  return method === "DELETE" ? null : res.json();
};

// ============================================================
// CLAUDE API — extract race data from PDF/image (base64)
// ============================================================
const extractWithClaude = async (base64Data, mediaType) => {
  const isImage = mediaType.startsWith("image/");
  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } };

  const prompt = `You are extracting sailing race results from a Dutch race results document (finishlijst).

Extract EXACTLY this JSON structure. Return ONLY valid JSON, no markdown, no explanation:

{
  "regatta_name": "string (e.g. Brijbekken Race 2025)",
  "race_class": "string (e.g. VA Klasse)",
  "race_number": "string (e.g. VA Race1 or Race 1)",
  "handicap_method": "string (e.g. TijdVermenigvuldigingsFactor [ZW] - Medium)",
  "race_date": "YYYY-MM-DD",
  "location": "string",
  "results": [
    {
      "sail_number": "string",
      "boat_name": "string",
      "skipper": "string",
      "position": "string (number or ocs/dnf/dns/dsq)",
      "points": "string",
      "finish_time": "string (HH:MM:SS or empty)",
      "sailed_time": "string (HH:MM:SS or empty)",
      "corrected_time": "string (HH:MM:SS or empty)",
      "delta_time": "string (HH:MM:SS or empty)",
      "handicap_factor": "string (ToT value)"
    }
  ]
}

Dutch field mapping:
- Zeilnr = sail_number
- Bootnaam = boat_name  
- Naam = skipper
- Uitslag = position
- Punten = points
- Finish Tijd = finish_time
- Gezeilde Tijd = sailed_time
- Gecorr. Tijd = corrected_time
- Delta Tijd = delta_time
- ToT = handicap_factor`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

// ============================================================
// EXPORT HELPERS
// ============================================================
const exportToCSV = (results, filename) => {
  const headers = ["Sail Nr","Boat","Skipper","Position","Points","Finish Time","Corrected Time","Handicap","Regatta","Race","Date"];
  const rows = results.map(r => [
    r.sail_number, r.boat_name, r.skipper, r.position, r.points,
    r.finish_time, r.corrected_time, r.handicap_factor,
    r.races?.regatta_name, r.races?.race_number, r.races?.race_date
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v||""}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
};

// ============================================================
// STYLES
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --navy: #0a1628;
    --navy2: #0f2044;
    --blue: #1a4a8a;
    --sky: #2d7dd2;
    --accent: #f0a500;
    --white: #f5f7fa;
    --gray: #8898aa;
    --light: #e8edf4;
    --danger: #e53e3e;
    --success: #38a169;
  }

  body { background: var(--navy); color: var(--white); font-family: 'Barlow', sans-serif; min-height: 100vh; }

  .app { min-height: 100vh; background: linear-gradient(160deg, var(--navy) 0%, #0d1f3c 50%, #071220 100%); }

  /* HEADER */
  .header {
    background: linear-gradient(90deg, var(--navy2) 0%, var(--blue) 100%);
    border-bottom: 3px solid var(--accent);
    padding: 0 2rem;
    display: flex; align-items: center; justify-content: space-between;
    height: 64px; position: sticky; top: 0; z-index: 100;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  }
  .header-brand { display: flex; align-items: center; gap: 0.75rem; }
  .header-logo { font-size: 1.6rem; }
  .header-title { font-family: 'Barlow Condensed', sans-serif; font-size: 1.4rem; font-weight: 900; letter-spacing: 0.05em; color: var(--white); text-transform: uppercase; }
  .header-title span { color: var(--accent); }
  .header-nav { display: flex; gap: 0.25rem; }
  .nav-btn { background: none; border: none; color: var(--gray); font-family: 'Barlow Condensed', sans-serif; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.4rem 0.9rem; border-radius: 4px; cursor: pointer; transition: all 0.15s; }
  .nav-btn:hover { color: var(--white); background: rgba(255,255,255,0.08); }
  .nav-btn.active { color: var(--accent); background: rgba(240,165,0,0.12); }

  /* MAIN */
  .main { max-width: 1200px; margin: 0 auto; padding: 2rem; }

  /* CARDS */
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card-title { font-family: 'Barlow Condensed', sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin-bottom: 1rem; }

  /* UPLOAD ZONE */
  .upload-zone {
    border: 2px dashed rgba(45,125,210,0.4); border-radius: 12px;
    padding: 3rem 2rem; text-align: center; cursor: pointer;
    transition: all 0.2s; background: rgba(45,125,210,0.04);
  }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--sky); background: rgba(45,125,210,0.08); }
  .upload-icon { font-size: 3rem; margin-bottom: 1rem; }
  .upload-title { font-family: 'Barlow Condensed', sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--white); margin-bottom: 0.5rem; }
  .upload-sub { color: var(--gray); font-size: 0.875rem; }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.2rem; border-radius: 6px; font-family: 'Barlow Condensed', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: var(--sky); color: #fff; }
  .btn-primary:hover { background: #2570c0; }
  .btn-success { background: var(--success); color: #fff; }
  .btn-success:hover { background: #2d8a57; }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-danger:hover { background: #c53030; }
  .btn-ghost { background: rgba(255,255,255,0.07); color: var(--white); }
  .btn-ghost:hover { background: rgba(255,255,255,0.12); }
  .btn-accent { background: var(--accent); color: var(--navy); }
  .btn-accent:hover { background: #d4920a; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* FORM */
  .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
  .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .form-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gray); }
  .form-input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 0.55rem 0.75rem; color: var(--white); font-size: 0.875rem; font-family: 'Barlow', sans-serif; outline: none; transition: border 0.15s; }
  .form-input:focus { border-color: var(--sky); background: rgba(45,125,210,0.08); }

  /* TABLE */
  .table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  thead { background: rgba(255,255,255,0.06); }
  th { padding: 0.6rem 0.8rem; text-align: left; font-family: 'Barlow Condensed', sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gray); white-space: nowrap; }
  td { padding: 0.55rem 0.8rem; border-top: 1px solid rgba(255,255,255,0.05); white-space: nowrap; }
  tr:hover td { background: rgba(255,255,255,0.03); }
  .pos-badge { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: 0.85rem; }
  .pos-1 { background: #f0a500; color: #000; }
  .pos-2 { background: #9eaab5; color: #000; }
  .pos-3 { background: #cd7f32; color: #fff; }
  .pos-other { background: rgba(255,255,255,0.08); color: var(--gray); }
  .pos-special { background: rgba(229,62,62,0.2); color: #fc8181; font-size: 0.65rem; border-radius: 4px; padding: 0.1rem 0.3rem; }

  /* FILTERS */
  .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1.5rem; }
  .filter-select { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 0.5rem 0.75rem; color: var(--white); font-size: 0.875rem; outline: none; min-width: 160px; }
  .filter-select option { background: var(--navy2); }

  /* STATS BAR */
  .stats-bar { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .stat-item { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.75rem 1.2rem; flex: 1; min-width: 120px; }
  .stat-val { font-family: 'Barlow Condensed', sans-serif; font-size: 1.8rem; font-weight: 900; color: var(--accent); line-height: 1; }
  .stat-lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gray); margin-top: 0.2rem; }

  /* ALERT */
  .alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  .alert-info { background: rgba(45,125,210,0.15); border: 1px solid rgba(45,125,210,0.3); color: #90cdf4; }
  .alert-success { background: rgba(56,161,105,0.15); border: 1px solid rgba(56,161,105,0.3); color: #9ae6b4; }
  .alert-error { background: rgba(229,62,62,0.15); border: 1px solid rgba(229,62,62,0.3); color: #feb2b2; }

  /* SPINNER */
  .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--sky); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* CONFIRMATION */
  .confirm-header { background: rgba(45,125,210,0.1); border: 1px solid rgba(45,125,210,0.2); border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.5rem; }
  .confirm-meta { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem; font-size: 0.875rem; }
  .confirm-meta-item { color: var(--gray); }
  .confirm-meta-item strong { color: var(--white); }

  /* SETUP */
  .setup-box { max-width: 560px; margin: 3rem auto; }
  .setup-step { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
  .setup-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--accent); color: var(--navy); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: 0.9rem; }
  .setup-content h3 { font-family: 'Barlow Condensed', sans-serif; font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
  .setup-content p { color: var(--gray); font-size: 0.875rem; line-height: 1.5; }
  .setup-content code { background: rgba(255,255,255,0.08); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8rem; color: var(--accent); }

  /* TABS */
  .tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 1.5rem; }
  .tab { background: none; border: none; color: var(--gray); font-family: 'Barlow Condensed', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.6rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
  .tab:hover { color: var(--white); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .empty-state { text-align: center; padding: 3rem 1rem; color: var(--gray); }
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; }

  /* MOBILE */
  @media (max-width: 600px) {
    .main { padding: 1rem; }
    .header { padding: 0 1rem; }
    .header-title { font-size: 1.1rem; }
    .nav-btn { padding: 0.4rem 0.6rem; font-size: 0.75rem; }
    .form-grid { grid-template-columns: 1fr 1fr; }
  }
`;

// ============================================================
// SETUP PAGE
// ============================================================
const SetupPage = ({ onSave }) => {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");

  const isDemo = !SUPABASE_URL.startsWith("https://");

  return (
    <div className="main">
      <div className="setup-box">
        {isDemo && (
          <div className="alert alert-info" style={{ marginBottom: "2rem" }}>
            ⚙️ <strong>Setup required</strong> — connect your Supabase database to start saving results.
            Until then the app runs in <strong>demo mode</strong> (data not saved).
          </div>
        )}
        <div className="card">
          <div className="card-title">🗄️ Database Setup</div>

          <div className="setup-step">
            <div className="setup-num">1</div>
            <div className="setup-content">
              <h3>Create Supabase account</h3>
              <p>Go to <strong>supabase.com</strong>, sign up free, create a new project.</p>
            </div>
          </div>

          <div className="setup-step">
            <div className="setup-num">2</div>
            <div className="setup-content">
              <h3>Run this SQL in Supabase</h3>
              <p>Go to <strong>SQL Editor</strong> and paste:</p>
              <pre style={{ background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "6px", fontSize: "0.75rem", marginTop: "0.5rem", overflowX: "auto", color: "#90cdf4", lineHeight: 1.6 }}>
{`create table races (
  id uuid primary key default gen_random_uuid(),
  regatta_name text, race_class text,
  race_number text, handicap_method text,
  race_date date, location text,
  created_at timestamptz default now()
);
create table results (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  sail_number text, boat_name text, skipper text,
  position text, points text,
  finish_time text, sailed_time text,
  corrected_time text, delta_time text,
  handicap_factor text,
  created_at timestamptz default now()
);
alter table races enable row level security;
alter table results enable row level security;
create policy "allow all" on races for all using (true) with check (true);
create policy "allow all" on results for all using (true) with check (true);`}
              </pre>
            </div>
          </div>

          <div className="setup-step">
            <div className="setup-num">3</div>
            <div className="setup-content">
              <h3>Get your API keys</h3>
              <p>In Supabase go to <strong>Settings → API</strong>. Copy your <code>Project URL</code> and <code>anon public</code> key.</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Supabase Project URL</label>
              <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </div>
            <div className="form-group">
              <label className="form-label">Supabase Anon Key</label>
              <input className="form-input" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGc..." />
            </div>
            <button className="btn btn-accent" disabled={!url || !key} onClick={() => onSave(url, key)}>
              💾 Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// POSITION BADGE
// ============================================================
const PosBadge = ({ pos }) => {
  const n = parseInt(pos);
  if (isNaN(n)) return <span className="pos-special">{pos?.toUpperCase()}</span>;
  const cls = n === 1 ? "pos-1" : n === 2 ? "pos-2" : n === 3 ? "pos-3" : "pos-other";
  return <span className={`pos-badge ${cls}`}>{n}</span>;
};

// ============================================================
// UPLOAD PAGE
// ============================================================
const UploadPage = ({ supabaseUrl, supabaseKey }) => {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const processFile = async (file) => {
    setLoading(true);
    setStatus({ type: "info", msg: "📖 Reading file with AI…" });
    setSaved(false);
    setExtracted(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const data = await extractWithClaude(base64, file.type);
      setExtracted(data);
      setStatus({ type: "success", msg: `✅ Extracted ${data.results?.length} results. Check below and confirm.` });
    } catch (e) {
      setStatus({ type: "error", msg: `❌ Extraction failed: ${e.message}` });
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus({ type: "info", msg: "💾 Saving to database…" });
    try {
      // Use local supabase helpers with current keys
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      const raceRes = await fetch(`${supabaseUrl}/rest/v1/races`, {
        method: "POST", headers,
        body: JSON.stringify({
          regatta_name: extracted.regatta_name,
          race_class: extracted.race_class,
          race_number: extracted.race_number,
          handicap_method: extracted.handicap_method,
          race_date: extracted.race_date,
          location: extracted.location,
        }),
      });
      const races = await raceRes.json();
      const raceId = races[0]?.id;
      const resultsPayload = extracted.results.map(r => ({ ...r, race_id: raceId }));
      await fetch(`${supabaseUrl}/rest/v1/results`, {
        method: "POST", headers: { ...headers, Prefer: "" },
        body: JSON.stringify(resultsPayload),
      });
      setStatus({ type: "success", msg: "🏆 Results saved to archive!" });
      setSaved(true);
    } catch (e) {
      setStatus({ type: "error", msg: `❌ Save failed: ${e.message}` });
    }
    setSaving(false);
  };

  const updateField = (field, val) => setExtracted(p => ({ ...p, [field]: val }));
  const updateResult = (i, field, val) => setExtracted(p => ({
    ...p,
    results: p.results.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
  }));
  const removeResult = (i) => setExtracted(p => ({ ...p, results: p.results.filter((_, idx) => idx !== i) }));

  return (
    <div>
      {status && <div className={`alert alert-${status.type}`}>{status.msg}</div>}

      {!extracted && (
        <div className="upload-zone" style={{ cursor: "default" }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ margin: "0 auto 1rem" }} />
              <div className="upload-title">Extracting results…</div>
              <div className="upload-sub">Please wait, reading your document</div>
            </>
          ) : (
            <>
              <div className="upload-icon">⛵</div>
              <div className="upload-title" style={{ marginBottom: "1.5rem" }}>Upload Results Sheet</div>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                background: "var(--sky)", color: "#fff", padding: "0.8rem 2rem",
                borderRadius: "8px", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase"
              }}>
                <input type="file" accept=".pdf,image/*"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files[0]) processFile(e.target.files[0]); }} />
                📂 Select PDF or Photo
              </label>
              <div className="upload-sub" style={{ marginTop: "1rem" }}>or drag & drop here</div>
            </>
          )}
        </div>
      )}

      {extracted && (
        <>
          <div className="confirm-header">
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ✅ Review Extracted Data
            </div>
            <div className="confirm-meta">
              <span className="confirm-meta-item"><strong>Regatta:</strong> {extracted.regatta_name}</span>
              <span className="confirm-meta-item"><strong>Race:</strong> {extracted.race_number}</span>
              <span className="confirm-meta-item"><strong>Date:</strong> {extracted.race_date}</span>
              <span className="confirm-meta-item"><strong>Results:</strong> {extracted.results?.length}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Race Info</div>
            <div className="form-grid">
              {[["regatta_name","Regatta Name"],["race_class","Class"],["race_number","Race Number"],["handicap_method","Handicap Method"],["race_date","Date (YYYY-MM-DD)"],["location","Location"]].map(([k,l]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{l}</label>
                  <input className="form-input" value={extracted[k] || ""} onChange={e => updateField(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Results ({extracted.results?.length} boats)</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Sail</th><th>Boat</th><th>Skipper</th><th>Pos</th><th>Pts</th>
                    <th>Finish</th><th>Corrected</th><th>ToT</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.results?.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--gray)", fontSize: "0.75rem" }}>{i + 1}</td>
                      {["sail_number","boat_name","skipper","position","points","finish_time","corrected_time","handicap_factor"].map(f => (
                        <td key={f}>
                          <input style={{ background: "transparent", border: "none", color: "var(--white)", width: f === "boat_name" || f === "skipper" ? "110px" : "70px", outline: "none", fontSize: "0.82rem" }}
                            value={r[f] || ""} onChange={e => updateResult(i, f, e.target.value)} />
                        </td>
                      ))}
                      <td><button style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.9rem" }} onClick={() => removeResult(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {!saved && (
              <button className="btn btn-success" disabled={saving} onClick={handleSave}>
                {saving ? <><span className="spinner" /> Saving…</> : "💾 Save to Archive"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { setExtracted(null); setStatus(null); setSaved(false); }}>
              ↩ Upload Another
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// ARCHIVE PAGE
// ============================================================
const ArchivePage = ({ supabaseUrl, supabaseKey }) => {
  const [results, setResults] = useState([]);
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("results");
  const [filterBoat, setFilterBoat] = useState("");
  const [filterRegatta, setFilterRegatta] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
      const [racesRes, resultsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/races?select=*&order=race_date.desc`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/results?select=*,races(*)&order=created_at.desc`, { headers }),
      ]);
      setRaces(await racesRes.json());
      setResults(await resultsRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [supabaseUrl, supabaseKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const boats = [...new Set(results.map(r => r.boat_name).filter(Boolean))].sort();
  const regattas = [...new Set(races.map(r => r.regatta_name).filter(Boolean))].sort();
  const years = [...new Set(races.map(r => r.race_date?.slice(0,4)).filter(Boolean))].sort().reverse();

  const filtered = results.filter(r => {
    if (filterBoat && r.boat_name !== filterBoat) return false;
    if (filterRegatta && r.races?.regatta_name !== filterRegatta) return false;
    if (filterYear && r.races?.race_date?.slice(0,4) !== filterYear) return false;
    return true;
  });

  // Leaderboard: count wins & avg position per boat
  const leaderboard = boats.map(boat => {
    const boatResults = results.filter(r => r.boat_name === boat);
    const positions = boatResults.map(r => parseInt(r.position)).filter(n => !isNaN(n));
    return {
      boat,
      races: boatResults.length,
      wins: positions.filter(p => p === 1).length,
      avg: positions.length ? (positions.reduce((a,b) => a+b, 0) / positions.length).toFixed(1) : "-",
      best: positions.length ? Math.min(...positions) : "-",
    };
  }).sort((a,b) => b.wins - a.wins || a.avg - b.avg);

  return (
    <div>
      <div className="stats-bar">
        <div className="stat-item"><div className="stat-val">{races.length}</div><div className="stat-lbl">Races</div></div>
        <div className="stat-item"><div className="stat-val">{results.length}</div><div className="stat-lbl">Results</div></div>
        <div className="stat-item"><div className="stat-val">{boats.length}</div><div className="stat-lbl">Boats</div></div>
        <div className="stat-item"><div className="stat-val">{regattas.length}</div><div className="stat-lbl">Regattas</div></div>
      </div>

      <div className="tabs">
        {[["results","📋 All Results"],["leaderboard","🏆 Leaderboard"],["races","🗓️ Races"]].map(([k,l]) => (
          <button key={k} className={`tab ${tab===k?"active":""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "results" && (
        <>
          <div className="filters">
            <div className="form-group">
              <label className="form-label">Boat</label>
              <select className="filter-select" value={filterBoat} onChange={e => setFilterBoat(e.target.value)}>
                <option value="">All boats</option>
                {boats.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Regatta</label>
              <select className="filter-select" value={filterRegatta} onChange={e => setFilterRegatta(e.target.value)}>
                <option value="">All regattas</option>
                {regattas.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Year</label>
              <select className="filter-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                <option value="">All years</option>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <button className="btn btn-ghost" onClick={() => { setFilterBoat(""); setFilterRegatta(""); setFilterYear(""); }}>✕ Clear</button>
            <button className="btn btn-accent" onClick={() => exportToCSV(filtered, "sailing-results.csv")}>⬇ CSV</button>
          </div>

          {loading
            ? <div style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
            : filtered.length === 0
              ? <div className="empty-state"><div className="empty-icon">🌊</div><div>No results yet — upload your first race!</div></div>
              : <div className="table-wrap">
                  <table>
                    <thead><tr><th>Pos</th><th>Boat</th><th>Skipper</th><th>Sail</th><th>Pts</th><th>Finish</th><th>Corrected</th><th>ToT</th><th>Race</th><th>Date</th></tr></thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr key={r.id}>
                          <td><PosBadge pos={r.position} /></td>
                          <td style={{ fontWeight: 500 }}>{r.boat_name}</td>
                          <td style={{ color: "var(--gray)" }}>{r.skipper}</td>
                          <td style={{ color: "var(--gray)" }}>{r.sail_number}</td>
                          <td>{r.points}</td>
                          <td style={{ fontFamily: "monospace" }}>{r.finish_time}</td>
                          <td style={{ fontFamily: "monospace", color: "var(--accent)" }}>{r.corrected_time}</td>
                          <td style={{ color: "var(--gray)" }}>{r.handicap_factor}</td>
                          <td style={{ color: "var(--sky)" }}>{r.races?.race_number}</td>
                          <td style={{ color: "var(--gray)" }}>{r.races?.race_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          }
        </>
      )}

      {tab === "leaderboard" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Boat</th><th>Races</th><th>Wins</th><th>Avg Pos</th><th>Best</th></tr></thead>
            <tbody>
              {leaderboard.map((b, i) => (
                <tr key={b.boat}>
                  <td><PosBadge pos={i+1} /></td>
                  <td style={{ fontWeight: 500 }}>{b.boat}</td>
                  <td>{b.races}</td>
                  <td style={{ color: b.wins > 0 ? "var(--accent)" : "inherit", fontWeight: b.wins > 0 ? 700 : 400 }}>{b.wins}</td>
                  <td>{b.avg}</td>
                  <td>{b.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "races" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Regatta</th><th>Race</th><th>Class</th><th>Handicap Method</th><th>Location</th></tr></thead>
            <tbody>
              {races.map(r => (
                <tr key={r.id}>
                  <td style={{ color: "var(--gray)" }}>{r.race_date}</td>
                  <td style={{ fontWeight: 500 }}>{r.regatta_name}</td>
                  <td style={{ color: "var(--sky)" }}>{r.race_number}</td>
                  <td>{r.race_class}</td>
                  <td style={{ color: "var(--gray)", fontSize: "0.8rem" }}>{r.handicap_method}</td>
                  <td style={{ color: "var(--gray)" }}>{r.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [page, setPage] = useState("upload");

  // Credentials are hardcoded — always configured
  const isConfigured = true;
  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_ANON_KEY;
  const saveConfig = () => setPage("upload");

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-brand">
            <span className="header-logo">⛵</span>
            <span className="header-title">Sail<span>Archive</span></span>
          </div>
          <nav className="header-nav">
            <button className={`nav-btn ${page==="upload"?"active":""}`} onClick={() => setPage("upload")}>⬆ Upload</button>
            <button className={`nav-btn ${page==="archive"?"active":""}`} onClick={() => setPage("archive")}>📋 Archive</button>
            <button className={`nav-btn ${page==="setup"?"active":""}`} onClick={() => setPage("setup")}>⚙️ Setup</button>
          </nav>
        </header>

        <main className="main">
          {page === "setup" && <SetupPage onSave={(u,k) => { saveConfig(u,k); setPage("upload"); }} />}
          {page === "upload" && (
            <>
              {!isConfigured && (
                <div className="alert alert-info">
                  ⚙️ Running in <strong>demo mode</strong> — results won't be saved.{" "}
                  <button style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 700 }} onClick={() => setPage("setup")}>Set up database →</button>
                </div>
              )}
              <UploadPage supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />
            </>
          )}
          {page === "archive" && <ArchivePage supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />}
        </main>
      </div>
    </>
  );
}
