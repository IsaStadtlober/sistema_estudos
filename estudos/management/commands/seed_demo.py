import math
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from estudos.models import (
    Concurso, Configuracao, Disciplina, Lancamento,
    ProgressoTopico, RevisaoFeita, Topico,
)

# (sigla, nome, peso, cor, tópicos)
DISCIPLINAS = [
    ("LP", "Língua Portuguesa", 2, "#3b82f6", ["Compreensão de Texto", "Sintaxe e Pontuação", "Crase e Regência", "Coesão Textual", "Ortografia e Acentuação"]),
    ("RL", "Raciocínio Lógico", 1, "#06b6d4", ["Lógica Proposicional", "Tabelas Verdade", "Diagramas Lógicos", "Probabilidade e Análise Combinatória"]),
    ("DC", "Direito Constitucional", 1, "#10b981", ["Direitos e Garantias Fundamentais", "Organização do Estado", "Poder Executivo e Legislativo", "Controle de Constitucionalidade"]),
    ("DA", "Direito Administrativo", 2, "#84cc16", ["Atos Administrativos", "Licitações e Contratos (Lei 14.133)", "Agentes Públicos", "Improbidade Administrativa"]),
    ("CLE", "Controle Externo e Legislação TCE-RJ", 2, "#eab308", ["Regimento Interno do TCE-RJ", "Lei Orgânica do TCE-RJ", "Constituição Estadual do RJ", "Fiscalização Financeira e Orçamentária"]),
    ("CP", "Contabilidade Pública e AFO", 1, "#f97316", ["Princípios Orçamentários", "LDO, PPA e LOA", "Receita e Despesa Pública", "LRF - Lei de Responsabilidade Fiscal"]),
    ("ES", "Engenharia de Software", 2, "#ef4444", ["Metodologias Ágeis (Scrum / Kanban)", "Engenharia de Requisitos", "Testes de Software e TDD", "MPS.BR e CMMI", "DevOps e CI/CD"]),
    ("BD", "Banco de Dados", 3, "#6366f1", ["Modelagem Conceitual e Relacional (DER / EA)", "Linguagem SQL (DDL, DML, DCL)", "Transações, ACID e Concorrência", "SGBDs Relacionais (PostgreSQL / Oracle)", "NoSQL e Data Warehouses", "Indexação e Otimização de Queries"]),
    ("RC", "Redes de Computadores", 2, "#8b5cf6", ["Modelo OSI e Arquitetura TCP/IP", "Endereçamento IPv4 e IPv6", "Roteamento e Comutação (Switching)", "Protocolos de Aplicação (HTTP, DNS, SSH)", "Redes Sem Fio e SD-WAN"]),
    ("SI", "Segurança da Informação", 3, "#ec4899", ["Criptografia Assimétrica e Assinatura Digital", "ISO 27001 e ISO 27002", "Gestão de Incidentes e Backup", "Firewalls, IDS, IPS e SIEM", "LGPD e Gestão de Privacidade"]),
    ("GT", "Governança e Gestão de TI", 3, "#14b8a6", ["COBIT 2019", "ITIL v4", "PMBOK 7ª Edição", "Gestão de Riscos e Continuidade de Negócios"]),
    ("PA", "Programação e Arquitetura", 2, "#f43f5e", ["Java / Python Fundamentals", "Arquitetura de Microserviços e REST APIs", "Padrões de Projeto (GoF)", "Containers e Kubernetes"]),
    ("SO", "Sistemas Operacionais e Infraestrutura", 1, "#64748b", ["Linux Admin e Shell Scripting", "Gerenciamento de Memória e Processos", "Virtualização (Hypervisors)"]),
    ("CI", "Ciência de Dados e IA", 2, "#d946ef", ["Algoritmos de Machine Learning", "Tratamento e Limpeza de Dados (Pandas)", "IA Generativa e LLMs em Auditoria", "Visualização de Dados"]),
]

CICLO_REVISAO = [1, 7, 15, 30]  # dias após a teoria (cumulativo)


def arredonda(x):
    return int(x + 0.5)


class Command(BaseCommand):
    help = "Cria os dados fictícios de demonstração (equivalentes ao protótipo)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Apaga tudo e recria.")

    @transaction.atomic
    def handle(self, *args, **opts):
        if Concurso.objects.exists():
            if not opts["reset"]:
                raise CommandError("Já existem dados. Use --reset para apagar e recriar.")
            Lancamento.objects.all().delete()  # PROTECT: precisa sair antes
            Concurso.objects.all().delete()

        hoje = timezone.localdate()
        tce = Concurso.objects.create(nome="TCE-RJ - Auditor de TI", data_prova=date(2026, 11, 15))
        Concurso.objects.create(nome="TCU - Auditor Federal", data_prova=date(2027, 3, 20))

        # Disciplinas e tópicos
        discs, topicos = [], {}
        for ordem, (sigla, nome, peso, cor, tops) in enumerate(DISCIPLINAS):
            d = Disciplina.objects.create(concurso=tce, sigla=sigla, nome=nome, peso=peso, cor=cor, ordem=ordem)
            discs.append(d)
            topicos[sigla] = [
                Topico.objects.create(disciplina=d, nome=t, ordem=i) for i, t in enumerate(tops)
            ]

        # Edital: teoria concluída nas 8 primeiras disciplinas, com revisões parciais
        for s_idx, d in enumerate(discs):
            for t_idx, t in enumerate(topicos[d.sigla]):
                teoria = s_idx < 8 and (t_idx % 2 == 0 or t_idx == 1)
                data_teoria = hoje - timedelta(days=35 + s_idx + t_idx) if teoria else None
                ProgressoTopico.objects.create(
                    topico=t, teoria_concluida_em=data_teoria, questoes_feitas=(t_idx % 2 == 0)
                )
                if teoria:
                    n_rev = min(4, 1 + (t_idx % 3))
                    RevisaoFeita.objects.bulk_create(
                        RevisaoFeita(topico=t, data=data_teoria + timedelta(days=CICLO_REVISAO[k]))
                        for k in range(n_rev)
                    )

        # Lançamentos: 118 registros em ~58 dias
        logs = []
        for i in range(118):
            d = discs[i % len(discs)]
            tops = topicos[d.sigla]
            base = 0.72
            if d.sigla in ("BD", "SI", "GT"):
                base = 0.81
            if d.sigla in ("CLE", "CP", "DA"):
                base = 0.62
            total = 8 + (i % 12)
            variacao = ((math.sin(i) + 1) / 2) * 0.2 - 0.1
            taxa = min(0.95, max(0.4, base + variacao))
            acertos = min(total, max(2, arredonda(total * taxa)))
            logs.append(Lancamento(
                topico=tops[i % len(tops)],
                data=hoje - timedelta(days=int(i / 118 * 58)),
                total=total,
                acertos=acertos,
                minutos=arredonda(total * (2.2 + (i % 2) * 0.5)),
            ))
        Lancamento.objects.bulk_create(logs)

        cfg = Configuracao.obter()
        cfg.concurso_ativo = tce
        cfg.minutos_por_dia = 105
        cfg.save()

        self.stdout.write(self.style.SUCCESS(
            f"OK: {Disciplina.objects.count()} disciplinas, {Topico.objects.count()} tópicos, "
            f"{Lancamento.objects.count()} lançamentos."
        ))