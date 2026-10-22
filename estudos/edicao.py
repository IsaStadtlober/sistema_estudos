"""Edição de disciplinas, tópicos e itens do cronograma (excluir em massa, mover).
Sem HTTP aqui: recebe dados simples e levanta ValueError com mensagem amigável."""
import re
from datetime import date

from django.db import transaction
from django.db.models import Count, Max, Prefetch

from .models import ItemCronograma, Lancamento, Topico
from .plano import _cor, _inteiro, _sigla, norm


class PrecisaConfirmar(Exception):
    """A exclusão apagaria lançamentos de questões e exige confirmação explícita."""

    def __init__(self, mensagem, lancamentos):
        super().__init__(mensagem)
        self.lancamentos = lancamentos


# ---------- leitura ----------

def listar_disciplinas(concurso):
    dados = {"concurso": concurso.nome if concurso else "", "disciplinas": []}
    if concurso is None:
        return dados
    qs = (
        concurso.disciplinas
        .annotate(
            n_lanc=Count("topicos__lancamentos", distinct=True),
            n_itens=Count("itens_cronograma", distinct=True),
        )
        .prefetch_related(
            Prefetch("topicos", queryset=Topico.objects.annotate(n_lanc=Count("lancamentos")))
        )
    )
    for d in qs:
        topicos = list(d.topicos.all())
        dados["disciplinas"].append({
            "id": d.id, "nome": d.nome, "sigla": d.sigla, "peso": d.peso, "cor": d.cor,
            "n_topicos": len(topicos), "n_lancamentos": d.n_lanc, "n_itens": d.n_itens,
            "topicos": [{"id": t.id, "nome": t.nome, "n_lancamentos": t.n_lanc} for t in topicos],
        })
    return dados


# ---------- disciplinas ----------

def salvar_disciplina(concurso, c):
    nome = re.sub(r"\s+", " ", str(c.get("nome") or "")).strip()
    if not nome:
        raise ValueError("Informe o nome da disciplina.")
    if len(nome) > 120:
        raise ValueError("Nome muito longo (máximo de 120 caracteres).")

    try:
        peso = int(c.get("peso") or 1)
    except (TypeError, ValueError):
        raise ValueError("Peso inválido.")
    if not 1 <= peso <= 3:
        raise ValueError("O peso deve ser 1, 2 ou 3.")

    cor = str(c.get("cor") or "").strip()
    if cor and not re.fullmatch(r"#[0-9a-fA-F]{6}", cor):
        raise ValueError("Cor inválida.")

    todas = list(concurso.disciplinas.all())
    disc = None
    if c.get("id"):
        pk = _inteiro(c["id"], "Disciplina", 1, 10**9)
        disc = next((d for d in todas if d.pk == pk), None)
        if disc is None:
            raise ValueError("Disciplina não encontrada.")
    outras = [d for d in todas if disc is None or d.pk != disc.pk]

    if any(norm(d.nome) == norm(nome) for d in outras):
        raise ValueError("Já existe uma disciplina com esse nome neste concurso.")

    usadas = [d.sigla for d in outras]
    sigla = re.sub(r"[^A-Za-z0-9]", "", str(c.get("sigla") or "")).upper()[:6]
    if sigla:
        if sigla in usadas:
            raise ValueError(f'A sigla "{sigla}" já está em uso.')
    elif disc:
        sigla = disc.sigla
    else:
        sigla = _sigla(nome, usadas)

    if disc is None:
        mx = concurso.disciplinas.aggregate(m=Max("ordem"))["m"]
        from .models import Disciplina
        return Disciplina.objects.create(
            concurso=concurso, nome=nome, sigla=sigla, peso=peso,
            cor=cor or _cor([d.cor for d in todas]), ordem=0 if mx is None else mx + 1,
        )
    disc.nome, disc.sigla, disc.peso = nome, sigla, peso
    if cor:
        disc.cor = cor
    disc.save()
    return disc


@transaction.atomic
def excluir_disciplina(concurso, pk, apagar_historico=False):
    d = concurso.disciplinas.filter(pk=pk).first()
    if d is None:
        raise ValueError("Disciplina não encontrada.")
    lanc = Lancamento.objects.filter(topico__disciplina=d)
    n = lanc.count()
    if n and not apagar_historico:
        raise PrecisaConfirmar(f"Esta disciplina tem {n} lançamento(s) de questões.", n)
    if n:
        lanc.delete()  # Lancamento protege o tópico; o histórico sai antes, só com confirmação
    d.delete()
    return {"lancamentos_apagados": n}


# ---------- tópicos ----------

def salvar_topico(concurso, c):
    nome = re.sub(r"\s+", " ", str(c.get("nome") or "")).strip()
    if not nome:
        raise ValueError("Informe o nome do tópico.")
    if len(nome) > 200:
        raise ValueError("Nome muito longo (máximo de 200 caracteres).")

    topico = None
    if c.get("id"):
        pk = _inteiro(c["id"], "Tópico", 1, 10**9)
        topico = Topico.objects.filter(pk=pk, disciplina__concurso=concurso).select_related("disciplina").first()
        if topico is None:
            raise ValueError("Tópico não encontrado.")
        disc = topico.disciplina
    else:
        pk = _inteiro(c.get("disciplina_id"), "Disciplina", 1, 10**9)
        disc = concurso.disciplinas.filter(pk=pk).first()
        if disc is None:
            raise ValueError("Disciplina não encontrada.")

    for x in disc.topicos.all():
        if (topico is None or x.pk != topico.pk) and norm(x.nome) == norm(nome):
            raise ValueError("Já existe um tópico com esse nome nesta disciplina.")

    if topico is None:
        mx = disc.topicos.aggregate(m=Max("ordem"))["m"]
        return Topico.objects.create(disciplina=disc, nome=nome, ordem=0 if mx is None else mx + 1)
    topico.nome = nome
    topico.save(update_fields=["nome"])
    return topico


@transaction.atomic
def excluir_topico(concurso, pk, apagar_historico=False):
    t = Topico.objects.filter(pk=pk, disciplina__concurso=concurso).first()
    if t is None:
        raise ValueError("Tópico não encontrado.")
    lanc = t.lancamentos.all()
    n = lanc.count()
    if n and not apagar_historico:
        raise PrecisaConfirmar(f"Este tópico tem {n} lançamento(s) de questões.", n)
    if n:
        lanc.delete()
    t.delete()
    return {"lancamentos_apagados": n}


# ---------- itens do cronograma ----------

def mover_item(concurso, pk, data):
    try:
        nova = date.fromisoformat(str(data))
    except ValueError:
        raise ValueError("Data inválida.")
    item = ItemCronograma.objects.filter(pk=pk, concurso=concurso).first()
    if item is None:
        raise ValueError("Item não encontrado.")
    if item.data != nova:
        mx = ItemCronograma.objects.filter(concurso=concurso, data=nova).aggregate(m=Max("ordem"))["m"]
        item.data = nova
        item.ordem = 0 if mx is None else mx + 1
        item.save(update_fields=["data", "ordem"])
    return item


def excluir_itens(concurso, inicio, fim, incluir_concluidos=False, confirmar=False):
    """Conta (confirmar=False) ou apaga (confirmar=True) os itens entre duas datas."""
    try:
        ini = date.fromisoformat(str(inicio))
        fm = date.fromisoformat(str(fim))
    except ValueError:
        raise ValueError("Datas inválidas.")
    if fm < ini:
        raise ValueError("A data final não pode ser anterior à inicial.")
    if (fm - ini).days > 3700:
        raise ValueError("Período grande demais.")
    qs = ItemCronograma.objects.filter(concurso=concurso, data__range=(ini, fm))
    if not incluir_concluidos:
        qs = qs.filter(concluido=False)
    n = qs.count()
    if confirmar and n:
        qs.delete()
    return {"itens": n, "apagado": bool(confirmar and n)}