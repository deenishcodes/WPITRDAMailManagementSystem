"""
Org structure models — Section 5 of the Phase 1 analysis:
"Department, Division, SubDivision — hierarchical, matching orgdepdiv"
and "Designation" for job titles.

Also home to TenantWorkflowConfig, the per-tenant setting that decides
whether this organisation uses the Sub-Branch tier in its correspondence
workflow (Section 10, Q2). It's deliberately a singleton — one row per
tenant schema — since a tenant has exactly one workflow configuration,
not many.
"""

from django.db import models


class Department(models.Model):
    name = models.CharField(max_length=200)
    short_code = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Division(models.Model):
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="divisions"
    )
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ["department__name", "name"]

    def __str__(self):
        return f"{self.department.name} / {self.name}"


class SubDivision(models.Model):
    division = models.ForeignKey(
        Division, on_delete=models.CASCADE, related_name="sub_divisions"
    )
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ["division__department__name", "division__name", "name"]
        verbose_name_plural = "Sub-divisions"

    def __str__(self):
        return f"{self.division} / {self.name}"


class Designation(models.Model):
    title = models.CharField(max_length=200)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class TenantWorkflowConfig(models.Model):
    sub_branch_tier_enabled = models.BooleanField(
        default=True,
        help_text=(
            "Whether this organisation's correspondence workflow includes "
            "the Sub-Branch tier (Head of Branch \u2192 Sub-Branch \u2192 Subject "
            "Officer) or skips straight from Head of Branch to Subject "
            "Officer. Safe to change at any time \u2014 in-flight letters keep "
            "following the rules that were active when they reached their "
            "current step (Section 10, Q2)."
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Workflow configuration"
        verbose_name_plural = "Workflow configuration"

    def __str__(self):
        return "Workflow configuration"

    def save(self, *args, **kwargs):
        # Enforce singleton: there is only ever one row, with pk=1.
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # The singleton is never deleted through the normal interface.
        pass

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
