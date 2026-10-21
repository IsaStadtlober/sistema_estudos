from django.urls import path

from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("hoje/", views.hoje, name="hoje"),
    path("cronograma/", views.cronograma, name="cronograma"),
    path("edital/", views.edital, name="edital"),
    path("lancar/", views.lancar, name="lancar"),
    path("ajustes/", views.ajustes, name="ajustes"),
    path("concurso/trocar/", views.trocar_concurso, name="trocar_concurso"),
]