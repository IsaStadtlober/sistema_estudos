import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST

from . import ajustes_svc, edicao, plano, services
from .context import obter_concurso_ativo
from .models import ItemCronograma

PERIODOS_VALIDOS = (7, 30, 90)


def _json(dados, status=200):
    return JsonResponse(dados, status=status, json_dumps_params={"ensure_ascii": False})


def _corpo(request):
    try:
        dados = json.loads(request.body or b"{}")
    except (ValueError, UnicodeDecodeError):
        raise ValueError("Requisição inválida.")
    if not isinstance(dados, dict):
        raise ValueError("Requisição inválida.")
    return dados


def _inteiro_ou_none(valor):
    if valor in (None, "", "ALL"):
        return None
    return int(valor)


def _com_concurso(request, acao):
    """Roda acao(concurso_ativo, corpo) e devolve JSON de sucesso ou de erro."""
    ativo = obter_concurso_ativo()
    if ativo is None:
        return _json({"erro": "Nenhum concurso ativo."}, 400)
    try:
        return _json(acao(ativo, _corpo(request)))
    except edicao.PrecisaConfirmar as e:
        return _json({"erro": str(e), "precisa_confirmar": True, "lancamentos": e.lancamentos}, 409)
    except ValueError as e:
        return _json({"erro": str(e)}, 400)


# ---------- Dashboard ----------

@require_GET
def dashboard_api(request):
    try:
        concurso = _inteiro_ou_none(request.GET.get("concurso"))
        periodo = _inteiro_ou_none(request.GET.get("periodo", "30"))
    except ValueError:
        return _json({"erro": "Filtros inválidos."}, 400)
    if periodo is not None and periodo not in PERIODOS_VALIDOS:
        return _json({"erro": "Período inválido."}, 400)

    sigla = request.GET.get("disciplina")
    if sigla in ("", "ALL"):
        sigla = None
    return _json(services.dashboard_dados(concurso, sigla, periodo))


@require_GET
def lancamentos_api(request):
    try:
        disciplina = int(request.GET["disciplina"])
        periodo = _inteiro_ou_none(request.GET.get("periodo", "30"))
    except (KeyError, ValueError):
        return _json({"erro": "Parâmetros inválidos."}, 400)
    if periodo is not None and periodo not in PERIODOS_VALIDOS:
        return _json({"erro": "Período inválido."}, 400)
    return _json(services.lancamentos_disciplina(disciplina, periodo))


# ---------- Cronograma ----------

@require_GET
def cronograma_dados(request):
    return _json(plano.dados_cronograma(obter_concurso_ativo()))


@require_POST
def item_salvar(request):
    return _com_concurso(
        request, lambda a, c: {"ok": True, "item": plano.serializar_item(plano.salvar_item(a, c))}
    )


@require_POST
def item_excluir(request, pk):
    item = get_object_or_404(ItemCronograma, pk=pk, concurso=obter_concurso_ativo())
    item.delete()
    return _json({"ok": True})


@require_POST
def item_concluir(request, pk):
    item = get_object_or_404(ItemCronograma, pk=pk, concurso=obter_concurso_ativo())
    try:
        corpo = _corpo(request)
    except ValueError as e:
        return _json({"erro": str(e)}, 400)
    item.concluido = bool(corpo["concluido"]) if "concluido" in corpo else not item.concluido
    item.save(update_fields=["concluido"])
    return _json({"ok": True, "concluido": item.concluido})


@require_POST
def item_mover(request, pk):
    return _com_concurso(
        request,
        lambda a, c: {"ok": True, "item": plano.serializar_item(edicao.mover_item(a, pk, c.get("data")))},
    )


@require_POST
def cronograma_limpar(request):
    return _com_concurso(
        request,
        lambda a, c: {"ok": True, **edicao.excluir_itens(
            a, c.get("inicio"), c.get("fim"), bool(c.get("incluir_concluidos")), bool(c.get("confirmar"))
        )},
    )


@require_POST
def importar(request):
    return _com_concurso(
        request,
        lambda a, c: plano.importar(
            c.get("texto", ""), a, substituir=bool(c.get("substituir")), aplicar=bool(c.get("aplicar"))
        ),
    )


# ---------- Disciplinas e tópicos ----------

@require_GET
def disciplinas_dados(request):
    return _json(edicao.listar_disciplinas(obter_concurso_ativo()))


@require_POST
def disciplina_salvar(request):
    return _com_concurso(request, lambda a, c: {"ok": True, "id": edicao.salvar_disciplina(a, c).id})


@require_POST
def disciplina_excluir(request, pk):
    return _com_concurso(
        request,
        lambda a, c: {"ok": True, **edicao.excluir_disciplina(a, pk, bool(c.get("apagar_historico")))},
    )


@require_POST
def topico_salvar(request):
    return _com_concurso(request, lambda a, c: {"ok": True, "id": edicao.salvar_topico(a, c).id})


@require_POST
def topico_excluir(request, pk):
    return _com_concurso(
        request,
        lambda a, c: {"ok": True, **edicao.excluir_topico(a, pk, bool(c.get("apagar_historico")))},
    )

# ---------- Ajustes: concursos e rotina ----------

def _executar(request, acao):
    """Roda acao(corpo) sem exigir concurso ativo (Ajustes precisa funcionar mesmo sem ele)."""
    try:
        return _json(acao(_corpo(request)))
    except edicao.PrecisaConfirmar as e:
        return _json({"erro": str(e), "precisa_confirmar": True, "lancamentos": e.lancamentos}, 409)
    except ValueError as e:
        return _json({"erro": str(e)}, 400)


@require_POST
def concurso_salvar(request):
    def acao(c):
        concurso, novo = ajustes_svc.salvar_concurso(c)
        return {"ok": True, "id": concurso.id, "novo": novo}
    return _executar(request, acao)


@require_POST
def concurso_excluir(request, pk):
    return _executar(
        request,
        lambda c: {"ok": True, **ajustes_svc.excluir_concurso(pk, bool(c.get("apagar_historico")))},
    )


@require_POST
def rotina_salvar(request):
    return _executar(request, lambda c: {"ok": True, **ajustes_svc.salvar_rotina(c)})