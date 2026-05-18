/* global React */
const { useState: useStateMod, useEffect: useEffectMod } = React;

/* =========================================================
   Página de Moderação — fila de reports de usuários
   ========================================================= */
function ModerationPage({ onNavigate }) {
  const [tab,        setTab]        = useStateMod('pending'); // pending | resolved
  const [reports,    setReports]    = useStateMod([]);
  const [total,      setTotal]      = useStateMod(0);
  const [loading,    setLoading]    = useStateMod(true);
  const [selecionado, setSelecionado] = useStateMod(null); // report aberto no painel lateral

  const carregar = async (status = tab) => {
    setLoading(true);
    try {
      const data = await window.apiFetch(`/reports/admin?status=${status}&limit=50`);
      setReports(data.reports || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('ModerationPage load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffectMod(() => { carregar(tab); setSelecionado(null); }, [tab]);

  const trocarTab = (t) => { setTab(t); };

  const aposResolver = () => {
    setSelecionado(null);
    carregar(tab);
  };

  const pendentes = tab === 'pending' ? total : 0;

  return (
    <div className="admin-page fade-up">
      <header className="admin-header">
        <div>
          <div className="eyebrow">Administração</div>
          <h1 className="page-h1">
            Revisões
            {pendentes > 0 && <span className="chip chip-bordo" style={{marginLeft:12, fontSize:13}}>{pendentes} pendente{pendentes !== 1 ? 's' : ''}</span>}
          </h1>
          <p className="page-sub">Reports de usuários sobre explicações geradas por IA.</p>
        </div>
        <button className="btn btn-quiet" onClick={() => onNavigate('dashboard')}>← Voltar</button>
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'pending'  ? 'is-active' : ''}`} onClick={() => trocarTab('pending')}>
          ⚑ Pendentes
        </button>
        <button className={`admin-tab ${tab === 'resolved' ? 'is-active' : ''}`} onClick={() => trocarTab('resolved')}>
          ✓ Resolvidos
        </button>
      </div>

      <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
        {/* Lista de reports */}
        <div style={{flex:1, minWidth:0}}>
          {loading && (
            <div className="admin-loading"><div className="admin-spinner" /> Carregando…</div>
          )}
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
              isSelected={selecionado?.id === r.id}
              onSelect={() => setSelecionado(selecionado?.id === r.id ? null : r)}
              readOnly={tab === 'resolved'}
            />
          ))}
        </div>

        {/* Painel lateral de edição */}
        {selecionado && (
          <div style={{width: 520, flexShrink:0}}>
            <PainelEdicao
              report={selecionado}
              readOnly={tab === 'resolved'}
              onClose={() => setSelecionado(null)}
              onResolvido={aposResolver}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Card de report na lista
   ========================================================= */
function ReportCard({ report: r, isSelected, onSelect, readOnly }) {
  const { AREAS } = window.AppData;
  const area = AREAS[r.area_direito] || { label: r.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };
  const tempo = tempoRelativo(r.created_at);

  return (
    <div
      className="admin-card"
      style={{
        marginBottom: 12, cursor: 'pointer',
        borderLeft: isSelected ? '3px solid var(--bordo)' : '3px solid transparent',
        transition: 'border-color 0.15s',
      }}
      onClick={onSelect}
    >
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
            <span style={{fontWeight:600, fontSize:'var(--text-sm)'}}>{r.user_nome || 'Usuário'}</span>
            <span style={{color:'var(--text-muted)', fontSize:12}}>· {tempo}</span>
            {readOnly && r.corrigido_por_humano && (
              <span className="chip chip-green" style={{fontSize:11}}>✓ Corrigido</span>
            )}
            {readOnly && !r.corrigido_por_humano && (
              <span className="chip chip-neutral" style={{fontSize:11}}>Resolvido sem edição</span>
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
            {(r.enunciado || '').slice(0, 100)}{r.enunciado?.length > 100 ? '…' : ''}
          </div>
        </div>

        {!readOnly && (
          <button className="btn btn-quiet btn-sm" style={{flexShrink:0, whiteSpace:'nowrap'}}
                  onClick={e => { e.stopPropagation(); onSelect(); }}>
            {isSelected ? 'Fechar' : 'Ver e corrigir →'}
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Painel lateral de edição + histórico
   ========================================================= */
function PainelEdicao({ report: r, readOnly, onClose, onResolvido }) {
  const [questao,    setQuestao]    = useStateMod(null);
  const [historico,  setHistorico]  = useStateMod([]);
  const [loading,    setLoading]    = useStateMod(true);
  const [salvando,   setSalvando]   = useStateMod(false);
  const [resolvendo, setResolvendo] = useStateMod(false);
  const [editando,   setEditando]   = useStateMod(false);

  useEffectMod(() => {
    setLoading(true);
    Promise.all([
      window.apiFetch(`/questions?limit=1&offset=0`).then(() => null).catch(() => null), // só para warmup
      window.apiFetch(`/reports/admin/${r.id}/historico`),
    ]).then(([, hist]) => {
      setHistorico(hist.historico || []);
    }).catch(console.error);

    // Busca a questão completa
    window.apiFetch(`/questions/${r.question_id}`).then(q => {
      setQuestao(q);
    }).catch(() => {
      // Fallback: usa dados do report
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
        window.apiFetch(`/reports/admin/${r.id}/resolve`, { method: 'PATCH' }),
      ]);
      setEditando(false);
      onResolvido();
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
    } finally {
      setResolvendo(false);
    }
  };

  return (
    <div className="admin-card" style={{position:'sticky', top:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div>
          <div className="eyebrow">Revisão #{r.id}</div>
          <div style={{fontWeight:700}}>{r.external_id || `Questão #${r.question_id}`}</div>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      {/* Histórico de comentários */}
      <div style={{marginBottom:20}}>
        <div className="admin-card-title" style={{marginBottom:8}}>Histórico de comentários</div>
        {historico.length === 0 && loading && (
          <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</div>
        )}
        {historico.map((h, i) => (
          <div key={h.id} style={{
            padding:'8px 12px', borderRadius:6, marginBottom:6,
            background: i === historico.length - 1 ? 'var(--bege)' : 'transparent',
            border:'1px solid var(--border)',
          }}>
            <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>
              {i === 0 ? 'Original' : `Edição ${i}`} · {new Date(h.editado_em).toLocaleString('pt-BR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>
            <div style={{fontSize:'var(--text-sm)', fontStyle:'italic', color:'var(--text-secondary)'}}>
              "{h.comentario}"
            </div>
          </div>
        ))}
      </div>

      {/* Questão */}
      {!loading && questao && !editando && !readOnly && (
        <div>
          <div className="admin-card-title" style={{marginBottom:8}}>Questão</div>
          <div style={{fontSize:'var(--text-sm)', color:'var(--text-secondary)', marginBottom:12, maxHeight:120, overflow:'auto'}}>
            {questao.enunciado}
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={() => setEditando(true)}>
              ✎ Editar e resolver
            </button>
            <button className="btn btn-quiet" disabled={resolvendo} onClick={apenasResolver}>
              {resolvendo ? 'Resolvendo…' : 'Resolver sem editar'}
            </button>
          </div>
        </div>
      )}

      {readOnly && questao && (
        <div>
          <div className="admin-card-title" style={{marginBottom:8}}>Questão</div>
          <div style={{fontSize:'var(--text-sm)', color:'var(--text-secondary)'}}>
            {questao.enunciado}
          </div>
          {r.resolved_at && (
            <div style={{marginTop:10, fontSize:12, color:'var(--text-muted)'}}>
              Resolvido em {new Date(r.resolved_at).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'})}
            </div>
          )}
        </div>
      )}

      {/* Modal de edição inline */}
      {editando && questao && (
        <window.Admin.QuestaoModal
          questao={questao}
          titulo="Editar questão"
          onSave={salvando ? () => {} : salvarEResolver}
          onClose={() => setEditando(false)}
        />
      )}
    </div>
  );
}

/* =========================================================
   Utilitário
   ========================================================= */
function tempoRelativo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

window.Moderation = { ModerationPage };
