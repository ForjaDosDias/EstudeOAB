/* global React */
const { useState: useStateAdmin, useEffect: useEffectAdmin, useRef: useRefAdmin } = React;

const API_BASE = '/api';

function adminFetch(path, opts = {}) {
  return window.apiFetch(path, opts);
}

/* =========================================================
   Admin Panel
   ========================================================= */
function AdminPage({ token, onNavigate }) {
  const [tab, setTabAdmin] = useStateAdmin('pdf');

  return (
    <div className="admin-page fade-up">
      <header className="admin-header">
        <div>
          <div className="eyebrow">Administração</div>
          <h1 className="page-h1">Gestão de Questões</h1>
          <p className="page-sub">Importe questões via PDF (IA) ou CSV e gerencie o banco de dados.</p>
        </div>
        <button className="btn btn-quiet" onClick={() => onNavigate('dashboard')}>← Voltar</button>
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'pdf'      ? 'is-active' : ''}`} onClick={() => setTabAdmin('pdf')}>      ✦ Importar PDF</button>
        <button className={`admin-tab ${tab === 'csv'      ? 'is-active' : ''}`} onClick={() => setTabAdmin('csv')}>      ↑ Importar CSV</button>
        <button className={`admin-tab ${tab === 'questoes' ? 'is-active' : ''}`} onClick={() => setTabAdmin('questoes')}>≡ Questões no banco</button>
      </div>

      {tab === 'pdf'      && <AdminImportPDF />}
      {tab === 'csv'      && <AdminUploadCSV token={token} />}
      {tab === 'questoes' && <AdminQuestoes />}
    </div>
  );
}

/* =========================================================
   Tela de processamento animada
   ========================================================= */
function ProcessingScreen({ arquivos }) {
  const PASSOS = [
    { msg: 'Lendo arquivos PDF',              subMsg: null },
    { msg: 'Extraindo texto dos documentos',  subMsg: null },
    { msg: 'Enviando para o DeepSeek',        subMsg: null },
    { msg: 'Analisando as questões da prova…', subMsg: null },
  ];
  const THRESHOLDS = [0, 3, 8, 18]; // segundos para avançar cada passo

  const [elapsed,  setElapsed]  = useStateAdmin(0);
  const [stepIdx,  setStepIdx]  = useStateAdmin(0);

  useEffectAdmin(() => {
    const t = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        // avança passo se passou do threshold
        setStepIdx(s => {
          const nextStep = THRESHOLDS.findLastIndex(th => next >= th);
          return Math.max(s, nextStep);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const progressPct = Math.min(Math.round((elapsed / 150) * 90), 90);

  const tempoLabel = elapsed < 60
    ? `há ${elapsed}s`
    : `há ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const subMensagem = elapsed >= 120
    ? 'Quase lá — finalizando estrutura JSON…'
    : elapsed >= 70
      ? 'Extraindo e organizando o gabarito…'
      : 'Isso pode levar alguns minutos para provas completas.';

  return (
    <div className="admin-card" style={{padding:40}}>
      {/* Cabeçalho */}
      <div style={{marginBottom:32}}>
        <div className="eyebrow" style={{marginBottom:4}}>✦ Processando com IA</div>
        <div style={{fontSize:'var(--text-lg)', fontWeight:700}}>DeepSeek está lendo a prova</div>
      </div>

      {/* Barra de progresso */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontSize:'var(--text-sm)', color:'var(--text-muted)'}}>Progresso estimado</div>
          <div style={{fontSize:'var(--text-sm)', color:'var(--text-muted)', fontFamily:'var(--font-mono)'}}>
            {progressPct}% · {tempoLabel}
          </div>
        </div>
        <div style={{height:6, background:'var(--bege)', borderRadius:3, overflow:'hidden'}}>
          <div style={{
            height:'100%',
            width: progressPct + '%',
            background:'linear-gradient(90deg, var(--bordo), var(--amarelo))',
            borderRadius:3,
            transition:'width 1s linear',
          }} />
        </div>
      </div>

      {/* Lista de passos */}
      <div style={{display:'flex', flexDirection:'column', gap:16, marginBottom:32}}>
        {PASSOS.map((passo, i) => {
          const done    = i < stepIdx;
          const active  = i === stepIdx;
          const pending = i > stepIdx;
          return (
            <div key={i} style={{display:'flex', gap:14, alignItems:'flex-start', opacity: pending ? 0.35 : 1, transition:'opacity 0.4s'}}>
              {/* Ícone */}
              <div style={{
                width:28, height:28, borderRadius:'50%', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:700,
                background: done ? 'var(--green)' : active ? 'var(--bordo)' : 'var(--bege)',
                color: (done || active) ? '#fff' : 'var(--text-muted)',
                marginTop:1,
              }}>
                {done ? '✓' : active ? <span style={{display:'inline-block', animation:'spin 1s linear infinite'}}>⟳</span> : '·'}
              </div>
              {/* Texto */}
              <div>
                <div style={{fontWeight: active ? 600 : 500, color: active ? 'var(--text-primary)' : 'var(--text-secondary)'}}>
                  {passo.msg}
                </div>
                {/* Badges dos arquivos no passo 0 */}
                {i === 0 && arquivos.length > 0 && (
                  <div style={{display:'flex', flexDirection:'column', gap:4, marginTop:6}}>
                    {arquivos.map((f, fi) => (
                      <div key={fi} style={{display:'flex', alignItems:'center', gap:6, fontSize:'var(--text-sm)', color:'var(--text-muted)'}}>
                        <span>📄</span>
                        <span style={{fontFamily:'var(--font-mono)'}}>{f.name}</span>
                        <span style={{color:'var(--text-muted)'}}>({(f.size/1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sub-mensagem no passo ativo final */}
                {active && i === 3 && (
                  <div style={{fontSize:'var(--text-sm)', color:'var(--text-muted)', marginTop:4, fontStyle:'italic'}}>
                    {subMensagem}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aviso */}
      <div style={{
        padding:'12px 16px', borderRadius:8, background:'var(--bege)',
        fontSize:'var(--text-sm)', color:'var(--text-muted)', textAlign:'center',
      }}>
        Não feche esta aba. O resultado aparecerá aqui assim que a IA terminar.
      </div>
    </div>
  );
}

/* =========================================================
   Import PDF via IA
   ========================================================= */
function AdminImportPDF() {
  const [fase,      setFase]      = useStateAdmin('upload'); // upload | processando | preview | salvo
  const [arquivos,  setArquivos]  = useStateAdmin([]);
  const [questoes,  setQuestoes]  = useStateAdmin([]);
  const [resultado, setResultado] = useStateAdmin(null);
  const [erro,      setErro]      = useStateAdmin(null);
  const [editando,  setEditando]  = useStateAdmin(null);
  const [comGabarito, setComGabarito] = useStateAdmin(0);
  const inputRef = useRefAdmin(null);

  const handleFiles = (files) => {
    const pdfs = Array.from(files).filter(f => f.name.match(/\.pdf$/i)).slice(0, 2);
    if (pdfs.length === 0) { setErro('Selecione arquivos PDF.'); return; }
    setArquivos(pdfs);
    setErro(null);
  };

  const processar = async () => {
    if (arquivos.length === 0) return;
    setFase('processando');
    setErro(null);
    const form = new FormData();
    arquivos.forEach(f => form.append('pdfs', f));
    try {
      // 1. Envia os PDFs e recebe jobId imediatamente
      const { jobId } = await adminFetch('/admin/import-pdf', { method: 'POST', headers: {}, body: form });

      // 2. Polling até o job terminar
      await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const status = await adminFetch(`/admin/import-status/${jobId}`);
            if (status.status === 'processing') return; // ainda processando
            clearInterval(poll);
            if (status.status === 'error') { reject(new Error(status.erro)); return; }
            setQuestoes(status.questoes);
            setComGabarito(status.com_gabarito || 0);
            resolve();
          } catch (e) { clearInterval(poll); reject(e); }
        }, 4000); // verifica a cada 4 segundos
      });

      setFase('preview');
    } catch (err) {
      setErro(err.message || err.error || 'Erro ao processar. Tente novamente.');
      setFase('upload');
    }
  };

  const salvar = async () => {
    setFase('processando');
    try {
      const data = await adminFetch('/admin/bulk-save', {
        method: 'POST',
        body: JSON.stringify({ questoes }),
      });
      setResultado(data);
      setFase('salvo');
    } catch (err) {
      setErro(err.error || 'Erro ao salvar questões.');
      setFase('preview');
    }
  };

  const removerQuestao = (idx) => setQuestoes(q => q.filter((_, i) => i !== idx));

  const salvarEdicao = (idx, atualizada) => {
    setQuestoes(q => q.map((item, i) => i === idx ? atualizada : item));
    setEditando(null);
  };

  const baixarCSV = () => {
    const cols = ['id','banca','edicao','ano','numero_questao','enunciado',
                  'alternativa_a','alternativa_b','alternativa_c','alternativa_d',
                  'gabarito','area_direito','materia','dificuldade','legislacao_ref','explicacao'];
    const escapar = v => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const linhas = [cols.join(';'), ...questoes.map(q => cols.map(c => escapar(q[c])).join(';'))];
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `${questoes[0]?.edicao || 'OAB'}_questoes.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (fase === 'upload') return (
    <div className="admin-card">
      <div className="admin-card-title">Upload dos PDFs da prova</div>
      <p className="admin-card-sub">
        Envie o <strong>caderno de questões</strong> e, opcionalmente, o <strong>gabarito oficial</strong> juntos.
        A IA cruza os dois automaticamente e preenche as respostas corretas.
      </p>
      {erro && <div className="admin-result error" style={{marginBottom:16}}><div className="admin-result-icon">✕</div><div className="admin-result-body"><div className="admin-result-sub">{erro}</div></div></div>}

      <div className="admin-dropzone"
           onDragOver={e => e.preventDefault()}
           onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
           onClick={() => inputRef.current?.click()}>
        <div className="admin-dropzone-icon">✦</div>
        <div className="admin-dropzone-label">Clique ou arraste 1 ou 2 PDFs aqui</div>
        <div className="admin-dropzone-hint">Caderno de questões + gabarito (opcional) · máx. 50 MB cada</div>
        <input ref={inputRef} type="file" accept=".pdf" multiple style={{display:'none'}}
               onChange={e => handleFiles(e.target.files)} />
      </div>

      {arquivos.length > 0 && (
        <div style={{marginTop:16}}>
          <div style={{marginBottom:8, fontWeight:600, fontSize:'var(--text-sm)'}}>PDFs selecionados:</div>
          {arquivos.map((f, i) => (
            <div key={i} className="admin-file-info" style={{marginBottom:6}}>
              <div className="admin-file-icon">📄</div>
              <div className="admin-file-details">
                <div className="admin-file-name">{f.name}</div>
                <div className="admin-file-meta">{(f.size/1024).toFixed(1)} KB</div>
              </div>
              <button className="btn btn-quiet btn-sm"
                      onClick={() => setArquivos(a => a.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button className="btn btn-quiet" onClick={() => { setArquivos([]); if(inputRef.current) inputRef.current.value=''; }}>
              Limpar
            </button>
            <button className="btn btn-cta" onClick={processar}>
              ✦ Processar com IA {arquivos.length === 2 ? '(caderno + gabarito)' : '(caderno)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (fase === 'processando') return <ProcessingScreen arquivos={arquivos} />;

  if (fase === 'preview') return (
    <div className="admin-questoes">
      <div className="admin-card" style={{marginBottom:16}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:16}}>
          <div>
            <div className="admin-card-title">{questoes.length} questões extraídas — revise antes de salvar</div>
            <p className="admin-card-sub">
              {comGabarito > 0
                ? <><strong>{comGabarito}</strong> com gabarito preenchido · </>
                : 'Gabarito não encontrado — preencha manualmente · '}
              Clique em "Editar" para corrigir erros da IA. "✕" para remover.
            </p>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-quiet" onClick={() => { setFase('upload'); setQuestoes([]); setArquivos([]); setComGabarito(0); }}>← Recomeçar</button>
            <button className="btn btn-quiet" onClick={baixarCSV}>↓ Baixar CSV</button>
            <button className="btn btn-cta" onClick={salvar}>Salvar {questoes.length} questões →</button>
          </div>
        </div>
      </div>

      {erro && <div className="admin-result error" style={{marginBottom:16}}><div className="admin-result-icon">✕</div><div className="admin-result-body"><div className="admin-result-sub">{erro}</div></div></div>}

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>#</th><th>ID</th><th>Área</th><th>Gabarito</th><th>Enunciado</th><th></th></tr>
            </thead>
            <tbody>
              {questoes.map((q, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="admin-id">{q.id || '—'}</td>
                  <td>{q.area_direito || '—'}</td>
                  <td><span className="admin-gabarito">{q.gabarito || '?'}</span></td>
                  <td className="admin-enunciado" title={q.enunciado}>{(q.enunciado || '').slice(0,80)}{q.enunciado?.length > 80 ? '…' : ''}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <button className="btn btn-quiet btn-sm" style={{marginRight:4}} onClick={() => setEditando({ idx: i, q: { ...q } })}>Editar</button>
                    <button className="btn btn-quiet btn-sm" style={{color:'var(--bordo)'}} onClick={() => removerQuestao(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <QuestaoModal
          questao={editando.q}
          titulo="Editar questão (preview)"
          onSave={q => salvarEdicao(editando.idx, q)}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );

  if (fase === 'salvo') return (
    <div className="admin-card">
      <div className="admin-result success">
        <div className="admin-result-icon">✓</div>
        <div className="admin-result-body">
          <div className="admin-result-title">Questões salvas com sucesso!</div>
          <div className="admin-result-stats">
            <span className="chip chip-green">+{resultado.inserted} inseridas</span>
            {resultado.updated > 0 && <span className="chip chip-azul">{resultado.updated} atualizadas</span>}
            {resultado.skipped > 0 && <span className="chip chip-neutral">{resultado.skipped} ignoradas</span>}
          </div>
          {resultado.errors?.length > 0 && (
            <div className="admin-errors">
              {resultado.errors.map((e, i) => <div key={i} className="admin-error-row">#{e.index}: {e.erro}</div>)}
            </div>
          )}
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => { setFase('upload'); setQuestoes([]); setArquivos([]); setResultado(null); setComGabarito(0); }}>
          Novo import
        </button>
      </div>
    </div>
  );

  return null;
}

/* =========================================================
   Modal de edição de questão (usado no preview e no CRUD)
   ========================================================= */
function QuestaoModal({ questao, titulo, onSave, onClose }) {
  const [form, setForm] = useStateAdmin({ ...questao });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [comentarios,        setComentarios]        = useStateAdmin([]);
  const [loadingComents,     setLoadingComents]     = useStateAdmin(false);
  const [novoComentario,     setNovoComentario]     = useStateAdmin('');
  const [salvandoComentario, setSalvandoComentario] = useStateAdmin(false);

  useEffectAdmin(() => {
    if (!questao?.id) return;
    setLoadingComents(true);
    adminFetch(`/question-comments/${questao.id}`)
      .then(d => setComentarios(d.comments || []))
      .catch(() => {})
      .finally(() => setLoadingComents(false));
  }, []);

  const adicionarComentario = async () => {
    if (!novoComentario.trim()) return;
    setSalvandoComentario(true);
    try {
      const novo = await adminFetch(`/question-comments/${questao.id}`, {
        method: 'POST',
        body: JSON.stringify({ corpo: novoComentario.trim() }),
      });
      setComentarios(c => [...c, novo]);
      setNovoComentario('');
    } catch (err) {
      alert(err.error || 'Erro ao adicionar comentário');
    } finally {
      setSalvandoComentario(false);
    }
  };

  const deletarComentario = async (commentId) => {
    if (!confirm('Deletar este comentário?')) return;
    try {
      await adminFetch(`/question-comments/${commentId}`, { method: 'DELETE' });
      setComentarios(c => c.filter(x => x.id !== commentId));
    } catch (err) {
      alert(err.error || 'Erro ao deletar');
    }
  };

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="modal-panel fade-up" style={{maxWidth:760}} onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div><div className="eyebrow">{titulo}</div><h2 className="modal-title">{form.id || 'Nova questão'}</h2></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </header>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
          <Field label="ID único" value={form.id || ''} onChange={v => set('id', v)} />
          <Field label="Banca" value={form.banca || ''} onChange={v => set('banca', v)} />
          <Field label="Edição" value={form.edicao || ''} onChange={v => set('edicao', v)} />
          <Field label="Ano" value={form.ano || ''} onChange={v => set('ano', v)} />
          <div>
            <label className="input-label">Área do direito</label>
            <select className="select-field" value={form.area_direito || ''} onChange={e => set('area_direito', e.target.value)}>
              <option value="">Selecione…</option>
              {['civil','const','penal','trabalho','adm','etica','trib'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Gabarito</label>
            <select className="select-field" value={form.gabarito || ''} onChange={e => set('gabarito', e.target.value)}>
              <option value="">—</option>
              {['A','B','C','D'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Dificuldade</label>
            <select className="select-field" value={form.dificuldade || ''} onChange={e => set('dificuldade', e.target.value)}>
              <option value="">—</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <Field label="Matéria" value={form.materia || ''} onChange={v => set('materia', v)} />
        </div>

        <TextArea label="Enunciado" value={form.enunciado || ''} onChange={v => set('enunciado', v)} rows={4} />
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
          <TextArea label="Alternativa A" value={form.alternativa_a || ''} onChange={v => set('alternativa_a', v)} />
          <TextArea label="Alternativa B" value={form.alternativa_b || ''} onChange={v => set('alternativa_b', v)} />
          <TextArea label="Alternativa C" value={form.alternativa_c || ''} onChange={v => set('alternativa_c', v)} />
          <TextArea label="Alternativa D" value={form.alternativa_d || ''} onChange={v => set('alternativa_d', v)} />
        </div>
        <div style={{marginTop:12}}>
          <Field label="Referência legal (ex: Art. 186 · CC/2002)" value={form.legislacao_ref || ''} onChange={v => set('legislacao_ref', v)} />
        </div>
        <div style={{marginTop:12}}>
          <TextArea label="Explicação da resposta" value={form.explicacao || ''} onChange={v => set('explicacao', v)} rows={4} />
        </div>

        {questao?.id && (
          <div style={{marginTop:20, borderTop:'1px solid var(--border)', paddingTop:16}}>
            <div className="input-label" style={{marginBottom:10}}>
              Comentários de professor ({comentarios.length})
            </div>
            {loadingComents && <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</div>}
            {!loadingComents && comentarios.length === 0 && (
              <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)', marginBottom:8}}>Nenhum comentário ainda.</div>
            )}
            {!loadingComents && comentarios.map(c => (
              <div key={c.id} style={{
                display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                padding:'10px 12px', background:'var(--bege)', borderRadius:6, marginBottom:8,
              }}>
                <div>
                  <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>
                    {c.admin_nome || 'Admin'} · {new Date(c.criado_em).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'})}
                  </div>
                  <div style={{fontSize:'var(--text-sm)'}}>{c.corpo}</div>
                </div>
                <button className="btn btn-quiet btn-sm" style={{color:'var(--bordo)', marginLeft:12, flexShrink:0}}
                        onClick={() => deletarComentario(c.id)}>✕</button>
              </div>
            ))}
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Adicionar comentário de professor…"
                value={novoComentario}
                onChange={e => setNovoComentario(e.target.value)}
                style={{flex:1, resize:'vertical', fontFamily:'inherit', fontSize:'var(--text-sm)'}}
              />
              <button className="btn btn-primary btn-sm"
                      onClick={adicionarComentario}
                      disabled={!novoComentario.trim() || salvandoComentario}
                      style={{alignSelf:'flex-end'}}>
                {salvandoComentario ? '…' : 'Adicionar'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{marginTop:24}}>
          <button className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={!form.enunciado?.trim()}>
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="input-group" style={{marginBottom:0}}>
      <label className="input-label">{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 2 }) {
  return (
    <div className="input-group" style={{marginBottom:0}}>
      <label className="input-label">{label}</label>
      <textarea className="input-field" rows={rows} value={value} onChange={e => onChange(e.target.value)}
                style={{resize:'vertical', fontFamily:'inherit'}} />
    </div>
  );
}

/* =========================================================
   Upload CSV (mantido do fluxo anterior)
   ========================================================= */
function AdminUploadCSV({ token }) {
  const [file, setFile] = useStateAdmin(null);
  const [preview, setPreview] = useStateAdmin(null);
  const [status, setStatus] = useStateAdmin(null);
  const [result, setResult] = useStateAdmin(null);
  const [dragOver, setDragOver] = useStateAdmin(false);
  const inputRef = useRefAdmin(null);

  const handleFile = (f) => {
    if (!f || !f.name.match(/\.(csv|txt)$/i)) { setStatus('error'); setResult({ error: 'Selecione um arquivo .csv' }); return; }
    setFile(f); setStatus(null); setResult(null); parsePreview(f);
  };

  const parsePreview = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.replace(/^\ufeff/, '');
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

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    const formData = new FormData();
    formData.append('csv', file);
    try {
      const res = await fetch(`${API_BASE}/questions/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      setStatus('success'); setResult(data);
    } catch (err) {
      setStatus('error'); setResult({ error: err.message });
    }
  };

  const reset = () => { setFile(null); setPreview(null); setStatus(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; };
  const previewCols = ['id', 'banca', 'edicao', 'ano', 'area_direito', 'dificuldade', 'enunciado'];

  return (
    <div className="admin-upload-wrap">
      <div className="admin-card">
        <div className="admin-card-title">Arquivo CSV</div>
        <p className="admin-card-sub">Separador <code>;</code> · colunas: <code>id · banca · edicao · enunciado · alternativa_a…d · gabarito · area_direito · dificuldade</code></p>
        {!file ? (
          <div className={`admin-dropzone ${dragOver ? 'is-over' : ''}`}
               onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
               onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
               onClick={() => inputRef.current?.click()}>
            <div className="admin-dropzone-icon">↑</div>
            <div className="admin-dropzone-label">Arraste o CSV ou clique para selecionar</div>
            <div className="admin-dropzone-hint">Máximo 20 MB · UTF-8</div>
            <input ref={inputRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="admin-file-info">
            <div className="admin-file-icon">📄</div>
            <div className="admin-file-details">
              <div className="admin-file-name">{file.name}</div>
              <div className="admin-file-meta">{(file.size/1024).toFixed(1)} KB{preview && ` · ${preview.total} questões`}</div>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={reset}>Trocar</button>
          </div>
        )}
      </div>

      {preview && (
        <div className="admin-card">
          <div className="admin-card-title">Pré-visualização <span className="admin-preview-badge">primeiras 5 linhas</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr>{previewCols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{preview.rows.map((row, i) => (
                <tr key={i}>{previewCols.map(c => (
                  <td key={c} title={row[c]}>{c === 'enunciado' ? (row[c]||'').slice(0,60)+(row[c]?.length>60?'…':'') : row[c] || <span className="admin-empty">—</span>}</td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {file && (
        <div className="admin-upload-actions">
          {status === null && <button className="btn btn-cta btn-lg" onClick={handleUpload}>↑ Enviar {preview?.total ? `${preview.total} questões` : 'questões'}</button>}
          {status === 'uploading' && <div className="admin-status uploading"><div className="admin-spinner" /> Enviando…</div>}
          {status === 'success' && result && (
            <div className="admin-result success">
              <div className="admin-result-icon">✓</div>
              <div className="admin-result-body">
                <div className="admin-result-title">Importação concluída!</div>
                <div className="admin-result-stats">
                  <span className="chip chip-green">+{result.inserted} inseridas</span>
                  {result.updated > 0 && <span className="chip chip-azul">{result.updated} atualizadas</span>}
                  {result.anuladas > 0 && <span className="chip chip-neutral">{result.anuladas} anuladas</span>}
                  {result.skipped > 0 && <span className="chip chip-neutral">{result.skipped} ignoradas</span>}
                </div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={reset}>Novo import</button>
            </div>
          )}
          {status === 'error' && result && (
            <div className="admin-result error">
              <div className="admin-result-icon">✕</div>
              <div className="admin-result-body"><div className="admin-result-title">Erro</div><div className="admin-result-sub">{result.error}</div></div>
              <button className="btn btn-quiet btn-sm" onClick={() => setStatus(null)}>Tentar novamente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CRUD — questões no banco
   ========================================================= */
function AdminQuestoes() {
  const [questions, setQuestions] = useStateAdmin([]);
  const [stats,    setStats]     = useStateAdmin(null);
  const [loading,  setLoading]   = useStateAdmin(true);
  const [error,    setError]     = useStateAdmin(null);
  const [filters,  setFilters]   = useStateAdmin({ area: '', banca: '', dificuldade: '' });
  const [page,     setPage]      = useStateAdmin(0);
  const [editando, setEditando]  = useStateAdmin(null);
  const [bulkJob,  setBulkJob]   = useStateAdmin(null); // { jobId, total, done, status, errors }
  const limit = 20;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit, offset: page * limit,
        ...(filters.area        && { area: filters.area }),
        ...(filters.banca       && { banca: filters.banca }),
        ...(filters.dificuldade && { dificuldade: filters.dificuldade }),
      });
      const [qData, sData] = await Promise.all([
        adminFetch(`/questions?${params}`),
        adminFetch('/questions/stats'),
      ]);
      setQuestions(qData.questions || []);
      setStats(sData);
    } catch { setError('Erro ao carregar questões.'); }
    finally { setLoading(false); }
  };

  useEffectAdmin(() => { load(); }, [page, filters]);

  const handleFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(0); };

  const iniciarBulkExplicacoes = async () => {
    try {
      const data = await adminFetch('/admin/bulk-explicacoes', { method: 'POST' });
      if (data.total === 0) { alert(data.mensagem); return; }
      setBulkJob({ jobId: data.jobId, total: data.total, done: 0, status: 'processing', errors: [] });

      const poll = setInterval(async () => {
        try {
          const status = await adminFetch(`/admin/bulk-explicacoes/${data.jobId}`);
          setBulkJob(j => ({ ...j, ...status }));
          if (status.status !== 'processing') {
            clearInterval(poll);
            load();
          }
        } catch { clearInterval(poll); }
      }, 2000);
    } catch (err) {
      alert(err.error || 'Erro ao iniciar geração em lote');
    }
  };

  const cancelarBulk = async () => {
    if (!bulkJob?.jobId) return;
    await adminFetch(`/admin/bulk-explicacoes/${bulkJob.jobId}/cancel`, { method: 'POST' }).catch(() => {});
    setBulkJob(j => ({ ...j, status: 'cancelled' }));
    load();
  };

  const salvarEdicao = async (q) => {
    try {
      await adminFetch(`/admin/questions/${q.id}`, {
        method: 'PUT', body: JSON.stringify(q),
      });
      setEditando(null);
      load();
    } catch (err) {
      alert(err.error || 'Erro ao salvar');
    }
  };

  const deletar = async (id) => {
    if (!confirm('Tem certeza que deseja deletar esta questão?')) return;
    try {
      await adminFetch(`/admin/questions/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      alert(err.error || 'Erro ao deletar');
    }
  };

  const semExplicacao = stats ? parseInt(stats.total) - (stats.com_explicacao || 0) : 0;

  return (
    <div className="admin-questoes">
      {stats && (
        <div className="admin-stats-row">
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{parseInt(stats.total).toLocaleString('pt-BR')}</div></div>
          <div className="stat-card"><div className="stat-label">Bancas</div><div className="stat-value">{stats.bancas}</div></div>
          <div className="stat-card"><div className="stat-label">Áreas</div><div className="stat-value">{stats.areas}</div></div>
          <div className="stat-card"><div className="stat-label">Edições</div><div className="stat-value">{stats.edicoes}</div></div>
        </div>
      )}

      {/* Barra de progresso do job de lote */}
      {bulkJob && bulkJob.status !== 'done' && bulkJob.status !== 'cancelled' && (
        <div className="admin-card" style={{marginBottom:12}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <div style={{fontWeight:600}}>Gerando explicações com IA…</div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <span style={{fontFamily:'var(--font-mono)', fontSize:'var(--text-sm)', color:'var(--text-muted)'}}>
                {bulkJob.done} / {bulkJob.total}
              </span>
              <button className="btn btn-quiet btn-sm" style={{color:'var(--bordo)'}} onClick={cancelarBulk}>Cancelar</button>
            </div>
          </div>
          <div style={{height:6, background:'var(--bege)', borderRadius:3, overflow:'hidden'}}>
            <div style={{
              height:'100%', borderRadius:3, transition:'width 0.5s ease',
              width: `${bulkJob.total > 0 ? Math.round((bulkJob.done / bulkJob.total) * 100) : 0}%`,
              background:'linear-gradient(90deg, var(--bordo), var(--amarelo))',
            }} />
          </div>
          {bulkJob.errors.length > 0 && (
            <div style={{marginTop:8, fontSize:12, color:'var(--bordo)'}}>
              {bulkJob.errors.length} erro{bulkJob.errors.length !== 1 ? 's' : ''} — continuando com as demais questões
            </div>
          )}
        </div>
      )}

      {bulkJob?.status === 'done' && (
        <div className="admin-result success" style={{marginBottom:12}}>
          <div className="admin-result-icon">✓</div>
          <div className="admin-result-body">
            <div className="admin-result-title">Explicações geradas!</div>
            <div className="admin-result-stats">
              <span className="chip chip-green">{bulkJob.done - bulkJob.errors.length} com sucesso</span>
              {bulkJob.errors.length > 0 && <span className="chip chip-bordo">{bulkJob.errors.length} com erro</span>}
            </div>
          </div>
          <button className="btn btn-quiet btn-sm" onClick={() => setBulkJob(null)}>✕</button>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-filters">
          <select className="admin-select" value={filters.area} onChange={e => handleFilter('area', e.target.value)}>
            <option value="">Todas as áreas</option>
            {(stats?.lista_areas||[]).sort().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="admin-select" value={filters.banca} onChange={e => handleFilter('banca', e.target.value)}>
            <option value="">Todas as bancas</option>
            {(stats?.lista_bancas||[]).sort().map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="admin-select" value={filters.dificuldade} onChange={e => handleFilter('dificuldade', e.target.value)}>
            <option value="">Todas as dificuldades</option>
            <option value="baixa">Baixa</option>
            <option value="média">Média</option>
            <option value="alta">Alta</option>
          </select>
          <button className="btn btn-quiet btn-sm" onClick={() => { setFilters({ area:'', banca:'', dificuldade:'' }); setPage(0); }}>Limpar</button>
          {!bulkJob && semExplicacao > 0 && (
            <button className="btn btn-cta btn-sm" style={{marginLeft:'auto'}} onClick={iniciarBulkExplicacoes}>
              ✦ Gerar {semExplicacao} explicação{semExplicacao !== 1 ? 'ões' : ''} com IA
            </button>
          )}
        </div>

        {loading && <div className="admin-loading"><div className="admin-spinner" /> Carregando…</div>}
        {error   && <div className="admin-result error" style={{marginTop:16}}><div className="admin-result-icon">!</div><div className="admin-result-body"><div className="admin-result-sub">{error}</div></div><button className="btn btn-quiet btn-sm" onClick={load}>Tentar novamente</button></div>}
        {!loading && !error && questions.length === 0 && (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">○</div>
            <div className="admin-empty-title">Nenhuma questão encontrada</div>
            <div className="admin-empty-sub">Importe um PDF ou CSV para começar.</div>
          </div>
        )}

        {!loading && questions.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>#</th><th>Banca</th><th>Edição</th><th>Área</th><th>Dif.</th><th>Enunciado</th><th>Gab.</th><th>Expl.</th><th></th></tr>
              </thead>
              <tbody>
                {questions.map(q => (
                  <tr key={q.id}>
                    <td className="admin-id">{q.external_id || q.id}</td>
                    <td>{q.banca || <span className="admin-empty">—</span>}</td>
                    <td>{q.edicao || <span className="admin-empty">—</span>}</td>
                    <td>{q.area_direito || <span className="admin-empty">—</span>}</td>
                    <td>{q.dificuldade ? <span className={`chip chip-${q.dificuldade==='baixa'?'green':q.dificuldade==='alta'?'bordo':'amarelo'}`}>{q.dificuldade}</span> : <span className="admin-empty">—</span>}</td>
                    <td className="admin-enunciado" title={q.enunciado}>{(q.enunciado||'').slice(0,70)}{q.enunciado?.length>70?'…':''}</td>
                    <td>{q.gabarito ? <span className="admin-gabarito">{q.gabarito}</span> : <span className="admin-empty">—</span>}</td>
                    <td style={{textAlign:'center'}}>
                      {q.explicacao
                        ? <span title={q.explicacao} style={{color:'var(--green)', cursor:'help'}}>✓</span>
                        : <span style={{color:'var(--text-muted)'}}>—</span>}
                    </td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <button className="btn btn-quiet btn-sm" style={{marginRight:4}}
                              onClick={() => setEditando({ q: { ...q, id: q.id, area_direito: q.area_direito } })}>
                        Editar
                      </button>
                      <button className="btn btn-quiet btn-sm" style={{color:'var(--bordo)'}} onClick={() => deletar(q.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && stats?.total > limit && (
          <div className="admin-pagination">
            <button className="btn btn-quiet btn-sm" disabled={page===0} onClick={() => setPage(p=>p-1)}>← Anterior</button>
            <span className="admin-page-info">Página {page+1} · {parseInt(stats.total).toLocaleString('pt-BR')} questões</span>
            <button className="btn btn-quiet btn-sm" disabled={(page+1)*limit>=stats.total} onClick={() => setPage(p=>p+1)}>Próxima →</button>
          </div>
        )}
      </div>

      {editando && (
        <QuestaoModal
          questao={editando.q}
          titulo="Editar questão"
          onSave={salvarEdicao}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

window.Admin = { AdminPage, QuestaoModal };
