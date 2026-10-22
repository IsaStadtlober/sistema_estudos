from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from estudos.models import (
    Concurso, Configuracao, ItemCronograma, Lancamento,
)


class Command(BaseCommand):
    help = "Apaga todos os dados de estudo (demonstração) e cria um concurso vazio."

    def add_arguments(self, parser):
        parser.add_argument("--nome", default="TCE-RJ - Auditor de TI", help="Nome do concurso novo.")
        parser.add_argument("--prova", default="2026-11-15", help="Data da prova (AAAA-MM-DD).")
        parser.add_argument("--sim", action="store_true", help="Não pedir confirmação.")

    @transaction.atomic
    def handle(self, *args, **opts):
        try:
            prova = date.fromisoformat(opts["prova"])
        except ValueError:
            raise CommandError("Data inválida. Use AAAA-MM-DD, por exemplo 2026-11-15.")

        resumo = (
            f"{Concurso.objects.count()} concurso(s), {Lancamento.objects.count()} lançamento(s) "
            f"e {ItemCronograma.objects.count()} item(ns) de cronograma"
        )
        self.stdout.write(f"Será apagado TUDO: {resumo}. O usuário do admin é mantido.")
        if not opts["sim"]:
            if input("Digite APAGAR para confirmar: ").strip() != "APAGAR":
                self.stdout.write("Cancelado. Nada foi alterado.")
                return

        Lancamento.objects.all().delete()  # o lançamento protege o tópico, então sai primeiro
        Concurso.objects.all().delete()    # leva junto disciplinas, tópicos, progresso e cronograma

        novo = Concurso.objects.create(nome=opts["nome"], data_prova=prova)
        cfg = Configuracao.obter()
        cfg.concurso_ativo = novo
        cfg.save()

        self.stdout.write(self.style.SUCCESS(f'Pronto. Concurso "{novo.nome}" criado e ativo, sem disciplinas.'))