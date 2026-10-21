from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .context import obter_concurso_ativo
from .models import Concurso, Configuracao


def dashboard(request):
    ativo = obter_concurso_ativo()
    disciplinas = []
    if ativo:
        disciplinas = list(ativo.disciplinas.values("id", "sigla", "nome", "peso", "cor"))
    return render(request, "dashboard.html", {"disciplinas": disciplinas})


def _em_construcao(request, titulo, lote):
    return render(request, "em_construcao.html", {"titulo": titulo, "lote": lote})


def hoje(request):
    return _em_construcao(request, "Hoje", 3)


def cronograma(request):
    return _em_construcao(request, "Cronograma", 3)


def edital(request):
    return _em_construcao(request, "Edital Verticalizado", 3)


def lancar(request):
    return _em_construcao(request, "Lançar Resultado", 3)


def ajustes(request):
    return _em_construcao(request, "Ajustes", 3)


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