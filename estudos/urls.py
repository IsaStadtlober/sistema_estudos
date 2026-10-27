from django.urls import path

from . import api, views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("hoje/", views.hoje, name="hoje"),
    path("cronograma/", views.cronograma, name="cronograma"),
    path("disciplinas/", views.disciplinas, name="disciplinas"),
    path("edital/", views.edital, name="edital"),
    path("lancar/", views.lancar, name="lancar"),
    path("ajustes/", views.ajustes, name="ajustes"),
    path("concurso/trocar/", views.trocar_concurso, name="trocar_concurso"),
    path("api/dashboard/", api.dashboard_api, name="api_dashboard"),
    path("api/dashboard/lancamentos/", api.lancamentos_api, name="api_dashboard_lancamentos"),
    path("api/cronograma/", api.cronograma_dados, name="api_cronograma"),
    path("api/cronograma/item/", api.item_salvar, name="api_item_salvar"),
    path("api/cronograma/item/<int:pk>/excluir/", api.item_excluir, name="api_item_excluir"),
    path("api/cronograma/item/<int:pk>/concluir/", api.item_concluir, name="api_item_concluir"),
    path("api/cronograma/item/<int:pk>/mover/", api.item_mover, name="api_item_mover"),
    path("api/cronograma/limpar/", api.cronograma_limpar, name="api_cronograma_limpar"),
    path("api/cronograma/importar/", api.importar, name="api_importar"),
    path("api/disciplinas/", api.disciplinas_dados, name="api_disciplinas"),
    path("api/disciplinas/salvar/", api.disciplina_salvar, name="api_disciplina_salvar"),
    path("api/disciplinas/<int:pk>/excluir/", api.disciplina_excluir, name="api_disciplina_excluir"),
    path("api/subtopicos/salvar/", api.subtopico_salvar, name="api_subtopico_salvar"),
    path("api/subtopicos/<int:pk>/excluir/", api.subtopico_excluir, name="api_subtopico_excluir"),
    path("api/topicos/salvar/", api.topico_salvar, name="api_topico_salvar"),
    path("api/topicos/<int:pk>/excluir/", api.topico_excluir, name="api_topico_excluir"),
    path("api/ajustes/concurso/", api.concurso_salvar, name="api_concurso_salvar"),
    path("api/ajustes/concurso/<int:pk>/excluir/", api.concurso_excluir, name="api_concurso_excluir"),
    path("api/ajustes/rotina/", api.rotina_salvar, name="api_rotina_salvar"),
]