from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q


def dias_padrao():
    """Segunda a sábado. Convenção: 0 = segunda ... 6 = domingo (date.weekday())."""
    return [0, 1, 2, 3, 4, 5]


class Concurso(models.Model):
    nome = models.CharField(max_length=120)
    data_prova = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["nome"]

    def __str__(self):
        return self.nome


class Disciplina(models.Model):
    concurso = models.ForeignKey(Concurso, on_delete=models.CASCADE, related_name="disciplinas")
    nome = models.CharField(max_length=120)
    sigla = models.CharField(max_length=6)
    peso = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(3)]
    )
    cor = models.CharField(max_length=7, default="#6366f1", help_text="Hexadecimal, ex.: #6366f1")
    ordem = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordem", "nome"]
        constraints = [
            models.UniqueConstraint(fields=["concurso", "sigla"], name="uniq_sigla_por_concurso"),
        ]

    def __str__(self):
        return f"{self.nome} ({self.concurso})"


class Topico(models.Model):
    disciplina = models.ForeignKey(Disciplina, on_delete=models.CASCADE, related_name="topicos")
    nome = models.CharField(max_length=200)
    ordem = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["disciplina__ordem", "ordem", "id"]
        constraints = [
            models.UniqueConstraint(fields=["disciplina", "nome"], name="uniq_topico_por_disciplina"),
        ]

    def __str__(self):
        return self.nome


class ProgressoTopico(models.Model):
    """Estado do edital verticalizado para um tópico."""
    topico = models.OneToOneField(Topico, on_delete=models.CASCADE, related_name="progresso")
    teoria_concluida_em = models.DateField(null=True, blank=True)
    questoes_feitas = models.BooleanField(default=False)

    @property
    def teoria_concluida(self):
        return self.teoria_concluida_em is not None

    def __str__(self):
        return f"Progresso: {self.topico}"


class RevisaoFeita(models.Model):
    """Cada revisão realizada (ciclo de 4: 1, 7, 15 e 30 dias após a teoria)."""
    topico = models.ForeignKey(Topico, on_delete=models.CASCADE, related_name="revisoes")
    data = models.DateField()

    class Meta:
        ordering = ["data"]


class Lancamento(models.Model):
    """Resultado de uma sessão de questões resolvidas no QConcursos."""
    topico = models.ForeignKey(Topico, on_delete=models.PROTECT, related_name="lancamentos")
    data = models.DateField()
    total = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    acertos = models.PositiveSmallIntegerField()
    minutos = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["-data", "-id"]
        constraints = [
            models.CheckConstraint(condition=Q(acertos__lte=F("total")), name="acertos_lte_total"),
        ]

    @property
    def percentual(self):
        return round(self.acertos / self.total * 100)

    def __str__(self):
        return f"{self.data} · {self.topico} · {self.acertos}/{self.total}"


class BlocoConcluido(models.Model):
    """Blocos do plano provisório do dia marcados como concluídos."""

    class Tipo(models.TextChoices):
        TEORIA = "teoria", "Teoria"
        QUESTOES = "questoes", "Questões"
        REVISAO = "revisao", "Revisão"

    data = models.DateField()
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    topico = models.ForeignKey(Topico, on_delete=models.CASCADE, related_name="blocos")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["data", "tipo", "topico"], name="uniq_bloco_dia"),
        ]


class ItemCronograma(models.Model):
    """Item do plano de estudos: cadastrado à mão ou importado do JSON da IA."""

    class Tipo(models.TextChoices):
        TEORIA = "teoria", "Teoria"
        QUESTOES = "questoes", "Questões"
        REVISAO = "revisao", "Revisão"
        SIMULADO = "simulado", "Simulado"

    concurso = models.ForeignKey(Concurso, on_delete=models.CASCADE, related_name="itens_cronograma")
    data = models.DateField()
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    disciplina = models.ForeignKey(
        Disciplina, null=True, blank=True, on_delete=models.CASCADE, related_name="itens_cronograma"
    )
    topico = models.ForeignKey(
        Topico, null=True, blank=True, on_delete=models.CASCADE, related_name="itens_cronograma"
    )
    minutos = models.PositiveSmallIntegerField(default=0)
    questoes = models.PositiveSmallIntegerField(null=True, blank=True)
    obs = models.CharField(max_length=300, blank=True)
    concluido = models.BooleanField(default=False)
    ordem = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["data", "ordem", "id"]
        indexes = [models.Index(fields=["concurso", "data"])]

    def save(self, *args, **kwargs):
        if self.topico_id:  # a disciplina sempre acompanha o tópico
            self.disciplina_id = self.topico.disciplina_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.data} · {self.tipo} · {self.topico or self.disciplina or '-'}"


class Configuracao(models.Model):
    """Registro único com as preferências de rotina."""
    minutos_por_dia = models.PositiveSmallIntegerField(
        default=105, validators=[MinValueValidator(30), MaxValueValidator(600)]
    )
    dias_ativos = models.JSONField(default=dias_padrao, help_text="0=seg ... 6=dom")
    concurso_ativo = models.ForeignKey(
        Concurso, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    @classmethod
    def obter(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Configuração"