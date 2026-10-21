from django.urls import path

from . import api, views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("hoje/", views.hoje, name="hoje"),
    path("cronograma/", views.cronograma, name="cronograma"),
    path("edital/", views.edital, name="edital"),
    path("lancar/", views.lancar, name="lancar"),
    path("ajustes/", views.ajustes, name="ajustes"),
    path("concurso/trocar/", views.trocar_concurso, name="trocar_concurso"),
    path("api/dashboard/", api.dashboard_api, name="api_dashboard"),
    path("api/dashboard/lancamentos/", api.lancamentos_api, name="api_dashboard_lancamentos"),
]