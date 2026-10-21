from django.http import JsonResponse
from django.views.decorators.http import require_GET

from . import services

PERIODOS_VALIDOS = (7, 30, 90)


def _inteiro_ou_none(valor):
    if valor in (None, "", "ALL"):
        return None
    return int(valor)


@require_GET
def dashboard_api(request):
    try:
        concurso = _inteiro_ou_none(request.GET.get("concurso"))
        periodo = _inteiro_ou_none(request.GET.get("periodo", "30"))
    except ValueError:
        return JsonResponse({"erro": "Filtros inválidos."}, status=400)
    if periodo is not None and periodo not in PERIODOS_VALIDOS:
        return JsonResponse({"erro": "Período inválido."}, status=400)

    sigla = request.GET.get("disciplina")
    if sigla in ("", "ALL"):
        sigla = None
    return JsonResponse(services.dashboard_dados(concurso, sigla, periodo))


@require_GET
def lancamentos_api(request):
    try:
        disciplina = int(request.GET["disciplina"])
        periodo = _inteiro_ou_none(request.GET.get("periodo", "30"))
    except (KeyError, ValueError):
        return JsonResponse({"erro": "Parâmetros inválidos."}, status=400)
    if periodo is not None and periodo not in PERIODOS_VALIDOS:
        return JsonResponse({"erro": "Período inválido."}, status=400)
    return JsonResponse(services.lancamentos_disciplina(disciplina, periodo))