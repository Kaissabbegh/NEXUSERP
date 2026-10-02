from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from . import engine
from .library import SCENARIOS
from .models import ScenarioRun


def _scenario(key):
    if key not in SCENARIOS:
        raise NotFound("Unknown scenario.")
    return SCENARIOS[key]


@api_view(["GET"])
def scenario_list(request):
    return Response([s.meta() for s in SCENARIOS.values()])


@api_view(["POST"])
def start(request, key):
    scenario = _scenario(key)
    run = ScenarioRun.objects.create(key=key)
    return Response({"run": run.id, "scenario": scenario.meta(), "balances": engine.balances()}, status=201)


@api_view(["POST"])
def next_step(request, run_id):
    run = get_object_or_404(ScenarioRun, pk=run_id)
    try:
        return Response(engine.run_next(run, _scenario(run.key)))
    except ValueError as exc:
        raise ValidationError(str(exc))
