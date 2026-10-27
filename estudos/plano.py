"""Plano de estudos: importação do JSON da IA, edição de itens e dados do Cronograma.
Sem HTTP aqui: as funções recebem e devolvem dados simples (fáceis de testar e de trocar)."""
import json
import re
import unicodedata
from datetime import date
from difflib import get_close_matches

from django.db import transaction
from django.db.models import Max, Prefetch
from django.utils import timezone

from .models import Configuracao, Disciplina, ItemCronograma, Lancamento, Topico

TIPOS = ("teoria", "questoes", "revisao", "simulado")
TIPO_NOME = {"teoria": "Teoria", "questoes": "Questões", "revisao": "Revisão", "simulado": "Simulado"}
MAX_ITENS = 2000
MAX_CARACTERES = 800_000
PALETA = [
    "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#f97316", "#ef4444",
    "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e", "#64748b", "#d946ef",
]


# ---------- utilidades ----------

def norm(texto):
    """Normaliza para comparar nomes: sem acento, sem maiúscula, espaços únicos."""
    s = unicodedata.normalize("NFD", str(texto or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().casefold()


def _inteiro(valor, nome, minimo, maximo):
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{nome} inválido.")
    if not minimo <= n <= maximo:
        raise ValueError(f"{nome} deve estar entre {minimo} e {maximo}.")
    return n


def _peso(valor):
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 3 else None


def _dica(chave, opcoes):
    """Sugere o nome mais parecido ('opcoes' é {nome normalizado: nome original})."""
    perto = get_close_matches(chave, list(opcoes), n=1, cutoff=0.7)
    return f' Você quis dizer "{opcoes[perto[0]]}"?' if perto else ""


def _sigla(nome, usadas):
    palavras = [p for p in re.split(r"[^a-z0-9]+", norm(nome)) if len(p) > 2]
    base = ("".join(p[0] for p in palavras) or "D").upper()[:4]
    sigla, n = base, 1
    while sigla in usadas:
        n += 1
        sigla = f"{base}{n}"
    return sigla[:6]


def _cor(usadas):
    for c in PALETA:
        if c not in usadas:
            return c
    return PALETA[len(usadas) % len(PALETA)]


# ---------- leitura dos dados do Cronograma ----------

def serializar_item(i):
    return {
        "id": i.id,
        "data": i.data.isoformat(),
        "tipo": i.tipo,
        "disciplina_id": i.disciplina_id,
        "disciplina": i.disciplina.nome if i.disciplina_id else "",
        "cor": i.disciplina.cor if i.disciplina_id else "",
        "topico_id": i.topico_id,
        "topico": i.topico.nome if i.topico_id else "",
        "minutos": i.minutos,
        "questoes": i.questoes,
        "obs": i.obs,
        "concluido": i.concluido,
    }


def dados_cronograma(concurso):
    cfg = Configuracao.obter()
    dados = {
        "hoje": timezone.localdate().isoformat(),
        "prova": concurso.data_prova.isoformat() if concurso and concurso.data_prova else None,
        "minutos": cfg.minutos_por_dia,
        "dias_ativos": cfg.dias_ativos,
        "disciplinas": [],
        "itens": [],
        "historico": {},
    }
    if concurso is None:
        return dados

    qs = concurso.disciplinas.prefetch_related(
        Prefetch("topicos", queryset=Topico.objects.select_related("progresso"))
    )
    for d in qs:
        topicos = list(d.topicos.all())
        pendentes = []
        for t in topicos:
            p = getattr(t, "progresso", None)
            if not (p and p.teoria_concluida_em):
                pendentes.append(t.nome)
        dados["disciplinas"].append({
            "id": d.id, "sigla": d.sigla, "nome": d.nome, "cor": d.cor, "peso": d.peso,
            "topicos": [{"id": t.id, "nome": t.nome} for t in topicos],
            "pendentes": pendentes,
        })

    for i in concurso.itens_cronograma.select_related("disciplina", "topico"):
        dados["itens"].append(serializar_item(i))

    lancs = Lancamento.objects.filter(topico__disciplina__concurso=concurso).select_related("topico__disciplina")
    for l in lancs:
        dados["historico"].setdefault(l.data.isoformat(), []).append({
            "sigla": l.topico.disciplina.sigla,
            "disciplina": l.topico.disciplina.nome,
            "cor": l.topico.disciplina.cor,
            "topico": l.topico.nome,
            "total": l.total,
            "acertos": l.acertos,
        })
    return dados


# ---------- edição manual de um item ----------

def salvar_item(concurso, c):
    """Cria ou atualiza um item (c é o dict recebido). Levanta ValueError com mensagem amigável."""
    try:
        data = date.fromisoformat(str(c.get("data")))
    except ValueError:
        raise ValueError("Data inválida.")
    tipo = c.get("tipo")
    if tipo not in TIPOS:
        raise ValueError("Tipo inválido.")

    topico = disciplina = None
    if c.get("topico_id"):
        pk = _inteiro(c["topico_id"], "Tópico", 1, 10**9)
        topico = Topico.objects.filter(pk=pk, disciplina__concurso=concurso).select_related("disciplina").first()
        if topico is None:
            raise ValueError("Tópico não encontrado neste concurso.")
        disciplina = topico.disciplina
    elif c.get("disciplina_id"):
        pk = _inteiro(c["disciplina_id"], "Disciplina", 1, 10**9)
        disciplina = Disciplina.objects.filter(pk=pk, concurso=concurso).first()
        if disciplina is None:
            raise ValueError("Disciplina não encontrada neste concurso.")

    if tipo == "teoria" and topico is None:
        raise ValueError("Para teoria, escolha a disciplina e o tópico.")
    if tipo in ("questoes", "revisao") and disciplina is None:
        raise ValueError("Escolha ao menos a disciplina.")

    minutos = _inteiro(c.get("minutos") or 0, "Minutos", 0, 600)
    q = c.get("questoes")
    questoes = None if (tipo == "teoria" or q in (None, "")) else _inteiro(q, "Nº de questões", 0, 500)
    obs = str(c.get("obs") or "").strip()[:300]

    if c.get("id"):
        pk = _inteiro(c["id"], "Item", 1, 10**9)
        item = ItemCronograma.objects.filter(pk=pk, concurso=concurso).first()
        if item is None:
            raise ValueError("Item não encontrado.")
        mudou_data = item.data != data
    else:
        item = ItemCronograma(concurso=concurso)
        mudou_data = True

    item.data, item.tipo = data, tipo
    item.disciplina, item.topico = disciplina, topico
    item.minutos, item.questoes, item.obs = minutos, questoes, obs
    if mudou_data:
        mx = ItemCronograma.objects.filter(concurso=concurso, data=data).aggregate(m=Max("ordem"))["m"]
        item.ordem = 0 if mx is None else mx + 1
    item.save()
    return item


# ---------- importação do JSON da IA ----------

def _ler_json(texto):
    t = (texto or "").strip()
    if not t:
        return None, "Cole o JSON no campo de texto."
    if len(t) > MAX_CARACTERES:
        return None, "Texto grande demais."
    if t.startswith("```"):  # a IA às vezes envolve o JSON em ```json ... ```
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```\s*$", "", t)
    try:
        return json.loads(t), None
    except json.JSONDecodeError as e:
        ini, fim = t.find("{"), t.rfind("}")
        if ini != -1 and fim > ini:
            try:
                return json.loads(t[ini:fim + 1]), None
            except json.JSONDecodeError:
                pass
        return None, f"JSON inválido (linha {e.lineno}, coluna {e.colno}): {e.msg}."


def _validar(texto, concurso, res):
    """Valida o JSON sem gravar nada. Preenche res['ignorados'] e res['avisos'].
    Retorna (dados, erro_fatal)."""
    obj, erro = _ler_json(texto)
    if erro:
        return None, erro
    if not isinstance(obj, dict) or not ("edital" in obj or "cronograma" in obj):
        return None, 'O JSON precisa ser um objeto com a chave "edital" e/ou "cronograma".'
    edital = obj.get("edital") or []
    cron = obj.get("cronograma") or []
    if not isinstance(edital, list) or not isinstance(cron, list):
        return None, '"edital" e "cronograma" precisam ser listas.'
    if len(cron) > MAX_ITENS or len(edital) > 300:
        return None, f"Arquivo grande demais (máximo de {MAX_ITENS} itens no cronograma)."

    hoje = timezone.localdate()
    cfg = Configuracao.obter()
    ign, avisos = res["ignorados"], res["avisos"]

    # Catálogo = o que já existe no banco + o que o JSON declara em "edital"
    cat = {}
    for d in concurso.disciplinas.prefetch_related("topicos"):
        chave = norm(d.nome)
        cat[chave] = {
            "chave": chave, "nome": d.nome, "obj": d, "peso": d.peso, "peso_novo": None,
            "topicos": {norm(t.nome): t.nome for t in d.topicos.all()}, "novos": [],
        }

    for i, d in enumerate(edital, 1):
        onde = f"edital #{i}"
        if not isinstance(d, dict) or not str(d.get("disciplina") or "").strip():
            ign.append({"onde": onde, "motivo": "disciplina sem nome."})
            continue
        nome = str(d["disciplina"]).strip()[:120]
        chave = norm(nome)
        bruto = d.get("peso")
        peso = _peso(bruto)
        if bruto not in (None, "") and peso is None:
            avisos.append(f'Peso inválido em "{nome}" (use 1 a 3).')
        ent = cat.get(chave)
        if ent is None:
            ent = cat[chave] = {
                "chave": chave, "nome": nome, "obj": None, "peso": peso, "peso_novo": None,
                "topicos": {}, "novos": [],
            }
        elif peso and ent["obj"] is not None and peso != ent["peso"]:
            ent["peso_novo"] = peso
        topicos = d.get("topicos") or []
        if not isinstance(topicos, list):
            ign.append({"onde": onde, "motivo": '"topicos" precisa ser uma lista.'})
            continue
        for t in topicos:
            nome_t = str(t or "").strip()[:200]
            if not nome_t:
                continue
            tk = norm(nome_t)
            if tk not in ent["topicos"]:
                ent["topicos"][tk] = nome_t
                ent["novos"].append(nome_t)

    # Itens do cronograma
    itens, vistos, por_dia = [], set(), {}
    n_dup = passadas = apos_prova = fora_dia = 0
    prova = concurso.data_prova
    for i, it in enumerate(cron, 1):
        onde = f"cronograma #{i}"
        if not isinstance(it, dict):
            ign.append({"onde": onde, "motivo": "o item não é um objeto."})
            continue

        bruto_data = it.get("data")
        try:
            data = date.fromisoformat(str(bruto_data))
        except ValueError:
            ign.append({"onde": onde, "motivo": f'data inválida ("{bruto_data}"). Use AAAA-MM-DD.'})
            continue

        bruto_tipo = it.get("tipo")
        tipo = norm(bruto_tipo)
        if tipo not in TIPOS:
            ign.append({"onde": onde, "motivo": f'tipo inválido ("{bruto_tipo}"). Use teoria, questoes, revisao ou simulado.'})
            continue

        try:
            minutos = int(it.get("minutos") or 0)
        except (TypeError, ValueError):
            ign.append({"onde": onde, "motivo": "minutos inválido."})
            continue
        if not 0 <= minutos <= 600:
            ign.append({"onde": onde, "motivo": "minutos fora do intervalo de 0 a 600."})
            continue

        q = it.get("questoes")
        try:
            questoes = None if q in (None, "") else int(q)
        except (TypeError, ValueError):
            ign.append({"onde": onde, "motivo": "questoes inválido."})
            continue
        if questoes is not None and not 0 <= questoes <= 500:
            ign.append({"onde": onde, "motivo": "questoes fora do intervalo de 0 a 500."})
            continue
        if tipo == "teoria":
            questoes = None

        dnome = str(it.get("disciplina") or "").strip()
        tnome = str(it.get("topico") or "").strip()
        ent, tk = None, None
        if dnome:
            ent = cat.get(norm(dnome))
            if ent is None:
                opcoes = {k: e["nome"] for k, e in cat.items()}
                ign.append({"onde": onde, "motivo": f'disciplina "{dnome}" não encontrada.' + _dica(norm(dnome), opcoes)})
                continue
        if tnome:
            tk = norm(tnome)
            if ent is not None:
                if tk not in ent["topicos"]:
                    nome_ent = ent["nome"]
                    ign.append({"onde": onde, "motivo": f'tópico "{tnome}" não encontrado em {nome_ent}.' + _dica(tk, ent["topicos"])})
                    continue
            else:
                achados = [e for e in cat.values() if tk in e["topicos"]]
                if len(achados) != 1:
                    if achados:
                        motivo = f'tópico "{tnome}" existe em mais de uma disciplina; informe a disciplina.'
                    else:
                        motivo = f'tópico "{tnome}" não encontrado.'
                    ign.append({"onde": onde, "motivo": motivo})
                    continue
                ent = achados[0]
        if tipo == "teoria" and not tk:
            ign.append({"onde": onde, "motivo": "teoria exige disciplina e tópico."})
            continue
        if tipo in ("questoes", "revisao") and ent is None:
            ign.append({"onde": onde, "motivo": "informe ao menos a disciplina."})
            continue

        chave_item = (data, tipo, ent["chave"] if ent else None, tk)
        if chave_item in vistos:
            n_dup += 1
            continue
        vistos.add(chave_item)

        itens.append({
            "data": data, "tipo": tipo,
            "disc": ent["chave"] if ent else None, "top": tk,
            "minutos": minutos, "questoes": questoes,
            "obs": str(it.get("obs") or "").strip()[:300],
            "disc_nome": ent["nome"] if ent else "",
            "top_nome": ent["topicos"][tk] if (ent and tk) else "",
        })
        por_dia[data] = por_dia.get(data, 0) + minutos
        if data < hoje:
            passadas += 1
        if prova and data > prova:
            apos_prova += 1
        if data.weekday() not in cfg.dias_ativos:
            fora_dia += 1

    if passadas:
        avisos.append(f"{passadas} item(ns) com data anterior a hoje.")
    if apos_prova:
        avisos.append(f"{apos_prova} item(ns) depois da data da prova ({prova:%d/%m/%Y}).")
    if fora_dia:
        avisos.append(f"{fora_dia} item(ns) em dias que não são de estudo nos Ajustes (ex.: domingo).")
    limite = round(cfg.minutos_por_dia * 1.25)
    cheios = sorted(d for d, m in por_dia.items() if m > limite)
    if cheios:
        exemplos = ", ".join(d.strftime("%d/%m") for d in cheios[:4])
        avisos.append(f"{len(cheios)} dia(s) com mais de {limite} min planejados (ex.: {exemplos}).")
    if n_dup:
        avisos.append(f"{n_dup} item(ns) repetido(s) no próprio JSON foram descartados.")

    return {"cat": cat, "itens": itens}, None


def _gravar(concurso, dados, substituir):
    """Aplica a importação. Chamada dentro de uma transação."""
    cont = {
        "disciplinas_criadas": 0, "topicos_criados": 0, "pesos_alterados": 0,
        "itens_removidos": 0, "itens_criados": 0, "itens_duplicados": 0,
    }
    cat, itens = dados["cat"], dados["itens"]

    siglas = list(concurso.disciplinas.values_list("sigla", flat=True))
    cores = list(concurso.disciplinas.values_list("cor", flat=True))
    ordem = concurso.disciplinas.aggregate(m=Max("ordem"))["m"]
    ordem = -1 if ordem is None else ordem

    for ent in cat.values():
        d = ent["obj"]
        if d is None:
            ordem += 1
            sigla = _sigla(ent["nome"], siglas)
            cor = _cor(cores)
            siglas.append(sigla)
            cores.append(cor)
            d = Disciplina.objects.create(
                concurso=concurso, nome=ent["nome"], sigla=sigla, peso=ent["peso"], cor=cor, ordem=ordem
            )
            ent["obj"] = d
            cont["disciplinas_criadas"] += 1
        elif ent["peso_novo"]:
            d.peso = ent["peso_novo"]
            d.save(update_fields=["peso"])
            cont["pesos_alterados"] += 1
        if ent["novos"]:
            mx = d.topicos.aggregate(m=Max("ordem"))["m"]
            mx = -1 if mx is None else mx
            Topico.objects.bulk_create(
                [Topico(disciplina=d, nome=n, ordem=mx + 1 + k) for k, n in enumerate(ent["novos"])]
            )
            cont["topicos_criados"] += len(ent["novos"])

    if not itens:
        return cont

    datas = [i["data"] for i in itens]
    ini, fim = min(datas), max(datas)
    if substituir:
        cont["itens_removidos"] = ItemCronograma.objects.filter(
            concurso=concurso, concluido=False, data__range=(ini, fim)
        ).delete()[0]

    topicos = {(t.disciplina_id, norm(t.nome)): t for t in Topico.objects.filter(disciplina__concurso=concurso)}
    no_periodo = ItemCronograma.objects.filter(concurso=concurso, data__range=(ini, fim))
    existentes = set(no_periodo.values_list("data", "tipo", "disciplina_id", "topico_id"))
    base = dict(no_periodo.order_by().values("data").annotate(m=Max("ordem")).values_list("data", "m"))

    novos = []
    for it in itens:
        disc = cat[it["disc"]]["obj"] if it["disc"] else None
        top = topicos.get((disc.id, it["top"])) if (disc and it["top"]) else None
        chave = (it["data"], it["tipo"], disc.id if disc else None, top.id if top else None)
        if chave in existentes:
            cont["itens_duplicados"] += 1
            continue
        existentes.add(chave)
        ordem_dia = base.get(it["data"], -1) + 1
        base[it["data"]] = ordem_dia
        novos.append(ItemCronograma(
            concurso=concurso, data=it["data"], tipo=it["tipo"], disciplina=disc, topico=top,
            minutos=it["minutos"], questoes=it["questoes"], obs=it["obs"], ordem=ordem_dia,
        ))
    ItemCronograma.objects.bulk_create(novos)
    cont["itens_criados"] = len(novos)
    return cont


def importar(texto, concurso, substituir=True, aplicar=False):
    """Prévia (aplicar=False) ou importação (aplicar=True).
    A prévia roda a gravação de verdade dentro de uma transação e a desfaz,
    então os números da prévia são exatamente os da importação."""
    res = {
        "ok": False, "pode_aplicar": False, "aplicado": False, "erro": None,
        "resumo": {}, "avisos": [], "ignorados": [], "amostra": [],
    }
    dados, erro = _validar(texto, concurso, res)
    if erro:
        res["erro"] = erro
        return res

    with transaction.atomic():
        cont = _gravar(concurso, dados, substituir)
        if not aplicar:
            transaction.set_rollback(True)

    itens = dados["itens"]
    resumo = dict(cont, itens_validos=len(itens), ignorados=len(res["ignorados"]), periodo="", primeira="")
    if itens:
        ini = min(i["data"] for i in itens)
        fim = max(i["data"] for i in itens)
        resumo["periodo"] = f"{ini:%d/%m/%Y} a {fim:%d/%m/%Y}"
        resumo["primeira"] = ini.isoformat()
    res["resumo"] = resumo
    res["amostra"] = [
        {
            "data": f"{i['data']:%d/%m/%Y}", "tipo": TIPO_NOME[i["tipo"]],
            "disciplina": i["disc_nome"], "topico": i["top_nome"], "minutos": i["minutos"],
        }
        for i in itens[:6]
    ]
    res["ok"] = True
    res["aplicado"] = aplicar
    res["pode_aplicar"] = (not aplicar) and any(
        cont[k] for k in ("itens_criados", "topicos_criados", "disciplinas_criadas", "pesos_alterados", "itens_removidos")
    )
    return res