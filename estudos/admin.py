from django.contrib import admin

from .models import (
    BlocoConcluido, Concurso, Configuracao, Disciplina, Lancamento,
    ProgressoTopico, RevisaoFeita, Topico,
)


@admin.register(Concurso)
class ConcursoAdmin(admin.ModelAdmin):
    list_display = ("nome", "data_prova")


@admin.register(Disciplina)
class DisciplinaAdmin(admin.ModelAdmin):
    list_display = ("nome", "concurso", "peso", "cor", "ordem")
    list_filter = ("concurso",)


@admin.register(Topico)
class TopicoAdmin(admin.ModelAdmin):
    list_display = ("nome", "disciplina", "ordem")
    list_filter = ("disciplina__concurso", "disciplina")
    search_fields = ("nome",)


@admin.register(ProgressoTopico)
class ProgressoAdmin(admin.ModelAdmin):
    list_display = ("topico", "teoria_concluida_em", "questoes_feitas")


@admin.register(Lancamento)
class LancamentoAdmin(admin.ModelAdmin):
    list_display = ("data", "topico", "total", "acertos", "minutos")
    list_filter = ("topico__disciplina",)
    date_hierarchy = "data"


admin.site.register([RevisaoFeita, BlocoConcluido, Configuracao])