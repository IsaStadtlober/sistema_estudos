from datetime import timedelta

from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .context import obter_concurso_ativo
from .models import BlocoConcluido, Concurso, Configuracao, Lancamento, Topico

CICLO_REVISAO = [1, 7, 15, 30]  # dias após a teoria (cumulativo)
DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


# ---------- utilitários ----------

def _teoria_ok(topico):
    p = getattr(topico, "progresso", None)
    return bool(p and p.teoria_concluida)


def _divide_minutos(total):
    """Divisão do dia: 40% teoria, 35% questões, o restante revisão (105 -> 42/37/26)."""
    teoria = round(total * 0.40)
    questoes = round(total * 0.35)
    return teoria, questoes, total - teoria - questoes


def _fila_provisoria(grupos, n):
    """Fila de teoria por rodízio ponderado pelo peso. PROVISÓRIA: a versão final vem no Lote 5.
    grupos: lista de (disciplina, [tópicos pendentes]) na ordem das disciplinas."""
    grupos = [{"d": d, "itens": list(its), "cred": 0} for d, its in grupos if its]
    fila = []
    while grupos and len(fila) < n:
        total = sum(g["d"].peso for g in grupos)
        for g in grupos:
            g["cred"] += g["d"].peso
        melhor = max(grupos, key=lambda g: g["cred"])
        melhor["cred"] -= total
        fila.append((melhor["d"], melhor["itens"].pop(0)))
        grupos = [g for g in grupos if g["itens"]]
    return fila


# ---------- Dashboard ----------

def dashboard(request):
    ativo = obter_concurso_ativo()
    return render(request, "dashboard.html", {"plano": _plano_provisorio(ativo, Configuracao.obter())})


# ---------- Hoje ----------

def _plano_provisorio(concurso, cfg):
    hoje = timezone.localdate()
    m_teoria, m_questoes, m_revisao = _divide_minutos(cfg.minutos_por_dia)
    plano = {
        "data": hoje,
        "minutos": cfg.minutos_por_dia,
        "m_teoria": m_teoria,
        "m_questoes": m_questoes,
        "m_revisao": m_revisao,
        "n_questoes": max(5, m_questoes // 3),
        "n_revisao": max(3, m_revisao // 3),
        "dia_de_estudo": hoje.weekday() in cfg.dias_ativos,
        "teoria": None,
        "questoes": None,
        "revisao": None,
        "proximos": [],
        "concluidos": 0,
        "percentual": 0,
    }
    if concurso is None:
        return plano

    lista = list(
        Topico.objects.filter(disciplina__concurso=concurso)
        .select_related("disciplina", "progresso")
        .annotate(n_rev=Count("revisoes"))
    )

    def resumo(t, **extra):
        return {"disciplina": t.disciplina.nome, "topico": t.nome, "cor": t.disciplina.cor, **extra}

    # Teoria do dia e próximos dias
    grupos = {}
    for t in lista:
        if not _teoria_ok(t):
            grupos.setdefault(t.disciplina, []).append(t)
    fila = _fila_provisoria(list(grupos.items()), 4)
    if fila:
        plano["teoria"] = resumo(fila[0][1])

    dia = hoje
    for disc, topico in fila[1:]:
        if not cfg.dias_ativos:
            break
        dia += timedelta(days=1)
        while dia.weekday() not in cfg.dias_ativos:
            dia += timedelta(days=1)
        rotulo = "Amanhã" if (dia - hoje).days == 1 else DIAS_SEMANA[dia.weekday()]
        plano["proximos"].append({
            "rotulo": f"{rotulo} ({dia:%d/%m})",
            "disciplina": disc.nome,
            "topico": topico.nome,
            "cor": disc.cor,
        })

    # Questões: tópico com teoria vista e ainda sem questões (o mais recente)
    feitos = [t for t in lista if _teoria_ok(t)]
    sem_q = sorted(
        (t for t in feitos if not t.progresso.questoes_feitas),
        key=lambda t: t.progresso.teoria_concluida_em,
        reverse=True,
    )
    if sem_q:
        plano["questoes"] = resumo(sem_q[0])
    elif plano["teoria"]:
        plano["questoes"] = plano["teoria"]

    # Revisão: a mais atrasada dentro do ciclo 1-7-15-30
    vencidas = []
    for t in feitos:
        if t.n_rev < 4:
            vence = t.progresso.teoria_concluida_em + timedelta(days=CICLO_REVISAO[t.n_rev])
            if vence <= hoje:
                vencidas.append((vence, t))
    if vencidas:
        vence, t = min(vencidas, key=lambda x: x[0])
        plano["revisao"] = resumo(t, ciclo=f"R{CICLO_REVISAO[t.n_rev]}", atraso=(hoje - vence).days)

    # Progresso do dia
    plano["concluidos"] = (
        BlocoConcluido.objects.filter(data=hoje, topico__disciplina__concurso=concurso)
        .values("tipo").distinct().count()
    )
    plano["percentual"] = round(plano["concluidos"] / 3 * 100)
    return plano


def hoje(request):
    ativo = obter_concurso_ativo()
    return render(request, "hoje.html", {"plano": _plano_provisorio(ativo, Configuracao.obter())})


# ---------- Cronograma ----------

def cronograma(request):
    ativo = obter_concurso_ativo()
    cfg = Configuracao.obter()
    disciplinas, historico = [], {}
    if ativo:
        qs = ativo.disciplinas.prefetch_related(
            Prefetch("topicos", queryset=Topico.objects.select_related("progresso"))
        )
        for d in qs:
            disciplinas.append({
                "sigla": d.sigla, "nome": d.nome, "cor": d.cor, "peso": d.peso,
                "pendentes": [t.nome for t in d.topicos.all() if not _teoria_ok(t)],
            })
        lancs = Lancamento.objects.filter(topico__disciplina__concurso=ativo).select_related("topico__disciplina")
        for l in lancs:
            historico.setdefault(l.data.isoformat(), []).append({
                "sigla": l.topico.disciplina.sigla,
                "disciplina": l.topico.disciplina.nome,
                "cor": l.topico.disciplina.cor,
                "topico": l.topico.nome,
                "total": l.total,
                "acertos": l.acertos,
            })
    dados = {
        "hoje": timezone.localdate().isoformat(),
        "prova": ativo.data_prova.isoformat() if ativo and ativo.data_prova else None,
        "minutos": cfg.minutos_por_dia,
        "dias_ativos": cfg.dias_ativos,
        "disciplinas": disciplinas,
        "historico": historico,
    }
    return render(request, "cronograma.html", {"dados": dados})


# ---------- Edital ----------

def edital(request):
    ativo = obter_concurso_ativo()
    discs, total, feitos = [], 0, 0
    if ativo:
        qs = ativo.disciplinas.prefetch_related(
            Prefetch("topicos", queryset=Topico.objects.select_related("progresso").annotate(n_rev=Count("revisoes")))
        )
        for d in qs:
            itens = []
            for t in d.topicos.all():
                p = getattr(t, "progresso", None)
                itens.append({
                    "id": t.id,
                    "nome": t.nome,
                    "teoria": bool(p and p.teoria_concluida),
                    "questoes": bool(p and p.questoes_feitas),
                    "revisoes": t.n_rev,
                })
            n_teoria = sum(1 for i in itens if i["teoria"])
            total += len(itens)
            feitos += n_teoria
            discs.append({"nome": d.nome, "peso": d.peso, "cor": d.cor, "topicos": itens, "feitos": n_teoria})
    return render(request, "edital.html", {
        "disciplinas_edital": discs,
        "pct_teoria": round(feitos / total * 100) if total else 0,
    })


# ---------- Lançar ----------

def lancar(request):
    ativo = obter_concurso_ativo()
    discs, historico = [], []
    if ativo:
        for d in ativo.disciplinas.prefetch_related("topicos"):
            discs.append({"id": d.id, "nome": d.nome, "topicos": [{"id": t.id, "nome": t.nome} for t in d.topicos.all()]})
        qs = Lancamento.objects.filter(topico__disciplina__concurso=ativo).select_related("topico__disciplina")[:10]
        for l in qs:
            historico.append({
                "data": l.data,
                "disciplina": l.topico.disciplina.nome,
                "topico": l.topico.nome,
                "total": l.total,
                "acertos": l.acertos,
                "erros": l.total - l.acertos,
                "pct": l.percentual,
            })
    return render(request, "lancar.html", {
        "disc_lancar": discs,
        "historico": historico,
        "hoje_iso": timezone.localdate().isoformat(),
    })


# ---------- Ajustes ----------

def ajustes(request):
    cfg = Configuracao.obter()
    dias = [{"valor": i, "nome": n, "ativo": i in cfg.dias_ativos} for i, n in enumerate(DIAS_SEMANA)]
    return render(request, "ajustes.html", {"cfg": cfg, "dias": dias})


# ---------- Concurso ativo ----------

@require_POST
def trocar_concurso(request):
    concurso = get_object_or_404(Concurso, pk=request.POST.get("concurso"))
    cfg = Configuracao.obter()
    cfg.concurso_ativo = concurso
    cfg.save()
    destino = request.POST.get("next", "")
    if not url_has_allowed_host_and_scheme(destino, allowed_hosts={request.get_host()}):
        destino = "dashboard"
    return redirect(destino)