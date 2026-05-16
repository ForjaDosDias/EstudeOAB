/* global React */
const { useState: useStateAdmin, useEffect: useEffectAdmin, useRef: useRefAdmin } = React;

const API_BASE = '/api';

/* =========================================================
   Admin Panel — upload de questões via CSV
   ========================================================= */
function AdminPage({ onNavigate }) {
  const [tab, setTabAdmin] = useStateAdmin('upload'); // upload | questoes

  return (
    <div className="admin-page fade-up">
      <header className="admin-header">
        <div>
          <div className="eyebrow">Administração</div>
          <h1 className="page-h1">Gestão de Questões</h1>
          <p className="page-sub">Importe questões via CSV e gerencie o banco de dados da plataforma.</p>
        </div>
        <button className="btn btn-quiet" onClick={() => onNavigate('dashboard')}>← Voltar</button>
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'upload' ? 'is-active' : ''}`} onClick={() => setTabAdmin('upload')}>
          ↑ Importar CSV
        </button>
        <button className={`admin-tab ${tab === 'questoes' ? 'is-active' : ''}`} onClick={() => setTabAdmin('questoes')}>
          ≡ Questões no banco
        </button>
      </div>

      {tab === 'upload'   && <AdminUpload />}
      {tab === 'questoes' && <AdminQuestoes />}
    </div>
  );
}

/* ---------- Upload de CSV ---------- */
function AdminUpload() {
  const [file, setFile] = useStateAdmin(null);
  const [preview, setPreview] = useStateAdmin(null);
  const [status, setStatus] = useStateAdmin(null); // null | 'uploading' | 'success' | 'error'
  const [result, setResult] = useStateAdmin(null);
  const [dragOver, setDragOver] = useStateAdmin(false);
  const inputRef = useRefAdmin(null);

  const handleFile = (f) => {
    if (!f || !f.name.match(/\.(csv|txt)$/i)) {
      setStatus('error');
      setResult({ error: 'Selecione um arquivo .csv' });
      return;
    }
    setFile(f);
    setStatus(null);
    setResult(null);
    parsePreview(f);
  };

  const parsePreview = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.replace(/^﻿/, '');
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setPreview(null); return; }
      const headers = lines[0].split(';').map(h => h.trim());
      const rows = lines.slice(1, 6).map(l => {
        const cols = l.split(';');
        return headers.reduce((obj, h, i) => { obj[h] = (cols[i] || '').trim(); return obj; }, {});
      });
      setPreview({ headers, rows, total: lines.length - 1 });
    };
    reader.readAsText(f, 'UTF-8');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setResult(null);

    const formData = new FormData();
    formData.append('csv', file);

    try {
      const res = await fetch(`${API_BASE}/questions/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      setStatus('success');
      setResult(data);
    } catch (err) {
      setStatus('error');
      setResult({ error: err.message });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setStatus(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const previewCols = ['id', 'banca', 'edicao', 'ano', 'area_direito', 'dificuldade', 'enunciado'];

  return (
    <div className="admin-upload-wrap">
      <div className="admin-card">
        <div className="admin-card-title">Arquivo CSV</div>
        <p className="admin-card-sub">
          O arquivo deve usar <code>;</code> como separador e ter as colunas:<br />
          <code className="admin-cols">id · banca · prova · edicao · ano · data_aplicacao · tipo_prova · numero_questao · enunciado · comando · alternativa_a · alternativa_b · alternativa_c · alternativa_d · gabarito · area_direito · materia · tema · subtema · legislacao_ref · dificuldade · observacoes</code>
        </p>

        {!file ? (
          <div
            className={`admin-dropzone ${dragOver ? 'is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="admin-dropzone-icon">↑</div>
            <div className="admin-dropzone-label">Arraste o CSV aqui ou clique para selecionar</div>
            <div className="admin-dropzone-hint">Máximo 20 MB · formato UTF-8</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="admin-file-info">
            <div className="admin-file-icon">📄</div>
            <div className="admin-file-details">
              <div className="admin-file-name">{file.name}</div>
              <div className="admin-file-meta">
                {(file.size / 1024).toFixed(1)} KB
                {preview && <span> · {preview.total} questões detectadas</span>}
              </div>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={reset}>Trocar arquivo</button>
          </div>
        )}
      </div>

      {preview && (
        <div className="admin-card">
          <div className="admin-card-title">Pré-visualização <span className="admin-preview-badge">primeiras 5 linhas</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {previewCols.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i}>
                    {previewCols.map(c => (
                      <td key={c} title={row[c]}>
                        {c === 'enunciado'
                          ? (row[c] || '').slice(0, 60) + (row[c]?.length > 60 ? '…' : '')
                          : row[c] || <span className="admin-empty">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {file && (
        <div className="admin-upload-actions">
          {status === null && (
            <button className="btn btn-cta btn-lg" onClick={handleUpload}>
              ↑ Enviar {preview?.total ? `${preview.total} questões` : 'questões'} para o banco
            </button>
          )}
          {status === 'uploading' && (
            <div className="admin-status uploading">
              <div className="admin-spinner" />
              Enviando e processando CSV…
            </div>
          )}
          {status === 'success' && result && (
            <div className="admin-result success">
              <div className="admin-result-icon">✓</div>
              <div className="admin-result-body">
                <div className="admin-result-title">Importação concluída!</div>
                <div className="admin-result-stats">
                  <span className="chip chip-green">+{result.inserted} inseridas</span>
                  {result.updated > 0 && <span className="chip chip-azul">{result.updated} atualizadas</span>}
                  {result.skipped > 0 && <span className="chip chip-neutral">{result.skipped} ignoradas</span>}
                  <span className="chip chip-neutral">Total: {result.total}</span>
                </div>
                {result.errors?.length > 0 && (
                  <div className="admin-errors">
                    <div className="admin-errors-title">Linhas com erro:</div>
                    {result.errors.map((e, i) => (
                      <div key={i} className="admin-error-row">Linha {e.linha}: {e.erro}</div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-quiet btn-sm" onClick={reset}>Nova importação</button>
            </div>
          )}
          {status === 'error' && result && (
            <div className="admin-result error">
              <div className="admin-result-icon">✕</div>
              <div className="admin-result-body">
                <div className="admin-result-title">Erro na importação</div>
                <div className="admin-result-sub">{result.error}</div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => setStatus(null)}>Tentar novamente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Listagem de questões no banco ---------- */
function AdminQuestoes() {
  const [questions, setQuestions] = useStateAdmin([]);
  const [stats, setStats] = useStateAdmin(null);
  const [loading, setLoading] = useStateAdmin(true);
  const [error, setError] = useStateAdmin(null);
  const [filters, setFilters] = useStateAdmin({ area: '', banca: '', dificuldade: '' });
  const [page, setPage] = useStateAdmin(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit,
        offset: page * limit,
        ...(filters.area        && { area: filters.area }),
        ...(filters.banca       && { banca: filters.banca }),
        ...(filters.dificuldade && { dificuldade: filters.dificuldade }),
      });
      const [qRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/questions?${params}`),
        fetch(`${API_BASE}/questions/stats`),
      ]);
      const qData = await qRes.json();
      const sData = await sRes.json();
      setQuestions(qData.questions || []);
      setStats(sData);
    } catch (err) {
      setError('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
    } finally {
      setLoading(false);
    }
  };

  useEffectAdmin(() => { load(); }, [page, filters]);

  const handleFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(0);
  };

  return (
    <div className="admin-questoes">
      {stats && (
        <div className="admin-stats-row">
          <div className="stat-card">
            <div className="stat-label">Total de questões</div>
            <div className="stat-value">{parseInt(stats.total).toLocaleString('pt-BR')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bancas</div>
            <div className="stat-value">{stats.bancas}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Áreas</div>
            <div className="stat-value">{stats.areas}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Edições</div>
            <div className="stat-value">{stats.edicoes}</div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-filters">
          <select className="admin-select" value={filters.area} onChange={e => handleFilter('area', e.target.value)}>
            <option value="">Todas as áreas</option>
            {(stats?.lista_areas || []).sort().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="admin-select" value={filters.banca} onChange={e => handleFilter('banca', e.target.value)}>
            <option value="">Todas as bancas</option>
            {(stats?.lista_bancas || []).sort().map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="admin-select" value={filters.dificuldade} onChange={e => handleFilter('dificuldade', e.target.value)}>
            <option value="">Todas as dificuldades</option>
            <option value="baixa">Baixa</option>
            <option value="média">Média</option>
            <option value="alta">Alta</option>
          </select>
          <button className="btn btn-quiet btn-sm" onClick={() => { setFilters({ area: '', banca: '', dificuldade: '' }); setPage(0); }}>
            Limpar filtros
          </button>
        </div>

        {loading && (
          <div className="admin-loading">
            <div className="admin-spinner" /> Carregando questões…
          </div>
        )}

        {error && (
          <div className="admin-result error" style={{ marginTop: 16 }}>
            <div className="admin-result-icon">!</div>
            <div className="admin-result-body">
              <div className="admin-result-title">Erro de conexão</div>
              <div className="admin-result-sub">{error}</div>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={load}>Tentar novamente</button>
          </div>
        )}

        {!loading && !error && questions.length === 0 && (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">○</div>
            <div className="admin-empty-title">Nenhuma questão encontrada</div>
            <div className="admin-empty-sub">Importe um CSV na aba "Importar CSV" para começar.</div>
          </div>
        )}

        {!loading && questions.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Banca</th>
                  <th>Edição</th>
                  <th>Ano</th>
                  <th>Área</th>
                  <th>Dificuldade</th>
                  <th>Enunciado</th>
                  <th>Gabarito</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td className="admin-id">{q.external_id || q.id}</td>
                    <td>{q.banca || <span className="admin-empty">—</span>}</td>
                    <td>{q.edicao || <span className="admin-empty">—</span>}</td>
                    <td>{q.ano   || <span className="admin-empty">—</span>}</td>
                    <td>{q.area_direito || <span className="admin-empty">—</span>}</td>
                    <td>
                      {q.dificuldade
                        ? <span className={`chip chip-${q.dificuldade === 'baixa' ? 'green' : q.dificuldade === 'alta' ? 'bordo' : 'amarelo'}`}>{q.dificuldade}</span>
                        : <span className="admin-empty">—</span>}
                    </td>
                    <td className="admin-enunciado" title={q.enunciado}>
                      {(q.enunciado || '').slice(0, 80)}{q.enunciado?.length > 80 ? '…' : ''}
                    </td>
                    <td>
                      {q.gabarito
                        ? <span className="admin-gabarito">{q.gabarito}</span>
                        : <span className="admin-empty">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (stats?.total > limit) && (
          <div className="admin-pagination">
            <button className="btn btn-quiet btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
            <span className="admin-page-info">Página {page + 1} · {parseInt(stats.total).toLocaleString('pt-BR')} questões</span>
            <button className="btn btn-quiet btn-sm" disabled={(page + 1) * limit >= stats.total} onClick={() => setPage(p => p + 1)}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  );
}

window.Admin = { AdminPage };
