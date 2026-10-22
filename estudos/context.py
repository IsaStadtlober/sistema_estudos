from datetime import timedelta

from django.utils import timezone

from .models import Concurso, Configuracao, ItemCronograma, Lancamento

NAV_ITENS = [
    {"url": "dashboard", "label": "Dashboard", "icone": "fa-chart-pie"},
    {"url": "hoje", "label": "Hoje", "icone": "fa-calendar-day"},
    {"url": "cronograma", "label": "Cronograma", "icone": "fa-calendar-alt"},
    {"url": "disciplinas", "label": "Disciplinas", "icone": "fa-book"},
    {"url": "edital", "label": "Edital Verticalizado", "icone": "fa-list-check"},
    {"url": "lancar", "label": "Lançar Resultado", "icone": "fa-plus-circle"},
    {"url": "ajustes", "label": "Ajustes", "icone": "fa-sliders"},
]

def obter_concurso_ativo():
    cfg = Configuracao.obter()
    return cfg.concurso_ativo or Concurso.objects.first()


def calcular_ofensiva(concurso, dias_ativos):
    """Dias seguidos com lançamento. Dias de folga não quebram a sequência."""
    if concurso is None:
        return 0
    datas = set(
        Lancamento.objects.filter(topico__disciplina__concurso=concurso)
        .values_list("data", flat=True)
    )
    dia = timezone.localdate()
    if dia not in datas:  # hoje ainda não estudado não zera a sequência
        dia -= timedelta(days=1)
    total = 0
    for _ in range(400):
        if dia in datas:
            total += 1
        elif dia.weekday() in dias_ativos:
            break
        dia -= timedelta(days=1)
    return total


def sidebar(request):
    """Dados que a sidebar precisa em todas as páginas."""
    if request.path.startswith("/admin"):
        return {}
    cfg = Configuracao.obter()
    ativo = cfg.concurso_ativo or Concurso.objects.first()
    dias_prova = None
    pendentes = None
    if ativo:
        if ativo.data_prova:
            dias_prova = (ativo.data_prova - timezone.localdate()).days
        itens_hoje = ItemCronograma.objects.filter(concurso=ativo, data=timezone.localdate())
        if itens_hoje.exists():
            pendentes = itens_hoje.filter(concluido=False).count()
    return {
        "nav_itens": NAV_ITENS,
        "concursos": Concurso.objects.all(),
        "concurso_ativo": ativo,
        "dias_prova": dias_prova,
        "ofensiva": calcular_ofensiva(ativo, cfg.dias_ativos),
        "hoje_pendentes": pendentes,
    }