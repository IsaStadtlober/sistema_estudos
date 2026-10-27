from datetime import timedelta

from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from . import ajustes_svc, edicao
from .context import obter_concurso_ativo
from .models import Concurso, Configuracao, Lancamento, Subtopico, Topico

DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

TIPO_NOME = {"teoria": "Teoria", "questoes": "Questões", "revisao": "Revisão", "simulado": "Simulado"}
TIPO_COR = {"teoria": "#3b82f6", "questoes": "#10b981", "revisao": "#8b5cf6", "simulado": "#f59e0b"}
ORDEM_TIPOS = ["teoria", "questoes", "revisao", "simulado"]


# ---------- utilitários do plano cadastrado ----------

def _item_dict(i):
    return {
        "id": i.id,
        "tipo": i.tipo,
        "tipo_nome": TIPO_NOME[i.tipo],
        "cor_tipo": TIPO_COR[i.tipo],
        "minutos": i.minutos,
        "questoes": i.questoes,
        "disciplina": i.disciplina.nome if i.disciplina_id else "",
        "cor": i.disciplina.cor if i.disciplina_id else "#9ca3af",
        "topico": i.topico.nome if i.topico_id else "",
        "obs": i.obs,
        "concluido": i.concluido,
    }


def _resumo_itens(itens):
    total = sum(i["minutos"] for i in itens)
    feitos = [i for i in itens if i["concluido"]]
    por_tipo = {}
    for i in itens:
        por_tipo[i["tipo"]] = por_tipo.get(i["tipo"], 0) + i["minutos"]
    segmentos = []
    if total:
        for t in ORDEM_TIPOS:
            if por_tipo.get(t):
                segmentos.append({"tipo_nome": TIPO_NOME[t], "cor": TIPO_COR[t], "minutos": por_tipo[t]})
    return {
        "minutos": total,
        "questoes": sum(i["questoes"] or 0 for i in itens),
        "concluidos": len(feitos),
        "total": len(itens),
        "minutos_feitos": sum(i["minutos"] for i in feitos),
        "percentual": round(len(feitos) / len(itens) * 100) if itens else 0,
        "segmentos": segmentos,
    }


def _proximos_itens(concurso, hoje):
    """Próximos 3 dias que têm itens no plano."""
    qs = concurso.itens_cronograma.filter(
        data__gt=hoje, data__lte=hoje + timedelta(days=30)
    ).select_related("disciplina", "topico")
    grupos = {}
    for i in qs:
        if i.data not in grupos:
            if len(grupos) == 3:
                break
            grupos[i.data] = []
        grupos[i.data].append(_item_dict(i))
    saida = []
    for dia, its in grupos.items():
        rotulo = "Amanhã" if (dia - hoje).days == 1 else DIAS_SEMANA[dia.weekday()]
        saida.append({
            "rotulo": f"{rotulo} ({dia:%d/%m})",
            "total_min": sum(x["minutos"] for x in its),
            "itens": its[:3],
            "extra": max(0, len(its) - 3),
        })
    return saida


def _plano_do_dia(concurso):
    """Resumo do plano de hoje para o banner do Dashboard (só itens cadastrados)."""
    itens = []
    if concurso is not None:
        itens = list(
            concurso.itens_cronograma.filter(data=timezone.localdate()).select_related("disciplina")
        )

    def primeiro(*tipos):
        for i in itens:
            if i.tipo in tipos:
                return i.disciplina.nome if i.disciplina_id else TIPO_NOME[i.tipo]
        return "—"

    def soma(*tipos):
        return sum(i.minutos for i in itens if i.tipo in tipos)

    return {
        "tem_plano": bool(itens),
        "itens": len(itens),
        "minutos": sum(i.minutos for i in itens),
        "m_teoria": soma("teoria"),
        "m_questoes": soma("questoes", "simulado"),
        "m_revisao": soma("revisao"),
        "d_teoria": primeiro("teoria"),
        "d_questoes": primeiro("questoes", "simulado"),
        "d_revisao": primeiro("revisao"),
    }


# ---------- Dashboard ----------

def dashboard(request):
    return render(request, "dashboard.html", {"plano": _plano_do_dia(obter_concurso_ativo())})


# ---------- Hoje ----------

def hoje(request):
    ativo = obter_concurso_ativo()
    cfg = Configuracao.obter()
    hoje_d = timezone.localdate()

    itens, proximos = [], []
    if ativo:
        itens = [
            _item_dict(i)
            for i in ativo.itens_cronograma.filter(data=hoje_d).select_related("disciplina", "topico")
        ]
        proximos = _proximos_itens(ativo, hoje_d)

    ctx = {
        "hoje_data": hoje_d,
        "dia_de_estudo": hoje_d.weekday() in cfg.dias_ativos,
        "itens_hoje": itens,
        "proximos_itens": proximos,
    }
    if itens:
        ctx["resumo"] = _resumo_itens(itens)
    return render(request, "hoje_plano.html", ctx)


# ---------- Cronograma ----------

def cronograma(request):
    from . import plano as plano_svc
    return render(request, "cronograma.html", {"dados": plano_svc.dados_cronograma(obter_concurso_ativo())})


# ---------- Disciplinas ----------

def disciplinas(request):
    return render(request, "disciplinas.html", {"dados": edicao.listar_disciplinas(obter_concurso_ativo())})


# ---------- Edital ----------

def edital(request):
    ativo = obter_concurso_ativo()
    discs, total, feitos = [], 0, 0
    if ativo:
        # Subtópicos numa consulta separada, agrupados por tópico
        subs = {}
        for s in Subtopico.objects.filter(topico__disciplina__concurso=ativo).order_by("ordem", "id"):
            subs.setdefault(s.topico_id, []).append(s.nome)

        qs = ativo.disciplinas.prefetch_related(
            Prefetch("topicos", queryset=Topico.objects.select_related("progresso").annotate(n_rev=Count("revisoes")))
        )
        for d in qs:
            itens = []
            for t in d.topicos.all():
                p = getattr(t, "progresso", None)
                nomes = subs.get(t.id, [])
                itens.append({
                    "id": t.id,
                    "nome": t.nome,
                    "teoria": bool(p and p.teoria_concluida),
                    "questoes": bool(p and p.questoes_feitas),
                    "revisoes": t.n_rev,
                    "subs": nomes,
                    "busca": " ".join(nomes),
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
    return render(request, "ajustes.html", {
        "cfg": cfg,
        "dias": dias,
        "concursos_lista": ajustes_svc.listar_concursos(),
    })


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