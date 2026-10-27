"""Edição de disciplinas, tópicos e itens do cronograma (excluir em massa, mover).
Sem HTTP aqui: recebe dados simples e levanta ValueError com mensagem amigável."""
import re
from datetime import date

from django.db import transaction
from django.db.models import Count, Max, Prefetch

from .models import ItemCronograma, Lancamento, Subtopico, Topico
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

def listar_disciplinas(concurso):
    dados = {"concurso": concurso.nome if concurso else "", "disciplinas": []}
    if concurso is None:
        return dados

    # Subtópicos numa consulta separada, agrupados por tópico
    subs = {}
    for s in Subtopico.objects.filter(topico__disciplina__concurso=concurso).order_by("ordem", "id"):
        subs.setdefault(s.topico_id, []).append({"id": s.id, "nome": s.nome})

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
            "topicos": [
                {"id": t.id, "nome": t.nome, "n_lancamentos": t.n_lanc, "subtopicos": subs.get(t.id, [])}
                for t in topicos
            ],
        })
    return dados


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



# ---------- subtópicos ----------

def salvar_subtopico(concurso, c):
    """Renomeia (com 'id') ou cria um ou vários (com 'topico_id' e 'nomes', um por linha)."""
    if c.get("id"):
        pk = _inteiro(c["id"], "Subtópico", 1, 10**9)
        sub = Subtopico.objects.filter(pk=pk, topico__disciplina__concurso=concurso).first()
        if sub is None:
            raise ValueError("Subtópico não encontrado.")
        nome = re.sub(r"\s+", " ", str(c.get("nome") or "")).strip()
        if not nome:
            raise ValueError("Informe o nome do subtópico.")
        if len(nome) > 200:
            raise ValueError("Nome muito longo (máximo de 200 caracteres).")
        for x in Subtopico.objects.filter(topico_id=sub.topico_id).exclude(pk=sub.pk):
            if norm(x.nome) == norm(nome):
                raise ValueError("Já existe um subtópico com esse nome neste tópico.")
        sub.nome = nome
        sub.save(update_fields=["nome"])
        return {"criados": 0, "repetidos": 0}

    pk = _inteiro(c.get("topico_id"), "Tópico", 1, 10**9)
    topico = Topico.objects.filter(pk=pk, disciplina__concurso=concurso).first()
    if topico is None:
        raise ValueError("Tópico não encontrado.")

    bruto = c.get("nomes")
    if bruto is None:
        bruto = [c.get("nome")]
    elif isinstance(bruto, str):
        bruto = bruto.splitlines()
    if not isinstance(bruto, list):
        raise ValueError("Subtópicos inválidos.")
    nomes = [re.sub(r"\s+", " ", str(x or "")).strip() for x in bruto]
    nomes = [n for n in nomes if n]
    if not nomes:
        raise ValueError("Informe o nome do subtópico.")
    if len(nomes) > 200:
        raise ValueError("Máximo de 200 subtópicos por vez.")
    if any(len(n) > 200 for n in nomes):
        raise ValueError("Há nome com mais de 200 caracteres.")

    atuais = list(Subtopico.objects.filter(topico=topico))
    existentes = {norm(s.nome) for s in atuais}
    ordem = max((s.ordem for s in atuais), default=-1)
    novos, repetidos = [], 0
    for n in nomes:
        k = norm(n)
        if k in existentes:
            repetidos += 1
            continue
        existentes.add(k)
        ordem += 1
        novos.append(Subtopico(topico=topico, nome=n, ordem=ordem))
    if not novos:
        raise ValueError("Esses subtópicos já existem neste tópico.")
    Subtopico.objects.bulk_create(novos)
    return {"criados": len(novos), "repetidos": repetidos}


def excluir_subtopico(concurso, pk):
    sub = Subtopico.objects.filter(pk=pk, topico__disciplina__concurso=concurso).first()
    if sub is None:
        raise ValueError("Subtópico não encontrado.")
    sub.delete()
    return {}