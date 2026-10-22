"""Ajustes: concursos (cadastrar, editar, excluir) e rotina de estudo."""
import re
from datetime import date

from django.db import transaction
from django.db.models import Count

from .edicao import PrecisaConfirmar
from .models import Concurso, Configuracao, Lancamento
from .plano import _inteiro, norm


def listar_concursos():
    cfg = Configuracao.obter()
    ativo = cfg.concurso_ativo or Concurso.objects.first()
    qs = Concurso.objects.annotate(
        n_disc=Count("disciplinas", distinct=True),
        n_itens=Count("itens_cronograma", distinct=True),
        n_lanc=Count("disciplinas__topicos__lancamentos", distinct=True),
    )
    return [
        {
            "id": c.id, "nome": c.nome, "data_prova": c.data_prova,
            "iso": c.data_prova.isoformat() if c.data_prova else "",
            "ativo": bool(ativo and c.id == ativo.id),
            "n_disc": c.n_disc, "n_itens": c.n_itens, "n_lanc": c.n_lanc,
        }
        for c in qs
    ]


def salvar_concurso(c):
    """Cria ou edita. Retorna (concurso, criado)."""
    nome = re.sub(r"\s+", " ", str(c.get("nome") or "")).strip()
    if not nome:
        raise ValueError("Informe o nome do concurso.")
    if len(nome) > 120:
        raise ValueError("Nome muito longo (máximo de 120 caracteres).")

    bruto = str(c.get("data_prova") or "").strip()
    data = None
    if bruto:
        try:
            data = date.fromisoformat(bruto)
        except ValueError:
            raise ValueError("Data da prova inválida.")

    existente = None
    if c.get("id"):
        pk = _inteiro(c["id"], "Concurso", 1, 10**9)
        existente = Concurso.objects.filter(pk=pk).first()
        if existente is None:
            raise ValueError("Concurso não encontrado.")

    for outro in Concurso.objects.all():
        if (existente is None or outro.pk != existente.pk) and norm(outro.nome) == norm(nome):
            raise ValueError("Já existe um concurso com esse nome.")

    if existente is None:
        novo = Concurso.objects.create(nome=nome, data_prova=data)
        cfg = Configuracao.obter()
        cfg.concurso_ativo = novo
        cfg.save()
        return novo, True

    existente.nome, existente.data_prova = nome, data
    existente.save()
    return existente, False


@transaction.atomic
def excluir_concurso(pk, apagar_historico=False):
    c = Concurso.objects.filter(pk=pk).first()
    if c is None:
        raise ValueError("Concurso não encontrado.")

    lanc = Lancamento.objects.filter(topico__disciplina__concurso=c)
    n = lanc.count()
    if n and not apagar_historico:
        raise PrecisaConfirmar(f"Este concurso tem {n} lançamento(s) de questões.", n)
    lanc.delete()  # o lançamento protege o tópico, então sai primeiro
    c.delete()     # leva junto disciplinas, tópicos e cronograma

    cfg = Configuracao.obter()
    if cfg.concurso_ativo_id is None:  # o ativo foi excluído: assume outro, se existir
        cfg.concurso_ativo = Concurso.objects.first()
        cfg.save()
    return {"lancamentos_apagados": n}


def salvar_rotina(c):
    minutos = _inteiro(c.get("minutos"), "Minutos por dia", 30, 600)
    dias = c.get("dias")
    if not isinstance(dias, list):
        raise ValueError("Escolha ao menos um dia de estudo.")
    try:
        dias = sorted({int(d) for d in dias})
    except (TypeError, ValueError):
        raise ValueError("Dias inválidos.")
    if not dias or any(d < 0 or d > 6 for d in dias):
        raise ValueError("Escolha ao menos um dia de estudo.")
    cfg = Configuracao.obter()
    cfg.minutos_por_dia = minutos
    cfg.dias_ativos = dias
    cfg.save()
    return {}