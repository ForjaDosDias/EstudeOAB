/* global React */
const { useState: useStateMod, useEffect: useEffectMod } = React;

/* =========================================================
   Página de Moderação
   ========================================================= */
function ModerationPage({ onNavigate }) {
  const [tab,        setTab]        = useStateMod('pending');
  const [reports,    setReports]    = useStateMod([]);
  const [total,      setTotal]      = useStateMod(0);
  const [loading,    setLoading]    = useStateMod(true);
  const [editando,   setEditando]   = useStateMod(null); // report aberto no editor fullscreen

  const carregar = async (status = tab) => {
    setLoading(true);
    try {
      const data = await window.apiFetch(`/reports/admin?status=${status}&limit=100`);
      setReports(data.reports || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('ModerationPage load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffectMod(() => { carregar(tab); setEditando(null); }, [tab]);

  const aposResolver = () => { setEditando(null); carregar(tab); };

  if (editando) {
    return (
      <EditorFullScreen
        report={editando}
        readOnly={tab === 'resolved'}
        onClose={() => setEditando(null)}
        onResolvido={aposResolver}
        onRecarregar={() => carregar(tab)}
      />
    );
  }

  return (
    <div className="admin-page fade-up">
      <header className="admin-header">
        <div>
          <div className="eyebrow">Administração</div>
          <h1 className="page-h1">
            Revisões
            {tab === 'pending' && total > 0 && (
              <span className="chip chip-bordo" style={{marginLeft:12, fontSize:13}}>
                {total} pendente{total !== 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="page-sub">Reports de usuários sobre explicações geradas por IA.</p>
        </div>
        <button className="btn btn-quiet" onClick={() => onNavigate('dashboard')}>← Voltar</button>
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'pending'  ? 'is-active' : ''}`} onClick={() => setTab('pending')}>
          ⚑ Pendentes
        </button>
        <button className={`admin-tab ${tab === 'resolved' ? 'is-active' : ''}`} onClick={() => setTab('resolved')}>
          ✓ Resolvidos
        </button>
      </div>

      {loading && <div className="admin-loading"><div className="admin-spinner" /> Carregando…</div>}

      {!loading && reports.length === 0 && (
        <div className="admin-card">
          <div className="admin-empty-state">
            <div className="admin-empty-icon">{tab === 'pending' ? '○' : '✓'}</div>
            <div className="admin-empty-title">
              {tab === 'pending' ? 'Nenhuma revisão pendente' : 'Nenhuma revisão resolvida'}
            </div>
            <div className="admin-empty-sub">
              {tab === 'pending' ? 'Tudo certo — nenhum report aguardando.' : 'Quando um report for resolvido, aparece aqui.'}
            </div>
          </div>
        </div>
      )}

      {!loading && reports.map(r => (
        <ReportCard
          key={r.id}
          report={r}
          onAbrir={() => setEditando(r)}
          readOnly={tab === 'resolved'}
        />
      ))}
    </div>
  );
}

/* =========================================================
   Card de report na lista
   ========================================================= */
function ReportCard({ report: r, onAbrir, readOnly }) {
  const { AREAS } = window.AppData;
  const area = AREAS[r.area_direito] || { label: r.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };

  return (
    <div className="admin-card" style={{marginBottom:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap'}}>
            <span style={{fontWeight:600, fontSize:'var(--text-sm)'}}>{r.user_nome || 'Usuário'}</span>
            <span style={{color:'var(--text-muted)', fontSize:12}}>· {tempoRelativo(r.created_at)}</span>
            {readOnly && r.corrigido_por_humano && <span className="chip chip-green" style={{fontSize:11}}>✓ Corrigido</span>}
            {readOnly && !r.corrigido_por_humano && <span className="chip chip-neutral" style={{fontSize:11}}>Resolvido sem edição</span>}
            {readOnly && r.resolved_at && (
              <span style={{fontSize:11, color:'var(--text-muted)'}}>
                · resolvido em {new Date(r.resolved_at).toLocaleDateString('pt-BR', {day:'2-digit', month:'short'})}
              </span>
            )}
          </div>

          <blockquote style={{
            margin:'0 0 10px 0', padding:'8px 12px',
            background:'var(--bege)', borderRadius:6,
            fontSize:'var(--text-sm)', color:'var(--text-secondary)',
            fontStyle:'italic', borderLeft:'2px solid var(--bordo)',
          }}>
            "{r.comentario}"
          </blockquote>

          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span className={`area-pill ${area.pillClass}`} style={{padding:'2px 8px', fontSize:11}}>
              {area.icon} {area.label}
            </span>
            {r.external_id && <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)'}}>{r.external_id}</span>}
            {r.banca && <span style={{fontSize:11, color:'var(--text-muted)'}}>{r.banca} {r.edicao || ''}</span>}
          </div>

          <div style={{marginTop:8, fontSize:'var(--text-sm)', color:'var(--text-secondary)'}}>
            {(r.enunciado || '').slice(0, 120)}{r.enunciado?.length > 120 ? '…' : ''}
          </div>
        </div>

        <button className="btn btn-primary btn-sm" style={{flexShrink:0}} onClick={onAbrir}>
          {readOnly ? 'Editar questão →' : 'Ver e corrigir →'}
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Editor em tela cheia
   ========================================================= */
function EditorFullScreen({ report: r, readOnly, onClose, onResolvido, onRecarregar }) {
  const [questao,    setQuestao]    = useStateMod(null);
  const [historico,  setHistorico]  = useStateMod([]);
  const [edits,      setEdits]      = useStateMod([]);
  const [loading,    setLoading]    = useStateMod(true);
  const [salvando,   setSalvando]   = useStateMod(false);
  const [resolvendo, setResolvendo] = useStateMod(false);
  const [modoEdicao, setModoEdicao] = useStateMod(!readOnly); // resolved começa em view, pending começa editando

  useEffectMod(() => {
    setLoading(true);
    Promise.all([
      window.apiFetch(`/questions/${r.question_id}`),
      window.apiFetch(`/reports/admin/${r.id}/historico`),
      window.apiFetch(`/admin/questions/${r.question_id}/edits`),
    ]).then(([q, hist, editLog]) => {
      setQuestao(q);
      setHistorico(hist.historico || []);
      setEdits(editLog.edits || []);
    }).catch(err => {
      console.error('EditorFullScreen load:', err);
      setQuestao({
        id: r.question_id, external_id: r.external_id,
        enunciado: r.enunciado, area_direito: r.area_direito,
        banca: r.banca, edicao: r.edicao, gabarito: r.gabarito,
      });
    }).finally(() => setLoading(false));
  }, [r.id]);

  const salvarEResolver = async (questaoEditada) => {
    setSalvando(true);
    try {
      await Promise.all([
        window.apiFetch(`/admin/questions/${r.question_id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...questaoEditada, source: 'moderation' }),
        }),
        ...(!readOnly ? [window.apiFetch(`/reports/admin/${r.id}/resolve`, { method: 'PATCH' })] : []),
      ]);
      onResolvido();
    } catch (err) {
      alert(err.error || 'Erro ao salvar');
      setSalvando(false);
    }
  };

  const salvarSemResolver = async (questaoEditada) => {
    setSalvando(true);
    try {
      await window.apiFetch(`/admin/questions/${r.question_id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...questaoEditada, source: 'moderation' }),
      });
      // Recarrega log de edições
      const editLog = await window.apiFetch(`/admin/questions/${r.question_id}/edits`);
      setEdits(editLog.edits || []);
      setModoEdicao(false);
      onRecarregar?.();
    } catch (err) {
      alert(err.error || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const apenasResolver = async () => {
    setResolvendo(true);
    try {
      await window.apiFetch(`/reports/admin/${r.id}/resolve`, { method: 'PATCH' });
      onResolvido();
    } catch (err) {
      alert(err.error || 'Erro ao resolver');
      setResolvendo(false);
    }
  };

  const { AREAS } = window.AppData;
  const area = AREAS[r.area_direito] || { label: r.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'var(--bg-base)', overflowY:'auto',
      display:'flex', flexDirection:'column',
    }}>
      {/* Topbar */}
      <div style={{
        position:'sticky', top:0, zIndex:10,
        background:'var(--bg-surface)', borderBottom:'1px solid var(--border)',
        padding:'12px 32px', display:'flex', alignItems:'center', gap:16,
      }}>
        <button className="btn btn-quiet btn-sm" onClick={onClose}>← Voltar às revisões</button>
        <div style={{flex:1}}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontWeight:700}}>{r.external_id || `Questão #${r.question_id}`}</span>
            <span className={`area-pill ${area.pillClass}`} style={{padding:'2px 8px', fontSize:11}}>{area.icon} {area.label}</span>
            {r.corrigido_por_humano && <span className="chip chip-green" style={{fontSize:11}}>✓ Verificado</span>}
          </div>
          <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>
            Report de <strong>{r.user_nome || 'usuário'}</strong> · {tempoRelativo(r.created_at)}
          </div>
        </div>
        {modoEdicao && !readOnly && (
          <div style={{display:'flex', gap:8'}}>
            <button className="btn btn-quiet" disabled={resolvendo} onClick={apenasResolver}>
              {resolvendo ? 'Resolvendo…' : 'Resolver sem editar'}
            </button>
          </div>
        )}
      </div>

      {/* Corpo */}
      <div style={{flex:1, display:'grid', gridTemplateColumns:'380px 1fr', gap:0, maxWidth:1400, margin:'0 auto', width:'100%'}}>

        {/* Coluna esquerda — contexto */}
        <div style={{padding:'32px 24px', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:24}}>

          {/* Comentários do usuário */}
          <div>
            <div className="admin-card-title" style={{marginBottom:12}}>Comentários do usuário</div>
            {historico.map((h, i) => (
              <div key={h.id} style={{
                padding:'10px 14px', borderRadius:8, marginBottom:8,
                background: i === historico.length - 1 ? 'var(--bege)' : 'var(--bg-surface)',
                border:'1px solid var(--border)',
              }}>
                <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4, display:'flex', justifyContent:'space-between'}}>
                  <span>{i === 0 ? 'Original' : `Edição ${i}`}</span>
                  <span>{new Date(h.editado_em).toLocaleString('pt-BR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <div style={{fontSize:'var(--text-sm)', fontStyle:'italic', color:'var(--text-secondary)'}}>
                  "{h.comentario}"
                </div>
              </div>
            ))}
            {historico.length === 0 && loading && (
              <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</div>
            )}
          </div>

          {/* Log de edições da questão */}
          <div>
            <div className="admin-card-title" style={{marginBottom:12}}>Histórico de edições</div>
            {edits.length === 0 && !loading && (
              <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Nenhuma edição registrada.</div>
            )}
            {edits.map(e => (
              <div key={e.id} style={{
                padding:'8px 12px', borderRadius:6, marginBottom:6,
                background:'var(--bg-surface)', border:'1px solid var(--border)',
              }}>
                <div style={{fontWeight:600, fontSize:'var(--text-sm)'}}>{e.admin_nome || e.admin_email || 'Admin'}</div>
                <div style={{fontSize:11, color:'var(--text-muted)', marginTop:2}}>
                  {new Date(e.editado_em).toLocaleString('pt-BR', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita — editor */}
        <div style={{padding:'32px 32px'}}>
          {loading && <div className="admin-loading"><div className="admin-spinner" /> Carregando questão…</div>}

          {!loading && questao && !modoEdicao && (
            <div>
              <div className="admin-card-title" style={{marginBottom:16}}>Questão</div>
              <QuestaoPreview questao={questao} />
              <div style={{marginTop:24, display:'flex', gap:8}}>
                <button className="btn btn-primary" onClick={() => setModoEdicao(true)}>✎ Editar questão</button>
                {!readOnly && (
                  <button className="btn btn-quiet" disabled={resolvendo} onClick={apenasResolver}>
                    {resolvendo ? 'Resolvendo…' : 'Resolver sem editar'}
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && questao && modoEdicao && (
            <QuestaoFormInline
              questao={questao}
              salvando={salvando}
              readOnly={false}
              onSalvarEResolver={!readOnly ? salvarEResolver : null}
              onSalvar={readOnly ? salvarSemResolver : salvarSemResolver}
              onCancelar={() => setModoEdicao(false)}
              labelPrimario={readOnly ? 'Salvar alterações' : 'Salvar e resolver'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Preview somente-leitura da questão
   ========================================================= */
function QuestaoPreview({ questao: q }) {
  const letras = ['A','B','C','D'];
  const alts = [q.alternativa_a, q.alternativa_b, q.alternativa_c, q.alternativa_d];
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        {[['Banca', q.banca], ['Edição', q.edicao], ['Ano', q.ano], ['Área', q.area_direito], ['Dificuldade', q.dificuldade], ['Gabarito', q.gabarito]].map(([l, v]) => (
          <div key={l}>
            <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:2}}>{l}</div>
            <div style={{fontSize:'var(--text-sm)', fontWeight:500}}>{v || '—'}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>Enunciado</div>
        <div style={{fontSize:'var(--text-sm)', lineHeight:1.6, color:'var(--text-primary)'}}>{q.enunciado}</div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        {alts.map((alt, i) => alt && (
          <div key={i} style={{
            padding:'8px 12px', borderRadius:6,
            background: letras[i] === q.gabarito ? 'rgba(var(--green-rgb, 34,197,94), 0.08)' : 'var(--bg-surface)',
            border: `1px solid ${letras[i] === q.gabarito ? 'var(--green)' : 'var(--border)'}`,
            fontSize:'var(--text-sm)',
          }}>
            <strong>{letras[i]})</strong> {alt}
            {letras[i] === q.gabarito && <span style={{marginLeft:6, fontSize:11, color:'var(--green-dark)'}}>✓ gabarito</span>}
          </div>
        ))}
      </div>
      {q.explicacao && (
        <div>
          <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>Explicação</div>
          <div style={{fontSize:'var(--text-sm)', lineHeight:1.6, color:'var(--text-secondary)'}}>{q.explicacao}</div>
        </div>
      )}
      {q.legislacao_ref && (
        <div style={{fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)'}}>{q.legislacao_ref}</div>
      )}
    </div>
  );
}

/* =========================================================
   Formulário de edição inline (sem modal)
   ========================================================= */
function QuestaoFormInline({ questao, salvando, onSalvarEResolver, onSalvar, onCancelar, labelPrimario }) {
  const [form, setForm] = useStateMod({ ...questao });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="admin-card-title" style={{marginBottom:16}}>Editar questão</div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16}}>
        <FI label="Banca"   value={form.banca   || ''} onChange={v => set('banca', v)} />
        <FI label="Edição"  value={form.edicao  || ''} onChange={v => set('edicao', v)} />
        <FI label="Ano"     value={form.ano     || ''} onChange={v => set('ano', v)} />
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
      </div>

      <TA label="Enunciado" value={form.enunciado || ''} onChange={v => set('enunciado', v)} rows={5} />

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
        <TA label="Alternativa A" value={form.alternativa_a || ''} onChange={v => set('alternativa_a', v)} />
        <TA label="Alternativa B" value={form.alternativa_b || ''} onChange={v => set('alternativa_b', v)} />
        <TA label="Alternativa C" value={form.alternativa_c || ''} onChange={v => set('alternativa_c', v)} />
        <TA label="Alternativa D" value={form.alternativa_d || ''} onChange={v => set('alternativa_d', v)} />
      </div>

      <div style={{marginTop:12}}>
        <FI label="Referência legal (ex: Art. 186 · CC/2002)" value={form.legislacao_ref || ''} onChange={v => set('legislacao_ref', v)} />
      </div>

      <div style={{marginTop:12}}>
        <TA label="Explicação da resposta" value={form.explicacao || ''} onChange={v => set('explicacao', v)} rows={5} />
      </div>

      <div style={{marginTop:24, display:'flex', gap:8, flexWrap:'wrap'}}>
        {onSalvarEResolver && (
          <button className="btn btn-cta" disabled={!form.enunciado?.trim() || salvando}
                  onClick={() => onSalvarEResolver(form)}>
            {salvando ? 'Salvando…' : labelPrimario || 'Salvar e resolver'}
          </button>
        )}
        {onSalvar && (
          <button className="btn btn-primary" disabled={!form.enunciado?.trim() || salvando}
                  onClick={() => onSalvar(form)}>
            {salvando ? 'Salvando…' : onSalvarEResolver ? 'Salvar sem resolver' : labelPrimario || 'Salvar alterações'}
          </button>
        )}
        <button className="btn btn-quiet" disabled={salvando} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function FI({ label, value, onChange }) {
  return (
    <div className="input-group" style={{marginBottom:0}}>
      <label className="input-label">{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function TA({ label, value, onChange, rows = 3 }) {
  return (
    <div className="input-group" style={{marginBottom:0}}>
      <label className="input-label">{label}</label>
      <textarea className="input-field" rows={rows} value={value} onChange={e => onChange(e.target.value)}
                style={{resize:'vertical', fontFamily:'inherit'}} />
    </div>
  );
}

function tempoRelativo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

window.Moderation = { ModerationPage };
