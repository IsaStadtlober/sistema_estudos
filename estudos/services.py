"""Agregações do Dashboard. Funções puras de consulta, sem HTTP,
isoladas para serem testadas (Lote 7) ou trocadas depois."""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Q, Sum
from django.utils import timezone

from .models import Concurso, Configuracao, Disciplina, Lancamento, Topico

SEMANAS = 8        # janela dos gráficos semanais
DIAS_CALOR = 91    # 13 semanas no mapa de calor
META_ACERTO = 70   # linha de meta (%)


def _segunda(d):
    return d - timedelta(days=d.weekday())


def _pct(parte, total):
    return round(parte / total * 100, 1) if total else None


def _var(atual, anterior):
    """Variação percentual; None quando não há base de comparação."""
    if not anterior:
        return None
    return round((atual - anterior) / anterior * 100, 1)


def _janelas(periodo, hoje):
    """Período atual e o imediatamente anterior, com a mesma duração."""
    if periodo is None:
        return None, None
    atual = (hoje - timedelta(days=periodo - 1), hoje)
    anterior = (hoje - timedelta(days=2 * periodo - 1), hoje - timedelta(days=periodo))
    return atual, anterior


def _totais(qs):
    r = qs.order_by().aggregate(q=Sum("total"), a=Sum("acertos"), m=Sum("minutos"))
    q, a, m = r["q"] or 0, r["a"] or 0, r["m"] or 0
    return {"questoes": q, "acertos": a, "erros": q - a, "minutos": m, "pct": _pct(a, q)}


def _por_disciplina(qs):
    linhas = (
        qs.order_by()
        .values("topico__disciplina_id")
        .annotate(q=Sum("total"), a=Sum("acertos"))
    )
    return {r["topico__disciplina_id"]: r for r in linhas}


def dashboard_dados(concurso_id, sigla, periodo):
    """concurso_id: int ou None (todos) | sigla: str ou None | periodo: 7, 30, 90 ou None (tudo)."""
    hoje = timezone.localdate()
    cfg = Configuracao.obter()

    f_lanc, f_topico, f_disc, f_conc = Q(), Q(), Q(), Q()
    if concurso_id is not None:
        f_lanc &= Q(topico__disciplina__concurso_id=concurso_id)
        f_topico &= Q(disciplina__concurso_id=concurso_id)
        f_disc &= Q(concurso_id=concurso_id)
        f_conc &= Q(concurso_id=concurso_id)
    if sigla:
        f_lanc &= Q(topico__disciplina__sigla=sigla)
        f_topico &= Q(disciplina__sigla=sigla)
        f_disc &= Q(sigla=sigla)

    base = Lancamento.objects.filter(f_lanc)

    # ---------- Indicadores do período ----------
    janela, janela_ant = _janelas(periodo, hoje)
    qs_periodo = base.filter(data__range=janela) if janela else base
    tot = _totais(qs_periodo)
    var_q = var_m = var_p = None
    if janela_ant:
        ant = _totais(base.filter(data__range=janela_ant))
        var_q = _var(tot["questoes"], ant["questoes"])
        var_m = _var(tot["minutos"], ant["minutos"])
        if tot["pct"] is not None and ant["pct"] is not None:
            var_p = round(tot["pct"] - ant["pct"], 1)

    # ---------- Edital (cobertura) ----------
    topicos = list(Topico.objects.filter(f_topico).select_related("progresso"))
    por_topicos = defaultdict(list)
    n_teoria = n_questoes = n_so_q = 0
    for t in topicos:
        p = getattr(t, "progresso", None)
        teoria = bool(p and p.teoria_concluida_em)
        questoes = bool(p and p.questoes_feitas)
        por_topicos[t.disciplina_id].append((teoria, questoes))
        n_teoria += teoria
        n_questoes += questoes
        n_so_q += questoes and not teoria
    total_t = len(topicos)

    # ---------- Por disciplina ----------
    disciplinas = list(Disciplina.objects.filter(f_disc))
    p_periodo = _por_disciplina(qs_periodo)
    p_total = _por_disciplina(base)
    tabela, grafico, prioridades = [], [], []
    for d in disciplinas:
        itens = por_topicos.get(d.id, [])
        n = len(itens)
        cobertura = round(sum(1 for t, _ in itens if t) / n * 100) if n else 0
        completos = sum(1 for t, q in itens if t and q)

        r = p_periodo.get(d.id)
        q = (r["q"] or 0) if r else 0
        a = (r["a"] or 0) if r else 0
        linha = {
            "id": d.id, "sigla": d.sigla, "nome": d.nome, "cor": d.cor, "peso": d.peso,
            "questoes": q, "acertos": a, "erros": q - a, "pct": _pct(a, q), "cobertura": cobertura,
        }
        tabela.append(linha)
        if q:
            grafico.append({"id": d.id, "nome": d.nome, "cor": d.cor, "pct": linha["pct"]})

        # Prioridade: peso x falta de cobertura x taxa de erro (histórico completo)
        if n:
            rt = p_total.get(d.id)
            qt = (rt["q"] or 0) if rt else 0
            at = (rt["a"] or 0) if rt else 0
            acerto = (at / qt) if qt >= 5 else None
            erro = 1 - acerto if acerto is not None else 0.5
            falta = 1 - completos / n
            prioridades.append({
                "score": d.peso * (falta + 0.2) * (erro + 0.2),
                "id": d.id, "sigla": d.sigla, "nome": d.nome, "cor": d.cor, "peso": d.peso,
                "acerto": round(acerto * 100) if acerto is not None else None,
                "cobertura": cobertura,
            })
    grafico.sort(key=lambda x: x["pct"])
    prioridades.sort(key=lambda x: -x["score"])
    for p in prioridades:
        p["score"] = round(p["score"], 2)

    # ---------- Tópicos mais fracos (mínimo de 5 questões) ----------
    fracos = []
    agrupado = (
        base.order_by()
        .values("topico_id", "topico__nome", "topico__disciplina__nome")
        .annotate(q=Sum("total"), a=Sum("acertos"))
    )
    for r in agrupado:
        if (r["q"] or 0) >= 5:
            fracos.append({
                "topico": r["topico__nome"], "disciplina": r["topico__disciplina__nome"],
                "acertos": r["a"], "total": r["q"], "pct": _pct(r["a"], r["q"]),
            })
    fracos.sort(key=lambda x: (x["pct"], -x["total"]))

    # ---------- Série semanal, trajetória e mapa de calor (1 consulta) ----------
    inicio_sem = _segunda(hoje) - timedelta(weeks=SEMANAS - 1)
    inicio_calor = _segunda(hoje) - timedelta(weeks=12)
    linhas = base.filter(data__gte=inicio_calor, data__lte=hoje).values(
        "data", "topico__disciplina_id", "total", "acertos", "minutos"
    )
    semanas = [{"q": 0, "a": 0, "m": 0} for _ in range(SEMANAS)]
    por_disc_sem = defaultdict(lambda: [{"q": 0, "a": 0} for _ in range(SEMANAS)])
    minutos_dia = defaultdict(int)
    for r in linhas:
        minutos_dia[r["data"]] += r["minutos"]
        i = (r["data"] - inicio_sem).days // 7
        if 0 <= i < SEMANAS:
            s = semanas[i]
            s["q"] += r["total"]
            s["a"] += r["acertos"]
            s["m"] += r["minutos"]
            sd = por_disc_sem[r["topico__disciplina_id"]][i]
            sd["q"] += r["total"]
            sd["a"] += r["acertos"]

    semanal = {
        "labels": [(inicio_sem + timedelta(weeks=i)).strftime("%d/%m") for i in range(SEMANAS)],
        "questoes": [s["q"] for s in semanas],
        "acerto": [_pct(s["a"], s["q"]) for s in semanas],
        "horas": [round(s["m"] / 60, 1) for s in semanas],
        "planejado": round(cfg.minutos_por_dia * len(cfg.dias_ativos) / 60, 1),
    }
    trajetoria = [
        {
            "id": d.id, "sigla": d.sigla, "nome": d.nome, "cor": d.cor,
            "serie": [_pct(x["a"], x["q"]) for x in por_disc_sem.get(d.id, [{"q": 0, "a": 0}] * SEMANAS)],
        }
        for d in disciplinas
    ]
    calor_dias = []
    for i in range(DIAS_CALOR):
        d = inicio_calor + timedelta(days=i)
        calor_dias.append(None if d > hoje else minutos_dia.get(d, 0))

    # ---------- Filtros (lista de disciplinas do concurso escolhido) ----------
    vistas = {}
    for d in Disciplina.objects.filter(f_conc).order_by("ordem", "nome"):
        vistas.setdefault(d.sigla, d.nome)
    nome_concurso = "Todos os concursos"
    if concurso_id is not None:
        nome_concurso = Concurso.objects.filter(pk=concurso_id).values_list("nome", flat=True).first() or ""

    return {
        "filtros": {
            "disciplinas": [{"sigla": s, "nome": n} for s, n in vistas.items()],
            "concurso_nome": nome_concurso,
        },
        "meta_acerto": META_ACERTO,
        "kpis": {
            **tot,
            "var_questoes": var_q, "var_pct": var_p, "var_minutos": var_m,
            "teoria": round(n_teoria / total_t * 100) if total_t else 0,
            "topicos_q": round(n_questoes / total_t * 100) if total_t else 0,
        },
        "cobertura": {
            "teoria": n_teoria, "so_questoes": n_so_q,
            "nao_iniciado": total_t - n_teoria - n_so_q, "total": total_t,
        },
        "prioridades": prioridades[:3],
        "fracos": fracos[:3],
        "semanal": semanal,
        "grafico_acerto": grafico,
        "trajetoria": trajetoria,
        "calor": {"inicio": inicio_calor.isoformat(), "dias": calor_dias, "meta": cfg.minutos_por_dia},
        "tabela": tabela,
    }


def lancamentos_disciplina(disciplina_id, periodo, limite=300):
    """Lançamentos de uma disciplina (drill-down do Dashboard)."""
    hoje = timezone.localdate()
    qs = Lancamento.objects.filter(topico__disciplina_id=disciplina_id).select_related("topico")
    if periodo:
        qs = qs.filter(data__gte=hoje - timedelta(days=periodo - 1))
    total = qs.count()
    itens = [
        {
            "data": l.data.strftime("%d/%m/%Y"), "topico": l.topico.nome,
            "total": l.total, "acertos": l.acertos, "pct": l.percentual,
        }
        for l in qs[:limite]
    ]
    nome = Disciplina.objects.filter(pk=disciplina_id).values_list("nome", flat=True).first() or ""
    return {"disciplina": nome, "itens": itens, "total": total}